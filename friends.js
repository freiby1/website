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
import { showFriendRequestNotification } from './sidebar_old.js';

// Firebase конфигурация
const firebaseConfig = {
	apiKey: "AIzaSyCPQajYeeRG-GyQHhwlZ08nI5-BT36XpaU",
	authDomain: "ochat-9cfc9.firebaseapp.com",
	databaseURL: "https://ochat-9cfc9-default-rtdb.europe-west1.firebasedatabase.app",
	projectId: "ochat-9cfc9",
	storageBucket: "ochat-9cfc9.appspot.com",
	messagingSenderId: "190209379577",
	appId: "1:190209379577:web:a57171ab4b1f55a49f6628",
	measurementId: "G-KNRXS2ZKZ9"
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
let isInitialLoad = true;
let userToDeleteId = null;
let isFriendRequestNotificationsInitialized = false; // Флаг для отслеживания инициализации уведомлений

// Функция фильтрации списка друзей/заявок
function filterFriendsList(searchTerm) {
    // Определяем активную вкладку
    const activeTab = document.querySelector('.friends-tab.active');
    if (!activeTab) return; // Выходим, если вкладка не найдена
    
    const activeTabName = activeTab.dataset.tab;
    const activeListId = activeTabName === 'friends' ? 'friendsList' : 'requestsList';
    const friendItems = document.querySelectorAll(`#${activeListId} .friend-item`);
    const modalBody = document.querySelector('.friends-modal-body');
    
    let hasVisibleItems = false;
    
    // Удаляем предыдущее сообщение о результатах поиска, если оно есть
    const existingNoResults = modalBody.querySelector('.no-search-results');
    if (existingNoResults) {
        existingNoResults.remove();
    }
    
    // Получаем сообщения об отсутствии друзей/заявок
    const existingNoFriends = modalBody.querySelector('.no-friends');
    const existingNoRequests = modalBody.querySelector('.no-requests');
    
    // Скрываем оба сообщения по умолчанию
    if (existingNoFriends) existingNoFriends.style.display = 'none';
    if (existingNoRequests) existingNoRequests.style.display = 'none';
    
    // Если есть элементы для фильтрации
    if (friendItems.length > 0) {
        // Показываем соответствующий список
        document.getElementById(activeListId).style.display = 'grid';
        
        // Проходим по всем элементам списка и фильтруем их
        let visibleCount = 0;
        friendItems.forEach(item => {
            const friendName = item.querySelector('.friend-name').textContent.toLowerCase();
            
            if (searchTerm === '' || friendName.includes(searchTerm)) {
                item.classList.remove('hidden');
                hasVisibleItems = true;
                visibleCount++;
            } else {
                item.classList.add('hidden');
            }
        });
        
        // Если нет видимых элементов и есть поисковый запрос, показываем сообщение
        if (visibleCount === 0) {
            // Скрываем грид и показываем сообщение
            document.getElementById(activeListId).style.display = 'none';
            
            if (searchTerm) {
                // Если есть поисковый запрос, показываем сообщение "Ничего не найдено"
                const noResultsDiv = document.createElement('div');
                noResultsDiv.className = 'no-search-results';
                noResultsDiv.innerHTML = '<i class="far fa-sad-tear"></i><span>Ничего не найдено</span>';
                modalBody.appendChild(noResultsDiv);
            } else {
                // Если поиск очищен, показываем соответствующее сообщение о пустом списке
                if (activeTabName === 'friends' && existingNoFriends) {
                    existingNoFriends.style.display = 'flex';
                } else if (activeTabName === 'requests' && existingNoRequests) {
                    existingNoRequests.style.display = 'flex';
                }
            }
        }
    } else {
        // Если элементов нет вообще, показываем соответствующее сообщение
        document.getElementById(activeListId).style.display = 'none';
        
        if (activeTabName === 'friends' && existingNoFriends) {
            existingNoFriends.style.display = 'flex';
        } else if (activeTabName === 'requests' && existingNoRequests) {
            existingNoRequests.style.display = 'flex';
        }
    }
}

// Инициализация функционала друзей
export function initializeFriends() {
    const urlParams = new URLSearchParams(window.location.search);
    currentProfileId = urlParams.get('id');
    currentUserData = JSON.parse(localStorage.getItem('userData'));

    if (!currentUserData || !currentUserData.numericId) {
        console.error('Пользователь не авторизован');
        return;
    }

    // Сначала настраиваем слушатели
    setupFriendshipStatusListener();
    setupFriendsListListener();
    setupRequestsListener();
    
    // Затем выполняем начальную загрузку данных
    setupFriendsButton();
    setupFriendsModal();
    setupFriendsListeners();
    
    // Загружаем превью друзей только один раз при инициализации
    loadFriendsPreview();
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
	const messageButton = document.getElementById('messageButton');
	
	// Проверяем, существуют ли элементы
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
			
			// Скрываем кнопку сообщений на своем профиле
			if (messageButton) {
					messageButton.style.display = 'none';
			}
	}

	friendButton.addEventListener('click', handleFriendButtonClick);
	
// Добавляем обработчик для кнопки сообщений
if (messageButton) {
	messageButton.addEventListener('click', async () => {
			try {
					// Находим Firebase UID пользователя по его numericId
					const db = getDatabase();
					const usersRef = ref(db, 'users');
					const usersSnapshot = await get(usersRef);
					
					console.log('currentProfileId:', currentProfileId);
					
					if (usersSnapshot.exists()) {
							const usersData = usersSnapshot.val();
							console.log('Все пользователи:', Object.values(usersData).map(u => ({
									numericId: u.numericId,
									uid: u.uid,
									firebaseId: u.firebaseId
							})));
							
							// Ищем пользователя по numericId
							const targetUser = Object.values(usersData).find(
									user => user.numericId && user.numericId.toString() === currentProfileId.toString()
							);
							
							console.log('Найденный пользователь:', targetUser);
							
							if (targetUser) {
									// Используем любой доступный идентификатор
									const uid = targetUser.uid || targetUser.firebaseId || Object.keys(usersData).find(key => usersData[key] === targetUser);
									
									if (uid) {
											console.log('Найден UID:', uid);
											// Сохраняем UID в localStorage
											localStorage.setItem('selectedChatFriend', uid);
											// Переходим на страницу сообщений
											window.location.href = 'messages.html';
									} else {
											console.error('Пользователь найден, но не имеет UID');
											console.log('Полные данные пользователя:', targetUser);
											alert('Не удалось открыть чат. Пожалуйста, попробуйте позже.');
									}
							} else {
									console.error('Не удалось найти пользователя с numericId:', currentProfileId);
									// Попробуем поискать по другим полям
									const userByOtherField = Object.values(usersData).find(
											user => (user.id && user.id.toString() === currentProfileId.toString()) ||
														(user.userId && user.userId.toString() === currentProfileId.toString())
									);
									
									if (userByOtherField) {
											console.log('Найден пользователь по другому полю:', userByOtherField);
											const uid = userByOtherField.uid || userByOtherField.firebaseId || 
																 Object.keys(usersData).find(key => usersData[key] === userByOtherField);
											
											if (uid) {
													localStorage.setItem('selectedChatFriend', uid);
													window.location.href = 'messages.html';
											} else {
													console.error('Пользователь найден по другому полю, но не имеет UID');
													alert('Не удалось открыть чат. Пожалуйста, попробуйте позже.');
											}
									} else {
											// Последняя попытка - поиск ключа в объекте users
											const userKeyMatch = Object.keys(usersData).find(key => {
													const user = usersData[key];
													return user && typeof user === 'object' && 
																(user.numericId && user.numericId.toString() === currentProfileId.toString());
											});
											
											if (userKeyMatch) {
													console.log('Найден ключ пользователя:', userKeyMatch);
													localStorage.setItem('selectedChatFriend', userKeyMatch);
													window.location.href = 'messages.html';
											} else {
													console.error('Не удалось найти пользователя никаким способом');
													alert('Не удалось открыть чат. Пожалуйста, попробуйте позже.');
											}
									}
							}
					} else {
							console.error('Не удалось получить данные пользователей');
							alert('Не удалось открыть чат. Пожалуйста, попробуйте позже.');
					}
			} catch (error) {
					console.error('Ошибка при переходе в чат:', error);
					alert('Не удалось открыть чат. Пожалуйста, попробуйте позже.');
			}
	});
}
}

