import { getAuth, signOut } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import { getDatabase, ref, get, onValue, set, push } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, uploadBytesResumable } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js';

// Определение глобальных переменных для музыкального плеера
let DEFAULT_ALBUM_COVER = 'https://cdn-icons-png.flaticon.com/512/5349/5349958.png'; // Временное значение, будет заменено из Firebase
let globalAudioPlayer = null;
let playerInitialized = false; // Флаг инициализации плеера
let tracksLoaded = false; // Флаг загрузки треков
let lastUpdateTime = 0; // Время последнего обновления состояния
let audioContext = null; // Web Audio API контекст для бесшовного воспроизведения
let globalCurrentTrackId = null; // Глобальный ID текущего трека для независимого воспроизведения
let userAvatarCache = null; // Кеш для хранения аватарки пользователя
let savedAvatarElements = {}; // Сохраняем DOM-элементы аватаров между переходами
let notificationSound = null; // Аудио-элемент для звука уведомления
let activeNotifications = []; // Массив для хранения активных уведомлений

// Функция для загрузки дефолтной обложки трека из Firebase Storage
async function loadDefaultAlbumCover() {
  try {
    const storage = getStorage();
    const defaultCoverRef = storageRef(storage, '/covers_default/default_cover_music.jpg');
    const defaultCoverURL = await getDownloadURL(defaultCoverRef);
    DEFAULT_ALBUM_COVER = defaultCoverURL;
    
    // Обновляем все элементы с дефолтной обложкой, которые уже могли быть созданы
    const coverPreviewElements = document.querySelectorAll('#cover-preview img');
    coverPreviewElements.forEach(element => {
      if (element.src.includes('cdn-icons-png.flaticon.com')) {
        element.src = DEFAULT_ALBUM_COVER;
      }
    });
  } catch (error) {
    console.error('Ошибка при загрузке дефолтной обложки:', error);
    // Сохраняем текущее дефолтное значение в случае ошибки
  }
}

// Создаем глобальный Web Audio API контекст для непрерывного воспроизведения
try {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  // Создаем источник для будущего использования
  if (!window.globalMediaSource && audioContext) {
    window.globalMediaSource = audioContext.createMediaElementSource;
    
    // Переопределяем метод для сохранения одного и того же источника
    audioContext.createMediaElementSource = function(mediaElement) {
      if (window.globalAudioSource && mediaElement === globalAudioPlayer) {
        return window.globalAudioSource;
      } else {
        const source = window.globalMediaSource.call(this, mediaElement);
        if (mediaElement === globalAudioPlayer) {
          window.globalAudioSource = source;
        }
        return source;
      }
    };
  }
} catch (e) {
  console.error('Web Audio API не поддерживается:', e);
}

// Загружаем трек напрямую, не дожидаясь загрузки плейлиста
function loadTrackDirectly(trackId) {
  if (!trackId) return false;
  
  // Пытаемся получить данные трека из localStorage
  const trackCache = localStorage.getItem(`trackCache_${trackId}`);
  if (!trackCache) return false;
  
  try {
    const trackData = JSON.parse(trackCache);
    if (!globalAudioPlayer) {
      globalAudioPlayer = new Audio();
      
      // Подключаем к Web Audio API для непрерывного воспроизведения
      if (audioContext) {
        try {
          // Создаем источник аудио из элемента
          const source = audioContext.createMediaElementSource(globalAudioPlayer);
          // Подключаем его напрямую к выходу
          source.connect(audioContext.destination);
          window.globalAudioSource = source;
        } catch (e) {
          console.error('Ошибка при инициализации Web Audio API:', e);
        }
      }
    }
    
    // Устанавливаем источник и запускаем трек
    globalAudioPlayer.src = trackData.url;
    globalAudioPlayer.preload = 'auto';
    
    // Обновляем глобальный ID трека
    globalCurrentTrackId = trackId;
    
    // Обновляем интерфейс плеера с данными трека
    if (typeof window._updatePlayerInterface === 'function') {
      window._updatePlayerInterface(trackData);
    } else if (typeof _updatePlayerInterface === 'function') {
      _updatePlayerInterface(trackData);
    }
    
    return true;
  } catch (error) {
    console.error('Ошибка загрузки трека напрямую:', error);
    return false;
  }
}

  // Начинаем инициализацию плеера мгновенно, асинхронно и не блокируя основной поток
setTimeout(() => {
  try {
    // Проверяем сохраненное состояние плеера
    const stateJson = sessionStorage.getItem('musicPlayerState') || localStorage.getItem('musicPlayerState');
    if (stateJson) {
      const state = JSON.parse(stateJson);
      
      // Получаем ID трека напрямую
      const trackId = state.trackId || localStorage.getItem('currentTrackId');
      if (trackId && state.isPlaying) {
        // Загружаем трек напрямую без ожидания загрузки плейлиста
        if (loadTrackDirectly(trackId)) {
          // Получаем более точное время из History API State или из localStorage
          let currentTime = state.currentTime || 0;
          
          // Проверяем, есть ли записанное состояние в History API
          if (window.history.state && window.history.state.audioTime) {
            // Используем время из History API, оно более точное
            currentTime = window.history.state.audioTime;
          }
          
          // Устанавливаем громкость и позицию
          globalAudioPlayer.volume = state.volume || 1;
          
          // Также обновляем иконку громкости, если её контейнер уже доступен
          setTimeout(() => {
            const volumeSlider = document.getElementById('volume-slider');
            if (volumeSlider) {
              const volumeValue = globalAudioPlayer.volume * 100;
              volumeSlider.value = volumeValue;
              volumeSlider.style.setProperty('--volume-percentage', `${volumeValue}%`);
              if (typeof updateVolumeIcon === 'function') {
                updateVolumeIcon(volumeValue);
              }
            }
          }, 100);
          globalAudioPlayer.currentTime = currentTime;
          
          // Запускаем AudioContext если он был приостановлен
          if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
              console.log('AudioContext возобновлен');
              // Пытаемся воспроизвести после возобновления контекста
              globalAudioPlayer.play().catch(error => {
                console.log('Автовоспроизведение не удалось, будет запущено позже:', error);
              });
            });
          } else {
            // Пытаемся воспроизвести сразу
            const playPromise = globalAudioPlayer.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.log('Автовоспроизведение не удалось, будет запущено позже:', error);
                
                // Настраиваем событие взаимодействия для запуска воспроизведения
                const startPlayback = () => {
                  globalAudioPlayer.play().catch(e => console.error('Ошибка при повторной попытке воспроизведения:', e));
                  document.removeEventListener('click', startPlayback);
                  document.removeEventListener('touchstart', startPlayback);
                  document.removeEventListener('keydown', startPlayback);
                };
                
                document.addEventListener('click', startPlayback, { once: true });
                document.addEventListener('touchstart', startPlayback, { once: true });
                document.addEventListener('keydown', startPlayback, { once: true });
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при раннем запуске плеера:', error);
  }
}, 0);

// Поддерживаем непрерывное воспроизведение при переходах
function persistAudio() {
  // Создаем скрытый контейнер для аудио-элемента, который будет оставаться между навигациями
  if (!document.getElementById('persistent-audio-container')) {
    const container = document.createElement('div');
    container.id = 'persistent-audio-container';
    container.style.display = 'none';
    document.body.appendChild(container);
    
    // Если плеер уже создан, перемещаем его в контейнер
    if (globalAudioPlayer) {
      container.appendChild(globalAudioPlayer);
    }
  }
}

// Создаем контейнер для хранения элементов аватаров между переходами
function createAvatarContainer() {
  if (!document.getElementById('persistent-avatar-container')) {
    const container = document.createElement('div');
    container.id = 'persistent-avatar-container';
    container.style.display = 'none';
    document.body.appendChild(container);
  }
  return document.getElementById('persistent-avatar-container');
}

// Функция для кеширования аватарки пользователя
function cacheUserAvatar() {
  // Получаем данные пользователя
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (!userData) return;
  
  // Используем стабильный идентификатор вместо случайного timestamp
  // Используем uid или numericId пользователя, если они доступны
  const stableId = userData.uid || userData.numericId || 'user';
  const photoURL = userData.photoURL ? 
    (userData.photoURL.includes('?') ? `${userData.photoURL}&_stable=${stableId}` : `${userData.photoURL}?_stable=${stableId}`) : 
    null;
  
  // Кешируем URL аватарки и первую букву (для случая отсутствия аватарки)
  userAvatarCache = {
    photoURL: photoURL,
    firstLetter: userData.email ? userData.email.charAt(0).toUpperCase() : 'U',
    stableId: stableId
  };
  
  // Сохраняем в sessionStorage для быстрого восстановления при навигации
  sessionStorage.setItem('userAvatarCache', JSON.stringify(userAvatarCache));
}

// Функция для сохранения DOM-элементов аватарок
function saveAvatarElements() {
  const userAvatar = document.getElementById('user-avatar');
  const miniUserAvatar = document.getElementById('mini-user-avatar');
  const miniUserAvatarPhone = document.getElementById('mini-user-avatar-phone');
  
  // Создаем контейнер для хранения элементов
  const container = createAvatarContainer();
  
  // Сохраняем содержимое элементов аватаров
  if (userAvatar && userAvatar.innerHTML) {
    savedAvatarElements.userAvatarHTML = userAvatar.innerHTML;
  }
  
  if (miniUserAvatar && miniUserAvatar.innerHTML) {
    savedAvatarElements.miniUserAvatarHTML = miniUserAvatar.innerHTML;
  }
  
  if (miniUserAvatarPhone && miniUserAvatarPhone.innerHTML) {
    savedAvatarElements.miniUserAvatarPhoneHTML = miniUserAvatarPhone.innerHTML;
  }
  
  // Сохраняем в sessionStorage для надежности
  sessionStorage.setItem('savedAvatarElements', JSON.stringify(savedAvatarElements));
}

// Функция для обновления отображения аватарок с использованием сохраненных элементов
function updateAvatarsDisplay(userAvatar, miniUserAvatar, miniUserAvatarPhone, avatarData) {
  if (!userAvatar && !miniUserAvatar && !miniUserAvatarPhone) return;
  
  // Проверяем, есть ли сохраненные элементы аватаров
  const hasSavedElements = savedAvatarElements.userAvatarHTML || 
                          sessionStorage.getItem('savedAvatarElements');
  
  // Если в памяти нет сохраненных элементов, пробуем загрузить из sessionStorage
  if (!savedAvatarElements.userAvatarHTML && sessionStorage.getItem('savedAvatarElements')) {
    try {
      savedAvatarElements = JSON.parse(sessionStorage.getItem('savedAvatarElements'));
    } catch (e) {
      console.error('Ошибка при чтении сохраненных элементов аватаров:', e);
    }
  }
  
  // Если есть сохраненные элементы, используем их для мгновенного отображения
  if (hasSavedElements) {
    if (userAvatar && savedAvatarElements.userAvatarHTML) {
      userAvatar.innerHTML = savedAvatarElements.userAvatarHTML;
    }
    
    if (miniUserAvatar && savedAvatarElements.miniUserAvatarHTML) {
      miniUserAvatar.innerHTML = savedAvatarElements.miniUserAvatarHTML;
      // Показываем мини-аватарку если сайдбар свернут
      if (document.querySelector('.sidebar.collapsed')) {
        miniUserAvatar.style.display = 'block';
      }
    }
    
    if (miniUserAvatarPhone && savedAvatarElements.miniUserAvatarPhoneHTML) {
      miniUserAvatarPhone.innerHTML = savedAvatarElements.miniUserAvatarPhoneHTML;
    }
    
    // Возвращаемся, так как уже установили аватары
    return;
  }
  
  // Если нет сохраненных элементов, создаем их с нуля
  if (avatarData.photoURL) {
    // Исправляем URL, удаляя двойные параметры запроса
    let avatarUrl = avatarData.photoURL;
    
    // Проверяем, содержит ли URL уже параметры запроса
    if (avatarUrl.includes('?')) {
      // URL уже содержит параметры, добавляем стабильный идентификатор как дополнительный параметр
      avatarUrl = `${avatarUrl}&_stable=${avatarData.stableId || 'user'}`;
    } else {
      // URL не содержит параметров, добавляем стабильный идентификатор как первый параметр
      avatarUrl = `${avatarUrl}?_stable=${avatarData.stableId || 'user'}`;
    }
    
    // Создаем HTML для аватарки с корректным URL
    const avatarHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    
    // Обновляем основную аватарку
    if (userAvatar) {
      userAvatar.innerHTML = avatarHTML;
      savedAvatarElements.userAvatarHTML = avatarHTML;
    }
    
    // Обновляем мини-аватарку
    if (miniUserAvatar) {
      miniUserAvatar.innerHTML = avatarHTML;
      savedAvatarElements.miniUserAvatarHTML = avatarHTML;
      // Показываем мини-аватарку если сайдбар свернут
      if (document.querySelector('.sidebar.collapsed')) {
        miniUserAvatar.style.display = 'block';
      }
    }
    
    // Обновляем мини-аватарку для телефона
    if (miniUserAvatarPhone) {
      miniUserAvatarPhone.innerHTML = avatarHTML;
      savedAvatarElements.miniUserAvatarPhoneHTML = avatarHTML;
    }
    
    // Сохраняем элементы в sessionStorage
    sessionStorage.setItem('savedAvatarElements', JSON.stringify(savedAvatarElements));
  } else {
    // Если нет URL, используем первую букву email
    const firstLetter = avatarData.firstLetter;
    
    if (userAvatar) {
      userAvatar.innerText = firstLetter;
      savedAvatarElements.userAvatarHTML = firstLetter;
    }
    
    if (miniUserAvatar) {
      miniUserAvatar.innerText = firstLetter;
      savedAvatarElements.miniUserAvatarHTML = firstLetter;
      // Показываем мини-аватарку если сайдбар свернут
      if (document.querySelector('.sidebar.collapsed')) {
        miniUserAvatar.style.display = 'block';
      }
    }
    
    if (miniUserAvatarPhone) {
      miniUserAvatarPhone.innerText = firstLetter;
      savedAvatarElements.miniUserAvatarPhoneHTML = firstLetter;
    }
    
    // Сохраняем элементы в sessionStorage
    sessionStorage.setItem('savedAvatarElements', JSON.stringify(savedAvatarElements));
  }
}

// Функция для динамической загрузки скрипта
function loadScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = callback;
  script.onerror = () => console.error(`Ошибка загрузки скрипта: ${src}`);
  document.head.appendChild(script);
}

