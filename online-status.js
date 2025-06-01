/**
 * Система онлайна/оффлайна пользователей
 * Работает с Firebase Realtime Database для отслеживания статуса пользователей в реальном времени
 */

// Инициализация системы онлайн/оффлайн статуса
function initializeOnlineStatus() {
  // Импортируем необходимые функции Firebase
  import('https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js').then((firebaseApp) => {
    import('https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js').then((firebaseAuth) => {
      import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js').then((firebaseDb) => {
        setupOnlineStatus(firebaseApp, firebaseAuth, firebaseDb);
      });
    });
  });
}

// Хранилище для таймеров обновления статуса
const statusTimers = new Map();

// Перечисление доступных статусов
const UserStatus = {
  ONLINE: 'online',
  AWAY: 'away',
  INVISIBLE: 'invisible',
  OFFLINE: 'offline',
  DO_NOT_DISTURB: 'do_not_disturb'
};

// Пользовательские настройки статуса
let userStatusSettings = {
  preferredStatus: UserStatus.ONLINE, // Статус по умолчанию
  lastOnlineTimestamp: null // Время последнего реального пребывания онлайн
};

// Флаг для предотвращения мигания статуса при загрузке
let isInitialStatusLoad = true;

// Хранение последней активности пользователя
let lastActivityTimestamp = Date.now();