// Обновление состояния кнопки добавления в друзья
async function updateFriendButtonState() {
	const db = getDatabase();
	const friendButton = document.getElementById('friendButton');
	const friendButtonText = document.getElementById('friendButtonText');
	const messageButton = document.getElementById('messageButton');
	
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
									
									// Показываем кнопку сообщений только если пользователи являются друзьями
									if (messageButton) {
											messageButton.style.display = 'flex';
									}
									break;
							case 'pending_sent':
									friendButtonText.textContent = 'Заявка отправлена';
									friendButton.querySelector('i').className = 'fas fa-user-clock';
									
									// Скрываем кнопку сообщений
									if (messageButton) {
											messageButton.style.display = 'none';
									}
									break;
							case 'pending_received':
									friendButtonText.textContent = 'Принять заявку';
									friendButton.querySelector('i').className = 'fas fa-user-check';
									
									// Скрываем кнопку сообщений
									if (messageButton) {
											messageButton.style.display = 'none';
									}
									break;
					}
			} else {
					friendButtonText.textContent = 'Добавить в друзья';
					friendButton.querySelector('i').className = 'fas fa-user-plus';
					
					// Скрываем кнопку сообщений
					if (messageButton) {
							messageButton.style.display = 'none';
					}
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
									// Получаем имя пользователя для отображения в модальном окне
									const usersRef = ref(db, 'users');
									const usersSnapshot = await get(usersRef);
									let friendName = "этого пользователя";
									
									if (usersSnapshot.exists()) {
											const users = usersSnapshot.val();
											const friend = Object.values(users).find(user => 
													user.numericId && user.numericId.toString() === currentProfileId.toString()
											);
											if (friend && friend.name) {
													friendName = friend.name;
											}
									}
									
									// Показываем модальное окно подтверждения
									const confirmModal = document.getElementById('confirmDeleteModal');
									if (confirmModal) {
											// Устанавливаем текст сообщения в модальном окне
											const messageElement = confirmModal.querySelector('.confirm-delete-body p');
											if (messageElement) {
													messageElement.textContent = `Вы действительно хотите удалить ${friendName} из друзей?`;
											}
											
											// Показываем модальное окно
											confirmModal.style.display = 'flex';
											
											// Настраиваем обработчики для кнопок
											const confirmBtn = document.getElementById('confirmDeleteBtn');
											const cancelBtn = document.getElementById('cancelDeleteBtn');
											
											// Удаляем предыдущие обработчики
											const newConfirmBtn = confirmBtn.cloneNode(true);
											const newCancelBtn = cancelBtn.cloneNode(true);
											confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
											cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
											
											// Добавляем новые обработчики
											newConfirmBtn.addEventListener('click', async () => {
													// Скрываем модальное окно
													confirmModal.style.display = 'none';
													
													// Удаляем из друзей
													console.log('Удаляем из друзей:', currentProfileId);
													const updates = {};
													updates[`friendships/${currentUserData.numericId}/${currentProfileId}`] = null;
													updates[`friendships/${currentProfileId}/${currentUserData.numericId}`] = null;

													await update(ref(db), updates);
													
													// Обновляем UI
													updateFriendButtonUI('none');
													loadFriendsPreview();
													if (typeof window.showSuccess === 'function') {
															window.showSuccess(`${friendName} удален(а) из друзей`);
													}
											});
											
											newCancelBtn.addEventListener('click', () => {
													// Просто скрываем модальное окно
													confirmModal.style.display = 'none';
											});
									} else {
											// Если модальное окно не найдено, удаляем без подтверждения
											console.warn('Модальное окно подтверждения не найдено. Удаляем без подтверждения.');
											
											const updates = {};
											updates[`friendships/${currentUserData.numericId}/${currentProfileId}`] = null;
											updates[`friendships/${currentProfileId}/${currentUserData.numericId}`] = null;

											await update(ref(db), updates);
											
											updateFriendButtonUI('none');
											loadFriendsPreview();
											if (typeof window.showSuccess === 'function') {
													window.showSuccess('Пользователь удален из друзей');
											}
									}
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
	} catch (error) {
			console.error('Ошибка при обработке действия с другом:', error);
			if (typeof window.showError === 'function') {
					window.showError('Произошла ошибка при выполнении действия');
			}
	}
}