// Функция для динамической загрузки CSS
function loadCSS(href) {
  // Проверяем, не загружен ли уже CSS
  if (!document.querySelector(`link[href="${href}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

export function initializeSidebar() {
  // Проверяем, находимся ли мы на странице messages.html
  if (window.location.pathname.includes('messages.html')) {
    document.body.classList.add('messages-page');
  }
  
  // Добавляем обработчик взаимодействия для разрешения автовоспроизведения звука
  if (!localStorage.getItem('userHasInteracted')) {
    const interactionHandler = () => {
      localStorage.setItem('userHasInteracted', 'true');
      
      // Удаляем обработчики после первого взаимодействия
      document.removeEventListener('click', interactionHandler);
      document.removeEventListener('touchstart', interactionHandler);
      document.removeEventListener('keydown', interactionHandler);
      
      // Предварительно загружаем звук уведомления
      if (!notificationSound) {
        loadNotificationSound();
      }
    };
    
    // Устанавливаем обработчики для различных видов взаимодействия
    document.addEventListener('click', interactionHandler);
    document.addEventListener('touchstart', interactionHandler);
    document.addEventListener('keydown', interactionHandler);
  }
  
  // Проверяем, загружен ли Font Awesome, и если нет - загружаем его
  if (!document.getElementById('font-awesome-css')) {
    const fontAwesomeLink = document.createElement('link');
    fontAwesomeLink.id = 'font-awesome-css';
    fontAwesomeLink.rel = 'stylesheet';
    fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css';
    fontAwesomeLink.integrity = 'sha512-1ycn6IcaQQ40/MKBW2W4Rhis/DbILU74C1vSrLJxCq57o941Ym01SwNsOMqvEBFlcgUa6xLiPY/NS5R+E6ztJQ==';
    fontAwesomeLink.crossOrigin = 'anonymous';
    fontAwesomeLink.referrerPolicy = 'no-referrer';
    document.head.appendChild(fontAwesomeLink);
  }

  // Конфигурация Firebase
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
      // Обновляем кеш аватарки и очищаем сохраненные DOM-элементы
      cacheUserAvatar();
      savedAvatarElements = {};
      sessionStorage.removeItem('savedAvatarElements');
      // Принудительно обновляем отображение аватарки
      const userData = JSON.parse(localStorage.getItem('userData'));
      if (userData) {
        updateAvatarDisplay(userData);
      }
      localStorage.removeItem('userDataUpdate');
    } else if (event.key === 'avatarUpdated' && event.newValue === 'true') {
      console.log('Avatar update detected');
      // Очищаем кеш аватарки и принудительно обновляем
      sessionStorage.removeItem('userAvatarCache');
      savedAvatarElements = {};
      sessionStorage.removeItem('savedAvatarElements');
      // Заново кешируем аватарку
      cacheUserAvatar();
      // Принудительно обновляем отображение
      const userData = JSON.parse(localStorage.getItem('userData'));
      if (userData) {
        updateAvatarDisplay(userData);
      }
      localStorage.removeItem('avatarUpdated');
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
            
            // Сбрасываем кеш аватарки
            sessionStorage.removeItem('userAvatarCache');
            savedAvatarElements = {};
            sessionStorage.removeItem('savedAvatarElements');
            
            // Заново кешируем аватарку
            cacheUserAvatar();
            
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
    
    // Принудительно создаем новый кеш аватарки
    cacheUserAvatar();
    
    // Используем стабильный идентификатор
    const stableId = userData.uid || userData.numericId || 'user';
    
    if (userData.photoURL) {
      // Проверяем, содержит ли URL уже параметры запроса
      let avatarUrl = userData.photoURL;
      if (avatarUrl.includes('?')) {
        avatarUrl = `${avatarUrl}&_stable=${stableId}`;
      } else {
        avatarUrl = `${avatarUrl}?_stable=${stableId}`;
      }
      
      // Если есть URL аватарки, отображаем изображение
      userAvatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      miniUserAvatar.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      miniUserAvatarPhone.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
      
      // Сбрасываем сохраненные DOM-элементы
      savedAvatarElements = {
        userAvatarHTML: userAvatar.innerHTML,
        miniUserAvatarHTML: miniUserAvatar.innerHTML,
        miniUserAvatarPhoneHTML: miniUserAvatarPhone.innerHTML
      };
      
      // Сохраняем в sessionStorage
      sessionStorage.setItem('savedAvatarElements', JSON.stringify(savedAvatarElements));
    } else {
      // Если нет URL, используем первую букву email
      const firstLetter = userData.email.charAt(0).toUpperCase();
      userAvatar.innerText = firstLetter;
      miniUserAvatar.innerText = firstLetter;
      miniUserAvatarPhone.innerText = firstLetter;
      
      // Сбрасываем сохраненные DOM-элементы
      savedAvatarElements = {
        userAvatarHTML: firstLetter,
        miniUserAvatarHTML: firstLetter,
        miniUserAvatarPhoneHTML: firstLetter
      };
      
      // Сохраняем в sessionStorage
      sessionStorage.setItem('savedAvatarElements', JSON.stringify(savedAvatarElements));
    }
    
    // Отправляем сигнал об обновлении аватара для других вкладок
    localStorage.setItem('avatarUpdated', 'true');
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
          <button id="messages-button" class="nav-button" data-tooltip="Сообщения">
            <i class="fas fa-envelope"></i>
            <span class="button-text">Сообщения</span>
          </button>
          <button id="music-button" class="nav-button" data-tooltip="Музыка">
            <i class="fas fa-music"></i>
            <span class="button-text">Музыка</span>
          </button>
          <button id="groups-button" class="nav-button" data-tooltip="Группы">
            <i class="fas fa-users"></i>
            <span class="button-text">Группы</span>
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
        <button id="messages-button-compact" class="nav-button" data-tooltip="Сообщения">
          <i class="fas fa-envelope"></i>
        </button>
        <button id="music-button-compact" class="nav-button" data-tooltip="Музыка">
          <i class="fas fa-music"></i>
          <span class="playing-indicator" style="display:none;"></span>
        </button>
        <button id="groups-button-compact" class="nav-button" data-tooltip="Группы">
          <i class="fas fa-users"></i>
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

  // Добавляем HTML для модального окна музыкального плеера
  const musicPlayerModalHTML = `
    <div id="music-player-modal" class="modal">
      <div class="modal-music-content">
        <span class="close-music-modal">&times;</span>
        <div class="modal-sidebar">
          <div class="modal-header">
            <h2>Музыкальный плеер</h2>
            <button id="upload-music-button" class="upload-music-btn"><i class="fas fa-upload"></i> Загрузить музыку</button>
          </div>
          <div class="modal-tabs">
            <button class="tab-button active" data-tab="player-tab">Плеер</button>
            <button class="tab-button" data-tab="search-tab">Поиск</button>
          </div>
          <div class="playlist">
            <h3>Плейлист</h3>
            <ul id="track-list">
              <!-- Треки будут добавлены динамически -->
            </ul>
          </div>
        </div>
        <div class="modal-body">
          <div class="tabs-container">
            <div id="player-tab" class="tab-content active">
              <!-- Информация о текущем треке и плейлисте -->
              <div class="playlist-info">
                <h3>Мой плейлист</h3>
                <p class="playlist-description">Ваши треки и добавленная музыка</p>
              </div>
              
              <!-- Добавляем расширенный список треков -->
              <div class="extended-playlist">
                <ul id="extended-track-list" class="extended-tracks">
                  <!-- Треки будут добавлены динамически -->
                </ul>
              </div>
            </div>
            <div id="search-tab" class="tab-content">
              <div class="search-container">
                <div class="search-header">
                  <h3>Поиск музыки</h3>
                  <div class="search-form">
                    <div class="search-input-wrapper">
                      <input type="text" id="search-input" placeholder="Введите название трека или исполнителя...">
                      <button id="search-button"><i class="fas fa-search"></i></button>
                    </div>
                  </div>
                </div>
                <div class="music-search-results">
                  <h4>Результаты поиска</h4>
                  <ul id="search-results-list">
                    <!-- Результаты поиска будут добавлены динамически -->
                  </ul>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Плеер внизу, общий для всех вкладок -->
          <div class="player-container">
            <div class="now-playing">
              <img id="album-cover" src="${DEFAULT_ALBUM_COVER}" alt="Обложка альбома">
              <div class="track-info">
                <p id="track-name">Выберите трек</p>
                <p id="artist-name">Исполнитель</p>
              </div>
            </div>
            <div class="player-controls">
              <div class="progress-container">
                <span id="current-time">0:00</span>
                <div class="progress-bar">
                  <div class="progress"></div>
                </div>
                <span id="duration">0:00</span>
              </div>
              <div class="control-buttons">
                <button id="prev-button"><i class="fas fa-step-backward"></i></button>
                <button id="play-button"><i class="fas fa-play"></i></button>
                <button id="next-button"><i class="fas fa-step-forward"></i></button>
                <div class="volume-container">
                  <div class="volume-icon-container">
                    <i class="fas fa-volume-up"></i>
                  </div>
                  <input type="range" id="volume-slider" class="music-volume-slider" min="0" max="100" value="100">
                </div>
              </div>
            </div>
          </div>
          
          <!-- Скрытый контент загрузки трека, который будет показываться при нажатии на кнопку -->
          <div id="upload-content" class="upload-content" style="display: none;">
            <div class="upload-container">
              <div class="upload-header">
                <h3>Загрузить новый трек</h3>
                <button id="close-upload-btn">&times;</button>
              </div>
              <div class="upload-form">
                <div class="cover-upload-container">
                  <div class="cover-preview" id="cover-preview">
                    <img src="${DEFAULT_ALBUM_COVER}" alt="Обложка трека">
                  </div>
                  <button class="music-cover-change-btn" id="music-modal-change-cover-btn">
                    <i class="fas fa-image"></i>
                    <span>Изменить обложку</span>
                  </button>
                  <input type="file" id="cover-file" accept="image/*" style="display: none;">
                </div>
                <input type="file" id="track-file" accept="audio/*">
                <div class="track-details">
                  <input type="text" id="track-title" placeholder="Название трека">
                  <input type="text" id="track-artist" placeholder="Исполнитель">
                </div>
                <button id="upload-button">Загрузить</button>
              </div>
              <div class="upload-progress">
                <div class="progress-bar">
                  <div class="progress"></div>
                </div>
                <p id="upload-status">Готово к загрузке</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Модальное окно для кадрирования изображения -->
    <div class="crop-modal" id="crop-modal">
      <div class="crop-container">
        <div class="crop-header">
          <h3 class="crop-title">Кадрирование изображения</h3>
          <button class="crop-close">&times;</button>
        </div>
        <div class="crop-area">
          <img src="" alt="Изображение для кадрирования" class="crop-img" id="crop-img">
        </div>
        <div class="crop-controls">
          <div class="crop-zoom">
            <span>Масштаб:</span>
            <input type="range" min="0.5" max="2" step="0.1" value="1" class="zoom-slider" id="zoom-slider">
          </div>
          <div class="crop-actions">
            <button class="crop-btn cancel" id="crop-cancel">Отмена</button>
            <button class="crop-btn apply" id="crop-apply">Применить</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Вставляем HTML модального окна в конец body
  document.body.insertAdjacentHTML('beforeend', musicPlayerModalHTML);
  
  // Добавляем HTML для модального окна кадрирования ОБЛОЖКИ ТРЕКА
  const musicCoverCropModalHTML = `
    <div class="crop-modal music-cover-crop" id="music-cover-crop-modal">
      <div class="crop-container">
        <div class="crop-header">
          <h3 class="crop-title">Настройка обложки трека</h3>
          <button class="crop-close music-cover-crop-close">&times;</button>
        </div>
        <div class="crop-area music-cover-crop-area">
          <img src="" alt="Обложка для кадрирования" class="crop-img" id="music-cover-crop-img">
        </div>
        <div class="crop-controls">
          <div class="crop-actions">
            <button class="crop-btn cancel music-cover-crop-cancel">Отмена</button>
            <button class="crop-btn apply music-cover-crop-apply">Применить</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', musicCoverCropModalHTML);
  
  // Добавляем стили для музыкального плеера
  const musicPlayerStyles = document.createElement('style');
  musicPlayerStyles.textContent = `
    /* Стили для модального окна */
    .modal {
      display: none;
      position: fixed;
      z-index: 2000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
    }
    
    .modal-music-content {
      display: flex;
      background-color: var(--sidebar-bg);
      color: var(--text-color, #fff);
      margin: 5% auto;
      padding: 20px;
      width: 80%;
      max-width: 800px;
      border-radius: 10px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
      position: relative;
      max-height: 85vh;
      overflow: hidden;
    }
    
    .close-music-modal {
      position: absolute;
      top: 15px;
      right: 20px;
      font-size: 28px;
      font-weight: bold;
      cursor: pointer;
      z-index: 2010;
    }
    
    /* Стили для hover-эффекта на кнопке закрытия */
    .close-music-modal:hover {
      color: #1db954;
    }
    
    .dark-mode .close-music-modal {
      color: #fff;
    }
    
    .light-mode .close-music-modal {
      color: #333;
    }
    
    .modal-sidebar {
      display: flex;
      flex-direction: column;
      width: 250px;
      min-width: 250px;
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      padding-right: 15px;
      margin-right: 15px;
      max-height: 100%;
      overflow: hidden;
    }
    
    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding-left: 10px;
      position: relative;
    }
    
    .modal-header {
      display: flex;
      flex-direction: column;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 15px;
      margin-bottom: 15px;
    }
    
    .modal-header h2 {
      margin: 0;
      font-size: 24px;
      margin-bottom: 10px;
    }
    
    /* Стили для кнопки загрузки музыки */
    .upload-music-btn {
      background-color: #1db954;
      color: white;
      border: none;
      border-radius: 5px;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.3s;
      width: 100%;
      margin-top: 5px;
    }
    
    .upload-music-btn i {
      margin-right: 5px;
    }
    
    .upload-music-btn:hover {
      background-color: #1ed760;
    }
    
    .modal-tabs {
      display: flex;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 20px;
    }
    
    .tab-button {
      background: none;
      border: none;
      padding: 10px 20px;
      font-size: 16px;
      color: var(--text-color, #fff);
      cursor: pointer;
      opacity: 0.7;
      transition: all 0.3s ease;
    }
    
    .tab-button.active {
      opacity: 1;
      border-bottom: 2px solid #1db954;
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    /* Стили для контента загрузки */
    .upload-content {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: var(--sidebar-bg);
      z-index: 1000;
      padding: 20px;
      box-sizing: border-box;
      overflow-y: auto;
    }
    
    .upload-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 10px;
    }
    
    .upload-header h3 {
      margin: 0;
      font-size: 20px;
    }
    
    #close-upload-btn {
      background: none;
      border: none;
      font-size: 24px;
      color: var(--text-color);
      cursor: pointer;
      line-height: 1;
    }
    
    /* Стили для плейлиста */
    .playlist {
      flex: 1;
      display: flex;
      flex-direction: column;
      width: 100%;
      overflow: hidden;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 10px;
    }
    
    .playlist h3 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 18px;
    }
    
    #track-list {
      list-style-type: none;
      padding: 0;
      margin: 0;
      overflow-y: auto;
      flex: 1;
      max-height: calc(85vh - 200px);
    }
    
    #track-list li {
      padding: 10px;
      border-radius: 5px;
      margin-bottom: 5px;
      cursor: pointer;
      transition: all 0.2s ease;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    #track-list li:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    #track-list li.active {
      background-color: rgba(29, 185, 84, 0.2);
      border-left: 3px solid #1db954;
    }
    
    /* Стили для плеера */
    .player-container {
      padding: 10px;
    }
    
    .now-playing {
      display: flex;
      align-items: center;
      margin-bottom: 20px;
    }
    
    #album-cover {
      width: 100px;
      height: 100px;
      object-fit: cover;
      border-radius: 5px;
      margin-right: 15px;
    }
    
    .track-info {
      flex: 1;
    }
    
    .track-info p {
      margin: 5px 0;
    }
    
    #track-name {
      font-size: 18px;
      font-weight: bold;
    }
    
    #artist-name {
      font-size: 14px;
      opacity: 0.8;
    }
    
    .player-controls {
      margin-bottom: 20px;
    }
    
    .progress-container {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .progress-bar {
      flex: 1;
      height: 5px;
      background-color: rgba(255, 255, 255, 0.2);
      border-radius: 5px;
      margin: 0 10px;
      position: relative;
      cursor: pointer;
    }
    
    .progress {
      height: 100%;
      background-color: #1db954;
      border-radius: 5px;
      width: 0%;
    }
    
    .control-buttons {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .control-buttons button {
      background: none;
      border: none;
      font-size: 20px;
      margin: 0 10px;
      color: var(--text-color, #fff);
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    #play-button {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #1db954;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .volume-container {
      display: flex;
      align-items: center;
      margin-left: 20px;
    }
    
    .volume-icon-container {
      width: 20px;
      text-align: center;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }
    
    
    
    .volume-container i {
      width: 16px;
      text-align: center;
    }
    
    /* Стили специально для ползунка громкости музыкального плеера */
    .music-volume-slider {
      width: 80px;
      margin-left: 5px;
      -webkit-appearance: none !important;
      appearance: none !important;
      height: 4px !important;
      border-radius: 2px !important;
      background: rgba(255, 255, 255, 0.2) !important;
      outline: none !important;
      transition: all 0.3s !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
      cursor: pointer;
    }
    
    .music-volume-slider::-webkit-slider-runnable-track {
      height: 4px !important;
      border-radius: 2px !important;
      background: linear-gradient(to right, #1db954 0%, #1db954 var(--volume-percentage, 50%), rgba(255, 255, 255, 0.2) var(--volume-percentage, 50%)) !important;
      border: none !important;
      box-shadow: none !important;
    }
    
    .music-volume-slider::-moz-range-track {
      height: 4px !important;
      border-radius: 2px !important;
      background: rgba(255, 255, 255, 0.2) !important;
      border: none !important;
      box-shadow: none !important;
    }
    
    .music-volume-slider::-moz-range-progress {
      height: 4px !important;
      background-color: #1db954 !important;
      border-radius: 2px !important;
    }
    
    .music-volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none !important;
      appearance: none !important;
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      border: none !important;
    }
    
    .music-volume-slider::-moz-range-thumb {
      width: 0 !important;
      height: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
      border: none !important;
      opacity: 0 !important;
    }
    
    .dark-mode .music-volume-slider {
      background: rgba(255, 255, 255, 0.2) !important;
    }
    
    .light-mode .music-volume-slider {
      background: rgba(0, 0, 0, 0.2) !important;
    }
    
    /* Стили для загрузки */
    .upload-container {
      padding: 10px;
    }
    
    .upload-form {
      margin-bottom: 20px;
    }
    
    .cover-upload-container {
      display: flex;
      justify-content: center;
      margin-bottom: 20px;
      flex-direction: column;
      align-items: center;
    }
    
    .cover-preview {
      position: relative;
      width: 200px;
      height: 200px;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
      margin-bottom: 10px;
    }
    
    .cover-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    /* Уникальные стили для кнопки изменения обложки в музыкальном плеере */
    .music-cover-change-btn {
      position: relative;
      background: rgba(29, 185, 84, 0.8);
      color: white !important;
      border: none !important;
      padding: 8px 15px !important;
      font-size: 14px !important;
      cursor: pointer !important;
      text-align: center !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 5px !important;
      width: 200px !important;
      transition: background-color 0.3s !important;
      margin-top: 0 !important;
      margin-bottom: 0 !important;
      box-shadow: none !important;
      text-transform: none !important;
      font-weight: normal !important;
      opacity: 1 !important;
    }
    
    .music-cover-change-btn:hover {
      background: rgba(29, 185, 84, 1) !important;
      color: white !important;
      transform: none !important;
      box-shadow: none !important;
    }
    
    .music-cover-change-btn i {
      margin-right: 5px !important;
      font-size: 14px !important;
      color: white !important;
    }
    
    .dark-mode .music-cover-change-btn,
    .light-mode .music-cover-change-btn {
      background: rgba(29, 185, 84, 0.8) !important;
      color: white !important;
    }
    
    .dark-mode .music-cover-change-btn:hover,
    .light-mode .music-cover-change-btn:hover {
      background: rgba(29, 185, 84, 1) !important;
      color: white !important;
    }
    
    /* Стили для модального окна кадрирования */
    .crop-modal {
      display: none;
      position: fixed;
      z-index: 2100;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.8);
      align-items: center;
      justify-content: center;
    }
    
    .crop-modal.active {
      display: flex;
    }
    
    .crop-container {
      background-color: var(--sidebar-bg);
      padding: 20px;
      border-radius: 10px;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    
    .crop-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    
    .crop-title {
      margin: 0;
      font-size: 18px;
    }
    
    .crop-close {
      background: none;
      border: none;
      font-size: 24px;
      color: var(--text-color);
      cursor: pointer;
    }
    
    .crop-area {
      width: 100%;
      height: 300px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    
    .crop-img {
      max-width: 100%;
      display: block;
    }
    
    .crop-controls {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .crop-zoom {
      display: flex;
      align-items: center;
    }
    
    .zoom-slider {
      flex: 1;
      margin: 0 10px;
    }
    
    .crop-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    
    .crop-btn {
      padding: 8px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.2s;
    }
    
    .crop-btn.cancel {
      background-color: transparent;
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: var(--text-color);
    }
    
    .crop-btn.cancel:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .crop-btn.apply {
      background-color: #1db954;
      border: none;
      color: white;
    }
    
    .crop-btn.apply:hover {
      background-color: #1ed760;
    }
    
    #track-file {
      margin-bottom: 15px;
      width: 100%;
    }
    
    .track-details {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .track-details input {
      flex: 1;
      padding: 10px;
      border-radius: 5px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--text-color, #fff);
    }
    
    #upload-button {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 5px;
      background-color: #1db954;
      color: white;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    #upload-button:hover {
      background-color: #1ed760;
    }
    
    .upload-progress {
      margin-top: 20px;
    }
    
    #upload-status {
      margin-top: 10px;
      text-align: center;
    }
    
    /* Адаптивность для мобильных устройств */
    @media (max-width: 768px) {
      .modal-music-content {
        width: 95%;
        margin: 5% auto;
        flex-direction: column;
      }
      
      .modal-sidebar {
        width: 100%;
        min-width: 100%;
        padding-right: 0;
        margin-right: 0;
        border-right: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 15px;
        margin-bottom: 15px;
        max-height: none;
      }
      
      .playlist {
        max-height: 200px;
      }
      
      #track-list {
        max-height: 150px;
      }
      
      .modal-body {
        padding-left: 0;
      }
      
      .now-playing {
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      
      #album-cover {
        margin-right: 0;
        margin-bottom: 15px;
      }
      
      .track-details {
        flex-direction: column;
      }
    }

    /* Стили для поиска музыки */
    .search-container {
      padding: 15px;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .search-header {
      margin-bottom: 20px;
    }
    
    .search-header h3 {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 18px;
    }
    
    .search-form {
      margin-bottom: 20px;
    }
    
    .search-input-wrapper {
      display: flex;
      width: 100%;
    }
    
    #search-input {
      flex: 1;
      padding: 10px 15px;
      border-radius: 5px 0 0 5px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background-color: rgba(255, 255, 255, 0.1);
      color: var(--text-color, #fff);
      font-size: 14px;
    }
    
    #search-button {
      width: 50px;
      background-color: #1db954;
      color: white;
      border: none;
      border-radius: 0 5px 5px 0;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    
    #search-button:hover {
      background-color: #1ed760;
    }
    
    .music-search-results {
      flex: 1;
      overflow-y: auto;
    }
    
    .music-search-results h4 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 16px;
    }
    
    #search-results-list {
      list-style-type: none;
      padding: 0;
      margin: 0;
    }
    
    .search-result-item {
      padding: 12px;
      border-radius: 5px;
      margin-bottom: 8px;
      background-color: rgba(255, 255, 255, 0.05);
      display: flex;
      align-items: center;
      gap: 12px;
      transition: background-color 0.2s;
    }
    
    .search-result-item:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .search-result-cover {
      width: 50px;
      height: 50px;
      border-radius: 4px;
      overflow: hidden;
      flex-shrink: 0;
    }
    
    .search-result-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .search-result-info {
      flex: 1;
      overflow: hidden;
    }
    
    .search-result-title {
      font-weight: bold;
      margin: 0 0 4px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .search-result-artist {
      font-size: 12px;
      opacity: 0.8;
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .search-result-actions {
      display: flex;
      gap: 8px;
    }
    
    .search-play-button,
    .search-add-button {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #1db954;
      color: white;
      border: none;
      cursor: pointer;
      transition: transform 0.2s, background-color 0.2s;
    }
    
    .search-play-button:hover,
    .search-add-button:hover {
      background-color: #1ed760;
      transform: scale(1.1);
    }
    
    /* Стили для кнопки, когда трек уже в плейлисте */
    .search-add-button.in-playlist {
      background-color: #1a9048;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
    }
    
    .search-add-button.in-playlist:hover {
      background-color: #e74c3c;
    }
    
    .search-play-button i,
    .search-add-button i {
      font-size: 14px;
    }
    
    .no-results {
      padding: 20px;
      text-align: center;
      color: rgba(255, 255, 255, 0.6);
      font-style: italic;
    }
    
    /* Адаптивность для мобильных устройств */
    @media (max-width: 768px) {
      .search-result-item {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .search-result-cover {
        width: 80px;
        height: 80px;
      }
      
      .search-result-actions {
        margin-top: 10px;
        width: 100%;
        justify-content: flex-end;
      }
    }
  `;
  document.head.appendChild(musicPlayerStyles);

  // Получаем элементы
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const miniAvatar = document.getElementById('mini-user-avatar');
  const chevronRight = document.getElementById('chevron-right');
  const chevronLeft = document.getElementById('chevron-left');

  // Принудительно устанавливаем классы для иконок, чтобы они были одинаковыми на всех страницах
  document.querySelector('#home-button i').className = 'fas fa-home';
  document.querySelector('#home-button-compact i').className = 'fas fa-home';
  document.querySelector('#profile-button i').className = 'fas fa-user';
  document.querySelector('#profile-button-compact i').className = 'fas fa-user';
  document.querySelector('#messages-button i').className = 'fas fa-envelope';
  document.querySelector('#messages-button-compact i').className = 'fas fa-envelope';
  document.querySelector('#music-button i').className = 'fas fa-music';
  document.querySelector('#music-button-compact i').className = 'fas fa-music';
  document.querySelector('#groups-button i').className = 'fas fa-users';
  document.querySelector('#groups-button-compact i').className = 'fas fa-users';
  document.querySelector('#logout i').className = 'fas fa-sign-out-alt';

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

  // Очищаем активные классы со всех кнопок
  document.querySelectorAll('.nav-button').forEach(button => {
    button.classList.remove('active');
  });

  // Определяем текущую страницу
  const currentUrl = window.location.href;
  const currentPage = currentUrl.split('/').pop().split('?')[0]; // Получаем имя страницы без параметров

  // Активируем соответствующую кнопку
  // Для домашней страницы
  if (currentPage === 'home.html') {
    document.getElementById('home-button').classList.add('active');
    document.getElementById('home-button-compact').classList.add('active');
  }
  // Для страницы профиля
  else if (currentPage === 'profile.html') {
    // Проверяем, находимся ли мы на своем профиле
    const userData = JSON.parse(localStorage.getItem('userData'));
    const currentUrl = new URL(window.location.href);
    const currentProfileId = currentUrl.searchParams.get('id');
    
    // Добавляем класс active только если это наш профиль
    if (userData && userData.numericId && currentProfileId === userData.numericId.toString()) {
      document.getElementById('profile-button').classList.add('active');
      document.getElementById('profile-button-compact').classList.add('active');
    }
  }
  // Для страницы сообщений
  else if (currentPage === 'messages.html') {
    document.getElementById('messages-button').classList.add('active');
    document.getElementById('messages-button-compact').classList.add('active');
  }
  // Для страницы музыки
  else if (currentPage === 'music.html') {
    document.getElementById('music-button').classList.add('active');
    document.getElementById('music-button-compact').classList.add('active');
  }
  // Для страницы групп
  else if (currentPage === 'groups.html') {
    document.getElementById('groups-button').classList.add('active');
    document.getElementById('groups-button-compact').classList.add('active');
  }
  // Для страницы одной группы
  else if (currentPage === 'group.html') {
    document.getElementById('groups-button').classList.add('active');
    document.getElementById('groups-button-compact').classList.add('active');
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

  // Обработчики навигации для кнопок сообщений (полной и компактной версии)
  const navigateToMessages = () => {
    const currentPath = new URL(window.location.href).pathname;
    if (!currentPath.endsWith('/messages.html') && !currentPath.endsWith('messages.html')) {
      window.location.href = 'messages.html';
    }
  };

  document.getElementById('messages-button').addEventListener('click', navigateToMessages);
  document.getElementById('messages-button-compact').addEventListener('click', navigateToMessages);

  // Обработчики навигации для кнопок музыки (полной и компактной версии)
  const navigateToMusic = () => {
    // Открываем модальное окно music-player-modal
    openModal();
  };

  document.getElementById('music-button').addEventListener('click', navigateToMusic);
  document.getElementById('music-button-compact').addEventListener('click', navigateToMusic);

  // Обработчики навигации для кнопок групп (полной и компактной версии)
  const navigateToGroups = () => {
    const currentPath = new URL(window.location.href).pathname;
    if (!currentPath.endsWith('/groups.html') && !currentPath.endsWith('groups.html')) {
      window.location.href = 'groups.html';
    }
  };

  document.getElementById('groups-button').addEventListener('click', navigateToGroups);
  document.getElementById('groups-button-compact').addEventListener('click', navigateToGroups);

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

  // Переменная для хранения исходного состояния сайдбара
  let originalSidebarState = localStorage.getItem('originalSidebarState');
  let wasInMobileMode = window.innerWidth <= 768;

  // Добавляем обработчик изменения размера окна для адаптации сайдбара
  window.addEventListener('resize', () => {
    const mobileBreakpoint = 768;
    const isNowMobile = window.innerWidth <= mobileBreakpoint;
    
    // Переход с десктопа на мобильное разрешение
    if (isNowMobile && !wasInMobileMode) {
      // Сохраняем оригинальное состояние сайдбара перед переходом в мобильное разрешение
      originalSidebarState = sidebar.classList.contains('collapsed') ? 'collapsed' : 'expanded';
      localStorage.setItem('originalSidebarState', originalSidebarState);
      
      // На мобильных устройствах автоматически сворачиваем сайдбар
      if (!sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        sidebarToggle.classList.add('collapsed');
        miniAvatar.style.display = 'block';
        localStorage.setItem('sidebarCollapsed', 'true');
      }
    } 
    // Переход с мобильного на десктопное разрешение
    else if (!isNowMobile && wasInMobileMode) {
      // Восстанавливаем оригинальное состояние сайдбара
      if (originalSidebarState === 'expanded') {
        sidebar.classList.remove('collapsed');
        sidebarToggle.classList.remove('collapsed');
        miniAvatar.style.display = 'none';
        localStorage.setItem('sidebarCollapsed', 'false');
      }
    }
    
    // Обновляем флаг мобильного режима
    wasInMobileMode = isNowMobile;
  });
  
  // Проверяем размер экрана при загрузке
  const mobileBreakpoint = 768;
  if (window.innerWidth <= mobileBreakpoint && !sidebar.classList.contains('collapsed')) {
    // Сохраняем оригинальное состояние
    originalSidebarState = 'expanded';
    localStorage.setItem('originalSidebarState', originalSidebarState);
    
    // Сворачиваем на мобильном
    sidebar.classList.add('collapsed');
    sidebarToggle.classList.add('collapsed');
    miniAvatar.style.display = 'block';
    localStorage.setItem('sidebarCollapsed', 'true');
  }

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
    display: flex;
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
				position: absolute;
				right: 3%;
				bottom: calc(100vh - 57px); /* Исходное значение: 610px. Рассчитано для сохранения отступа от верха как на iPhone SE (экран ~667px): 57px = 667px - 610px. */
        border: 1px solid white; /* Новая обводка */
      }
      
      /* Скрываем на странице сообщений */
      .messages-page #mini-user-avatar-phone {
        display: none !important;
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

    /* Стили для списка треков */
    #track-list li {
      padding: 10px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    #track-list li:hover {
      background-color: rgba(var(--sidebar-bg-rgb), 0.1);
    }

    #track-list li.active {
      background-color: rgba(var(--sidebar-bg-rgb), 0.2);
    }

    .track-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .main-info {
      font-weight: 500;
    }

    .owner-info {
      color: inherit;
    }
  `;
  document.head.appendChild(rootVarsStyle);

  // Инициализация плеера и обработчиков событий
  const musicPlayerModal = document.getElementById('music-player-modal');
  const closeModal = document.querySelector('.close-music-modal');
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Firebase для треков
  const storage = getStorage();
  
  // Аудио элемент для воспроизведения музыки
  // Используем существующий глобальный элемент или создаем новый
  const audioPlayer = globalAudioPlayer || new Audio();
  globalAudioPlayer = audioPlayer;
  
  // Переменные состояния плеера
  let currentTrackIndex = -1;
  let tracks = [];
  let isPlaying = false;
  let isLoadingTrack = false;
  let playerRestored = false;
  
  // Функция для форматирования времени в формат MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }
  
  // Функция для обновления интерфейса плеера
  function _updatePlayerInterface(track) {
    console.log("Обновление интерфейса плеера для трека:", track);
    
    // Обновляем обложку трека
    const albumCover = document.getElementById('album-cover');
    if (albumCover && track.cover) {
      albumCover.src = track.cover;
    } else if (albumCover) {
      albumCover.src = DEFAULT_ALBUM_COVER;
    }
    
    // Обновляем название трека
    const trackName = document.getElementById('track-name');
    if (trackName) {
      trackName.textContent = track.title || 'Неизвестный трек';
    }
    
    // Обновляем имя исполнителя
    const artistName = document.getElementById('artist-name');
    if (artistName) {
      artistName.textContent = track.artist || 'Неизвестный исполнитель';
    }
    
    // Обновляем индикатор текущего трека в компактной кнопке музыки
    const musicButtonCompact = document.getElementById('music-button-compact');
    if (musicButtonCompact) {
      // Удаляем существующий индикатор, если он есть
      const existingIndicator = musicButtonCompact.querySelector('.playing-indicator');
      if (existingIndicator) {
        existingIndicator.remove();
      }
      
      // Создаем новый индикатор с информацией о треке
      const indicator = document.createElement('div');
      indicator.className = 'playing-indicator';
      
      // Добавляем индикатор в кнопку
      musicButtonCompact.appendChild(indicator);
      
      // Добавляем класс playing к кнопке, если трек воспроизводится
      if (isPlaying) {
        musicButtonCompact.classList.add('playing');
      } else {
        musicButtonCompact.classList.remove('playing');
      }
    }
    
    // Сбрасываем таймер
    const currentTime = document.getElementById('current-time');
    if (currentTime) {
      currentTime.textContent = '0:00';
    }
    
    // Сбрасываем полосу прогресса
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) {
      progressBar.value = 0;
      progressBar.style.setProperty('--progress-width', '0%');
    }
    
    // Обновляем общую длительность
    const totalTime = document.getElementById('total-time');
    if (totalTime) {
      totalTime.textContent = '0:00';
    }
    
    // Обновляем кнопку воспроизведения
    const playPauseButton = document.getElementById('play-pause-button');
    if (playPauseButton) {
      playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
      playPauseButton.classList.remove('playing');
    }
    
    // Обновляем заголовок документа
    document.title = `${track.title || 'Музыка'} - ${track.artist || 'Плеер'}`;
    
    // Подсвечиваем трек в плейлисте и результатах поиска
    if (typeof updateActiveTrackUI === 'function') {
        updateActiveTrackUI(track.id);
    }
  }
  window._updatePlayerInterface = _updatePlayerInterface; // Явно присваиваем window
  
  // Модифицируем функцию _instantLoadTrack, чтобы она обновляла активные элементы в результатах поиска
  function _instantLoadTrack(track, currentTime, shouldPlay) {
    if (!track || !track.url) return false;
    
    try {
      // Проверяем, не загружен ли уже этот трек с тем же URL
      const isSameTrack = globalCurrentTrackId === track.id && audioPlayer.src === track.url;
      
      // Обновляем интерфейс в любом случае
      _updatePlayerInterface(track);
      
      // Обновляем глобальный ID трека
      globalCurrentTrackId = track.id;
      
      // Обновляем активные элементы в плейлисте и результатах поиска
      updateActiveTrackUI(track.id);
      
      // Если это тот же самый трек, мы только обновляем текущее время и состояние
      if (isSameTrack) {
        console.log('Трек уже загружен, обновляем только время и состояние воспроизведения');
        
        // Устанавливаем текущее время, если оно указано и отличается от текущего
        if (currentTime !== undefined && !isNaN(currentTime) && 
            Math.abs(audioPlayer.currentTime - currentTime) > 1) {
          audioPlayer.currentTime = currentTime;
        }
        
        // Кэшируем данные трека для быстрого доступа
        localStorage.setItem(`trackCache_${track.id}`, JSON.stringify(track));
        
        // Если нужно, сразу начинаем воспроизведение
        if (shouldPlay && audioPlayer.paused) {
          audioPlayer.play()
            .then(() => {
              isPlaying = true;
              updatePlayButton();
            })
            .catch(error => {
              console.error('Ошибка воспроизведения:', error);
              isPlaying = false;
              updatePlayButton();
            });
        } else if (!shouldPlay && !audioPlayer.paused) {
          audioPlayer.pause();
          isPlaying = false;
          updatePlayButton();
        }
        
        return true;
      }
      
      // Если это другой трек, загружаем его полностью
      
      // Устанавливаем URL трека
      audioPlayer.src = track.url;
      
      // Устанавливаем текущее время
      if (currentTime && !isNaN(currentTime)) {
        audioPlayer.currentTime = currentTime;
      } else {
        audioPlayer.currentTime = 0;
      }
      
      // Кэшируем данные трека для быстрого доступа
      localStorage.setItem(`trackCache_${track.id}`, JSON.stringify(track));
      
      // Если нужно, сразу начинаем воспроизведение
      if (shouldPlay) {
        audioPlayer.play()
          .then(() => {
            isPlaying = true;
            updatePlayButton();
          })
          .catch(error => {
            console.error('Ошибка воспроизведения:', error);
            isPlaying = false;
            updatePlayButton();
          });
      } else {
        isPlaying = false;
        updatePlayButton();
      }
      
      return true;
    } catch (error) {
      console.error('Ошибка при загрузке трека:', error);
      return false;
    }
  }
  
  // Функция загрузки трека по индексу
  function loadTrack(index) {
    if (index < 0 || index >= tracks.length) return false;
    if (isLoadingTrack) return false;
    
    try {
      isLoadingTrack = true;
      currentTrackIndex = index;
      const track = tracks[index];
      
      // Сохраняем ID текущего трека
      localStorage.setItem('currentTrackId', track.id);
      
      return _instantLoadTrack(track, 0, false);
    } catch (error) {
      console.error('Ошибка при загрузке трека:', error);
      return false;
    } finally {
      isLoadingTrack = false;
    }
  }
  
  // Функция воспроизведения
  function playTrack() {
    if (currentTrackIndex === -1 && tracks.length > 0) {
      // Если ничего не выбрано, начинаем с первого трека
      currentTrackIndex = 0;
      loadTrack(currentTrackIndex);
    }
    
    // Получаем целевую громкость из слайдера или используем значение по умолчанию
    const volumeSlider = document.getElementById('volume-slider');
    const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
    
    // Временно устанавливаем громкость в ноль для эффекта fade-in
    const originalVolume = audioPlayer.volume;
    audioPlayer.volume = 0;
    
    audioPlayer.play()
      .then(() => {
        isPlaying = true;
        
        // Применяем эффект плавного нарастания громкости
        fadeIn(audioPlayer, FADE_DURATION, targetVolume);
        
        updatePlayButton();
        // Обновляем кнопку в результатах поиска для текущего трека
        if (globalCurrentTrackId) {
          const searchPlayButton = document.querySelector(`.search-result-item[data-id="${globalCurrentTrackId}"] .search-play-button`);
          if (searchPlayButton) {
            searchPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
            searchPlayButton.classList.add('playing');
          }
        }
        savePlayerState();
      })
      .catch(error => {
        console.error('Ошибка воспроизведения:', error);
        isPlaying = false;
        // Восстанавливаем громкость в случае ошибки
        audioPlayer.volume = originalVolume;
        updatePlayButton();
      });
  }
  
  // Функция паузы
  function pauseTrack() {
    // Применяем эффект плавного затухания звука перед паузой
    fadeOut(audioPlayer, FADE_DURATION, () => {
      audioPlayer.pause();
      
      // Восстанавливаем громкость после паузы для следующего воспроизведения
      const volumeSlider = document.getElementById('volume-slider');
      const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
      audioPlayer.volume = targetVolume;
    });
    
    isPlaying = false;
    updatePlayButton();
    
    // Обновляем кнопку в результатах поиска для текущего трека
    if (globalCurrentTrackId) {
      const searchPlayButton = document.querySelector(`.search-result-item[data-id="${globalCurrentTrackId}"] .search-play-button`);
      if (searchPlayButton) {
        searchPlayButton.innerHTML = '<i class="fas fa-play"></i>';
        searchPlayButton.classList.remove('playing');
      }
    }
    savePlayerState();
  }
  
  // Функция обновления кнопки воспроизведения/паузы
  function updatePlayButton() {
    const playButton = document.getElementById('play-button');
    if (playButton) {
      if (isPlaying) {
        playButton.innerHTML = '<i class="fas fa-pause"></i>';
      } else {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
      }
    }
    
    // Обновляем статус воспроизведения в компактной кнопке музыки
    const musicButtonCompact = document.getElementById('music-button-compact');
    if (musicButtonCompact) {
      if (isPlaying) {
        musicButtonCompact.classList.add('playing');
        // Показываем внутренний индикатор
        const indicator = musicButtonCompact.querySelector('.playing-indicator');
        if (indicator) {
          indicator.style.display = 'block';
        }
      } else {
        musicButtonCompact.classList.remove('playing');
        // Скрываем внутренний индикатор
        const indicator = musicButtonCompact.querySelector('.playing-indicator');
        if (indicator) {
          indicator.style.display = 'none';
        }
      }
    }
    
    // Обновляем кнопки в результатах поиска
    if (globalCurrentTrackId) {
      // Сначала сбрасываем все кнопки
      document.querySelectorAll('.search-play-button').forEach(btn => {
        btn.innerHTML = '<i class="fas fa-play"></i>';
        btn.classList.remove('playing');
      });
      
      // Затем обновляем кнопку текущего трека
      const searchPlayButton = document.querySelector(`.search-result-item[data-id="${globalCurrentTrackId}"] .search-play-button`);
      if (searchPlayButton && isPlaying) {
        searchPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
        searchPlayButton.classList.add('playing');
      }
    }
    
    // Добавляем вызов для синхронизации UI активного трека
    if (typeof updateActiveTrackUI === 'function') {
      updateActiveTrackUI(globalCurrentTrackId);
    }
  }
  
  // Функция сохранения состояния плеера
  function savePlayerState() {
    if (!globalCurrentTrackId) return;
    
    // Создаем объект состояния
    const state = {
      isPlaying: isPlaying || (globalAudioPlayer && !globalAudioPlayer.paused),
      volume: audioPlayer.volume,
      currentTime: audioPlayer.currentTime,
      currentTrackIndex: currentTrackIndex,
      trackId: globalCurrentTrackId,
      timestamp: Date.now(),
      // Добавляем флаг, указывающий, находится ли трек в плейлисте пользователя
      isInPlaylist: tracks.some(track => track.id === globalCurrentTrackId)
    };
    
    // Сохраняем в localStorage и sessionStorage
    localStorage.setItem('musicPlayerState', JSON.stringify(state));
    sessionStorage.setItem('musicPlayerState', JSON.stringify(state));
    
    // Сохраняем текущий трек отдельно для быстрого доступа
    if (state.trackId) {
      localStorage.setItem('currentTrackId', state.trackId);
      // Сохраняем флаг, находится ли трек в плейлисте
      localStorage.setItem('currentTrackInPlaylist', state.isInPlaylist ? 'true' : 'false');
    }
    
    // Сохраняем самое точное время воспроизведения в History API State
    if (window.history && window.history.replaceState) {
      // Получаем текущее состояние истории, чтобы не перезаписать другие данные
      const historyState = window.history.state || {};
      
      // Обновляем только аудио параметры
      historyState.audioTime = audioPlayer.currentTime;
      historyState.isPlaying = state.isPlaying;
      historyState.audioVolume = audioPlayer.volume;
      historyState.trackId = state.trackId;
      historyState.isInPlaylist = state.isInPlaylist;
      
      // Заменяем состояние без изменения URL
      window.history.replaceState(historyState, document.title, window.location.href);
    }
    
    // Запоминаем время последнего обновления
    lastUpdateTime = Date.now();
  }

  // Добавляем обработчик для частого обновления состояния плеера
  audioPlayer.addEventListener('timeupdate', () => {
    // Обновляем состояние не чаще чем раз в 1 секунду для производительности
    if (Date.now() - lastUpdateTime > 1000) {
      savePlayerState();
    }
  });

  // Обновляем прогресс воспроизведения
  audioPlayer.addEventListener('timeupdate', () => {
    const currentTimeElement = document.getElementById('current-time');
    const durationElement = document.getElementById('duration');
    const progressElement = document.querySelector('.progress');
    
    if (currentTimeElement && durationElement && progressElement) {
      // Обновляем текущее время
      currentTimeElement.textContent = formatTime(audioPlayer.currentTime);
      
      // Обновляем продолжительность
      if (!isNaN(audioPlayer.duration)) {
        durationElement.textContent = formatTime(audioPlayer.duration);
        
        // Обновляем прогресс-бар
        const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressElement.style.width = `${percent}%`;
      }
    }
  });
  
  // Функция загрузки состояния плеера
  function loadPlayerState() {
    // Сначала проверяем, было ли уже запущено воспроизведение напрямую
    if (globalAudioPlayer && !globalAudioPlayer.paused && globalCurrentTrackId) {
      // Воспроизведение уже идет, просто обновляем состояние
      isPlaying = true;
      
      // Находим индекс текущего трека в списке, если список уже загружен
      if (tracks.length > 0) {
        const trackIndex = tracks.findIndex(t => t.id === globalCurrentTrackId);
        if (trackIndex !== -1) {
          currentTrackIndex = trackIndex;
          // Обновляем интерфейс без перезагрузки источника
          _updatePlayerInterface(tracks[trackIndex]);
          updatePlayButton();
          playerRestored = true;
          return true;
        }
      }
    }
    
    if (playerRestored) {
      console.log('Плеер уже восстановлен, пропускаем повторную загрузку');
      return true;
    }
    
    const stateJson = sessionStorage.getItem('musicPlayerState') || localStorage.getItem('musicPlayerState');
    if (!stateJson) return false;
      
    try {
      const state = JSON.parse(stateJson);
      
      // Обновляем переменные состояния
      audioPlayer.volume = state.volume || 1;
      isPlaying = state.isPlaying;
      
      // Обновляем интерфейс без ожидания отрисовки
      const volumeSlider = document.getElementById('volume-slider');
      if (volumeSlider) {
        const volumeValue = audioPlayer.volume * 100;
        volumeSlider.value = volumeValue;
        volumeSlider.style.setProperty('--volume-percentage', `${volumeValue}%`);
        // Обновляем иконку громкости при загрузке состояния
        updateVolumeIcon(volumeValue);
      }
      
      // Получаем информацию о треке
      const savedTrackId = state.trackId || localStorage.getItem('currentTrackId') || globalCurrentTrackId;
      
      // Если текущий трек уже тот же самый, просто обновляем UI без воспроизведения
      if (globalCurrentTrackId === savedTrackId) {
        console.log('Трек уже загружен, только обновляем UI');
        // Если аудио пока не играет, но должно играть
        if (isPlaying && audioPlayer.paused) {
          // Устанавливаем текущее время и затем продолжаем воспроизведение
          if (state.currentTime && !isNaN(state.currentTime)) {
            audioPlayer.currentTime = state.currentTime;
          }
          audioPlayer.play().catch(error => {
            console.error('Ошибка при продолжении воспроизведения:', error);
            isPlaying = false;
          });
        } 
        // Если аудио играет, но должно быть на паузе
        else if (!isPlaying && !audioPlayer.paused) {
          audioPlayer.pause();
        }
        
        // Обновляем интерфейс
        updatePlayButton();
        playerRestored = true;
        return true;
      }
      
      const isInPlaylist = state.isInPlaylist !== undefined ? 
                           state.isInPlaylist : 
                           localStorage.getItem('currentTrackInPlaylist') === 'true';
      
      // Если трек в плейлисте, пытаемся его воспроизвести из плейлиста
      if (isInPlaylist && tracks.length > 0) {
        // Найдем трек по ID в плейлисте пользователя
        if (savedTrackId) {
          const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
          if (trackIndex !== -1) {
            // Проверяем, воспроизводится ли уже этот трек
            if (globalCurrentTrackId === savedTrackId && !audioPlayer.paused) {
              // Трек уже воспроизводится, просто обновляем текущий индекс
              currentTrackIndex = trackIndex;
              _updatePlayerInterface(tracks[trackIndex]);
              playerRestored = true;
              return true;
            } else {
              // Загружаем трек без автоматического воспроизведения
              _updatePlayerInterface(tracks[trackIndex]);
              audioPlayer.src = tracks[trackIndex].url;
              globalCurrentTrackId = tracks[trackIndex].id;
              updateActiveTrackUI(tracks[trackIndex].id);
              
              // Устанавливаем текущее время
              if (state.currentTime && !isNaN(state.currentTime)) {
                audioPlayer.currentTime = state.currentTime;
              } else {
                audioPlayer.currentTime = 0;
              }
              
              // Начинаем воспроизведение только если оно было активно
              if (state.isPlaying) {
                audioPlayer.play().then(() => {
                  isPlaying = true;
                  updatePlayButton();
                }).catch(error => {
                  console.error('Ошибка при воспроизведении:', error);
                  isPlaying = false;
                  updatePlayButton();
                });
              } else {
                isPlaying = false;
                updatePlayButton();
              }
              
              currentTrackIndex = trackIndex;
              playerRestored = true;
              sessionStorage.setItem('audioRestored', 'true');
              return true;
            }
          } else {
            console.log('Трек не найден в плейлисте пользователя');
          }
        }
        // Поддержка старого формата - загрузка по индексу
        else if (state.currentTrackIndex >= 0 && state.currentTrackIndex < tracks.length) {
          currentTrackIndex = state.currentTrackIndex;
          const trackToLoad = tracks[currentTrackIndex];
          
          if (trackToLoad) {
            // Загружаем трек без автоматического воспроизведения
            _updatePlayerInterface(trackToLoad);
            audioPlayer.src = trackToLoad.url;
            globalCurrentTrackId = trackToLoad.id;
            updateActiveTrackUI(trackToLoad.id);
            
            // Устанавливаем текущее время
            if (state.currentTime && !isNaN(state.currentTime)) {
              audioPlayer.currentTime = state.currentTime;
            } else {
              audioPlayer.currentTime = 0;
            }
            
            // Начинаем воспроизведение только если оно было активно
            if (state.isPlaying) {
              audioPlayer.play().then(() => {
                isPlaying = true;
                updatePlayButton();
              }).catch(error => {
                console.error('Ошибка при воспроизведении:', error);
                isPlaying = false;
                updatePlayButton();
              });
            } else {
              isPlaying = false;
              updatePlayButton();
            }
            
            playerRestored = true;
            sessionStorage.setItem('audioRestored', 'true');
            return true;
          }
        }
      } 
      // Если трек НЕ в плейлисте, пытаемся восстановить его из кэша
      else if (savedTrackId) {
        console.log('Трек не находится в плейлисте пользователя, пытаемся восстановить из кэша');
        
        // Попытка получить трек из кэша
        const cachedTrackJson = localStorage.getItem(`trackCache_${savedTrackId}`);
        if (cachedTrackJson) {
          try {
            const cachedTrack = JSON.parse(cachedTrackJson);
            if (cachedTrack && cachedTrack.url) {
              console.log('Восстанавливаем трек из кэша:', cachedTrack);
              
              // Загружаем трек из кэша без автоматического воспроизведения
              _updatePlayerInterface(cachedTrack);
              audioPlayer.src = cachedTrack.url;
              globalCurrentTrackId = cachedTrack.id;
              updateActiveTrackUI(cachedTrack.id);
              
              // Устанавливаем текущее время
              if (state.currentTime && !isNaN(state.currentTime)) {
                audioPlayer.currentTime = state.currentTime;
              } else {
                audioPlayer.currentTime = 0;
              }
              
              // Начинаем воспроизведение только если оно было активно
              if (state.isPlaying) {
                audioPlayer.play().then(() => {
                  isPlaying = true;
                  updatePlayButton();
                }).catch(error => {
                  console.error('Ошибка при воспроизведении:', error);
                  isPlaying = false;
                  updatePlayButton();
                });
              } else {
                isPlaying = false;
                updatePlayButton();
              }
              
              // Успешно загрузили трек
              playerRestored = true;
              sessionStorage.setItem('audioRestored', 'true');
              return true;
            }
          } catch (e) {
            console.error('Ошибка при восстановлении трека из кэша:', e);
          }
        } else {
          console.log('Кэш трека не найден:', savedTrackId);
        }
      }
    } catch (error) {
      console.error('Ошибка при загрузке состояния плеера:', error);
    }
    return false;
  }
  
  // Функция для обновления списка треков
  function updateTrackList() {
    const trackList = document.getElementById('track-list');
    const extendedTrackList = document.getElementById('extended-track-list');
    
    if (!trackList || !extendedTrackList) return;
    
    // Очищаем оба списка
    trackList.innerHTML = '';
    extendedTrackList.innerHTML = '';
    
    if (tracks.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = 'Нет доступных треков';
      emptyItem.style.opacity = '0.7';
      emptyItem.style.cursor = 'default';
      trackList.appendChild(emptyItem);
      
      const emptyExtendedItem = document.createElement('li');
      emptyExtendedItem.textContent = 'Ваш плейлист пуст. Добавьте треки через поиск или загрузите свои.';
      emptyExtendedItem.className = 'no-tracks-message';
      emptyExtendedItem.style.padding = '20px';
      emptyExtendedItem.style.textAlign = 'center';
      emptyExtendedItem.style.opacity = '0.7';
      extendedTrackList.appendChild(emptyExtendedItem);
      return;
    }
    
    // Функция для форматирования даты
    const formatDate = (timestamp) => {
      if (!timestamp) return 'Неизвестно';
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    };
    
    tracks.forEach((track, index) => {
      // Обновляем обычный список треков (в сайдбаре)
      const li = document.createElement('li');
      
      // Создаем контейнер для информации о треке
      const trackInfo = document.createElement('div');
      trackInfo.className = 'track-info';
      
      // Основная информация о треке
      const mainInfo = document.createElement('div');
      mainInfo.className = 'main-info';
      mainInfo.textContent = `${track.title} - ${track.artist}`;
      
      // Информация о владельце
      const ownerInfo = document.createElement('div');
      ownerInfo.className = 'owner-info';
      ownerInfo.textContent = `Добавлено пользователем: ${track.userName || track.userId}`;
      ownerInfo.style.fontSize = '0.8em';
      ownerInfo.style.opacity = '0.7';
      
      // Добавляем информацию в контейнер
      trackInfo.appendChild(mainInfo);
      trackInfo.appendChild(ownerInfo);
      
      // Добавляем контейнер в элемент списка
      li.appendChild(trackInfo);
      
      li.dataset.id = track.id;
      li.dataset.trackId = track.id;
      li.dataset.index = index;
      
      // Если это текущий трек, выделяем его
      if (track.id === globalCurrentTrackId) {
        li.classList.add('active');
      }
      
      // Добавляем обработчик клика
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Получаем индекс трека из атрибута
        const trackId = li.dataset.id;
        const trackIndex = tracks.findIndex(t => t.id === trackId);
        
        if (trackIndex !== -1) {
          // Проверяем, является ли это текущим воспроизводимым треком
          const isCurrentTrack = (trackId === globalCurrentTrackId);
          
          // Если это текущий трек - переключаем воспроизведение/паузу
          if (isCurrentTrack) {
            if (isPlaying) {
              // Ставим на паузу
              audioPlayer.pause();
              isPlaying = false;
              updatePlayButton();
              // Обновляем кнопки в результатах поиска
              document.querySelectorAll(`.search-result-item[data-id="${trackId}"] .search-play-button`).forEach(btn => {
                btn.innerHTML = '<i class="fas fa-play"></i>';
                btn.classList.remove('playing');
              });
            } else {
              // Возобновляем воспроизведение
              audioPlayer.play()
                .then(() => {
                  isPlaying = true;
                  updatePlayButton();
                  // Обновляем кнопки в результатах поиска
                  document.querySelectorAll(`.search-result-item[data-id="${trackId}"] .search-play-button`).forEach(btn => {
                    btn.innerHTML = '<i class="fas fa-pause"></i>';
                    btn.classList.add('playing');
                  });
                })
                .catch(error => {
                  console.error('Ошибка при воспроизведении:', error);
                });
            }
            return;
          }
          
          // Прекращаем текущее воспроизведение перед загрузкой
          if (audioPlayer) audioPlayer.pause();
          
          // Обновляем визуальный выбор в обоих списках
          document.querySelectorAll('#track-list li, #extended-track-list li').forEach(item => {
            item.classList.remove('active');
          });
          li.classList.add('active');
          
          // Находим элемент в расширенном списке и активируем его
          const extendedItem = document.querySelector(`#extended-track-list li[data-id="${trackId}"]`);
          if (extendedItem) {
            extendedItem.classList.add('active');
          }
          
          // Быстро загружаем и автоматически воспроизводим выбранный трек
          if (_instantLoadTrack(tracks[trackIndex], 0, true)) {
            currentTrackIndex = trackIndex;
            isPlaying = true;
            updatePlayButton();
            
            // Обновляем кнопки в результатах поиска
            document.querySelectorAll(`.search-result-item[data-id="${trackId}"] .search-play-button`).forEach(btn => {
              btn.innerHTML = '<i class="fas fa-pause"></i>';
              btn.classList.add('playing');
            });
            
            savePlayerState();
          }
        }
      });
      
      trackList.appendChild(li);
      
      // Добавляем трек в расширенный список
      const extendedLi = document.createElement('li');
      extendedLi.className = 'extended-track-item';
      if (track.id === globalCurrentTrackId) {
        extendedLi.classList.add('active');
      }
      extendedLi.dataset.id = track.id;
      extendedLi.dataset.index = index;
      
      extendedLi.innerHTML = `
        <div class="track-cover">
          <img src="${track.cover || DEFAULT_ALBUM_COVER}" alt="${track.title}">
        </div>
        <div class="extended-track-details">
          <h4 class="extended-track-title">${track.title}</h4>
          <p class="extended-track-artist">${track.artist}</p>
          <div class="extended-track-meta">
            <span class="extended-track-owner">Автор: ${track.userName || track.userId}</span>
            <span class="extended-track-added">Добавлено: ${formatDate(track.addedAt || track.createdAt)}</span>
          </div>
        </div>
        <div class="track-controls">
          <button class="like-button ${track.isInMyPlaylist ? 'active' : ''}" data-track-id="${track.id}">
            <i class="fas ${track.isInMyPlaylist ? 'fa-heart' : 'fa-heart'}"></i>
          </button>
        </div>
      `;

      // Добавляем обработчик клика на трек
      extendedLi.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Если клик был на кнопке лайка, не воспроизводим трек
        if (e.target.closest('.like-button')) {
          return;
        }
        
        const trackId = extendedLi.dataset.id;
        const trackIndex = tracks.findIndex(t => t.id === trackId);
        
        if (trackIndex !== -1) {
          // Проверяем, является ли это текущим воспроизводимым треком
          // Используем globalCurrentTrackId для точного сравнения
          const isCurrentTrack = (trackId === globalCurrentTrackId);
          
          // Если это текущий трек - переключаем воспроизведение/паузу
          if (isCurrentTrack) {
            if (isPlaying) {
              pauseTrack();
            } else {
              playTrack();
            }
            return;
          }
          
          // Прекращаем текущее воспроизведение перед загрузкой
          if (audioPlayer) audioPlayer.pause();
          
          // Обновляем визуальный выбор в обоих списках
          document.querySelectorAll('#track-list li, #extended-track-list li').forEach(item => {
            item.classList.remove('active');
          });
          extendedLi.classList.add('active');
          
          // Находим элемент в обычном списке и активируем его
          const sidebarItem = document.querySelector(`#track-list li[data-id="${trackId}"]`);
          if (sidebarItem) {
            sidebarItem.classList.add('active');
          }
          
          // Сбрасываем все кнопки воспроизведения в результатах поиска
          document.querySelectorAll('.search-play-button').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('playing');
          });
          
          // Быстро загружаем и автоматически воспроизводим выбранный трек
          if (_instantLoadTrack(tracks[trackIndex], 0, true)) {
            currentTrackIndex = trackIndex;
            isPlaying = true;
            updatePlayButton();
            
            // Обновляем кнопки в результатах поиска для этого трека
            document.querySelectorAll(`.search-result-item[data-id="${trackId}"] .search-play-button`).forEach(btn => {
              btn.innerHTML = '<i class="fas fa-pause"></i>';
              btn.classList.add('playing');
            });
            
            savePlayerState();
          }
        }
      });
      
      // Добавляем обработчик для кнопки лайка
      setTimeout(() => {
        const likeButton = extendedLi.querySelector('.like-button');
        if (likeButton) {
          likeButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Предотвращаем всплытие события
            togglePlaylistTrack(track);
          });
        }
      }, 0);
      
      extendedTrackList.appendChild(extendedLi);
    });
  }
  
  // Функция загрузки треков из Firebase
  function loadTracksFromFirebase() {
    console.log("Загрузка треков из Firebase");
    
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.uid) {
      console.error('Пользователь не авторизован');
      return;
    }
    
    // Получаем инстанс базы данных
    let dbInstance;
    try {
      dbInstance = getDatabase();
    } catch (error) {
      console.error("Ошибка при получении базы данных в loadTracksFromFirebase:", error);
      return;
    }
    
    // Сначала загружаем все треки из общей таблицы tracks
    const tracksRef = ref(dbInstance, 'tracks');
    get(tracksRef).then((snapshot) => {
      if (snapshot.exists()) {
        const tracksData = snapshot.val();
        tracks = []; // Очищаем массив треков пользователя
        allTracks = []; // Очищаем массив всех треков
        
        // Получаем информацию о пользователях для отображения имен
        const usersRef = ref(dbInstance, 'users');
        get(usersRef).then((usersSnapshot) => {
          const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
          
          // Получаем плейлист пользователя (треки, которые он добавил к себе)
          // Изменяем путь к плейлисту пользователя
          const userPlaylistRef = ref(dbInstance, `users/${userData.uid}/playlist`);
          get(userPlaylistRef).then((playlistSnapshot) => {
            const userPlaylist = playlistSnapshot.exists() ? playlistSnapshot.val() : {};
            
            // Обрабатываем все треки
            Object.keys(tracksData).forEach(trackId => {
              const trackData = tracksData[trackId];
              
              // Получаем информацию о владельце трека
              const ownerUid = trackData.userId;
              const ownerData = usersData[ownerUid] || {};
              const ownerName = ownerData.displayName || ownerData.email || 'Неизвестный пользователь';
              
              // Создаем объект трека
              const track = {
                id: trackId,
                userId: ownerUid,
                title: trackData.title || 'Без названия',
                artist: trackData.artist || 'Неизвестный исполнитель',
                url: trackData.url,
                cover: trackData.cover || DEFAULT_ALBUM_COVER,
                userName: ownerName,
                createdAt: trackData.createdAt || 0,
                // Только треки из плейлиста, НЕ включаем треки автоматически, если пользователь их владелец
                isInMyPlaylist: Boolean(userPlaylist[trackId])
              };
              
              // Кешируем данные трека в localStorage для быстрого доступа
              localStorage.setItem(`trackCache_${trackId}`, JSON.stringify(track));
              
              // Добавляем в массив всех треков, если такого трека еще нет
              if (!allTracks.some(t => t.id === trackId)) {
                allTracks.push(track);
              }
              
              // Добавляем в массив треков пользователя только треки из плейлиста и если их еще нет
              if (track.isInMyPlaylist && !tracks.some(t => t.id === trackId)) {
                tracks.push(track);
              }
            });
            
            // Сортируем треки по дате создания
            tracks.sort((a, b) => {
              const dateA = a.createdAt || 0;
              const dateB = b.createdAt || 0;
              return dateB - dateA;
            });
            
            // Обновляем списки треков
            updateTrackList();
            tracksLoaded = true;
            
            // Обновляем список треков в поиске, если вкладка поиска активна
            const searchTab = document.getElementById('search-tab');
            if (searchTab && searchTab.classList.contains('active')) {
              const searchButton = document.getElementById('search-button');
              if (searchButton) {
                searchButton.click();
              }
            }
            
            // Пытаемся восстановить состояние плеера
            loadPlayerState();
          }).catch(error => {
            console.error('Ошибка при загрузке плейлиста пользователя:', error);
            tracks = [];
            allTracks = [];
            updateTrackList();
          });
        }).catch(error => {
          console.error('Ошибка при загрузке данных пользователей:', error);
          tracks = [];
          allTracks = [];
          updateTrackList();
        });
      } else {
        tracks = [];
        allTracks = [];
        updateTrackList();
      }
    }).catch((error) => {
      console.error('Ошибка при загрузке треков:', error);
      tracks = [];
      allTracks = [];
      updateTrackList();
    });
  }
  
  // Функция для открытия модального окна
  function openModal() {
    if (!musicPlayerModal) {
      console.error('Модальное окно плеера не найдено');
      return;
    }
    
    // Проверяем и инициализируем аудиоплеер при необходимости
    if (!audioPlayer) {
      console.error('Аудиоплеер не инициализирован');
      return;
    }
    
    // Проверяем авторизацию
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.uid) {
      alert('Необходимо авторизоваться для доступа к музыкальному плееру');
      return;
    }
    
    // Отображаем модальное окно
    musicPlayerModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Предотвращаем прокрутку страницы
    
    // Загружаем треки, если список пуст
    if (!tracks || tracks.length === 0) {
      loadTracksFromFirebase();
    } else {
      // Перед обновлением плейлиста, проверяем текущий трек по ID
      const savedTrackId = localStorage.getItem('currentTrackId');
      if (savedTrackId && tracks.length > 0) {
        const trackIndex = tracks.findIndex(t => t.id === savedTrackId);
        if (trackIndex !== -1 && trackIndex !== currentTrackIndex) {
          currentTrackIndex = trackIndex;
        }
      }
      
      // Обновляем плейлист, чтобы выделить текущий трек
      updateTrackList();
    }
    
    // Обновляем положение ползунка громкости согласно текущей громкости
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider && audioPlayer) {
      const volumeValue = audioPlayer.volume * 100;
      volumeSlider.value = volumeValue;
      // Устанавливаем CSS переменную для заполнения ползунка
      volumeSlider.style.setProperty('--volume-percentage', `${volumeValue}%`);
    }
    
    // Инициализируем вкладку поиска
    initializeSearchTab();
    
    // Добавляем дополнительные стили для поиска
    fixSearchTabStyles();
    
    // Синхронизируем состояние кнопок в результатах поиска
    setTimeout(() => {
      if (typeof syncSearchButtonsState === 'function') {
        syncSearchButtonsState();
        console.log("Синхронизированы состояния кнопок при открытии модального окна");
      } else {
        console.log("Функция syncSearchButtonsState не найдена");
      }
    }, 300);
    
    // Если активна вкладка поиска, обновляем результаты поиска
    const searchTab = document.getElementById('search-tab');
    const playerTab = document.getElementById('player-tab');
    
    if (searchTab && playerTab) {
      if (searchTab.classList.contains('active')) {
        // Если вкладка поиска активна, запускаем поиск для отображения всех треков
        const searchButton = document.getElementById('search-button');
        if (searchButton) {
          searchButton.click();
        }
      }
    }
  }
  
  // Функция для закрытия модального окна
  function closeModalFunc() {
    musicPlayerModal.style.display = 'none';
    document.body.style.overflow = '';
  }
  
  // Настройка обработчиков событий
  
  // Используем существующую функцию navigateToMusic, определенную ранее
  
  // Обработчик закрытия модального окна
  closeModal.addEventListener('click', closeModalFunc);
  
  // Закрытие модального окна при клике вне его содержимого
  musicPlayerModal.addEventListener('click', (e) => {
    if (e.target === musicPlayerModal) {
      closeModalFunc();
    }
  });
  
  // Функция для синхронизации состояния кнопок в результатах поиска
  function syncSearchButtonsState() {
    // Сначала сбрасываем все кнопки
    document.querySelectorAll('.search-play-button').forEach(btn => {
      btn.innerHTML = '<i class="fas fa-play"></i>';
      btn.classList.remove('playing');
    });
    
    // Если есть активный трек и он воспроизводится, обновляем его кнопку
    if (globalCurrentTrackId && isPlaying) {
      const searchPlayButton = document.querySelector(`.search-result-item[data-id="${globalCurrentTrackId}"] .search-play-button`);
      if (searchPlayButton) {
        searchPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
        searchPlayButton.classList.add('playing');
      }
    }
  }

  // Переключение вкладок
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Скрываем панель загрузки, если она открыта
      const uploadContent = document.getElementById('upload-content');
      if (uploadContent) {
        uploadContent.classList.remove('visible');
        uploadContent.style.display = 'none';
      }
      
      // Показываем плеер, который мог быть скрыт при открытии панели загрузки
      const playerContainer = document.querySelector('.player-container');
      if (playerContainer) {
        playerContainer.style.display = 'block';
      }
      
      // Удаляем класс effectively-hidden со всех вкладок
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('effectively-hidden');
      });
      
      // Удаляем активный класс у всех кнопок и содержимого
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Добавляем активный класс для нажатой кнопки
      button.classList.add('active');
      
      // Показываем соответствующее содержимое
      const tabId = button.getAttribute('data-tab');
      const tabContent = document.getElementById(tabId);
      if (tabContent) {
        tabContent.classList.add('active');
        
        // Если переключились на вкладку поиска, синхронизируем состояние кнопок
        if (tabId === 'search-tab') {
          // Даем небольшую задержку, чтобы DOM успел обновиться
          setTimeout(() => {
            syncSearchButtonsState();
          }, 100);
        }
      }
    });
  });

  // Также добавляем вызов синхронизации при успешном поиске
  const performSearch = () => {
    console.log("Выполняется поиск");
    const query = searchInput.value.toLowerCase().trim();
    
    // ... существующий код поиска ...
    
    // После заполнения результатов поиска
    searchResults.forEach(track => {
      // ... существующий код создания элементов ...
      
      searchResultsList.appendChild(listItem);
      console.log("Добавлен элемент в список:", track.title);
      
      // После добавления всех элементов синхронизируем состояние кнопок
      setTimeout(() => {
        syncSearchButtonsState();
      }, 0);
    });
  };
  
  // Обработчик для кнопки воспроизведения/паузы
  document.getElementById('play-button').addEventListener('click', (event) => {
    // Предотвращаем любое всплытие события
    event.stopPropagation();
    
    // Получаем актуальное состояние воспроизведения напрямую из глобального аудиоплеера
    const isCurrentlyPlaying = globalAudioPlayer && !globalAudioPlayer.paused;
    
    // Чтобы избежать случайных двойных нажатий и переходов к следующему треку
    event.target.blur();
    
    // Проверяем, завершился ли трек (currentTime равен duration)
    const trackFinished = globalAudioPlayer && 
                          globalAudioPlayer.duration && 
                          globalAudioPlayer.currentTime >= globalAudioPlayer.duration;
    
    if (trackFinished) {
      // Если трек завершен, сбрасываем время воспроизведения
      if (globalAudioPlayer) {
        globalAudioPlayer.currentTime = 0;
      }
    }
    
    if (currentTrackIndex === -1 && tracks.length > 0) {
      currentTrackIndex = 0;
      if (loadTrack(currentTrackIndex)) {
        playTrack();
      }
    } else if (isCurrentlyPlaying) {
      // Также обновим кнопки в результатах поиска
      document.querySelectorAll('.search-play-button').forEach(btn => {
        btn.innerHTML = '<i class="fas fa-play"></i>';
        btn.classList.remove('playing');
      });
      pauseTrack();
    } else {
      // Также обновим кнопку текущего трека в результатах поиска
      if (globalCurrentTrackId) {
        document.querySelectorAll(`.search-result-item[data-id="${globalCurrentTrackId}"] .search-play-button`).forEach(btn => {
          btn.innerHTML = '<i class="fas fa-pause"></i>';
          btn.classList.add('playing');
        });
      }
      playTrack();
    }
  });
  
  // Обработчик для кнопки следующего трека
  document.getElementById('next-button').addEventListener('click', () => {
    // Проверяем, активна ли вкладка поиска
    const searchTab = document.getElementById('search-tab');
    const isSearchTabActive = searchTab && searchTab.classList.contains('active');
    
    if (isSearchTabActive) {
      // Если активна вкладка поиска, используем треки из результатов поиска
      const searchResults = document.querySelectorAll('#search-results-list .search-result-item');
      console.log("Переход к следующему треку в результатах поиска. Всего треков:", searchResults.length);
      
      if (searchResults.length > 0) {
        // Находим текущий трек в результатах поиска
        let currentIndex = -1;
        for (let i = 0; i < searchResults.length; i++) {
          if (searchResults[i].dataset.id === globalCurrentTrackId) {
            currentIndex = i;
            console.log("Текущий трек найден на позиции:", i, "ID трека:", globalCurrentTrackId);
            break;
          }
        }
        
        // Вычисляем индекс следующего трека
        const nextIndex = (currentIndex !== -1) ? (currentIndex + 1) % searchResults.length : 0;
        console.log("Переход от индекса", currentIndex, "к индексу", nextIndex);
        
        const nextTrackElement = searchResults[nextIndex];
        const nextTrackId = nextTrackElement.dataset.id;
        console.log("ID следующего трека:", nextTrackId);
        
        // Находим трек в allTracks
        const nextTrack = allTracks.find(track => track.id === nextTrackId);
        if (nextTrack) {
          console.log("Следующий трек найден:", nextTrack.title);
          
          // Сбрасываем состояние всех кнопок воспроизведения
          document.querySelectorAll('.search-play-button').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('playing');
          });
          
          // Принудительно удаляем обработчик onended, чтобы избежать рекурсивных вызовов
          globalAudioPlayer.onended = null;
          
          // Останавливаем текущий трек
          globalAudioPlayer.pause();
          
          // Полностью обновляем интерфейс плеера с информацией о новом треке
          if (typeof _updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека");
            _updatePlayerInterface(nextTrack);
          } else if (typeof window._updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека через window");
            window._updatePlayerInterface(nextTrack);
          }
          
          // Устанавливаем новый URL трека и сбрасываем время воспроизведения
          globalAudioPlayer.src = nextTrack.url;
          globalAudioPlayer.currentTime = 0;
          
          // Обновляем глобальный ID текущего трека перед воспроизведением
          const oldTrackId = globalCurrentTrackId;
          globalCurrentTrackId = nextTrackId;
          console.log(`Сменили ID трека с ${oldTrackId} на ${nextTrackId}`);
          
          // Обновляем кнопку воспроизведения
          const playButton = nextTrackElement.querySelector('.search-play-button');
          if (playButton) {
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.classList.add('playing');
          }
          
          // Обновляем UI перед воспроизведением
          updateActiveTrackUI(nextTrackId);
          
          // Получаем целевую громкость из слайдера или используем значение по умолчанию
          const volumeSlider = document.getElementById('volume-slider');
          const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
          
          // Запускаем воспроизведение
          globalAudioPlayer.volume = 0; // Начинаем с нулевой громкости для fade-in
          globalAudioPlayer.play()
            .then(() => {
              console.log("Воспроизведение следующего трека начато успешно");
              
              // Обновляем состояние воспроизведения
              isPlaying = true;
              
              // Применяем эффект нарастания громкости
              fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
              
              // Обновляем кнопку play-button в плеере
              const mainPlayButton = document.getElementById('play-button');
              if (mainPlayButton) {
                mainPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
              }
              
              if (typeof updatePlayButton === 'function') {
                updatePlayButton();
              }
              
              if (typeof savePlayerState === 'function') {
                savePlayerState();
              }
              
              // Добавляем обратно обработчик onended
              initializeSearchResultsClickHandlers();
            })
            .catch(error => {
              console.error("Ошибка воспроизведения:", error);
              isPlaying = false;
            });
        }
      }
    } else {
      // Стандартное поведение - воспроизведение из плейлиста
      if (tracks.length > 0 && currentTrackIndex !== -1) {
        const nextIndex = (currentTrackIndex + 1) % tracks.length;
        if (loadTrack(nextIndex)) {
          playTrack();
        }
      } else {
        // Если текущий трек не из плейлиста, просто переходим к следующему треку
        // из результатов поиска, если они есть
        const searchResults = document.querySelectorAll('.search-result-item');
        if (searchResults.length > 0 && globalCurrentTrackId) {
          // Находим текущий трек в результатах поиска
          let currentIndex = -1;
          for (let i = 0; i < searchResults.length; i++) {
            if (searchResults[i].dataset.id === globalCurrentTrackId) {
              currentIndex = i;
              break;
            }
          }
          
          if (currentIndex !== -1) {
            // Находим следующий трек
            const nextIndex = (currentIndex + 1) % searchResults.length;
            const nextTrackElement = searchResults[nextIndex];
            const nextTrackId = nextTrackElement.dataset.id;
            
            // Находим кнопку воспроизведения для следующего трека
            const playButton = nextTrackElement.querySelector('.search-play-button');
            if (playButton) {
              // Симулируем клик по кнопке воспроизведения
              playButton.click();
            }
          }
        }
      }
    }
  });
  
  // Обработчик для кнопки предыдущего трека
  document.getElementById('prev-button').addEventListener('click', () => {
    // Проверяем, активна ли вкладка поиска
    const searchTab = document.getElementById('search-tab');
    const isSearchTabActive = searchTab && searchTab.classList.contains('active');
    
    if (isSearchTabActive) {
      // Если активна вкладка поиска, используем треки из результатов поиска
      const searchResults = document.querySelectorAll('#search-results-list .search-result-item');
      console.log("Переход к предыдущему треку в результатах поиска. Всего треков:", searchResults.length);
      
      if (searchResults.length > 0) {
        // Находим текущий трек в результатах поиска
        let currentIndex = -1;
        for (let i = 0; i < searchResults.length; i++) {
          if (searchResults[i].dataset.id === globalCurrentTrackId) {
            currentIndex = i;
            console.log("Текущий трек найден на позиции:", i, "ID трека:", globalCurrentTrackId);
            break;
          }
        }
        
        // Вычисляем индекс предыдущего трека
        const prevIndex = (currentIndex !== -1) ? (currentIndex - 1 + searchResults.length) % searchResults.length : 0;
        console.log("Переход от индекса", currentIndex, "к индексу", prevIndex);
        
        const prevTrackElement = searchResults[prevIndex];
        const prevTrackId = prevTrackElement.dataset.id;
        console.log("ID предыдущего трека:", prevTrackId);
        
        // Находим трек в allTracks
        const prevTrack = allTracks.find(track => track.id === prevTrackId);
        if (prevTrack) {
          console.log("Предыдущий трек найден:", prevTrack.title);
          
          // Сбрасываем состояние всех кнопок воспроизведения
          document.querySelectorAll('.search-play-button').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('playing');
          });
          
          // Принудительно удаляем обработчик onended, чтобы избежать рекурсивных вызовов
          globalAudioPlayer.onended = null;
          
          // Останавливаем текущий трек
          globalAudioPlayer.pause();
          
          // Полностью обновляем интерфейс плеера с информацией о новом треке
          if (typeof _updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека");
            _updatePlayerInterface(prevTrack);
          } else if (typeof window._updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека через window");
            window._updatePlayerInterface(prevTrack);
          }
          
          // Устанавливаем новый URL трека и сбрасываем время воспроизведения
          globalAudioPlayer.src = prevTrack.url;
          globalAudioPlayer.currentTime = 0;
          
          // Обновляем глобальный ID текущего трека перед воспроизведением
          const oldTrackId = globalCurrentTrackId;
          globalCurrentTrackId = prevTrackId;
          console.log(`Сменили ID трека с ${oldTrackId} на ${prevTrackId}`);
          
          // Обновляем кнопку воспроизведения
          const playButton = prevTrackElement.querySelector('.search-play-button');
          if (playButton) {
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.classList.add('playing');
          }
          
          // Обновляем UI перед воспроизведением
          updateActiveTrackUI(prevTrackId);
          
          // Получаем целевую громкость из слайдера или используем значение по умолчанию
          const volumeSlider = document.getElementById('volume-slider');
          const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
          
          // Запускаем воспроизведение
          globalAudioPlayer.volume = 0; // Начинаем с нулевой громкости для fade-in
          globalAudioPlayer.play()
            .then(() => {
              console.log("Воспроизведение предыдущего трека начато успешно");
              
              // Обновляем состояние воспроизведения
              isPlaying = true;
              
              // Применяем эффект нарастания громкости
              fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
              
              // Обновляем кнопку play-button в плеере
              const mainPlayButton = document.getElementById('play-button');
              if (mainPlayButton) {
                mainPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
              }
              
              if (typeof updatePlayButton === 'function') {
                updatePlayButton();
              }
              
              if (typeof savePlayerState === 'function') {
                savePlayerState();
              }
              
              // Добавляем обратно обработчик onended
              initializeSearchResultsClickHandlers();
            })
            .catch(error => {
              console.error("Ошибка воспроизведения:", error);
              isPlaying = false;
            });
        }
      }
    } else {
      // Стандартное поведение - воспроизведение из плейлиста
      if (tracks.length > 0 && currentTrackIndex !== -1) {
        const prevIndex = (currentTrackIndex - 1 + tracks.length) % tracks.length;
        if (loadTrack(prevIndex)) {
          playTrack();
        }
      } else {
        // Если текущий трек не из плейлиста, просто переходим к предыдущему треку
        // из результатов поиска, если они есть
        const searchResults = document.querySelectorAll('.search-result-item');
        if (searchResults.length > 0 && globalCurrentTrackId) {
          // Находим текущий трек в результатах поиска
          let currentIndex = -1;
          for (let i = 0; i < searchResults.length; i++) {
            if (searchResults[i].dataset.id === globalCurrentTrackId) {
              currentIndex = i;
              break;
            }
          }
          
          if (currentIndex !== -1) {
            // Находим предыдущий трек
            const prevIndex = (currentIndex - 1 + searchResults.length) % searchResults.length;
            const prevTrackElement = searchResults[prevIndex];
            const prevTrackId = prevTrackElement.dataset.id;
            
            // Находим кнопку воспроизведения для предыдущего трека
            const playButton = prevTrackElement.querySelector('.search-play-button');
            if (playButton) {
              // Симулируем клик по кнопке воспроизведения
              playButton.click();
            }
          }
        }
      }
    }
  });
  
  // Функция для обновления иконки громкости в зависимости от текущего уровня
  function updateVolumeIcon(volume) {
    const volumeIcon = document.querySelector('.volume-icon-container i');
    
    if (!volumeIcon) return;
    
    // Преобразуем volume в число для безопасного сравнения
    volume = parseFloat(volume);
    
    // Удаляем все классы иконок громкости
    volumeIcon.classList.remove('fa-volume-up', 'fa-volume-down', 'fa-volume-off', 'fa-volume-mute');
    
    // Добавляем соответствующий класс в зависимости от уровня громкости
    if (volume === 0) {
      // Используем перечеркнутую иконку для отключенного звука
      volumeIcon.classList.add('fa-volume-mute');
    } else if (volume <= 25) {
      volumeIcon.classList.add('fa-volume-off');
    } else if (volume <= 75) {
      volumeIcon.classList.add('fa-volume-down');
    } else {
      volumeIcon.classList.add('fa-volume-up');
    }
    
    // Только для отладки проблем с иконками - можно закомментировать в продакшене
    // console.log(`Уровень громкости: ${volume}, иконка: ${volumeIcon.className}`);
  }
  
  // Обработчик для изменения громкости
  document.getElementById('volume-slider').addEventListener('input', (e) => {
    const value = e.target.value;
    audioPlayer.volume = value / 100;
    
    // Обновляем CSS переменную для отображения заполнения ползунка
    e.target.style.setProperty('--volume-percentage', `${value}%`);
    
    // Обновляем иконку громкости
    updateVolumeIcon(value);
    
    savePlayerState();
  });
  
  // Обработчик для изменения прогресса воспроизведения
  document.querySelector('.progress-bar').addEventListener('click', (e) => {
    // Проверяем, что есть активный трек (по глобальному ID) и аудиоплеер инициализирован
    if (!globalAudioPlayer || !globalCurrentTrackId) return;
    
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    
    if (audioPlayer.duration) {
      audioPlayer.currentTime = audioPlayer.duration * clickPosition;
    }
  });
  
  // Добавляем функциональность перетаскивания для прогресс-бара
  const progressBar = document.querySelector('.progress-bar');
  let isDragging = false;
  
  progressBar.addEventListener('mousedown', (e) => {
    // Проверяем, что есть активный трек и аудиоплеер инициализирован
    if (!globalAudioPlayer || !globalCurrentTrackId) return;
    
    isDragging = true;
    
    // Обновляем позицию при нажатии
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    
    if (audioPlayer.duration) {
      audioPlayer.currentTime = audioPlayer.duration * clickPosition;
    }
    
    // Предотвращаем выделение текста при перетаскивании
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging || !globalAudioPlayer || !globalCurrentTrackId) return;
    
    const rect = progressBar.getBoundingClientRect();
    let clickPosition = (e.clientX - rect.left) / rect.width;
    
    // Ограничиваем значение в пределах от 0 до 1
    clickPosition = Math.max(0, Math.min(1, clickPosition));
    
    if (audioPlayer.duration) {
      audioPlayer.currentTime = audioPlayer.duration * clickPosition;
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Добавляем обработчики для сенсорных устройств
  progressBar.addEventListener('touchstart', (e) => {
    // Проверяем, что есть активный трек и аудиоплеер инициализирован
    if (!globalAudioPlayer || !globalCurrentTrackId) return;
    
    isDragging = true;
    
    // Обновляем позицию при касании
    const rect = progressBar.getBoundingClientRect();
    const touch = e.touches[0];
    const touchPosition = (touch.clientX - rect.left) / rect.width;
    
    if (audioPlayer.duration) {
      audioPlayer.currentTime = audioPlayer.duration * touchPosition;
    }
    
    // Предотвращаем прокрутку страницы при перетаскивании
    e.preventDefault();
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!isDragging || !globalAudioPlayer || !globalCurrentTrackId) return;
    
    const rect = progressBar.getBoundingClientRect();
    const touch = e.touches[0];
    let touchPosition = (touch.clientX - rect.left) / rect.width;
    
    // Ограничиваем значение в пределах от 0 до 1
    touchPosition = Math.max(0, Math.min(1, touchPosition));
    
    if (audioPlayer.duration) {
      audioPlayer.currentTime = audioPlayer.duration * touchPosition;
    }
    
    // Предотвращаем прокрутку страницы при перетаскивании
    e.preventDefault();
  });
  
  document.addEventListener('touchend', () => {
    isDragging = false;
  });
  
  // Переход к следующему треку по окончании
  audioPlayer.addEventListener('ended', () => {
    // Проверяем, активна ли вкладка поиска
    const searchTab = document.getElementById('search-tab');
    const isSearchTabActive = searchTab && searchTab.classList.contains('active');
    
    if (isSearchTabActive) {
      // Если активна вкладка поиска, используем треки из результатов поиска
      const searchResults = document.querySelectorAll('#search-results-list .search-result-item');
      console.log("Количество треков в результатах поиска:", searchResults.length);
      
      if (searchResults.length > 0) {
        // Находим текущий трек в результатах поиска
        let currentIndex = -1;
        for (let i = 0; i < searchResults.length; i++) {
          if (searchResults[i].dataset.id === globalCurrentTrackId) {
            currentIndex = i;
            console.log("Найден текущий трек на позиции:", i, "ID трека:", globalCurrentTrackId);
            break;
          }
        }
        
        // Вычисляем индекс следующего трека напрямую, без дополнительных вызовов
        const nextIndex = (currentIndex !== -1) ? (currentIndex + 1) % searchResults.length : 0;
        console.log("Индекс текущего трека:", currentIndex, "Переход к индексу:", nextIndex);
        
        const nextTrackElement = searchResults[nextIndex];
        const nextTrackId = nextTrackElement.dataset.id;
        console.log("ID следующего трека:", nextTrackId);
        
        // Принудительно удаляем обработчик onended, чтобы избежать рекурсивных вызовов
        globalAudioPlayer.onended = null;
        
        // Находим трек в allTracks
        const nextTrack = allTracks.find(track => track.id === nextTrackId);
        if (nextTrack) {
          console.log("Следующий трек найден в allTracks:", nextTrack.title);
          
          // Важно! Принудительно останавливаем текущий трек
          globalAudioPlayer.pause();
          
          // Сбрасываем состояние всех кнопок воспроизведения
          document.querySelectorAll('.search-play-button').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i>';
            btn.classList.remove('playing');
          });
          
          // Полностью обновляем интерфейс плеера с информацией о новом треке
          if (typeof _updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека");
            _updatePlayerInterface(nextTrack);
          } else if (typeof window._updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека через window");
            window._updatePlayerInterface(nextTrack);
          }
          
          // Полностью меняем URL трека
          console.log("Устанавливаем новый URL трека:", nextTrack.url);
          globalAudioPlayer.src = nextTrack.url;
          globalAudioPlayer.currentTime = 0;
          
          // Отмечаем текущий трек для предотвращения повторного запуска
          const oldTrackId = globalCurrentTrackId;
          globalCurrentTrackId = nextTrackId;
          console.log(`Сменили ID трека с ${oldTrackId} на ${nextTrackId}`);
          
          // Воспроизводим следующий трек
          const playButton = nextTrackElement.querySelector('.search-play-button');
          
          // Обновляем UI перед воспроизведением
          updateActiveTrackUI(nextTrackId);
          
          // Запускаем воспроизведение напрямую
          globalAudioPlayer.play().then(() => {
            console.log("Воспроизведение следующего трека начато успешно");
            
            // Обновляем кнопку воспроизведения
            if (playButton) {
              playButton.innerHTML = '<i class="fas fa-pause"></i>';
              playButton.classList.add('playing');
            }
            
            // Обновляем состояние воспроизведения
            isPlaying = true;
            
            // Обновляем UI
            const mainPlayButton = document.getElementById('play-button');
            if (mainPlayButton) {
              mainPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
            }
            
            // Добавляем обратно обработчик onended
            initializeSearchResultsClickHandlers();
          }).catch(error => {
            console.error("Ошибка воспроизведения:", error);
          });
        }
      } else {
        // Если результаты поиска пусты, сбрасываем состояние
        isPlaying = false;
        updatePlayButton();
      }
    } else {
      // Стандартное поведение - воспроизведение из плейлиста
      if (tracks.length > 0 && currentTrackIndex !== -1) {
        // Вычисляем индекс следующего трека
        const nextIndex = (currentTrackIndex + 1) % tracks.length;
        console.log("Индекс текущего трека на player-tab:", currentTrackIndex, "Переход к индексу:", nextIndex);
        
        // Принудительно удаляем обработчик onended, чтобы избежать рекурсивных вызовов
        globalAudioPlayer.onended = null;
        
        const nextTrack = tracks[nextIndex];
        if (nextTrack) {
          console.log("Следующий трек найден в плейлисте:", nextTrack.title);
          
          // Важно! Принудительно останавливаем текущий трек
          globalAudioPlayer.pause();
          
          // Сбрасываем состояние UI
          isPlaying = false;
          
          // Полностью обновляем интерфейс плеера с информацией о новом треке
          if (typeof _updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека");
            _updatePlayerInterface(nextTrack);
          } else if (typeof window._updatePlayerInterface === 'function') {
            console.log("Обновляем интерфейс плеера для нового трека через window");
            window._updatePlayerInterface(nextTrack);
          }
          
          // Обновляем индекс текущего трека
          currentTrackIndex = nextIndex;
          
          // Обновляем глобальный ID текущего трека
          const oldTrackId = globalCurrentTrackId;
          globalCurrentTrackId = nextTrack.id;
          console.log(`Сменили ID трека с ${oldTrackId} на ${nextTrack.id}`);
          
          // Сохраняем ID текущего трека
          localStorage.setItem('currentTrackId', nextTrack.id);
          
          // Полностью меняем URL трека
          console.log("Устанавливаем новый URL трека:", nextTrack.url);
          globalAudioPlayer.src = nextTrack.url;
          globalAudioPlayer.currentTime = 0;
          
          // Обновляем UI перед воспроизведением
          updateActiveTrackUI(nextTrack.id);
          
          // Получаем целевую громкость из слайдера или используем значение по умолчанию
          const volumeSlider = document.getElementById('volume-slider');
          const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
          
          // Запускаем воспроизведение
          globalAudioPlayer.volume = 0; // Начинаем с нулевой громкости для fade-in
          globalAudioPlayer.play()
            .then(() => {
              console.log("Воспроизведение следующего трека начато успешно");
              
              // Обновляем состояние воспроизведения
              isPlaying = true;
              
              // Применяем эффект нарастания громкости
              fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
              
              // Обновляем кнопку play-button в плеере
              const mainPlayButton = document.getElementById('play-button');
              if (mainPlayButton) {
                mainPlayButton.innerHTML = '<i class="fas fa-pause"></i>';
              }
              
              if (typeof updatePlayButton === 'function') {
                updatePlayButton();
              }
              
              if (typeof savePlayerState === 'function') {
                savePlayerState();
              }
              
              // Добавляем обратно обработчик onended
              initializeSearchResultsClickHandlers();
            })
            .catch(error => {
              console.error("Ошибка воспроизведения:", error);
              isPlaying = false;
              if (typeof updatePlayButton === 'function') {
                updatePlayButton();
              }
            });
        }
      } else {
        // Если плейлист закончился или был пуст, сбрасываем состояние
        isPlaying = false;
        updatePlayButton(); // Это вызовет updateActiveTrackUI(globalCurrentTrackId)
                            // Если globalCurrentTrackId еще установлен, он останется активным, но "не играющим"
                            // Если нужно полностью "деактивировать", то updateActiveTrackUI(null)
      }
    }
  });
  
  // Функция для преобразования Data URL в Blob
  function dataURLtoBlob(dataurl) {
      var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
          bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
      while(n--){
          u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr], {type:mime});
  }
  
  // Обработчик для загрузки песни в Firebase
  document.getElementById('upload-button').addEventListener('click', async () => {
    const trackFile = document.getElementById('track-file').files[0];
    const title = document.getElementById('track-title').value.trim();
    const artist = document.getElementById('track-artist').value.trim();
    const uploadStatus = document.getElementById('upload-status');
    
    if (!trackFile) {
      uploadStatus.textContent = 'Выберите аудиофайл для загрузки';
      return;
    }
    
    if (!title) {
      uploadStatus.textContent = 'Введите название трека';
      return;
    }
    
    if (!artist) {
      uploadStatus.textContent = 'Введите имя исполнителя';
      return;
    }
    
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.uid) {
      uploadStatus.textContent = 'Необходимо авторизоваться для загрузки треков';
      return;
    }
    
    uploadStatus.textContent = 'Загрузка...';
    
    try {
      // 1. Загружаем аудиофайл
      const trackStorageRef = storageRef(storage, `tracks/${userData.uid}/${Date.now()}_${trackFile.name}`);
      const trackUploadTask = uploadBytesResumable(trackStorageRef, trackFile);
      
      // Ожидаем завершения загрузки трека
      await trackUploadTask;
      const trackURL = await getDownloadURL(trackStorageRef);
      
      // 2. Обрабатываем обложку
      let coverURL = DEFAULT_ALBUM_COVER;
      
      // Проверяем, была ли обложка обрезана
      if (croppedCoverDataUrl) {
        // Преобразуем Data URL в Blob
        const coverBlob = dataURLtoBlob(croppedCoverDataUrl);
        
        // Создаем путь для обложки в Storage
        const coverFileName = `cover_${Date.now()}.jpeg`;
        const coverStorageRef = storageRef(storage, `covers/${userData.uid}/${coverFileName}`);
        
        // Загружаем обрезанную обложку
        const coverUploadTask = uploadBytesResumable(coverStorageRef, coverBlob);
        
        // Показываем прогресс загрузки обложки (опционально)
        coverUploadTask.on('state_changed', (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Cover upload is ' + progress + '% done');
          // Можно обновлять UI, показывая прогресс загрузки обложки
          uploadStatus.textContent = `Загрузка обложки: ${Math.round(progress)}%`;
        });
        
        // Ожидаем завершения загрузки обложки
        await coverUploadTask;
        coverURL = await getDownloadURL(coverStorageRef);
      } else {
          // Если обложка не обрезалась, проверяем, выбрал ли пользователь файл
          const coverPreviewImg = document.querySelector('#cover-preview img');
          // Проверяем, что src не дефолтный и не data URL (значит был выбран файл, но не обрезан)
          if (coverPreviewImg && coverPreviewImg.src !== DEFAULT_ALBUM_COVER && !coverPreviewImg.src.startsWith('data:')) {
              // В этом случае можно либо загрузить оригинальный выбранный файл (если он сохранен)
              // Либо просто использовать дефолтную обложку, как сейчас
              console.log('Обложка была выбрана, но не обрезана. Используем дефолтную.');
          }
      }
      
      // 3. Создаем запись в общей таблице tracks
      const trackData = {
        title,
        artist,
        url: trackURL,
        cover: coverURL,
        createdAt: Date.now(),
        userId: userData.uid, // ID пользователя, который загрузил трек
      };
      
      // Получаем базу данных
      const db = getDatabase();
      
      // Добавляем трек в общую базу треков
      const newTrackRef = push(ref(db, 'tracks'));
      const trackId = newTrackRef.key;
      await set(newTrackRef, trackData);
      
      // Добавляем трек в плейлист пользователя
      await set(ref(db, `userPlaylists/${userData.uid}/${trackId}`), {
        addedAt: Date.now()
      });
      
      uploadStatus.textContent = 'Трек успешно загружен!';
      
      // Очищаем форму
      document.getElementById('track-file').value = '';
      document.getElementById('track-title').value = '';
      document.getElementById('track-artist').value = '';
      document.querySelector('#cover-preview img').src = DEFAULT_ALBUM_COVER;
      document.getElementById('cover-file').value = ''; // Сбрасываем выбор файла обложки
      croppedCoverDataUrl = null; // Сбрасываем обрезанную обложку
      
      // Обновляем список треков
      loadTracksFromFirebase();
      
      // Переключаемся на вкладку плеера
      document.querySelector('.tab-button[data-tab="player-tab"]').click();
    } catch (error) {
      console.error('Ошибка при загрузке трека:', error);
      uploadStatus.textContent = `Ошибка при загрузке: ${error.message}`;
    }
  });
  
  // Обработчик для изменения обложки
  document.getElementById('music-modal-change-cover-btn').addEventListener('click', () => { // ИСПОЛЬЗУЕМ НОВЫЙ ID
    document.getElementById('cover-file').click();
  });
  
  // Переменная для хранения экземпляра Cropper.js для обложки трека
  let musicCoverCropper = null;
  // Переменная для хранения обрезанной обложки (Data URL)
  let croppedCoverDataUrl = null;

  // Обработчик выбора файла обложки
  document.getElementById('cover-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      // Проверяем и загружаем Cropper.js если нужно
      if (typeof Cropper === 'undefined') {
        loadCSS('https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css');
        loadScript('https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js', () => {
          // Инициализация Cropper после загрузки скрипта
          initMusicCoverCropper(file);
        });
      } else {
        // Cropper уже загружен, инициализируем
        initMusicCoverCropper(file);
      }
    } else if (file) {
      alert('Пожалуйста, выберите файл изображения.');
    }
    // Сбрасываем значение input, чтобы можно было выбрать тот же файл снова
    e.target.value = '';
  });

  // Функция инициализации Cropper для обложки трека
  function initMusicCoverCropper(file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        // Открываем модальное окно кадрирования обложки трека
        const modal = document.getElementById('music-cover-crop-modal');
        const cropImg = document.getElementById('music-cover-crop-img');
        // const zoomSlider = document.getElementById('music-cover-zoom-slider'); // УДАЛЕНО

        cropImg.src = event.target.result;
        modal.classList.add('active');

        // Инициализируем Cropper.js (удаляем старый экземпляр, если он есть)
        if (musicCoverCropper) {
          musicCoverCropper.destroy();
        }
        
        // Задержка для правильной инициализации Cropper
        setTimeout(() => {
          musicCoverCropper = new Cropper(cropImg, {
            aspectRatio: 1, // Квадратная обложка
            viewMode: 1,
            guides: true,
            center: true,
            minContainerWidth: 250,
            minContainerHeight: 250,
            dragMode: 'move',
            autoCropArea: 0.8,
            responsive: true,
            restore: false,
            checkOrientation: false,
            background: false,
            // УДАЛЕНО: ready() для zoomSlider
          });
          
          // УДАЛЕНА: Настройка слайдера масштабирования
        }, 150);
      };
      reader.readAsDataURL(file);
  }
  
  // Функция закрытия модального окна кадрирования обложки
  function closeMusicCoverCropModal() {
    const modal = document.getElementById('music-cover-crop-modal');
    if (musicCoverCropper) {
      musicCoverCropper.destroy();
      musicCoverCropper = null;
    }
    modal.classList.remove('active');
    document.getElementById('music-cover-crop-img').src = '';
  }
  
  // Обработчики кнопок в модальном окне кадрирования обложки
  document.querySelector('.music-cover-crop-close').onclick = closeMusicCoverCropModal;
  document.querySelector('.music-cover-crop-cancel').onclick = closeMusicCoverCropModal;
  
  // Обработчик кнопки "Применить" для кадрирования обложки
  document.querySelector('.music-cover-crop-apply').onclick = () => {
    if (musicCoverCropper) {
      const canvas = musicCoverCropper.getCroppedCanvas({
        width: 500, // Размер обложки
        height: 500,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });
      
      if (canvas) {
        // Получаем Data URL обрезанного изображения
        croppedCoverDataUrl = canvas.toDataURL('image/jpeg', 0.9); // Качество JPEG
        
        // Обновляем предпросмотр
        const coverPreviewImg = document.querySelector('#cover-preview img');
        coverPreviewImg.src = croppedCoverDataUrl;
        
        // Закрываем модальное окно
        closeMusicCoverCropModal();
      } else {
        alert('Не удалось обрезать изображение.');
      }
    } else {
      console.error('Экземпляр Cropper.js для обложки не найден.');
    }
  };
  
  // Сохраняем стартовое состояние аудиоплеера
  window.addEventListener('beforeunload', () => {
    savePlayerState();
  });
  
  // Автоматически восстанавливаем воспроизведение при загрузке страницы
  // Заменяем обработчик DOMContentLoaded на незамедлительную инициализацию
  function initializePlayer() {
    // Если плеер уже инициализирован, не инициализируем повторно
    if (playerInitialized) return;
    playerInitialized = true;
    
    // Загружаем дефолтную обложку из Firebase Storage
    loadDefaultAlbumCover();
    
    // Инициализируем иконку громкости
    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      // Получаем сохраненное значение громкости из localStorage или используем текущее значение ползунка
      let volumeValue;
      const stateJson = sessionStorage.getItem('musicPlayerState') || localStorage.getItem('musicPlayerState');
      if (stateJson) {
        const state = JSON.parse(stateJson);
        volumeValue = state.volume ? (state.volume * 100) : parseInt(volumeSlider.value);
      } else {
        volumeValue = parseInt(volumeSlider.value);
      }
      
      // Обновляем иконку и ползунок в соответствии с текущей громкостью
      volumeSlider.value = volumeValue;
      volumeSlider.style.setProperty('--volume-percentage', `${volumeValue}%`);
      updateVolumeIcon(volumeValue);
    }
    
    // Загружаем треки из Firebase, если пользователь авторизован
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData && userData.uid) {
      loadTracksFromFirebase();
      
      // Проверяем, играла ли музыка перед переходом
      const playerState = JSON.parse(localStorage.getItem('musicPlayerState') || '{}');
      if (playerState.isPlaying) {
        // Устанавливаем таймер с минимальной задержкой для начала воспроизведения
        setTimeout(() => {
          // Если трек уже загружен и готов к воспроизведению
          if (audioPlayer.src && currentTrackIndex !== -1) {
            playTrack();
          }
        }, 100); // Минимальная задержка
      }
    }
  }
  
  // Определяем текущую страницу
  const pagePath = window.location.pathname;
  const autoplayEnabledPages = ['home.html', 'groups.html', 'group.html', 'profile.html', 'message.html'];
  const currentPageName = pagePath.split('/').pop();
  
  // Инициализируем плеер немедленно
  initializePlayer();
  
  // Фикс для страниц, где автовоспроизведение не работает
  if (autoplayEnabledPages.includes(currentPageName)) {
    // Добавляем обработчик готовности страницы для повторной попытки воспроизведения
    window.addEventListener('DOMContentLoaded', () => {
      // Если треки уже загружены и плеер инициализирован
      const playerState = JSON.parse(localStorage.getItem('musicPlayerState') || '{}');
      if (playerState.isPlaying && tracksLoaded) {
        // Повторная попытка запуска воспроизведения
        setTimeout(() => {
          if (audioPlayer.paused && audioPlayer.src) {
            playTrack();
          }
        }, 300);
      }
    });
    
    // Добавляем обработчик полной загрузки для третьей попытки воспроизведения
    window.addEventListener('load', () => {
      const playerState = JSON.parse(localStorage.getItem('musicPlayerState') || '{}');
      if (playerState.isPlaying && audioPlayer.paused && audioPlayer.src) {
        playTrack();
      }
    });
  }

  // Интеграция с HTML5 History API для навигации
  function setupHistoryNavigation() {
    // Обрабатываем все ссылки внутри документа
    document.addEventListener('click', (e) => {
      // Находим ближайшую ссылку от места клика
      const link = e.target.closest('a');
      
      // Если клик был по ссылке и она ведет на внутреннюю страницу сайта
      if (link && link.href && link.href.startsWith(window.location.origin) && 
          !link.getAttribute('download') && !link.getAttribute('target')) {
        
        // Предотвращаем стандартное действие
        e.preventDefault();
        
        // Сохраняем текущее состояние плеера перед переходом
        savePlayerState();
        
        // Сохраняем текущие элементы аватаров
        saveAvatarElements();
        
        // Сохраняем аудиоплеер в глобальный контекст
        const persistentContainer = document.getElementById('persistent-audio-container');
        if (persistentContainer && audioPlayer && audioPlayer.parentNode !== persistentContainer) {
          persistentContainer.appendChild(audioPlayer);
        }
        
        // Вместо fetch используем прямой переход по ссылке
        window.location.href = link.href;
      }
    });
    
    // Обработчик нажатия кнопок назад/вперед
    window.addEventListener('popstate', (event) => {
      // Сохраняем аудио элемент перед изменением страницы
      const persistentContainer = document.getElementById('persistent-audio-container');
      if (persistentContainer && audioPlayer && audioPlayer.parentNode !== persistentContainer) {
        persistentContainer.appendChild(audioPlayer);
      }
      
      // Сохраняем состояние аудио
      savePlayerState();
      
      // Перезагружаем страницу вместо fetch
      window.location.reload();
    });
  }

  // ... остальной код ...

  // Функция для проверки состояния аудио-контекста и его активации
  function checkAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('AudioContext возобновлен');
      });
    }
  }
  
  // Активируем аудио-контекст при взаимодействии пользователя
  document.addEventListener('click', checkAudioContext, { once: true });
  document.addEventListener('touchstart', checkAudioContext, { once: true });
  document.addEventListener('keydown', checkAudioContext, { once: true });
  
  // Инициализируем интеграцию с History API
  setupHistoryNavigation();
  
  // Сохраняем начальное состояние истории
  if (window.history && window.history.replaceState) {
    // Сохраняем текущее время воспроизведения и состояние в истории
    window.history.replaceState({
      audioTime: audioPlayer.currentTime,
      isPlaying: !audioPlayer.paused,
      audioVolume: audioPlayer.volume,
      trackId: localStorage.getItem('currentTrackId')
    }, document.title, window.location.href);
  }
  
  // Сохраняем стартовое состояние аудиоплеера перед выгрузкой страницы
  window.addEventListener('beforeunload', () => {
    // Сохраняем максимально точное состояние
    savePlayerState();
  });

  // Вызов функции для кеширования аватарки при инициализации сайдбара
  cacheUserAvatar();
  
  // Быстрое восстановление аватарки из кеша при первой загрузке
  restoreUserAvatarFromCache();
  
  // Функция для быстрой инициализации индикатора непрочитанных сообщений
  initializeUnreadIndicator();
  
  // Инициализируем Firebase для работы с сообщениями
  initializeMessagesNotifications();

  // Добавляем дополнительные стили для правильного управления видимостью
  const uploadControlStyles = document.createElement('style');
  uploadControlStyles.textContent = `
    /* Стили для корректного отображения/скрытия контента */
    .upload-content {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: var(--sidebar-bg);
      z-index: 1010; /* Выше всех вкладок */
      padding: 20px;
      box-sizing: border-box;
      overflow-y: auto;
      display: none; /* По умолчанию скрыт */
    }
    
    .modal-body {
      position: relative;
      overflow: hidden;
    }
    
    /* Дополнительный класс для активной вкладки */
    .tab-content.effectively-hidden {
      visibility: hidden !important;
      opacity: 0 !important;
      z-index: -1 !important;
    }
    
    /* Стили для показа панели загрузки */
    .upload-content.visible {
      display: block !important;
      z-index: 1010 !important;
    }
  `;
  document.head.appendChild(uploadControlStyles);

  // Обработчик для кнопки загрузки музыки
  document.getElementById('upload-music-button').addEventListener('click', () => {
    // Получаем все вкладки контента
    const tabContents = document.querySelectorAll('.tab-content');
    const uploadContent = document.getElementById('upload-content');
    const playerContainer = document.querySelector('.player-container');
    
    if (uploadContent) {
      // Сохраняем ID активной вкладки перед открытием панели загрузки
      const activeTabButton = document.querySelector('.tab-button.active');
      if (activeTabButton) {
        lastActiveTabId = activeTabButton.getAttribute('data-tab');
        
        // Убираем класс active у всех кнопок вкладок
        document.querySelectorAll('.tab-button').forEach(btn => {
          btn.classList.remove('active');
        });
      }
      
      // Помечаем все вкладки как скрытые
      tabContents.forEach(tab => {
        tab.classList.add('effectively-hidden');
      });
      
      // Скрываем плеер
      if (playerContainer) {
        playerContainer.style.display = 'none';
      }
      
      // Показываем панель загрузки
      uploadContent.classList.add('visible');
      uploadContent.style.display = 'block';
      
      // Добавляем визуальное выделение кнопке загрузки
      const uploadButton = document.getElementById('upload-music-button');
      uploadButton.classList.add('active-upload');
    }
  });

  // Обработчик для кнопки закрытия контента загрузки
  document.getElementById('close-upload-btn').addEventListener('click', () => {
    const uploadContent = document.getElementById('upload-content');
    const tabContents = document.querySelectorAll('.tab-content');
    const playerContainer = document.querySelector('.player-container');
    
    if (uploadContent) {
      // Скрываем панель загрузки
      uploadContent.classList.remove('visible');
      uploadContent.style.display = 'none';
      
      // Возвращаем видимость всем вкладкам
      tabContents.forEach(tab => {
        tab.classList.remove('effectively-hidden');
      });
      
      // Убираем выделение с кнопки загрузки
      const uploadButton = document.getElementById('upload-music-button');
      uploadButton.classList.remove('active-upload');
      
      // Восстанавливаем активную вкладку
      const tabButtons = document.querySelectorAll('.tab-button');
      let activeTabExists = false;
      
      tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === lastActiveTabId) {
          btn.classList.add('active');
          activeTabExists = true;
          
          // Показываем соответствующий контент
          const activeTab = document.getElementById(lastActiveTabId);
          if (activeTab) {
            activeTab.classList.add('active');
            activeTab.style.display = 'block';
          }
        }
      });
      
      // Показываем плеер, только если есть активная вкладка
      if (playerContainer && activeTabExists) {
        playerContainer.style.display = 'block';
      }
    }
  });

  // Добавляем стили для выделения активной кнопки загрузки
  const uploadActiveBtnStyles = document.createElement('style');
  uploadActiveBtnStyles.textContent = `
    .upload-music-btn.active-upload {
      background-color: #1db954;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
      transform: scale(1.02);
    }
  `;
  document.head.appendChild(uploadActiveBtnStyles);

  // Добавляем глобальную переменную для хранения ID последней активной вкладки
  let lastActiveTabId = 'player-tab'; // По умолчанию активна вкладка плеера

  // Добавляем дополнительные стили для нового расположения плеера
  const playerPositionStyles = document.createElement('style');
  playerPositionStyles.textContent = `
    /* Стили для модального окна */
    .modal-body {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    
    /* Контейнер для вкладок */
    .tabs-container {
      flex: 1;
      overflow-y: auto;
      margin-bottom: 15px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    /* Стили для плеера внизу */
    .player-container {
      padding: 10px;
      border-radius: 8px;
      background-color: rgba(0, 0, 0, 0.15);
      margin-top: auto;
    }
    
    /* Корректируем стили для разных вкладок */
    #player-tab, #search-tab {
      height: 100%;
      overflow-y: auto;
    }
    
    /* Стиль для информации о плейлисте на вкладке плеера */
    .playlist-info {
      padding: 15px;
    }
    
    .playlist-description {
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      margin-top: 5px;
    }
    
    /* Переопределяем стиль для контента загрузки */
    .upload-content {
      z-index: 1050; /* Выше всего */
    }
  `;
  document.head.appendChild(playerPositionStyles);

  // Добавляем стили для расширенного списка треков
  const extendedPlaylistStyles = document.createElement('style');
  extendedPlaylistStyles.textContent = `
    /* Стили для расширенного списка треков */
    .extended-playlist {
      padding: 0 15px 15px 15px;
    }
    
    .extended-tracks {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .extended-track-item {
      display: flex;
      align-items: center;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 10px;
      background-color: rgba(255, 255, 255, 0.05);
      transition: background-color 0.2s;
      cursor: pointer;
    }
    
    .extended-track-item:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
    
    .extended-track-item.active {
      background-color: rgba(29, 185, 84, 0.15);
      border-left: 3px solid #1db954;
    }
    
    .track-cover {
      width: 60px;
      height: 60px;
      border-radius: 4px;
      overflow: hidden;
      margin-right: 15px;
      flex-shrink: 0;
    }
    
    .track-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .extended-track-details {
      flex: 1;
      overflow: hidden;
    }
    
    .extended-track-title {
      font-weight: 500;
      font-size: 16px;
      margin: 0 0 4px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .extended-track-artist {
      opacity: 0.8;
      font-size: 14px;
      margin: 0 0 6px 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .extended-track-meta {
      display: flex;
      font-size: 12px;
      opacity: 0.6;
    }
    
    .extended-track-owner {
      margin-right: 15px;
    }
    
    .extended-track-added {
      flex-shrink: 0;
    }
    
    .no-tracks-message {
      color: rgba(255, 255, 255, 0.6);
      font-style: italic;
    }
  `;
  document.head.appendChild(extendedPlaylistStyles);

  // Добавляем стили для кнопки "сердечко"
  const likeButtonStyles = document.createElement('style');
  likeButtonStyles.textContent = `
    .track-controls {
      display: flex;
      align-items: center;
      margin-left: 8px;
    }
    
    .like-button {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 18px;
    }
    
    .like-button:hover {
      color: #ff4081;
      transform: scale(1.1);
    }
    
    .like-button.active {
      color: #ff4081;
    }
    
    .like-button:not(.active) .fa-heart {
      font-weight: normal;
      opacity: 0.5;
    }
    
    .like-button.active .fa-heart {
      font-weight: bold;
    }
  `;
  document.head.appendChild(likeButtonStyles);

  // Добавляем функцию для добавления/удаления трека из плейлиста
  function togglePlaylistTrack(track) {
    if (!track || !track.id) {
      console.error("Невозможно добавить/удалить трек без ID");
      return;
    }
    
    // Получаем данные пользователя
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.uid) {
      alert('Необходимо авторизоваться для управления плейлистом');
      return;
    }
    
    // Получаем инстанс базы данных
    let dbInstance;
    try {
      dbInstance = getDatabase();
    } catch (error) {
      console.error("Ошибка при получении базы данных:", error);
      alert('Ошибка при работе с плейлистом: не удалось подключиться к базе данных');
      return;
    }
    
    // Получаем ссылку на плейлист пользователя
    const playlistTrackRef = ref(dbInstance, `users/${userData.uid}/playlist/${track.id}`);
    
    // Проверяем, есть ли трек в плейлисте
    get(playlistTrackRef).then((snapshot) => {
      const isInPlaylist = snapshot.exists();
      
      if (isInPlaylist) {
        // Трек уже в плейлисте - удаляем его
        set(playlistTrackRef, null)
          .then(() => {
            console.log("Трек успешно удален из плейлиста");
            
            // Проверяем, был ли это активный трек
            const wasActiveTrack = (track.id === globalCurrentTrackId);
            
            // Обновляем статус трека в массивах
            const allTracksIndex = allTracks.findIndex(t => t.id === track.id);
            if (allTracksIndex !== -1) {
              allTracks[allTracksIndex].isInMyPlaylist = false;
            }
            
            const tracksIndex = tracks.findIndex(t => t.id === track.id);
            if (tracksIndex !== -1) {
              // Удаляем трек из массива треков пользователя
              tracks.splice(tracksIndex, 1);
            }
            
            // Обновляем кнопки "сердечко" при удалении из плейлиста
            document.querySelectorAll(`.like-button[data-track-id="${track.id}"]`).forEach(btn => {
              btn.classList.remove('active');
            });
            
            // Обновляем кнопки в результатах поиска
            document.querySelectorAll(`.search-like-button[data-track-id="${track.id}"]`).forEach(btn => {
              btn.classList.remove('active');
              btn.title = 'Добавить в плейлист';
            });
            
            // Обновляем отображение плейлиста
            updateTrackList();
            
            // Если это был активный трек, обновляем активные элементы UI
            if (wasActiveTrack) {
              setTimeout(() => {
                updateActiveTrackUI(globalCurrentTrackId);
              }, 100);
            }
            
            // Уведомляем пользователя
            alert('Трек удален из вашего плейлиста');
          })
          .catch((error) => {
            console.error("Ошибка при удалении трека из плейлиста:", error);
            alert('Произошла ошибка при удалении трека из плейлиста');
          });
      } else {
        // Трека нет в плейлисте - добавляем его
        const playlistEntry = {
          addedAt: Date.now()
        };
        
        // Добавляем трек в плейлист пользователя
        set(playlistTrackRef, playlistEntry)
          .then(() => {
            console.log("Трек успешно добавлен в плейлист");
            
            // Обновляем статус трека в массивах
            const allTracksIndex = allTracks.findIndex(t => t.id === track.id);
            if (allTracksIndex !== -1) {
              allTracks[allTracksIndex].isInMyPlaylist = true;
            }
            
            // Добавляем трек в массив треков пользователя, если его там еще нет
            if (!tracks.some(t => t.id === track.id)) {
              track.isInMyPlaylist = true;
              tracks.push(track);
            }
            
            // Обновляем кнопки "сердечко" при добавлении в плейлист
            document.querySelectorAll(`.like-button[data-track-id="${track.id}"]`).forEach(btn => {
              btn.classList.add('active');
            });
            
            // Обновляем кнопки в результатах поиска
            document.querySelectorAll(`.search-like-button[data-track-id="${track.id}"]`).forEach(btn => {
              btn.classList.add('active');
              btn.title = 'Удалить из плейлиста';
            });
            
            // Обновляем отображение плейлиста
            updateTrackList();
            
            // Уведомляем пользователя
            alert('Трек добавлен в ваш плейлист');
          })
          .catch((error) => {
            console.error("Ошибка при добавлении трека в плейлист:", error);
            alert('Произошла ошибка при добавлении трека в плейлист');
          });
      }
    }).catch((error) => {
      console.error("Ошибка при проверке трека в плейлисте:", error);
      alert('Произошла ошибка при проверке трека в плейлисте');
    });
  }

  // Глобальная версия функции для добавления/удаления трека в плейлист
  window.togglePlaylistTrack = togglePlaylistTrack;
}

