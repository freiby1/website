// groups.js - управление группами пользователя на странице профиля

// Импорт Firebase SDK
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';

// Глобальная переменная для хранения текущего состояния поиска
let currentGroupSearchTerm = '';

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
                
                // Настраиваем модальное окно для групп
                setupGroupsModal();
                
                // Добавляем обработчик клика для header групп
                const groupsListBtn = document.getElementById('groupsListBtn');
                if (groupsListBtn) {
                    groupsListBtn.addEventListener('click', () => {
                        // Открываем модальное окно групп вместо перехода на другую страницу
                        const modal = document.getElementById('groupsModal');
                        if (modal) {
                            modal.style.display = 'block';
                            // Загружаем список групп в модальное окно
                            loadModalUserGroups(db, profileId);
                            
                            // Фокусируемся на поле поиска после открытия модального окна
                            setTimeout(() => {
                                const searchInput = document.getElementById('groupsSearchInput');
                                if (searchInput) {
                                    // Устанавливаем сохраненное значение поиска, если оно есть
                                    if (currentGroupSearchTerm) {
                                        searchInput.value = currentGroupSearchTerm;
                                        
                                        // Показываем кнопку очистки
                                        const clearButton = document.getElementById('clearGroupSearchButton');
                                        if (clearButton) {
                                            clearButton.style.display = 'flex';
                                        }
                                    }
                                    
                                    searchInput.focus();
                                }
                            }, 300);
                        }
                    });
                }
            }
        }
    });
}

// Функция настройки модального окна групп
function setupGroupsModal() {
    const modal = document.getElementById('groupsModal');
    if (!modal) return;
    
    const closeButton = modal.querySelector('.groups-modal-close');
    const searchInput = document.getElementById('groupsSearchInput');
    const clearSearchButton = document.getElementById('clearGroupSearchButton');
    
    // Настройка функционала поиска
    if (searchInput && clearSearchButton) {
        // Обработчик ввода в поле поиска
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            
            // Сохраняем текущий поисковый запрос
            currentGroupSearchTerm = searchTerm;
            
            // Показываем/скрываем кнопку очистки
            clearSearchButton.style.display = searchTerm ? 'flex' : 'none';
            
            // Фильтруем список групп
            filterGroupsList(searchTerm);
        });
        
        // Обработчик кнопки очистки поиска
        clearSearchButton.addEventListener('click', function() {
            searchInput.value = '';
            this.style.display = 'none';
            
            // Сбрасываем сохраненный поисковый запрос
            currentGroupSearchTerm = '';
            
            // Сбрасываем фильтрацию списка с пустым поисковым запросом
            filterGroupsList('');
            
            // Фокусируемся на поле ввода
            searchInput.focus();
        });
    }
    
    // Функция для очистки поиска и сброса результатов
    function resetGroupsSearch() {
        if (searchInput) {
            searchInput.value = '';
        }
        if (clearSearchButton) {
            clearSearchButton.style.display = 'none';
        }
        
        // Сбрасываем сохраненный поисковый запрос
        currentGroupSearchTerm = '';
        
        // Скрываем все сообщения о результатах поиска
        const modalBody = modal.querySelector('.groups-modal-body');
        if (modalBody) {
            const noResults = modalBody.querySelector('.no-search-results');
            if (noResults) {
                noResults.remove();
            }
        }
        
        // Сбрасываем фильтрацию групп
        filterGroupsList('');
    }
    
    // Добавляем обработчик клика для кнопки закрытия
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            // Закрываем модальное окно без сброса поиска
            modal.style.display = 'none';
        });
    }
    
    // Закрытие модального окна при клике вне его
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // Закрываем модальное окно без сброса поиска
            modal.style.display = 'none';
        }
    });
}