// Отправка заявки в друзья
async function sendFriendRequest() {
    console.log('Отправка заявки в друзья пользователю:', currentProfileId);
    const db = getDatabase();
    const timestamp = Date.now();
    
    try {
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
        
        // Обновляем только локальный UI
        updateFriendButtonUI('pending_sent');
        if (typeof window.showSuccess === 'function') {
            window.showSuccess('Заявка в друзья отправлена');
        }
    } catch (error) {
        console.error('Ошибка при отправке заявки в друзья:', error);
        if (typeof window.showError === 'function') {
            window.showError('Произошла ошибка при отправке заявки');
        }
    }
}

// Настройка модального окна друзей
function setupFriendsModal() {
    const modal = document.getElementById('friendsModal');
    const friendsHeader = document.querySelector('.friends-preview-header');
    const tabs = document.querySelectorAll('.friends-tab');
    const requestsTab = document.querySelector('.friends-tab[data-tab="requests"]');
    const closeButton = document.querySelector('.friends-modal-close');
    const searchInput = document.getElementById('friendsSearchInput');
    const clearSearchButton = document.getElementById('clearSearchButton');
    
    // Скрываем вкладку заявок если это не наш профиль
    if (currentProfileId !== currentUserData.numericId.toString()) {
        requestsTab.style.display = 'none';
    } else {
        requestsTab.style.display = 'flex';
    }
    
    // Настройка функционала поиска
    if (searchInput && clearSearchButton) {
        // Обработчик ввода в поле поиска
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            
            // Показываем/скрываем кнопку очистки
            clearSearchButton.style.display = searchTerm ? 'flex' : 'none';
            
            // Фильтруем текущий активный список (друзья или заявки)
            filterFriendsList(searchTerm);
        });
        
        // Обработчик кнопки очистки поиска
        clearSearchButton.addEventListener('click', function() {
            searchInput.value = '';
            this.style.display = 'none';
            
            // Сбрасываем фильтрацию списка с пустым поисковым запросом
            filterFriendsList('');
            
            // Определяем активную вкладку
            const activeTab = document.querySelector('.friends-tab.active');
            if (activeTab) {
                const activeTabName = activeTab.dataset.tab;
                const activeListId = activeTabName === 'friends' ? 'friendsList' : 'requestsList';
                const friendsList = document.getElementById('friendsList');
                const requestsList = document.getElementById('requestsList');
                const modalBody = document.querySelector('.friends-modal-body');
                
                // Скрываем оба списка
                friendsList.style.display = 'none';
                requestsList.style.display = 'none';
                
                // Показываем только активный список
                document.getElementById(activeListId).style.display = 'grid';
                
                // Проверяем количество элементов в списке
                const items = document.querySelectorAll(`#${activeListId} .friend-item`);
                if (items.length === 0) {
                    // Если список пуст, показываем соответствующее сообщение
                    const existingNoFriends = modalBody.querySelector('.no-friends');
                    const existingNoRequests = modalBody.querySelector('.no-requests');
                    
                    if (activeTabName === 'friends' && existingNoFriends) {
                        document.getElementById(activeListId).style.display = 'none';
                        existingNoFriends.style.display = 'flex';
                    } else if (activeTabName === 'requests' && existingNoRequests) {
                        document.getElementById(activeListId).style.display = 'none';
                        existingNoRequests.style.display = 'flex';
                    }
                }
            }
            
            // Фокусируемся на поле ввода
            searchInput.focus();
        });
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
        
        // Скрываем все сообщения об отсутствии элементов
        const modalBody = document.querySelector('.friends-modal-body');
        const existingNoFriends = modalBody.querySelector('.no-friends');
        const existingNoRequests = modalBody.querySelector('.no-requests');
        
        if (existingNoFriends) existingNoFriends.style.display = 'none';
        if (existingNoRequests) existingNoRequests.style.display = 'none';
        
        loadFriendsList();
        // Загружаем заявки только если это наш профиль
        if (currentProfileId === currentUserData.numericId.toString()) {
            loadRequestsList();
        }
        
        // Фокусируемся на поле поиска после открытия модального окна
        setTimeout(() => {
            if (searchInput) {
                searchInput.focus();
            }
        }, 300);
    });
    
    // Добавляем обработчик клика для кнопки закрытия
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
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
            
            // Скрываем все сообщения об отсутствии элементов
            const modalBody = document.querySelector('.friends-modal-body');
            const existingNoFriends = modalBody.querySelector('.no-friends');
            const existingNoRequests = modalBody.querySelector('.no-requests');
            
            if (existingNoFriends) existingNoFriends.style.display = 'none';
            if (existingNoRequests) existingNoRequests.style.display = 'none';
            
            if (tabName === 'friends') {
                friendsList.style.display = 'grid';
                requestsList.style.display = 'none';
                loadFriendsList();
            } else {
                friendsList.style.display = 'none';
                requestsList.style.display = 'grid';
                loadRequestsList();
            }
            
            // Применяем текущий поисковый запрос к новой вкладке после загрузки данных
            if (searchInput && searchInput.value.trim()) {
                setTimeout(() => {
                    filterFriendsList(searchInput.value.toLowerCase().trim());
                }, 300);
            }
        });
    });
}