// Вызываем функцию сразу
persistAudio();

// Быстрое восстановление аватарки из кеша
function restoreUserAvatarFromCache() {
  let avatarData = null;
  
  // Пытаемся получить кеш аватарки
  const cachedAvatar = sessionStorage.getItem('userAvatarCache');
  if (cachedAvatar) {
    try {
      avatarData = JSON.parse(cachedAvatar);
    } catch (e) {
      console.error('Ошибка при чтении кеша аватарки:', e);
    }
  }
  
  if (!avatarData) {
    // Если нет кеша, получаем данные из localStorage
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (userData) {
      avatarData = {
        photoURL: userData.photoURL,
        firstLetter: userData.email ? userData.email.charAt(0).toUpperCase() : 'U',
        stableId: userData.uid || userData.numericId || 'user'
      };
    } else {
      return; // Нет данных для восстановления
    }
  }
  
  // Проверяем, есть ли элементы аватаров
  const userAvatar = document.getElementById('user-avatar');
  const miniUserAvatar = document.getElementById('mini-user-avatar');
  const miniUserAvatarPhone = document.getElementById('mini-user-avatar-phone');
  
  // Вначале пытаемся восстановить из сохраненных DOM-элементов
  if (userAvatar || miniUserAvatar || miniUserAvatarPhone) {
    updateAvatarsDisplay(userAvatar, miniUserAvatar, miniUserAvatarPhone, avatarData);
  }
}

