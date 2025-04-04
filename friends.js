import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import {
    getDatabase,
    ref,
    get,
    set,
    push,
    remove,
    serverTimestamp,
    onChildAdded,
    onChildRemoved,
    onValue,
    onDisconnect,
    off,
    onChildChanged,
    update,
    query,
    orderByChild,
    equalTo
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import {
    getStorage,
    ref as storageRef,
    uploadBytesResumable,
    getDownloadURL,
    uploadBytes
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js';

// Firebase конфигурация
const firebaseConfig = {
    apiKey: "AIzaSyAR-ui1g1VurKML1wQwZFdon_2Bgcrz-ms",
    authDomain: "tpoproject-35957.firebaseapp.com",
    databaseURL: "https://tpoproject-35957-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "tpoproject-35957",
    storageBucket: "tpoproject-35957.appspot.com",
    messagingSenderId: "683982725892",
    appId: "1:683982725892:web:4d4e07e6ea913ddff5a2f7"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

let currentUserData = null;
let currentProfileId = null;
let friendsListener = null;
let requestsListener = null;

// Инициализация функционала друзей
export function initializeFriends() {
    const urlParams = new URLSearchParams(window.location.search);
    currentProfileId = urlParams.get('id');
    currentUserData = JSON.parse(localStorage.getItem('userData'));

    if (!currentUserData || !currentUserData.numericId) {
        console.error('Пользователь не авторизован');
        return;
    }

    setupFriendsButton();
    setupFriendsModal();
    setupFriendsListeners();
    loadFriendsPreview(); // Добавляем загрузку превью друзей
}

function initializeFriendsAfterLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    currentProfileId = urlParams.get('id');
    currentUserData = JSON.parse(localStorage.getItem('userData'));

    if (!currentUserData || !currentUserData.numericId) {
        console.error('Пользователь не авторизован');
        return;
    }

    // Проверяем наличие необходимых элементов в DOM
    const requiredElements = [
        'friendButton',
        'editProfileBtn',
        'friendButtonText',
        'friendsListBtn',
        'friendsModal',
        'friendsList',
        'requestsList'
    ];

    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    if (missingElements.length > 0) {
        console.error('Отсутствуют необходимые элементы:', missingElements);
        return;
    }

    setupFriendsButton();
    setupFriendsModal();
    setupFriendsListeners();
}

// Настройка кнопки добавления в друзья
function setupFriendsButton() {
    const friendButton = document.getElementById('friendButton');
    
    // Проверяем, существует ли элемент
    if (!friendButton) {
        console.error('Не найдена кнопка добавления в друзья');
        return;
    }

    // Показываем кнопку добавления в друзья только если это не наш профиль
    if (currentProfileId !== currentUserData.numericId.toString()) {
        friendButton.style.display = 'flex';
        updateFriendButtonState();
    } else {
        friendButton.style.display = 'none';
    }

    friendButton.addEventListener('click', handleFriendButtonClick);
}

// Обновление состояния кнопки добавления в друзья
async function updateFriendButtonState() {
    const db = getDatabase();
    const friendButton = document.getElementById('friendButton');
    const friendButtonText = document.getElementById('friendButtonText');
    
    try {
        // Проверяем статус дружбы
        const friendshipRef = ref(db, `friendships/${currentUserData.numericId}/${currentProfileId}`);
        const friendshipSnapshot = await get(friendshipRef);
        
        if (friendshipSnapshot.exists()) {
            const status = friendshipSnapshot.val().status;
            
            switch (status) {
                case 'friends':
                    friendButtonText.textContent = 'Удалить из друзей';
                    friendButton.querySelector('i').className = 'fas fa-user-minus';
                    break;
                case 'pending_sent':
                    friendButtonText.textContent = 'Заявка отправлена';
                    friendButton.querySelector('i').className = 'fas fa-user-clock';
                    break;
                case 'pending_received':
                    friendButtonText.textContent = 'Принять заявку';
                    friendButton.querySelector('i').className = 'fas fa-user-check';
                    break;
            }
        } else {
            friendButtonText.textContent = 'Добавить в друзья';
            friendButton.querySelector('i').className = 'fas fa-user-plus';
        }
    } catch (error) {
        console.error('Ошибка при обновлении состояния кнопки:', error);
    }
}

// Обработка клика по кнопке добавления/удаления из друзей
async function handleFriendButtonClick() {
    const db = getDatabase();
    const friendshipRef = ref(db, `friendships/${currentUserData.numericId}/${currentProfileId}`);
    const friendshipSnapshot = await get(friendshipRef);
    
    try {
        if (friendshipSnapshot.exists()) {
            const status = friendshipSnapshot.val().status;
            
            switch (status) {
                case 'friends':
                    // Удаляем из друзей
                    console.log('Удаляем из друзей:', currentProfileId);
                    const updates = {};
                    updates[`friendships/${currentUserData.numericId}/${currentProfileId}`] = null;
                    updates[`friendships/${currentProfileId}/${currentUserData.numericId}`] = null;

                    await update(ref(db), updates);
                    
                    // Обновляем состояние кнопки и списки
                    updateFriendButtonState();
                    loadFriendsPreview();
                    alert('Пользователь удален из друзей');
                    break;

                case 'pending_sent':
                    // Отменяем заявку
                    await cancelFriendRequest(currentProfileId);
                    break;

                case 'pending_received':
                    // Принимаем заявку
                    await acceptFriendRequest(currentProfileId);
                    break;
            }
        } else {
            // Отправляем заявку в друзья
            await sendFriendRequest();
        }
        
        updateFriendButtonState();
    } catch (error) {
        console.error('Ошибка при обработке действия с другом:', error);
        alert('Произошла ошибка при выполнении действия');
    }
}

// Отправка заявки в друзья
async function sendFriendRequest() {
    console.log('Отправка заявки в друзья пользователю:', currentProfileId);
    const db = getDatabase();
    const timestamp = Date.now();
    
    try {
        // Создаем записи о заявке в друзья для обоих пользователей
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${currentProfileId}`] = {
            status: 'pending_sent',
            timestamp: timestamp
        };
        updates[`friendships/${currentProfileId}/${currentUserData.numericId}`] = {
            status: 'pending_received',
            timestamp: timestamp
        };

        await update(ref(db), updates);
        alert('Заявка в друзья отправлена');
    } catch (error) {
        console.error('Ошибка при отправке заявки в друзья:', error);
        alert('Произошла ошибка при отправке заявки');
    }
}

// Настройка модального окна друзей
function setupFriendsModal() {
    const modal = document.getElementById('friendsModal');
    const friendsHeader = document.querySelector('.friends-preview-header');
    const tabs = document.querySelectorAll('.friends-tab');
    const requestsTab = document.querySelector('.friends-tab[data-tab="requests"]');
    
    // Скрываем вкладку заявок если это не наш профиль
    if (currentProfileId !== currentUserData.numericId.toString()) {
        requestsTab.style.display = 'none';
    } else {
        requestsTab.style.display = 'flex';
    }
    
    // Используем заголовок вместо кнопки для открытия модального окна
    friendsHeader.addEventListener('click', () => {
        console.log('Открываем модальное окно друзей');
        modal.style.display = 'block';
        
        // При открытии всегда показываем вкладку с друзьями
        tabs.forEach(tab => {
            if (tab.dataset.tab === 'friends') {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        document.getElementById('friendsList').style.display = 'grid';
        document.getElementById('requestsList').style.display = 'none';
        
        loadFriendsList();
        // Загружаем заявки только если это наш профиль
        if (currentProfileId === currentUserData.numericId.toString()) {
            loadRequestsList();
        }
    });
    
    // Закрытие модального окна при клике вне его
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Переключение вкладок
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Проверяем, можно ли переключиться на эту вкладку
            if (tab.dataset.tab === 'requests' && currentProfileId !== currentUserData.numericId.toString()) {
                return; // Игнорируем клик на вкладку заявок в чужом профиле
            }

            console.log('Переключение на вкладку:', tab.dataset.tab);
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.dataset.tab;
            const friendsList = document.getElementById('friendsList');
            const requestsList = document.getElementById('requestsList');
            
            if (tabName === 'friends') {
                friendsList.style.display = 'grid';
                requestsList.style.display = 'none';
                loadFriendsList();
            } else {
                friendsList.style.display = 'none';
                requestsList.style.display = 'grid';
                loadRequestsList();
            }
        });
    });
}

// Загрузка списка друзей
async function loadFriendsList() {
    const db = getDatabase();
    const friendsList = document.getElementById('friendsList');
    friendsList.innerHTML = '';
    
    try {
        console.log('Начинаем загрузку списка друзей');
        console.log('ID просматриваемого профиля:', currentProfileId);

        // Используем ID просматриваемого профиля вместо текущего пользователя
        const friendshipsRef = ref(db, `friendships/${currentProfileId}`);
        const snapshot = await get(friendshipsRef);
        
        console.log('Данные о дружбе:', snapshot.val());

        if (snapshot.exists()) {
            const friendships = snapshot.val();
            let hasFriends = false;

            // Фильтруем только подтвержденных друзей
            const confirmedFriends = Object.entries(friendships)
                .filter(([index, data]) => {
                    console.log('Проверяем дружбу:', index, data);
                    return data && data.status === 'friends';
                });

            console.log('Найдены друзья:', confirmedFriends);

            // Получаем данные друзей
            for (const [friendId, data] of confirmedFriends) {
                const userRef = ref(db, 'users');
                const usersSnapshot = await get(userRef);
                
                if (usersSnapshot.exists()) {
                    const users = usersSnapshot.val();
                    // Ищем друга по numericId
                    const friend = Object.values(users).find(user => user.numericId === parseInt(friendId));
                    
                    console.log('Найден друг:', friend);

                    if (friend) {
                        hasFriends = true;
                        const friendElement = createFriendElement(friend, 'friend', friend.numericId);
                        friendsList.appendChild(friendElement);
                    }
                }
            }

            if (!hasFriends) {
                console.log('Друзья не найдены');
                friendsList.innerHTML = '<div class="no-friends">Список друзей пуст</div>';
            }
        } else {
            console.log('Нет данных о дружбе');
            friendsList.innerHTML = '<div class="no-friends">Список друзей пуст</div>';
        }
    } catch (error) {
        console.error('Ошибка при загрузке списка друзей:', error);
        friendsList.innerHTML = '<div class="error-message">Ошибка при загрузке списка друзей</div>';
    }
}

// Загрузка списка заявок в друзья
async function loadRequestsList() {
    const db = getDatabase();
    const requestsList = document.getElementById('requestsList');
    requestsList.innerHTML = '';

    try {
        console.log('Начинаем загрузку заявок в друзья');
        console.log('ID текущего пользователя:', currentUserData.numericId);

        const friendshipsRef = ref(db, `friendships/${currentUserData.numericId}`);
        const snapshot = await get(friendshipsRef);

        console.log('Данные о дружбе:', snapshot.val());

        if (snapshot.exists()) {
            const friendships = snapshot.val();
            let hasRequests = false;

            // Преобразуем данные в массив, пропуская пустые элементы
            const pendingRequests = Object.entries(friendships)
                .filter(([index, data]) => {
                    return data && data.status === 'pending_received';
                });

            console.log('Найдены входящие заявки:', pendingRequests);

            // Получаем данные пользователей
            for (const [index, data] of pendingRequests) {
                const userRef = ref(db, 'users');
                const usersSnapshot = await get(userRef);
                
                if (usersSnapshot.exists()) {
                    const users = usersSnapshot.val();
                    const sender = Object.values(users).find(user => user.numericId === parseInt(index));
                    
                    console.log('Найден отправитель:', sender);

                    if (sender) {
                        hasRequests = true;
                        const requestElement = createFriendElement(sender, 'request', sender.numericId);
                        requestsList.appendChild(requestElement);
                    }
                }
            }

            if (!hasRequests) {
                console.log('Нет входящих заявок');
                requestsList.innerHTML = '<div class="no-requests">Нет новых заявок в друзья</div>';
            }
        } else {
            console.log('Нет данных о дружбе');
            requestsList.innerHTML = '<div class="no-requests">Нет новых заявок в друзья</div>';
        }
    } catch (error) {
        console.error('Ошибка при загрузке заявок в друзья:', error);
        requestsList.innerHTML = '<div class="error-message">Ошибка при загрузке заявок</div>';
    }
}

// Создание элемента друга/заявки
function createFriendElement(user, type, userId) {
    console.log('Создаем элемент для пользователя:', user, 'тип:', type, 'userId:', userId);
    
    const div = document.createElement('div');
    div.className = 'friend-item';
    div.style.cursor = 'pointer';
    
    const avatar = document.createElement('div');
    avatar.className = 'friend-avatar';
    if (user.photoURL) {
        avatar.innerHTML = `<img src="${user.photoURL}" alt="${user.name}">`;
    } else {
        avatar.textContent = user.name.charAt(0).toUpperCase();
    }
    
    const info = document.createElement('div');
    info.className = 'friend-info';
    info.innerHTML = `<div class="friend-name">${user.name}</div>`;
    
    const actions = document.createElement('div');
    actions.className = 'friend-actions';
    
    // Показываем кнопку удаления только если это наш профиль
    if (type === 'friend' && currentProfileId === currentUserData.numericId.toString()) {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'friend-action-btn friend-remove';
        removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('Удаление из друзей:', userId);
            await removeFriend(userId);
        });
        actions.appendChild(removeBtn);
    }
    
    div.appendChild(avatar);
    div.appendChild(info);
    div.appendChild(actions);
    
    div.addEventListener('click', () => {
        const modal = document.getElementById('friendsModal');
        if (modal) {
            modal.style.display = 'none';
        }
        window.location.href = `profile.html?id=${user.numericId}`;
    });

    return div;
}

// Настройка слушателей для обновления счетчиков
function setupFriendsListeners() {
    const db = getDatabase();
    
    // Отписываемся от предыдущих слушателей
    if (friendsListener) off(friendsListener);
    if (requestsListener) off(requestsListener);
    
    // Устанавливаем слушатели только если это наш профиль
    if (currentProfileId === currentUserData.numericId.toString()) {
        // Слушатель для обновления счетчика заявок
        const friendshipsRef = ref(db, `friendships/${currentUserData.numericId}`);
        requestsListener = onValue(friendshipsRef, (snapshot) => {
            if (snapshot.exists()) {
                const friendships = snapshot.val();
                const requestsCount = Object.values(friendships)
                    .filter(f => f.status === 'pending_received')
                    .length;
                
                const requestsCountElement = document.getElementById('friendRequestsCount');
                const modalRequestsCount = document.getElementById('modalRequestsCount');
                
                if (requestsCount > 0) {
                    requestsCountElement.textContent = requestsCount;
                    requestsCountElement.style.display = 'flex';
                    modalRequestsCount.textContent = requestsCount;
                    modalRequestsCount.style.display = 'flex';
                } else {
                    requestsCountElement.style.display = 'none';
                    modalRequestsCount.style.display = 'none';
                }
            }
        });
    }
}

// Очистка слушателей при уходе со страницы
window.addEventListener('beforeunload', () => {
    if (friendsListener) off(friendsListener);
    if (requestsListener) off(requestsListener);
});

// Обновим функцию updateFriendRequestsCounter
function updateFriendRequestsCounter() {
    // Показываем счетчик только если это наш профиль
    if (currentProfileId !== currentUserData.numericId.toString()) {
        const requestsCountElement = document.getElementById('friendRequestsCount');
        const modalRequestsCount = document.getElementById('modalRequestsCount');
        if (requestsCountElement) requestsCountElement.style.display = 'none';
        if (modalRequestsCount) modalRequestsCount.style.display = 'none';
        return;
    }

    const db = getDatabase();
    const friendshipsRef = ref(db, `friendships/${currentUserData.numericId}`);
    
    onValue(friendshipsRef, (snapshot) => {
        if (snapshot.exists()) {
            const friendships = snapshot.val();
            
            // Фильтруем пустые элементы и считаем заявки
            const requestsCount = Object.values(friendships)
                .filter(data => data && data.status === 'pending_received')
                .length;
            
            const requestsCountElement = document.getElementById('friendRequestsCount');
            const modalRequestsCount = document.getElementById('modalRequestsCount');
            
            if (requestsCount > 0) {
                requestsCountElement.textContent = requestsCount;
                requestsCountElement.style.display = 'flex';
                modalRequestsCount.textContent = requestsCount;
                modalRequestsCount.style.display = 'flex';
            } else {
                requestsCountElement.style.display = 'none';
                modalRequestsCount.style.display = 'none';
            }
        }
    });
}

// Функции для работы с друзьями
async function acceptFriendRequest(userId) {
    console.log('Начало принятия заявки от пользователя:', userId);
    const db = getDatabase();
    const timestamp = Date.now();
    
    try {
        // Обновляем статус на "friends" для обоих пользователей
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${userId}`] = {
            status: 'friends',
            timestamp: timestamp
        };
        updates[`friendships/${userId}/${currentUserData.numericId}`] = {
            status: 'friends',
            timestamp: timestamp
        };

        console.log('Обновляем статусы дружбы:', updates);
        await update(ref(db), updates);

        // Сначала закрываем вкладку с заявками
        const requestsTab = document.getElementById('requestsList');
        const friendsTab = document.getElementById('friendsList');
        const tabs = document.querySelectorAll('.friends-tab');
        
        // Переключаемся на вкладку друзей
        tabs.forEach(tab => {
            if (tab.dataset.tab === 'friends') {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        requestsTab.style.display = 'none';
        friendsTab.style.display = 'grid';

        // Перезагружаем списки
        await loadFriendsList();
        await loadRequestsList();
        updateFriendRequestsCounter();

        // После успешного принятия заявки обновляем превью друзей
        await loadFriendsPreview();

        // Показываем уведомление об успехе
        alert('Заявка в друзья принята!');
    } catch (error) {
        console.error('Ошибка при принятии заявки:', error);
        alert('Произошла ошибка при принятии заявки');
    }
}

async function cancelFriendRequest(userId) {
    console.log('Отмена заявки в друзья для пользователя:', userId);
    const db = getDatabase();
    
    try {
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${userId}`] = null;
        updates[`friendships/${userId}/${currentUserData.numericId}`] = null;

        await update(ref(db), updates);
        alert('Заявка в друзья отменена');
        
        // Обновляем списки и состояние кнопки
        loadFriendsList();
        loadRequestsList();
        updateFriendButtonState();
    } catch (error) {
        console.error('Ошибка при отмене заявки:', error);
        alert('Произошла ошибка при отмене заявки');
    }
}

async function removeFriend(userId) {
    console.log('Начало удаления из друзей пользователя:', userId);
    const db = getDatabase();
    
    try {
        // Удаляем записи о дружбе для обоих пользователей
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${userId}`] = null;
        updates[`friendships/${userId}/${currentUserData.numericId}`] = null;

        console.log('Удаляем записи о дружбе:', updates);
        await update(ref(db), updates);

        // Перезагружаем список друзей
        await loadFriendsList();
        updateFriendRequestsCounter();

        // После успешного удаления друга обновляем превью друзей
        await loadFriendsPreview();

        // Показываем уведомление об успехе
        alert('Пользователь удален из друзей');
    } catch (error) {
        console.error('Ошибка при удалении из друзей:', error);
        alert('Произошла ошибка при удалении из друзей');
    }
}

// Добавим новую функцию для загрузки превью друзей
async function loadFriendsPreview() {
    const db = getDatabase();
    const previewGrid = document.getElementById('friendsPreviewGrid');
    const friendsCountElement = document.querySelector('.friends-count');
    
    try {
        // Используем ID просматриваемого профиля вместо текущего пользователя
        const friendshipsRef = ref(db, `friendships/${currentProfileId}`);
        const snapshot = await get(friendshipsRef);

        if (snapshot.exists()) {
            const friendships = snapshot.val();
            const confirmedFriends = Object.entries(friendships)
                .filter(([_, data]) => data && data.status === 'friends');

            // Обновляем счетчик друзей
            friendsCountElement.textContent = confirmedFriends.length;

            // Очищаем grid
            previewGrid.innerHTML = '';

            // Получаем данные друзей
            for (const [friendId, _] of confirmedFriends) {
                const userRef = ref(db, 'users');
                const usersSnapshot = await get(userRef);
                
                if (usersSnapshot.exists()) {
                    const users = usersSnapshot.val();
                    const friend = Object.values(users).find(user => user.numericId === parseInt(friendId));

                    if (friend) {
                        const friendElement = createFriendPreviewElement(friend);
                        previewGrid.appendChild(friendElement);
                    }
                }
            }

            // Если нет друзей, показываем сообщение
            if (confirmedFriends.length === 0) {
                previewGrid.innerHTML = '<div class="no-friends-message">Список друзей пуст</div>';
            }
        } else {
            friendsCountElement.textContent = '0';
            previewGrid.innerHTML = '<div class="no-friends-message">Список друзей пуст</div>';
        }
    } catch (error) {
        console.error('Ошибка при загрузке превью друзей:', error);
    }
}

// Функция создания превью элемента друга
function createFriendPreviewElement(user) {
    const div = document.createElement('div');
    div.className = 'friend-preview-item';
    
    const avatar = document.createElement('div');
    avatar.className = 'friend-preview-avatar';
    if (user.photoURL) {
        avatar.innerHTML = `<img src="${user.photoURL}" alt="${user.name}">`;
    } else {
        avatar.style.backgroundColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        avatar.innerHTML = `<div class="avatar-placeholder">${user.name.charAt(0).toUpperCase()}</div>`;
    }
    
    const name = document.createElement('div');
    name.className = 'friend-preview-name';
    name.textContent = user.name;
    
    div.appendChild(avatar);
    div.appendChild(name);
    
    // Добавляем обработчик клика для перехода в профиль
    div.addEventListener('click', () => {
        window.location.href = `profile.html?id=${user.numericId}`;
    });
    
    return div;
} 