// Загрузка списка друзей
async function loadFriendsList() {
    const db = getDatabase();
    const friendsList = document.getElementById('friendsList');
    const modalBody = document.querySelector('.friends-modal-body');
    
    // Очищаем список друзей
    friendsList.innerHTML = '';
    
    try {
        const friendshipsRef = ref(db, `friendships/${currentProfileId}`);
        const snapshot = await get(friendshipsRef);

        // Скрываем все сообщения об отсутствии элементов
        let existingNoFriends = modalBody.querySelector('.no-friends');
        let existingNoRequests = modalBody.querySelector('.no-requests');
        
        if (existingNoFriends) existingNoFriends.style.display = 'none';
        if (existingNoRequests) existingNoRequests.style.display = 'none';
        
        // Проверяем, активна ли вкладка друзей
        const friendsTab = document.querySelector('.friends-tab[data-tab="friends"]');
        const isActiveFriendsTab = friendsTab && friendsTab.classList.contains('active');
        
        if (snapshot.exists()) {
            const friendships = snapshot.val();
            const confirmedFriends = Object.entries(friendships)
                .filter(([_, data]) => data && data.status === 'friends')
                .sort((a, b) => b[1].timestamp - a[1].timestamp); // Сортируем по времени добавления

            if (confirmedFriends.length > 0) {
                // Показываем грид только если активна вкладка друзей
                if (isActiveFriendsTab) {
                    friendsList.style.display = 'grid';
                }
                
                // Получаем данные всех пользователей одним запросом
                const userRef = ref(db, 'users');
                const usersSnapshot = await get(userRef);
                
                if (usersSnapshot.exists()) {
                    const users = usersSnapshot.val();
                    
                    for (const [friendId, _] of confirmedFriends) {
                        const friend = Object.values(users).find(user => user.numericId === parseInt(friendId));
                        if (friend) {
                            const friendElement = createFriendElement(friend, 'friend', friend.numericId);
                            friendsList.appendChild(friendElement);
                        }
                    }
                }
            } else {
                // Скрываем грид и показываем сообщение о пустом списке
                if (isActiveFriendsTab) {
                    friendsList.style.display = 'none';
                }
                
                if (!existingNoFriends) {
                    existingNoFriends = document.createElement('div');
                    existingNoFriends.className = 'no-friends';
                    existingNoFriends.innerHTML = '<i class="far fa-sad-tear"></i><span>Список друзей пуст</span>';
                    modalBody.appendChild(existingNoFriends);
                }
                
                // Показываем сообщение только если активна вкладка друзей
                existingNoFriends.style.display = isActiveFriendsTab ? 'flex' : 'none';
            }
        } else {
            // Скрываем грид и показываем сообщение о пустом списке
            if (isActiveFriendsTab) {
                friendsList.style.display = 'none';
            }
            
            if (!existingNoFriends) {
                existingNoFriends = document.createElement('div');
                existingNoFriends.className = 'no-friends';
                existingNoFriends.innerHTML = '<i class="far fa-sad-tear"></i><span>Список друзей пуст</span>';
                modalBody.appendChild(existingNoFriends);
            }
            
            // Показываем сообщение только если активна вкладка друзей
            existingNoFriends.style.display = isActiveFriendsTab ? 'flex' : 'none';
        }
        
        // Применяем текущий поисковый запрос после загрузки списка
        const searchInput = document.getElementById('friendsSearchInput');
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.toLowerCase().trim();
            filterFriendsList(searchTerm);
        }
    } catch (error) {
        console.error('Ошибка при загрузке списка друзей:', error);
        
        // Скрываем грид и показываем сообщение об ошибке
        const friendsTab = document.querySelector('.friends-tab[data-tab="friends"]');
        const isActiveFriendsTab = friendsTab && friendsTab.classList.contains('active');
        
        if (isActiveFriendsTab) {
            friendsList.style.display = 'none';
        }
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Ошибка при загрузке списка друзей';
        modalBody.appendChild(errorMessage);
    }
}

// Загрузка списка заявок в друзья
async function loadRequestsList() {
    const db = getDatabase();
    const requestsList = document.getElementById('requestsList');
    const modalBody = document.querySelector('.friends-modal-body');
    
    // Очищаем список заявок
    requestsList.innerHTML = '';

    try {
        console.log('Начинаем загрузку заявок в друзья');
        console.log('ID текущего пользователя:', currentUserData.numericId);

        // Скрываем все сообщения об отсутствии элементов
        let existingNoFriends = modalBody.querySelector('.no-friends');
        let existingNoRequests = modalBody.querySelector('.no-requests');
        
        if (existingNoFriends) existingNoFriends.style.display = 'none';
        if (existingNoRequests) existingNoRequests.style.display = 'none';
        
        // Проверяем, активна ли вкладка заявок
        const requestsTab = document.querySelector('.friends-tab[data-tab="requests"]');
        const isActiveRequestsTab = requestsTab && requestsTab.classList.contains('active');

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
                // Скрываем грид и показываем сообщение об отсутствии заявок, только если активна вкладка заявок
                if (isActiveRequestsTab) {
                    requestsList.style.display = 'none';
                }
                
                if (!existingNoRequests) {
                    existingNoRequests = document.createElement('div');
                    existingNoRequests.className = 'no-requests';
                    existingNoRequests.innerHTML = '<i class="far fa-sad-tear"></i><span>Нет новых заявок в друзья</span>';
                    modalBody.appendChild(existingNoRequests);
                }
                
                // Показываем сообщение только если активна вкладка заявок
                existingNoRequests.style.display = isActiveRequestsTab ? 'flex' : 'none';
            } else {
                // Показываем грид, только если активна вкладка заявок
                if (isActiveRequestsTab) {
                    requestsList.style.display = 'grid';
                }
            }
        } else {
            console.log('Нет данных о дружбе');
            // Скрываем грид и показываем сообщение об отсутствии заявок, только если активна вкладка заявок
            if (isActiveRequestsTab) {
                requestsList.style.display = 'none';
            }
            
            if (!existingNoRequests) {
                existingNoRequests = document.createElement('div');
                existingNoRequests.className = 'no-requests';
                existingNoRequests.innerHTML = '<i class="far fa-sad-tear"></i><span>Нет новых заявок в друзья</span>';
                modalBody.appendChild(existingNoRequests);
            }
            
            // Показываем сообщение только если активна вкладка заявок
            existingNoRequests.style.display = isActiveRequestsTab ? 'flex' : 'none';
        }
        
        // Применяем текущий поисковый запрос после загрузки списка
        const searchInput = document.getElementById('friendsSearchInput');
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.toLowerCase().trim();
            filterFriendsList(searchTerm);
        }
    } catch (error) {
        console.error('Ошибка при загрузке заявок в друзья:', error);
        // Скрываем грид и показываем сообщение об ошибке
        const requestsTab = document.querySelector('.friends-tab[data-tab="requests"]');
        const isActiveRequestsTab = requestsTab && requestsTab.classList.contains('active');
        
        if (isActiveRequestsTab) {
            requestsList.style.display = 'none';
        }
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Ошибка при загрузке заявок';
        modalBody.appendChild(errorMessage);
    }
}