// Функция для инициализации уведомлений о непрочитанных сообщениях
function initializeMessagesNotifications() {
  // Проверяем, находимся ли мы на странице messages.html
  const currentPath = window.location.pathname;
  const isMessagesPage = currentPath.endsWith('/messages.html') || currentPath.endsWith('messages.html');
  
  // Если мы на странице сообщений, не инициализируем дублирующий слушатель,
  // так как там уже работает функционал из messages.js
  if (isMessagesPage) {
    console.log('Страница сообщений: используем существующий слушатель сообщений');
    return;
  }

  // Импортируем необходимые функции Firebase
  import('https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js').then((firebaseApp) => {
    import('https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js').then((firebaseAuth) => {
      import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js').then((firebaseDatabase) => {
        const { initializeApp } = firebaseApp;
        const { getAuth, onAuthStateChanged } = firebaseAuth;
        const { getDatabase, ref, get, onValue, off } = firebaseDatabase;

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

        // Слушатель для изменения аутентификации
        onAuthStateChanged(auth, (user) => {
          if (user) {
            // Пользователь вошел в систему, настраиваем слушатели для сообщений
            setupMessagesListener(db, user.uid);
          }
        });
      }).catch(error => {
        console.error("Ошибка при загрузке Firebase Database:", error);
      });
    }).catch(error => {
      console.error("Ошибка при загрузке Firebase Auth:", error);
    });
  }).catch(error => {
    console.error("Ошибка при загрузке Firebase App:", error);
  });
}