// Функция для фильтрации списка групп
function filterGroupsList(searchTerm) {
    const groupsList = document.getElementById('groupsList');
    if (!groupsList) return;
    
    const groupItems = groupsList.querySelectorAll('.group-item');
    const modalBody = groupsList.closest('.groups-modal-body');
    
    // Проверяем, что modalBody существует перед обращением к нему
    if (!modalBody) {
        console.error('Элемент .groups-modal-body не найден');
        return;
    }
    
    // Удаляем предыдущее сообщение о результатах поиска, если оно есть
    const existingNoResults = modalBody.querySelector('.no-search-results');
    if (existingNoResults) {
        existingNoResults.remove();
    }
    
    // Получаем сообщение об отсутствии групп
    const existingNoGroups = modalBody.querySelector('.no-groups');
    
    // Скрываем сообщение по умолчанию
    if (existingNoGroups) existingNoGroups.style.display = 'none';
    
    // Если нет групп вообще, показываем сообщение и выходим
    if (groupItems.length === 0) {
        groupsList.style.display = 'none';
        
        if (existingNoGroups) {
            existingNoGroups.style.display = 'flex';
        } else {
            // Создаем сообщение об отсутствии групп, если его нет
            const noGroupsDiv = document.createElement('div');
            noGroupsDiv.className = 'no-groups';
            noGroupsDiv.innerHTML = '<i class="far fa-frown"></i><span>У пользователя нет групп</span>';
            modalBody.appendChild(noGroupsDiv);
        }
        return;
    }

    // Показываем грид по умолчанию
    groupsList.style.display = 'grid';
    
    // Проходим по всем элементам списка и фильтруем их
    let visibleCount = 0;
    
    groupItems.forEach(item => {
        const groupName = item.querySelector('.group-name').textContent.toLowerCase();
        
        if (searchTerm === '') {
            // Если поиска нет, показываем все группы
            item.classList.remove('hidden');
            visibleCount++;
        } else {
            // Если есть поисковый запрос, показываем только совпадения
            if (groupName.includes(searchTerm)) {
                item.classList.remove('hidden');
                visibleCount++;
            } else {
                item.classList.add('hidden');
            }
        }
    });
    
    // Если нет видимых элементов после фильтрации, показываем сообщение
    if (visibleCount === 0) {
        groupsList.style.display = 'none';
        
        if (searchTerm) {
            // Если есть поисковый запрос, показываем сообщение "Ничего не найдено"
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-search-results';
            noResultsDiv.innerHTML = '<i class="far fa-sad-tear"></i><span>Ничего не найдено</span>';
            modalBody.appendChild(noResultsDiv);
        } else {
            // Если поиск пустой, показываем сообщение о пустом списке групп
            if (existingNoGroups) {
                existingNoGroups.style.display = 'flex';
            } else {
                const noGroupsDiv = document.createElement('div');
                noGroupsDiv.className = 'no-groups';
                noGroupsDiv.innerHTML = '<i class="far fa-frown"></i><span>У пользователя нет групп</span>';
                modalBody.appendChild(noGroupsDiv);
            }
        }
    }
}