// Основная функция настройки онлайн-статуса
function setupOnlineStatus(firebaseApp, firebaseAuth, firebaseDb) {
  const { initializeApp } = firebaseApp;
  const { getAuth, onAuthStateChanged } = firebaseAuth;
  const { getDatabase, ref, onValue, onDisconnect, set, serverTimestamp, get, remove } = firebaseDb;

  // Firebase конфигурация (берем из глобальной переменной, если она доступна)
  const firebaseConfig = window.firebaseConfig || {
    apiKey: "AIzaSyCPQajYeeRG-GyQHhwlZ08nI5-BT36XpaU",
    authDomain: "ochat-9cfc9.firebaseapp.com",
    databaseURL: "https://ochat-9cfc9-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "ochat-9cfc9",
    storageBucket: "ochat-9cfc9.appspot.com",
    messagingSenderId: "190209379577",
    appId: "1:190209379577:web:a57171ab4b1f55a49f6628",
    measurementId: "G-KNRXS2ZKZ9"
  };

  // Инициализируем Firebase, если не инициализирован ранее
  const app = window.firebaseApp || initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);

  // Подключаемся к состоянию соединения Firebase
  const connectedRef = ref(db, '.info/connected');

  // Определяем ID профиля из URL
  const urlParams = new URLSearchParams(window.location.search);
  const numericId = urlParams.get('id');

  // Функция для создания индикатора статуса
  function createStatusIndicator() {
    // Создаем контейнер для имени и статуса
    const nameStatusContainer = document.createElement('div');
    nameStatusContainer.className = 'name-status-container';
    nameStatusContainer.style.display = 'flex';
    nameStatusContainer.style.alignItems = 'center';
    nameStatusContainer.style.gap = '10px';

    // Создаем элемент индикатора
    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'online-status-indicator';
    statusIndicator.innerHTML = `
      <span class="status-dot offline"></span>
      <span class="status-text">оффлайн</span>
      <span class="status-dropdown-icon">▼</span>
    `;

    // Находим элемент profile-name
    const profileName = document.getElementById('profile-name');
    
    if (profileName) {
      // Получаем родителя profile-name
      const parent = profileName.parentNode;
      
      // Создаем обертку и добавляем в нее имя профиля и индикатор
      nameStatusContainer.appendChild(profileName.cloneNode(true));
      nameStatusContainer.appendChild(statusIndicator);
      
      // Заменяем оригинальный profile-name на новый контейнер
      parent.replaceChild(nameStatusContainer, profileName);
    }

    return statusIndicator;
  }

  // Создаем и отображаем меню выбора статуса
  function createStatusMenu(statusIndicator, userId) {
    // Проверяем, что это наш профиль (сравниваем userId с текущим пользователем)
    if (!currentUser || currentUser.uid !== userId) {
      // Скрываем иконку выпадающего списка для чужих профилей
      const dropdownIcon = statusIndicator.querySelector('.status-dropdown-icon');
      if (dropdownIcon) {
        dropdownIcon.style.display = 'none';
      }
      return;
    }

    // Добавляем класс, чтобы показать, что статус можно изменить
    statusIndicator.classList.add('interactive');
    
    // Показываем иконку выпадающего списка
    const dropdownIcon = statusIndicator.querySelector('.status-dropdown-icon');
    if (dropdownIcon) {
      dropdownIcon.style.display = 'inline-block';
    }
    
    // Добавляем подсказку при наведении
    statusIndicator.title = 'Нажмите, чтобы изменить статус';
    
    // Обработчик клика по индикатору статуса
    statusIndicator.addEventListener('click', (event) => {
      event.stopPropagation();
      
      // Удаляем существующее меню, если оно уже открыто
      const existingMenu = document.querySelector('.status-menu');
      if (existingMenu) {
        existingMenu.remove();
        return;
      }
      
      // Создаем меню выбора статуса
      const statusMenu = document.createElement('div');
      statusMenu.className = 'status-menu';
      
      // Добавляем опции в меню
      const options = [
        { value: UserStatus.ONLINE, text: 'Онлайн', icon: 'online' },
        { value: UserStatus.AWAY, text: 'Отошел', icon: 'away' },
        { value: UserStatus.DO_NOT_DISTURB, text: 'Не беспокоить', icon: 'dnd' },
        { value: UserStatus.INVISIBLE, text: 'Невидимка', icon: 'offline' }
      ];
      
      options.forEach(option => {
        const menuItem = document.createElement('div');
        menuItem.className = 'status-menu-item';
        menuItem.innerHTML = `
          <span class="status-dot ${option.icon}"></span>
          <span>${option.text}</span>
        `;
        
        // Добавляем класс active к выбранному статусу
        if (userStatusSettings.preferredStatus === option.value) {
          menuItem.classList.add('active');
        }
        
        // Обработчик выбора статуса
        menuItem.addEventListener('click', () => {
          setPreferredStatus(option.value);
          statusMenu.remove();
          
          // Обновляем статус пользователя
          updateUserStatus(userId, document.visibilityState === 'visible');
        });
        
        statusMenu.appendChild(menuItem);
      });
      
      // Позиционируем меню рядом с индикатором
      const rect = statusIndicator.getBoundingClientRect();
      statusMenu.style.position = 'absolute';
      statusMenu.style.top = `${rect.bottom + window.scrollY}px`;
      statusMenu.style.left = `${rect.left + window.scrollX}px`;
      
      // Добавляем меню на страницу
      document.body.appendChild(statusMenu);
      
      // Добавляем класс, указывающий что меню открыто
      statusIndicator.classList.add('menu-open');
      
      // Закрываем меню при клике вне его
      const closeMenu = (e) => {
        if (!statusMenu.contains(e.target) && !statusIndicator.contains(e.target)) {
          statusMenu.remove();
          statusIndicator.classList.remove('menu-open');
          document.removeEventListener('click', closeMenu);
        }
      };
      
      // Используем setTimeout, чтобы обработчик не сработал сразу
      setTimeout(() => {
        document.addEventListener('click', closeMenu);
      }, 0);
    });
  }

  // Обновляем метку времени последней активности
  function updateLastActivity() {
    lastActivityTimestamp = Date.now();
  }

  // Функция установки предпочтительного статуса
  function setPreferredStatus(status) {
    const previousStatus = userStatusSettings.preferredStatus;
    userStatusSettings.preferredStatus = status;
    
    // Сохраняем выбранный статус в localStorage
    localStorage.setItem('userStatusSettings', JSON.stringify(userStatusSettings));
    
    if (currentUser) {
      const userStatusRef = ref(db, `status/${currentUser.uid}`);
      
      if (status === UserStatus.INVISIBLE) {
        // Если пользователь переключается в режим "невидимка"
        
        // Получаем текущий статус, чтобы сохранить timestamp
        get(userStatusRef).then((snapshot) => {
          if (snapshot.exists()) {
            const currentStatus = snapshot.val();
            
            // Сохраняем текущее время последнего пребывания онлайн
            if (currentStatus.state === UserStatus.ONLINE || currentStatus.state === UserStatus.AWAY) {
              // Если пользователь был онлайн или отошел, сохраняем текущее время
              userStatusSettings.lastOnlineTimestamp = currentStatus.last_changed;
            } else if (currentStatus.state === UserStatus.OFFLINE) {
              // Если пользователь был оффлайн, сохраняем его последнее время оффлайна
              userStatusSettings.lastOnlineTimestamp = currentStatus.last_changed;
            }
            
            // Сохраняем обновленные настройки в localStorage
            localStorage.setItem('userStatusSettings', JSON.stringify(userStatusSettings));
            
            // Устанавливаем статус "оффлайн" с сохраненным временем
            set(userStatusRef, {
              state: UserStatus.OFFLINE,
              last_changed: userStatusSettings.lastOnlineTimestamp || serverTimestamp(),
              preferredStatus: UserStatus.INVISIBLE
            });
          } else {
            // Если статуса еще нет, создаем новый
            set(userStatusRef, {
              state: UserStatus.OFFLINE,
              last_changed: serverTimestamp(),
              preferredStatus: UserStatus.INVISIBLE
            });
          }
          
          // Отменяем обработчик отключения, чтобы сохранить статус невидимки
          onDisconnect(userStatusRef).cancel();
        });
      } else if (previousStatus === UserStatus.INVISIBLE && status !== UserStatus.INVISIBLE) {
        // Если пользователь выходит из режима "невидимка", сбрасываем сохраненное время
        userStatusSettings.lastOnlineTimestamp = null;
        localStorage.setItem('userStatusSettings', JSON.stringify(userStatusSettings));
        
        // Обновляем статус с учетом новых настроек
        updateUserStatus(currentUser.uid, document.visibilityState === 'visible');
      } else {
        // Для других изменений статуса
        updateUserStatus(currentUser.uid, document.visibilityState === 'visible');
      }
    }
  }

  // Загружаем сохраненные настройки статуса
  function loadStatusSettings() {
    const savedSettings = localStorage.getItem('userStatusSettings');
    if (savedSettings) {
      try {
        userStatusSettings = JSON.parse(savedSettings);
      } catch (e) {
        console.error('Ошибка при загрузке настроек статуса:', e);
      }
    }
  }

  // Отслеживание видимости страницы для определения статуса "отошел"
  let isPageVisible = true;
  let currentUser = null;

  // Обработчик события изменения видимости страницы
  document.addEventListener('visibilitychange', () => {
    isPageVisible = document.visibilityState === 'visible';
    if (currentUser) {
      // Обновляем статус пользователя при изменении видимости страницы
      updateUserStatus(currentUser.uid, isPageVisible);
    }
  });

  // Функция для обновления статуса пользователя
  function updateUserStatus(userId, isActive) {
    if (!userId) return;

    // Обновляем время последней активности
    updateLastActivity();

    const userStatusRef = ref(db, `status/${userId}`);
    
    // Если пользователь выбрал режим "невидимка", всегда показываем его как оффлайн
    // и используем сохраненное время последнего пребывания онлайн
    if (userStatusSettings.preferredStatus === UserStatus.INVISIBLE) {
      // Получаем текущий статус, чтобы проверить, нужно ли обновлять
      get(userStatusRef).then((snapshot) => {
        // Если статус уже существует и это режим невидимки, не обновляем время
        if (snapshot.exists() && snapshot.val().preferredStatus === UserStatus.INVISIBLE) {
          // Ничего не делаем, чтобы сохранить существующее время
          return;
        }
        
        // Устанавливаем статус "оффлайн" с сохраненным временем
        set(userStatusRef, {
          state: UserStatus.OFFLINE,
          last_changed: userStatusSettings.lastOnlineTimestamp || serverTimestamp(),
          preferredStatus: UserStatus.INVISIBLE
        });
        
        // Отменяем обработчик отключения
        onDisconnect(userStatusRef).cancel();
      });
      return;
    }
    
    // Если пользователь выбрал режим "отошел", всегда показываем его как отошедшего
    if (userStatusSettings.preferredStatus === UserStatus.AWAY) {
      // Слушаем состояние соединения и обновляем статус
      onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val();
        if (connected) {
          // Устанавливаем статус отошел только если соединение установлено
          const status = {
            state: UserStatus.AWAY,
            last_changed: serverTimestamp(),
            preferredStatus: UserStatus.AWAY
          };
          
          set(userStatusRef, status);
          
          // Настраиваем обработчик отключения - при выходе статус меняется на оффлайн
          // но добавляем метку времени последнего закрытия
          onDisconnect(userStatusRef).set({
            state: UserStatus.OFFLINE,
            last_changed: serverTimestamp(),
            preferredStatus: UserStatus.AWAY,
            disconnectedAt: serverTimestamp()
          });
        }
      }, { onlyOnce: false });
      
      return;
    }
    
    // Если пользователь выбрал режим "не беспокоить", всегда показываем этот статус
    if (userStatusSettings.preferredStatus === UserStatus.DO_NOT_DISTURB) {
      // Слушаем состояние соединения и обновляем статус
      onValue(connectedRef, (snapshot) => {
        const connected = snapshot.val();
        if (connected) {
          // Устанавливаем статус "не беспокоить" только если соединение установлено
          const status = {
            state: UserStatus.DO_NOT_DISTURB,
            last_changed: serverTimestamp(),
            preferredStatus: UserStatus.DO_NOT_DISTURB
          };
          
          set(userStatusRef, status);
          
          // Настраиваем обработчик отключения - при выходе статус меняется на оффлайн
          onDisconnect(userStatusRef).set({
            state: UserStatus.OFFLINE,
            last_changed: serverTimestamp(),
            preferredStatus: UserStatus.DO_NOT_DISTURB
          });
        }
      }, { onlyOnce: false });
      
      return;
    }
    
    // Обычная логика обновления статуса
    if (isActive === true) {
      // Пользователь онлайн и активен
      const status = {
        state: UserStatus.ONLINE,
        last_changed: serverTimestamp(),
        preferredStatus: userStatusSettings.preferredStatus
      };
      
      set(userStatusRef, status);
      
      // Настраиваем обработчик отключения
      onDisconnect(userStatusRef).set({
        state: UserStatus.OFFLINE,
        last_changed: serverTimestamp()
      });
    } else if (isActive === false) {
      // Пользователь онлайн, но неактивен (свернул страницу)
      const status = {
        state: UserStatus.AWAY,
        last_changed: serverTimestamp(),
        preferredStatus: userStatusSettings.preferredStatus
      };
      
      set(userStatusRef, status);
      
      // Сохраняем обработчик отключения
      onDisconnect(userStatusRef).set({
        state: UserStatus.OFFLINE,
        last_changed: serverTimestamp()
      });
    } else {
      // Пользователь оффлайн (явный выход)
      set(userStatusRef, {
        state: UserStatus.OFFLINE,
        last_changed: serverTimestamp()
      });
    }
  }

  // Функция для проверки и обработки восстановления после перезагрузки страницы
  function handlePageReload(userId) {
    if (!userId) return;
    
    // Получаем ссылку на статус пользователя
    const userStatusRef = ref(db, `status/${userId}`);
    
    // Проверяем текущий статус
    get(userStatusRef).then((snapshot) => {
      if (snapshot.exists()) {
        const status = snapshot.val();
        
        // Если статус был "отошел" и время отключения менее 5 секунд назад,
        // то это, вероятно, перезагрузка страницы, а не полный выход
        if (status.preferredStatus === UserStatus.AWAY && 
            status.disconnectedAt && 
            Date.now() - status.disconnectedAt < 5000) {
          
          // Восстанавливаем статус "отошел"
          set(userStatusRef, {
            state: UserStatus.AWAY,
            last_changed: status.last_changed || serverTimestamp(),
            preferredStatus: UserStatus.AWAY
          });
          
          // Настраиваем обработчик отключения для будущих отключений
          onDisconnect(userStatusRef).set({
            state: UserStatus.OFFLINE,
            last_changed: serverTimestamp(),
            preferredStatus: UserStatus.AWAY,
            disconnectedAt: serverTimestamp()
          });
        }
      }
    });
  }

  // Функция для форматирования времени "был в сети"
  function formatLastSeen(timestamp) {
    if (!timestamp) return 'оффлайн';

    const lastSeenTime = new Date(timestamp);
    const now = new Date();
    const diffMs = now - lastSeenTime;

    // Проверяем, что разница не отрицательная (возможно из-за разницы времени сервера и клиента)
    if (diffMs < 0) return 'только что';

    const diffSecs = Math.floor(diffMs / 1000);
    
    if (diffSecs < 60) {
      return `был в сети ${diffSecs} сек. назад`;
    }
    
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
      return `был в сети ${diffMins} мин. назад`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      // Если был в сети сегодня, показываем "был в сети X ч. назад (сегодня в ЧЧ:ММ)"
      const hours = lastSeenTime.getHours().toString().padStart(2, '0');
      const minutes = lastSeenTime.getMinutes().toString().padStart(2, '0');
      return `был в сети ${diffHours} ч. назад (сегодня в ${hours}:${minutes})`;
    }
    
    const diffDays = Math.floor(diffHours / 24);
    // Если был в сети более суток назад, показываем "был в сети X д. назад (ДД.ММ.ГГГГ в ЧЧ:ММ)"
    const day = lastSeenTime.getDate().toString().padStart(2, '0');
    const month = (lastSeenTime.getMonth() + 1).toString().padStart(2, '0'); // +1 потому что месяцы начинаются с 0
    const year = lastSeenTime.getFullYear();
    const hours = lastSeenTime.getHours().toString().padStart(2, '0');
    const minutes = lastSeenTime.getMinutes().toString().padStart(2, '0');
    return `был в сети ${diffDays} д. назад (${day}.${month}.${year} в ${hours}:${minutes})`;
  }

  // Функция для мониторинга статуса пользователя и обновления UI
  function monitorUserStatus(profileUserId) {
    // Создаем индикатор, если он еще не существует
    const statusIndicator = document.querySelector('.online-status-indicator') || createStatusIndicator();
    
    if (!statusIndicator) return;
    
    // Добавляем функциональность выбора статуса, если это наш профиль
    createStatusMenu(statusIndicator, profileUserId);
    
    // Очищаем существующий таймер обновления для этого пользователя, если он есть
    if (statusTimers.has(profileUserId)) {
      clearInterval(statusTimers.get(profileUserId));
      statusTimers.delete(profileUserId);
    }
    
    // Храним последнее известное состояние пользователя
    let lastKnownStatus = null;
    
    // Функция обновления отображения статуса
    function updateStatusDisplay(status) {
      // Если это начальная загрузка и пользователь в режиме "отошел",
      // не показываем временное состояние "оффлайн"
      if (isInitialStatusLoad && status.preferredStatus === UserStatus.AWAY) {
        // Для пользователя, который был "отошел" до перезагрузки,
        // мы сразу показываем статус "отошел"
        status.state = UserStatus.AWAY;
      }
      
      // Сохраняем последнее известное состояние
      lastKnownStatus = status;
      
      // Обновляем UI
      const statusDot = statusIndicator.querySelector('.status-dot');
      const statusText = statusIndicator.querySelector('.status-text');
      
      if (status.state === UserStatus.ONLINE) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'онлайн';
      } else if (status.state === UserStatus.AWAY) {
        statusDot.className = 'status-dot away';
        statusText.textContent = 'отошел';
      } else if (status.state === UserStatus.DO_NOT_DISTURB) {
        statusDot.className = 'status-dot dnd';
        statusText.textContent = 'не беспокоить';
      } else {
        statusDot.className = 'status-dot offline';
        
        if (status.last_changed) {
          statusText.textContent = formatLastSeen(status.last_changed);
        } else {
          statusText.textContent = 'оффлайн';
        }
      }
    }
    
    // Настраиваем слушатель статуса
    const userStatusRef = ref(db, `status/${profileUserId}`);
    onValue(userStatusRef, (snapshot) => {
      const status = snapshot.exists() ? snapshot.val() : { state: UserStatus.OFFLINE };
      
      // Проверяем, есть ли время отключения для режима "отошел"
      if (status.disconnectedAt && status.preferredStatus === UserStatus.AWAY) {
        // Проверяем, как давно пользователь отключился
        const disconnectedTime = new Date(status.disconnectedAt).getTime();
        const currentTime = Date.now();
        const timeSinceDisconnect = currentTime - disconnectedTime;
        
        // Если прошло более 10 секунд с момента отключения, считаем что это был
        // реальный выход с сайта, а не просто перезагрузка страницы
        if (timeSinceDisconnect > 10000) {
          status.state = UserStatus.OFFLINE;
        }
      }
      
      updateStatusDisplay(status);
      
      // После первого обновления статуса сбрасываем флаг начальной загрузки
      isInitialStatusLoad = false;
      
      // Если пользователь оффлайн и у него есть метка времени последнего изменения,
      // устанавливаем таймер для обновления отображения статуса
      if (status.state === UserStatus.OFFLINE && status.last_changed) {
        const timer = setInterval(() => {
          if (lastKnownStatus && lastKnownStatus.state === UserStatus.OFFLINE) {
            const statusText = statusIndicator.querySelector('.status-text');
            statusText.textContent = formatLastSeen(lastKnownStatus.last_changed);
          } else {
            // Если пользователь стал онлайн, останавливаем таймер
            clearInterval(timer);
          }
        }, 6000); // Обновляем каждые 6 секунд
        
        // Сохраняем таймер для возможности его остановки в будущем
        statusTimers.set(profileUserId, timer);
      } else if (status.state === UserStatus.ONLINE || status.state === UserStatus.AWAY) {
        // Если пользователь онлайн или отошел, останавливаем таймер, если он был
        if (statusTimers.has(profileUserId)) {
          clearInterval(statusTimers.get(profileUserId));
          statusTimers.delete(profileUserId);
        }
      }
    });
  }

  // Загружаем сохраненные настройки статуса при инициализации
  loadStatusSettings();

  // Слушатель изменения статуса аутентификации
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
      // Пользователь вошел в систему
      
      // Проверяем, если это перезагрузка страницы при статусе "отошел"
      handlePageReload(user.uid);
      
      // Обновляем статус пользователя в зависимости от настроек
      if (userStatusSettings.preferredStatus === UserStatus.AWAY) {
        // Если пользователь был в режиме "отошел", восстанавливаем его статус
        const userStatusRef = ref(db, `status/${user.uid}`);
        set(userStatusRef, {
          state: UserStatus.AWAY,
          last_changed: serverTimestamp(),
          preferredStatus: UserStatus.AWAY
        });
        
        // Настраиваем обработчик отключения
        onDisconnect(userStatusRef).set({
          state: UserStatus.OFFLINE,
          last_changed: serverTimestamp(),
          preferredStatus: UserStatus.AWAY,
          disconnectedAt: serverTimestamp()
        });
      } else {
        // Обычное обновление статуса
        updateUserStatus(user.uid, isPageVisible);
      }
    } else {
      // Пользователь вышел из системы
      const savedUserData = localStorage.getItem('userData');
      if (savedUserData) {
        try {
          const userData = JSON.parse(savedUserData);
          updateUserStatus(userData.uid, null); // null означает оффлайн
        } catch (e) {
          console.error('Ошибка при обработке сохраненных данных пользователя:', e);
        }
      }
    }
  });

  // Обработчики событий для отслеживания активности пользователя
  document.addEventListener('mousemove', updateLastActivity);
  document.addEventListener('keydown', updateLastActivity);
  document.addEventListener('click', updateLastActivity);
  document.addEventListener('touchstart', updateLastActivity);

  // Находим ID пользователя профиля по numericId
  if (numericId) {
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
      let profileUserId = null;
      
      snapshot.forEach((userSnapshot) => {
        const userData = userSnapshot.val();
        if (userData.numericId === parseInt(numericId)) {
          profileUserId = userSnapshot.key;
        }
      });
      
      if (profileUserId) {
        monitorUserStatus(profileUserId);
      }
    }, { onlyOnce: true }); // Запрашиваем данные только один раз
  }
}