// Функция для инициализации контейнера уведомлений
function initializeNotificationsContainer() {
  // Проверяем, существует ли уже контейнер
  if (document.getElementById('notifications-container')) {
    return;
  }
  
  // Создаем контейнер для уведомлений
  const container = document.createElement('div');
  container.id = 'notifications-container';
  
  // Добавляем стили для контейнера
  container.style.position = 'fixed';
  container.style.bottom = '80px';
  container.style.right = '20px';
  container.style.zIndex = '9999';
  container.style.display = 'flex';
  container.style.flexDirection = 'column-reverse'; // Перевернутый порядок - новые уведомления внизу
  container.style.gap = '10px';
  
  // Добавляем контейнер в body
  document.body.appendChild(container);
  
  // Добавляем стили для уведомлений
  const styleEl = document.createElement('style');
  styleEl.id = 'notification-styles';
  styleEl.textContent = `
    .message-notification {
      display: flex;
      align-items: center;
      background-color: var(--bg-primary, #fff);
      color: var(--text-color, #333);
      border: 1px solid var(--border-color, #ddd);
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
      padding: 10px;
      width: 300px;
      animation: slide-in 0.3s ease-out forwards;
      transform: translateX(110%);
      position: relative;
      overflow: hidden;
      cursor: pointer;
    }
    
    .dark-mode .message-notification {
      background-color: #222;
      color: #fff;
      border-color: #444;
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    }
    
    .message-notification.closing {
      animation: slide-out 0.3s ease-in forwards;
    }
    
    @keyframes slide-in {
      from { transform: translateX(110%); }
      to { transform: translateX(0); }
    }
    
    @keyframes slide-out {
      from { transform: translateX(0); }
      to { transform: translateX(110%); }
    }
    
    .notification-avatar {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      object-fit: cover;
      margin-right: 10px;
      flex-shrink: 0;
      cursor: pointer;
      transition: transform 0.2s ease;
    }
    
    .notification-avatar:hover {
      transform: scale(1.1);
      box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
    }
    
    .notification-content {
      flex: 1;
      min-width: 0;
    }
    
    .notification-name {
      font-weight: bold;
      margin-bottom: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      transition: color 0.2s;
    }
    
    .notification-name:hover {
      color: var(--primary-color, #3498db);
      text-decoration: underline;
    }
    
    .notification-message {
      font-size: 0.9em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-muted, #666);
    }
    
    .dark-mode .notification-message {
      color: #aaa;
    }
    
    /* Стили для индикатора ответа в уведомлениях */
    .notification-reply-indicator {
      display: inline;
      color: var(--primary-color, #3498db);
      font-weight: 500;
      font-size: 0.9em;
    }
    
    .dark-mode .notification-reply-indicator {
      opacity: 0.95;
      text-shadow: 0 0 1px rgba(var(--primary-color-rgb, 25, 118, 210), 0.2);
    }
    
    .notification-close {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 12px;
      border-radius: 50%;
      background-color: var(--bg-secondary, #f0f0f0);
      color: var(--text-muted, #666);
    }
    
    .dark-mode .notification-close {
      background-color: #333;
      color: #aaa;
    }
    
    .notification-close:hover {
      background-color: var(--primary-color, #3498db);
      color: white;
    }
  `;
  
  // Добавляем стили в head
  document.head.appendChild(styleEl);
}