// Создание элемента друга/заявки
function createFriendElement(user, type, userId) {
    console.log('Создаем элемент для пользователя:', user, 'тип:', type, 'userId:', userId);
    
    const div = document.createElement('div');
    div.className = 'friend-item';
    div.setAttribute('data-user-id', userId); // Добавляем атрибут для идентификации элемента
    
    const avatar = document.createElement('div');
    avatar.className = 'friend-avatar';
    if (user.photoURL) {
        avatar.innerHTML = `<img src="${user.photoURL}" alt="${user.name}">`;
    } else {
        // Создаем аватар с первой буквой имени, если нет фото
        const img = document.createElement('div');
        img.className = 'avatar-placeholder';
        img.textContent = user.name.charAt(0).toUpperCase();
        img.style.display = 'flex';
        img.style.alignItems = 'center';
        img.style.justifyContent = 'center';
        img.style.backgroundColor = '#3f51b5';
        img.style.color = 'white';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.borderRadius = '50%';
        img.style.fontSize = '24px';
        avatar.appendChild(img);
    }
    
    const info = document.createElement('div');
    info.className = 'friend-info';
    info.innerHTML = `<div class="friend-name">${user.name}</div>`;
    
    const actions = document.createElement('div');
    actions.className = 'friend-actions';
    
    if (type === 'friend') {
        // Показываем кнопку удаления только если пользователь просматривает свой профиль
        if (currentProfileId === currentUserData.numericId.toString()) {
            const removeBtn = document.createElement('button');
            removeBtn.className = 'friend-action-btn friend-remove';
            removeBtn.innerHTML = '<i class="fas fa-user-minus"></i>';
            removeBtn.title = 'Удалить из друзей';
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                console.log('Удаление из друзей:', userId);
                await removeFriend(userId);
            });
            actions.appendChild(removeBtn);
        }
    } else if (type === 'request') {
        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'friend-action-btn friend-accept';
        acceptBtn.innerHTML = '<i class="fas fa-check"></i>';
        acceptBtn.title = 'Принять заявку';
        acceptBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('Принятие заявки от:', userId);
            await acceptFriendRequest(userId);
        });
        
        const declineBtn = document.createElement('button');
        declineBtn.className = 'friend-action-btn friend-decline';
        declineBtn.innerHTML = '<i class="fas fa-times"></i>';
        declineBtn.title = 'Отклонить заявку';
        declineBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('Отклонение заявки от:', userId);
            await cancelFriendRequest(userId);
        });
        
        actions.appendChild(acceptBtn);
        actions.appendChild(declineBtn);
    }
    
    div.appendChild(avatar);
    div.appendChild(info);
    div.appendChild(actions);
    
    div.addEventListener('click', (e) => {
        // Проверяем, что клик был не по кнопке действия
        if (!e.target.closest('.friend-action-btn')) {
            const modal = document.getElementById('friendsModal');
            if (modal) {
                modal.style.display = 'none';
            }
            window.location.href = `profile.html?id=${user.numericId}`;
        }
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
                
                const modalRequestsCount = document.getElementById('modalRequestsCount');
                
                if (requestsCount > 0) {
                    modalRequestsCount.textContent = requestsCount;
                    modalRequestsCount.style.display = 'flex';
                } else {
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
        const modalRequestsCount = document.getElementById('modalRequestsCount');
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
            
            const modalRequestsCount = document.getElementById('modalRequestsCount');
            
            if (requestsCount > 0) {
                modalRequestsCount.textContent = requestsCount;
                modalRequestsCount.style.display = 'flex';
            } else {
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
        
        // Скрываем все сообщения об отсутствии элементов
        const modalBody = document.querySelector('.friends-modal-body');
        const existingNoFriends = modalBody.querySelector('.no-friends');
        const existingNoRequests = modalBody.querySelector('.no-requests');
        
        if (existingNoFriends) existingNoFriends.style.display = 'none';
        if (existingNoRequests) existingNoRequests.style.display = 'none';

        // Перезагружаем списки
        await loadFriendsList();
        await loadRequestsList();
        updateFriendRequestsCounter();

        // После успешного принятия заявки обновляем превью друзей
        await loadFriendsPreview();

        // Показываем уведомление об успехе
        if (typeof window.showSuccess === 'function') {
            window.showSuccess('Заявка в друзья принята!');
        }
    } catch (error) {
        console.error('Ошибка при принятии заявки:', error);
        if (typeof window.showError === 'function') {
            window.showError('Произошла ошибка при принятии заявки');
        }
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
        
        // Скрываем все сообщения об отсутствии элементов
        const modalBody = document.querySelector('.friends-modal-body');
        const existingNoFriends = modalBody.querySelector('.no-friends');
        const existingNoRequests = modalBody.querySelector('.no-requests');
        
        if (existingNoFriends) existingNoFriends.style.display = 'none';
        if (existingNoRequests) existingNoRequests.style.display = 'none';
        
        // Обновляем списки и состояние кнопки
        loadFriendsList();
        loadRequestsList();
        updateFriendButtonState();

        // Показываем уведомление об успехе
        if (typeof window.showSuccess === 'function') {
            window.showSuccess('Заявка в друзья отклонена');
        }
    } catch (error) {
        console.error('Ошибка при отмене заявки:', error);
        if (typeof window.showError === 'function') {
            window.showError('Произошла ошибка при отмене заявки');
        }
    }
}

// Добавим функцию для создания кнопки отмены удаления (устаревшая функция)
function createUndoButton(friendElement, userId, originalActions) {
    console.log('Функция createUndoButton устарела и будет удалена в будущих версиях');
    return originalActions;
}

// Обновим функцию removeFriend
async function removeFriend(userId) {
    console.log('Запрос на удаление из друзей пользователя:', userId);
    
    // Проверяем, что пользователь удаляет друга из своего собственного профиля
    if (currentProfileId !== currentUserData.numericId.toString()) {
        console.error('Нет прав для удаления друга с чужого профиля');
        if (typeof window.showError === 'function') {
            window.showError('У вас нет прав для удаления этого друга');
        }
        return;
    }
    
    // Сохраняем ID пользователя для удаления
    userToDeleteId = userId;
    
    // Показываем модальное окно подтверждения
    const confirmModal = document.getElementById('confirmDeleteModal');
    if (confirmModal) {
        confirmModal.style.display = 'flex';
        
        // Настраиваем обработчики для кнопок
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const cancelBtn = document.getElementById('cancelDeleteBtn');
        
        // Удаляем предыдущие обработчики, если они были
        confirmBtn.removeEventListener('click', handleConfirmDelete);
        cancelBtn.removeEventListener('click', handleCancelDelete);
        
        // Добавляем новые обработчики
        confirmBtn.addEventListener('click', handleConfirmDelete);
        cancelBtn.addEventListener('click', handleCancelDelete);
    } else {
        console.error('Модальное окно подтверждения не найдено');
        // Резервный вариант - удаляем без подтверждения
        await finalizeRemoveFriend(userId);
    }
}

// Обработчик подтверждения удаления
async function handleConfirmDelete() {
    // Закрываем модальное окно
    const confirmModal = document.getElementById('confirmDeleteModal');
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }
    
    // Удаляем друга, если ID был сохранен
    if (userToDeleteId) {
        await finalizeRemoveFriend(userToDeleteId);
        
        // Находим и удаляем элемент друга из DOM, если он существует
        const friendElement = document.querySelector(`.friend-item[data-user-id="${userToDeleteId}"]`);
        if (friendElement) {
            friendElement.remove();
        }
        
        userToDeleteId = null;
    }
}

// Обработчик отмены удаления
function handleCancelDelete() {
    // Закрываем модальное окно
    const confirmModal = document.getElementById('confirmDeleteModal');
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }
    
    // Сбрасываем ID пользователя для удаления
    userToDeleteId = null;
}

