import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';

export function initializeSidebar() {
  // Конфигурация Firebase
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
  const db = getDatabase(app);
  const auth = getAuth(app);

  // Добавляем слушатель события storage для синхронизации между вкладками
  window.addEventListener('storage', (event) => {
    if (event.key === 'logout' && event.newValue === 'true') {
      console.log('Logout detected from another tab');
      // Очищаем localStorage и sessionStorage
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isAuthenticated');
      localStorage.removeItem('logout');
      // Перенаправляем на страницу входа
      window.location.href = 'index.html';
    } else if (event.key === 'login' && event.newValue === 'true') {
      console.log('Login detected from another tab');
      // Обновляем страницу для отображения данных пользователя
      window.location.reload();
      // Удаляем флаг login
      localStorage.removeItem('login');
    } else if (event.key === 'userDataUpdate' && event.newValue === 'true') {
      console.log('User data update detected from another tab');
      // Обновляем данные пользователя из Firebase
      updateUserAvatarFromFirebase();
      localStorage.removeItem('userDataUpdate');
    }
  });

  // Функция для обновления аватарки из Firebase
  async function updateUserAvatarFromFirebase() {
    try {
      const userData = JSON.parse(localStorage.getItem('userData'));
      if (userData && userData.uid) {
        const userRef = ref(db, `users/${userData.uid}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
          const firebaseUserData = snapshot.val();
          
          // Проверяем, изменилась ли аватарка
          if (firebaseUserData.photoURL !== userData.photoURL) {
            console.log('Avatar updated in Firebase, updating local data');
            
            // Обновляем локальный userData
            userData.photoURL = firebaseUserData.photoURL;
            localStorage.setItem('userData', JSON.stringify(userData));
            
            // Обновляем отображение аватарки
            updateAvatarDisplay(userData);
          }
        }
      }
    } catch (error) {
      console.error('Error updating avatar from Firebase:', error);
    }
  }

  // Функция для обновления отображения аватарки
  function updateAvatarDisplay(userData) {
    const userAvatar = document.getElementById('user-avatar');
    const miniUserAvatar = document.getElementById('mini-user-avatar');
    const miniUserAvatarPhone = document.getElementById('mini-user-avatar-phone');
    
    if (!userAvatar || !miniUserAvatar || !miniUserAvatarPhone) return;
    
    if (userData.photoURL) {
      // Если есть URL аватарки, отображаем изображение
      userAvatar.innerHTML = `<img src="${userData.photoURL}?t=${new Date().getTime()}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      miniUserAvatar.innerHTML = `<img src="${userData.photoURL}?t=${new Date().getTime()}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      miniUserAvatarPhone.innerHTML = `<img src="${userData.photoURL}?t=${new Date().getTime()}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
      // Если нет URL, используем первую букву email
      const firstLetter = userData.email.charAt(0).toUpperCase();
      userAvatar.innerText = firstLetter;
      miniUserAvatar.innerText = firstLetter;
      miniUserAvatarPhone.innerText = firstLetter;
    }
  }

  // Создаем HTML структуру сайдбара
  const sidebarHTML = `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-content">
        <!-- Полная версия навигации -->
        <nav class="sidebar-nav-full">
          <button id="home-button" class="nav-button" data-tooltip="Главная страница">
            <i class="fas fa-home"></i>
            <span class="button-text">Главная страница</span>
          </button>
          <button id="profile-button" class="nav-button" data-tooltip="Мой профиль">
            <i class="fas fa-user"></i>
            <span class="button-text">Мой профиль</span>
          </button>
          <button id="logout" class="nav-button" data-tooltip="Выйти" style="visibility: hidden;">
            <i class="fas fa-sign-out-alt"></i>
            <span class="button-text">Выйти</span>
          </button>
        </nav>
        
        <!-- Добавляем новый контейнер для профиля -->
        <div class="user-profile-container">
          <div id="user-avatar"></div>
          <p id="user-name"></p>
          
          <!-- Добавляем выпадающее меню -->
          <div class="profile-dropdown">
            <div class="dropdown-section">
              <button class="dropdown-button" id="profile-settings">
                <i class="fas fa-user-cog"></i>
                Настройки профиля
              </button>
            </div>
            
            <!-- Добавляем новый раздел для переключения темы -->
            <div class="dropdown-section">
              <div class="theme-dropdown-container">
                <button class="dropdown-button" id="theme-settings">
                  <i class="fas fa-palette"></i>
                  <span>Выбор темы</span>
                </button>
                <div class="theme-options">
                  <button class="theme-option" id="light-theme">
                    <i class="fas fa-sun"></i>
                    <span>Светлая</span>
                  </button>
                  <button class="theme-option" id="dark-theme">
                    <i class="fas fa-moon"></i>
                    <span>Темная</span>
                  </button>
                  <button class="theme-option" id="system-theme">
                    <i class="fas fa-desktop"></i>
                    <span>Системная</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div class="dropdown-section">
              <button class="dropdown-button danger" id="dropdown-logout">
                <i class="fas fa-sign-out-alt"></i>
                Выйти
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Компактная версия навигации -->
      <nav class="sidebar-nav-compact">
        <button id="home-button-compact" class="nav-button" data-tooltip="Главная страница">
          <i class="fas fa-home"></i>
        </button>
        <div id="mini-user-avatar-phone" style="display: none;"></div>
        <button id="profile-button-compact" class="nav-button" data-tooltip="Мой профиль">
          <i class="fas fa-user"></i>
        </button>
      </nav>
      
      <div id="mini-user-avatar" style="display: none;"></div>
    </div>
    
    <div class="sidebar-toggle" id="sidebar-toggle">
      <i class="fas fa-bars"></i>
      <i class="fas fa-chevron-right" id="chevron-right"></i>
      <i class="fas fa-chevron-left" id="chevron-left"></i>
    </div>
  `;

  // Добавляем сайдбар в начало body
  document.body.insertAdjacentHTML('afterbegin', sidebarHTML);

  // Получаем элементы
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const miniAvatar = document.getElementById('mini-user-avatar');
  const chevronRight = document.getElementById('chevron-right');
  const chevronLeft = document.getElementById('chevron-left');

  // Добавляем стили для корректного отображения иконок
  const toggleStyles = document.createElement('style');
  toggleStyles.textContent = `
    .sidebar-toggle i {
      display: none;
    }
    
    .sidebar-toggle .fa-bars {
      display: block;
    }
    
    .sidebar-toggle:hover .fa-bars {
      display: none;
    }
    
    .sidebar-toggle:hover #chevron-right {
      display: none;
    }
    
    .sidebar-toggle:hover #chevron-left {
      display: none;
    }
    
    /* Показываем стрелку вправо при наведении, когда сайдбар не свёрнут */
    .sidebar-toggle:not(.collapsed):hover #chevron-left {
      display: block;
    }
    
    /* Показываем стрелку влево при наведении, когда сайдбар свёрнут */
    .sidebar-toggle.collapsed:hover #chevron-right {
      display: block;
    }
  `;
  document.head.appendChild(toggleStyles);

  // Инициализируем состояние сайдбара из localStorage
  const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isSidebarCollapsed) {
    sidebar.classList.add('collapsed');
    sidebarToggle.classList.add('collapsed');
    miniAvatar.style.display = 'block';
  }

  // Добавляем функцию определения текущей страницы и проверки профиля
  const currentPage = window.location.pathname.split('/').pop();
  
  // Для домашней страницы
  if (currentPage === 'home.html') {
    document.getElementById('home-button').classList.add('active');
    document.getElementById('home-button-compact').classList.add('active');
  } 
  // Для страницы профиля
  else if (currentPage === 'profile.html') {
    // Получаем ID из URL
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('id');
    
    // Получаем данные текущего пользователя
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.numericId) {
      // Проверяем, совпадает ли ID в URL с ID текущего пользователя
      if (profileId === userData.numericId.toString()) {
        document.getElementById('profile-button').classList.add('active');
        document.getElementById('profile-button-compact').classList.add('active');
      }
    }
  }

  // Обработчики для домашней страницы
  document.getElementById('home-button').addEventListener('click', () => {
    const currentPath = new URL(window.location.href).pathname;
    if (!currentPath.endsWith('/home.html') && !currentPath.endsWith('home.html')) {
      window.location.href = 'home.html';
    }
  });

  document.getElementById('home-button-compact').addEventListener('click', () => {
    const currentPath = new URL(window.location.href).pathname;
    if (!currentPath.endsWith('/home.html') && !currentPath.endsWith('home.html')) {
      window.location.href = 'home.html';
    }
  });

  // Обработчики навигации для кнопок профиля (полной и компактной версии)
  const navigateToProfile = () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.numericId) {
      const currentUrl = new URL(window.location.href);
      const currentProfileId = currentUrl.searchParams.get('id');
      
      // Проверяем, не находимся ли мы уже на своем профиле
      if (currentUrl.pathname.endsWith('profile.html') && 
          currentProfileId === userData.numericId.toString()) {
        return;
      }
      
      window.location.href = `profile.html?id=${userData.numericId}`;
    } else {
      // Оригинальная логика получения numericId
      const userRef = ref(db, `users/${userData.uid}`);
      get(userRef).then((snapshot) => {
        if (snapshot.exists()) {
          const userDetails = snapshot.val();
          userData.numericId = userDetails.numericId;
          localStorage.setItem('userData', JSON.stringify(userData));
          window.location.href = `profile.html?id=${userDetails.numericId}`;
        }
      });
    }
  };

  document.getElementById('profile-button').addEventListener('click', navigateToProfile);
  document.getElementById('profile-button-compact').addEventListener('click', navigateToProfile);

  // Обработчик выхода
  document.getElementById('logout').addEventListener('click', async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isAuthenticated');
      // Устанавливаем флаг logout для синхронизации с другими вкладками
      localStorage.setItem('logout', 'true');
      console.log('User signed out successfully');
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Ошибка при выходе из аккаунта: ' + error.message);
    }
  });

  // Обработчик переключения сайдбара
  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    sidebarToggle.classList.toggle('collapsed');
    miniAvatar.style.display = sidebar.classList.contains('collapsed') ? 'block' : 'none';
    
    // Добавляем скрытие дропдауна при разворачивании панели
    if (!sidebar.classList.contains('collapsed')) {
      standaloneDropdown.classList.remove('active');
      setTimeout(() => {
        standaloneDropdown.style.display = 'none';
      }, 300);
    }
    
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
  });

  // Обновляем данные пользователя и настраиваем слушатель данных в реальном времени
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (userData) {
    document.getElementById('user-name').innerText = userData.email;
    
    // Обновляем отображение аватарки из локального хранилища сразу
    updateAvatarDisplay(userData);
    
    // Настраиваем слушатель для обновления данных в реальном времени
    if (userData.uid) {
      const userRef = ref(db, `users/${userData.uid}`);
      
      // Сначала проверяем, есть ли обновления в Firebase
      updateUserAvatarFromFirebase();
      
      // Устанавливаем слушатель на изменения в Firebase
      onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const firebaseUserData = snapshot.val();
          const localUserData = JSON.parse(localStorage.getItem('userData'));
          
          // Если аватарка в Firebase отличается от локальной
          if (firebaseUserData.photoURL !== localUserData.photoURL) {
            console.log('Real-time avatar update detected');
            
            // Обновляем локальные данные
            localUserData.photoURL = firebaseUserData.photoURL;
            localStorage.setItem('userData', JSON.stringify(localUserData));
            
            // Обновляем отображение
            updateAvatarDisplay(localUserData);
            
            // Оповещаем другие вкладки об обновлении
            localStorage.setItem('userDataUpdate', 'true');
          }
        }
      });
    }
  }

  // Добавляем переменные для отслеживания состояния анимации
  let isUserProfileAnimating = false;
  let isMiniAvatarAnimating = false;
  const ANIMATION_DURATION = 300; // Длительность анимации в миллисекундах

  // Добавляем после инициализации профиля (примерно строка 195)
  const userProfileContainer = document.querySelector('.user-profile-container');
  const profileDropdown = document.querySelector('.profile-dropdown');

  // Обработчик клика по контейнеру профиля
  userProfileContainer.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Проверяем, не выполняется ли уже анимация
    if (isUserProfileAnimating) {
      return; // Блокируем повторные нажатия во время анимации
    }
    
    // Устанавливаем флаг анимации
    isUserProfileAnimating = true;
    
    // Переключаем класс active
    profileDropdown.classList.toggle('active');
    
    // Сбрасываем флаг анимации после завершения анимации
    setTimeout(() => {
      isUserProfileAnimating = false;
    }, ANIMATION_DURATION);
  });

  // Закрытие дропдауна при клике вне
  document.addEventListener('click', (e) => {
    if (!userProfileContainer.contains(e.target)) {
      profileDropdown.classList.remove('active');
    }
  });

  // Обработчики для кнопок
  document.getElementById('profile-settings').addEventListener('click', () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.numericId) {
      window.location.href = `profile.html?id=${userData.numericId}&openEditModal=true`;
    }
  });

  document.getElementById('dropdown-logout').addEventListener('click', async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isAuthenticated');
      // Устанавливаем флаг logout для синхронизации с другими вкладками
      localStorage.setItem('logout', 'true');
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  });

  // Добавьте обработчики для остальных кнопок по необходимости

  // Добавьте после строки 101 (после закрытия тега sidebar-toggle)
  const dropdownHTML = `
    <div class="profile-dropdown-standalone" style="display: none;">
      <div class="dropdown-section">
        <button class="dropdown-button" id="profile-settings-standalone">
          <i class="fas fa-user-cog"></i>
          Настройки профиля
        </button>
      </div>
      
      <!-- Добавляем новый раздел для переключения темы -->
      <div class="dropdown-section">
        <div class="theme-dropdown-container">
          <button class="dropdown-button" id="theme-settings-standalone">
            <i class="fas fa-palette"></i>
            <span>Выбор темы</span>
          </button>
          <div class="theme-options">
            <button class="theme-option" id="light-theme-standalone">
              <i class="fas fa-sun"></i>
              <span>Светлая</span>
            </button>
            <button class="theme-option" id="dark-theme-standalone">
              <i class="fas fa-moon"></i>
              <span>Темная</span>
            </button>
            <button class="theme-option" id="system-theme-standalone">
              <i class="fas fa-desktop"></i>
              <span>Системная</span>
            </button>
          </div>
        </div>
      </div>
      
      <div class="dropdown-section">
        <button class="dropdown-button danger" id="dropdown-logout-standalone">
          <i class="fas fa-sign-out-alt"></i>
          Выйти
        </button>
      </div>
    </div>
    
    <!-- Новое мобильное выпадающее меню -->
    <div class="profile-dropdown-mobile" style="display: none;">
      <div class="dropdown-section">
        <button class="dropdown-button" id="profile-settings-mobile">
          <i class="fas fa-user-cog"></i>
          Настройки профиля
        </button>
      </div>
      
      <!-- Раздел для переключения темы -->
      <div class="dropdown-section">
        <div class="theme-dropdown-container">
          <button class="dropdown-button" id="theme-settings-mobile">
            <i class="fas fa-palette"></i>
            <span>Выбор темы</span>
          </button>
          <div class="theme-options">
            <button class="theme-option" id="light-theme-mobile">
              <i class="fas fa-sun"></i>
              <span>Светлая</span>
            </button>
            <button class="theme-option" id="dark-theme-mobile">
              <i class="fas fa-moon"></i>
              <span>Темная</span>
            </button>
            <button class="theme-option" id="system-theme-mobile">
              <i class="fas fa-desktop"></i>
              <span>Системная</span>
            </button>
          </div>
        </div>
      </div>
      
      <div class="dropdown-section">
        <button class="dropdown-button danger" id="dropdown-logout-mobile">
          <i class="fas fa-sign-out-alt"></i>
          Выйти
        </button>
      </div>
    </div>
  `;

  // Добавьте после строки 104
  document.body.insertAdjacentHTML('beforeend', dropdownHTML);

  // Обработчик клика по мини-аватару
  const miniUserAvatar = document.getElementById('mini-user-avatar');
  const standaloneDropdown = document.querySelector('.profile-dropdown-standalone');

  // Функция для обновления позиции дропдауна
  function updateDropdownPosition() {
    if (standaloneDropdown.style.display === 'block' && standaloneDropdown.classList.contains('active')) {
      const rect = miniUserAvatar.getBoundingClientRect();
      
      // Фиксируем горизонтальное положение относительно левого края аватара
      const leftPosition = rect.left;
      // Обновляем только вертикальное положение
      const topPosition = rect.top - standaloneDropdown.offsetHeight - 9;
      
      standaloneDropdown.style.top = `${topPosition}px`;
      standaloneDropdown.style.left = `${leftPosition}px`;
    }
  }

  miniUserAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Проверяем, не выполняется ли уже анимация
    if (isMiniAvatarAnimating) {
      return; // Блокируем повторные нажатия во время анимации
    }
    
    // Устанавливаем флаг анимации
    isMiniAvatarAnimating = true;
    
    if (standaloneDropdown.style.display === 'block' && standaloneDropdown.classList.contains('active')) {
      standaloneDropdown.classList.remove('active');
      setTimeout(() => {
        standaloneDropdown.style.display = 'none';
        // Сбрасываем флаг анимации после завершения анимации закрытия
        isMiniAvatarAnimating = false;
      }, ANIMATION_DURATION);
    } else {
      const rect = miniUserAvatar.getBoundingClientRect();
      
      // Используем то же позиционирование с левого края
      const leftPosition = rect.left;
      const topPosition = rect.top - standaloneDropdown.offsetHeight - 204;
      
      standaloneDropdown.style.top = `${topPosition}px`;
      standaloneDropdown.style.left = `${leftPosition}px`;
      standaloneDropdown.style.display = 'block';
      
      requestAnimationFrame(() => {
        standaloneDropdown.classList.add('active');
        // Сбрасываем флаг анимации после завершения анимации открытия
        setTimeout(() => {
          isMiniAvatarAnimating = false;
        }, ANIMATION_DURATION);
      });
    }
  });

  // Слушатели событий
  window.addEventListener('resize', updateDropdownPosition);
  window.addEventListener('scroll', updateDropdownPosition);
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      requestAnimationFrame(updateDropdownPosition);
    }
  });

  // Добавьте после обработчика клика по мини-аватару
  document.addEventListener('click', (e) => {
    if (!miniUserAvatar.contains(e.target) && !standaloneDropdown.contains(e.target)) {
      standaloneDropdown.classList.remove('active');
      setTimeout(() => {
        standaloneDropdown.style.display = 'none';
      }, 300);
    }
  });

  // Функция для установки темы
  function setTheme(themeName) {
    // Удаляем все классы тем
    document.body.classList.remove('dark-mode', 'light-mode');
    
    if (themeName === 'system') {
      // Если выбрана системная тема, определяем её на основе предпочтений системы
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.classList.add(prefersDark ? 'dark-mode' : 'light-mode');
      localStorage.setItem('theme', 'system');

      // Добавляем слушатель изменения системной темы
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeMediaQuery.addEventListener('change', (e) => {
        document.body.classList.remove('dark-mode', 'light-mode');
        document.body.classList.add(e.matches ? 'dark-mode' : 'light-mode');
      });
    } else {
      // Иначе устанавливаем выбранную тему
      document.body.classList.add(themeName);
      localStorage.setItem('theme', themeName);

      // Удаляем слушатель системной темы, если он был
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      darkModeMediaQuery.removeEventListener('change', () => {});
    }
    
    // Обновляем активную кнопку темы
    updateActiveThemeButton();
  }
  
  // Функция для обновления активной кнопки темы
  function updateActiveThemeButton() {
    // Получаем текущую тему
    const currentTheme = localStorage.getItem('theme') || 'system';
    
    // Удаляем класс active у всех кнопок
    document.querySelectorAll('.theme-option').forEach(button => {
      button.classList.remove('active');
    });
    
    // Добавляем класс active соответствующей кнопке
    if (currentTheme === 'dark-mode' || currentTheme === 'dark') {
      document.getElementById('dark-theme').classList.add('active');
      document.getElementById('dark-theme-standalone').classList.add('active');
    } else if (currentTheme === 'light-mode' || currentTheme === 'light') {
      document.getElementById('light-theme').classList.add('active');
      document.getElementById('light-theme-standalone').classList.add('active');
    } else {
      document.getElementById('system-theme').classList.add('active');
      document.getElementById('system-theme-standalone').classList.add('active');
    }
  }
  
  // Обработчики для кнопок переключения темы
  document.getElementById('light-theme').addEventListener('click', () => {
    setTheme('light-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('light-theme').closest('.theme-options');
    themeOptions.classList.remove('active');
  });
  
  document.getElementById('dark-theme').addEventListener('click', () => {
    setTheme('dark-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('dark-theme').closest('.theme-options');
    themeOptions.classList.remove('active');
  });
  
  document.getElementById('system-theme').addEventListener('click', () => {
    setTheme('system');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('system-theme').closest('.theme-options');
    themeOptions.classList.remove('active');
  });
  
  // Обработчики для кнопок переключения темы в автономном выпадающем меню
  document.getElementById('light-theme-standalone').addEventListener('click', () => {
    setTheme('light-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('light-theme-standalone').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем автономное выпадающее меню
    standaloneDropdown.classList.remove('active');
    setTimeout(() => {
      standaloneDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  document.getElementById('dark-theme-standalone').addEventListener('click', () => {
    setTheme('dark-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('dark-theme-standalone').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем автономное выпадающее меню
    standaloneDropdown.classList.remove('active');
    setTimeout(() => {
      standaloneDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  document.getElementById('system-theme-standalone').addEventListener('click', () => {
    setTheme('system');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('system-theme-standalone').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем автономное выпадающее меню
    standaloneDropdown.classList.remove('active');
    setTimeout(() => {
      standaloneDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  // Инициализация активной кнопки темы при загрузке
  updateActiveThemeButton();
  
  // Обработчики для раскрытия/скрытия опций темы
  const themeSettings = document.getElementById('theme-settings');
  const themeSettingsStandalone = document.getElementById('theme-settings-standalone');
  
  themeSettings.addEventListener('click', (e) => {
    e.stopPropagation();
    const themeOptions = themeSettings.nextElementSibling;
    themeOptions.classList.toggle('active');
  });
  
  themeSettingsStandalone.addEventListener('click', (e) => {
    e.stopPropagation();
    const themeOptions = themeSettingsStandalone.nextElementSibling;
    themeOptions.classList.toggle('active');
  });
  
  // Закрытие опций темы при клике вне
  document.addEventListener('click', (e) => {
    const themeOptions = document.querySelectorAll('.theme-options');
    themeOptions.forEach(options => {
      if (!options.contains(e.target) && 
          !e.target.closest('#theme-settings') && 
          !e.target.closest('#theme-settings-standalone')) {
        options.classList.remove('active');
      }
    });
  });

  document.getElementById('dropdown-logout-standalone').addEventListener('click', async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isAuthenticated');
      // Устанавливаем флаг logout для синхронизации с другими вкладками
      localStorage.setItem('logout', 'true');
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  });

  // Добавьте стили для мобильного аватара после закрытия тега sidebar-toggle
  const mobileAvatarStyles = document.createElement('style');
  mobileAvatarStyles.textContent = `
#mini-user-avatar-phone {
    width: 45px;
    height: 45px;
    border-radius: 50%;
    background-color: transparent;
    color: white;
    display: flex
;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    cursor: pointer;
    z-index: 1000;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
    display: none;
    margin-top: 0px;
}

    #mini-user-avatar-phone:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
    }

    @media (max-width: 768px) {
      #mini-user-avatar-phone {
        display: flex !important;
      }
    }
  `;
  document.head.appendChild(mobileAvatarStyles);

  // Добавляем обработчик для мобильного аватара
  const miniUserAvatarPhone = document.getElementById('mini-user-avatar-phone');

  // Изменяем обработчик для мобильного аватара, чтобы он показывал мобильное меню
  const mobileDropdown = document.querySelector('.profile-dropdown-mobile');

  miniUserAvatarPhone.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Проверяем, не выполняется ли уже анимация
    if (isMiniAvatarAnimating) {
      return; // Блокируем повторные нажатия во время анимации
    }
    
    // Устанавливаем флаг анимации
    isMiniAvatarAnimating = true;
    
    if (mobileDropdown.style.display === 'block' && mobileDropdown.classList.contains('active')) {
      mobileDropdown.classList.remove('active');
      setTimeout(() => {
        mobileDropdown.style.display = 'none';
        // Сбрасываем флаг анимации после завершения анимации закрытия
        isMiniAvatarAnimating = false;
      }, ANIMATION_DURATION);
    } else {
      // Показываем мобильное выпадающее меню в центре экрана
      mobileDropdown.style.display = 'block';
      
      requestAnimationFrame(() => {
        mobileDropdown.classList.add('active');
        // Сбрасываем флаг анимации после завершения анимации открытия
        setTimeout(() => {
          isMiniAvatarAnimating = false;
        }, ANIMATION_DURATION);
      });
    }
  });

  document.getElementById('profile-settings-standalone').addEventListener('click', () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.numericId) {
      window.location.href = `profile.html?id=${userData.numericId}&openEditModal=true`;
    }
  });

  // Обработчики для кнопок переключения темы в мобильном выпадающем меню
  document.getElementById('light-theme-mobile').addEventListener('click', () => {
    setTheme('light-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('light-theme-mobile').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем мобильное выпадающее меню
    const mobileDropdown = document.querySelector('.profile-dropdown-mobile');
    mobileDropdown.classList.remove('active');
    setTimeout(() => {
      mobileDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  document.getElementById('dark-theme-mobile').addEventListener('click', () => {
    setTheme('dark-mode');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('dark-theme-mobile').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем мобильное выпадающее меню
    const mobileDropdown = document.querySelector('.profile-dropdown-mobile');
    mobileDropdown.classList.remove('active');
    setTimeout(() => {
      mobileDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  document.getElementById('system-theme-mobile').addEventListener('click', () => {
    setTheme('system');
    // Скрываем меню выбора темы после выбора
    const themeOptions = document.getElementById('system-theme-mobile').closest('.theme-options');
    themeOptions.classList.remove('active');
    
    // Скрываем мобильное выпадающее меню
    const mobileDropdown = document.querySelector('.profile-dropdown-mobile');
    mobileDropdown.classList.remove('active');
    setTimeout(() => {
      mobileDropdown.style.display = 'none';
    }, ANIMATION_DURATION);
  });
  
  // Обработчик для кнопки настроек темы в мобильном меню
  const themeSettingsMobile = document.getElementById('theme-settings-mobile');
  
  themeSettingsMobile.addEventListener('click', (e) => {
    e.stopPropagation();
    const themeOptions = themeSettingsMobile.nextElementSibling;
    themeOptions.classList.toggle('active');
  });
  
  // Обработчик для кнопки настроек профиля в мобильном меню
  document.getElementById('profile-settings-mobile').addEventListener('click', () => {
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.numericId) {
      window.location.href = `profile.html?id=${userData.numericId}&openEditModal=true`;
    }
  });
  
  // Обработчик для кнопки выхода в мобильном меню
  document.getElementById('dropdown-logout-mobile').addEventListener('click', async () => {
    try {
      const auth = getAuth();
      await signOut(auth);
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isAuthenticated');
      // Устанавливаем флаг logout для синхронизации с другими вкладками
      localStorage.setItem('logout', 'true');
      window.location.href = 'index.html';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  });

  // Добавляем стили для мобильного выпадающего меню
  const mobileDropdownStyles = document.createElement('style');
  mobileDropdownStyles.textContent = `
    .profile-dropdown-mobile {
      position: fixed;
      background-color: var(--sidebar-bg);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      width: 90%;
      max-width: 300px;
      z-index: 1100;
      opacity: 0;
      transform: translateY(-10px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      padding: 15px;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .profile-dropdown-mobile.active {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
      background-color: rgba(var(--sidebar-bg-rgb, 30, 30, 30), 0.75);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .profile-dropdown-mobile .dropdown-section {
      margin-bottom: 10px;
    }
    
    .profile-dropdown-mobile .dropdown-button {
      width: 100%;
      text-align: left;
      padding: 12px 15px;
      border-radius: 6px;
      font-size: 16px;
    }
    
    .profile-dropdown-mobile .theme-dropdown-container {
      position: relative;
      width: 100%;
      display: block;
    }
    
    .profile-dropdown-mobile .theme-options {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease;
      margin-top: 0;
      position: relative;
      z-index: 1200;
      width: 100%;
      left: 0;
    }
    
    .profile-dropdown-mobile .theme-options.active {
      max-height: 150px;
      background-color: rgba(var(--sidebar-bg-rgb, 30, 30, 30), 0.95);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.15);
      margin-top: 5px;
      padding: 5px 0;
    }
    
    .profile-dropdown-mobile .theme-option {
      padding: 12px 15px;
      font-size: 16px;
      transition: background-color 0.2s ease;
    }
    
    .profile-dropdown-mobile .theme-option:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  `;
  document.head.appendChild(mobileDropdownStyles);

  // Обработчик закрытия мобильного меню при клике вне
  document.addEventListener('click', (e) => {
    if (!miniUserAvatarPhone.contains(e.target) && !mobileDropdown.contains(e.target)) {
      mobileDropdown.classList.remove('active');
      setTimeout(() => {
        mobileDropdown.style.display = 'none';
      }, ANIMATION_DURATION);
    }
  });

  // Создаем стиль с CSS-переменными для RGB-версий цветов
  const rootVarsStyle = document.createElement('style');
  rootVarsStyle.textContent = `
    :root {
      --sidebar-bg-rgb: 30, 30, 30;
    }
    
    body.light-mode {
      --sidebar-bg-rgb: 245, 245, 245;
    }
    
    body.dark-mode {
      --sidebar-bg-rgb: 30, 30, 30;
    }
  `;
  document.head.appendChild(rootVarsStyle);
} 