// Функция для правильного склонения слова "изображение" в зависимости от количества
function pluralizeImages(count) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} изображение`;
  } else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} изображения`;
  } else {
    return `${count} изображений`;
  }
}

// Функция для правильного склонения слова "видео" в зависимости от количества
function pluralizeVideos(count) {
  if (count === 1) {
    return '1 видео';
  } else if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} видео`;
  } else {
    return `${count} видеозаписей`;
  }
}

// Функция для создания и показа уведомления о новом сообщении
function showMessageNotification(senderData, message) {
  // Инициализируем контейнер, если его еще нет
  initializeNotificationsContainer();
  
  // Получаем контейнер уведомлений
  const container = document.getElementById('notifications-container');
  
  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.className = 'message-notification';
  
  // Определяем URL аватарки
  const avatarUrl = senderData.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.name || senderData.email || 'User')}&background=random`;
  
  // Проверяем, является ли сообщение ответом на другое сообщение
  let messageText = message.text || '';
  let replyIndicator = '';
  let mediaIndicators = '';
  
  // Проверяем наличие изображений и видео в сообщении
  const hasImages = message.imageUrls && message.imageUrls.length > 0;
  const hasVideos = message.videoUrls && message.videoUrls.length > 0;
  
  // Добавляем индикаторы медиафайлов
  if (hasImages) {
    mediaIndicators += `<span class="notification-reply-indicator">${pluralizeImages(message.imageUrls.length)}</span>`;
    
    if (hasVideos) {
      mediaIndicators += `<span class="notification-reply-indicator">, ${pluralizeVideos(message.videoUrls.length)}</span>`;
    }
  } else if (hasVideos) {
    mediaIndicators += `<span class="notification-reply-indicator">${pluralizeVideos(message.videoUrls.length)}</span>`;
  }
  
  if (message.replyTo) {
    // Проверяем, является ли replyTo массивом или одним объектом
    const repliesArray = Array.isArray(message.replyTo) ? message.replyTo : [message.replyTo];
    
    // Добавляем индикатор ответа в зависимости от количества цитат
    if (repliesArray.length > 1) {
      replyIndicator = `<span class="notification-reply-indicator">${hasImages || hasVideos ? ' ' : ''}(ответ на ${repliesArray.length} сообщ.)</span>`;
    } else {
      replyIndicator = `<span class="notification-reply-indicator">${hasImages || hasVideos ? ' ' : ''}(ответ)</span>`;
    }
  }
  
  // Создаем HTML для уведомления
  notification.innerHTML = `
    <img src="${avatarUrl}" alt="Avatar" class="notification-avatar" title="Просмотреть профиль">
    <div class="notification-content">
      <div class="notification-name">${senderData.name || senderData.email || 'Пользователь'}</div>
      <div class="notification-message">
        ${messageText} 
        ${mediaIndicators} 
        ${replyIndicator}
      </div>
    </div>
    <div class="notification-close">✕</div>
  `;
  
  // Добавляем обработчик клика на уведомление
  notification.addEventListener('click', (e) => {
    // Исключаем клик по кнопке закрытия
    if (e.target.closest('.notification-close')) {
      return;
    }
    
    // Если клик по аватару или имени - переходим на страницу профиля
    if (e.target.closest('.notification-avatar') || e.target.closest('.notification-name')) {
      // Используем numericId отправителя для перехода на страницу профиля
      const numericId = senderData.numericId; 
      if (numericId) {
        window.location.href = `profile.html?id=${numericId}`;
      } else {
        console.error('Не удалось получить numericId отправителя:', senderData);
        window.location.href = 'messages.html'; // Если нет numericId, переходим на страницу сообщений
      }
      return;
    }
    
    // Иначе переходим на страницу сообщений с выбранным чатом
    const senderId = message.senderId;
    if (senderId) {
      window.location.href = `messages.html?chat=${senderId}`;
    } else {
      window.location.href = 'messages.html';
    }
  });
  
  // Добавляем обработчик для кнопки закрытия
  const closeBtn = notification.querySelector('.notification-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Предотвращаем всплытие события
    closeNotification(notification);
  });
  
  // Добавляем уведомление в контейнер
  container.appendChild(notification);
  
  // Добавляем в массив активных уведомлений
  activeNotifications.push(notification);
  
  // Ограничиваем количество одновременных уведомлений
  if (activeNotifications.length > 3) {
    // Закрываем самое старое уведомление
    closeNotification(activeNotifications[0]);
  }
  
  // Автоматически закрываем уведомление через 5 секунд
  setTimeout(() => {
    if (notification.parentNode) {
      closeNotification(notification);
    }
  }, 5000);
}

// Функция для закрытия уведомления
function closeNotification(notification) {
  // Добавляем класс анимации закрытия
  notification.classList.add('closing');
  
  // Удаляем из массива активных уведомлений
  const index = activeNotifications.indexOf(notification);
  if (index > -1) {
    activeNotifications.splice(index, 1);
  }
  
  // Ждем завершения анимации и удаляем элемент
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300); // Время анимации
}

// Функция для загрузки звука уведомления
async function loadNotificationSound() {
  try {
    if (notificationSound) return; // Если звук уже создан, выходим
    
    // Создаем аудио-элемент
    notificationSound = new Audio();
    
    // Получаем URL звука из Firebase Storage
    const storage = getStorage();
    const soundRef = storageRef(storage, 'sounds/notification.mp3');
    const soundURL = await getDownloadURL(soundRef);
    
    // Устанавливаем URL и параметры
    notificationSound.src = soundURL;
    notificationSound.volume = 0.5; // Устанавливаем громкость на 50%
    notificationSound.preload = 'auto'; // Предзагрузка
    notificationSound.load();
    
    console.log('Звук уведомления загружен успешно');
  } catch (error) {
    console.error('Ошибка при загрузке звука уведомления:', error);
  }
}

// Очередь отложенных уведомлений
let pendingNotifications = [];
let isPageLoaded = false;
let isProcessingQueue = false;

// Проверяем загрузку страницы
document.addEventListener('DOMContentLoaded', () => {
  isPageLoaded = true;
  processNotificationQueue();
});

// Функция для обработки очереди отложенных уведомлений
async function processNotificationQueue() {
  if (isProcessingQueue || pendingNotifications.length === 0) return;
  
  isProcessingQueue = true;
  
  // Проверяем, было ли взаимодействие со страницей
  const hasInteracted = localStorage.getItem('userHasInteracted') === 'true';
  
  // Если нет взаимодействия или страница не загружена, прекращаем обработку
  if (!hasInteracted || !isPageLoaded) {
    isProcessingQueue = false;
    return;
  }
  
  // Воспроизводим все отложенные уведомления
  try {
    // Гарантируем, что звук загружен
    if (!notificationSound || !notificationSound.src) {
      await loadNotificationSound();
    }
    
    // Воспроизводим звук только один раз для всех уведомлений в очереди
    if (notificationSound) {
      notificationSound.currentTime = 0;
      try {
        await notificationSound.play();
        console.log('Воспроизведен звук для отложенных уведомлений');
      } catch (error) {
        console.error('Ошибка при воспроизведении звука для очереди уведомлений:', error);
        // Если ошибка связана с отсутствием взаимодействия, сбрасываем флаг
        if (error.name === 'NotAllowedError') {
          localStorage.removeItem('userHasInteracted');
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при обработке очереди уведомлений:', error);
  }
  
  // Очищаем очередь и сбрасываем флаг обработки
  pendingNotifications = [];
  isProcessingQueue = false;
}

// Функция для воспроизведения звукового уведомления
async function playNotificationSound() {
  // Добавляем уведомление в очередь
  pendingNotifications.push({ timestamp: Date.now() });
  
  // Проверяем, было ли взаимодействие со страницей
  const hasInteracted = localStorage.getItem('userHasInteracted') === 'true';
  
  // Если страница не полностью загружена или нет взаимодействия, просто загружаем звук
  if (!isPageLoaded || !hasInteracted) {
    try {
      // Загружаем звук для будущего использования
      if (!notificationSound) {
        await loadNotificationSound();
        console.log('Звук уведомления загружен для будущего использования');
      }
    } catch (error) {
      console.error('Ошибка при загрузке звука уведомления:', error);
    }
    return;
  }
  
  // Если все условия соблюдены, обрабатываем очередь
  processNotificationQueue();
}

// Слушатель чатов для непрочитанных сообщений
let globalMessagesListener = null;

// Настраиваем слушатель сообщений
function setupMessagesListener(db, userId) {
  // Очищаем предыдущий слушатель, если он существует
  if (globalMessagesListener) {
    try {
      off(globalMessagesListener);
    } catch (error) {
      console.error("Ошибка при отключении слушателя сообщений:", error);
    }
  }

  // Проверяем, находимся ли мы на странице index.html
  const currentPath = window.location.pathname;
  const isIndexPage = currentPath.endsWith('/index.html') || currentPath.endsWith('index.html');
  
  // Если страница авторизации, не настраиваем слушатель
  if (isIndexPage) {
    console.log('Страница авторизации: не настраиваем слушатель сообщений');
    return;
  }

  // Слушаем изменения в чатах
  const chatsRef = ref(db, 'chats');
  
  let previousMessagesCount = {}; // Объект для хранения предыдущего количества сообщений в каждом чате
  
  globalMessagesListener = onValue(chatsRef, (snapshot) => {
    if (!snapshot.exists()) return;
    
    // Получаем текущие данные чатов
    const chatsData = snapshot.val();
    
    // Флаг, указывающий, были ли новые сообщения
    let hasNewMessages = false;
    
    // Проверяем каждый чат на наличие новых сообщений
    Object.entries(chatsData).forEach(([chatId, chatData]) => {
      if (!chatData.messages) return;
      
      const currentMessagesCount = Object.keys(chatData.messages).length;
      
      // Если это первое чтение, просто сохраняем количество сообщений
      if (previousMessagesCount[chatId] === undefined) {
        previousMessagesCount[chatId] = currentMessagesCount;
        return;
      }
      
      // Если количество сообщений увеличилось, проверяем, есть ли непрочитанные сообщения для текущего пользователя
      if (currentMessagesCount > previousMessagesCount[chatId]) {
        // Получаем только новые сообщения
        const newMessages = Object.entries(chatData.messages)
          .slice(-(currentMessagesCount - previousMessagesCount[chatId]))
          .map(([id, message]) => ({ id, ...message }));
          
        // Проходим по новым сообщениям
        newMessages.forEach(message => {
          // Проверяем, адресовано ли сообщение текущему пользователю
          if (message.receiverId === userId && message.read === false) {
            hasNewMessages = true;
            
            // Проверяем, не находимся ли мы на странице сообщений
            const isMessagesPage = currentPath.endsWith('/messages.html') || currentPath.endsWith('messages.html');
            
            // Если мы не на странице сообщений, показываем уведомление
            if (!isMessagesPage) {
              // Получаем данные отправителя из Firebase
              get(ref(db, `users/${message.senderId}`)).then((userSnapshot) => {
                if (userSnapshot.exists()) {
                  const senderData = userSnapshot.val();
                  
                  // Проверяем, не отключены ли уведомления для этого отправителя
                  const mutedChatsRef = ref(db, `userSettings/${userId}/mutedChats/${message.senderId}`);
                  get(mutedChatsRef).then((muteSnapshot) => {
                    const isMuted = muteSnapshot.exists() && muteSnapshot.val() === true;
                    
                    // Если уведомления не отключены, показываем уведомление
                    if (!isMuted) {
                      // Показываем уведомление
                      showMessageNotification(senderData, message);
                      
                      // Воспроизводим звук уведомления
                      playNotificationSound();
                    } else {
                      console.log('Уведомления отключены для чата с', senderData.name || senderData.email || 'пользователем');
                    }
                  }).catch(error => {
                    console.error('Ошибка при проверке статуса уведомлений:', error);
                    // В случае ошибки всё равно показываем уведомление
                    showMessageNotification(senderData, message);
                    playNotificationSound();
                  });
                }
              }).catch(error => {
                console.error('Ошибка при получении данных отправителя:', error);
              });
            }
          }
        });
      }
      
      // Обновляем счетчик сообщений
      previousMessagesCount[chatId] = currentMessagesCount;
    });
    
    // Если есть новые сообщения и это не страница сообщений, воспроизводим звук
    if (hasNewMessages) {
      const isMessagesPage = currentPath.endsWith('/messages.html') || currentPath.endsWith('messages.html');
      
      // Воспроизводим звук уведомления только если мы не на странице сообщений
      // Звук будет воспроизведен для каждого чата отдельно после проверки статуса уведомлений
    }
    
    // Обновляем счетчик непрочитанных сообщений
    updateUnreadMessagesCount(db, userId);
  });
}

// Получаем идентификатор чата
function getChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// Обновление счетчика непрочитанных сообщений
function updateUnreadMessagesCount(db, userId) {
  if (!userId) {
    return;
  }

  // Сначала получаем список друзей
  const userDataString = localStorage.getItem('userData');
  let numericId = null;
  
  if (userDataString) {
    try {
      const userData = JSON.parse(userDataString);
      if (userData && userData.numericId) {
        numericId = userData.numericId;
      }
    } catch (e) {
      console.error('Ошибка при парсинге userData:', e);
    }
  }

  if (!numericId) {
    // Если numericId не найден в localStorage, ищем в базе данных
    get(ref(db, `users/${userId}`)).then((snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        if (userData.numericId) {
          numericId = userData.numericId;
          getFriendsAndCountMessages(db, userId, numericId);
        }
      }
    }).catch(error => {
      console.error('Ошибка при получении numericId:', error);
    });
  } else {
    getFriendsAndCountMessages(db, userId, numericId);
  }
}

// Получаем друзей и считаем непрочитанные сообщения
function getFriendsAndCountMessages(db, userId, numericId) {
  // Получаем список друзей
  get(ref(db, `friendships/${numericId}`)).then(async (snapshot) => {
    if (snapshot.exists()) {
      const friendships = snapshot.val();
      // Фильтруем только друзей
      const friendNumericIds = Object.entries(friendships)
        .filter(([_, data]) => data && data.status === 'friends')
        .map(([friendNumericId, _]) => friendNumericId);

      // Если у пользователя есть друзья
      if (friendNumericIds.length > 0) {
        // Получаем информацию о пользователях, чтобы найти firebaseId друзей
        const usersSnapshot = await get(ref(db, 'users'));
        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          let friendIds = [];
          
          // Собираем firebaseId друзей
          for (const [firebaseUid, userData] of Object.entries(usersData)) {
            if (userData && userData.numericId && friendNumericIds.includes(String(userData.numericId))) {
              friendIds.push(firebaseUid);
            }
          }
          
          // Теперь считаем непрочитанные сообщения
          countUnreadMessages(db, userId, friendIds);
        }
      } else {
        // У пользователя нет друзей - скрываем индикатор сообщений
        updateNavUnreadIndicator(0);
      }
    } else {
      // У пользователя нет друзей - скрываем индикатор сообщений
      updateNavUnreadIndicator(0);
    }
  }).catch(error => {
    console.error('Ошибка при получении списка друзей:', error);
    updateNavUnreadIndicator(0);
  });
}

// Считаем непрочитанные сообщения
function countUnreadMessages(db, userId, friendIds) {
  let totalUnread = 0;
  const promises = [];
  
  // Для каждого друга считаем непрочитанные сообщения
  friendIds.forEach(friendId => {
    const chatId = getChatId(userId, friendId);
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    
    const promise = get(messagesRef).then((snapshot) => {
      if (snapshot.exists()) {
        const messages = snapshot.val();
        
        // Считаем непрочитанные сообщения от этого друга
        const unreadCount = Object.values(messages).filter(
          message => message.senderId === friendId && message.read === false
        ).length;
        
        totalUnread += unreadCount;
      }
    }).catch(error => {
      console.error('Ошибка при получении сообщений:', error);
    });
    
    promises.push(promise);
  });
  
  // Обновляем индикатор после обработки всех чатов
  Promise.all(promises).then(() => {
    updateNavUnreadIndicator(totalUnread);
  }).catch(error => {
    console.error('Ошибка при подсчете непрочитанных сообщений:', error);
    updateNavUnreadIndicator(0);
  });
}

// Обновляем индикаторы непрочитанных сообщений в навигации
function updateNavUnreadIndicator(totalUnread) {
  // Кешируем значение
  sessionStorage.setItem('unreadMessagesCount', totalUnread);
  
  // Получаем кнопки сообщений в сайдбаре
  const messagesButton = document.getElementById('messages-button');
  const messagesButtonCompact = document.getElementById('messages-button-compact');
  
  if (!messagesButton || !messagesButtonCompact) {
    return;
  }
  
  // Используем уже созданные индикаторы
  let navUnreadIndicator = messagesButton.querySelector('.nav-unread-indicator');
  let navUnreadIndicatorCompact = messagesButtonCompact.querySelector('.nav-unread-indicator');
  
  if (!navUnreadIndicator) {
    navUnreadIndicator = document.createElement('span');
    navUnreadIndicator.className = 'nav-unread-indicator';
    messagesButton.appendChild(navUnreadIndicator);
  }
  
  if (!navUnreadIndicatorCompact) {
    navUnreadIndicatorCompact = document.createElement('span');
    navUnreadIndicatorCompact.className = 'nav-unread-indicator';
    messagesButtonCompact.appendChild(navUnreadIndicatorCompact);
  }
  
  // Обновляем или скрываем индикаторы
  if (totalUnread > 0) {
    navUnreadIndicator.textContent = totalUnread;
    navUnreadIndicator.style.display = 'flex';
    
    navUnreadIndicatorCompact.textContent = totalUnread;
    navUnreadIndicatorCompact.style.display = 'flex';
  } else {
    navUnreadIndicator.style.display = 'none';
    navUnreadIndicatorCompact.style.display = 'none';
  }
}

// Функция для быстрой инициализации индикатора непрочитанных сообщений
function initializeUnreadIndicator() {
  // Создаем индикаторы заранее
  const messagesButton = document.getElementById('messages-button');
  const messagesButtonCompact = document.getElementById('messages-button-compact');
  
  if (messagesButton && !messagesButton.querySelector('.nav-unread-indicator')) {
    const navUnreadIndicator = document.createElement('span');
    navUnreadIndicator.className = 'nav-unread-indicator';
    navUnreadIndicator.style.display = 'none';
    messagesButton.appendChild(navUnreadIndicator);
  }
  
  if (messagesButtonCompact && !messagesButtonCompact.querySelector('.nav-unread-indicator')) {
    const navUnreadIndicatorCompact = document.createElement('span');
    navUnreadIndicatorCompact.className = 'nav-unread-indicator';
    navUnreadIndicatorCompact.style.display = 'none';
    messagesButtonCompact.appendChild(navUnreadIndicatorCompact);
  }
  
  // Пытаемся восстановить количество непрочитанных сообщений из кеша
  const cachedUnreadCount = sessionStorage.getItem('unreadMessagesCount');
  if (cachedUnreadCount !== null) {
    updateNavUnreadIndicator(parseInt(cachedUnreadCount));
  }
  
  // Быстрая проверка непрочитанных сообщений из localStorage
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (userData && userData.uid) {
    // Импортируем Firebase только если есть авторизованный пользователь
    import('https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js').then((firebaseApp) => {
      import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js').then((firebaseDatabase) => {
        const { initializeApp } = firebaseApp;
        const { getDatabase, ref, get } = firebaseDatabase;

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
        const db = getDatabase(app);

        // Быстрая проверка непрочитанных сообщений
        if (userData.numericId) {
          getFriendsAndCountMessages(db, userData.uid, userData.numericId);
        } else {
          // Если numericId нет в localStorage, получаем его из базы
          get(ref(db, `users/${userData.uid}`)).then((snapshot) => {
            if (snapshot.exists()) {
              const userDetails = snapshot.val();
              if (userDetails.numericId) {
                // Обновляем userData в localStorage
                userData.numericId = userDetails.numericId;
                localStorage.setItem('userData', JSON.stringify(userData));
                // Получаем количество непрочитанных сообщений
                getFriendsAndCountMessages(db, userData.uid, userDetails.numericId);
              }
            }
          });
        }
      });
    });
      }
  }

  // Добавляем стили для мобильного аватара после закрытия тега sidebar-toggle
  const mobileAvatarStyles = document.createElement('style');
  mobileAvatarStyles.textContent = `
  #mini-user-avatar-phone {
      width: 45px;
      height: 45px;
      border-radius: 50%;
      background-color: transparent;
      color: white;
      display: flex;
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
  				position: absolute;
  				right: 3%;
  				bottom: calc(100vh - 57px); /* Исходное значение: 610px. Рассчитано для сохранения отступа от верха как на iPhone SE (экран ~667px): 57px = 667px - 610px. */
          border: 1px solid white; /* Новая обводка */
        }
      }
  }
  
  /* Стили для индикатора непрочитанных сообщений */
  .nav-unread-indicator {
      background-color: red;
      color: white;
      font-size: 11px;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      padding: 0 5px;
      position: absolute;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      animation: pulse-in 0.3s ease-out;
  }
  
  /* Позиционирование для развернутого сайдбара */
  .sidebar:not(.collapsed) .nav-button .nav-unread-indicator {
      top: 50%;
      transform: translateY(-50%);
  		margin-right: 40px;
  }
  
  /* Позиционирование для свернутого сайдбара */
  .sidebar.collapsed .nav-button .nav-unread-indicator {
      top: 4px;
      right: 4px;
      transform: none;
  }
  
  /* Позиционирование для компактной версии */
  .sidebar-nav-compact .nav-button .nav-unread-indicator {
      top: 4px;
      right: 4px;
      min-width: 16px;
      height: 16px;
      font-size: 10px;
  }
  
  /* Стили для кнопки навигации */
  .nav-button {
      position: relative;
      display: flex;
      align-items: center;
      padding: 10px 10px; /* Добавляем отступы для лучшего позиционирования */
  }
  
  /* Стили для иконки в кнопке */
  .nav-button i {
      position: relative;
      width: 20px;
      text-align: center;
      margin-right: 10px; /* Добавляем отступ справа от иконки */
  }
  
  @keyframes pulse-in {
      0% {
          transform: scale(0.8) translateY(-50%);
          opacity: 0;
      }
      100% {
          transform: scale(1) translateY(-50%);
          opacity: 1;
      }
  }
  
  /* Анимация для свернутого состояния */
  @keyframes pulse-in-collapsed {
      0% {
          transform: scale(0.8);
          opacity: 0;
      }
      100% {
          transform: scale(1);
          opacity: 1;
      }
  }
  `;
  document.head.appendChild(mobileAvatarStyles);
  
  // Переменные состояния плеера и поиска
