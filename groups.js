// groups.js - управление группами пользователя на странице профиля

// Импорт Firebase SDK
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// Функция инициализации модуля групп
export function initializeGroups() {
    const auth = getAuth();
    const db = getDatabase();
    
    // Проверяем авторизацию пользователя
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Получаем ID профиля из URL
            const urlParams = new URLSearchParams(window.location.search);
            const profileId = urlParams.get('id');
            
            if (profileId) {
                // Загружаем информацию о группах пользователя
                loadUserGroups(db, profileId);
                
                // Добавляем обработчик клика для перехода на страницу групп
                const groupsListBtn = document.getElementById('groupsListBtn');
                if (groupsListBtn) {
                    groupsListBtn.addEventListener('click', () => {
                        window.location.href = 'groups.html';
                    });
                }
            }
        }
    });
}

// Функция для загрузки групп пользователя
async function loadUserGroups(db, profileId) {
    try {
        // Получаем информацию о пользователе по его numericId
        const usersRef = ref(db, 'users');
        const usersSnapshot = await get(usersRef);
        let targetUserId = null;
        
        // Ищем пользователя с указанным numericId
        usersSnapshot.forEach((userSnapshot) => {
            const userData = userSnapshot.val();
            if (userData.numericId === parseInt(profileId)) {
                targetUserId = userSnapshot.key;
            }
        });
        
        if (!targetUserId) {
            console.error('Пользователь не найден');
            return;
        }
        
        // Получаем данные пользователя
        const userRef = ref(db, `users/${targetUserId}`);
        onValue(userRef, async (snapshot) => {
            const userData = snapshot.val();
            
            if (!userData) {
                console.error('Данные пользователя не найдены');
                return;
            }
            
            // Собираем группы из всех возможных полей
            // 1. groups - группы, в которых пользователь состоит
            const groups = userData.groups || {};
            const groupsIds = Object.keys(groups);
            
            // 2. joinedGroups - ещё одно поле для групп, в которых пользователь состоит
            const joinedGroups = userData.joinedGroups || {};
            const joinedGroupsIds = Object.keys(joinedGroups);
            
            // 3. createdGroups - группы, в которых пользователь администратор
            const createdGroups = userData.createdGroups || {};
            const createdGroupsIds = Object.keys(createdGroups);
            
            // Объединяем все списки групп и удаляем дубликаты
            const allGroupIds = [...new Set([
                ...groupsIds, 
                ...joinedGroupsIds, 
                ...createdGroupsIds
            ])];
            
            console.log(`Найдено групп в userData.groups: ${groupsIds.length}`);
            console.log(`Найдено групп в userData.joinedGroups: ${joinedGroupsIds.length}`);
            console.log(`Найдено групп в userData.createdGroups: ${createdGroupsIds.length}`);
            console.log(`Общее количество уникальных групп: ${allGroupIds.length}`);
            
            // Обновляем счетчик групп
            const groupsCount = document.querySelector('.groups-count');
            if (groupsCount) {
                groupsCount.textContent = allGroupIds.length;
            }
            
            // Если у пользователя нет групп, скрываем контейнер
            const groupsContainer = document.querySelector('.groups-preview-container');
            if (allGroupIds.length === 0) {
                if (groupsContainer) {
                    groupsContainer.style.display = 'none';
                }
                return;
            } else if (groupsContainer) {
                groupsContainer.style.display = 'block';
            }
            
            // Получаем данные о каждой группе
            const groupsData = await Promise.all(
                allGroupIds.map(async (groupId) => {
                    const groupRef = ref(db, `groups/${groupId}`);
                    const groupSnapshot = await get(groupRef);
                    if (groupSnapshot.exists()) {
                        const groupData = groupSnapshot.val();
                        return {
                            id: groupId,
                            ...groupData
                        };
                    }
                    return null;
                })
            );
            
            // Фильтруем null-значения (группы, которые не были найдены)
            const validGroups = groupsData.filter(group => group !== null);
            
            // Обновляем счетчик групп после фильтрации
            if (groupsCount) {
                groupsCount.textContent = validGroups.length;
            }
            
            console.log(`Найдено ${validGroups.length} групп для пользователя ${targetUserId}`);
            
            // Отображаем группы пользователя
            renderUserGroups(validGroups);
        });
    } catch (error) {
        console.error('Ошибка при загрузке групп пользователя:', error);
    }
}

// Функция для отображения групп пользователя
function renderUserGroups(groups) {
    const groupsGrid = document.getElementById('groupsPreviewGrid');
    if (!groupsGrid) return;
    
    // Очищаем контейнер
    groupsGrid.innerHTML = '';
    
    // Ограничиваем количество отображаемых групп до 6
    const groupsToShow = groups.slice(0, 6);
    
    // Отображаем каждую группу
    groupsToShow.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'preview-item';
        groupItem.setAttribute('data-group-id', group.id);
        
        // Определяем количество участников группы
        const memberCount = group.members ? Object.keys(group.members).length : 0;
        
        // Создаем HTML для превью группы
        groupItem.innerHTML = `
            <div class="preview-avatar">
                ${group.photoURL 
                    ? `<img src="${group.photoURL}" alt="${group.name}" class="preview-img">` 
                    : `<div class="preview-placeholder">${group.name.charAt(0)}</div>`}
            </div>
            <div class="preview-name">${group.name}</div>
            <div class="preview-info">${memberCount} ${getWordForm(memberCount, ['участник', 'участника', 'участников'])}</div>
        `;
        
        // Добавляем обработчик клика для перехода на страницу группы
        groupItem.addEventListener('click', () => {
            window.location.href = `group.html?id=${group.id}`;
        });
        
        // Добавляем элемент в сетку
        groupsGrid.appendChild(groupItem);
    });
}

// Функция для правильного склонения слов в зависимости от числа
function getWordForm(number, words) {
    const cases = [2, 0, 1, 1, 1, 2];
    return words[(number % 100 > 4 && number % 100 < 20) ? 2 : cases[Math.min(number % 10, 5)]];
} 