// Функция для окончательного удаления друга
async function finalizeRemoveFriend(userId) {
    // Проверяем, что пользователь удаляет друга из своего собственного профиля
    if (currentProfileId !== currentUserData.numericId.toString()) {
        console.error('Нет прав для удаления друга с чужого профиля');
        if (typeof window.showError === 'function') {
            window.showError('У вас нет прав для удаления этого друга');
        }
        return;
    }
    
    const db = getDatabase();
    try {
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${userId}`] = null;
        updates[`friendships/${userId}/${currentUserData.numericId}`] = null;

        await update(ref(db), updates);
        await loadFriendsPreview();
        
        if (typeof window.showSuccess === 'function') {
            window.showSuccess('Пользователь удален из друзей');
        }
    } catch (error) {
        console.error('Ошибка при удалении из друзей:', error);
        if (typeof window.showError === 'function') {
            window.showError('Произошла ошибка при удалении из друзей');
        }
    }
}

// Функция для восстановления дружбы (теперь используется только для совместимости)
async function restoreFriendship(userId) {
    const db = getDatabase();
    const timestamp = Date.now();
    
    try {
        const updates = {};
        updates[`friendships/${currentUserData.numericId}/${userId}`] = {
            status: 'friends',
            timestamp: timestamp
        };
        updates[`friendships/${userId}/${currentUserData.numericId}`] = {
            status: 'friends',
            timestamp: timestamp
        };

        await update(ref(db), updates);
        if (typeof window.showSuccess === 'function') {
            window.showSuccess('Друг восстановлен');
        }
    } catch (error) {
        console.error('Ошибка при восстановлении дружбы:', error);
        if (typeof window.showError === 'function') {
            window.showError('Произошла ошибка при восстановлении дружбы');
        }
    }
}

// Обновим функцию loadFriendsPreview
async function loadFriendsPreview() {
    const db = getDatabase();
    const previewGrid = document.getElementById('friendsPreviewGrid');
    const previewContainer = document.querySelector('.friends-preview-container');
    const friendsCountElement = document.querySelector('.friends-count');
    const MAX_PREVIEW_FRIENDS = 6;
    
    if (!previewGrid || !friendsCountElement || !previewContainer) return;
    
    try {
        previewGrid.innerHTML = '';
        
        // Удаляем предыдущее сообщение о пустом списке, если оно есть
        const existingMessage = previewContainer.querySelector('.no-friends-message');
        if (existingMessage) {
            existingMessage.remove();
        }
        
        // Получаем данные о друзьях
        const friendshipsRef = ref(db, `friendships/${currentProfileId}`);
        const snapshot = await get(friendshipsRef);

        // Получаем данные о заявках в друзья (только для своего профиля)
        let requestsCount = 0;
        if (currentProfileId === currentUserData.numericId.toString()) {
            const friendships = snapshot.exists() ? snapshot.val() : {};
            requestsCount = Object.values(friendships)
                .filter(data => data && data.status === 'pending_received')
                .length;
        }

        if (snapshot.exists()) {
            const friendships = snapshot.val();
            const confirmedFriends = Object.entries(friendships)
                .filter(([_, data]) => data && data.status === 'friends')
                .sort((a, b) => b[1].timestamp - a[1].timestamp);

            // Обновляем счетчик друзей с учетом заявок
            if (requestsCount > 0) {
                friendsCountElement.innerHTML = `${confirmedFriends.length} <span class="friends-requests-count">(+${requestsCount})</span>`;
            } else {
                friendsCountElement.textContent = confirmedFriends.length;
            }

            // Берем только первые 6 друзей
            const previewFriends = confirmedFriends.slice(0, MAX_PREVIEW_FRIENDS);

            if (previewFriends.length > 0) {
                // Отображаем грид если есть друзья
                previewGrid.style.display = 'grid';
                
                const userRef = ref(db, 'users');
                const usersSnapshot = await get(userRef);
                
                if (usersSnapshot.exists()) {
                    const users = usersSnapshot.val();
                    
                    for (const [friendId, _] of previewFriends) {
                        const friend = Object.values(users).find(user => user.numericId === parseInt(friendId));
                        if (friend) {
                            const friendElement = createFriendPreviewElement(friend);
                            previewGrid.appendChild(friendElement);
                        }
                    }
                }
            } else {
                // Скрываем грид и показываем сообщение вне его
                previewGrid.style.display = 'none';
                const noFriendsMessage = document.createElement('div');
                noFriendsMessage.className = 'no-friends-message';
                noFriendsMessage.innerHTML = '<i class="far fa-sad-tear"></i><span>Список друзей пуст</span>';
                previewContainer.appendChild(noFriendsMessage);
            }
        } else {
            // Если нет друзей, но есть заявки
            if (requestsCount > 0) {
                friendsCountElement.innerHTML = `0 <span class="friends-requests-count">(+${requestsCount})</span>`;
            } else {
                friendsCountElement.textContent = '0';
            }
            
            // Скрываем грид и показываем сообщение вне его
            previewGrid.style.display = 'none';
            const noFriendsMessage = document.createElement('div');
            noFriendsMessage.className = 'no-friends-message';
            noFriendsMessage.innerHTML = '<i class="far fa-sad-tear"></i><span>Список друзей пуст</span>';
            previewContainer.appendChild(noFriendsMessage);
        }
    } catch (error) {
        console.error('Ошибка при загрузке превью друзей:', error);
        
        // В случае ошибки также скрываем грид и показываем сообщение об ошибке
        previewGrid.style.display = 'none';
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = 'Ошибка при загрузке списка друзей';
        previewContainer.appendChild(errorMessage);
    }

    // Добавим вызов функции обновления статусов
    updateAllFriendsStatuses();
}

// Функция создания превью элемента друга
function createFriendPreviewElement(user) {
    const div = document.createElement('div');
    div.className = 'friend-preview-item';
    div.setAttribute('data-friend-id', user.numericId); // Добавляем идентификатор друга как атрибут
    
    const avatar = document.createElement('div');
    avatar.className = 'friend-preview-avatar';
    avatar.setAttribute('data-status', 'offline'); // Устанавливаем начальный статус как оффлайн
    
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
    
    // Получаем и обновляем статус пользователя
    updateFriendStatus(user.numericId, avatar);
    
    return div;
}

// Функция для обновления статуса друга
function updateFriendStatus(numericId, avatarElement) {
    const db = getDatabase();
    
    // Сначала находим userId по numericId
    const usersRef = ref(db, 'users');
    get(usersRef).then((snapshot) => {
        if (snapshot.exists()) {
            const users = snapshot.val();
            let userId = null;
            
            // Ищем пользователя с нужным numericId
            for (const [id, userData] of Object.entries(users)) {
                if (userData.numericId === parseInt(numericId)) {
                    userId = id;
                    break;
                }
            }
            
            if (userId) {
                // Получаем статус пользователя
                const statusRef = ref(db, `status/${userId}`);
                onValue(statusRef, (statusSnapshot) => {
                    if (statusSnapshot.exists()) {
                        const statusData = statusSnapshot.val();
                        // Обновляем атрибут data-status
                        avatarElement.setAttribute('data-status', statusData.state || 'offline');
                        
                        // Если пользователь установил статус "невидимка", показываем как "оффлайн"
                        if (statusData.preferredStatus === 'invisible') {
                            avatarElement.setAttribute('data-status', 'offline');
                        }
                    } else {
                        // Если статус не найден, устанавливаем "оффлайн"
                        avatarElement.setAttribute('data-status', 'offline');
                    }
                });
            }
        }
    }).catch((error) => {
        console.error("Ошибка при получении данных пользователей:", error);
    });
}

// Функция для обновления статусов всех друзей в списке
function updateAllFriendsStatuses() {
    const friendAvatars = document.querySelectorAll('.friend-preview-avatar');
    friendAvatars.forEach(avatar => {
        const friendItem = avatar.closest('.friend-preview-item');
        if (friendItem) {
            const friendId = friendItem.getAttribute('data-friend-id');
            if (friendId) {
                updateFriendStatus(friendId, avatar);
            }
        }
    });
}

// Добавим функцию для настройки слушателя состояния дружбы
function setupFriendshipStatusListener() {
    if (currentProfileId === currentUserData.numericId.toString()) {
        return; // Не устанавливаем слушатель для своего профиля
    }

    const db = getDatabase();
    const friendshipRef = ref(db, `friendships/${currentUserData.numericId}/${currentProfileId}`);
    
    // Слушаем изменения статуса дружбы
    onValue(friendshipRef, (snapshot) => {
        if (snapshot.exists()) {
            const friendshipData = snapshot.val();
            updateFriendButtonUI(friendshipData.status);
        } else {
            updateFriendButtonUI('none');
        }
    });
}

// Функция для обновления UI кнопки без обращения к базе данных
function updateFriendButtonUI(status) {
	const friendButton = document.getElementById('friendButton');
	const friendButtonText = document.getElementById('friendButtonText');
	const messageButton = document.getElementById('messageButton');
	
	if (!friendButton || !friendButtonText) return;

	switch (status) {
			case 'friends':
					friendButtonText.textContent = 'Удалить из друзей';
					friendButton.querySelector('i').className = 'fas fa-user-minus';
					
					// Показываем кнопку сообщений
					if (messageButton) {
							messageButton.style.display = 'flex';
					}
					break;
			case 'pending_sent':
					friendButtonText.textContent = 'Заявка отправлена';
					friendButton.querySelector('i').className = 'fas fa-user-clock';
					
					// Скрываем кнопку сообщений
					if (messageButton) {
							messageButton.style.display = 'none';
					}
					break;
			case 'pending_received':
					friendButtonText.textContent = 'Принять заявку';
					friendButton.querySelector('i').className = 'fas fa-user-check';
					
					// Скрываем кнопку сообщений
					if (messageButton) {
							messageButton.style.display = 'none';
					}
					break;
			case 'none':
			default:
					friendButtonText.textContent = 'Добавить в друзья';
					friendButton.querySelector('i').className = 'fas fa-user-plus';
					
					// Скрываем кнопку сообщений
					if (messageButton) {
							messageButton.style.display = 'none';
					}
					break;
	}
}


// Обновим функцию setupFriendsListListener
function setupFriendsListListener() {
    const db = getDatabase();
    const friendshipsRef = ref(db, `friendships/${currentProfileId}`);
    
    // Слушаем изменения в списке друзей просматриваемого профиля
    onValue(friendshipsRef, (snapshot) => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return; // Пропускаем первое срабатывание
        }
        
        console.log('Обнаружены изменения в списке друзей');
        // Обновляем превью и полный список друзей
        loadFriendsPreview();
        
        // Если открыто модальное окно и активна вкладка друзей, обновляем список
        const modal = document.getElementById('friendsModal');
        const friendsTab = document.querySelector('.friends-tab[data-tab="friends"]');
        if (modal && modal.style.display === 'block' && friendsTab && friendsTab.classList.contains('active')) {
            loadFriendsList();
        }
    });
}

// Добавим функцию для настройки слушателя заявок в друзья
function setupRequestsListener() {
    const db = getDatabase();
    const friendshipsRef = ref(db, `friendships/${currentUserData.numericId}`);
    
    // Устанавливаем флаг инициализации слушателя уведомлений
    isFriendRequestNotificationsInitialized = true;
    console.log('Слушатель уведомлений о заявках в друзья инициализирован через setupRequestsListener');
    
    // Для отслеживания новых заявок в друзья
    let previousRequests = new Set();
    let isFirstLoad = true;
    
    // Слушаем изменения в списке заявок
    onValue(friendshipsRef, async (snapshot) => {
        // Проверяем, открыто ли модальное окно и активна ли вкладка заявок
        const modal = document.getElementById('friendsModal');
        const requestsTab = document.querySelector('.friends-tab[data-tab="requests"]');
        
        if (modal && 
            modal.style.display === 'block' && 
            requestsTab && 
            requestsTab.classList.contains('active')) {
            console.log('Обнаружены изменения в списке заявок, обновляем список');
            loadRequestsList();
        }
        
        // Обновляем счетчик заявок и проверяем новые заявки
        if (snapshot.exists()) {
            const friendships = snapshot.val();
            
            // Фильтруем заявки
            const pendingRequests = Object.entries(friendships)
                .filter(([_, data]) => data && data.status === 'pending_received')
                .map(([userId, _]) => userId);
            
            const requestsCount = pendingRequests.length;
            
            const modalRequestsCount = document.getElementById('modalRequestsCount');
            
            if (requestsCount > 0) {
                modalRequestsCount.textContent = requestsCount;
                modalRequestsCount.style.display = 'flex';
                
                // Проверяем новые заявки (не при первой загрузке)
                if (!isFirstLoad) {
                    // Находим новые заявки, которых не было ранее
                    const newRequests = pendingRequests.filter(userId => !previousRequests.has(userId));
                    
                    // Для каждой новой заявки показываем уведомление
                    if (newRequests.length > 0) {
                        const usersRef = ref(db, 'users');
                        const usersSnapshot = await get(usersRef);
                        
                        if (usersSnapshot.exists()) {
                            const users = usersSnapshot.val();
                            
                            for (const userId of newRequests) {
                                // Находим пользователя по numericId
                                const sender = Object.values(users).find(user => user.numericId.toString() === userId);
                                
                                if (sender) {
                                    // Показываем уведомление
                                    showFriendRequestNotification(sender);
                                }
                            }
                        }
                    }
                }
            } else {
                modalRequestsCount.style.display = 'none';
            }
            
            // Обновляем предыдущий список заявок
            previousRequests = new Set(pendingRequests);
        }
        
        // После первой загрузки сбрасываем флаг
        isFirstLoad = false;
    });
}

// Функция для инициализации отслеживания заявок в друзья для использования в sidebar
export function initializeFriendRequestsNotifications() {
    // Проверяем, не был ли уже инициализирован слушатель
    if (isFriendRequestNotificationsInitialized) {
        console.log('Слушатель уведомлений о заявках в друзья уже инициализирован');
        return;
    }
    
    // Проверяем, находимся ли мы на странице профиля
    const isProfilePage = window.location.pathname.includes('profile.html');
    
    // Если мы на странице профиля, не инициализируем слушатель здесь,
    // так как он будет инициализирован через функцию setupRequestsListener
    if (isProfilePage) {
        console.log('Страница профиля: используем существующий слушатель заявок в друзья');
        return;
    }
    
    // Получаем данные текущего пользователя
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.numericId) {
        console.error('Пользователь не авторизован, невозможно отслеживать заявки в друзья');
        return;
    }

    const db = getDatabase();
    const friendshipsRef = ref(db, `friendships/${userData.numericId}`);
    
    // Для отслеживания новых заявок в друзья
    let previousRequests = new Set();
    let isFirstLoad = true;
    
    // Слушаем изменения в списке заявок
    onValue(friendshipsRef, async (snapshot) => {
        // Обновляем счетчик заявок и проверяем новые заявки
        if (snapshot.exists()) {
            const friendships = snapshot.val();
            
            // Фильтруем заявки
            const pendingRequests = Object.entries(friendships)
                .filter(([_, data]) => data && data.status === 'pending_received')
                .map(([userId, _]) => userId);
            
            const requestsCount = pendingRequests.length;
            
            // Обновляем счетчик в шапке (если он есть)
            const modalRequestsCount = document.getElementById('modalRequestsCount');
            if (modalRequestsCount) {
                if (requestsCount > 0) {
                    modalRequestsCount.textContent = requestsCount;
                    modalRequestsCount.style.display = 'flex';
                } else {
                    modalRequestsCount.style.display = 'none';
                }
            }
                
            // Проверяем новые заявки (не при первой загрузке)
            if (!isFirstLoad) {
                // Находим новые заявки, которых не было ранее
                const newRequests = pendingRequests.filter(userId => !previousRequests.has(userId));
                
                // Для каждой новой заявки показываем уведомление
                if (newRequests.length > 0) {
                    const usersRef = ref(db, 'users');
                    const usersSnapshot = await get(usersRef);
                    
                    if (usersSnapshot.exists()) {
                        const users = usersSnapshot.val();
                        
                        for (const userId of newRequests) {
                            // Находим пользователя по numericId
                            const sender = Object.values(users).find(user => user.numericId.toString() === userId);
                            
                            if (sender) {
                                // Показываем уведомление
                                showFriendRequestNotification(sender);
                            }
                        }
                    }
                }
            }
            
            // Обновляем предыдущий список заявок
            previousRequests = new Set(pendingRequests);
        }
        
        // После первой загрузки сбрасываем флаг
        isFirstLoad = false;
    });
    
    // Устанавливаем флаг инициализации
    isFriendRequestNotificationsInitialized = true;
    console.log('Слушатель уведомлений о заявках в друзья инициализирован');
} 