let currentTrackIndex = -1;
let tracks = [];
let isPlaying = false;
let isLoadingTrack = false;
let playerRestored = false;
let allTracks = []; // Все треки из базы данных для поиска
let fadeAudioInterval = null; // Интервал для эффекта плавного изменения громкости
const FADE_DURATION = 150; // Уменьшенная длительность эффекта fade в миллисекундах
let lastUserAction = 0; // Время последнего действия пользователя

// Функция для плавного изменения громкости (fade эффект)
function fadeAudio(audioElement, startVolume, endVolume, duration, onComplete) {
  // Проверка на быстрое повторное нажатие (менее 100мс)
  const now = Date.now();
  const isRapidClick = (now - lastUserAction < 100);
  
  // Для быстрых нажатий - применяем изменения мгновенно, без анимации
  if (isRapidClick) {
    // Очищаем любые существующие эффекты
    if (fadeAudioInterval) {
      clearInterval(fadeAudioInterval);
      fadeAudioInterval = null;
    }
    
    // Применяем конечную громкость немедленно
    audioElement.volume = endVolume;
    
    // Вызываем callback немедленно, если он есть
    if (typeof onComplete === 'function') {
      onComplete(endVolume);
    }
    
    // Обновляем время последнего действия
    lastUserAction = now;
    
    // Возвращаем пустую функцию отмены (т.к. изменения применены мгновенно)
    return () => {};
  }
  
  // Обновляем время последнего действия
  lastUserAction = now;
  
  // Очищаем предыдущий интервал, если он существует
  if (fadeAudioInterval) {
    clearInterval(fadeAudioInterval);
    fadeAudioInterval = null;
  }
  
  // Сохраняем оригинальную громкость для восстановления позже
  const originalVolume = audioElement.volume;
  
  // Установим начальное значение громкости
  audioElement.volume = startVolume;
  
  // Вычисляем шаг изменения громкости и интервал
  const steps = 10; // Уменьшаем количество шагов для более быстрой реакции
  const stepValue = (endVolume - startVolume) / steps;
  const stepDuration = duration / steps;
  
  let currentStep = 0;
  
  // Создаем интервал для плавного изменения громкости
  fadeAudioInterval = setInterval(() => {
    currentStep++;
    
    // Вычисляем новую громкость
    const newVolume = startVolume + (stepValue * currentStep);
    
    // Применяем новую громкость с ограничением диапазона от 0 до 1
    audioElement.volume = Math.max(0, Math.min(1, newVolume));
    
    // Если достигли последнего шага, завершаем
    if (currentStep >= steps) {
      clearInterval(fadeAudioInterval);
      fadeAudioInterval = null;
      
      // Устанавливаем конечное значение точно
      audioElement.volume = endVolume;
      
      // Вызываем callback-функцию, если она передана
      if (typeof onComplete === 'function') {
        onComplete(originalVolume);
      }
    }
  }, stepDuration);
  
  // Возвращаем функцию для принудительной остановки эффекта
  return () => {
    if (fadeAudioInterval) {
      clearInterval(fadeAudioInterval);
      fadeAudioInterval = null;
      // Возвращаем оригинальную громкость
      audioElement.volume = originalVolume;
    }
  };
}

// Функция для плавного затухания звука (fade-out)
function fadeOut(audioElement, duration, onComplete) {
  return fadeAudio(
    audioElement, 
    audioElement.volume, // Текущая громкость
    0, // Конечная громкость (тишина)
    duration, 
    onComplete
  );
}

// Функция для плавного увеличения громкости (fade-in)
function fadeIn(audioElement, duration, targetVolume = 1, onComplete) {
  // Сначала устанавливаем минимальную громкость
  const currentVolume = audioElement.volume;
  audioElement.volume = 0;
  
  return fadeAudio(
    audioElement, 
    0, // Начальная громкость (тишина)
    targetVolume !== undefined ? targetVolume : currentVolume, // Возвращаемся к текущей громкости или указанной
    duration, 
    onComplete
  );
}

// Глобальная функция для воспроизведения трека из поиска
function handlePlayTrack(track, playButton) {
  console.log("Воспроизведение трека из результатов поиска:", track);
  
  if (!track || !track.url) {
    console.error("Трек не содержит URL для воспроизведения");
    return;
  }
  
  if (!globalAudioPlayer) {
    console.error("Аудиоплеер не инициализирован");
    return;
  }
  
  // Сбрасываем все кнопки воспроизведения в исходное состояние
  document.querySelectorAll('.search-play-button').forEach(btn => {
    btn.innerHTML = '<i class="fas fa-play"></i>';
    btn.classList.remove('playing');
  });
  
  console.log("Все кнопки search-play-button сброшены в исходное состояние");
  
  // Если текущий трек уже играет, останавливаем его
  // Но НЕ останавливаем, если функция была вызвана из кнопки next-button или prev-button
  // Проверяем наличие в стеке вызовов строки с "next-button" или "prev-button"
  const isFromNextButton = new Error().stack.includes('next-button');
  const isFromPrevButton = new Error().stack.includes('prev-button');
  console.log("Вызов из next/prev button?", isFromNextButton || isFromPrevButton);
  
  if (globalCurrentTrackId === track.id && !globalAudioPlayer.paused && !isFromNextButton && !isFromPrevButton) {
    console.log("Останавливаем текущий трек, так как он уже играет");
    // Применяем эффект плавного затухания звука перед паузой
    fadeOut(globalAudioPlayer, FADE_DURATION, () => {
      globalAudioPlayer.pause();
      
      // Восстанавливаем громкость после паузы для следующего воспроизведения
      const volumeSlider = document.getElementById('volume-slider');
      const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
      globalAudioPlayer.volume = targetVolume;
    });
    
    if (playButton) {
      playButton.innerHTML = '<i class="fas fa-play"></i>';
      playButton.classList.remove('playing');
    }
    isPlaying = false;
    
    // Напрямую обновляем кнопку play-button в плеере
    const mainPlayButton = document.getElementById('play-button');
    if (mainPlayButton) {
      mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    // Напрямую обновляем индикатор в компактной кнопке музыки
    const musicButtonCompact = document.getElementById('music-button-compact');
    if (musicButtonCompact) {
      musicButtonCompact.classList.remove('playing');
      const indicator = musicButtonCompact.querySelector('.playing-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
    
    if (typeof updatePlayButton === 'function') {
      updatePlayButton();
    }
    
    // Снимаем активные классы со всех элементов
    updateActiveTrackUI(null);
    return;
  }
  
  // Определяем, нужно ли сбрасывать время воспроизведения
  const isNewTrack = globalCurrentTrackId !== track.id;
  
  // Обновляем активные элементы в UI
  updateActiveTrackUI(track.id);
  
  // Сначала останавливаем текущее воспроизведение
  globalAudioPlayer.pause();
  
  // Обновляем интерфейс плеера
  if (typeof window._updatePlayerInterface === 'function') { 
    window._updatePlayerInterface(track); // Вызываем через window
  } else {
    console.error("CRITICAL: window._updatePlayerInterface is not defined!");
     // Можно оставить базовое обновление как крайний случай, если функция все еще не доступна
    const albumCover = document.getElementById('album-cover');
    if (albumCover) albumCover.src = track.cover || DEFAULT_ALBUM_COVER;
    const trackTitle = document.getElementById('track-name');
    if (trackTitle) trackTitle.textContent = track.title;
    const artistName = document.getElementById('artist-name');
    if (artistName) artistName.textContent = track.artist;
  }
  
  // Обновляем глобальный ID трека до установки URL
  // Это важно для предотвращения пропуска треков при автоматическом воспроизведении
  if (isNewTrack) {
    console.log(`Обновляем глобальный ID трека c ${globalCurrentTrackId} на ${track.id}`);
    globalCurrentTrackId = track.id;
  }
      
  // Устанавливаем URL трека только если мы переключились на новый трек
  if (isNewTrack) {
    globalAudioPlayer.src = track.url;
    
    // Сбрасываем время воспроизведения только при переключении на новый трек
    globalAudioPlayer.currentTime = 0;
  }
  
  // Обновляем кнопку воспроизведения
  if (playButton) {
    playButton.innerHTML = '<i class="fas fa-pause"></i>';
    playButton.classList.add('playing');
  }
  
  // Получаем целевую громкость из слайдера или используем значение по умолчанию
  const volumeSlider = document.getElementById('volume-slider');
  const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
  
  // Устанавливаем начальную громкость в ноль для эффекта нарастания
  globalAudioPlayer.volume = 0;
  
  // Начинаем воспроизведение
  const playPromise = globalAudioPlayer.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isPlaying = true;
        
        // Применяем эффект плавного нарастания громкости
        fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
        
        // Напрямую обновляем кнопку play-button в плеере
        const playButton = document.getElementById('play-button');
        if (playButton) {
          playButton.innerHTML = '<i class="fas fa-pause"></i>';
        }
        
        if (typeof updatePlayButton === 'function') {
          updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
        }
        
        if (typeof savePlayerState === 'function') {
          savePlayerState();
        }
      })
      .catch(error => {
        console.error('Ошибка при воспроизведении:', error);
        isPlaying = false;
        if (playButton) {
          playButton.innerHTML = '<i class="fas fa-play"></i>';
          playButton.classList.remove('playing');
        }
        // Напрямую обновляем кнопку play-button в плеере
        const mainPlayButton = document.getElementById('play-button');
        if (mainPlayButton) {
          mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
        }
        
        // Напрямую обновляем индикатор в компактной кнопке музыки
        const musicButtonCompact = document.getElementById('music-button-compact');
        if (musicButtonCompact) {
          musicButtonCompact.classList.remove('playing');
          const indicator = musicButtonCompact.querySelector('.playing-indicator');
          if (indicator) {
            indicator.style.display = 'none';
          }
        }
        
        // Восстанавливаем громкость после ошибки
        globalAudioPlayer.volume = targetVolume;
        
        if (typeof updatePlayButton === 'function') {
          updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
        }
      });
  }
  
  // Добавляем обработчик окончания трека
  globalAudioPlayer.onended = () => {
    console.log("Трек завершен, проверяем необходимость перехода к следующему треку");
    
    // Проверяем, открыта ли вкладка поиска и активна ли она
    const searchTab = document.getElementById('search-tab');
    const isSearchTabActive = searchTab && searchTab.classList.contains('active');
    
    // Если вкладка поиска активна, позволяем обработчику в audioPlayer.addEventListener('ended')
    // обработать переход к следующему треку, не выполняя стандартный next-button.click()
    if (isSearchTabActive) {
      console.log("Вкладка поиска активна, пропускаем стандартный переход к следующему треку");
      // Обновляем иконки для UI синхронизации
      isPlaying = false;
      if (playButton) {
        playButton.innerHTML = '<i class="fas fa-play"></i>';
        playButton.classList.remove('playing');
      }
      
      // Напрямую обновляем кнопку play-button в плеере
      const mainPlayButton = document.getElementById('play-button');
      if (mainPlayButton) {
        mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
      }
      
      // Напрямую обновляем индикатор в компактной кнопке музыки
      const musicButtonCompact = document.getElementById('music-button-compact');
      if (musicButtonCompact) {
        musicButtonCompact.classList.remove('playing');
        const indicator = musicButtonCompact.querySelector('.playing-indicator');
        if (indicator) {
          indicator.style.display = 'none';
        }
      }
      
      if (typeof updatePlayButton === 'function') {
        updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
      }
      
      // Событие завершения трека обрабатывается в основном обработчике
      return;
    }
    
    // Сначала обновляем иконки до старта следующего трека
    isPlaying = false;
    if (playButton) {
      playButton.innerHTML = '<i class="fas fa-play"></i>';
      playButton.classList.remove('playing');
    }
    
    // Напрямую обновляем кнопку play-button в плеере
    const mainPlayButton = document.getElementById('play-button');
    if (mainPlayButton) {
      mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
    }
    
    // Напрямую обновляем индикатор в компактной кнопке музыки
    const musicButtonCompact = document.getElementById('music-button-compact');
    if (musicButtonCompact) {
      musicButtonCompact.classList.remove('playing');
      const indicator = musicButtonCompact.querySelector('.playing-indicator');
      if (indicator) {
        indicator.style.display = 'none';
      }
    }
    
    if (typeof updatePlayButton === 'function') {
      updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
    }
    
    // Проверяем наличие флага автоматического перехода к следующему треку
    const userPrefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    const autoPlayNext = userPrefs.autoPlayNext !== false; // По умолчанию включено
    
    if (autoPlayNext) {
      // Сохраняем текущую громкость для нового трека
      const volumeSlider = document.getElementById('volume-slider');
      const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
      
      // Имитируем нажатие на кнопку "Следующий трек" с небольшой задержкой
      // для плавного перехода между треками
      setTimeout(() => {
        const nextButton = document.getElementById('next-button');
        if (nextButton) {
          console.log("Автоматический переход к следующему треку через next-button");
          nextButton.click();
          
          // После автоматического нажатия на кнопку следующего трека
          // программно запускаем эффект fade-in для нового трека
          setTimeout(() => {
            if (globalAudioPlayer && !globalAudioPlayer.paused) {
              fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
            }
          }, 100);
        }
      }, 200);
    }
  };
}

// Инициализация обработчиков событий для поиска треков
function initializeSearchTab() {
  console.log("Инициализация вкладки поиска");
  
  // Проверяем, что Firebase инициализирован
  let dbInstance;
  try {
    dbInstance = getDatabase();
    console.log("База данных Firebase инициализирована");
  } catch (error) {
    console.error("Ошибка при получении ссылки на Firebase:", error);
  }
  
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const searchResultsList = document.getElementById('search-results-list');
  
  if (!searchInput || !searchButton || !searchResultsList) {
    console.error("Не найдены элементы вкладки поиска:", { 
      searchInput, 
      searchButton, 
      searchResultsList 
    });
    return;
  } else {
    console.log("Элементы вкладки поиска найдены");
  }
  
  // Функция для выполнения поиска
  const performSearch = () => {
    console.log("Выполняется поиск");
    const query = searchInput.value.toLowerCase().trim();
    
    console.log("Все треки:", allTracks);
    
    if (!allTracks || allTracks.length === 0) {
      console.log("Нет треков для поиска");
      searchResultsList.innerHTML = '<div class="no-results">Нет доступных треков для поиска</div>';
      return;
    }
    
    // Фильтруем треки по запросу или показываем все, если запрос пустой
    const searchResults = query 
      ? allTracks.filter(track => 
          track.title.toLowerCase().includes(query) || 
          track.artist.toLowerCase().includes(query))
      : allTracks;
    
    console.log("Результаты поиска:", searchResults);
    
    if (searchResults.length === 0) {
      searchResultsList.innerHTML = '<div class="no-results">Ничего не найдено</div>';
      return;
    }
    
    // Очищаем список результатов
    searchResultsList.innerHTML = '';
    
    // Проверяем наличие глобального аудиоплеера
    if (!globalAudioPlayer) {
      console.log("Инициализация глобального аудиоплеера для поиска");
      globalAudioPlayer = new Audio();
      
      // Подключаем к Web Audio API для непрерывного воспроизведения
      if (audioContext) {
        try {
          // Создаем источник аудио из элемента
          const source = audioContext.createMediaElementSource(globalAudioPlayer);
          // Подключаем его напрямую к выходу
          source.connect(audioContext.destination);
          window.globalAudioSource = source;
        } catch (e) {
          console.error('Ошибка при инициализации Web Audio API для поиска:', e);
        }
      }
    }
    
    // Заполняем список результатов
    searchResults.forEach(track => {
      const listItem = document.createElement('li');
      listItem.className = 'search-result-item';
      listItem.dataset.id = track.id;
      
      // Проверяем, является ли текущий трек активным
      if (track.id === globalCurrentTrackId) {
        listItem.classList.add('active');
      }
      
      // Создаем разметку для элемента списка без кнопок воспроизведения и добавления
      listItem.innerHTML = `
        <div class="search-result-cover">
          <img src="${track.cover || DEFAULT_ALBUM_COVER}" alt="Обложка трека">
        </div>
        <div class="search-result-info">
          <p class="search-result-title">${track.title}</p>
          <p class="search-result-artist">${track.artist} • ${track.userName}</p>
        </div>
        <div class="search-result-actions">
          <button class="search-play-button" title="Воспроизвести">
            <i class="fas fa-play"></i>
          </button>
          <button class="search-like-button ${track.isInMyPlaylist ? 'active' : ''}" title="${track.isInMyPlaylist ? 'Удалить из плейлиста' : 'Добавить в плейлист'}" data-track-id="${track.id}">
            <i class="fas fa-heart"></i>
          </button>
        </div>
      `;
      
      searchResultsList.appendChild(listItem);
      console.log("Добавлен элемент в список:", track.title);
      
      // Добавляем обработчики событий для кнопок в результате поиска
      setTimeout(() => {
        // Обработчик для кнопки воспроизведения
        const playButton = listItem.querySelector('.search-play-button');
        if (playButton) {
          // Устанавливаем начальное состояние кнопки play/pause для элемента поиска
          if (track.id === globalCurrentTrackId && isPlaying) {
            playButton.innerHTML = '<i class="fas fa-pause"></i>';
            playButton.classList.add('playing');
          } else {
            playButton.innerHTML = '<i class="fas fa-play"></i>';
            playButton.classList.remove('playing');
          }

          playButton.addEventListener('click', (e) => {
            e.stopPropagation();
            handlePlayTrack(track, playButton);
          });
        }
        
        // Обработчик для кнопки добавления в плейлист (сердечко)
        const likeButton = listItem.querySelector('.search-like-button');
        if (likeButton) {
          likeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlaylistTrack(track);
          });
        }
      }, 0);
    });

    // Добавляем стили для кнопок в результатах поиска
    const searchActionStyles = document.createElement('style');
    searchActionStyles.textContent = `
      .search-result-actions {
        display: flex;
        gap: 8px;
        margin-left: auto;
      }
      
      .search-play-button,
      .search-like-button {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.2);
        border: none;
        color: rgba(255, 255, 255, 0.8);
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        font-size: 16px;
      }
      
      .search-play-button:hover {
        background-color: #1db954;
        color: white;
        transform: scale(1.1);
      }
      
      .search-like-button:hover {
        color: #ff4081;
        transform: scale(1.1);
      }
      
      .search-like-button.active {
        color: #ff4081;
        background-color: rgba(255, 64, 129, 0.1);
      }
      
      .search-result-item {
        cursor: pointer;
      }
    `;
    document.head.appendChild(searchActionStyles);
  };
  
  // Используем глобальную функцию handlePlayTrack
  
  // Локальная функция для добавления трека в плейлист
  function handleAddTrack(track, buttonElement) {
    console.log("Добавление/удаление трека в/из плейлиста:", track);
    
    if (!track || !track.id) {
      console.error("Невозможно добавить/удалить трек без ID");
      return;
    }
    
    // Получаем данные пользователя
    const userData = JSON.parse(localStorage.getItem('userData'));
    if (!userData || !userData.uid) {
      alert('Необходимо авторизоваться для управления плейлистом');
      return;
    }
    
    // Получаем инстанс базы данных
    let dbInstance;
    try {
      dbInstance = getDatabase();
    } catch (error) {
      console.error("Ошибка при получении базы данных:", error);
      alert('Ошибка при работе с плейлистом: не удалось подключиться к базе данных');
      return;
    }
    
    // Получаем ссылку на трек в базе данных пользователя
    const trackRef = ref(dbInstance, `users/${userData.uid}/tracks/${track.id}`);
    
    // Проверяем, есть ли трек в плейлисте
    get(trackRef).then((snapshot) => {
      if (snapshot.exists()) {
        // Трек уже в плейлисте - удаляем его
        const confirmDelete = confirm('Удалить трек из вашего плейлиста?');
        if (confirmDelete) {
          // Удаляем трек из базы данных
          set(trackRef, null)
            .then(() => {
              console.log("Трек успешно удален из плейлиста");
              
              // Обновляем статус трека в общем массиве
              if (typeof allTracks !== 'undefined' && Array.isArray(allTracks)) {
                const trackIndex = allTracks.findIndex(t => t.id === track.id);
                if (trackIndex !== -1) {
                  allTracks[trackIndex].isInMyPlaylist = (allTracks[trackIndex].userId === userData.uid);
                }
              }
              
              // Обновляем кнопку добавления
              if (buttonElement) {
                buttonElement.innerHTML = '<i class="fas fa-plus"></i>';
                buttonElement.classList.remove('in-playlist');
                buttonElement.title = 'Добавить в мой плейлист';
              }
              
              // Обновляем список треков
              try {
                if (typeof window.loadTracksFromFirebase === 'function') {
                  window.loadTracksFromFirebase();
                } else {
                  console.log("Обновляем треки через перезагрузку вкладки");
                  const tabButton = document.querySelector('.tab-button[data-tab="player-tab"]');
                  if (tabButton) {
                    tabButton.click();
                  }
                }
              } catch (error) {
                console.error("Ошибка при обновлении списка треков:", error);
              }
              
              alert('Трек успешно удален из вашего плейлиста');
            })
            .catch((error) => {
              console.error("Ошибка при удалении трека:", error);
              alert('Произошла ошибка при удалении трека');
            });
        }
      } else {
        // Трека нет в плейлисте - добавляем его
        // Создаем данные для добавления
        const trackData = {
          addedAt: Date.now()
        };
        
        // Добавляем трек в базу данных
        set(trackRef, trackData)
          .then(() => {
            console.log("Трек успешно добавлен в плейлист");
            
            // Обновляем интерфейс
            // Обновляем статус трека в общем массиве
            if (typeof allTracks !== 'undefined' && Array.isArray(allTracks)) {
              const trackIndex = allTracks.findIndex(t => t.id === track.id);
              if (trackIndex !== -1) {
                allTracks[trackIndex].isInMyPlaylist = true;
              }
            }
            
            // Изменяем кнопку добавления
            if (buttonElement) {
              buttonElement.innerHTML = '<i class="fas fa-check"></i>';
              buttonElement.classList.add('in-playlist');
              buttonElement.title = 'Удалить из плейлиста';
            }
            
            // Показываем уведомление
            alert('Трек успешно добавлен в ваш плейлист');
            
            try {
              // Обновляем список треков пользователя
              if (typeof window.loadTracksFromFirebase === 'function') {
                window.loadTracksFromFirebase();
              } else {
                console.log("Обновляем треки через перезагрузку вкладки");
                // Перезагружаем вкладку плеера
                const tabButton = document.querySelector('.tab-button[data-tab="player-tab"]');
                if (tabButton) {
                  tabButton.click();
                }
              }
            } catch (error) {
              console.error("Ошибка при обновлении списка треков:", error);
            }
          })
          .catch((error) => {
            console.error("Ошибка при добавлении трека:", error);
            alert('Произошла ошибка при добавлении трека');
          });
      }
    }).catch((error) => {
      console.error("Ошибка при проверке трека:", error);
      alert('Произошла ошибка при проверке трека');
    });
  }
  
  // Обработчик для кнопки поиска
  if (searchButton) {
    searchButton.addEventListener('click', performSearch);
  }
  
  // Обработчик для поля ввода (поиск при нажатии Enter)
  if (searchInput) {
    searchInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
    
    // Добавляем обработчик для ввода текста
    searchInput.addEventListener('input', performSearch);
  }
  
  // Показываем все доступные треки при открытии вкладки
  setTimeout(performSearch, 300);
}