// Функция для загрузки групп пользователя в модальное окно
async function loadModalUserGroups(db, profileId) {
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
        const snapshot = await get(userRef);
        const userData = snapshot.val();
        
        if (!userData) {
            console.error('Данные пользователя не найдены');
            return;
        }
        
        // Очищаем текущий список групп в модальном окне
        const groupsList = document.getElementById('groupsList');
        if (!groupsList) {
            console.error('Элемент #groupsList не найден');
            return;
        }
        
        groupsList.innerHTML = '';
        
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
        
        // Если у пользователя нет групп, показываем сообщение
        const modalBody = groupsList.closest('.groups-modal-body');
        if (!modalBody) {
            console.error('Элемент .groups-modal-body не найден');
            return;
        }
        
        if (allGroupIds.length === 0) {
            groupsList.style.display = 'none';
            
            // Проверяем, существует ли уже сообщение об отсутствии групп
            let noGroupsMessage = modalBody.querySelector('.no-groups');
            if (!noGroupsMessage) {
                // Создаем и добавляем сообщение об отсутствии групп
                noGroupsMessage = document.createElement('div');
                noGroupsMessage.className = 'no-groups';
                noGroupsMessage.innerHTML = '<i class="far fa-frown"></i><span>У пользователя нет групп</span>';
                modalBody.appendChild(noGroupsMessage);
            } else {
                noGroupsMessage.style.display = 'flex';
            }
            return;
        }
        
        // Удаляем сообщение об отсутствии групп, если оно есть
        const noGroupsMessage = modalBody.querySelector('.no-groups');
        if (noGroupsMessage) {
            noGroupsMessage.style.display = 'none';
        }
        
        // Показываем список групп
        groupsList.style.display = 'grid';
        
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
        
        if (validGroups.length === 0) {
            groupsList.style.display = 'none';
            
            // Показываем сообщение об отсутствии групп
            let noGroupsMessage = modalBody.querySelector('.no-groups');
            if (!noGroupsMessage) {
                noGroupsMessage = document.createElement('div');
                noGroupsMessage.className = 'no-groups';
                noGroupsMessage.innerHTML = '<i class="far fa-frown"></i><span>У пользователя нет групп</span>';
                modalBody.appendChild(noGroupsMessage);
            } else {
                noGroupsMessage.style.display = 'flex';
            }
            return;
        }
        
        // Отображаем группы пользователя в модальном окне
        validGroups.forEach(group => {
            const groupItem = document.createElement('div');
            groupItem.className = 'group-item';
            groupItem.setAttribute('data-group-id', group.id);
            
            // Определяем количество участников группы
            const memberCount = group.members ? Object.keys(group.members).length : 0;
            
            // Создаем HTML для элемента группы
            groupItem.innerHTML = `
                <div class="group-avatar">
                    ${group.photoURL 
                        ? `<img src="${group.photoURL}" alt="${group.name}" class="group-avatar-img">` 
                        : `<div class="group-avatar-placeholder">${group.name.charAt(0)}</div>`}
                </div>
                <div class="group-info">
                    <div class="group-name">${group.name}</div>
                    <div class="group-status">${memberCount} ${getWordForm(memberCount, ['участник', 'участника', 'участников'])}</div>
                </div>
            `;
            
            // Добавляем обработчик клика для перехода на страницу группы
            groupItem.addEventListener('click', () => {
                window.location.href = `group.html?id=${group.id}`;
            });
            
            // Добавляем элемент в список
            groupsList.appendChild(groupItem);
        });
        
        // Если есть сохраненный поисковый запрос, применяем его
        if (currentGroupSearchTerm) {
            // Обновляем поле ввода
            const searchInput = document.getElementById('groupsSearchInput');
            if (searchInput) {
                searchInput.value = currentGroupSearchTerm;
            }
            
            // Показываем кнопку очистки
            const clearButton = document.getElementById('clearGroupSearchButton');
            if (clearButton) {
                clearButton.style.display = 'flex';
            }
            
            // Применяем фильтрацию
            filterGroupsList(currentGroupSearchTerm);
        }
    } catch (error) {
        console.error('Ошибка при загрузке групп пользователя для модального окна:', error);
    }
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
            
            // Если у пользователя нет групп, показываем сообщение
            const groupsContainer = document.querySelector('.groups-preview-container');
            const groupsGrid = document.getElementById('groupsPreviewGrid');
            
            if (allGroupIds.length === 0) {
                if (groupsContainer) {
                    groupsContainer.style.display = 'block'; // Показываем контейнер
                    
                    // Удаляем предыдущее сообщение, если оно есть
                    const existingMessage = groupsContainer.querySelector('.no-groups-message');
                    if (existingMessage) {
                        existingMessage.remove();
                    }
                    
                    // Скрываем грид
                    if (groupsGrid) {
                        groupsGrid.style.display = 'none';
                    }
                    
                    // Создаем и добавляем сообщение об отсутствии групп
                    const noGroupsMessage = document.createElement('div');
                    noGroupsMessage.className = 'no-groups-message';
                    noGroupsMessage.innerHTML = '<i class="far fa-sad-tear"></i><span>Список групп пуст</span>';
                    groupsContainer.appendChild(noGroupsMessage);
                }
                return;
            } else if (groupsContainer) {
                groupsContainer.style.display = 'block';
                
                // Удаляем сообщение об отсутствии групп, если оно есть
                const existingMessage = groupsContainer.querySelector('.no-groups-message');
                if (existingMessage) {
                    existingMessage.remove();
                }
                
                // Показываем грид
                if (groupsGrid) {
                    groupsGrid.style.display = 'grid';
                }
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
            
            // Проверяем, есть ли группы после фильтрации
            if (validGroups.length === 0) {
                if (groupsContainer) {
                    // Удаляем предыдущее сообщение, если оно есть
                    const existingMessage = groupsContainer.querySelector('.no-groups-message');
                    if (existingMessage) {
                        existingMessage.remove();
                    }
                    
                    // Скрываем грид
                    if (groupsGrid) {
                        groupsGrid.style.display = 'none';
                    }
                    
                    // Создаем и добавляем сообщение об отсутствии групп
                    const noGroupsMessage = document.createElement('div');
                    noGroupsMessage.className = 'no-groups-message';
                    noGroupsMessage.innerHTML = '<i class="far fa-sad-tear"></i><span>Список групп пуст</span>';
                    groupsContainer.appendChild(noGroupsMessage);
                }
                return;
            }
            
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