// Добавляем стили для индикатора
function addOnlineStatusStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .name-status-container {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .online-status-indicator {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: var(--text-secondary, #555);
      white-space: nowrap;
      transition: all 0.2s ease;
    }
    
    .online-status-indicator.interactive {
      cursor: pointer;
      position: relative;
      padding: 4px 8px;
      border-radius: 16px;
      border: 1px solid transparent;
      background-color: var(--bg-hover, rgba(0, 0, 0, 0.04));
    }
    
    .online-status-indicator.interactive:hover {
      background-color: var(--bg-hover, rgba(0, 0, 0, 0.08));
      border-color: var(--border-color, #e0e0e0);
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .online-status-indicator.interactive.menu-open {
      background-color: var(--bg-active, rgba(0, 0, 0, 0.1));
      border-color: var(--border-color, #d0d0d0);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
      transform: translateY(0);
    }

    .status-dropdown-icon {
      margin-left: 5px;
      font-size: 10px;
      opacity: 0.6;
      transition: transform 0.2s;
      display: none;
    }
    
    .online-status-indicator.interactive .status-dropdown-icon {
      display: inline-block;
    }
    
    .online-status-indicator.interactive:hover .status-dropdown-icon {
      opacity: 1;
      transform: translateY(2px);
    }
    
    .online-status-indicator.interactive.menu-open .status-dropdown-icon {
      transform: rotate(180deg) translateY(-2px);
      opacity: 1;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      display: inline-block;
    }
    
    .status-dot.online {
      background-color: #4CAF50;
      box-shadow: 0 0 5px rgba(76, 175, 80, 0.5);
    }
    
    .status-dot.away {
      background-color: #FFC107;
      box-shadow: 0 0 5px rgba(255, 193, 7, 0.5);
    }
    
    .status-dot.dnd {
      background-color: #F44336;
      box-shadow: 0 0 5px rgba(244, 67, 54, 0.5);
    }
    
    .status-dot.offline {
      background-color: #9e9e9e;
    }
    
    .status-text {
      font-weight: 400;
    }
    
    /* Общие стили для меню статуса, адаптивные к теме */
    .status-menu {
      background-color: var(--bg-secondary, #ffffff);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 6px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      z-index: 1000;
      overflow: hidden;
      min-width: 150px;
      animation: menu-appear 0.2s ease;
    }
    
    @keyframes menu-appear {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .status-menu-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
      color: var(--text-primary, #333);
    }
    
    .status-menu-item:hover {
      background-color: var(--bg-hover, #f5f5f5);
    }
    
    .status-menu-item.active {
      background-color: var(--bg-active, #e3f2fd);
    }
    
    /* Адаптация к предпочтениям системы (темная тема) */
    @media (prefers-color-scheme: dark) {
      .status-menu {
        background-color: var(--bg-secondary-dark, #2d2d2d);
        border-color: var(--border-color-dark, #444);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      }
      
      .status-menu-item {
        color: var(--text-primary-dark, #e0e0e0);
      }
      
      .status-menu-item:hover {
        background-color: var(--bg-hover-dark, #3d3d3d);
      }
      
      .status-menu-item.active {
        background-color: var(--bg-active-dark, #1a3a5a);
      }
      
      .online-status-indicator {
        color: var(--text-secondary-dark, #bbb);
      }

      .online-status-indicator.interactive {
        background-color: var(--bg-hover-dark, rgba(255, 255, 255, 0.08));
      }
      
      .online-status-indicator.interactive:hover {
        background-color: var(--bg-hover-dark, rgba(255, 255, 255, 0.12));
        border-color: var(--border-color-dark, #555);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }
      
      .online-status-indicator.interactive.menu-open {
        background-color: var(--bg-active-dark, rgba(255, 255, 255, 0.15));
        border-color: var(--border-color-dark, #666);
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
      }
    }
    
    /* Поддержка явных классов темы (для сайтов с переключателем темы) */
    .theme-dark .status-menu {
      background-color: var(--bg-secondary-dark, #2d2d2d);
      border-color: var(--border-color-dark, #444);
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    
    .theme-dark .status-menu-item {
      color: var(--text-primary-dark, #e0e0e0);
    }
    
    .theme-dark .status-menu-item:hover {
      background-color: var(--bg-hover-dark, #3d3d3d);
    }
    
    .theme-dark .status-menu-item.active {
      background-color: var(--bg-active-dark, #1a3a5a);
    }
    
    .theme-dark .online-status-indicator {
      color: var(--text-secondary-dark, #bbb);
    }

    .theme-dark .online-status-indicator.interactive {
      background-color: var(--bg-hover-dark, rgba(255, 255, 255, 0.08));
    }
    
    .theme-dark .online-status-indicator.interactive:hover {
      background-color: var(--bg-hover-dark, rgba(255, 255, 255, 0.12));
      border-color: var(--border-color-dark, #555);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .theme-dark .online-status-indicator.interactive.menu-open {
      background-color: var(--bg-active-dark, rgba(255, 255, 255, 0.15));
      border-color: var(--border-color-dark, #666);
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3);
    }
  `;
  document.head.appendChild(styleElement);
}

// Очистка таймеров при выгрузке страницы
window.addEventListener('beforeunload', () => {
  statusTimers.forEach((timer) => {
    clearInterval(timer);
  });
  statusTimers.clear();
});

// Инициализация системы при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
  addOnlineStatusStyles();
  initializeOnlineStatus();
});

// Экспортируем функцию инициализации для возможности модульного подключения
export { initializeOnlineStatus }; 