// Добавляем инициализацию вкладки поиска
function openModal() {
  if (!musicPlayerModal) {
    console.error('Модальное окно плеера не найдено');
    return;
  }
  
  // Проверяем и инициализируем аудиоплеер при необходимости
  if (!audioPlayer) {
    console.error('Аудиоплеер не инициализирован');
    return;
  }
  
  // Проверяем авторизацию
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (!userData || !userData.uid) {
    alert('Необходимо авторизоваться для доступа к музыкальному плееру');
    return;
  }
  
  // Отображаем модальное окно
  musicPlayerModal.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Предотвращаем прокрутку страницы
  
  // Проверяем, есть ли треки
  console.log("Количество треков при открытии модального окна:", allTracks ? allTracks.length : 0);
  
  // Загружаем треки, если список пуст
  if (!tracks || tracks.length === 0 || !allTracks || allTracks.length === 0) {
    console.log("Загружаем треки из Firebase");
    loadTracksFromFirebase();
  } else {
    // ... existing code ...
  }
  
  // ... existing code ...
  
  // Инициализируем вкладку поиска с передачей необходимого контекста
  initializeSearchTab();
  
  // Добавляем дополнительные стили для поиска
  fixSearchTabStyles();
  
  // Если активна вкладка поиска, обновляем результаты поиска
  const searchTab = document.getElementById('search-tab');
  const playerTab = document.getElementById('player-tab');
  
  if (searchTab && playerTab) {
    console.log("Активная вкладка поиска:", searchTab.classList.contains('active'));
    
    if (searchTab.classList.contains('active')) {
      // Если вкладка поиска активна, запускаем поиск для отображения всех треков
      setTimeout(() => {
        console.log("Запускаем поиск при активной вкладке поиска");
        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        
        if (searchButton) {
          searchButton.click();
        } else if (typeof performSearch === 'function') {
          performSearch();
        }
      }, 300);
    }
  }
}

// ... existing code ...

// Исправляем проблему с инициализацией Tab Content
// Добавляем стили, чтобы .tab-content.active был всегда виден
document.addEventListener('DOMContentLoaded', () => {
  const additionalStyles = document.createElement('style');
  additionalStyles.textContent = `
    .tab-content.active {
      display: block !important;
    }
    
    #search-tab.active {
      display: block !important;
    }
    
    .search-result-item {
      display: flex !important;
    }
    
    .search-container {
      display: flex !important;
    }
  `;
  document.head.appendChild(additionalStyles);
  
  // Принудительно показываем контент активной вкладки
  document.querySelectorAll('.tab-content.active').forEach(content => {
    content.style.display = 'block';
  });
});

// Проверим видимость и стили для вкладки поиска
const searchTabStyles = `
.search-container {
  padding: 15px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-header {
  margin-bottom: 20px;
}

.search-header h3 {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 18px;
}

.search-form {
  margin-bottom: 20px;
}

.search-input-wrapper {
  display: flex;
  width: 100%;
}

#search-input {
  flex: 1;
  padding: 10px 15px;
  border-radius: 5px 0 0 5px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background-color: rgba(255, 255, 255, 0.1);
  color: var(--text-color, #fff);
  font-size: 14px;
}

#search-button {
  width: 50px;
  background-color: #1db954;
  color: white;
  border: none;
  border-radius: 0 5px 5px 0;
  cursor: pointer;
  transition: background-color 0.3s;
}

#search-button:hover {
  background-color: #1ed760;
}

.music-search-results {
  flex: 1;
  overflow-y: auto;
}

.music-search-results h4 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 16px;
}

#search-results-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
}

.search-result-item {
  padding: 12px;
  border-radius: 5px;
  margin-bottom: 8px;
  background-color: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  gap: 12px;
  transition: background-color 0.2s;
}

.search-result-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.search-result-cover {
  width: 50px;
  height: 50px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.search-result-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.search-result-info {
  flex: 1;
  overflow: hidden;
}

.search-result-title {
  font-weight: bold;
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result-artist {
  font-size: 12px;
  opacity: 0.8;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result-actions {
  display: flex;
  gap: 8px;
}

.search-play-button,
.search-add-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1db954;
  color: white;
  border: none;
  cursor: pointer;
  transition: transform 0.2s, background-color 0.2s;
}

.search-play-button:hover,
.search-add-button:hover {
  background-color: #1ed760;
  transform: scale(1.1);
}

.search-play-button i,
.search-add-button i {
  font-size: 14px;
}

.no-results {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}
`;

// Добавляем стили напрямую в head
function fixSearchTabStyles() {
  // Проверка на существование стилей
  if (document.getElementById('search-tab-styles')) {
    return; // Стили уже добавлены
  }
  
  console.log("Добавляем стили для вкладки поиска");
  
  const styleElement = document.createElement('style');
  styleElement.id = 'search-tab-styles';
  styleElement.textContent = searchTabStyles;
  document.head.appendChild(styleElement);
  
  // Добавляем дополнительные стили для корректного отображения
  const additionalStyles = document.createElement('style');
  additionalStyles.id = 'search-tab-additional-styles';
  additionalStyles.textContent = `
    .tab-content.active {
      display: block !important;
    }
    
    #search-tab.active {
      display: block !important;
    }
    
    .search-result-item {
      display: flex !important;
    }
    
    .search-container {
      display: flex !important;
    }
    
    /* Принудительно показываем элементы во вкладке поиска */
    #search-tab .search-container,
    #search-tab .search-header,
    #search-tab .search-form,
    #search-tab .music-search-results,
    #search-tab #search-results-list {
      display: block !important;
    }
    
    /* Исправление для flex-контейнеров */
    #search-tab .search-container {
      display: flex !important;
    }
    
    #search-tab .search-input-wrapper {
      display: flex !important;
    }
    
    #search-tab .search-result-item {
      display: flex !important;
    }
    
    #search-tab .search-result-actions {
      display: flex !important;
    }
    
    /* Убеждаемся, что музыкальные стили имеют приоритет */
    #search-tab .music-search-results {
      flex: 1 !important;
      overflow-y: auto !important;
      display: block !important;
    }
  `;
  document.head.appendChild(additionalStyles);
  
  // Проверяем и принудительно показываем все элементы поиска
  setTimeout(() => {
    // Проверяем видимость вкладки поиска
    const searchTab = document.getElementById('search-tab');
    if (searchTab && searchTab.classList.contains('active')) {
      searchTab.style.display = 'block';
      
      // Находим все дочерние элементы вкладки поиска
      const elements = searchTab.querySelectorAll('*');
      elements.forEach(el => {
        // Для flex-контейнеров устанавливаем display: flex
        if (el.classList.contains('search-container') ||
            el.classList.contains('search-input-wrapper') ||
            el.classList.contains('search-result-item') ||
            el.classList.contains('search-result-actions')) {
          el.style.display = 'flex';
        } 
        // Для музыкальных результатов поиска
        else if (el.classList.contains('music-search-results')) {
          el.style.display = 'block';
        }
        // Для остальных элементов - display: block
        else {
          el.style.display = 'block';
        }
      });
      
      console.log("Стили вкладки поиска обновлены");
    }
  }, 100);
}

// Функция для воспроизведения трека из результатов поиска
function playSearchTrack(track) {
  console.log("Воспроизведение трека из результатов поиска:", track);
  
  if (!track || !track.url) {
    console.error("Трек не содержит URL для воспроизведения");
    return;
  }
  
  // Получаем глобальный аудиоплеер
  if (!globalAudioPlayer) {
    console.error("Аудиоплеер не инициализирован");
    return;
  }
  
  // Проверяем, не воспроизводится ли уже этот трек
  if (globalCurrentTrackId === track.id && !globalAudioPlayer.paused) {
    console.log("Этот трек уже воспроизводится, ставим на паузу");
    globalAudioPlayer.pause();
    isPlaying = false;
    updatePlayButton();
    return;
  }
  
  // Проверяем, не загружен ли уже этот трек (но на паузе)
  if (globalCurrentTrackId === track.id && globalAudioPlayer.paused) {
    console.log("Этот трек уже загружен, продолжаем воспроизведение");
    globalAudioPlayer.play()
      .then(() => {
        isPlaying = true;
        updatePlayButton();
        savePlayerState();
      })
      .catch(error => {
        console.error('Ошибка при воспроизведении:', error);
        isPlaying = false;
        updatePlayButton();
      });
    return;
  }
  
  // Сначала останавливаем текущее воспроизведение
  globalAudioPlayer.pause();
  
  // Обновляем интерфейс
  _updatePlayerInterface(track);
  
  // Устанавливаем URL трека
  globalAudioPlayer.src = track.url;
  
  // Обновляем глобальный ID трека
  globalCurrentTrackId = track.id;
  
  // Сбрасываем время воспроизведения
  globalAudioPlayer.currentTime = 0;
  
  // Кэшируем трек для восстановления после перезагрузки страницы
  localStorage.setItem(`trackCache_${track.id}`, JSON.stringify(track));
  
  // Начинаем воспроизведение
  const playPromise = globalAudioPlayer.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        isPlaying = true;
        updatePlayButton();
        savePlayerState();
        
        // Активируем вкладку плеера
        document.querySelector('.tab-button[data-tab="player-tab"]').click();
      })
      .catch(error => {
        console.error('Ошибка при воспроизведении:', error);
        isPlaying = false;
        updatePlayButton();
      });
  }
  
  // Для удобства пользователя, переходим к вкладке плеера
  setTimeout(() => {
    document.querySelector('.tab-button[data-tab="player-tab"]').click();
  }, 300);
}

// Функция для добавления трека в плейлист пользователя
function addTrackToPlaylist(track) {
  console.log("Добавление трека в плейлист:", track);
  
  if (!track || !track.id) {
    console.error("Невозможно добавить трек без ID");
    return;
  }
  
  // Получаем референс к Firebase Database
  const dbInstance = getDatabase();
  if (!dbInstance) {
    console.error("База данных не инициализирована");
    return;
  }
  
  // Получаем данные пользователя
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (!userData || !userData.uid) {
    alert('Необходимо авторизоваться для добавления треков в плейлист');
    return;
  }
  
  // Добавляем трек в базу данных пользователя
  const trackRef = ref(dbInstance, `users/${userData.uid}/tracks/${track.id}`);
  
  // Проверяем, не добавлен ли уже этот трек
  get(trackRef).then((snapshot) => {
    if (snapshot.exists()) {
      alert('Этот трек уже добавлен в ваш плейлист');
      return;
    }
    
    // Создаем данные для добавления
    const trackData = {
      title: track.title,
      artist: track.artist,
      url: track.url,
      cover: track.cover,
      addedAt: Date.now(),
      originalUserId: track.userId // Сохраняем ID владельца трека
    };
    
    // Добавляем трек в базу данных
    set(trackRef, trackData)
      .then(() => {
        console.log("Трек успешно добавлен в плейлист");
        
        // Обновляем интерфейс
        // Добавляем трек в локальный массив треков
        const newTrack = {
          ...track,
          isInMyPlaylist: true
        };
        tracks.push(newTrack);
        
        // Обновляем статус трека в общем массиве
        const trackIndex = allTracks.findIndex(t => t.id === track.id);
        if (trackIndex !== -1) {
          allTracks[trackIndex].isInMyPlaylist = true;
        }
        
        // Обновляем отображение в плейлисте
        updateTrackList();
        
        // Обновляем отображение в результатах поиска
        // Находим элемент в результатах поиска
        const searchResultItem = document.querySelector(`.search-result-item[data-id="${track.id}"]`);
        if (searchResultItem) {
          // Находим кнопку добавления
          const addButton = searchResultItem.querySelector('.search-add-button');
          if (addButton) {
            // Заменяем кнопку на отметку о добавлении
            addButton.innerHTML = '<i class="fas fa-check"></i>';
            addButton.disabled = true;
            addButton.title = 'Уже в вашем плейлисте';
          }
        }
        
        // Показываем уведомление
        alert('Трек успешно добавлен в ваш плейлист');
      })
      .catch((error) => {
        console.error("Ошибка при добавлении трека:", error);
        alert('Произошла ошибка при добавлении трека');
      });
  }).catch((error) => {
    console.error("Ошибка при проверке трека:", error);
    alert('Произошла ошибка при проверке трека');
  });
}

// Глобальная функция для добавления трека в плейлист пользователя
window.addTrackToUserPlaylist = function(track, buttonElement) {
  console.log("Глобальная функция добавления/удаления трека в/из плейлиста:", track);
  
  if (!track || !track.id) {
    console.error("Невозможно добавить/удалить трек без ID");
    return;
  }
  
  // Получаем данные пользователя
  const userData = JSON.parse(localStorage.getItem('userData'));
  if (!userData || !userData.uid) {
    alert('Необходимо авторизоваться для управления плейлистом');
    return;
  }
  
  // Получаем инстанс базы данных
  let dbInstance;
  try {
    dbInstance = getDatabase();
  } catch (error) {
    console.error("Ошибка при получении базы данных:", error);
    alert('Ошибка при работе с плейлистом: не удалось подключиться к базе данных');
    return;
  }
  
  // Получаем ссылку на трек в базе данных пользователя
  const trackRef = ref(dbInstance, `users/${userData.uid}/tracks/${track.id}`);
  
  // Проверяем, есть ли трек в плейлисте
  get(trackRef).then((snapshot) => {
    if (snapshot.exists()) {
      // Трек уже в плейлисте - удаляем его
      const confirmDelete = confirm('Удалить трек из вашего плейлиста?');
      if (confirmDelete) {
        // Удаляем трек из базы данных
        set(trackRef, null)
          .then(() => {
            console.log("Трек успешно удален из плейлиста");
            
            // Обновляем статус трека в общем массиве
            if (typeof allTracks !== 'undefined' && Array.isArray(allTracks)) {
              const trackIndex = allTracks.findIndex(t => t.id === track.id);
              if (trackIndex !== -1) {
                allTracks[trackIndex].isInMyPlaylist = false;
              }
            }
            
            // Изменяем кнопку добавления
            if (buttonElement) {
              buttonElement.innerHTML = '<i class="fas fa-plus"></i>';
              buttonElement.classList.remove('in-playlist');
              buttonElement.title = 'Добавить в мой плейлист';
            }
            
            // Обновляем список треков
            try {
              // Обновляем список треков пользователя
              if (typeof window.loadTracksFromFirebase === 'function') {
                window.loadTracksFromFirebase();
              } else {
                console.log("Обновляем треки через перезагрузку вкладки");
                // Перезагружаем вкладку плеера
                const tabButton = document.querySelector('.tab-button[data-tab="player-tab"]');
                if (tabButton) {
                  tabButton.click();
                }
              }
            } catch (error) {
              console.error("Ошибка при обновлении списка треков:", error);
            }
            
            alert('Трек успешно удален из вашего плейлиста');
          })
          .catch((error) => {
            console.error("Ошибка при удалении трека:", error);
            alert('Произошла ошибка при удалении трека');
          });
      }
    } else {
      // Трека нет в плейлисте - добавляем его
      // Создаем данные для добавления
      const trackData = {
        title: track.title,
        artist: track.artist,
        url: track.url,
        cover: track.cover,
        addedAt: Date.now(),
        originalUserId: track.userId, // Сохраняем ID владельца трека
        isReference: true // Пометка, что это ссылка на трек другого пользователя
      };
      
      // Добавляем трек в базу данных
      set(trackRef, trackData)
        .then(() => {
          console.log("Трек успешно добавлен в плейлист");
          
          // Обновляем интерфейс
          // Обновляем статус трека в общем массиве
          if (typeof allTracks !== 'undefined' && Array.isArray(allTracks)) {
            const trackIndex = allTracks.findIndex(t => t.id === track.id);
            if (trackIndex !== -1) {
              allTracks[trackIndex].isInMyPlaylist = true;
            }
          }
          
          // Изменяем кнопку добавления
          if (buttonElement) {
            buttonElement.innerHTML = '<i class="fas fa-check"></i>';
            buttonElement.classList.add('in-playlist');
            buttonElement.title = 'Удалить из плейлиста';
          }
          
          // Показываем уведомление
          alert('Трек успешно добавлен в ваш плейлист');
          
          try {
            // Обновляем список треков пользователя
            if (typeof window.loadTracksFromFirebase === 'function') {
              window.loadTracksFromFirebase();
            } else {
              console.log("Обновляем треки через перезагрузку вкладки");
              // Перезагружаем вкладку плеера
              const tabButton = document.querySelector('.tab-button[data-tab="player-tab"]');
              if (tabButton) {
                tabButton.click();
              }
            }
          } catch (error) {
            console.error("Ошибка при обновлении списка треков:", error);
          }
        })
        .catch((error) => {
          console.error("Ошибка при добавлении трека:", error);
          alert('Произошла ошибка при добавлении трека');
        });
    }
  }).catch((error) => {
    console.error("Ошибка при проверке трека:", error);
    alert('Произошла ошибка при проверке трека');
  });
};

// Локальная функция для добавления трека в плейлист
function handleAddTrack(track, buttonElement) {
  // Используем глобальную функцию для добавления трека
  if (typeof window.addTrackToUserPlaylist === 'function') {
    window.addTrackToUserPlaylist(track, buttonElement);
  } else {
    console.error("Глобальная функция добавления трека недоступна");
    alert('Произошла ошибка при добавлении трека');
  }
}

// Обновляем стили для активного элемента в результатах поиска
const searchItemActiveStyles = document.createElement('style');
searchItemActiveStyles.textContent = `
  .search-result-item.active {
    background-color: rgba(29, 185, 84, 0.15);
    border-left: 3px solid #1db954;
  }
`;
document.head.appendChild(searchItemActiveStyles);

// Модифицируем функцию _instantLoadTrack, чтобы она обновляла активные элементы в результатах поиска
function _instantLoadTrack(track, currentTime, shouldPlay) {
  if (!track || !track.url) return false;
  
  try {
    // Обновляем интерфейс
    _updatePlayerInterface(track);
    
    // Устанавливаем URL трека
    audioPlayer.src = track.url;
    
    // Обновляем глобальный ID трека
    globalCurrentTrackId = track.id;
    
    // Обновляем активные элементы в плейлисте и результатах поиска
    updateActiveTrackUI(track.id);
    
    // Устанавливаем текущее время
    if (currentTime && !isNaN(currentTime)) {
      audioPlayer.currentTime = currentTime;
    } else {
      audioPlayer.currentTime = 0;
    }
    
    // Кешируем данные трека для быстрого доступа
    localStorage.setItem(`trackCache_${track.id}`, JSON.stringify(track));
    
    // Если нужно, сразу начинаем воспроизведение
    if (shouldPlay) {
      audioPlayer.play()
        .then(() => {
          isPlaying = true;
          updatePlayButton();
        })
        .catch(error => {
          console.error('Ошибка воспроизведения:', error);
          isPlaying = false;
          updatePlayButton();
        });
    } else {
      isPlaying = false;
      updatePlayButton();
    }
    
    return true;
  } catch (error) {
    console.error('Ошибка при загрузке трека:', error);
    return false;
  }
}

// Добавляем функцию обновления активных элементов UI для текущего трека
function updateActiveTrackUI(trackId) {
  if (!trackId) {
    // Если trackId не указан, просто сбрасываем все активные элементы и кнопки
    document.querySelectorAll('#track-list li, #extended-track-list li, .search-result-item').forEach(item => {
      item.classList.remove('active');
    });
    
    // Также сбрасываем все кнопки воспроизведения
    document.querySelectorAll('.search-play-button').forEach(btn => {
      btn.innerHTML = '<i class="fas fa-play"></i>';
      btn.classList.remove('playing');
    });
    
    return;
  }
  
  // Сначала сбрасываем все кнопки воспроизведения
  document.querySelectorAll('.search-play-button').forEach(btn => {
    btn.innerHTML = '<i class="fas fa-play"></i>';
    btn.classList.remove('playing');
  });
  
  console.log("Сброшены все кнопки воспроизведения при обновлении UI");
  
  // Сначала снимаем активные классы со всех элементов
  document.querySelectorAll('#track-list li, #extended-track-list li, .search-result-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Затем устанавливаем активный класс для элементов с нужным ID трека
  document.querySelectorAll(`#track-list li[data-id="${trackId}"], #extended-track-list li[data-id="${trackId}"]`).forEach(item => {
    item.classList.add('active');
  });
  
  // Устанавливаем активный класс для элемента в результатах поиска
  document.querySelectorAll(`.search-result-item[data-id="${trackId}"]`).forEach(item => {
    item.classList.add('active');
    
    // Устанавливаем иконку паузы только для активного трека если он играет
    if (isPlaying && !globalAudioPlayer.paused) {
      const playButton = item.querySelector('.search-play-button');
      if (playButton) {
        playButton.innerHTML = '<i class="fas fa-pause"></i>';
        playButton.classList.add('playing');
      }
    }
  });
}

// Обновим обработчик клика для элементов поиска, чтобы добавить воспроизведение по клику на весь элемент
function initializeSearchResultsClickHandlers() {
  console.log("Инициализация обработчиков событий для результатов поиска");
  
  // Устанавливаем обработчик окончания трека для глобального аудиоплеера
  if (globalAudioPlayer) {
    console.log("Восстанавливаем обработчик окончания трека");
    
    // Восстанавливаем стандартный обработчик onended для глобального аудиоплеера
    globalAudioPlayer.onended = () => {
      console.log("Трек завершен, проверяем необходимость перехода к следующему треку");
      
      // Проверяем, открыта ли вкладка поиска и активна ли она
      const searchTab = document.getElementById('search-tab');
      const isSearchTabActive = searchTab && searchTab.classList.contains('active');
      
      // Если вкладка поиска активна, позволяем обработчику в audioPlayer.addEventListener('ended')
      // обработать переход к следующему треку, не выполняя стандартный next-button.click()
      if (isSearchTabActive) {
        console.log("Вкладка поиска активна, пропускаем стандартный переход к следующему треку");
        // Обновляем иконки для UI синхронизации
        isPlaying = false;
        
        // Напрямую обновляем кнопку play-button в плеере
        const mainPlayButton = document.getElementById('play-button');
        if (mainPlayButton) {
          mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
        }
        
        // Напрямую обновляем индикатор в компактной кнопке музыки
        const musicButtonCompact = document.getElementById('music-button-compact');
        if (musicButtonCompact) {
          musicButtonCompact.classList.remove('playing');
          const indicator = musicButtonCompact.querySelector('.playing-indicator');
          if (indicator) {
            indicator.style.display = 'none';
          }
        }
        
        if (typeof updatePlayButton === 'function') {
          updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
        }
        
        // Теперь запустим "искусственное" событие ended для audioPlayer,
        // которое обработается основным обработчиком
        const endedEvent = new Event('ended');
        audioPlayer.dispatchEvent(endedEvent);
        
        return;
      }
      
      // Сначала обновляем иконки до старта следующего трека
      isPlaying = false;
      
      // Напрямую обновляем кнопку play-button в плеере
      const mainPlayButton = document.getElementById('play-button');
      if (mainPlayButton) {
        mainPlayButton.innerHTML = '<i class="fas fa-play"></i>';
      }
      
      // Напрямую обновляем индикатор в компактной кнопке музыки
      const musicButtonCompact = document.getElementById('music-button-compact');
      if (musicButtonCompact) {
        musicButtonCompact.classList.remove('playing');
        const indicator = musicButtonCompact.querySelector('.playing-indicator');
        if (indicator) {
          indicator.style.display = 'none';
        }
      }
      
      if (typeof updatePlayButton === 'function') {
        updatePlayButton(); // Обновит основную кнопку и вызовет updateActiveTrackUI
      }
      
      // Проверяем наличие флага автоматического перехода к следующему треку
      const userPrefs = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      const autoPlayNext = userPrefs.autoPlayNext !== false; // По умолчанию включено
      
      if (autoPlayNext) {
        // Сохраняем текущую громкость для нового трека
        const volumeSlider = document.getElementById('volume-slider');
        const targetVolume = volumeSlider ? volumeSlider.value / 100 : 1;
        
        // Имитируем нажатие на кнопку "Следующий трек" с небольшой задержкой
        // для плавного перехода между треками
        setTimeout(() => {
          const nextButton = document.getElementById('next-button');
          if (nextButton) {
            console.log("Автоматический переход к следующему треку через next-button");
            nextButton.click();
            
            // После автоматического нажатия на кнопку следующего трека
            // программно запускаем эффект fade-in для нового трека
            setTimeout(() => {
              if (globalAudioPlayer && !globalAudioPlayer.paused) {
                fadeIn(globalAudioPlayer, FADE_DURATION, targetVolume);
              }
            }, 100);
          }
        }, 200);
      }
    };
  }
  
  // Добавляем обработчики клика для элементов в результатах поиска
  document.querySelectorAll('#search-results-list .search-result-item').forEach(item => {
    // Проверяем, что элемент еще не имеет обработчика (чтобы избежать дублирования)
    if (!item.hasAttribute('data-has-click-handler')) {
      item.setAttribute('data-has-click-handler', 'true');
      
      // Добавляем обработчик клика для всего элемента
      item.addEventListener('click', (e) => {
        // Игнорируем клики на кнопках действий
        if (e.target.closest('.search-result-actions') || 
            e.target.closest('.search-play-button') ||
            e.target.closest('.search-like-button')) {
          return;
        }
        
        // Получаем ID трека из атрибута
        const trackId = item.dataset.id;
        if (!trackId) return;
        
        // Находим трек в общем массиве
        const track = allTracks.find(t => t.id === trackId);
        if (!track) return;
        
        // Находим кнопку воспроизведения для этого элемента
        const playButton = item.querySelector('.search-play-button');
        if (playButton) {
          // Вызываем функцию воспроизведения
          handlePlayTrack(track, playButton);
        }
      });
    }
  });
}