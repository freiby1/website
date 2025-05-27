import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js';
import { 
  getDatabase, 
  ref, 
  get, 
  set, 
  push, 
  onValue, 
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  serverTimestamp,
  query,
  orderByChild,
  update,
  off
} from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js';

// Глобальные переменные
let currentUser;
let selectedFriendId = null;
let friendsData = {};
let typingTimeout = null; // Таймер для статуса "печатает"
let isCurrentlyTyping = false; // Флаг текущего статуса печати
let newMessageListener = null; // Слушатель новых сообщений
let newMessageRef = null; // Ссылка на путь новых сообщений
let typingStatusListener = null; // Слушатель статуса "печатает"
let typingStatusRef = null; // Ссылка на путь статуса "печатает"
let typingUsers = {}; // Объект для хранения состояний "печатает" для каждого пользователя
let chatMessagesListener = null; // Слушатель сообщений в чате
let chatMessagesRef = null; // Ссылка на сообщения чата
let lastMessageListeners = {}; // Слушатели последних сообщений
let lastMessagesCount = 0; // Счетчик сообщений для отслеживания обновлений
let messagesPendingDisplay = new Set(); // Множество для отслеживания ID сообщений, ожидающих отображения
let isPageFullyInitialized = false; // Флаг для отслеживания полной инициализации страницы
let messagesPerPage = 25; // Количество сообщений на странице
let oldestMessageTimestamp = null; // Метка времени самого старого загруженного сообщения
let allMessagesLoaded = false; // Флаг, указывающий, что все сообщения загружены
let isLoadingMoreMessages = false; // Флаг для предотвращения повторных загрузок

// Глобальные переменные для хранения выбранных сообщений
let selectedMessages = new Map(); // Map для хранения выбранных сообщений (id -> messageObject)
let isSelectionMode = false; // Режим выбора сообщений

// Глобальные переменные для поиска сообщений
let searchMessagesActive = false;
let searchResults = [];
let currentSearchIndex = -1;

// Переменная для хранения текущей громкости видео
let videoVolume = localStorage.getItem('videoVolume') ? parseFloat(localStorage.getItem('videoVolume')) : 0.5;

// Инициализируем глобальный объект для доступа из других функций
window.typingUsers = typingUsers;

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

// Функция для установки сохраненной громкости на все видео
function applyVideoVolume() {
  // Получаем все видео на странице
  const videos = document.querySelectorAll('video');
  
  // Устанавливаем сохраненную громкость для каждого видео
  videos.forEach(video => {
    // Применяем громкость
    video.volume = videoVolume;
    
    // Если еще нет обработчика volumechange, добавляем его
    if (!video.hasAttribute('data-volume-handler')) {
      video.setAttribute('data-volume-handler', 'true');
      
      video.addEventListener('volumechange', () => {
        // Сохраняем новую громкость
        videoVolume = video.volume;
        localStorage.setItem('videoVolume', videoVolume);
        console.log('Громкость видео обновлена:', videoVolume);
        
        // Устанавливаем громкость для всех других видео
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach(v => {
          if (v !== video) {
            v.volume = videoVolume;
          }
        });
      });
    }
  });
}

export function initializeMessagingSystem() {
  // Инициализация Firebase
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  
  // Настраиваем периодическую проверку новых видео для применения громкости
  setInterval(applyVideoVolume, 2000);

  // Оптимизация для лучшей производительности
  const dbRef = ref(db);
  const messagesDbRef = ref(db, 'chats');
  
  // Увеличиваем кэш для уменьшения задержек
  dbRef.keepSynced && dbRef.keepSynced(true);
  messagesDbRef.keepSynced && messagesDbRef.keepSynced(true);
  
  // Добавляем CSS-стили для адаптивного отображения последних сообщений
  addLastMessageStyles();

  // Инициализация мобильного интерфейса
  initializeMobileInterface();
  
  // Инициализация функциональности выбора сообщений
  initializeMessageSelectionSystem();

  // Скрываем поле ввода при инициализации, когда чат не выбран
  document.getElementById('chat-input-container').style.display = 'none';

  // Получаем данные пользователя из localStorage, если есть
  const userDataString = localStorage.getItem('userData');
  let userData = null;
  if (userDataString) {
    try {
      userData = JSON.parse(userDataString);
      console.log('Данные пользователя из localStorage:', userData);
    } catch (e) {
      console.error('Ошибка при парсинге userData из localStorage:', e);
    }
  }

  // Проверка аутентификации
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('Пользователь аутентифицирован:', user.uid);
      currentUser = user;

      // Загружаем список друзей
      loadFriendsList(db, user.uid)
        .then(() => {
          // После загрузки списка друзей проверяем URL на наличие параметра chat
          const urlParams = new URLSearchParams(window.location.search);
          const chatWithUserId = urlParams.get('chat');
          
          if (chatWithUserId) {
            console.log('Обнаружен параметр chat в URL:', chatWithUserId);
            // Находим друга в списке по ID
            const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${chatWithUserId}"]`);
            
            if (friendElement) {
              console.log('Найден элемент друга, открываем чат с ним');
              // Имитируем клик по элементу друга
              friendElement.click();
            } else {
              console.log('Элемент друга не найден в списке, проверяем friendsData');
              // Если элемент не найден в DOM, проверяем глобальный объект friendsData
              if (friendsData[chatWithUserId]) {
                console.log('Найдены данные друга, загружаем чат');
                loadChat(chatWithUserId);
              } else {
                console.error('Не удалось найти данные пользователя для чата:', chatWithUserId);
              }
            }
          }
          isPageFullyInitialized = true; // Устанавливаем флаг после успешной загрузки и обработки
          console.log("isPageFullyInitialized set to true after loadFriendsList success and URL param handling.");
        })
        .catch(error => {
          console.error("Ошибка во время loadFriendsList или последующей обработки URL:", error);
          isPageFullyInitialized = true; // Устанавливаем флаг даже в случае ошибки, чтобы разрешить будущие перемещения
          console.log("isPageFullyInitialized set to true after loadFriendsList error.");
        });
      
      // Настраиваем слушателей сообщений сразу после аутентификации
      setupMessageListeners(db, user.uid);
      
      // После загрузки списка друзей настраиваем отслеживание статуса "печатает"
      setTimeout(() => {
        setupGlobalTypingListeners();
      }, 1000);
      
      // Принудительно обновляем индикаторы каждую секунду в течение первых 5 секунд
      const initialUpdateInterval = setInterval(() => {
        console.log('Принудительное обновление индикаторов при загрузке...');
        // Обновляем индикаторы для всех друзей
        Object.keys(friendsData).forEach(friendId => {
          updateUnreadCountForFriend(friendId);
        });
        updateNavUnreadIndicator();
      }, 1000);
      
      // Останавливаем принудительное обновление через 5 секунд
      setTimeout(() => {
        clearInterval(initialUpdateInterval);
      }, 5000);
      
      // Обновляем индикаторы при любом перемещении пользователя по странице
      window.addEventListener('mousemove', () => {
        updateNavUnreadIndicator();
      }, { passive: true });
      
      // Устанавливаем глобальный интервал обновления индикаторов каждые 10 секунд
      setInterval(() => {
        // Обновляем индикаторы для всех друзей
        Object.keys(friendsData).forEach(friendId => {
          updateUnreadCountForFriend(friendId);
        });
        updateNavUnreadIndicator();
      }, 10000);
    } else {
      console.error('Пользователь не аутентифицирован, перенаправление на страницу входа');
      // Перенаправление на страницу входа, если пользователь не аутентифицирован
      window.location.href = 'index.html';
    }
  });

  // Настройка обработчика отправки сообщений с улучшенной обратной связью
  document.getElementById('send-button').addEventListener('click', () => {
    sendMessageWithOptimisticUI(db);
    // Обновляем индикаторы после отправки сообщения
    setTimeout(() => {
      updateNavUnreadIndicator();
    }, 500);
  });

  // Отправка сообщения по нажатию Enter с оптимистичным UI
  document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      // Проверяем, есть ли прикрепленные изображения
      const imageAttachmentsContainer = document.getElementById('attachment-preview-container');
      const hasAttachments = imageAttachmentsContainer && imageAttachmentsContainer.classList.contains('active');
      
      // Если есть текст или прикрепленные изображения
      if (document.getElementById('message-input').value.trim() || hasAttachments) {
        // Если есть прикрепления, эмулируем клик по кнопке отправки
        if (hasAttachments) {
          document.getElementById('send-button').click();
        } else {
          // Если только текст, используем стандартную функцию
          sendMessageWithOptimisticUI(db);
        }
        
        // Обновляем индикаторы после отправки сообщения
        setTimeout(() => {
          updateNavUnreadIndicator();
        }, 500);
      }
    }
  });
  
  // Слушатель ввода текста для статуса "печатает" с более оперативным обновлением
  const messageInput = document.getElementById('message-input');
  messageInput.addEventListener('input', () => {
    // Если есть текст в поле ввода
    if (messageInput.value.trim() !== '' && !isCurrentlyTyping) {
      // Устанавливаем статус "печатает"
      updateTypingStatus(true);
    }
    
    // Сбрасываем предыдущий таймер
    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }
    
    // Устанавливаем новый таймер для сброса статуса "печатает" через 1 секунду (уменьшаем задержку)
    typingTimeout = setTimeout(() => {
      updateTypingStatus(false);
    }, 1000);
  });
  
  // Сбрасываем статус при отправке сообщения
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && messageInput.value.trim() !== '') {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
      updateTypingStatus(false);
    }
  });
  
  // Добавляем обработчик для обновления индикаторов при нажатии на любую кнопку в навигации
  document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', () => {
      console.log('Клик по кнопке навигации, обновляем индикаторы');
      updateNavUnreadIndicator();
    });
  });
  
  // Обновляем индикаторы при загрузке страницы
  window.addEventListener('load', () => {
    console.log('Страница загружена, обновляем индикаторы');
    setTimeout(() => {
      updateNavUnreadIndicator();
    }, 1000);
  });
  
  // Обновляем индикаторы при фокусе на окне
  window.addEventListener('focus', () => {
    console.log('Окно получило фокус, обновляем индикаторы');
    updateNavUnreadIndicator();
  });
  
  // Запускаем первоначальное обновление
  console.log('Запускаем первоначальное обновление индикаторов');
  setTimeout(() => {
    updateNavUnreadIndicator();
  }, 1000);

  // Инициализация функционала прикрепления медиафайлов
  initializeMediaAttachments();
  
  // Инициализация функционала поиска друзей
  initializeFriendsSearch();
  
  // Инициализируем функциональность поиска
  initializeSearchMessages();
}

// Функция для инициализации поиска друзей
function initializeFriendsSearch() {
  const searchInput = document.getElementById('friends-search');
  const clearButton = document.getElementById('clear-search');
  
  if (!searchInput || !clearButton) return;
  
  // Функция поиска друзей
  function searchFriends(query) {
    query = query.toLowerCase().trim();
    const friendItems = document.querySelectorAll('.friend-item-message');
    
    friendItems.forEach(item => {
      const friendName = item.querySelector('.friend-name')?.textContent?.toLowerCase() || '';
      const lastMessage = item.querySelector('.last-message')?.textContent?.toLowerCase() || '';
      
      // Проверяем совпадение по имени друга или тексту последнего сообщения
      if (friendName.includes(query) || lastMessage.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
    
    // Показываем сообщение, если ничего не найдено
    // Вместо поиска по стилю, проверяем каждый элемент
    let visibleCount = 0;
    document.querySelectorAll('.friend-item-message').forEach(item => {
      if (item.style.display !== 'none') {
        visibleCount++;
      }
    });
    
    // Всегда удаляем предыдущее сообщение "Ничего не найдено"
    const existingEmptyState = document.querySelector('.empty-search-state');
    if (existingEmptyState) {
      existingEmptyState.remove();
    }
    
    // Создаем новое сообщение, если ничего не найдено и есть поисковый запрос
    if (visibleCount === 0 && query !== '') {
      const friendsItemsContainer = document.getElementById('friends-items-container');
      const newEmptyState = document.createElement('div');
      newEmptyState.className = 'empty-search-state';
      newEmptyState.innerHTML = 'Ничего не найдено';
      newEmptyState.style.padding = '20px';
      newEmptyState.style.textAlign = 'center';
      newEmptyState.style.color = 'var(--text-muted)';
      newEmptyState.style.fontStyle = 'italic';
      newEmptyState.style.display = 'block';
      friendsItemsContainer.appendChild(newEmptyState);
    }
  }
  
  // Обработчик для поля поиска
  searchInput.addEventListener('input', function() {
    const query = this.value;
    
    // Показываем кнопку очистки, если есть запрос
    clearButton.style.display = query ? 'block' : 'none';
    
    searchFriends(query);
  });
  
  // Обработчик для кнопки очистки
  clearButton.addEventListener('click', function() {
    searchInput.value = '';
    clearButton.style.display = 'none';
    searchFriends('');
    searchInput.focus();
  });
  
  // Добавляем стили для пустого состояния
  const style = document.createElement('style');
  style.textContent = `
    .empty-search-state {
      padding: 20px;
      text-align: center;
      color: var(--text-muted) !important;
      font-style: italic;
      display: none;
    }
  `;
  document.head.appendChild(style);
}

// Функция для инициализации прикрепления медиафайлов
function initializeMediaAttachments() {
  const attachmentButton = document.getElementById('attachment-button');
  const attachmentInput = document.getElementById('attachment-input');
  const attachmentPreviewContainer = document.getElementById('attachment-preview-container');
  const attachmentPreview = document.getElementById('attachment-preview');
  const removeAllAttachmentsButton = document.getElementById('remove-all-attachments');
  const sendButton = document.getElementById('send-button');
  const messageInput = document.getElementById('message-input');
  
  // Массив для хранения выбранных файлов и их превью
  let selectedAttachments = [];
  
  // Переменные для Firebase Storage
  let firebaseStorage = null;
  let firebaseStorageRef = null;
  let firebaseUploadBytes = null;
  let firebaseGetDownloadURL = null;
  
  // Инициализация Firebase Storage
  async function initializeFirebaseStorage() {
    if (!firebaseStorage) {
      try {
        // Импортируем необходимые функции Firebase
        const { getStorage, ref: storageRef, uploadBytes, getDownloadURL } = await import(
          'https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js'
        );
        
        // Сохраняем ссылки на функции
        firebaseStorage = getStorage();
        firebaseStorageRef = storageRef;
        firebaseUploadBytes = uploadBytes;
        firebaseGetDownloadURL = getDownloadURL;
        
        return true;
      } catch (error) {
        console.error('Ошибка при инициализации Firebase Storage:', error);
        return false;
      }
    }
    return true;
  }
  
  // Функция для загрузки одного медиафайла в Firebase Storage
  async function uploadSingleMedia(attachment) {
    // Проверяем, инициализирован ли Firebase Storage
    const initialized = await initializeFirebaseStorage();
    if (!initialized) {
      console.error('Не удалось инициализировать Firebase Storage');
      return null;
    }
    
    // Помечаем файл как загружаемое
    attachment.isUploading = true;
    updateAttachmentPreview();
    
    try {
      // Создаем путь для файла в Storage
      const fileExtension = attachment.file.name.split('.').pop().toLowerCase();
      const isVideo = attachment.isVideo;
      
      // Выбираем подходящую папку в хранилище в зависимости от типа файла
      const folderName = isVideo ? 'message_videos' : 'message_images';
      const filePath = `${folderName}/${currentUser.uid}/${Date.now()}_${Math.floor(Math.random() * 1000)}.${fileExtension}`;
      const fileRef = firebaseStorageRef(firebaseStorage, filePath);
      
      // Загружаем файл
      await firebaseUploadBytes(fileRef, attachment.file);
      
      // Получаем URL загруженного файла
      const downloadURL = await firebaseGetDownloadURL(fileRef);
      
      // Обновляем статус и данные прикрепления
      attachment.isUploading = false;
      attachment.isUploaded = true;
      attachment.downloadURL = downloadURL;
      updateAttachmentPreview();
      
      console.log(`${isVideo ? 'Видео' : 'Изображение'} ${attachment.id} успешно загружено: ${downloadURL}`);
      return downloadURL;
    } catch (error) {
      console.error('Ошибка при загрузке медиафайла:', error);
      attachment.isUploading = false;
      attachment.uploadError = true;
      updateAttachmentPreview();
      return null;
    }
  }
  
  // Обработчик клика по кнопке прикрепления
  attachmentButton.addEventListener('click', () => {
    attachmentInput.click();
  });
  
  // Обновляем аттрибут accept для поддержки видео
  attachmentInput.setAttribute('accept', 'image/*, video/mp4, video/webm, video/ogg, video/mov');
  
  // Обработчик выбора файлов
  attachmentInput.addEventListener('change', handleAttachmentSelect);
  
  // Обработчик для удаления всех прикреплений
  removeAllAttachmentsButton.addEventListener('click', clearAllAttachments);
  
  // Функция обработки выбора файлов
  function handleAttachmentSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Проверяем количество уже выбранных файлов
    if (selectedAttachments.length + files.length > 10) {
      alert('Вы можете прикрепить максимум 10 медиафайлов к одному сообщению');
      return;
    }
    
    // Инициализируем Firebase Storage заранее
    initializeFirebaseStorage();
    
    // Обрабатываем каждый выбранный файл
    Array.from(files).forEach(file => {
      // Проверяем тип файла
      const isImage = file.type.match('image.*');
      const isVideo = file.type.match('video.*');
      
      if (!isImage && !isVideo) {
        alert('Пожалуйста, выберите только изображения или видео');
        return; // Это пропускает только текущий файл, а не прерывает обработку всех файлов
      }
      
      // Ограничение размера для видео (100 МБ)
      if (isVideo && file.size > 100 * 1024 * 1024) {
        alert('Размер видео не должен превышать 100 МБ');
        return;
      }
      
      // Создаем уникальный ID для файла
      const attachmentId = (isVideo ? 'video_' : 'img_') + Date.now() + '_' + Math.floor(Math.random() * 1000);
      
      // Создаем URL для предпросмотра
      const previewUrl = URL.createObjectURL(file);
      
      // Добавляем файл в массив
      const newAttachment = {
        id: attachmentId,
        file: file,
        previewUrl: previewUrl,
        isUploading: false,
        isUploaded: false,
        uploadError: false,
        downloadURL: null,
        isVideo: isVideo
      };
      
      selectedAttachments.push(newAttachment);
      
      // Начинаем загрузку медиафайла сразу после добавления
      setTimeout(() => {
        uploadSingleMedia(newAttachment);
      }, 100);
    });
    
    // Обновляем превью
    updateAttachmentPreview();
    
    // Сбрасываем input, чтобы можно было выбрать те же файлы снова
    event.target.value = '';
  }
  
  // Функция обновления превью прикреплений
  function updateAttachmentPreview() {
    if (selectedAttachments.length === 0) {
      attachmentPreviewContainer.classList.remove('active');
      return;
    }
    
    // Показываем контейнер
    attachmentPreviewContainer.classList.add('active');
    
    // Очищаем текущее превью
    attachmentPreview.innerHTML = '';
    
    // Добавляем каждый файл
    selectedAttachments.forEach((attachment, index) => {
      const attachmentItem = document.createElement('div');
      attachmentItem.className = 'attachment-item';
      attachmentItem.dataset.id = attachment.id;
      
      // Добавляем класс в зависимости от статуса
      if (attachment.isUploaded) {
        attachmentItem.classList.add('uploaded');
      } else if (attachment.uploadError) {
        attachmentItem.classList.add('error');
      } else if (attachment.isUploading) {
        attachmentItem.classList.add('uploading');
      }
      
      if (attachment.isVideo) {
        // Для видео используем video тег в превью
        attachmentItem.innerHTML = `
          <div class="video-container">
            <video src="${attachment.previewUrl}" preload="metadata"></video>
            <div class="video-overlay"></div>
          </div>
          <button class="remove-attachment" data-id="${attachment.id}">
            <i class="fas fa-times"></i>
          </button>
          ${attachment.isUploading ? `
            <div class="loading-overlay">
              <div class="loading-spinner"></div>
            </div>
          ` : ''}
          ${attachment.uploadError ? `
            <div class="upload-error-overlay">
              <i class="fas fa-exclamation-circle"></i>
            </div>
          ` : ''}
          ${attachment.isUploaded ? `
            <div class="upload-success-overlay">
              <i class="fas fa-check"></i>
            </div>
          ` : ''}
        `;
      } else {
        // Для изображений используем img тег
        attachmentItem.innerHTML = `
          <img src="${attachment.previewUrl}" alt="Прикрепленное изображение ${index + 1}">
          <button class="remove-attachment" data-id="${attachment.id}">
            <i class="fas fa-times"></i>
          </button>
          ${attachment.isUploading ? `
            <div class="loading-overlay">
              <div class="loading-spinner"></div>
            </div>
          ` : ''}
          ${attachment.uploadError ? `
            <div class="upload-error-overlay">
              <i class="fas fa-exclamation-circle"></i>
            </div>
          ` : ''}
          ${attachment.isUploaded ? `
            <div class="upload-success-overlay">
              <i class="fas fa-check"></i>
            </div>
          ` : ''}
        `;
      }
      
      attachmentPreview.appendChild(attachmentItem);
      
      // Добавляем обработчик для кнопки удаления
      const removeButton = attachmentItem.querySelector('.remove-attachment');
      removeButton.addEventListener('click', () => {
        removeAttachment(attachment.id);
      });
      
      // Добавляем обработчик для повторной загрузки при ошибке
      if (attachment.uploadError) {
        const errorOverlay = attachmentItem.querySelector('.upload-error-overlay');
        if (errorOverlay) {
          errorOverlay.addEventListener('click', () => {
            // Сбрасываем статус ошибки и пробуем загрузить снова
            attachment.uploadError = false;
            uploadSingleMedia(attachment);
          });
          
          // Меняем курсор, чтобы показать, что можно нажать
          errorOverlay.style.cursor = 'pointer';
        }
      }
      
      // Добавляем обработчик клика для видео для предварительного просмотра
      if (attachment.isVideo) {
        const videoOverlay = attachmentItem.querySelector('.video-overlay');
        if (videoOverlay) {
          videoOverlay.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Проверяем, загружено ли видео перед воспроизведением
            if (!attachment.isUploaded) {
              console.log('Видео еще не загружено');
              return;
            }
            
            const videoContainer = this.closest('.video-container');
            const video = attachmentItem.querySelector('video');
            if (video) {
              // Применяем сохраненное значение громкости
              video.volume = videoVolume;
              
              if (video.paused) {
                video.play();
                videoContainer.classList.add('video-playing');
              } else {
                video.pause();
                videoContainer.classList.remove('video-playing');
              }
              
              // Добавляем обработчик для сохранения громкости
              video.addEventListener('volumechange', () => {
                videoVolume = video.volume;
                localStorage.setItem('videoVolume', videoVolume);
                console.log('Громкость видео в превью сохранена:', videoVolume);
              });
              
              // Добавляем обработчик окончания видео
              video.addEventListener('ended', () => {
                videoContainer.classList.remove('video-playing');
                console.log('Видео закончилось, возвращаем иконку воспроизведения');
              });
            }
          });
        }
      }
    });
  }
  
  // Функция удаления отдельного прикрепления
  function removeAttachment(attachmentId) {
    // Находим индекс прикрепления
    const index = selectedAttachments.findIndex(attachment => attachment.id === attachmentId);
    if (index === -1) return;
    
    // Если это видео, находим и останавливаем его воспроизведение
    if (selectedAttachments[index].isVideo) {
      // Ищем DOM-элемент видео по ID прикрепления
      const attachmentItem = document.querySelector(`.attachment-item[data-id="${attachmentId}"]`);
      if (attachmentItem) {
        const video = attachmentItem.querySelector('video');
        if (video) {
          // Останавливаем воспроизведение
          video.pause();
          video.currentTime = 0;
          video.src = ""; // Очищаем источник для предотвращения утечек памяти
          video.load(); // Принудительно прерываем загрузку и воспроизведение
        }
      }
    }
    
    // Освобождаем ресурсы
    URL.revokeObjectURL(selectedAttachments[index].previewUrl);
    
    // Удаляем из массива
    selectedAttachments.splice(index, 1);
    
    // Обновляем превью
    updateAttachmentPreview();
  }
  
  // Функция удаления всех прикреплений
  function clearAllAttachments() {
    // Останавливаем воспроизведение всех видео и освобождаем ресурсы
    selectedAttachments.forEach(attachment => {
      // Если это видео, останавливаем его воспроизведение
      if (attachment.isVideo) {
        // Ищем DOM-элемент видео по ID прикрепления
        const attachmentItem = document.querySelector(`.attachment-item[data-id="${attachment.id}"]`);
        if (attachmentItem) {
          const video = attachmentItem.querySelector('video');
          if (video) {
            // Останавливаем воспроизведение
            video.pause();
            video.currentTime = 0;
            video.src = ""; // Очищаем источник для предотвращения утечек памяти
            video.load(); // Принудительно прерываем загрузку и воспроизведение
          }
        }
      }
      
      // Освобождаем ресурсы URL
      URL.revokeObjectURL(attachment.previewUrl);
    });
    
    // Очищаем массив
    selectedAttachments = [];
    
    // Обновляем превью
    updateAttachmentPreview();
  }
  
  // Сохраняем оригинальный обработчик клика по кнопке отправки
  const originalSendHandler = sendButton.onclick;
  
  // Заменяем обработчик клика по кнопке отправки
  sendButton.onclick = async function() {
    // Если есть прикрепления, обрабатываем их
    if (selectedAttachments.length > 0) {
      // Получаем ID активного чата
      const activeFriendId = selectedFriendId;
      if (!activeFriendId) return;
      
      // Получаем ID чата
      const chatId = getChatId(currentUser.uid, activeFriendId);
      
      // Получаем текст сообщения
      const text = messageInput.value.trim();
      
      // Отключаем кнопку отправки и показываем индикатор загрузки
      sendButton.disabled = true;
      sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      
      try {
        // Импортируем необходимые функции Firebase для работы с базой данных
        const { getDatabase, ref, push, serverTimestamp } = await import(
          'https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js'
        );
        
        // Получаем экземпляр базы данных
        const db = getDatabase();
        
        // Проверяем, все ли файлы уже загружены
        const notUploadedAttachments = selectedAttachments.filter(att => !att.isUploaded && !att.isUploading);
        
        // Если есть незагруженные файлы, загружаем их
        if (notUploadedAttachments.length > 0) {
          await Promise.all(notUploadedAttachments.map(att => uploadSingleMedia(att)));
        }
        
        // Ожидаем завершения загрузки всех файлов, которые в процессе загрузки
        const uploadingAttachments = selectedAttachments.filter(att => att.isUploading);
        if (uploadingAttachments.length > 0) {
          showStatusNotification('Ожидание завершения загрузки медиафайлов...');
          
          // Проверяем каждые 500 мс, загрузились ли все файлы
          let maxWaitTime = 60000; // 60 секунд максимум
          let waitInterval = 500; // 0.5 секунды между проверками
          
          while (selectedAttachments.some(att => att.isUploading) && maxWaitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitInterval));
            maxWaitTime -= waitInterval;
          }
        }
        
        // Разделяем изображения и видео
        const imageUrls = selectedAttachments
          .filter(att => att.isUploaded && !att.isVideo)
          .map(att => att.downloadURL);
          
        const videoUrls = selectedAttachments
          .filter(att => att.isUploaded && att.isVideo)
          .map(att => att.downloadURL);
        
        // Создаем одно сообщение со всеми типами медиа и текстом
        const messageData = {
          timestamp: serverTimestamp(),
          senderId: currentUser.uid,
          receiverId: activeFriendId,
          clientTimestamp: Date.now(),
          formattedDateTime: formatDateTimeForDB(new Date()),
          read: false
        };
        
        // Добавляем текст, если он есть
        if (text) {
          messageData.text = text;
        }
        
        // Добавляем изображения, если они есть
        if (imageUrls.length > 0) {
          messageData.imageUrls = imageUrls;
        }
        
        // Добавляем видео, если они есть
        if (videoUrls.length > 0) {
          messageData.videoUrls = videoUrls;
        }
        
        // Если есть активный ответ на сообщение, добавляем его
        if (typeof window.currentReplyTo !== 'undefined' && window.currentReplyTo && window.currentReplyTo.id) {
          messageData.replyTo = window.currentReplyTo;
        }
        
        // Отправляем одно сообщение со всеми данными
        await push(ref(db, `chats/${chatId}/messages`), messageData);
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Очищаем прикрепления
        clearAllAttachments();
        
        // Очищаем ответ на сообщение, если он был
        if (typeof window.currentReplyTo !== 'undefined' && window.currentReplyTo) {
          cancelReply();
        }
        
        // Обновляем статус "печатает"
        updateTypingStatus(false);
      } catch (error) {
        console.error('Ошибка при отправке сообщения с медиафайлами:', error);
        showErrorNotification('Не удалось отправить сообщение. Пожалуйста, попробуйте снова.');
      } finally {
        // Восстанавливаем кнопку отправки
        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
      }
    } else if (originalSendHandler) {
      // Если прикреплений нет, используем оригинальный обработчик
      originalSendHandler();
    }
  };
  
  // Инициализация модального окна для просмотра медиафайлов
  initializeImageViewer();
}

// Функция для инициализации просмотра изображений
function initializeImageViewer() {
  const imageModal = document.getElementById('image-modal');
  const modalImage = document.getElementById('modal-image');
  const closeModalButton = document.getElementById('close-image-modal');
  const prevImageButton = document.getElementById('prev-image');
  const nextImageButton = document.getElementById('next-image');
  const imageCounter = document.getElementById('image-counter');
  
  let currentImages = [];
  let currentImageIndex = 0;
  
  // Объект для хранения позиций воспроизведения видео
  let videoPositions = {};
  
  // Функция для открытия модального окна с изображением
  window.openImageModal = function(imageUrl, messageId, imageIndex = 0, event) {
    // Если передано событие, останавливаем его всплытие
    if (event) {
      event.stopPropagation();
    }
    
    // Проверяем аргументы
    console.log('openImageModal вызван с аргументами:', 
      {imageUrl: Array.isArray(imageUrl) ? `[${imageUrl.length} URLs]` : imageUrl, messageId, imageIndex});
    
    try {
      // Если передан массив URL, используем его
      if (Array.isArray(imageUrl)) {
        currentImages = [...imageUrl]; // Используем копию массива
      } else {
        // Иначе создаем массив с одним изображением
        currentImages = [imageUrl];
      }
      
      // Устанавливаем индекс текущего изображения
      currentImageIndex = Math.min(imageIndex, currentImages.length - 1);
      
      // Обновляем отображение
      updateModalImage();
      
      // Показываем модальное окно
      imageModal.classList.add('active');
      
      // Блокируем прокрутку страницы
      document.body.style.overflow = 'hidden';
    } catch (error) {
      console.error('Ошибка при открытии модального окна с изображением:', error);
    }
    
    // Возвращаем false для предотвращения всплытия события
    return false;
  };
  
  // Обертка для вызова из onclick в HTML
  window.handleImageClick = function(imageUrl, messageId, imageIndex, event) {
    // Если событие было передано, останавливаем всплытие
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    } else if (window.event) {
      window.event.cancelBubble = true;
      window.event.returnValue = false;
    }
    
    // Вызываем основную функцию с небольшой задержкой для лучшей работы событий
    setTimeout(() => {
      window.openImageModal(imageUrl, messageId, imageIndex);
    }, 10);
    
    // Предотвращаем дальнейшее всплытие события и действие по умолчанию
    return false;
  };
  
  // Функция для обновления медиафайла в модальном окне
  function updateModalImage() {
    if (!currentImages || currentImages.length === 0) {
      console.warn('Нет медиафайлов для отображения');
      return;
    }
    
    // Проверяем валидность индекса
    if (currentImageIndex < 0 || currentImageIndex >= currentImages.length) {
      console.warn('Некорректный индекс медиафайла:', currentImageIndex);
      currentImageIndex = 0;
    }
    
    const currentUrl = currentImages[currentImageIndex];
    // Определяем, является ли текущий файл видео
    const isVideo = currentUrl.includes('.mp4') || currentUrl.includes('.webm') || 
                  currentUrl.includes('.ogg') || currentUrl.includes('.mov') || 
                  currentUrl.includes('video');
    
    // Очищаем содержимое контейнера
    const modalContainer = document.querySelector('.modal-image-container');
    
    // Убираем предыдущий элемент
    if (modalContainer.querySelector('video')) {
      const existingVideo = modalContainer.querySelector('video');
      existingVideo.pause();
      existingVideo.remove();
    }
    
    if (isVideo) {
      // Скрываем изображение
      modalImage.style.display = 'none';
      
      // Создаем видеоплеер
      const videoElement = document.createElement('video');
      videoElement.className = 'modal-video';
      videoElement.src = currentUrl;
      videoElement.controls = true;
      videoElement.autoplay = true;
      videoElement.style.maxWidth = '100%';
      videoElement.style.maxHeight = '80vh';
      
      // Устанавливаем сохраненную громкость
      videoElement.volume = videoVolume;
      
      // Восстанавливаем сохраненную позицию видео, если она есть
      if (videoPositions[currentUrl]) {
        videoElement.currentTime = videoPositions[currentUrl];
        console.log(`Восстановлена позиция видео ${currentUrl}: ${videoPositions[currentUrl]} сек.`);
      }
      
      // Добавляем обработчик для сохранения громкости при изменении
      videoElement.addEventListener('volumechange', () => {
        videoVolume = videoElement.volume;
        localStorage.setItem('videoVolume', videoVolume);
        console.log('Громкость видео сохранена:', videoVolume);
      });
      
      // Добавляем обработчик для периодического сохранения позиции воспроизведения
      videoElement.addEventListener('timeupdate', () => {
        // Сохраняем текущую позицию видео каждые 2 секунды
        if (videoElement.currentTime % 2 < 0.5) {
          videoPositions[currentUrl] = videoElement.currentTime;
        }
      });
      
      // Добавляем обработчик окончания видео
      videoElement.addEventListener('ended', () => {
        console.log('Видео закончилось в модальном окне');
        // Сбрасываем позицию на начало
        videoPositions[currentUrl] = 0;
      });
      
      // Добавляем видеоплеер в контейнер
      modalContainer.appendChild(videoElement);
      
      // Добавляем обработчик для остановки видео и сохранения позиции при закрытии
      closeModalButton.addEventListener('click', () => {
        if (videoElement) {
          // Сохраняем текущую позицию перед остановкой
          videoPositions[currentUrl] = videoElement.currentTime;
          console.log(`Сохранена позиция видео ${currentUrl}: ${videoPositions[currentUrl]} сек.`);
          videoElement.pause();
        }
      });
    } else {
      // Показываем изображение
      modalImage.style.display = 'block';
      modalImage.style.opacity = '0.3';
      
      // Загружаем изображение
      const img = new Image();
      img.onload = function() {
        modalImage.src = currentUrl;
        modalImage.style.opacity = '1';
      };
      img.onerror = function() {
        console.error('Ошибка загрузки изображения:', currentUrl);
        modalImage.src = 'https://via.placeholder.com/400x300?text=Error+Loading+Image';
        modalImage.style.opacity = '1';
      };
      img.src = currentUrl;
    }
    
    // Обновляем навигационные кнопки
    if (currentImages.length > 1) {
      prevImageButton.style.display = currentImageIndex > 0 ? 'flex' : 'none';
      nextImageButton.style.display = currentImageIndex < currentImages.length - 1 ? 'flex' : 'none';
      
      // Обновляем счетчик
      imageCounter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
      imageCounter.style.display = 'block';
    } else {
      prevImageButton.style.display = 'none';
      nextImageButton.style.display = 'none';
      imageCounter.style.display = 'none';
    }
  }
  
  // Обработчик закрытия модального окна
  closeModalButton.addEventListener('click', () => {
    imageModal.classList.remove('active');
    document.body.style.overflow = '';
    // Сбрасываем масштаб перед закрытием
    modalImage.style.transform = 'scale(1)';
    modalImage.dataset.zoomed = 'false';
    
    // Останавливаем воспроизведение видео при закрытии и сохраняем позицию
    const videoElement = document.querySelector('.modal-video');
    if (videoElement && currentImages && currentImages[currentImageIndex]) {
      const currentUrl = currentImages[currentImageIndex];
      // Сохраняем текущую позицию воспроизведения
      videoPositions[currentUrl] = videoElement.currentTime;
      console.log(`Сохранена позиция видео (закрытие) ${currentUrl}: ${videoPositions[currentUrl]} сек.`);
      videoElement.pause();
    }
    
    // Не очищаем массив текущих изображений, чтобы сохранить URL для восстановления позиций
    // currentImages = [];
  });
  
  // Обработчик нажатия на изображение для масштабирования
  modalImage.addEventListener('click', (e) => {
    e.stopPropagation(); // Предотвращаем всплытие события
    
    const isZoomed = modalImage.dataset.zoomed === 'true';
    if (isZoomed) {
      // Сбрасываем масштаб
      modalImage.style.transform = 'scale(1)';
      modalImage.dataset.zoomed = 'false';
    } else {
      // Увеличиваем изображение
      modalImage.style.transform = 'scale(1.5)';
      modalImage.dataset.zoomed = 'true';
    }
  });
  
  // Обработчики навигации по изображениям
  prevImageButton.addEventListener('click', () => {
    if (currentImageIndex > 0) {
      // Сбрасываем масштаб перед сменой изображения
      modalImage.style.transform = 'scale(1)';
      modalImage.dataset.zoomed = 'false';
      
      // Добавляем анимацию перехода
      modalImage.style.opacity = '0';
      setTimeout(() => {
        currentImageIndex--;
        updateModalImage();
      }, 150);
    }
  });
  
  nextImageButton.addEventListener('click', () => {
    if (currentImageIndex < currentImages.length - 1) {
      // Сбрасываем масштаб перед сменой изображения
      modalImage.style.transform = 'scale(1)';
      modalImage.dataset.zoomed = 'false';
      
      // Добавляем анимацию перехода
      modalImage.style.opacity = '0';
      setTimeout(() => {
        currentImageIndex++;
        updateModalImage();
      }, 150);
    }
  });
  
  // Обработчик клавиатурной навигации
  document.addEventListener('keydown', (e) => {
    if (!imageModal.classList.contains('active')) return;
    
    if (e.key === 'Escape') {
      // Останавливаем воспроизведение видео при закрытии
      const videoElement = document.querySelector('.modal-video');
      if (videoElement) {
        // Сохраняем текущую позицию перед остановкой
        if (currentImages && currentImages[currentImageIndex]) {
          const currentUrl = currentImages[currentImageIndex];
          videoPositions[currentUrl] = videoElement.currentTime;
          console.log(`Сохранена позиция видео (Escape) ${currentUrl}: ${videoPositions[currentUrl]} сек.`);
        }
        videoElement.pause();
      }
      
      imageModal.classList.remove('active');
      document.body.style.overflow = '';
    } else if (e.key === 'ArrowLeft' && currentImageIndex > 0) {
      currentImageIndex--;
      updateModalImage();
    } else if (e.key === 'ArrowRight' && currentImageIndex < currentImages.length - 1) {
      currentImageIndex++;
      updateModalImage();
    }
  });
}

// Функция для инициализации мобильного интерфейса
function initializeMobileInterface() {
  // Проверяем, работаем ли на мобильном устройстве
  const isMobile = window.innerWidth <= 768;
  
  // Находим контейнер сообщений
  const messagesContainer = document.querySelector('.messages-container');
  
  // Находим кнопку "назад"
  const backButton = document.getElementById('back-to-friends');
  
  // Если в мобильном режиме, настраиваем обработчики
  if (isMobile && backButton) {
    // Обработчик для кнопки "назад"
    backButton.addEventListener('click', function() {
      // Убираем класс show-chat, чтобы вернуться к списку друзей
      messagesContainer.classList.remove('show-chat');
      
      // Убираем активный класс у всех элементов списка
      document.querySelectorAll('.friend-item-message').forEach(item => {
        item.classList.remove('active');
      });
      
      // Очищаем слушатели предыдущего чата перед сбросом selectedFriendId
      clearChatListeners();
      
      // Запускаем глобальные слушатели статуса "печатает", чтобы они работали в списке диалогов
      setupGlobalTypingListeners();
      
      // Сбрасываем выбранный чат
      selectedFriendId = null;
      
      // Скрываем содержимое чата и показываем заглушку
      document.getElementById('no-chat-selected').style.display = 'flex';
      document.getElementById('chat-content').style.display = 'none';
      document.getElementById('chat-input-container').style.display = 'none';
    });
    
    // Обновляем обработчик клика по другу, чтобы активировать мобильный режим
    document.addEventListener('click', function(e) {
      // Проверяем, был ли клик по элементу friend-item-message или его потомку
      const friendItem = e.target.closest('.friend-item-message');
      
      if (friendItem) {
        // Добавляем класс для показа чата
        messagesContainer.classList.add('show-chat');
      }
    });
  }
  
  // Обработчик изменения размера окна с троттлингом для улучшения производительности
  let resizeTimeout;
  window.addEventListener('resize', function() {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    
    resizeTimeout = setTimeout(function() {
      const newIsMobile = window.innerWidth <= 768;
      
      // Если изменился режим отображения (с мобильного на десктоп или наоборот)
      if (newIsMobile !== isMobile) {
        location.reload(); // Перезагружаем страницу для корректной инициализации
      }
    }, 250);
  });
}

// Оптимизированная загрузка списка друзей
async function loadFriendsList(db, userId) {
  return new Promise(async (resolve, reject) => {
    try {
      const friendsItemsContainer = document.getElementById('friends-items-container');
      friendsItemsContainer.innerHTML = '<div class="loading"><i class="fas fa-circle-notch fa-spin"></i><br>Загрузка списка друзей...</div>';

    // Попробуем получить numericId из localStorage для ускорения загрузки
    let currentUserNumericId = null;
    const userDataString = localStorage.getItem('userData');
    
    if (userDataString) {
      try {
        const userData = JSON.parse(userDataString);
        if (userData && userData.numericId) {
          currentUserNumericId = String(userData.numericId);
          console.log(`numericId из localStorage: ${currentUserNumericId}`);
        }
      } catch (e) {
        console.error('Ошибка при парсинге userData из localStorage:', e);
      }
    }
    
    // Если numericId не найден в localStorage, ищем в базе данных
    if (!currentUserNumericId) {
      console.log('numericId не найден в localStorage, ищем в базе данных');
      
      // Оптимизация: запрашиваем только данные текущего пользователя
      const currentUserRef = ref(db, `users/${userId}`);
      const userSnapshot = await get(currentUserRef);
      
      if (userSnapshot.exists()) {
        const userData = userSnapshot.val();
        if (userData && userData.numericId) {
          currentUserNumericId = String(userData.numericId);
          console.log(`numericId из базы данных: ${currentUserNumericId}`);
        }
      }
      
      // Если не нашли, попробуем поискать по всем пользователям
      if (!currentUserNumericId) {
        const usersRef = ref(db, `users`);
        const usersSnapshot = await get(usersRef);
      
      if (usersSnapshot.exists()) {
        const usersData = usersSnapshot.val();
        const currentUserData = Object.values(usersData).find(user => 
          user.firebaseId === userId || user.uid === userId || 
          (user.email && user.email.toLowerCase() === userId.toLowerCase())
        );
        
        if (currentUserData && currentUserData.numericId) {
          currentUserNumericId = String(currentUserData.numericId);
            console.log(`numericId из базы данных (полный поиск): ${currentUserNumericId}`);
          }
        }
      }
    }
    
    if (!currentUserNumericId) {
      console.error('Не удалось получить numericId текущего пользователя');
      friendsItemsContainer.innerHTML = '<div class="error">Ошибка загрузки данных пользователя</div>';
      return;
    }
    
    console.log(`Текущий пользователь numericId: ${currentUserNumericId}`);

    // Получаем друзей из таблицы friendships
    const friendshipsRef = ref(db, `friendships/${currentUserNumericId}`);
    console.log(`Запрос friendships по пути: friendships/${currentUserNumericId}`);
    const friendshipsSnapshot = await get(friendshipsRef);
    
    // Проверяем, что получили данные
    console.log('Получены данные friendships:', friendshipsSnapshot.exists() 
      ? Object.keys(friendshipsSnapshot.val()).length + ' записей' 
      : 'нет данных');
    
    let friendIds = []; // Для Firebase UID друзей

    if (friendshipsSnapshot.exists()) {
      const friendships = friendshipsSnapshot.val();
      // Фильтруем друзей и получаем их numericId
      const friendNumericIds = Object.entries(friendships)
        .filter(([_, data]) => data && data.status === 'friends')
        .map(([friendNumericId, _]) => friendNumericId);
      
      console.log('Найдены numericIds друзей:', friendNumericIds);
      
      // Получаем Firebase UID друзей по их numericId
      if (friendNumericIds.length > 0) {
        // Для оптимизации запрашиваем данные всех пользователей за один запрос
        const usersRef = ref(db, 'users');
        const usersSnapshot = await get(usersRef);
        
        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          
          // Создаем массив друзей и оптимизируем сортировку
          const friendsList = [];
          const friendsWithLastMessage = [];
          
          // Сначала добавляем всех друзей в локальный кэш
          for (const [firebaseUid, userData] of Object.entries(usersData)) {
            if (userData && userData.numericId && friendNumericIds.includes(String(userData.numericId))) {
              friendIds.push(firebaseUid);
              
              // Сохраняем данные друга в глобальную переменную для быстрого доступа
              friendsData[firebaseUid] = userData;
              
              // Создаем объект для сортировки
              friendsWithLastMessage.push({
                id: firebaseUid,
                numericId: userData.numericId,
                name: userData.name || userData.displayName || userData.email || 'Пользователь',
                photoURL: userData.photoURL || '',
                email: userData.email || '',
                lastMessageTime: 0, // Изначально 0, будет обновлено позже
                element: null // Элемент будет создан позже
              });
            }
          }
          
          // Запрашиваем последние сообщения для сортировки
          const lastMessagePromises = friendsWithLastMessage.map(async (friend) => {
            try {
              const chatId = getChatId(userId, friend.id);
              const messagesRef = ref(db, `chats/${chatId}/messages`);
              const messagesSnapshot = await get(messagesRef);
              
              if (messagesSnapshot.exists()) {
                const messages = messagesSnapshot.val();
                
                // Находим самое последнее сообщение
                let latestTimestamp = 0;
                
                Object.values(messages).forEach(message => {
                  const timestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
                  if (timestamp > latestTimestamp) {
                    latestTimestamp = timestamp;
                  }
                });
                
                // Обновляем время последнего сообщения
                friend.lastMessageTime = latestTimestamp;
              }
            } catch (error) {
              console.error(`Ошибка при получении последнего сообщения для ${friend.id}:`, error);
            }
          });
          
          // Ждем завершения всех запросов последних сообщений
          await Promise.all(lastMessagePromises);
          
          // Сортируем друзей по времени последнего сообщения (сначала новые)
          friendsWithLastMessage.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
          
          // Создаем элементы и добавляем их в список
          if (friendsWithLastMessage.length > 0) {
            // Очищаем контейнер
            friendsItemsContainer.innerHTML = '';
            
            // Создаем и добавляем элементы друзей
            friendsWithLastMessage.forEach(friend => {
              const friendElement = createFriendElement(friend);
              friendsItemsContainer.appendChild(friendElement);
              
              // Загружаем последнее сообщение
              loadLastMessage(friend.id);
            });
            
            // Обновляем индикаторы непрочитанных сообщений
            updateUnreadIndicator(selectedFriendId);
          } else {
            friendsItemsContainer.innerHTML = '<div class="empty-state">У вас пока нет друзей.<br>Добавьте друзей в своем профиле.</div>';
          }
        } else {
          friendsItemsContainer.innerHTML = '<div class="empty-state">Ошибка загрузки пользователей</div>';
        }
      } else {
        friendsItemsContainer.innerHTML = '<div class="empty-state">У вас пока нет друзей.<br>Добавьте друзей в своем профиле.</div>';
      }
    } else {
      friendsItemsContainer.innerHTML = '<div class="empty-state">У вас пока нет друзей.<br>Добавьте друзей в своем профиле.</div>';
    }
    
    console.log("Настраиваем слушатели для активных чатов после загрузки списка друзей");
    // Настраиваем слушатели для активных чатов
    setupActiveChatsListeners(userId);
    
  } catch (error) {
    console.error('Ошибка загрузки списка друзей:', error);
    document.getElementById('friends-list').innerHTML = '<div class="error">Ошибка загрузки друзей.<br>Пожалуйста, обновите страницу.</div>';
    reject(error);
  }
  resolve(); // Успешное завершение
  });
}

// Улучшенное создание элемента друга в списке с поддержкой адаптивного отображения текста
function createFriendElement(friend) {
  const friendElement = document.createElement('div');
  friendElement.className = 'friend-item-message';
  friendElement.dataset.friendId = friend.id;

  // Устанавливаем аватар (или заглушку, если нет фото)
  const avatarUrl = friend.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(friend.name || friend.email || 'User') + '&background=random';
  
  // Оптимизированная структура HTML с элементами для адаптивного отображения текста
  friendElement.innerHTML = `
    <img src="${avatarUrl}" alt="${friend.name || friend.email || 'User'}" class="friend-avatar" loading="lazy">
    <div class="friend-info">
      <div class="friend-name">
        <span title="${friend.name || friend.email || 'User'}">${friend.name || friend.email || 'User'}</span>
        <div class="muted-indicator" style="display: none;"><i class="fas fa-volume-mute"></i></div>
        <div class="time-status-container">
          <div class="message-status-wrapper" style="display: none;">
            <div class="message-status sent"></div>
          </div>
          <div class="last-message-time"></div>
        </div>
      </div>
      <div class="last-message" data-friend-id="${friend.id}">
        <span class="last-message-text">...</span>
        <div class="unread-indicator" style="display: none;">0</div>
      </div>
    </div>
  `;

  // Добавляем оптимизированный обработчик клика с делегированием
  friendElement.addEventListener('click', (event) => {
    // Проверяем, не является ли элемент уже активным
    if (friendElement.classList.contains('active')) {
      console.log('Этот друг уже выбран');
      
      // Если на мобильном устройстве, показываем чат при клике
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        const messagesContainer = document.querySelector('.messages-container');
        messagesContainer.classList.add('show-chat');
      }
      
      return; // Прерываем выполнение, если друг уже выбран
    }
    
    // Убираем активный класс у всех элементов списка
    document.querySelectorAll('.friend-item-message').forEach(item => {
      item.classList.remove('active');
    });
    
    // Делаем выбранный элемент активным
    friendElement.classList.add('active');
    
    // Если на мобильном устройстве, показываем чат
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const messagesContainer = document.querySelector('.messages-container');
      messagesContainer.classList.add('show-chat');
    }
    
    // Загружаем чат с выбранным другим
    loadChat(friend.id);
  });
  
  // Проверяем, отключены ли уведомления для этого друга
  checkNotificationsMuteStatus(friend.id).then(isMuted => {
    const mutedIndicator = friendElement.querySelector('.muted-indicator');
    if (mutedIndicator) {
      mutedIndicator.style.display = isMuted ? 'block' : 'none';
    }
  });
  
  return friendElement;
}

// Загрузка чата с выбранным другим
function loadChat(friendId) {
  // Проверяем, не выбран ли уже этот чат
  if (selectedFriendId === friendId) {
    console.log('Этот чат уже выбран');
    
    // Если на мобильном устройстве, показываем чат
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const messagesContainer = document.querySelector('.messages-container');
      messagesContainer.classList.add('show-chat');
    }
    
    return; // Прерываем выполнение, если чат уже выбран
  }
  
  // Сбрасываем поиск при смене диалога
  resetSearchOnChatChange();
  
  // Очищаем слушатели предыдущего чата
  clearChatListeners();
  
  // Запоминаем выбранного друга перед его изменением
  const previousFriendId = selectedFriendId;
  
  // Обновляем выбранного друга
  selectedFriendId = friendId;
  const friend = friendsData[friendId];
  
  if (!friend) {
    console.error('Друг не найден:', friendId);
    return;
  }
  
  // Сразу скрываем индикатор непрочитанных сообщений для текущего чата
  const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
  if (friendElement && friendElement.querySelector('.unread-indicator')) {
    friendElement.querySelector('.unread-indicator').style.display = 'none';
  }
  
  // Отметка сообщений как прочитанных происходит параллельно с загрузкой истории
  markMessagesAsRead(friendId);
  
  // Показываем содержимое чата и скрываем заглушку
  document.getElementById('no-chat-selected').style.display = 'none';
  document.getElementById('chat-content').style.display = 'flex';
  document.getElementById('chat-input-container').style.display = 'flex'; // Показываем поле ввода
  
  // Обновляем заголовок чата
  updateChatHeader(friend);
  
  // Очищаем контейнер сообщений и показываем индикатор загрузки
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.innerHTML = '<div class="loading"><i class="fas fa-circle-notch fa-spin"></i><br>Загрузка сообщений...</div>';
  
  // Загружаем историю сообщений
  loadMessages(friendId);
  
  // Если у нас был предыдущий чат, обновляем его индикатор непрочитанных сообщений
  if (previousFriendId) {
    console.log(`Обновляем индикатор непрочитанных для предыдущего чата ${previousFriendId}`);
    setTimeout(() => {
      updateUnreadCountForFriend(previousFriendId);
    }, 300);
  }
  
  // Обновляем индикаторы непрочитанных сообщений для всех чатов
  setTimeout(() => {
    Object.keys(friendsData).forEach(id => {
      if (id !== friendId) { // Пропускаем текущий чат
        updateUnreadCountForFriend(id);
      }
    });
    
    // Обновляем общий индикатор непрочитанных сообщений
    updateNavUnreadIndicator();
  }, 500);
  
  // Начинаем отслеживание статуса "печатает" для собеседника
  listenForTypingStatus(friendId);
  
  // Устанавливаем слушатель новых сообщений
  const db = getDatabase();
  setupNewMessageListener(db, currentUser.uid);
}

// Обновление заголовка чата (вынесено в отдельную функцию)
function updateChatHeader(friend) {
  const chatHeader = document.getElementById('chat-header');
  const avatarUrl = friend.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(friend.name || friend.email || 'User') + '&background=random';
  
  // Сохраняем кнопку назад, если она существует
  const backButton = chatHeader.querySelector('.back-button');
  const backButtonHTML = backButton ? backButton.outerHTML : '';
  
  // Проверяем статус уведомлений для этого чата
  const userId = currentUser.uid;
  const friendId = selectedFriendId; // Используем глобальную переменную selectedFriendId вместо friend.id
  checkNotificationsMuteStatus(friendId).then(isMuted => {
    // Используем numericId для ссылок на профиль
    const profileId = friend.numericId || '';
    
    chatHeader.innerHTML = `
      ${backButtonHTML}
      <a href="profile.html?id=${profileId}" class="header-avatar-link">
        <img src="${avatarUrl}" alt="${friend.name || friend.email || 'User'}" class="friend-avatar">
      </a>
      <div class="friend-info">
        <a href="profile.html?id=${profileId}" class="friend-name">${friend.name || friend.email || 'User'}</a>
        <div id="typing-indicator" class="typing-indicator" style="display: none;">печатает</div>
      </div>
      <div class="search-button" id="chat-search-button" title="Поиск сообщений">
        <i class="fas fa-search"></i>
      </div>
      <div class="notification-toggle" id="notification-toggle" title="${isMuted ? 'Включить уведомления' : 'Отключить уведомления'}">
        <i class="${isMuted ? 'fa-solid fa-bell-slash' : 'fas fa-bell'}"></i>
      </div>
    `;
    
    // Восстанавливаем событие клика для кнопки назад
    const newBackButton = chatHeader.querySelector('.back-button');
    if (newBackButton) {
      newBackButton.addEventListener('click', function() {
        const messagesContainer = document.querySelector('.messages-container');
        messagesContainer.classList.remove('show-chat');
        
        // Убираем активный класс у всех элементов списка
        document.querySelectorAll('.friend-item-message').forEach(item => {
          item.classList.remove('active');
        });
        
        // Очищаем слушатели предыдущего чата перед сбросом selectedFriendId
        clearChatListeners();
        
        // Запускаем глобальные слушатели статуса "печатает", чтобы они работали в списке диалогов
        setupGlobalTypingListeners();
        
        // Сбрасываем выбранный чат
        selectedFriendId = null;
        
        // Скрываем содержимое чата и показываем заглушку
        document.getElementById('no-chat-selected').style.display = 'flex';
        document.getElementById('chat-content').style.display = 'none';
        document.getElementById('chat-input-container').style.display = 'none';
      });
    }
    
    // Добавляем обработчик клика для кнопки уведомлений
    const notificationToggle = chatHeader.querySelector('#notification-toggle');
    if (notificationToggle) {
      notificationToggle.addEventListener('click', function() {
        toggleNotificationsMuteStatus(friendId);
      });
    }
    
    // Добавляем обработчик клика для кнопки поиска
    const searchButton = chatHeader.querySelector('#chat-search-button');
    if (searchButton) {
      searchButton.addEventListener('click', function() {
        toggleSearchMessages();
      });
    }
  });
}

// Функция для форматирования даты разделителя
function formatMessageDateDivider(timestamp) {
  const messageDate = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(today);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);
  
  // Сброс времени для корректного сравнения дат
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayDay = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
  const dayBeforeYesterdayDay = new Date(dayBeforeYesterday.getFullYear(), dayBeforeYesterday.getMonth(), dayBeforeYesterday.getDate());
  
  // Названия месяцев на русском
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ];
  
  if (messageDay.getTime() === todayDay.getTime()) {
    return 'Сегодня';
  } else if (messageDay.getTime() === yesterdayDay.getTime()) {
    return 'Вчера';
  } else if (messageDay.getTime() === dayBeforeYesterdayDay.getTime()) {
    return 'Позавчера';
  } else if (messageDate.getFullYear() === today.getFullYear()) {
    // В текущем году показываем только день и месяц
    return `${messageDate.getDate()} ${months[messageDate.getMonth()]}`;
  } else {
    // Для сообщений из прошлых лет показываем полную дату
    return `${messageDate.getDate()} ${months[messageDate.getMonth()]} ${messageDate.getFullYear()}`;
  }
}

// Улучшенная загрузка истории сообщений с проверкой приватности и пагинацией
function loadMessages(friendId) {
  const db = getDatabase();
  
  // Проверка корректности идентификаторов
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Ошибка: отсутствуют идентификаторы для загрузки сообщений');
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="error">Ошибка авторизации.<br>Пожалуйста, перезайдите.</div>';
    return;
  }
  
  const chatId = getChatId(currentUser.uid, friendId);
  
  // Проверяем валидность chatId
  if (!chatId) {
    console.error('Ошибка: невозможно сформировать идентификатор чата');
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '<div class="error">Ошибка загрузки чата.<br>Обновите страницу.</div>';
    return;
  }
  
  // Сбрасываем флаги пагинации при смене чата
  oldestMessageTimestamp = null;
  allMessagesLoaded = false;
  isLoadingMoreMessages = false;
  
  // Очищаем предыдущие слушатели, если они существуют
  if (chatMessagesRef && chatMessagesListener) {
    console.log('Очищаем предыдущий слушатель сообщений');
    try {
      off(chatMessagesRef, null, chatMessagesListener);
      chatMessagesListener = null;
      chatMessagesRef = null;
    } catch (error) {
      console.error('Ошибка при очистке слушателя сообщений:', error);
    }
  }
  
  // Обновляем ссылки с учетом приватности чата
  chatMessagesRef = ref(db, `chats/${chatId}/messages`);
  const messagesContainer = document.getElementById('chat-messages');
  
  // Добавляем плавающий индикатор даты, если его нет
  let floatingDateIndicator = messagesContainer.querySelector('.floating-date-indicator');
  if (!floatingDateIndicator) {
    floatingDateIndicator = document.createElement('div');
    floatingDateIndicator.className = 'floating-date-indicator';
    messagesContainer.appendChild(floatingDateIndicator);
  }
  
  // Временно отключаем плавную прокрутку для мгновенной загрузки
  messagesContainer.style.scrollBehavior = 'auto';
  
  // Показываем индикатор загрузки
  if (!messagesContainer.querySelector('.loading')) {
    messagesContainer.innerHTML = '<div class="loading"><i class="fas fa-circle-notch fa-spin"></i><br>Загрузка сообщений...</div>';
    
    // Повторно добавляем индикатор, так как innerHTML мог его удалить
    floatingDateIndicator = document.createElement('div');
    floatingDateIndicator.className = 'floating-date-indicator';
    messagesContainer.appendChild(floatingDateIndicator);
  }
  
  // Сначала получаем сообщения, чтобы найти последнее непрочитанное до того, как они будут отмечены как прочитанными
  get(chatMessagesRef).then((messagesSnapshot) => {
    // Сохраняем информацию о первом непрочитанном сообщении
    let firstUnreadMessageId = null;
    let hasUnreadMessages = false;
    
    if (messagesSnapshot.exists()) {
      const messages = messagesSnapshot.val();
      
      // Находим все сообщения от собеседника
      const sortedMessages = Object.entries(messages)
        .map(([key, message]) => ({
          id: key,
          ...message
        }))
        .filter(message => {
          // Для обратной совместимости проверяем наличие receiverId
          if (!message.receiverId) {
            // Если receiverId отсутствует, проверяем только senderId
            return message.senderId === friendId;
          }
          return message.senderId === friendId && message.receiverId === currentUser.uid;
        })
        .sort((a, b) => {
          const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
          const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
          return timestampA - timestampB;
        });
      
      // Ищем ПЕРВОЕ непрочитанное сообщение
      const unreadMessages = sortedMessages.filter(msg => msg.read === false);
      if (unreadMessages.length > 0) {
        firstUnreadMessageId = unreadMessages[0].id;
        hasUnreadMessages = true;
        console.log(`Найдено ${unreadMessages.length} непрочитанных сообщений`);
      }
    }
  
    // Верифицируем доступ к чату для этого пользователя
    const chatMetaRef = ref(db, `userChats/${currentUser.uid}/${chatId}`);
    get(chatMetaRef).then((metaSnapshot) => {
      // Добавим доступ, если чат ещё не существует
      if (!metaSnapshot.exists()) {
        // Создаем метаданные чата для текущего пользователя
        const chatMetadata = {
          withUser: friendId,
          timestamp: serverTimestamp(),
          clientTimestamp: Date.now(),
          lastMessage: 'Начните общение прямо сейчас'
        };
        
        // Добавляем чат в список пользователя
        set(chatMetaRef, chatMetadata)
          .catch(error => {
            console.error('Ошибка при создании метаданных чата:', error);
          });
      }
      
      // Запрашиваем только последние сообщения (для пагинации)
      get(chatMessagesRef).then((snapshot) => {
        try {
          messagesContainer.innerHTML = '';
          
          if (snapshot.exists()) {
            const messages = snapshot.val();
            
            // Сохраняем количество сообщений для отслеживания обновлений
            lastMessagesCount = Object.keys(messages).length;
            
            // Сортируем сообщения по времени с учетом как клиентского, так и серверного времени
            const sortedMessages = Object.entries(messages)
              .map(([key, message]) => ({
                id: key,
                ...message
              }))
              .filter(message => {
                // Фильтруем сообщения - только между этими двумя пользователями
                // Для обратной совместимости проверяем наличие receiverId
                if (!message.receiverId) {
                  // Если receiverId отсутствует, это старое сообщение или сообщение с изображениями
                  // Проверяем senderId
                  return message.senderId === currentUser.uid || message.senderId === friendId;
                }
                return (message.senderId === currentUser.uid && message.receiverId === friendId) || 
                       (message.senderId === friendId && message.receiverId === currentUser.uid);
              })
              .sort((a, b) => {
                // Используем clientTimestamp, если серверный timestamp еще не получен
                const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
                const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
                return timestampA - timestampB;
              });
            
            // Берем только последние messagesPerPage сообщений
            const messagesToShow = sortedMessages.length > messagesPerPage 
              ? sortedMessages.slice(sortedMessages.length - messagesPerPage) 
              : sortedMessages;
            
            // Если это не все сообщения, запоминаем timestamp самого старого из загруженных
            if (sortedMessages.length > messagesPerPage && messagesToShow.length > 0) {
              oldestMessageTimestamp = getTimestampValue(messagesToShow[0].timestamp) || messagesToShow[0].clientTimestamp;
            } else {
              // Если сообщений меньше, чем лимит на странице, значит все загружены
              allMessagesLoaded = true;
            }
            
            // Добавляем сообщения в контейнер с группировкой по датам
            let unreadDividerElement = null;
            let dividerAdded = false;
            let lastMessageDate = null; // Для отслеживания изменения даты
            
            messagesToShow.forEach(message => {
              try {
                // Пропускаем сообщения, которые уже оптимистично добавлены в UI
                if (!messagesPendingDisplay.has(message.id)) {
                  // Получаем время сообщения
                  const messageTimestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
                  const messageDate = new Date(messageTimestamp);
                  const messageDateString = messageDate.toDateString(); // Для сравнения дат без времени
                  
                  // Если дата изменилась или это первое сообщение, добавляем разделитель даты
                  if (!lastMessageDate || lastMessageDate !== messageDateString) {
                    // Создаем разделитель даты
                    const dateDivider = document.createElement('div');
                    dateDivider.className = 'date-divider';
                    
                    // Форматируем дату с учетом "сегодня", "вчера" и т.д.
                    const formattedDate = formatMessageDateDivider(messageTimestamp);
                    dateDivider.innerHTML = `<span>${formattedDate}</span>`;
                    
                    // Добавляем разделитель в контейнер
                    messagesContainer.appendChild(dateDivider);
                    
                    // Обновляем дату последнего сообщения
                    lastMessageDate = messageDateString;
                  }
                  
                  // Если это первое непрочитанное сообщение, добавляем разделитель ПЕРЕД ним
                  if (hasUnreadMessages && !dividerAdded && message.id === firstUnreadMessageId && message.senderId === friendId) {
                    // Проверяем, что сообщение действительно от собеседника (не от текущего пользователя)
                    // Только в этом случае сообщение может быть непрочитанным
                    const divider = document.createElement('div');
                    divider.className = 'unread-divider';
                    divider.id = 'unread-messages-divider';
                    divider.innerHTML = '<span>Новые сообщения</span>';
                    messagesContainer.appendChild(divider);
                    unreadDividerElement = divider;
                    dividerAdded = true;
                  }
                  
                  const messageElement = createMessageElement(message);
                  messagesContainer.appendChild(messageElement);
                }
              } catch (error) {
                console.error('Ошибка при создании элемента сообщения:', error, message);
              }
            });
            
            // Если нет сообщений после фильтрации
            if (messagesToShow.length === 0) {
              messagesContainer.innerHTML = '<div class="empty-chat">Нет сообщений.<br>Начните общение прямо сейчас!</div>';
              
              // Добавляем плавающий индикатор даты после очистки содержимого, но не делаем его видимым
              const floatingDateIndicator = document.createElement('div');
              floatingDateIndicator.className = 'floating-date-indicator';
              messagesContainer.appendChild(floatingDateIndicator);
              
              // Сразу скрываем индикатор для чата без сообщений
              floatingDateIndicator.classList.remove('visible');
            } else {
              // Прокручиваем к нужному месту в зависимости от наличия непрочитанных сообщений
              requestAnimationFrame(() => {
                if (hasUnreadMessages && unreadDividerElement) {
                  console.log('Прокручиваем к разделителю непрочитанных сообщений');
                  // Прокручиваем к разделителю с небольшим отступом сверху
                  const containerHeight = messagesContainer.clientHeight;
                  const dividerPosition = unreadDividerElement.offsetTop;
                  
                  // Прокручиваем так, чтобы разделитель был в верхней части контейнера с отступом 10% от высоты
                  const scrollPosition = Math.max(0, dividerPosition - containerHeight * 0.1);
                  messagesContainer.scrollTop = scrollPosition;
                  
                  // Убираем анимацию увеличения, используем только подсветку без изменения размера
                  setTimeout(() => {
                    // Проверяем, что элемент все еще существует
                    if (unreadDividerElement && unreadDividerElement.parentNode) {
                      // Подсвечиваем только цветом без изменения размера
                      unreadDividerElement.style.borderColor = 'var(--primary-color)';
                      unreadDividerElement.style.opacity = '1';
                      
                      // Возвращаем обычные стили через 2 секунды
                      setTimeout(() => {
                        if (unreadDividerElement && unreadDividerElement.parentNode) {
                          unreadDividerElement.style.borderColor = '';
                          unreadDividerElement.style.opacity = '';
                        }
                      }, 2000);
                    }
                  }, 50);
                } else {
                  console.log('Прокручиваем в самый конец, так как нет непрочитанных сообщений');
                  // Если непрочитанных сообщений нет, прокручиваем в самый конец
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
                
                // Возвращаем плавную прокрутку после загрузки
                setTimeout(() => {
                  messagesContainer.style.scrollBehavior = 'smooth';
                }, 100);
              });
              
              // Добавляем слушатель события прокрутки для подгрузки старых сообщений
              setupScrollListener();
            }
          } else {
            messagesContainer.innerHTML = '<div class="empty-chat">Нет сообщений.<br>Начните общение прямо сейчас!</div>';
            
            // Добавляем плавающий индикатор даты после очистки содержимого, но не делаем его видимым
            const floatingDateIndicator = document.createElement('div');
            floatingDateIndicator.className = 'floating-date-indicator';
            messagesContainer.appendChild(floatingDateIndicator);
            
            // Сразу скрываем индикатор для чата без сообщений
            floatingDateIndicator.classList.remove('visible');
          }
        } catch (error) {
          console.error('Ошибка при обработке сообщений:', error);
          // В случае ошибки показываем сообщение пользователю
          messagesContainer.innerHTML = '<div class="error">Ошибка при загрузке сообщений.<br>Попробуйте обновить страницу.</div>';
        }
          
        // Теперь устанавливаем слушатель для обновлений в реальном времени
        setupRealTimeMessagesListener(chatId, friendId);
        
      }).catch((error) => {
        console.error('Ошибка при получении истории сообщений:', error);
        messagesContainer.innerHTML = '<div class="error">Ошибка при загрузке сообщений.<br>Попробуйте обновить страницу.</div>';
        
        // Пробуем установить слушатель реального времени даже при ошибке
        setupRealTimeMessagesListener(chatId, friendId);
      });
    
      // Настраиваем слушатель для обновления статусов прочтения в реальном времени
      setupReadStatusListener(chatId, friendId);
    }).catch((error) => {
      console.error('Ошибка при проверке доступа к чату:', error);
      messagesContainer.innerHTML = '<div class="error">Ошибка доступа к чату.<br>Проверьте подключение и попробуйте снова.</div>';
    });
    
    // Отмечаем сообщения как прочитанные после того, как нашли последнее непрочитанное
    markMessagesAsRead(friendId);
    
  }).catch((error) => {
    console.error('Ошибка при проверке непрочитанных сообщений:', error);
    // Продолжаем загрузку даже при ошибке
    markMessagesAsRead(friendId);
    loadChat(friendId);
  });
  
  // После загрузки сообщений настраиваем обработчик прокрутки для индикатора даты
  setupScrollDateIndicator(messagesContainer);
}

// Функция для настройки плавающего индикатора даты при прокрутке
function setupScrollDateIndicator(messagesContainer) {
  if (!messagesContainer) return;
  
  // Создаем или получаем существующий индикатор
  let floatingDateIndicator = messagesContainer.querySelector('.floating-date-indicator');
  if (!floatingDateIndicator) {
    floatingDateIndicator = document.createElement('div');
    floatingDateIndicator.className = 'floating-date-indicator';
    messagesContainer.appendChild(floatingDateIndicator);
  }
  
  // Переменные для контроля таймаута скрытия индикатора
  let hideTimeout;
  let isScrolling = false;
  let lastDisplayedDate = null; // Последняя отображенная дата
  
  // Функция для обновления индикатора даты
  const updateDateIndicator = () => {
    // Проверяем, есть ли сообщения в чате
    const messages = messagesContainer.querySelectorAll('.message');
    
    // Если сообщений нет, или есть сообщение только с текстом "Нет сообщений" - скрываем индикатор и выходим
    if (messages.length === 0 || messagesContainer.querySelector('.empty-chat')) {
      floatingDateIndicator.classList.remove('visible');
      return;
    }
    
    // Всегда показываем индикатор при скролле, если есть сообщения
    floatingDateIndicator.classList.add('visible');
    
    // Находим все видимые сообщения
    const containerRect = messagesContainer.getBoundingClientRect();
    const visibleMessages = [];
    
    // Получаем все разделители даты и создаем структуру данных для привязки дат
    const dateDividers = Array.from(messagesContainer.querySelectorAll('.date-divider'));
    const dateMap = new Map(); // Карта для хранения соответствия дат и их текстового представления
    
    // Создаем массив пар [датаРазделителя, текстДаты]
    // Пройдем по всем разделителям и сохраним их позиции и тексты
    const dividerPositions = dateDividers.map(divider => {
      const dividerRect = divider.getBoundingClientRect();
      const dateText = divider.querySelector('span')?.textContent || '';
      return {
        position: dividerRect.top,
        text: dateText
      };
    });
    
    // Сортируем по позиции - от верха к низу
    dividerPositions.sort((a, b) => a.position - b.position);
    
    // Проходим по всем сообщениям для поиска видимых
    messages.forEach(message => {
      const messageRect = message.getBoundingClientRect();
      
      // Проверяем, видимо ли сообщение
      const isVisible = (
        messageRect.top < containerRect.bottom &&
        messageRect.bottom > containerRect.top
      );
      
      if (isVisible && message.dataset.timestamp) {
        const timestamp = parseInt(message.dataset.timestamp);
        if (!isNaN(timestamp)) {
          visibleMessages.push({
            element: message,
            timestamp: timestamp,
            rect: messageRect,
            position: messageRect.top
          });
        }
      }
    });
    
    // Если есть видимые сообщения
    if (visibleMessages.length > 0) {
      // Сортируем видимые сообщения по близости к верхней границе контейнера
      visibleMessages.sort((a, b) => {
        return Math.abs(a.rect.top - containerRect.top) - Math.abs(b.rect.top - containerRect.top);
      });
      
      // Берем самое верхнее видимое сообщение
      const topMessage = visibleMessages[0];
      const messagePosition = topMessage.position;
      
      // Находим ближайший разделитель ВЫШЕ этого сообщения
      let closestDivider = null;
      let closestDistance = Infinity;
      
      for (const divider of dividerPositions) {
        // Если разделитель выше сообщения
        if (divider.position <= messagePosition) {
          const distance = messagePosition - divider.position;
          if (distance < closestDistance) {
            closestDistance = distance;
            closestDivider = divider;
          }
        }
      }
      
      // Определяем текст даты для отображения
      let dateText;
      
      if (closestDivider) {
        // Используем текст из ближайшего разделителя выше текущего сообщения
        dateText = closestDivider.text;
      } else {
        // Если не нашли разделитель выше, берем самый верхний разделитель
        // или генерируем дату из timestamp сообщения
        if (dividerPositions.length > 0) {
          dateText = dividerPositions[0].text;
        } else {
          dateText = formatMessageDateDivider(topMessage.timestamp);
        }
      }
      
      // Обновляем индикатор, если дата изменилась
      if (lastDisplayedDate !== dateText) {
        // Обновляем текст индикатора
        floatingDateIndicator.textContent = dateText;
        lastDisplayedDate = dateText;
        
        // Добавляем визуальный эффект обновления
        floatingDateIndicator.classList.remove('update-animation');
        setTimeout(() => {
          floatingDateIndicator.classList.add('update-animation');
        }, 10);
      }
    } else {
      // Если нет видимых сообщений, прячем индикатор
      floatingDateIndicator.classList.remove('visible');
    }
  };
  
  // Функция для скрытия индикатора с задержкой
  const hideIndicator = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    
    hideTimeout = setTimeout(() => {
      if (!isScrolling) {
        floatingDateIndicator.classList.remove('visible');
      }
    }, 1000); // Уменьшаем задержку до 1 секунды
  };
  
  // Обработчик события прокрутки
  const handleScroll = () => {
    isScrolling = true;
    
    // Запускаем обновление индикатора
    updateDateIndicator();
    
    // Сбрасываем таймер скрытия
    if (hideTimeout) clearTimeout(hideTimeout);
    
    // Устанавливаем флаг, что прокрутка завершена, и запускаем таймер скрытия
    isScrolling = false;
    hideIndicator();
  };
  
  // Оптимизированный обработчик прокрутки с троттлингом
  let scrollTimeout;
  const scrollHandler = () => {
    if (scrollTimeout) return;
    
    scrollTimeout = setTimeout(() => {
      handleScroll();
      scrollTimeout = null;
    }, 30); // Уменьшаем задержку для более быстрой реакции
  };
  
  // Удаляем предыдущий обработчик, если он есть
  messagesContainer.removeEventListener('scroll', scrollHandler);
  
  // Добавляем обработчик события прокрутки
  messagesContainer.addEventListener('scroll', scrollHandler, { passive: true });
  
  // Инициализируем индикатор при загрузке, с небольшой задержкой
  setTimeout(updateDateIndicator, 300);
}

// Функция для настройки обработчика события прокрутки
function setupScrollListener() {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  
  // Удаляем предыдущий слушатель, если есть
  messagesContainer.removeEventListener('scroll', handleMessagesScroll);
  
  // Добавляем новый слушатель
  messagesContainer.addEventListener('scroll', handleMessagesScroll, { passive: true });
  
  // Настраиваем плавающий индикатор даты
  setupScrollDateIndicator(messagesContainer);
}

// Обработчик события прокрутки
function handleMessagesScroll(event) {
  // Если не выбран чат, выходим
  if (!selectedFriendId) return;
  
  // Если все сообщения уже загружены, выходим
  if (allMessagesLoaded) return;
  
  // Если уже идет загрузка сообщений, выходим чтобы избежать дублирования
  if (isLoadingMoreMessages) return;
  
  const messagesContainer = event.target;
  
  // Если пользователь прокрутил почти до верха контейнера (30px от верха),
  // загружаем предыдущую порцию сообщений
  if (messagesContainer.scrollTop < 30) {
    loadOlderMessages();
  }
}

// Функция для загрузки более старых сообщений
function loadOlderMessages() {
  if (!selectedFriendId || !oldestMessageTimestamp || allMessagesLoaded) return;
  
  // Устанавливаем флаг, чтобы предотвратить повторную загрузку
  isLoadingMoreMessages = true;
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, selectedFriendId);
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  // Показываем индикатор загрузки
  const messagesContainer = document.getElementById('chat-messages');
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading-older-messages';
  loadingElement.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Загрузка сообщений...';
  
  // Добавляем индикатор загрузки в начало списка
  if (messagesContainer.firstChild) {
    messagesContainer.insertBefore(loadingElement, messagesContainer.firstChild);
  } else {
    messagesContainer.appendChild(loadingElement);
  }
  
  // Запрашиваем данные сообщений
  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      
      // Преобразуем сообщения в массив объектов
      const messagesArray = Object.entries(messages)
        .map(([key, message]) => ({
          id: key,
          ...message
        }))
        .filter(message => 
          (message.senderId === currentUser.uid && message.receiverId === selectedFriendId) || 
          (message.senderId === selectedFriendId && message.receiverId === currentUser.uid)
        )
        .sort((a, b) => {
          const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
          const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
          return timestampA - timestampB;
        });
      
      // Находим сообщения, которые старше самого старого загруженного сообщения
      const olderMessages = messagesArray.filter(message => {
        const messageTimestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
        return messageTimestamp < oldestMessageTimestamp;
      });
      
      // Сохраняем текущую высоту прокрутки
      const scrollHeight = messagesContainer.scrollHeight;
      
      // Удаляем индикатор загрузки
      const loadingOlderElement = messagesContainer.querySelector('.loading-older-messages');
      if (loadingOlderElement) {
        loadingOlderElement.remove();
      }
      
      // Если нет более старых сообщений
      if (olderMessages.length === 0) {
        allMessagesLoaded = true;
        const allLoadedElement = document.createElement('div');
        allLoadedElement.className = 'all-messages-loaded';
        allLoadedElement.textContent = 'Начало чата';
        
        if (messagesContainer.firstChild) {
          messagesContainer.insertBefore(allLoadedElement, messagesContainer.firstChild);
        } else {
          messagesContainer.appendChild(allLoadedElement);
        }
        
        isLoadingMoreMessages = false;
        return;
      }
      
      // Получаем последние N сообщений из старых
      const messagesToAdd = olderMessages.length > messagesPerPage 
        ? olderMessages.slice(olderMessages.length - messagesPerPage) 
        : olderMessages;
      
      // Обновляем timestamp самого старого сообщения
      if (messagesToAdd.length > 0) {
        oldestMessageTimestamp = getTimestampValue(messagesToAdd[0].timestamp) || messagesToAdd[0].clientTimestamp || 0;
      }
      
      if (messagesToAdd.length === olderMessages.length) {
        allMessagesLoaded = true;
      }
      
      let firstElementInserted = false;
      let firstElement = null;
      
      // Получаем все существующие сообщения для правильного определения дат
      const existingMessages = Array.from(messagesContainer.querySelectorAll('.message'))
        .map(element => ({
          timestamp: parseInt(element.dataset.timestamp),
          element: element
        }))
        .filter(msg => !isNaN(msg.timestamp))
        .sort((a, b) => a.timestamp - b.timestamp);
      
      // Объединяем новые и существующие сообщения для правильного определения дат
      const allMessages = [
        ...messagesToAdd.map(msg => ({
          timestamp: getTimestampValue(msg.timestamp) || msg.clientTimestamp || 0,
          message: msg
        })),
        ...existingMessages
      ].sort((a, b) => a.timestamp - b.timestamp);
      
      // Удаляем все существующие разделители дат
      messagesContainer.querySelectorAll('.date-divider').forEach(divider => divider.remove());
      
      // Добавляем новые сообщения и разделители
      let lastDate = null;
      
      // Сначала добавляем новые сообщения
      messagesToAdd.slice().reverse().forEach(message => {
        if (!messagesPendingDisplay.has(message.id)) {
          const messageTimestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
          const messageElement = createMessageElement(message);
          
          if (messagesContainer.firstChild) {
            messagesContainer.insertBefore(messageElement, messagesContainer.firstChild);
          } else {
            messagesContainer.appendChild(messageElement);
          }
          
          if (!firstElementInserted) {
            firstElement = messageElement;
            firstElementInserted = true;
          }
        }
      });
      
      // Теперь добавляем разделители дат для всех сообщений
      allMessages.forEach((item, index) => {
        const messageDate = new Date(item.timestamp);
        const messageDateString = messageDate.toDateString();
        
        if (lastDate !== messageDateString) {
          const dateDivider = document.createElement('div');
          dateDivider.className = 'date-divider';
          dateDivider.innerHTML = `<span>${formatMessageDateDivider(item.timestamp)}</span>`;
          
          // Находим сообщение, перед которым нужно вставить разделитель
          const targetMessage = item.message ? 
            messagesContainer.querySelector(`[data-message-id="${item.message.id}"]`) :
            item.element;
          
          if (targetMessage) {
            messagesContainer.insertBefore(dateDivider, targetMessage);
          }
          
          lastDate = messageDateString;
        }
      });
      
      // Если загружены все сообщения, добавляем индикатор начала чата
      if (allMessagesLoaded) {
        const allLoadedElement = document.createElement('div');
        allLoadedElement.className = 'all-messages-loaded';
        allLoadedElement.textContent = 'Начало чата';
        
        if (messagesContainer.firstChild) {
          messagesContainer.insertBefore(allLoadedElement, messagesContainer.firstChild);
        } else {
          messagesContainer.appendChild(allLoadedElement);
        }
      }
      
      // Восстанавливаем позицию прокрутки
      if (firstElement) {
        const targetScrollPosition = firstElement.offsetTop;
        messagesContainer.scrollTop = targetScrollPosition;
      } else {
        messagesContainer.scrollTop = messagesContainer.scrollHeight - scrollHeight;
      }
    }
    
    isLoadingMoreMessages = false;
  }).catch(error => {
    console.error('Ошибка при загрузке старых сообщений:', error);
    
    const loadingOlderElement = messagesContainer.querySelector('.loading-older-messages');
    if (loadingOlderElement) {
      loadingOlderElement.remove();
    }
    
    const errorElement = document.createElement('div');
    errorElement.className = 'error';
    errorElement.textContent = 'Не удалось загрузить старые сообщения';
    
    if (messagesContainer.firstChild) {
      messagesContainer.insertBefore(errorElement, messagesContainer.firstChild);
    } else {
      messagesContainer.appendChild(errorElement);
    }
    
    isLoadingMoreMessages = false;
  });
  
  // Обновляем индикатор даты
  setupScrollDateIndicator(messagesContainer);
}

// Вынесенная функция для настройки слушателя обновлений в реальном времени с учетом приватности
function setupRealTimeMessagesListener(chatId, friendId) {
  const db = getDatabase();
  chatMessagesRef = ref(db, `chats/${chatId}/messages`);
  const messagesContainer = document.getElementById('chat-messages');
  
  // Также настраиваем индикатор даты при прокрутке
  setupScrollDateIndicator(messagesContainer);
  
  // Используем onChildAdded для более эффективного отслеживания новых сообщений
  chatMessagesListener = onChildAdded(chatMessagesRef, (snapshot) => {
    try {
      const message = snapshot.val();
      message.id = snapshot.key;
      
      // Проверяем, предназначено ли сообщение для текущего чата (проверка на приватность)
      if (!((message.senderId === currentUser.uid && message.receiverId === friendId) || 
           (message.senderId === friendId && message.receiverId === currentUser.uid))) {
        return; // Не отображаем сообщения, которые не относятся к этому чату
      }
      
      // Пропускаем сообщения, которые уже отображены или ждут отображения
      if (messagesPendingDisplay.has(message.id)) {
        // Удаляем из списка ожидающих, так как теперь получили подтверждение от сервера
        messagesPendingDisplay.delete(message.id);
        return;
      }
      
      // Получаем timestamp сообщения
      const messageTimestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
      
      // Если это сообщение старше самого старого загруженного, 
      // не отображаем его (оно будет загружено при пагинации)
      if (oldestMessageTimestamp && messageTimestamp < oldestMessageTimestamp) {
        console.log('Сообщение старше загруженных, будет доступно при прокрутке вверх:', message.id);
        return;
      }
      
      // Ищем, не отображается ли уже это сообщение
      const existingElement = document.querySelector(`.message[data-message-id="${message.id}"]`);
      if (existingElement) {
        return; // Сообщение уже есть в DOM
      }
      
      // Удаляем сообщение "Нет сообщений" если оно есть
      const emptyChat = messagesContainer.querySelector('.empty-chat');
      if (emptyChat) {
        emptyChat.remove();
      }

      // Проверяем необходимость добавления разделителя даты
      const messageDate = new Date(messageTimestamp);
      const messageDateString = messageDate.toDateString();
      
      // Ищем последний элемент сообщения и его дату
      let lastMessageElement = null;
      const allMessages = messagesContainer.querySelectorAll('.message');
      if (allMessages.length > 0) {
        lastMessageElement = allMessages[allMessages.length - 1];
      }
      
      let needDateDivider = true;
      if (lastMessageElement) {
        // Получаем дату последнего сообщения
        const lastMessageId = lastMessageElement.dataset.messageId;
        if (lastMessageId) {
          // Ищем существующее сообщение в DOM
          const lastMessageTimestampAttr = lastMessageElement.dataset.timestamp;
          if (lastMessageTimestampAttr) {
            const lastMessageTimestamp = parseInt(lastMessageTimestampAttr);
            const lastMessageDate = new Date(lastMessageTimestamp);
            const lastMessageDateString = lastMessageDate.toDateString();
            
            // Если даты совпадают, разделитель не нужен
            if (lastMessageDateString === messageDateString) {
              needDateDivider = false;
            }
          }
        }
      } else {
        // Проверяем, есть ли уже разделитель даты
        const allDividers = messagesContainer.querySelectorAll('.date-divider');
        if (allDividers.length > 0) {
          const lastDivider = allDividers[allDividers.length - 1];
          const dividerDateText = lastDivider.querySelector('span')?.textContent;
          const formattedMessageDate = formatMessageDateDivider(messageTimestamp);
          
          // Если последний разделитель содержит ту же дату, новый не нужен
          if (dividerDateText === formattedMessageDate) {
            needDateDivider = false;
          }
        }
      }
      
      // Если нужен разделитель даты, добавляем его
      if (needDateDivider) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        
        // Форматируем дату
        const formattedDate = formatMessageDateDivider(messageTimestamp);
        dateDivider.innerHTML = `<span>${formattedDate}</span>`;
        
        // Добавляем разделитель в контейнер
        messagesContainer.appendChild(dateDivider);
      }
      
      // Создаем и добавляем новое сообщение
      const messageElement = createMessageElement(message);
      // Сохраняем timestamp в data-атрибут для последующего использования
      messageElement.dataset.timestamp = messageTimestamp;
      
      // Если сообщение новое по времени, добавляем в конец
      messagesContainer.appendChild(messageElement);
      
      // Прокручиваем к новому сообщению только если мы находимся близко к низу контейнера
      // (то есть пользователь просматривает последние сообщения)
      const isNearBottom = messagesContainer.scrollTop + messagesContainer.clientHeight >= 
        messagesContainer.scrollHeight - 100;
        
      if (isNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      
      // Если сообщение от собеседника и текущий чат активен - отмечаем как прочитанное
      if (message.senderId === friendId && message.receiverId === currentUser.uid) {
        markMessageAsRead(chatId, message.id);
        
        // Проверяем, нужно ли показать разделитель непрочитанных сообщений
        // Если разделителя ещё нет, но есть непрочитанные сообщения от собеседника, добавляем его
        if (!document.getElementById('unread-messages-divider') && !isNearBottom) {
          // Если мы не в конце чата, то нужно показать разделитель
          const unreadDivider = document.createElement('div');
          unreadDivider.className = 'unread-divider';
          unreadDivider.id = 'unread-messages-divider';
          unreadDivider.innerHTML = '<span>Новые сообщения</span>';
          
          // Добавляем разделитель перед новым сообщением
          const messageElement = document.querySelector(`.message[data-message-id="${message.id}"]`);
          if (messageElement && messageElement.previousElementSibling) {
            messagesContainer.insertBefore(unreadDivider, messageElement);
          } else {
            // Если нет предыдущего элемента, добавляем разделитель в конец
            messagesContainer.appendChild(unreadDivider);
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при обработке нового сообщения:', error);
    }
    
    // После добавления новых сообщений обновляем индикатор даты
    setupScrollDateIndicator(messagesContainer);
  });
  
  // Также слушаем изменения и удаления сообщений
  onChildChanged(chatMessagesRef, (snapshot) => {
    try {
      const message = snapshot.val();
      message.id = snapshot.key;
      
      // Проверяем, предназначено ли сообщение для текущего чата
      if (!((message.senderId === currentUser.uid && message.receiverId === friendId) || 
           (message.senderId === friendId && message.receiverId === currentUser.uid))) {
        return;
      }
      
      // Проверяем, было ли сообщение помечено как удаленное
      const isDeletedForCurrentUser = 
        (message.senderId === currentUser.uid && message.deleted_for_sender) ||
        (message.senderId !== currentUser.uid && message.deleted_for_receiver);
      
      if (isDeletedForCurrentUser) {
        // Находим элемент сообщения в DOM и удаляем его
        const messageElement = document.querySelector(`.message[data-message-id="${message.id}"]`);
        if (messageElement) {
          // Анимация исчезновения и удаление
          messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
          messageElement.style.opacity = '0';
          messageElement.style.transform = 'scale(0.8)';
          
          // Удаляем элемент после завершения анимации
          setTimeout(() => {
            if (messageElement.parentNode) {
              const messagesContainer = document.getElementById('chat-messages');
              messageElement.parentNode.removeChild(messageElement);
              
              // Проверяем, нужно ли удалить разделитель непрочитанных сообщений
              checkUnreadDivider(messageElement, messagesContainer);
            }
          }, 300);
        }
      }
    } catch (error) {
      console.error('Ошибка при обработке измененного сообщения:', error);
    }
  });
  
  // Слушаем удаление сообщений
  onChildRemoved(chatMessagesRef, (snapshot) => {
    try {
      const messageId = snapshot.key;
      
      // Находим элемент сообщения в DOM и удаляем его
      const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
        // Анимация исчезновения и удаление
        messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'scale(0.8)';
        
        // Удаляем элемент после завершения анимации
        setTimeout(() => {
          if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
            
            // После удаления элемента проверяем, остались ли сообщения в контейнере
            const messagesContainer = document.getElementById('chat-messages');
            const remainingMessages = messagesContainer.querySelectorAll('.message');
            
            if (remainingMessages.length === 0) {
              // Если сообщений не осталось, проверяем базу данных
              checkIfChatIsEmpty(chatId);
            }
            
            // Проверяем, нужно ли удалить разделитель непрочитанных сообщений
            checkUnreadDivider(messageElement, messagesContainer);
          }
        }, 300);
      }
    } catch (error) {
      console.error('Ошибка при обработке удаленного сообщения:', error);
    }
  });
  
  // Слушаем изменения для статусов прочтения
  onValue(chatMessagesRef, () => {
    // Делаем только легкую проверку на изменения, детали обрабатываем в setupReadStatusListener
  });
}

// Обновленная функция для настройки слушателя статусов прочтения
function setupReadStatusListener(chatId, friendId) {
    const db = getDatabase();
      const messagesRef = ref(db, `chats/${chatId}/messages`);
      
  // Слушаем изменения в сообщениях
  onValue(messagesRef, (snapshot) => {
        if (snapshot.exists()) {
          const messages = snapshot.val();
          
      // Проходим по всем сообщениям
      Object.entries(messages).forEach(([messageId, message]) => {
        // Если сообщение отправлено текущим пользователем этому собеседнику
        if (message.senderId === currentUser.uid && message.receiverId === friendId) {
          // Находим элемент сообщения в DOM
          const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
          
          if (messageElement) {
            // Находим индикатор статуса
            const statusElement = messageElement.querySelector('.message-read-status');
            
            if (statusElement) {
              // Обновляем класс и иконку в зависимости от статуса прочтения
              if (message.read) {
                statusElement.classList.remove('unread');
                statusElement.classList.add('read');
                
                // Обновляем иконку
                const iconElement = statusElement.querySelector('.icon');
                if (iconElement) {
                  iconElement.classList.remove('icon-message-succeeded');
                  iconElement.classList.add('icon-message-read');
                }
              } else {
                statusElement.classList.remove('read');
                statusElement.classList.add('unread');
                
                // Обновляем иконку
                const iconElement = statusElement.querySelector('.icon');
                if (iconElement) {
                  iconElement.classList.remove('icon-message-read');
                  iconElement.classList.add('icon-message-succeeded');
                }
              }
            }
          }
          
          // Проверяем, является ли это сообщение последним в чате
          loadLastMessage(friendId);
        }
      });
    }
  });
}

// Функция для отметки конкретного сообщения как прочитанного
function markMessageAsRead(chatId, messageId) {
  const db = getDatabase();
  const messageRef = ref(db, `chats/${chatId}/messages/${messageId}`);
  
  // Получаем сообщение для проверки
  get(messageRef).then((snapshot) => {
    if (snapshot.exists()) {
        const message = snapshot.val();
        
      // Проверяем, предназначено ли сообщение для текущего пользователя
      if (message.receiverId === currentUser.uid) {
        // Обновляем только поле read
        update(messageRef, { read: true })
            .then(() => {
            console.log(`Сообщение ${messageId} отмечено как прочитанное`);
            
            // Обновляем UI для этого сообщения
            const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
            if (messageElement) {
              const statusElement = messageElement.querySelector('.message-read-status');
              if (statusElement) {
                statusElement.classList.remove('unread');
                statusElement.classList.add('read');
                
                const iconElement = statusElement.querySelector('.icon');
                if (iconElement) {
                  iconElement.classList.remove('icon-message-succeeded');
                  iconElement.classList.add('icon-message-read');
                }
              }
            }
            
            // Обновляем индикаторы непрочитанных сообщений
            updateNavUnreadIndicator();
            
            // Обновляем индикатор в списке чатов для отправителя
            const senderId = message.senderId;
            if (senderId) {
              // Получаем чат, чтобы проверить последнее сообщение
              const chatMessagesRef = ref(db, `chats/${chatId}/messages`);
              get(chatMessagesRef).then((snapshot) => {
                if (snapshot.exists()) {
                  const messages = snapshot.val();
                  // Находим последнее сообщение
                  const sortedMessages = Object.entries(messages)
                    .map(([key, msg]) => ({
                      id: key,
                      ...msg
                    }))
                    .sort((a, b) => {
                      const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
                      const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
                      return timestampB - timestampA;
                    });
                    
                  if (sortedMessages.length > 0 && sortedMessages[0].id === messageId) {
                    // Это последнее сообщение, обновляем статус в списке чатов
                    loadLastMessage(senderId);
                  }
                }
              }).catch(error => {
                console.error('Ошибка при получении сообщений для обновления статуса:', error);
              });
            }
            })
          .catch(error => {
            console.error(`Ошибка при отметке сообщения ${messageId} как прочитанного:`, error);
          });
      }
    }
  }).catch(error => {
    console.error(`Ошибка при получении данных сообщения ${messageId}:`, error);
  });
}

// Улучшенное создание элемента сообщения
function createMessageElement(message) {
  // Проверка наличия уже созданного элемента для этого сообщения
  const existingElement = document.querySelector(`.message[data-message-id="${message.id}"]`);
  if (existingElement) {
    return existingElement; // Возвращаем существующий элемент
  }
  
  const messageElement = document.createElement('div');
  messageElement.className = 'message';
  
  if (message.senderId === currentUser.uid) {
    messageElement.classList.add('outgoing');
  } else {
    messageElement.classList.add('incoming');
  }
  
  // Получаем данные отправителя
  const sender = message.senderId === currentUser.uid 
    ? { photoURL: currentUser.photoURL } 
    : friendsData[selectedFriendId];
  
  const avatarUrl = (sender && sender.photoURL) 
    || 'https://ui-avatars.com/api/?name=' + encodeURIComponent((sender && sender.name) || 'User') + '&background=random';
  
  // Форматируем время сообщения с учетом возможных типов timestamp
  let messageTime = '';
  let messageTimestamp = 0;
  
  if (message.formattedDateTime) {
    // Если есть форматированная дата, используем HH:MM из неё
    const parts = message.formattedDateTime.split(' ');
    const timePart = parts[1].split(':').slice(0, 2).join(':'); // HH:MM
    messageTime = timePart;
    
    // Пытаемся извлечь timestamp из форматированной даты
    try {
      const dateParts = parts[0].split('.');
      const timeParts = parts[1].split(':');
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // Месяцы в JS начинаются с 0
      const year = parseInt(dateParts[2], 10);
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const seconds = parseInt(timeParts[2], 10);
      const ms = timeParts.length > 3 ? parseInt(timeParts[3], 10) : 0;
      
      const date = new Date(year, month, day, hours, minutes, seconds, ms);
      messageTimestamp = date.getTime();
    } catch (e) {
      console.error('Ошибка при парсинге форматированной даты:', e);
    }
  } else if (message.timestamp) {
    const timestamp = getTimestampValue(message.timestamp);
    messageTimestamp = timestamp;
    const messageDate = new Date(timestamp);
    if (!isNaN(messageDate.getTime())) {
      messageTime = messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  } else if (message.clientTimestamp) {
    // Используем клиентское время, если серверное еще не получено
    messageTimestamp = message.clientTimestamp;
    const messageDate = new Date(message.clientTimestamp);
    if (!isNaN(messageDate.getTime())) {
      messageTime = messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
  }
  
  // Определяем статус прочтения для исходящих сообщений с использованием иконок
  const readStatus = message.senderId === currentUser.uid 
    ? `<div class="message-read-status ${message.read ? 'read' : 'unread'}">
         <i class="icon ${message.read ? 'icon-message-read' : 'icon-message-succeeded'}"></i>
       </div>` 
    : '';
  
  // Устанавливаем data-атрибуты для идентификации сообщения и его timestamp
  messageElement.dataset.messageId = message.id;
  messageElement.dataset.timestamp = messageTimestamp || Date.now();
  
  // Сохраняем объект сообщения как JSON-строку в атрибуте
  messageElement.setAttribute('data-message-object', JSON.stringify({
    id: message.id,
    text: message.text || '',
    senderId: message.senderId,
    timestamp: messageTimestamp || Date.now(),
    read: message.read,
    replyTo: message.replyTo || null
  }));
  
  // Проверяем, помечено ли сообщение как удаленное для текущего пользователя
  const isDeletedForCurrentUser = 
    (message.senderId === currentUser.uid && message.deleted_for_sender) ||
    (message.senderId !== currentUser.uid && message.deleted_for_receiver);
  
  // Если сообщение удалено для текущего пользователя, не отображаем его
  if (isDeletedForCurrentUser) {
    return null;
  }
  
  // Подготавливаем HTML для цитаты, если сообщение является ответом
  let replyHtml = '';
  if (message.replyTo) {
    // Проверяем, является ли replyTo массивом или одним объектом
    const repliesArray = Array.isArray(message.replyTo) ? message.replyTo : [message.replyTo];
    
    // Открываем общий контейнер для цитат
    replyHtml += '<div class="message-replies-container">';
    
    // Добавляем каждую цитату без ограничений
    for (const reply of repliesArray) {
      let replySenderName = 'Собеседник';
      
      if (reply.senderId === currentUser.uid) {
        replySenderName = 'Вы';
      } else if (friendsData[reply.senderId] && friendsData[reply.senderId].name) {
        replySenderName = friendsData[reply.senderId].name;
      }
      
      // Обрезаем текст цитаты, если он слишком длинный
      let replyText = reply.text || '';
      if (replyText.length > 50) {
        replyText = replyText.substring(0, 50) + '...';
      }
      
      // Проверяем наличие изображений и видео в цитируемом сообщении
      let mediaIndicator = '';
      const hasImages = reply.imageUrls && reply.imageUrls.length > 0;
      const hasVideos = reply.videoUrls && reply.videoUrls.length > 0;
      
      if (hasImages) {
        mediaIndicator += `<div class="reply-image-indicator">${pluralizeImages(reply.imageUrls.length)}</div>`;
      }
      
      if (hasVideos) {
        if (hasImages) {
          mediaIndicator += `<div class="reply-video-indicator" style="margin-left: 5px;">${pluralizeVideos(reply.videoUrls.length)}</div>`;
        } else {
          mediaIndicator += `<div class="reply-video-indicator">${pluralizeVideos(reply.videoUrls.length)}</div>`;
        }
      }
      
      replyHtml += `
        <div class="message-reply-to" data-original-message-id="${reply.messageId}">
          <div class="reply-sender">${replySenderName}</div>
          <div class="reply-text">
            ${replyText}
            <div class="reply-media-indicators" style="display: flex;">${mediaIndicator}</div>
          </div>
        </div>
      `;
    }
    
    // Закрываем общий контейнер для цитат
    replyHtml += '</div>';
  }
  
  // Создаем оптимизированную структуру для лучшей производительности рендеринга
  messageElement.innerHTML = `
    <img src="${avatarUrl}" alt="Avatar" class="message-avatar" loading="lazy">
    <div class="message-content">
      ${replyHtml}
      <div class="message-text">${message.text || ''}</div>
      ${function() {
        // Объединяем все медиа (изображения и видео) для просмотра
        const allMedia = [];
        if (message.imageUrls && message.imageUrls.length > 0) {
          allMedia.push(...message.imageUrls);
        }
        if (message.videoUrls && message.videoUrls.length > 0) {
          allMedia.push(...message.videoUrls);
        }
        
        // Преобразуем allMedia в JSON строку для использования в onclick
        const allMediaJson = JSON.stringify(allMedia).replace(/"/g, '&quot;');
        
        // Формируем HTML для изображений и видео
        let htmlContent = '';
        
        // Добавляем блок с изображениями, если они есть
        if (message.imageUrls && message.imageUrls.length > 0) {
          htmlContent += `<div class="message-images count-${message.imageUrls.length}">`;
          htmlContent += message.imageUrls.map((url, index) => 
            `<div class="message-image-wrapper" 
              onclick="return window.handleImageClick(${allMediaJson}, '${message.id}', ${index}, event)">
              <img src="${url}" alt="Изображение ${index + 1}" 
                onclick="return window.handleImageClick(${allMediaJson}, '${message.id}', ${index}, event);">
            </div>`
          ).join('');
          htmlContent += `</div>`;
        }
        
        // Добавляем блок с видео, если они есть
        if (message.videoUrls && message.videoUrls.length > 0) {
          htmlContent += `<div class="message-videos count-${message.videoUrls.length}">`;
          htmlContent += message.videoUrls.map((url, index) => {
            const isVideo = url.includes('.mp4') || url.includes('.webm') || url.includes('.ogg') || 
                          url.includes('.mov') || url.includes('video');
            // Индекс в общем массиве всех медиа (после всех изображений)
            const globalIndex = (message.imageUrls ? message.imageUrls.length : 0) + index;
            return `<div class="message-video-wrapper" data-url="${url}" data-index="${index}">
              <div class="video-container">
                <video src="${url}" preload="metadata"></video>
                <div class="video-overlay" 
                  onclick="return window.handleImageClick(${allMediaJson}, '${message.id}', ${globalIndex}, event)"></div>
              </div>
            </div>`;
          }).join('');
          htmlContent += `</div>`;
        }
        
        return htmlContent;
      }()}
      <div class="message-info">
        <div class="message-time">${messageTime}</div>
        ${readStatus}
      </div>
    </div>
  `;
  
  // После создания элемента сообщения, добавляем обработчик клика по цитате
  messageElement.addEventListener('click', handleReplyClick);
  
  return messageElement;
}

// Функция-обработчик клика по цитате для перехода к исходному сообщению
function handleReplyClick(event) {
  // Проверяем, что клик был по элементу цитаты
  const replyElement = event.target.closest('.message-reply-to');
  if (!replyElement) return;
  
  // Получаем ID исходного сообщения из data-атрибута
  const originalMessageId = replyElement.dataset.originalMessageId;
  if (!originalMessageId) return;
  
  // Удаляем показ индикатора загрузки
  // showStatusNotification('Поиск сообщения...');
  
  // Ищем сообщение в DOM
  const messagesContainer = document.getElementById('chat-messages');
  const originalMessage = messagesContainer.querySelector(`.message[data-message-id="${originalMessageId}"]`);
  
  if (originalMessage) {
    // Прокручиваем к исходному сообщению с плавной анимацией
    originalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Подсвечиваем исходное сообщение
    originalMessage.classList.add('highlighted');
    
    // Убираем подсветку через 2 секунды
    setTimeout(() => {
      originalMessage.classList.remove('highlighted');
    }, 2000);
    
    // Предотвращаем дальнейшее всплытие события, чтобы не активировать другие обработчики
    event.stopPropagation();
  } else {
    // Если сообщение не найдено, пытаемся загрузить более старые сообщения
    findAndScrollToOriginalMessage(originalMessageId);
    
    // Предотвращаем дальнейшее всплытие события
    event.stopPropagation();
  }
}

// Функция для поиска исходного сообщения и загрузки старых сообщений при необходимости
async function findAndScrollToOriginalMessage(messageId) {
  if (!selectedFriendId || !currentUser) return;
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, selectedFriendId);
  const messagesRef = ref(db, `chats/${chatId}/messages/${messageId}`);
  
  try {
    // Проверяем, существует ли сообщение в базе данных
    const snapshot = await get(messagesRef);
    
    if (snapshot.exists()) {
      // Сообщение существует, но не загружено в текущий DOM
      
      // Получаем контейнер сообщений
      const messagesContainer = document.getElementById('chat-messages');
      
      // Показываем индикатор загрузки
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.textContent = 'Загрузка сообщений...';
      messagesContainer.prepend(loadingIndicator);
      
      // Устанавливаем флаг, что мы ищем конкретное сообщение
      window.searchingForMessage = messageId;
      
      // Загружаем старые сообщения (можно использовать существующую функцию loadOlderMessages)
      await loadMessageHistory(chatId, messageId);
      
      // Удаляем индикатор загрузки
      if (loadingIndicator.parentNode) {
        loadingIndicator.remove();
      }
      
      // Проверяем, появилось ли сообщение в DOM после загрузки истории
      const originalMessage = messagesContainer.querySelector(`.message[data-message-id="${messageId}"]`);
      
      if (originalMessage) {
        // Нашли сообщение, прокручиваем к нему
        originalMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Подсвечиваем исходное сообщение
        originalMessage.classList.add('highlighted');
        
        // Убираем подсветку через 2 секунды
        setTimeout(() => {
          originalMessage.classList.remove('highlighted');
        }, 2000);
      } else {
        // Сообщение не найдено даже после загрузки истории
        showErrorNotification('Не удалось найти исходное сообщение');
      }
      
      // Сбрасываем флаг поиска сообщения
      window.searchingForMessage = null;
    } else {
      // Сообщение не существует в базе данных (возможно, было удалено)
      showErrorNotification('Исходное сообщение недоступно или было удалено');
    }
  } catch (error) {
    console.error('Ошибка при поиске исходного сообщения:', error);
    showErrorNotification('Ошибка при поиске исходного сообщения');
    
    // Сбрасываем флаг поиска сообщения
    window.searchingForMessage = null;
  }
}

// Функция для загрузки истории сообщений до определенного сообщения
async function loadMessageHistory(chatId, targetMessageId) {
  const db = getDatabase();
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  try {
    // Получаем все сообщения в чате
    const snapshot = await get(messagesRef);
    
    if (snapshot.exists()) {
      const messagesData = snapshot.val();
      const messagesArray = [];
      
      // Преобразуем объект сообщений в массив
      for (const messageId in messagesData) {
        const message = messagesData[messageId];
        // Проверяем, что сообщение не удалено для текущего пользователя
        const isDeletedForCurrentUser = 
          (message.senderId === currentUser.uid && message.deleted_for_sender) ||
          (message.senderId !== currentUser.uid && message.deleted_for_receiver);
        
        if (!isDeletedForCurrentUser) {
          messagesArray.push({
            ...message,
            id: messageId
          });
        }
      }
      
      // Сортируем сообщения по времени (от старых к новым)
      messagesArray.sort((a, b) => {
        const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
        const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
        return timestampA - timestampB;
      });
      
      // Получаем контейнер сообщений
      const messagesContainer = document.getElementById('chat-messages');
      
      // Очищаем контейнер перед загрузкой истории
      messagesContainer.innerHTML = '';
      
      // Группируем сообщения по датам
      const messagesByDate = {};
      
      // Перебираем сообщения и группируем их по датам
      messagesArray.forEach(message => {
        const timestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
        const messageDate = new Date(timestamp);
        const dateString = messageDate.toDateString();
        
        if (!messagesByDate[dateString]) {
          messagesByDate[dateString] = [];
        }
        
        messagesByDate[dateString].push(message);
      });
      
      // Отображаем сообщения по группам с разделителями дат
      let foundTargetMessage = false;
      
      Object.keys(messagesByDate).forEach(dateString => {
        // Добавляем разделитель даты
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        const dateToShow = formatMessageDateDivider(new Date(dateString).getTime());
        dateDivider.innerHTML = `<span>${dateToShow}</span>`;
        messagesContainer.appendChild(dateDivider);
        
        // Добавляем сообщения для этой даты
        messagesByDate[dateString].forEach(message => {
          const messageElement = createMessageElement(message);
          if (messageElement) {
            messagesContainer.appendChild(messageElement);
            
            // Проверяем, является ли это сообщение целевым
            if (message.id === targetMessageId) {
              foundTargetMessage = true;
            }
          }
        });
      });
      
      return foundTargetMessage;
    }
    
    return false;
  } catch (error) {
    console.error('Ошибка при загрузке истории сообщений:', error);
    return false;
  }
}

// Оптимизированная функция для обновления статуса "печатает"
function updateTypingStatus(isTyping) {
  if (!selectedFriendId || !currentUser) return;
  
  // Если статус не изменился, выходим
  if (isTyping === isCurrentlyTyping) return;
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, selectedFriendId);
  
  // Для ускорения обновления использовать update вместо set
  const updates = {};
  updates[currentUser.uid] = isTyping ? Date.now() : null;
  
  // Обновляем статус в базе данных используя путь родителя
  update(ref(db, `chats/${chatId}/typing`), updates)
    .catch(error => {
      console.error('Ошибка при обновлении статуса печати:', error);
    });
  
  isCurrentlyTyping = isTyping;
}

// Улучшенная функция для отслеживания статуса "печатает" собеседника
function listenForTypingStatus(friendId) {
  if (!friendId || !currentUser) return;
  
  // Очищаем предыдущий слушатель, если есть
  if (typingStatusRef && typingStatusListener) {
    off(typingStatusRef);
    typingStatusListener = null;
  }
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, friendId);
  typingStatusRef = ref(db, `chats/${chatId}/typing/${friendId}`);
  
  // Слушаем изменения статуса печати собеседника с меньшей задержкой
  typingStatusListener = onValue(typingStatusRef, (snapshot) => {
    const typingStatus = snapshot.val();
    const typingIndicator = document.getElementById('typing-indicator');
    
    // Уменьшаем таймаут до 5 секунд для более быстрого сброса
    if (typingStatus && Date.now() - typingStatus < 5000) {
      // Показываем индикатор "печатает" в заголовке чата
      if (typingIndicator) {
        typingIndicator.style.display = 'block';
      }
      
      // Устанавливаем флаг печати для этого пользователя
      typingUsers[friendId] = true;
      window.typingUsers = typingUsers;
      
      // Обновляем отображение последнего сообщения
      updateLastMessageDisplay(friendId, null);
    } else {
      // Скрываем индикатор
      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }
      
      // Сбрасываем флаг печати
      typingUsers[friendId] = false;
      window.typingUsers = typingUsers;
      
      // Обновляем отображение последнего сообщения (загружаем актуальное)
      loadLastMessage(friendId);
    }
  });
  
  // Настраиваем отслеживание статуса печати для всех друзей
  setupGlobalTypingListeners();
}

// Оптимизированная функция для настройки глобальных слушателей статуса печати
function setupGlobalTypingListeners() {
  const db = getDatabase();
  
  // Для каждого друга настраиваем слушатель статуса печати с единым обработчиком
  const typingHandlers = {};
  
  // Очищаем существующие обработчики, чтобы не было дублей
  if (window.typingHandlers) {
    Object.values(window.typingHandlers).forEach(handler => {
      try {
        if (handler && handler.ref) {
          off(handler.ref, null, handler.handler);
        }
      } catch (error) {
        console.error('Ошибка при очистке обработчика статуса печати:', error);
      }
    });
  }
  
  Object.keys(friendsData).forEach(friendId => {
    // Настраиваем слушатели для всех друзей, включая активный чат
    // (раньше мы пропускали активный чат: if (friendId === selectedFriendId) return;)
    
    const chatId = getChatId(currentUser.uid, friendId);
    if (!chatId) return; // Пропускаем, если не удалось создать chatId
    
    const friendTypingRef = ref(db, `chats/${chatId}/typing/${friendId}`);
    
    // Используем onValue с сохранением ссылки для возможности отписки
    const handler = onValue(friendTypingRef, (snapshot) => {
      const typingStatus = snapshot.val();
      
      // Короткий таймаут для сброса статуса
      if (typingStatus && Date.now() - typingStatus < 5000) {
        // Устанавливаем флаг печати
        typingUsers[friendId] = true;
        window.typingUsers = typingUsers;
        
        // Обновляем отображение последнего сообщения
        updateLastMessageDisplay(friendId, null);
        
        // Если это активный чат, обновляем также индикатор в заголовке
        if (friendId === selectedFriendId) {
          const typingIndicator = document.getElementById('typing-indicator');
          if (typingIndicator) {
            typingIndicator.style.display = 'block';
          }
        }
      } else {
        // Сбрасываем флаг печати только если он был установлен ранее
        if (typingUsers[friendId]) {
          typingUsers[friendId] = false;
          window.typingUsers = typingUsers;
          
          // Обновляем отображение последнего сообщения только при изменении статуса
          loadLastMessage(friendId);
          
          // Если это активный чат, скрываем индикатор в заголовке
          if (friendId === selectedFriendId) {
            const typingIndicator = document.getElementById('typing-indicator');
            if (typingIndicator) {
              typingIndicator.style.display = 'none';
            }
          }
        }
      }
    });
    
    // Сохраняем обработчик для последующей очистки
    typingHandlers[friendId] = {
      ref: friendTypingRef,
      handler: handler
    };
  });
  
  // Добавляем в глобальный объект для возможности очистки
  window.typingHandlers = typingHandlers;
}

// Функция для отметки всех сообщений как прочитанных
function markMessagesAsRead(friendId) {
  // Проверяем, что все необходимые данные существуют
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Ошибка: недостаточно данных для отметки сообщений как прочитанных');
    return;
  }
  
  // Проверяем валидность идентификаторов
  if (friendId === 'undefined' || friendId === 'null') {
    console.log('Некорректный friendId в markMessagesAsRead:', friendId);
    return;
  }
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, friendId);
  
  // Дополнительная проверка полученного chatId
  if (!chatId) {
    console.error('Ошибка: невозможно получить ID чата в markMessagesAsRead');
    return;
  }
  
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  // Проверяем, является ли чат активным в DOM
  const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
  const isChatActive = friendElement && friendElement.classList.contains('active');
  
  // Если чат активен, скрываем индикатор непрочитанных
  if (isChatActive) {
    if (friendElement) {
      const unreadIndicator = friendElement.querySelector('.unread-indicator');
      if (unreadIndicator) {
        unreadIndicator.style.display = 'none';
      }
      // Убираем выделение элемента
      friendElement.classList.remove('has-unread');
    }
  }
  
  // Если чат не активен, не отмечаем сообщения как прочитанные
  if (!isChatActive) {
    console.log('Чат не активен, не отмечаем сообщения как прочитанные');
    return;
  }
  
  // Получаем все сообщения из чата
  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      const updates = {};
      let hasUnreadMessages = false;
      
      // Проходим по всем сообщениям
      Object.entries(messages).forEach(([messageId, message]) => {
        // Если сообщение от собеседника, предназначено для текущего пользователя и не прочитано
        if (message.senderId === friendId && message.receiverId === currentUser.uid && message.read === false) {
          // Отмечаем как прочитанное
          updates[`${messageId}/read`] = true;
          hasUnreadMessages = true;
        }
      });
      
      // Применяем обновления к базе данных, только если есть непрочитанные сообщения
      if (hasUnreadMessages) {
        update(ref(db, `chats/${chatId}/messages`), updates)
          .then(() => {
            console.log('Сообщения отмечены как прочитанные');
            
            // Удаляем разделитель непрочитанных сообщений, если он есть
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
              const unreadDivider = messagesContainer.querySelector('#unread-messages-divider');
              if (unreadDivider) {
                // Анимация исчезновения разделителя
                unreadDivider.style.transition = 'opacity 0.3s, transform 0.3s';
                unreadDivider.style.opacity = '0';
                unreadDivider.style.transform = 'translateY(-10px)';
                
                // Удаляем разделитель после завершения анимации
                setTimeout(() => {
                  if (unreadDivider.parentNode) {
                    unreadDivider.parentNode.removeChild(unreadDivider);
                  }
                }, 300);
              }
            }
            
            // Обновляем все индикаторы непрочитанных сообщений, если у них валидные ID
            Object.keys(friendsData).forEach(id => {
              if (id && id !== 'undefined' && id !== 'null') {
                updateUnreadCountForFriend(id);
              }
            });
            
            // Обновляем индикатор в сайдбаре
            updateNavUnreadIndicator();
            
            // Обновляем индикатор статуса сообщения для отправителя в списке диалогов
            // Если текущий пользователь тоже отправил сообщение последним
            loadLastMessage(friendId);
          })
          .catch((error) => {
            console.error('Ошибка при обновлении статуса сообщений:', error);
          });
      } else {
        // Даже если нет непрочитанных сообщений, обновляем индикатор
        loadLastMessage(friendId);
      }
    }
  }).catch((error) => {
    console.error('Ошибка при получении сообщений:', error);
  });
}

// Улучшенная функция для очистки всех слушателей чата
function clearChatListeners() {
  // Очищаем слушатель сообщений в чате
  if (chatMessagesRef) {
    try {
      // Отключаем все типы слушателей для ссылки на сообщения
      off(chatMessagesRef, 'child_added');
      off(chatMessagesRef, 'child_changed');
      off(chatMessagesRef, 'child_removed');
      off(chatMessagesRef, 'value');
      chatMessagesListener = null;
      chatMessagesRef = null;
    } catch (error) {
      console.error('Ошибка при очистке слушателей сообщений:', error);
    }
  }
  
  // Очищаем слушатель новых сообщений
  if (newMessageRef && newMessageListener) {
    try {
      off(newMessageRef, 'child_added', newMessageListener);
      newMessageListener = null;
      newMessageRef = null;
    } catch (error) {
      console.error('Ошибка при очистке слушателя новых сообщений:', error);
    }
  }
  
  // Очищаем слушатель статуса "печатает"
  if (typingStatusRef && typingStatusListener) {
    try {
      off(typingStatusRef, null, typingStatusListener);
      typingStatusListener = null;
      typingStatusRef = null;
    } catch (error) {
      console.error('Ошибка при очистке слушателя статуса печати:', error);
    }
  }
  
  // Очищаем слушатель прокрутки
  const messagesContainer = document.getElementById('chat-messages');
  if (messagesContainer) {
    messagesContainer.removeEventListener('scroll', handleMessagesScroll);
  }
  
  // Сбрасываем флаги пагинации
  oldestMessageTimestamp = null;
  allMessagesLoaded = false;
  isLoadingMoreMessages = false;
  
  // Сбрасываем статус печати
  if (isCurrentlyTyping) {
    updateTypingStatus(false);
  }
  
  // Очищаем таймер статуса печати
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }
  
  // Очищаем слушатели последних сообщений
  Object.keys(lastMessageListeners).forEach(friendId => {
    if (lastMessageListeners[friendId]) {
      try {
        off(lastMessageListeners[friendId].ref, null, lastMessageListeners[friendId].listener);
        lastMessageListeners[friendId] = null;
      } catch (error) {
        console.error(`Ошибка при очистке слушателя последних сообщений для ${friendId}:`, error);
      }
    }
  });
  
  // Очищаем обработчики статуса печати
  if (window.typingHandlers) {
    Object.values(window.typingHandlers).forEach(handler => {
      try {
        if (handler && handler.ref) {
          off(handler.ref, null, handler.handler);
        }
      } catch (error) {
        console.error('Ошибка при очистке обработчика статуса печати:', error);
      }
    });
    window.typingHandlers = {};
  }
  
  // Очищаем сет ожидающих сообщений
  messagesPendingDisplay.clear();
  
  // Сбрасываем состояние выделения сообщений
  if (isSelectionMode) {
    clearMessageSelection();
  }
  
  console.log('Все слушатели чата успешно очищены');
}

// Оптимизированная функция для загрузки последнего сообщения
function loadLastMessage(friendId) {
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, friendId);
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  // Удаляем предыдущий слушатель для этого чата, если он существует
  if (lastMessageListeners[friendId]) {
    try {
    off(lastMessageListeners[friendId].ref);
    lastMessageListeners[friendId] = null;
    } catch (error) {
      console.error(`Ошибка при очистке слушателя последних сообщений для ${friendId}:`, error);
    }
  }
  
  // Сначала проверяем, не печатает ли собеседник прямо сейчас
  const isTyping = checkIfUserIsTyping(friendId);
  if (isTyping) {
    // Если печатает, показываем индикатор "печатает" вместо последнего сообщения
    updateLastMessageDisplay(friendId, null);
    return; // Выходим, так как статус "печатает" имеет приоритет
  }
  
  // Делаем запрос для быстрого получения начальных данных
  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      
      // Сортируем сообщения по времени с оптимизацией для сравнения дат
      const sortedMessages = Object.entries(messages)
        .map(([key, message]) => ({
          id: key,
          ...message
        }))
        .sort((a, b) => {
          // Используем clientTimestamp, если серверный timestamp еще не получен
          const timestampA = getTimestampValue(a.timestamp) || a.clientTimestamp || 0;
          const timestampB = getTimestampValue(b.timestamp) || b.clientTimestamp || 0;
          return timestampB - timestampA; // Сортируем по убыванию
        });
      
      // Получаем последнее сообщение
      if (sortedMessages.length > 0) {
        const lastMessage = sortedMessages[0];
        updateLastMessageDisplay(friendId, lastMessage);
      } else {
        // Если сообщений нет
        updateLastMessageDisplay(friendId, null);
      }
    } else {
      // Если чата еще нет
      updateLastMessageDisplay(friendId, null);
    }
  }).catch(error => {
    console.error('Ошибка при получении последнего сообщения:', error);
    updateLastMessageDisplay(friendId, null);
  });
  
  // Создаем оптимизированный запрос - только последнее сообщение
  const lastMessageQuery = query(messagesRef, orderByChild('timestamp'));
  
  // Устанавливаем слушатель для обновления последнего сообщения в реальном времени
  const listener = onValue(lastMessageQuery, (snapshot) => {
    // Сначала проверяем, не печатает ли собеседник
    if (checkIfUserIsTyping(friendId)) {
      return; // Выходим, если пользователь печатает - его статус уже отображается
    }
    
    if (snapshot.exists()) {
      const messages = snapshot.val();
      
      // Нам нужно только самое свежее сообщение
      let lastMessage = null;
      let latestTimestamp = 0;
      
      // Находим сообщение с самым поздним timestamp
      Object.entries(messages).forEach(([key, message]) => {
        const msgTimestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
        if (msgTimestamp > latestTimestamp) {
          latestTimestamp = msgTimestamp;
          lastMessage = {
          id: key,
          ...message
          };
        }
      });
      
      if (lastMessage) {
        updateLastMessageDisplay(friendId, lastMessage);
        
        // Проверяем, новое ли это сообщение
        const currentTime = Date.now();
        if (isPageFullyInitialized && currentTime - latestTimestamp < 30000) {
          // Если это свежее сообщение (менее 30 секунд), обновляем порядок сортировки
          console.log(`Вызываем moveFriendToTop для ${friendId} из updateLastMessageDisplay (сообщение после инициализации)`);
          moveFriendToTop(friendId);
        }
      }
    }
  });
  
  // Сохраняем ссылку на слушатель
  lastMessageListeners[friendId] = {
    ref: lastMessageQuery,
    listener: listener
  };
}

// Улучшенная функция для обновления отображения последнего сообщения
function updateLastMessageDisplay(friendId, message) {
  const lastMessageElement = document.querySelector(`.last-message[data-friend-id="${friendId}"]`);
  if (!lastMessageElement) return;
  
  // Получаем элемент друга
  const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
  if (!friendElement) return;
  
  // Проверяем, печатает ли пользователь
  const isTyping = checkIfUserIsTyping(friendId);
  
  // Сохраняем индикатор непрочитанных сообщений, если он существует
  const unreadIndicator = lastMessageElement.querySelector('.unread-indicator');
  let unreadCount = 0;
  let showUnread = false;
  
  if (unreadIndicator) {
    showUnread = unreadIndicator.style.display !== 'none';
    unreadCount = unreadIndicator.textContent || '0';
  }
  
  if (isTyping) {
    // Если пользователь печатает, показываем анимированный статус "печатает..."
    // Полностью очищаем содержимое и создаем новый элемент для статуса печати
    lastMessageElement.innerHTML = '';
    
    // Создаем элемент для статуса "печатает"
    const typingInnerStatus = document.createElement('div');
    typingInnerStatus.className = 'typing-inner-status';
    typingInnerStatus.innerHTML = '<span class="typing-text">печатает</span><span class="typing-dots"></span>';
    lastMessageElement.appendChild(typingInnerStatus);
    
    // Восстанавливаем индикатор непрочитанных сообщений, если он был виден
    if (showUnread) {
      const newUnreadIndicator = document.createElement('div');
      newUnreadIndicator.className = 'unread-indicator';
      newUnreadIndicator.textContent = unreadCount;
      newUnreadIndicator.style.display = 'flex';
      lastMessageElement.appendChild(newUnreadIndicator);
    }
    
    // Скрываем индикатор статуса сообщения, когда пользователь печатает
    const statusWrapper = friendElement.querySelector('.message-status-wrapper');
    if (statusWrapper) {
      statusWrapper.style.display = 'none';
    }
  } else {
    // Если не печатает, показываем последнее сообщение или заглушку
    
    // Создаем/получаем элемент для текста сообщения
    let lastMessageTextElement = lastMessageElement.querySelector('.last-message-text');
    if (!lastMessageTextElement) {
      // Полностью очищаем содержимое при создании нового элемента
      lastMessageElement.innerHTML = '';
      
      lastMessageTextElement = document.createElement('span');
      lastMessageTextElement.className = 'last-message-text';
      lastMessageElement.appendChild(lastMessageTextElement);
      
      // Восстанавливаем индикатор непрочитанных сообщений, если он был виден
      if (showUnread) {
        const newUnreadIndicator = document.createElement('div');
        newUnreadIndicator.className = 'unread-indicator';
        newUnreadIndicator.textContent = unreadCount;
        newUnreadIndicator.style.display = 'flex';
        lastMessageElement.appendChild(newUnreadIndicator);
      }
    }
    
    if (message) {
      // Запоминаем текущий HTML, чтобы сохранить индикатор непрочитанных сообщений
      const currentHTML = lastMessageElement.innerHTML;
      const hasUnreadIndicator = currentHTML.includes('unread-indicator');
      
      // Используем CSS для адаптивного обрезания текста вместо фиксированной длины
      // Полностью стилизуем элемент с текстом последнего сообщения
      lastMessageTextElement.style.whiteSpace = 'nowrap';
      lastMessageTextElement.style.overflow = 'hidden';
      lastMessageTextElement.style.textOverflow = 'ellipsis';
      lastMessageTextElement.style.maxWidth = 'calc(100% - 30px)'; // Оставляем место для индикатора
      lastMessageTextElement.style.display = 'inline-block';
      
      // Формируем текст сообщения
      let messageText = '';
      
      // Добавляем префикс отправителя
      if (message.senderId === currentUser.uid) {
        messageText = 'Вы: ';
      }
      
      // Очищаем содержимое элемента перед добавлением
      lastMessageTextElement.innerHTML = '';
      
      // Проверяем наличие изображений и видео в сообщении
      const hasImages = message.imageUrls && message.imageUrls.length > 0;
      const hasVideos = message.videoUrls && message.videoUrls.length > 0;
      
      if (hasImages || hasVideos) {
        // Добавляем текст сообщения, если он есть
        if (message.text) {
          const textNode = document.createTextNode(messageText + message.text + ' ');
          lastMessageTextElement.appendChild(textNode);
        } else {
          const textNode = document.createTextNode(messageText);
          lastMessageTextElement.appendChild(textNode);
        }
        
        // Если есть изображения, добавляем индикатор с их количеством
        if (hasImages) {
          const imageCountIndicator = document.createElement('span');
          imageCountIndicator.className = 'reply-indicator';
          imageCountIndicator.textContent = pluralizeImages(message.imageUrls.length);
          lastMessageTextElement.appendChild(imageCountIndicator);
          
          // Добавляем разделитель, если есть еще и видео
          if (hasVideos) {
            const separator = document.createTextNode(', ');
            lastMessageTextElement.appendChild(separator);
          }
        }
        
        // Если есть видео, добавляем индикатор с их количеством
        if (hasVideos) {
          const videoCountIndicator = document.createElement('span');
          videoCountIndicator.className = 'reply-indicator';
          videoCountIndicator.textContent = pluralizeVideos(message.videoUrls.length);
          lastMessageTextElement.appendChild(videoCountIndicator);
        }
      } else {
        // Если нет медиафайлов, показываем только текст
        if (message.text) {
          if (message.senderId === currentUser.uid) {
            messageText = `Вы: ${message.text}`;
          } else {
            messageText = message.text;
          }
          
          // Создаем текстовый узел для основного текста сообщения
          const textNode = document.createTextNode(messageText);
          lastMessageTextElement.appendChild(textNode);
        } else {
          // Если нет ни текста, ни медиафайлов, показываем пустое сообщение
          const textNode = document.createTextNode(messageText || '');
          lastMessageTextElement.appendChild(textNode);
        }
      }
      
      // Проверяем, является ли сообщение ответом на другое сообщение
      if (message.replyTo) {
        // Создаем span для индикатора ответа с отдельным классом для стилизации
        const replyIndicator = document.createElement('span');
        replyIndicator.className = 'reply-indicator';
        
        // Проверяем, является ли replyTo массивом или одним объектом
        const repliesArray = Array.isArray(message.replyTo) ? message.replyTo : [message.replyTo];
        
        // Добавляем соответствующий текст в зависимости от количества цитат
        if (repliesArray.length > 1) {
          replyIndicator.textContent = ` (ответ на ${repliesArray.length} сообщ.)`;
        } else {
          replyIndicator.textContent = ' (ответ)';
        }
        
        lastMessageTextElement.appendChild(replyIndicator);
      }
      
      // Восстанавливаем индикатор непрочитанных сообщений, если он был
      if (hasUnreadIndicator && showUnread) {
        // Убедимся, что индикатор существует
        let unreadElement = lastMessageElement.querySelector('.unread-indicator');
        if (!unreadElement) {
          unreadElement = document.createElement('div');
          unreadElement.className = 'unread-indicator';
          unreadElement.textContent = unreadCount;
          unreadElement.style.display = 'flex';
          lastMessageElement.appendChild(unreadElement);
        }
      }
      
      // Форматируем время для отображения во friend-name
      let timeString = '';
      if (message.formattedDateTime) {
        // Если есть форматированная дата, используем её
        const parts = message.formattedDateTime.split(' ');
        const datePart = parts[0]; // DD.MM.YYYY
        const timePart = parts[1].split(':').slice(0, 2).join(':'); // HH:MM
        
        // Проверяем, сегодня ли это сообщение
        const now = new Date();
        const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
        
        if (datePart === today) {
          // Для сообщений от сегодня показываем только время
          timeString = timePart;
        } else {
          // Для более старых сообщений показываем короткую дату
          const dateParts = datePart.split('.');
          timeString = `${dateParts[0]}.${dateParts[1]}`;
        }
      } else if (message.timestamp || message.clientTimestamp) {
        // Выбираем timestamp из доступных
        const timestamp = getTimestampValue(message.timestamp) || message.clientTimestamp;
        
        // Преобразуем в Date
        const messageDate = new Date(timestamp);
        
        // Проверяем валидность даты
        if (!isNaN(messageDate.getTime())) {
          // Если это сегодня, показываем только время
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate()).getTime();
          
          if (messageDay === today) {
            // Для сообщений от сегодня показываем только время
            timeString = messageDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          } else {
            // Для более старых сообщений показываем короткую дату
            timeString = messageDate.toLocaleDateString([], {day: 'numeric', month: 'numeric'});
          }
        }
      }
      
      // Обновляем отображение времени в блоке friend-name
      if (friendElement) {
        const timeElement = friendElement.querySelector('.last-message-time');
        if (timeElement) {
          timeElement.textContent = timeString;
        }
        
        // Обновляем индикатор статуса сообщения
        const statusWrapper = friendElement.querySelector('.message-status-wrapper');
        const statusElement = friendElement.querySelector('.message-status');
        
        if (statusWrapper && statusElement) {
          // Показываем индикатор только для исходящих сообщений
          if (message.senderId === currentUser.uid) {
            statusWrapper.style.display = 'flex';
            
            // Определяем статус сообщения (прочитано/не прочитано)
            if (message.read) {
              statusElement.className = 'message-status read';
            } else {
              statusElement.className = 'message-status sent';
            }
          } else {
            // Скрываем индикатор для входящих сообщений
            statusWrapper.style.display = 'none';
          }
        }
        
        // Перемещаем элемент в начало списка при получении нового сообщения
        // Проверяем, что это не старое сообщение при начальной загрузке
        const currentTime = Date.now();
        const messageTime = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
        
        // Если сообщение новое (получено в последние 30 секунд)
        if (isPageFullyInitialized && currentTime - messageTime < 30000) {
          console.log(`Вызываем moveFriendToTop для ${friendId} из updateLastMessageDisplay (сообщение после инициализации)`);
          moveFriendToTop(friendId);
        }
      }
    } else {
      // Запоминаем текущий HTML, чтобы сохранить индикатор непрочитанных сообщений
      const currentHTML = lastMessageElement.innerHTML;
      const hasUnreadIndicator = currentHTML.includes('unread-indicator');
      
      // Если сообщений нет
      lastMessageTextElement.textContent = 'Нет сообщений';
      
      // Восстанавливаем индикатор непрочитанных сообщений, если он был
      if (hasUnreadIndicator && showUnread) {
        // Убедимся, что индикатор существует
        let unreadElement = lastMessageElement.querySelector('.unread-indicator');
        if (!unreadElement) {
          unreadElement = document.createElement('div');
          unreadElement.className = 'unread-indicator';
          unreadElement.textContent = unreadCount;
          unreadElement.style.display = 'flex';
          lastMessageElement.appendChild(unreadElement);
        }
      }
      
      // Убираем время, так как сообщений нет
      if (friendElement) {
        const timeElement = friendElement.querySelector('.last-message-time');
        if (timeElement) {
          timeElement.textContent = '';
        }
        
        // Скрываем индикатор статуса, так как сообщений нет
        const statusWrapper = friendElement.querySelector('.message-status-wrapper');
        if (statusWrapper) {
          statusWrapper.style.display = 'none';
        }
      }
    }
  }
}

// Функция для проверки, печатает ли пользователь
function checkIfUserIsTyping(friendId) {
  // Получаем глобальный объект статусов печати
  const typingFlags = window.typingUsers || {};
  
  // Проверяем, установлен ли флаг для этого пользователя
  const isTyping = typingFlags[friendId] === true;
  
  // Проверяем, что объект существует и содержит нужный ключ
  if (typeof typingFlags !== 'object' || typingFlags === null) {
    // Если объект не существует или не инициализирован
    console.log('Объект typingUsers не инициализирован');
    return false;
  }
  
  return isTyping;
}

// Функция для проверки пропущенных сообщений
function checkMissedMessages(chatId, currentCount) {
  if (!selectedFriendId) return; // Выходим, если нет активного чата
  
  const db = getDatabase();
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  // Получаем актуальное количество сообщений
  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const actualCount = Object.keys(snapshot.val()).length;
      
      // Если есть несоответствие в количестве сообщений
      if (actualCount > currentCount && actualCount !== lastMessagesCount) {
        console.log(`Обнаружено несоответствие в количестве сообщений: ${actualCount} vs ${currentCount}`);
        lastMessagesCount = actualCount;
        
        // Если текущий чат все еще выбран, обновляем его
        if (selectedFriendId && getChatId(currentUser.uid, selectedFriendId) === chatId) {
          console.log('Перезагружаем сообщения из-за обнаруженных пропущенных...');
          loadMessages(selectedFriendId);
        }
      }
    }
  }).catch(error => {
    console.error('Ошибка при проверке пропущенных сообщений:', error);
  });
}

// Вспомогательная функция для получения числового значения timestamp
function getTimestampValue(timestamp) {
  if (!timestamp) return 0;
  
  if (typeof timestamp === 'number') {
    return timestamp;
  }
  
  if (timestamp instanceof Date) {
    return timestamp.getTime();
  }
  
  if (typeof timestamp === 'object') {
    if (timestamp.seconds) {
      return timestamp.seconds * 1000;
    }
    if (timestamp.toDate) {
      try {
        return timestamp.toDate().getTime();
      } catch (e) {
        return Date.now();
      }
    }
  }
  
  // Пробуем распарсить форматированную дату
  if (typeof timestamp === 'string' && timestamp.match(/^\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}:\d{2}:\d{2}$/)) {
    try {
      // Формат: "DD.MM.YYYY HH:MM:SS:MS"
      const parts = timestamp.split(' ');
      const dateParts = parts[0].split('.');
      const timeParts = parts[1].split(':');
      
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // Месяцы в JS начинаются с 0
      const year = parseInt(dateParts[2], 10);
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      const seconds = parseInt(timeParts[2], 10);
      const ms = parseInt(timeParts[3], 10);
      
      const date = new Date(year, month, day, hours, minutes, seconds, ms);
      return date.getTime();
    } catch (e) {
      console.error('Ошибка при парсинге форматированной даты:', e);
      return Date.now();
    }
  }
  
  try {
    return new Date(timestamp).getTime();
  } catch (e) {
    return Date.now();
  }
}

// Улучшенная функция для обновления индикаторов непрочитанных сообщений
function updateUnreadIndicator(excludeFriendId = null) {
  console.log('Обновление индикаторов непрочитанных сообщений...');
  const db = getDatabase();
  
  // Создаем массив промисов для параллельного выполнения
  const promises = [];
  
  // Для каждого друга в списке
  Object.keys(friendsData).forEach(friendId => {
    // Для исключаемого друга (открытый чат) - сразу скрываем индикатор
    if (excludeFriendId === friendId) {
      const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
      if (friendElement) {
        const unreadIndicator = friendElement.querySelector('.unread-indicator');
        if (unreadIndicator) {
          unreadIndicator.style.display = 'none';
        }
      }
      return; // Пропускаем дальнейшую обработку для этого друга
    }
    
    const chatId = getChatId(currentUser.uid, friendId);
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    
    // Создаем промис для этого друга
    const promise = get(messagesRef).then((snapshot) => {
      if (snapshot.exists()) {
        const messages = snapshot.val();
        
        // Оптимизированный подсчет непрочитанных сообщений
        let unreadCount = 0;
        Object.values(messages).forEach(message => {
          if (message.senderId === friendId && message.read === false) {
            unreadCount++;
          }
        });
        
        // Обновляем индикатор для элемента друга
        const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
        if (friendElement) {
          // Находим индикатор (он уже должен существовать)
          const unreadIndicator = friendElement.querySelector('.unread-indicator');
          
          if (unreadCount > 0 && unreadIndicator) {
            // Если есть непрочитанные сообщения
            console.log(`У друга ${friendId} непрочитанных сообщений: ${unreadCount}`);
            unreadIndicator.textContent = unreadCount;
            unreadIndicator.style.display = 'flex';
            
            // Выделяем элемент, если у него есть непрочитанные сообщения
            if (!friendElement.classList.contains('active')) {
              friendElement.classList.add('has-unread');
            }
          } else if (unreadIndicator) {
            // Если нет непрочитанных сообщений
            unreadIndicator.style.display = 'none';
            friendElement.classList.remove('has-unread');
          }
        }
      }
    }).catch(error => {
      console.error('Ошибка при получении сообщений для индикатора:', error);
    });
    
    promises.push(promise);
  });
  
  // Обрабатываем все запросы параллельно
  Promise.all(promises).then(() => {
    // Обновляем общий индикатор непрочитанных сообщений
    updateNavUnreadIndicator();
  }).catch(error => {
    console.error('Ошибка при обновлении индикаторов:', error);
  });
}

// Улучшенная функция для получения общего количества непрочитанных сообщений
function getTotalUnreadMessagesCount() {
  return new Promise((resolve, reject) => {
    if (!currentUser) {
      resolve(0);
      return;
    }
    
    const db = getDatabase();
    let totalUnread = 0;
    const promises = [];
    
    // Для каждого друга в списке
    Object.keys(friendsData).forEach(friendId => {
      const chatId = getChatId(currentUser.uid, friendId);
      const messagesRef = ref(db, `chats/${chatId}/messages`);
      
      // Оптимизированный запрос - фильтруем по непрочитанным сообщениям
      const unreadQuery = query(messagesRef);
      
      // Создаем промис для каждого друга
      const promise = get(unreadQuery).then((snapshot) => {
        if (snapshot.exists()) {
          const messages = snapshot.val();
          
          // Счетчик непрочитанных сообщений
          let friendUnreadCount = 0;
          
          // Подсчитываем непрочитанные сообщения от этого друга
          Object.values(messages).forEach(message => {
            if (message.senderId === friendId && message.read === false) {
              friendUnreadCount++;
            }
          });
          
          totalUnread += friendUnreadCount;
        }
      }).catch(error => {
        console.error('Ошибка при получении сообщений для общего счетчика:', error);
      });
      
      promises.push(promise);
    });
    
    // Ждем выполнения всех промисов
    Promise.all(promises)
      .then(() => resolve(totalUnread))
      .catch(error => {
        console.error('Ошибка при подсчете общего количества непрочитанных:', error);
        resolve(0);
      });
  });
}

// Улучшенная функция для обновления индикаторов непрочитанных сообщений в сайдбаре
function updateNavUnreadIndicator() {
  console.log('Обновление индикаторов в сайдбаре...');
  getTotalUnreadMessagesCount().then(totalUnread => {
    // Кешируем значение в sessionStorage для других страниц
    sessionStorage.setItem('unreadMessagesCount', totalUnread);
    
    // Получаем кнопки сообщений в сайдбаре
    const messagesButton = document.getElementById('messages-button');
    const messagesButtonCompact = document.getElementById('messages-button-compact');
    
    if (!messagesButton || !messagesButtonCompact) {
      console.error('Элементы кнопок сообщений не найдены в DOM');
      return;
    }
    
    // Ищем или создаем индикаторы
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
      // Проверяем, изменилось ли значение
      if (navUnreadIndicator.textContent !== String(totalUnread)) {
        console.log(`Обновление индикатора: ${navUnreadIndicator.textContent || '0'} -> ${totalUnread}`);
        
        // Добавляем класс для анимации
        navUnreadIndicator.classList.add('pulse');
        navUnreadIndicatorCompact.classList.add('pulse');
        
        // Обновляем текст
        navUnreadIndicator.textContent = totalUnread;
        navUnreadIndicator.style.display = 'flex';
        
        navUnreadIndicatorCompact.textContent = totalUnread;
        navUnreadIndicatorCompact.style.display = 'flex';
        
        // Удаляем класс анимации через короткое время
        setTimeout(() => {
          navUnreadIndicator.classList.remove('pulse');
          navUnreadIndicatorCompact.classList.remove('pulse');
        }, 300);
      } else {
        // Отображаем индикатор без анимации, если значение не изменилось
        navUnreadIndicator.textContent = totalUnread;
        navUnreadIndicator.style.display = 'flex';
        
        navUnreadIndicatorCompact.textContent = totalUnread;
        navUnreadIndicatorCompact.style.display = 'flex';
      }
    } else {
      navUnreadIndicator.style.display = 'none';
      navUnreadIndicatorCompact.style.display = 'none';
    }
  }).catch(error => {
    console.error('Ошибка при обновлении индикаторов в сайдбаре:', error);
  });
}

// Объявляем глобальный слушатель сообщений
let messagesListener = null;

// Настройка слушателей сообщений
function setupMessageListeners(db, userId) {
  // Останавливаем предыдущий слушатель, если он существует
  if (messagesListener) {
    try {
      off(messagesListener);
    } catch (error) {
      console.error('Ошибка при очистке глобального слушателя сообщений:', error);
    }
  }
  
  // Настраиваем слушатель для всего узла chats для обновления индикаторов
  const chatsRef = ref(db, 'chats');
  messagesListener = onValue(chatsRef, () => {
    console.log('Глобальное изменение в чатах, обновляем индикаторы...');
    // При изменении в любом чате обновляем индикаторы непрочитанных сообщений
    
    // Обновляем индикаторы для всех друзей
    Object.keys(friendsData).forEach(friendId => {
      updateUnreadCountForFriend(friendId);
    });
    
    // Обновляем индикатор непрочитанных сообщений в сайдбаре
    updateNavUnreadIndicator();
    
    // Если чат с другом открыт, отмечаем новые входящие сообщения как прочитанные
    if (selectedFriendId) {
      markMessagesAsRead(selectedFriendId);
    }
  });
  
  // Используем оптимизированный слушатель для всех чатов
  setupActiveChatsListeners(userId);
  
  // Настраиваем слушатель для новых сообщений в текущем чате
  setupNewMessageListener(db, userId);
  
  // Настраиваем слушатель для обновления статуса активности индикаторов в панели навигации
  setupNavIndicatorListeners(db);
}

// Новая функция для настройки слушателей индикаторов в панели навигации
function setupNavIndicatorListeners(db) {
  // Находим элементы индикаторов
  const messagesButton = document.getElementById('messages-button');
  const messagesButtonCompact = document.getElementById('messages-button-compact');
  
  if (!messagesButton || !messagesButtonCompact) return;
  
  // Интервальное обновление для обеспечения актуальности
  setInterval(() => {
    console.log('Запланированное обновление индикаторов');
    updateNavUnreadIndicator();
  }, 5000); // Обновление каждые 5 секунд
  
  // Обновляем индикаторы при фокусе на странице
  window.addEventListener('focus', () => {
    console.log('Страница получила фокус, обновляем индикаторы');
    updateNavUnreadIndicator();
    updateUnreadIndicator(selectedFriendId);
  });
  
  // Обновляем индикаторы при клике на любую часть страницы
  document.addEventListener('click', () => {
    updateNavUnreadIndicator();
  });
}

// Настройка слушателей только для активных чатов
function setupActiveChatsListeners(userId) {
  const db = getDatabase();
  
  // Для каждого друга настраиваем отдельный слушатель
  Object.keys(friendsData).forEach(friendId => {
    const chatId = getChatId(userId, friendId);
    if (!chatId) return; // Пропускаем, если не можем получить ID чата
    
    const chatRef = ref(db, `chats/${chatId}`);
    
    // Используем onChild* события для лучшей производительности
    
    // Слушаем добавление новых сообщений
    onChildAdded(ref(db, `chats/${chatId}/messages`), (snapshot) => {
      console.log(`Новое сообщение в чате с ${friendId}`);
      
      // Получаем данные сообщения
      const message = snapshot.val();
      
      // Проверяем, относится ли сообщение к текущему пользователю и инициализирована ли страница
      if (isPageFullyInitialized && message && (message.senderId === friendId || message.receiverId === friendId)) {
        console.log(`Вызываем moveFriendToTop для ${friendId} из onChildAdded (сообщение после инициализации)`);
        // Перемещаем друга в начало списка
        moveFriendToTop(friendId);
      }
      
      // Проверяем, является ли сообщение входящим и непрочитанным
      if (message.senderId === friendId && message.receiverId === userId && message.read === false) {
        // Обновляем индикатор непрочитанных сообщений для этого друга
        updateUnreadCountForFriend(friendId);
      }
      
      // При появлении нового сообщения обновляем глобальные индикаторы
      updateNavUnreadIndicator();
      
      // Если чат с другом открыт, отмечаем новые входящие сообщения как прочитанные
      if (selectedFriendId && selectedFriendId === friendId) {
        markMessagesAsRead(selectedFriendId);
      }
    });
    
    // Слушаем изменение существующих сообщений (например, прочтение)
    onChildChanged(ref(db, `chats/${chatId}/messages`), (snapshot) => {
      console.log(`Изменено сообщение в чате с ${friendId}`);
      
      // Получаем данные измененного сообщения
      const message = snapshot.val();
      
      // Если статус прочтения изменился, обновляем индикаторы
      if (message && message.read !== undefined) {
        // Обновляем индикатор для конкретного друга
        updateUnreadCountForFriend(friendId);
        // Обновляем общий индикатор
        updateNavUnreadIndicator();
      }
    });
    
    // Настраиваем слушатель для отображения последнего сообщения
    setupLastMessageListener(chatId, friendId);
  });
  
  // Обновляем индикаторы сразу после настройки слушателей
  setTimeout(() => {
    // Обновляем индикаторы для всех друзей
    Object.keys(friendsData).forEach(friendId => {
      updateUnreadCountForFriend(friendId);
    });
    updateNavUnreadIndicator();
  }, 500);
}

// Новая функция для обновления счетчика непрочитанных сообщений для конкретного друга
function updateUnreadCountForFriend(friendId) {
  // Проверяем, что friendId существует и валиден
  if (!friendId || friendId === 'undefined' || friendId === 'null') {
    console.log('Некорректный friendId в updateUnreadCountForFriend:', friendId);
    return;
  }
  
  // Проверяем, что currentUser существует и инициализирован
  if (!currentUser || !currentUser.uid) {
    console.log('currentUser не инициализирован в updateUnreadCountForFriend');
    return;
  }

  // Проверяем, является ли чат активным (открытым)
  // Проверяем как selectedFriendId, так и класс active в DOM
  const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
  const isChatActive = selectedFriendId === friendId && friendElement && friendElement.classList.contains('active');
  
  // Если чат активен, скрываем индикатор
  if (isChatActive) {
    if (friendElement && friendElement.querySelector('.unread-indicator')) {
      friendElement.querySelector('.unread-indicator').style.display = 'none';
    }
    return;
  }
  
  const db = getDatabase();
  const chatId = getChatId(currentUser.uid, friendId);
  
  // Проверяем, что chatId успешно сформирован
  if (!chatId) {
    console.error('Ошибка: не удалось сформировать chatId в updateUnreadCountForFriend');
    return;
  }
  
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  get(messagesRef).then((snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      
      // Подсчет непрочитанных сообщений
      let unreadCount = 0;
      Object.values(messages).forEach(message => {
        if (message.senderId === friendId && message.receiverId === currentUser.uid && message.read === false) {
          unreadCount++;
        }
      });
      
      // Обновляем индикатор для элемента друга
      if (friendElement) {
        // Находим индикатор
        let unreadIndicator = friendElement.querySelector('.unread-indicator');
        
        // Если индикатора нет, но есть непрочитанные сообщения, создаем его
        if (!unreadIndicator && unreadCount > 0) {
          const lastMessageElement = friendElement.querySelector('.last-message');
          if (lastMessageElement) {
            unreadIndicator = document.createElement('div');
            unreadIndicator.className = 'unread-indicator';
            lastMessageElement.appendChild(unreadIndicator);
          }
        }
        
        // Если индикатор существует, обновляем его
        if (unreadIndicator) {
          if (unreadCount > 0) {
            // Если есть непрочитанные сообщения
            console.log(`У друга ${friendId} непрочитанных сообщений: ${unreadCount}`);
            unreadIndicator.textContent = unreadCount;
            unreadIndicator.style.display = 'flex';
            
            // Выделяем элемент
            if (!friendElement.classList.contains('active')) {
              friendElement.classList.add('has-unread');
            }
          } else {
            // Если нет непрочитанных сообщений
            unreadIndicator.style.display = 'none';
            friendElement.classList.remove('has-unread');
          }
        }
      }
    }
  }).catch(error => {
    console.error('Ошибка при получении сообщений для индикатора:', error);
  });
}

// Функция для настройки слушателя последнего сообщения
function setupLastMessageListener(chatId, friendId) {
  const db = getDatabase();
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  
  // Слушаем изменения в сообщениях чата
  onValue(messagesRef, (snapshot) => {
    if (snapshot.exists()) {
      const messages = snapshot.val();
      
      // Находим последнее сообщение
      let lastMessage = null;
      let latestTimestamp = 0;
      
      Object.entries(messages).forEach(([messageId, message]) => {
        const timestamp = getTimestampValue(message.timestamp) || message.clientTimestamp || 0;
        if (timestamp > latestTimestamp) {
          latestTimestamp = timestamp;
          lastMessage = { id: messageId, ...message };
        }
      });
      
      // Обновляем отображение последнего сообщения
      if (lastMessage) {
        updateLastMessageDisplay(friendId, lastMessage);
        
        // Проверяем, новое ли это сообщение
        const currentTime = Date.now();
        if (isPageFullyInitialized && currentTime - latestTimestamp < 30000) {
          // Если это свежее сообщение (менее 30 секунд), обновляем порядок сортировки
          console.log(`Вызываем moveFriendToTop для ${friendId} из updateLastMessageDisplay (сообщение после инициализации)`);
          moveFriendToTop(friendId);
        }
      }
    }
  });
}

// Функция для отслеживания новых сообщений
function setupNewMessageListener(db, userId) {
  try {
    // Проверяем валидность userId
    if (!userId || userId === 'undefined' || userId === 'null') {
      console.log('Некорректный userId в setupNewMessageListener:', userId);
      return;
    }

    // Безопасная очистка предыдущего слушателя
    if (newMessageRef && newMessageListener) {
      // Проверяем, что у нас есть референс и функция отписки
      off(newMessageRef, 'child_added', newMessageListener);
      newMessageListener = null;
      newMessageRef = null;
    }
    
    // Если есть открытый чат
    if (selectedFriendId) {
      // Проверяем валидность selectedFriendId
      if (selectedFriendId === 'undefined' || selectedFriendId === 'null') {
        console.log('Некорректный selectedFriendId в setupNewMessageListener:', selectedFriendId);
        return;
      }

      // Проверяем, является ли чат активным в DOM
      const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${selectedFriendId}"]`);
      const isChatActive = friendElement && friendElement.classList.contains('active');
      
      // Если чат не активен (например, нажали кнопку назад), не устанавливаем слушатель
      if (!isChatActive) {
        console.log('Чат не активен в DOM, не устанавливаем слушатель новых сообщений');
        return;
      }
      
      const chatId = getChatId(userId, selectedFriendId);
      
      // Проверяем, что chatId успешно сформирован
      if (!chatId) {
        console.error('Ошибка: не удалось сформировать chatId в setupNewMessageListener');
        return;
      }
      
      newMessageRef = ref(db, `chats/${chatId}/messages`);
      
      // Создаем функцию обработчик
      const handleNewMessage = (snapshot) => {
        const message = snapshot.val();
        
        // Проверяем, является ли чат активным в текущий момент
        const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${selectedFriendId}"]`);
        const isChatActive = friendElement && friendElement.classList.contains('active');
        
        // Если сообщение от собеседника и не прочитано и чат активен - отмечаем как прочитанное автоматически
        if (message && message.senderId === selectedFriendId && message.read === false && isChatActive) {
          // Более эффективное обновление - напрямую меняем только поле read
          markMessageAsRead(chatId, snapshot.key);
        } else if (!isChatActive && selectedFriendId) {
          // Если чат не активен, обновляем индикатор непрочитанных сообщений
          updateUnreadCountForFriend(selectedFriendId);
        }
      };
      
      // Сохраняем ссылку на обработчик
      newMessageListener = handleNewMessage;
      
      // Устанавливаем слушатель только для новых сообщений
      onChildAdded(newMessageRef, newMessageListener);
    }
  } catch (error) {
    console.error('Ошибка при настройке слушателя новых сообщений:', error);
  }
}

// Исправленная функция получения идентификатора чата
function getChatId(uid1, uid2) {
  // Проверяем, что оба идентификатора существуют
  if (!uid1 || !uid2) {
    console.error('Ошибка: отсутствуют идентификаторы пользователей для создания чата');
    return null;
  }
  
  // Проверяем, не являются ли идентификаторы undefined или null
  if (uid1 === 'undefined' || uid2 === 'undefined' || uid1 === 'null' || uid2 === 'null') {
    console.error('Ошибка: недопустимые идентификаторы пользователей для создания чата');
    return null;
  }
  
  // Преобразуем в строки для надежности
  const userId1 = String(uid1);
  const userId2 = String(uid2);
  
  // Сортируем ID для получения консистентного идентификатора чата
  return userId1 < userId2 ? `${userId1}_${userId2}` : `${userId2}_${userId1}`;
}

// Новая функция для форматирования даты в нужном формате
function formatDateTimeForDB(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}:${milliseconds}`;
}

// Функция для отправки сообщения с проверкой корректности chatId
function sendMessageWithOptimisticUI(db) {
  const messageInput = document.getElementById('message-input');
  const messagesContainer = document.getElementById('chat-messages');
  
  if (!messageInput || !messagesContainer || !selectedFriendId) return;
  
  const messageText = messageInput.value.trim();
  if (!messageText) return;
  
  // Очищаем поле ввода
  messageInput.value = '';
  
  // Удаляем unread-divider, если он есть
  const unreadDivider = messagesContainer.querySelector('.unread-divider');
  if (unreadDivider) {
    unreadDivider.remove();
  }
  
  const now = new Date();
  const clientTimestamp = now.getTime();
  
  // Форматируем дату в нужном формате
  const formattedDateTime = formatDateTimeForDB(now);
  
  // Получаем chatId
  const chatId = getChatId(currentUser.uid, selectedFriendId);
  
  // Создаем ссылку на новое сообщение (только для текста, без изображений)
  const messagesRef = ref(db, `chats/${chatId}/messages`);
  const newMessageRef = push(messagesRef);
  const messageId = newMessageRef.key;
  
  const message = {
    id: messageId,
    text: messageText,
    senderId: currentUser.uid,
    receiverId: selectedFriendId,
    timestamp: serverTimestamp(),
    clientTimestamp: clientTimestamp,
    formattedDateTime: formattedDateTime,
    read: false
  };
  
  // Проверяем, является ли сообщение ответом на другое сообщение
  const replyInfoJson = localStorage.getItem('replyingTo');
  if (replyInfoJson) {
    try {
      const replyInfo = JSON.parse(replyInfoJson);
      
      // Проверяем, является ли replyInfo массивом или одним объектом
      if (Array.isArray(replyInfo)) {
        // Массив цитат - сохраняем все данные, включая изображения
        message.replyTo = replyInfo.map(reply => {
          // Создаем базовую структуру ответа
          const replyData = {
            messageId: reply.messageId,
            senderId: reply.senderId,
            text: reply.text || ''
          };
          
          // Если есть изображения, добавляем их
          if (reply.imageUrls && Array.isArray(reply.imageUrls) && reply.imageUrls.length > 0) {
            replyData.imageUrls = reply.imageUrls;
          }
          
          // Если есть видео, добавляем их
          if (reply.videoUrls && Array.isArray(reply.videoUrls) && reply.videoUrls.length > 0) {
            replyData.videoUrls = reply.videoUrls;
          }
          
          return replyData;
        });
      } else {
        // Одна цитата
        const replyData = {
          messageId: replyInfo.messageId,
          senderId: replyInfo.senderId,
          text: replyInfo.text || ''
        };
        
        // Если есть изображения, добавляем их
        if (replyInfo.imageUrls && Array.isArray(replyInfo.imageUrls) && replyInfo.imageUrls.length > 0) {
          replyData.imageUrls = replyInfo.imageUrls;
        }
        
        // Если есть видео, добавляем их
        if (replyInfo.videoUrls && Array.isArray(replyInfo.videoUrls) && replyInfo.videoUrls.length > 0) {
          replyData.videoUrls = replyInfo.videoUrls;
        }
        
        message.replyTo = [replyData];
      }
      
      // Удаляем информацию о цитате после отправки
      localStorage.removeItem('replyingTo');
      
      // Очищаем панель ответа
      const replyPanelContainer = document.getElementById('reply-panel-container');
      if (replyPanelContainer) {
        replyPanelContainer.innerHTML = '';
      }
    } catch (e) {
      console.error('Ошибка при парсинге информации о цитате:', e);
    }
  }
  
  // Добавляем сообщение в список ожидающих отображения
  messagesPendingDisplay.add(messageId);
  
  if (messagesContainer) {
    // Удаляем сообщение "Нет сообщений" если оно есть
    const emptyChat = messagesContainer.querySelector('.empty-chat');
    if (emptyChat) {
      emptyChat.remove();
    }
    
    // Проверяем необходимость добавления разделителя даты
    const messageDate = now;
    const messageDateString = messageDate.toDateString();
    
    // Ищем последний элемент сообщения и его дату
    let lastMessageElement = null;
    const allMessages = messagesContainer.querySelectorAll('.message');
    if (allMessages.length > 0) {
      lastMessageElement = allMessages[allMessages.length - 1];
    }
    
    let needDateDivider = true;
    if (lastMessageElement) {
      // Получаем дату последнего сообщения
      const lastMessageId = lastMessageElement.dataset.messageId;
      if (lastMessageId) {
        const lastMessageTimestampAttr = lastMessageElement.dataset.timestamp;
        if (lastMessageTimestampAttr) {
          const lastMessageTimestamp = parseInt(lastMessageTimestampAttr);
          const lastMessageDate = new Date(lastMessageTimestamp);
          const lastMessageDateString = lastMessageDate.toDateString();
          
          // Если даты совпадают, разделитель не нужен
          if (lastMessageDateString === messageDateString) {
            needDateDivider = false;
          }
        }
      }
    }
    
    // Проверяем, есть ли уже разделитель даты
    const allDividers = messagesContainer.querySelectorAll('.date-divider');
    if (allDividers.length > 0) {
      const lastDivider = allDividers[allDividers.length - 1];
      const dividerDateText = lastDivider.querySelector('span')?.textContent;
      const formattedMessageDate = formatMessageDateDivider(clientTimestamp);
      
      // Если последний разделитель содержит ту же дату, новый не нужен
      if (dividerDateText === formattedMessageDate) {
        needDateDivider = false;
      }
    }
    
    // Если нужен разделитель даты, добавляем его
    if (needDateDivider) {
      const dateDivider = document.createElement('div');
      dateDivider.className = 'date-divider';
      dateDivider.innerHTML = `<span>${formatMessageDateDivider(clientTimestamp)}</span>`;
      messagesContainer.appendChild(dateDivider);
    }
    
    const optimisticMessage = {...message, timestamp: clientTimestamp};
    const messageElement = createMessageElement(optimisticMessage);
    messagesContainer.appendChild(messageElement);
    
    // Временно отключаем плавную прокрутку для мгновенной прокрутки к новому сообщению
    messagesContainer.style.scrollBehavior = 'auto';
    
    // Прокручиваем к новому сообщению
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      // Возвращаем плавную прокрутку
      setTimeout(() => {
        messagesContainer.style.scrollBehavior = 'smooth';
      }, 100);
    });
  }
  
  // Обновляем last-message сразу (оптимистично)
  updateLastMessageDisplay(selectedFriendId, {...message, timestamp: clientTimestamp});
  
  // Метаданные для списка чатов
  const chatMetadata = {
    lastMessage: messageText,
    timestamp: serverTimestamp(),
    clientTimestamp: clientTimestamp,
    formattedDateTime: formattedDateTime,
    withUser: selectedFriendId
  };
  
  const friendChatMetadata = {
    lastMessage: messageText,
    timestamp: serverTimestamp(),
    clientTimestamp: clientTimestamp,
    formattedDateTime: formattedDateTime,
    withUser: currentUser.uid
  };
  
  // Создаем объект со всеми обновлениями для транзакции
  const updates = {};
  updates[`chats/${chatId}/messages/${messageId}`] = message;
  updates[`userChats/${currentUser.uid}/${chatId}`] = chatMetadata;
  updates[`userChats/${selectedFriendId}/${chatId}`] = friendChatMetadata;
  
  // Применяем все обновления одной транзакцией
  update(ref(db), updates)
    .then(() => {
      console.log('Сообщение успешно отправлено');
      
      // Удаляем из списка ожидающих
      messagesPendingDisplay.delete(messageId);
      
      // Обновляем индикатор в сайдбаре
      updateNavUnreadIndicator();
      
      // Перемещаем чат наверх списка
      moveFriendToTop(selectedFriendId, true);
    })
    .catch(error => {
      console.error('Ошибка при отправке сообщения:', error);
      showErrorNotification('Не удалось отправить сообщение. Попробуйте еще раз.');
      
      // Удаляем из списка ожидающих
      messagesPendingDisplay.delete(messageId);
    });
  
  // Сбрасываем статус "печатает"
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  updateTypingStatus(false);
  
  // После добавления сообщения обновляем индикатор даты
  setupScrollDateIndicator(messagesContainer);
}

// Функция для показа уведомления об ошибке
function showErrorNotification(message) {
  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.className = 'error-notification';
  notification.textContent = message;
  
  // Добавляем стили для уведомления, если их нет в CSS
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.padding = '10px 15px';
  notification.style.backgroundColor = '#f44336';
  notification.style.color = 'white';
  notification.style.borderRadius = '4px';
  notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  notification.style.zIndex = '1000';
  
  // Добавляем в DOM
  document.body.appendChild(notification);
  
  // Удаляем через 3 секунды
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s ease';
    setTimeout(() => {
      notification.remove();
    }, 500);
  }, 3000);
}

// Функция для добавления CSS-стилей для лучшего отображения последних сообщений и пагинации
function addLastMessageStyles() {
  // Проверяем, не добавлены ли уже стили
  if (document.getElementById('last-message-adaptive-styles')) return;
  
  // Создаем элемент стиля
  const styleEl = document.createElement('style');
  styleEl.id = 'last-message-adaptive-styles';
  
  // Устанавливаем стили для адаптивного отображения последних сообщений и пагинации
  styleEl.textContent = `
    .friend-item-message {
      overflow: hidden;
    }
    
    .friend-info {
      flex: 1;
      min-width: 0; /* Важно для работы text-overflow в flex-потомках */
      overflow: hidden;
    }
    
    .last-message {
      width: 100%;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: #888;
      font-size: 0.85em;
    }
    
    .last-message-text {
      display: inline-block;
      max-width: calc(100% - 30px); /* Оставляем место для индикатора */
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    
    .last-message {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .typing-status {
      color: var(--primary-color, #5d33f6);
      font-style: italic;
      display: flex;
      align-items: center;
    }
    
    /* Новый стиль для внутреннего div с анимацией */
    .typing-inner-status {
      color: var(--primary-color, #5d33f6);
      font-style: italic;
      display: flex;
      align-items: center;
      width: 100%;
    }
    
    .typing-text {
      display: inline-block;
    }
    
    .unread-indicator {
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      background-color: var(--primary-color, #5d33f6);
      color: white;
      font-size: 0.8em;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 5px;
      font-weight: bold;
      padding: 0 5px;
    }
    
    /* Стили для пагинации сообщений */
    .load-more-messages {
      text-align: center;
      padding: 8px;
      color: #888;
      font-size: 0.85em;
      background-color: var(--bg-tertiary, rgba(0, 0, 0, 0.03));
      border-radius: 12px;
      margin: 8px 0;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    
    .load-more-messages:hover {
      opacity: 1;
    }
    
    .loading-older-messages {
      text-align: center;
      padding: 10px;
      color: #888;
      font-size: 0.85em;
    }
    
    .all-messages-loaded {
      text-align: center;
      padding: 8px;
      color: #888;
      font-size: 0.85em;
      background-color: var(--bg-tertiary, rgba(0, 0, 0, 0.03));
      border-radius: 12px;
      margin: 8px 0;
    }
    
    /* Анимация для индикатора "печатает..." */
    .typing-dots {
      display: inline-block;
      overflow: hidden;
      vertical-align: bottom;
      animation: typingDots 1.5s infinite;
      width: 15px;
      height: 1.2em;
    }
    
    .typing-dots::after {
      content: "....";
      display: inline-block;
    }
    
    @keyframes typingDots {
      0% { width: 2px; }
      20% { width: 5px; }
      40% { width: 10px; }
      60% { width: 15px; }
      80% { width: 10px; }
      100% { width: 2px; }
    }
    
    /* Стили для контейнера сообщений */
    .messages-container {
      height: calc(100vh - 25px);
      position: relative; /* Для позиционирования плавающего индикатора */
    }
    
    /* Стили для плавающего индикатора даты */
    .floating-date-indicator {
      position: absolute;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background-color: var(--bg-secondary, rgba(248, 249, 250, 0.9));
      color: var(--text-secondary, #666);
      padding: 4px 12px;
      border-radius: 18px;
      font-size: 0.85em;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease, transform 0.2s ease;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      font-weight: 500;
      border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
      transform: translateX(-50%) translateY(-10px);
    }
    
    .floating-date-indicator.visible {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }
    
    .floating-date-indicator.update-animation {
      animation: dateUpdatePulse 0.4s ease;
    }
    
    @keyframes dateUpdatePulse {
      0% { transform: translateX(-50%) scale(1); }
      50% { transform: translateX(-50%) scale(1.05); }
      100% { transform: translateX(-50%) scale(1); }
    }
    
    /* Добавляем стили для темного режима */
    .dark-mode .floating-date-indicator {
      background-color: var(--dark-bg-secondary, rgba(44, 44, 44, 0.9));
      color: var(--dark-text-secondary, #bbb);
      border-color: var(--dark-border-color, rgba(255, 255, 255, 0.1));
    }
    
    /* Стили для разделителя даты */
    .date-divider {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 10px 0;
      position: relative;
      text-align: center;
    }
    
    /* Стили для видео в сообщениях */
    .message-videos {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 5px;
      width: 100%;
      max-width: 280px;
    }
    
    .message-video-wrapper {
      position: relative;
      width: 100%;
      max-width: 100%;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
    }
    
    .message-video-wrapper .video-container {
      position: relative;
      width: 350px;
      max-width: 100%;
      height: 0;
      padding-bottom: 56.25%; /* Соотношение сторон 16:9 */
      overflow: hidden;
      border-radius: 8px;
    }
    
    .message-video-wrapper .video-container video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    }
    
    .message-video-wrapper .video-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    
    .message-video-wrapper .video-overlay::before {
      content: '';
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>');
      background-repeat: no-repeat;
      background-position: center;
      background-size: 40px;
      width: 50px;
      height: 50px;
      opacity: 0.9;
    }
    
    /* Стили для разного количества видео */
    .message-videos.count-1 .message-video-wrapper {
      width: 100%;
    }
    
    .message-videos.count-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    
    .message-videos.count-2 .message-video-wrapper {
      width: 100%;
    }
    
    .message-videos.count-3 {
      display: grid;
      grid-template-areas: 
        "vid1 vid2"
        "vid3 vid3";
      grid-template-columns: 1fr 1fr;
    }
    
    .message-videos.count-3 .message-video-wrapper:nth-child(1) {
      grid-area: vid1;
    }
    
    .message-videos.count-3 .message-video-wrapper:nth-child(2) {
      grid-area: vid2;
    }
    
    .message-videos.count-3 .message-video-wrapper:nth-child(3) {
      grid-area: vid3;
    }
    
    .message-videos.count-4 {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    
    @media (max-width: 768px) {
      .message-videos {
        max-width: 260px;
      }
      
      .message-videos.count-1 {
        max-width: 240px;
      }
    }
    
    /* Стили для контейнера видео в прикреплениях */
    .attachment-item .video-container {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 120px;
      overflow: hidden;
      border-radius: 8px;
    }
    
    .attachment-item .video-container video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .attachment-item .video-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
      cursor: pointer;
    }
    
    .attachment-item .video-overlay::before {
      content: '';
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>');
      background-repeat: no-repeat;
      background-position: center;
      background-size: 30px;
      width: 40px;
      height: 40px;
      opacity: 0.9;
      margin-bottom: 35px;
      display: none; /* Скрываем по умолчанию */
    }
    
    /* Показываем кнопку воспроизведения только для загруженных видео */
    .attachment-item.uploaded .video-overlay::before {
      display: block;
    }
    
    /* Скрываем иконку плей при воспроизведении */
    .attachment-item .video-playing .video-overlay::before {
      display: none;
    }
    
    .date-divider::before, 
    .date-divider::after {
      content: "";
      flex: 1;
      border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
      margin: 0 10px;
    }
    
    .date-divider span {
      background-color: var(--bg-secondary, #f8f9fa);
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 0.85em;
      color: var(--text-secondary, #666);
      white-space: nowrap;
    }
    
    /* Добавляем стили для темного режима */
    .dark-mode .date-divider span {
      background-color: var(--dark-bg-secondary, #2c2c2c);
      color: var(--dark-text-secondary, #bbb);
    }
    
    /* Адаптация для разных размеров экрана */
    @media (max-width: 768px) {
      .messages-container {
        height: calc(100vh - 65px);
      }
      
      .date-divider {
        margin: 8px 0;
      }
      
      .date-divider span {
        font-size: 0.8em;
        padding: 1px 8px;
      }
      
      .floating-date-indicator {
        top: 40px; /* Адаптировано для мобильных устройств */
        padding: 3px 10px;
        font-size: 0.8em;
      }
    }
    
    /* Адаптация для разных размеров экрана */
    @media (max-width: 480px) {
      .friend-name span {
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
      }
      
      .last-message-time {
        font-size: 0.75em;
      }
      
      .load-more-messages,
      .loading-older-messages,
      .all-messages-loaded {
        font-size: 0.75em;
        padding: 6px;
      }
      
      .date-divider span {
        font-size: 0.75em;
        padding: 1px 6px;
      }
      
      .floating-date-indicator {
        top: 80px; /* Адаптировано для маленьких экранов */
        padding: 2px 8px;
        font-size: 0.75em;
        border-radius: 12px;
      }
    }
    
    @media (max-width: 320px) {
      .friend-name span {
        max-width: 100px;
      }
      
      .floating-date-indicator {
        max-width: 80%;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }
    }
  `;
  
  // Добавляем стили в head
  document.head.appendChild(styleEl);
  console.log('Добавлены адаптивные стили для отображения последних сообщений и пагинации');
}

// Функция для проверки статуса уведомлений для чата
async function checkNotificationsMuteStatus(friendId) {
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Ошибка: отсутствуют идентификаторы для проверки статуса уведомлений');
    return false;
  }
  
  const db = getDatabase();
  const muteStatusRef = ref(db, `userSettings/${currentUser.uid}/mutedChats/${friendId}`);
  
  try {
    const snapshot = await get(muteStatusRef);
    return snapshot.exists() && snapshot.val() === true;
  } catch (error) {
    console.error('Ошибка при проверке статуса уведомлений:', error);
    return false;
  }
}

// Функция для переключения статуса уведомлений
async function toggleNotificationsMuteStatus(friendId) {
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Ошибка: отсутствуют идентификаторы для изменения статуса уведомлений');
    return;
  }
  
  const db = getDatabase();
  const muteStatusRef = ref(db, `userSettings/${currentUser.uid}/mutedChats/${friendId}`);
  
  try {
    // Получаем текущий статус
    const snapshot = await get(muteStatusRef);
    const isMuted = snapshot.exists() && snapshot.val() === true;
    
    // Устанавливаем противоположный статус
    await set(muteStatusRef, !isMuted);
    
    // Обновляем UI кнопки в заголовке чата
    const notificationToggle = document.getElementById('notification-toggle');
    if (notificationToggle) {
      const icon = notificationToggle.querySelector('i');
      if (icon) {
        if (isMuted) {
          // Включаем уведомления
          icon.classList.remove('fa-bell-slash');
          icon.classList.remove('fa-solid');
          icon.classList.add('fas');
          icon.classList.add('fa-bell');
          notificationToggle.title = 'Отключить уведомления';
        } else {
          // Отключаем уведомления
          icon.classList.remove('fas');
          icon.classList.remove('fa-bell');
          icon.classList.add('fa-solid');
          icon.classList.add('fa-bell-slash');
          notificationToggle.title = 'Включить уведомления';
        }
      }
    }
    
    // Обновляем индикатор в списке друзей
    const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
    if (friendElement) {
      const mutedIndicator = friendElement.querySelector('.muted-indicator');
      if (mutedIndicator) {
        mutedIndicator.style.display = !isMuted ? 'block' : 'none';
      }
    }
    
    // Показываем уведомление о смене статуса
    const notificationMessage = isMuted 
      ? 'Уведомления для этого чата включены' 
      : 'Уведомления для этого чата отключены';
    
    showStatusNotification(notificationMessage);
  } catch (error) {
    console.error('Ошибка при изменении статуса уведомлений:', error);
    showStatusNotification('Не удалось изменить настройки уведомлений');
  }
}

// Функция для отображения статусного уведомления
function showStatusNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'success-message';
  
  notification.innerHTML = `
    <i class="fas fa-check-circle"></i>
    <span style="margin-left: 10px">${message}</span>
  `;
  
  document.body.appendChild(notification);

  // Удаляем через 3 секунды
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Новая функция для перемещения элемента друга в начало списка
function moveFriendToTop(friendId, forceMove = false) {
  // Проверяем, не был ли этот друг выбран из списка друзей (при клике на элемент)
  // Если друг был выбран через клик, а не из-за нового сообщения, не перемещаем его
  // Однако если указан флаг forceMove, то перемещаем в любом случае (для отправки сообщений)
  const selectedElement = document.querySelector(`.friend-item-message.active`);
  if (!forceMove && selectedElement && selectedElement.dataset.friendId === friendId) {
    console.log(`Друг ${friendId} выбран через клик, пропускаем перемещение в начало списка`);
    return;
  }
  
  const friendsItemsContainer = document.getElementById('friends-items-container');
  const friendElement = document.querySelector(`.friend-item-message[data-friend-id="${friendId}"]`);
  
  if (friendsItemsContainer && friendElement) {
    // Проверяем, не находится ли элемент уже в начале списка
    if (friendsItemsContainer.firstChild !== friendElement) {
      console.log(`Перемещаем друга ${friendId} в начало списка`);
      
      // Сохраняем информацию о том, был ли этот элемент активным
      const wasActive = friendElement.classList.contains('active');
      
      // Удаляем элемент из текущей позиции
      friendsItemsContainer.removeChild(friendElement);
      
      // Добавляем элемент в начало списка
      if (friendsItemsContainer.firstChild) {
        friendsItemsContainer.insertBefore(friendElement, friendsItemsContainer.firstChild);
      } else {
        friendsItemsContainer.appendChild(friendElement);
      }
      
      // Добавляем класс для анимации
      friendElement.classList.add('new-message');
      
      // Если элемент был активным, восстанавливаем этот статус
      if (wasActive) {
        friendElement.classList.add('active');
      }
      
      // Удаляем класс анимации через некоторое время
      setTimeout(() => {
        friendElement.classList.remove('new-message');
      }, 500);
    }
  }
}

// Инициализация системы выбора сообщений
function initializeMessageSelectionSystem() {
  // Находим необходимые элементы
  const selectionToolbar = document.getElementById('message-selection-toolbar');
  const selectedCountEl = document.getElementById('selected-count');
  const cancelSelectionBtn = document.getElementById('cancel-selection-btn');
  const copyMessagesBtn = document.getElementById('copy-messages-btn');
  const replyMessagesBtn = document.getElementById('reply-messages-btn');
  const deleteMessagesBtn = document.getElementById('delete-messages-btn');
  const deleteModalOverlay = document.getElementById('delete-modal-overlay');
  const deleteModalTitle = document.getElementById('delete-modal-title');
  const deleteModalMessage = document.getElementById('delete-modal-message');
  const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
  const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

  // Обработчик нажатия на кнопку отмены выбора
  cancelSelectionBtn.addEventListener('click', clearMessageSelection);

  // Обработчик нажатия на кнопку копирования сообщений
  copyMessagesBtn.addEventListener('click', copySelectedMessages);

  // Обработчик нажатия на кнопку ответа на сообщения
  replyMessagesBtn.addEventListener('click', replyToSelectedMessage);

  // Обработчик нажатия на кнопку удаления сообщений
  deleteMessagesBtn.addEventListener('click', showDeleteConfirmation);

  // Обработчики для модального окна подтверждения удаления
  cancelDeleteBtn.addEventListener('click', () => hideDeleteModal());
  confirmDeleteBtn.addEventListener('click', deleteSelectedMessages);
  
  // Обработчик клика вне модального окна для его закрытия
  deleteModalOverlay.addEventListener('click', (event) => {
    // Если клик был на самом overlay, а не на его дочерних элементах
    if (event.target === deleteModalOverlay) {
      hideDeleteModal();
    }
  });
  
  // Делегирование событий для контейнера сообщений
  const chatMessagesContainer = document.getElementById('chat-messages');
  chatMessagesContainer.addEventListener('click', handleMessageClick);
}

// Обработчик клика по сообщению
function handleMessageClick(event) {
  // Проверяем, был ли клик по изображению или его обёртке
  if (event.target.closest('.message-image-wrapper') || 
      event.target.closest('.message-image') || 
      event.target.tagName === 'IMG') {
    // Игнорируем клики на изображениях
    return;
  }
  
  // Проверяем, был ли клик по цитате (реплике)
  if (event.target.closest('.message-reply-to')) {
    // Клик по цитате обрабатывается в другом обработчике
    return;
  }
  
  // Проверяем, был ли клик по содержимому сообщения
  const messageContent = event.target.closest('.message-content');
  if (!messageContent) return;
  
  // Находим элемент сообщения
  const messageElement = messageContent.closest('.message');
  if (!messageElement) return;
  
  // Получаем ID сообщения
  const messageId = messageElement.getAttribute('data-message-id');
  if (!messageId) return;
  
  // Получаем объект сообщения из атрибута data-message-object (должен быть установлен при создании сообщения)
  let messageObject;
  try {
    messageObject = JSON.parse(messageElement.getAttribute('data-message-object'));
  } catch (error) {
    console.error('Ошибка при получении объекта сообщения:', error);
    return;
  }
  
  // Переключаем выбор сообщения
  toggleMessageSelection(messageElement, messageId, messageObject);
}

// Функция для переключения выбора сообщения
function toggleMessageSelection(messageElement, messageId, messageObject) {
  // Проверяем, выбрано ли уже это сообщение
  if (selectedMessages.has(messageId)) {
    // Убираем сообщение из выбранных
    selectedMessages.delete(messageId);
    messageElement.classList.remove('selected');
  } else {
    // Добавляем сообщение в выбранные
    selectedMessages.set(messageId, messageObject);
    messageElement.classList.add('selected');
    
    // Если это первое выбранное сообщение, активируем режим выбора
    if (!isSelectionMode) {
      activateSelectionMode();
    }
  }
  
  // Если нет выбранных сообщений, деактивируем режим выбора
  if (selectedMessages.size === 0 && isSelectionMode) {
    deactivateSelectionMode();
  }
  
  // Обновляем счетчик выбранных сообщений
  updateSelectedCount();
}

// Активация режима выбора сообщений
function activateSelectionMode() {
  isSelectionMode = true;
  const selectionToolbar = document.getElementById('message-selection-toolbar');
  selectionToolbar.classList.add('active');
  
  // Убираем блокировку поля ввода сообщений
  // document.getElementById('message-input').disabled = true;
  // document.getElementById('send-button').disabled = true;
}

// Деактивация режима выбора сообщений
function deactivateSelectionMode() {
  isSelectionMode = false;
  const selectionToolbar = document.getElementById('message-selection-toolbar');
  selectionToolbar.classList.remove('active');
  
  // Убираем эти строки, так как поле ввода не блокируется
  // document.getElementById('message-input').disabled = false;
  // document.getElementById('send-button').disabled = false;
}

// Обновление счетчика выбранных сообщений
function updateSelectedCount() {
  const selectedCount = selectedMessages.size;
  const countElement = document.getElementById('selected-count');
  const replyButton = document.getElementById('reply-messages-btn');
  const copyButton = document.getElementById('copy-messages-btn');
  const deleteButton = document.getElementById('delete-messages-btn');
  
  if (countElement) {
    // Обновляем текст счетчика с правильным склонением
    let messageForm;
    if (selectedCount === 1) {
      messageForm = 'сообщение';
    } else if (selectedCount >= 2 && selectedCount <= 4) {
      messageForm = 'сообщения';
  } else {
      messageForm = 'сообщений';
  }
  
    countElement.textContent = `${selectedCount} ${messageForm} выбрано`;
  }
  
  // Обновляем состояние кнопок
  if (replyButton) {
    // Кнопка ответа активна, если выбрано хотя бы одно сообщение
    replyButton.disabled = selectedCount === 0;
  
    // Обновляем title для кнопки в зависимости от состояния
    if (selectedCount === 0) {
      replyButton.title = 'Выберите сообщение для ответа';
    } else if (selectedCount === 1) {
      replyButton.title = 'Ответить на сообщение';
    } else {
      replyButton.title = `Ответить на ${selectedCount} сообщения`;
    }
  }
  
  if (copyButton) {
    // Кнопка копирования активна только если выбрано хотя бы одно сообщение
    copyButton.disabled = selectedCount === 0;
  }
  
  if (deleteButton) {
    // Кнопка удаления активна только если выбрано хотя бы одно сообщение
    deleteButton.disabled = selectedCount === 0;
  }
}

// Очистка выбора сообщений
function clearMessageSelection() {
  // Убираем класс selected со всех выбранных сообщений
  selectedMessages.forEach((_, id) => {
    const messageElement = document.querySelector(`.message[data-message-id="${id}"]`);
    if (messageElement) {
      messageElement.classList.remove('selected');
    }
  });
  
  // Очищаем Map выбранных сообщений
  selectedMessages.clear();
  
  // Деактивируем режим выбора
  deactivateSelectionMode();
}

// Копирование выбранных сообщений в буфер обмена
function copySelectedMessages() {
  // Получаем массив текстов сообщений
  const messagesToCopy = [];
  
  // Сортируем сообщения по времени (от раннего к позднему)
  const sortedMessages = Array.from(selectedMessages.values())
    .sort((a, b) => a.timestamp - b.timestamp);
  
  // Собираем тексты сообщений
  sortedMessages.forEach(message => {
    messagesToCopy.push(message.text);
  });
  
  // Объединяем тексты сообщений с разделителем новой строки
  const textToCopy = messagesToCopy.join('\n');
  
  // Копируем в буфер обмена
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      // Показываем уведомление об успешном копировании
      showStatusNotification('Сообщения скопированы в буфер обмена');
      
      // Очищаем выбор сообщений
      clearMessageSelection();
    })
    .catch(error => {
      console.error('Ошибка при копировании в буфер обмена:', error);
      showErrorNotification('Не удалось скопировать сообщения');
    });
}

// Ответ на выбранное сообщение
function replyToSelectedMessage() {
  // Проверяем, что выбрано хотя бы одно сообщение
  if (selectedMessages.size === 0) {
    showErrorNotification('Выберите сообщение для ответа');
    return;
  }
  
  // Получаем все выбранные сообщения в виде массива
  const selectedMessagesArray = Array.from(selectedMessages.entries()).map(([messageId, messageObject]) => {
    // Создаем базовый объект с обязательными полями
    const messageData = {
      messageId: messageId,
      text: messageObject.text || '',
      senderId: messageObject.senderId
    };
    
    // Добавляем информацию об изображениях, если они есть
    try {
      // Проверяем, есть ли в атрибуте data-message-object информация об изображениях
      const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
        // Получаем все изображения внутри элемента сообщения
        const imageElements = messageElement.querySelectorAll('.message-image, .message-image-wrapper img');
        if (imageElements && imageElements.length > 0) {
          // Собираем URL изображений
          const imageUrls = Array.from(imageElements).map(img => img.src);
          if (imageUrls.length > 0) {
            messageData.imageUrls = imageUrls;
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при получении информации об изображениях:', error);
    }
    
    // Добавляем информацию о видео, если они есть
    try {
      // Проверяем, есть ли в атрибуте data-message-object информация о видео
      const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
        // Получаем все видео внутри элемента сообщения
        const videoElements = messageElement.querySelectorAll('.message-video, .message-video-wrapper video');
        if (videoElements && videoElements.length > 0) {
          // Собираем URL видео
          const videoUrls = Array.from(videoElements).map(video => video.src);
          if (videoUrls.length > 0) {
            messageData.videoUrls = videoUrls;
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при получении информации о видео:', error);
    }
    
    return messageData;
  });
  
  // Сохраняем информацию о сообщениях, на которые отвечаем, в localStorage
  localStorage.setItem('replyingTo', JSON.stringify(selectedMessagesArray));
  
  // Показываем интерфейс ответа на сообщения
  showReplyInterface(selectedMessagesArray);
  
  // Фокусируемся на поле ввода
  const messageInput = document.getElementById('message-input');
  messageInput.focus();
  
  // Очищаем выбор сообщений
  clearMessageSelection();
}

// Функция для отображения интерфейса ответа
function showReplyInterface(replyInfo) {
  // Проверяем существует ли уже панель ответа
  let replyPanel = document.getElementById('reply-panel');
  if (!replyPanel) {
    replyPanel = document.createElement('div');
    replyPanel.id = 'reply-panel';
    replyPanel.className = 'reply-panel';
    
    // Добавляем панель в специальный контейнер перед полем ввода
    const replyPanelContainer = document.getElementById('reply-panel-container');
    replyPanelContainer.innerHTML = ''; // Очищаем контейнер
    replyPanelContainer.appendChild(replyPanel);
  }
  
  // Создаем скроллируемый контейнер для содержимого
  const scrollableDiv = document.createElement('div');
  scrollableDiv.className = 'reply-content-scrollable';
  
  // Проверяем, является ли replyInfo массивом сообщений или одним сообщением
  const repliesArray = Array.isArray(replyInfo) ? replyInfo : [replyInfo];
  
  // Создаем элементы для всех цитат и добавляем их в content
  const replyContent = document.createElement('div');
  replyContent.className = 'reply-content';
  
  // Для каждой цитаты создаем свой элемент с кнопкой удаления
  repliesArray.forEach(reply => {
    // Получаем имя отправителя цитируемого сообщения
    let senderName = 'Собеседник';
    if (reply.senderId === currentUser.uid) {
      senderName = 'Вы';
    } else if (friendsData[reply.senderId] && friendsData[reply.senderId].name) {
      senderName = friendsData[reply.senderId].name;
    }
    
    // Обрезаем текст сообщения, если он слишком длинный
    const maxTextLength = 40;
    let displayText = reply.text || '';
    if (displayText.length > maxTextLength) {
      displayText = displayText.substring(0, maxTextLength) + '...';
    }
    
    // Проверяем наличие изображений
    let imageIndicator = '';
    if (reply.imageUrls && reply.imageUrls.length > 0) {
      imageIndicator = `<div class="reply-image-indicator">${pluralizeImages(reply.imageUrls.length)}</div>`;
    }
    
    // Проверяем наличие видео
    let videoIndicator = '';
    if (reply.videoUrls && reply.videoUrls.length > 0) {
      videoIndicator = `<div class="reply-video-indicator">${pluralizeVideos(reply.videoUrls.length)}</div>`;
    }
    
    // Создаем контейнер для цитаты
    const quoteContainer = document.createElement('div');
    quoteContainer.className = 'reply-quote-container';
    quoteContainer.dataset.messageId = reply.messageId;
    
    // Добавляем содержимое цитаты и кнопку удаления
    quoteContainer.innerHTML = `
      <div class="reply-quote" data-message-id="${reply.messageId}">
        <div class="reply-sender">${senderName}</div>
        <div class="reply-text">
          ${displayText}
          ${imageIndicator}
          ${videoIndicator}
        </div>
      </div>
      <button class="quote-cancel-btn" title="Удалить цитату">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // Добавляем обработчик для кнопки удаления этой цитаты
    const cancelBtn = quoteContainer.querySelector('.quote-cancel-btn');
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Предотвращаем всплытие события
      removeQuote(reply.messageId);
    });
    
    // Добавляем цитату в контейнер
    replyContent.appendChild(quoteContainer);
  });
  
  // Добавляем контент в скроллируемый контейнер
  scrollableDiv.appendChild(replyContent);
  
  // Если нет цитат, скрываем панель ответа
  if (repliesArray.length === 0) {
    cancelReply();
    return;
  }
  
  // Очищаем панель и добавляем новые элементы
  replyPanel.innerHTML = '';
  replyPanel.appendChild(scrollableDiv);
}

// Функция для удаления конкретной цитаты по ID сообщения
function removeQuote(messageId) {
  const replyPanel = document.getElementById('reply-panel');
  if (!replyPanel) return;
  
  // Находим контейнер цитаты по ID сообщения
  const quoteContainer = replyPanel.querySelector(`.reply-quote-container[data-message-id="${messageId}"]`);
  if (quoteContainer) {
    // Удаляем контейнер цитаты
    quoteContainer.remove();
    
    // Проверяем, остались ли еще цитаты
    const remainingQuotes = replyPanel.querySelectorAll('.reply-quote-container');
    if (remainingQuotes.length === 0) {
      // Если цитат больше нет, удаляем всю панель ответа
      cancelReply();
    }
  }
}

// Функция для отмены ответа
function cancelReply() {
  localStorage.removeItem('replyingTo');
  
  // Очищаем контейнер с панелью ответа
  const replyPanelContainer = document.getElementById('reply-panel-container');
  if (replyPanelContainer) {
    replyPanelContainer.innerHTML = '';
  }
}

// Показ модального окна подтверждения удаления
function showDeleteConfirmation() {
  const count = selectedMessages.size;
  if (count === 0) return;
  
  const deleteModalOverlay = document.getElementById('delete-modal-overlay');
  const deleteModalTitle = document.getElementById('delete-modal-title');
  const deleteModalMessage = document.getElementById('delete-modal-message');
  
  // Формируем правильное склонение слова "сообщение"
  let messageForm;
  if (count === 1) {
    messageForm = 'сообщения';
  } else if (count >= 2 && count <= 4) {
    messageForm = 'сообщений';
  } else {
    messageForm = 'сообщений';
  }
  
  // Устанавливаем заголовок в зависимости от количества выбранных сообщений
  deleteModalTitle.textContent = `Удаление ${count} ${messageForm}`;
  
  // Устанавливаем текст сообщения
  if (count === 1) {
    deleteModalMessage.textContent = 'Вы уверены, что хотите удалить это сообщение?';
  } else {
    deleteModalMessage.textContent = `Вы уверены, что хотите удалить эти ${count} сообщения?`;
  }
  
  // Показываем модальное окно
  deleteModalOverlay.classList.add('active');
}

// Скрытие модального окна подтверждения удаления
function hideDeleteModal() {
  const deleteModalOverlay = document.getElementById('delete-modal-overlay');
  deleteModalOverlay.classList.remove('active');
}

// Удаление выбранных сообщений
async function deleteSelectedMessages() {
  if (selectedMessages.size === 0) {
    hideDeleteModal();
    return;
  }
  
  try {
    // Получаем ID текущего чата
    const chatId = getChatId(currentUser.uid, selectedFriendId);
    
    // Получаем ссылку на базу данных
    const database = getDatabase();
    
    // Получаем массив обещаний для удаления каждого сообщения
    const deletePromises = [];
    
    // Сохраняем ID сообщений для удаления из DOM
    const messageIdsToRemove = [];
    
    selectedMessages.forEach((message, messageId) => {
      // Добавляем ID в список для удаления из DOM
      messageIdsToRemove.push(messageId);
      
      // Всегда полностью удаляем сообщение из базы данных
      deletePromises.push(set(ref(database, `chats/${chatId}/messages/${messageId}`), null));
    });
    
    // Ждем завершения всех операций удаления
    await Promise.all(deletePromises);
    
    // Удаляем элементы сообщений из DOM
    messageIdsToRemove.forEach(messageId => {
      const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
      if (messageElement) {
        // Анимация исчезновения и удаление
        messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'scale(0.8)';
        
        // Удаляем элемент после завершения анимации
        setTimeout(() => {
          if (messageElement.parentNode) {
            messageElement.parentNode.removeChild(messageElement);
          }
        }, 300);
      }
    });
    
    // Показываем уведомление об успешном удалении
    const count = selectedMessages.size;
    let messageForm;
    if (count === 1) {
      messageForm = 'Сообщение';
    } else {
      messageForm = 'Сообщения';
    }
    
    showStatusNotification(`${messageForm} успешно удалены`);
    
    // Проверяем, остались ли сообщения в чате
    checkIfChatIsEmpty(chatId);
    
    // Очищаем выбор сообщений
    clearMessageSelection();
    
    // Скрываем модальное окно
    hideDeleteModal();
  } catch (error) {
    console.error('Ошибка при удалении сообщений:', error);
    showErrorNotification('Не удалось удалить сообщения');
    
    // Скрываем модальное окно
    hideDeleteModal();
  }
}

// Функция для проверки, пуст ли чат после удаления сообщений
async function checkIfChatIsEmpty(chatId) {
  const database = getDatabase();
  const messagesRef = ref(database, `chats/${chatId}/messages`);
  const messagesContainer = document.getElementById('chat-messages');
  
  try {
    // Получаем все оставшиеся сообщения
    const snapshot = await get(messagesRef);
    
    if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
      console.log('Чат пуст, показываем empty-chat');
      
      // Чат пуст, отображаем empty-chat
      messagesContainer.innerHTML = '<div class="empty-chat">Нет сообщений.<br>Начните общение прямо сейчас!</div>';
      
      // Скрываем индикатор даты
      const floatingDateIndicator = document.querySelector('.floating-date-indicator');
      if (floatingDateIndicator) {
        floatingDateIndicator.classList.remove('visible', 'update-animation');
      }
      
      // Скрываем все разделители дат
      const dateDividers = document.querySelectorAll('.date-divider');
      dateDividers.forEach(divider => {
        divider.style.display = 'none';
      });
      
      // Обновляем текст последнего сообщения в списке чатов
      if (selectedFriendId) {
        const friendItemMessage = document.querySelector(`.friend-item-message[data-friend-id="${selectedFriendId}"]`);
        if (friendItemMessage) {
          const lastMessageEl = friendItemMessage.querySelector('.last-message');
          if (lastMessageEl) {
            lastMessageEl.textContent = 'Нет сообщений';
            lastMessageEl.classList.add('no-messages');
          }
        }
        
        // Также обновляем последнее сообщение в базе данных для обоих пользователей
        updateEmptyLastMessageInDatabase(chatId);
      }
    }
  } catch (error) {
    console.error('Ошибка при проверке пустоты чата:', error);
  }
}

// Функция для обновления информации о последнем сообщении в базе данных
async function updateEmptyLastMessageInDatabase(chatId) {
  if (!currentUser || !selectedFriendId) return;
  
  const database = getDatabase();
  
  try {
    // Обновляем последнее сообщение для текущего пользователя
    const userLastMessageRef = ref(database, `users/${currentUser.uid}/lastMessages/${selectedFriendId}`);
    await set(userLastMessageRef, {
      text: 'Нет сообщений',
      timestamp: serverTimestamp(),
      type: 'empty'
    });
    
    // Обновляем последнее сообщение для собеседника
    const friendLastMessageRef = ref(database, `users/${selectedFriendId}/lastMessages/${currentUser.uid}`);
    await set(friendLastMessageRef, {
      text: 'Нет сообщений',
      timestamp: serverTimestamp(),
      type: 'empty'
    });
    
    console.log('Информация о пустом чате обновлена в базе данных для обоих пользователей');
  } catch (error) {
    console.error('Ошибка при обновлении информации о пустом чате:', error);
  }
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

// Функция для проверки необходимости удаления разделителя непрочитанных сообщений
function checkUnreadDivider(removedMessageElement, messagesContainer) {
  // Проверяем наличие разделителя непрочитанных сообщений
  const unreadDivider = messagesContainer.querySelector('#unread-messages-divider');
  if (!unreadDivider) return; // Разделителя нет, выходим
  
  // Получаем позицию разделителя
  const dividerPosition = unreadDivider.offsetTop;
  
  // Находим все сообщения в контейнере
  const allMessages = Array.from(messagesContainer.querySelectorAll('.message'));
  
  // Находим сообщения после разделителя и проверяем, принадлежат ли они собеседнику
  const unreadMessages = allMessages.filter(msg => {
    // Проверяем, находится ли сообщение после разделителя
    const isAfterDivider = msg.offsetTop > dividerPosition;
    
    // Проверяем, принадлежит ли сообщение собеседнику 
    // (непрочитанными могут быть только входящие сообщения)
    const isIncoming = !msg.classList.contains('outgoing');
    
    return isAfterDivider && isIncoming;
  });
  
  // Если после разделителя не осталось непрочитанных сообщений, удаляем разделитель
  if (unreadMessages.length === 0) {
    console.log('Все непрочитанные сообщения удалены, удаляем разделитель');
    
    // Анимация исчезновения разделителя
    unreadDivider.style.transition = 'opacity 0.3s, transform 0.3s';
    unreadDivider.style.opacity = '0';
    unreadDivider.style.transform = 'translateY(-10px)';
    
    // Удаляем разделитель после завершения анимации
    setTimeout(() => {
      if (unreadDivider.parentNode) {
        unreadDivider.parentNode.removeChild(unreadDivider);
      }
    }, 300);
  } else {
    console.log(`Осталось ${unreadMessages.length} непрочитанных сообщений после разделителя`);
  }
}

// Функция для очистки поля поиска
function clearSearchMessages() {
  const searchInput = document.getElementById('search-messages-input');
  const clearButton = document.getElementById('search-messages-clear');
  const resultsContainer = document.getElementById('search-results-container');
  
  searchInput.value = '';
  clearButton.classList.remove('visible');
  resultsContainer.classList.remove('active');
  resultsContainer.innerHTML = '';
  
  // Убираем выделение найденных сообщений
  clearMessageHighlighting();
  
  searchResults = [];
  currentSearchIndex = -1;
}

// Функция для снятия выделения с сообщений
function clearMessageHighlighting() {
  document.querySelectorAll('.message .search-result-highlight').forEach(el => {
    const textNode = document.createTextNode(el.textContent);
    el.parentNode.replaceChild(textNode, el);
  });
  
  document.querySelectorAll('.message.search-highlighted').forEach(message => {
    message.classList.remove('search-highlighted');
  });
}

// Функция для поиска сообщений
function searchMessages(query) {
  if (!query || !selectedFriendId) return;
  
  query = query.toLowerCase().trim();
  
  // Очищаем предыдущие результаты
  searchResults = [];
  currentSearchIndex = -1;
  
  const messagesContainer = document.getElementById('chat-messages');
  const messages = messagesContainer.querySelectorAll('.message');
  
  // Перебираем все сообщения
  messages.forEach(message => {
    const messageTextElement = message.querySelector('.message-text');
    if (!messageTextElement) return;
    
    const messageText = messageTextElement.textContent.toLowerCase();
    const messageId = message.dataset.id;
    const timestamp = message.dataset.timestamp;
    const isOwn = message.classList.contains('own-message');
    
    // Проверяем, содержит ли сообщение искомый текст
    if (messageText.includes(query)) {
      // Получаем информацию о сообщении
      const messageTime = formatMessageTime(parseInt(timestamp));
      const messageDate = formatMessageDate(parseInt(timestamp));
      
      // Подсвечиваем найденный текст
      const formattedText = highlightSearchText(messageText, query);
      
      // Добавляем сообщение в результаты поиска
      searchResults.push({
        id: messageId,
        text: messageText,
        formattedText: formattedText,
        element: message,
        timestamp: parseInt(timestamp),
        time: messageTime,
        date: messageDate,
        isOwn: isOwn
      });
    }
  });
  
  // Сортируем результаты по дате (от новых к старым)
  searchResults.sort((a, b) => b.timestamp - a.timestamp);
  
  // Отображаем результаты
  displaySearchResults();
}

// Функция для подсветки искомого текста
function highlightSearchText(text, query) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  
  const before = text.substr(0, index);
  const match = text.substr(index, query.length);
  const after = text.substr(index + query.length);
  
  return before + '<mark>' + match + '</mark>' + after;
}

// Функция для отображения результатов поиска
function displaySearchResults() {
  const resultsContainer = document.getElementById('search-results-container');
  resultsContainer.innerHTML = '';
  
  if (searchResults.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
    resultsContainer.classList.add('active');
    return;
  }
  
  // Собираем данные о собеседнике
  const friendId = selectedFriendId;
  const friend = friendsData[friendId];
  const friendName = friend?.name || friend?.email || 'Собеседник';
  const avatarUrl = friend?.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(friendName) + '&background=random';
  const currentUserName = currentUser.displayName || currentUser.email || 'Вы';
  
  // Создаем элементы для каждого результата
  searchResults.forEach((result, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'search-message-result-item';
    resultItem.dataset.index = index;
    
    // Если это собственное сообщение, используем аватар и имя текущего пользователя
    const resultAvatar = result.isOwn 
      ? (currentUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(currentUserName) + '&background=random')
      : avatarUrl;
      
    const senderName = result.isOwn ? currentUserName : friendName;
    
    // Объединяем дату и время в формате "Сегодня, 20:45" или "26.05.2024, 11:11"
    const formattedDateTime = `${result.date}, ${result.time}`;
    
    resultItem.innerHTML = `
      <img src="${resultAvatar}" alt="Avatar" class="search-result-avatar">
      <div class="search-result-content">
        <div class="search-result-header">
          <span class="search-result-sender">${senderName}</span>
          <span class="search-result-time">${formattedDateTime}</span>
        </div>
        <div class="search-result-text">${result.formattedText}</div>
      </div>
    `;
    
    // Добавляем обработчик клика для перемещения к выбранному сообщению
    resultItem.addEventListener('click', function() {
      scrollToMessage(result.element, result.text, index);
    });
    
    resultsContainer.appendChild(resultItem);
  });
  
  // Показываем контейнер с результатами
  resultsContainer.classList.add('active');
}

// Функция для прокрутки к выбранному сообщению
function scrollToMessage(messageElement, messageText, index) {
  // Устанавливаем текущий индекс
  currentSearchIndex = index;
  
  // Убираем предыдущие выделения
  clearMessageHighlighting();
  
  // Прокручиваем до сообщения
  messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Подсвечиваем сообщение
  messageElement.classList.add('search-highlighted');
  
  // Находим текстовый элемент сообщения
  const messageTextElement = messageElement.querySelector('.message-text');
  if (!messageTextElement) return;
  
  // Подсвечиваем искомый текст
  const searchQuery = document.getElementById('search-messages-input').value.toLowerCase().trim();
  if (!searchQuery) return;
  
  const content = messageTextElement.textContent;
  const index2 = content.toLowerCase().indexOf(searchQuery.toLowerCase());
  if (index2 !== -1) {
    const before = content.substring(0, index2);
    const match = content.substring(index2, index2 + searchQuery.length);
    const after = content.substring(index2 + searchQuery.length);
    
    messageTextElement.innerHTML = before + 
      '<span class="search-result-highlight">' + match + '</span>' + 
      after;
  }
  
  // Скрываем результаты поиска
  document.getElementById('search-results-container').classList.remove('active');
}

// Инициализация функциональности поиска
function initializeSearchMessages() {
  const searchInput = document.getElementById('search-messages-input');
  const clearButton = document.getElementById('search-messages-clear');
  const closeButton = document.getElementById('search-messages-close');
  
  // Обработчик ввода текста
  searchInput.addEventListener('input', function() {
    if (this.value.trim() !== '') {
      clearButton.classList.add('visible');
      searchMessages(this.value.trim());
    } else {
      clearButton.classList.remove('visible');
      document.getElementById('search-results-container').classList.remove('active');
    }
  });
  
  // Обработчик нажатия Enter для быстрого перехода к первому результату
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && searchResults.length > 0) {
      scrollToMessage(searchResults[0].element, searchResults[0].text, 0);
    }
  });
  
  // Обработчик очистки поиска
  clearButton.addEventListener('click', function() {
    clearSearchMessages();
  });
  
  // Обработчик закрытия поиска
  closeButton.addEventListener('click', function() {
    toggleSearchMessages();
  });
}

// Функция для отображения/скрытия панели поиска сообщений
function toggleSearchMessages() {
  const searchContainer = document.getElementById('search-messages-container');
  const searchInput = document.getElementById('search-messages-input');
  const resultsContainer = document.getElementById('search-results-container');
  
  if (searchMessagesActive) {
    // Скрываем панель поиска и результаты
    searchContainer.classList.remove('active');
    resultsContainer.classList.remove('active');
    
    // Убираем выделение найденных сообщений
    clearMessageHighlighting();
    
    searchMessagesActive = false;
  } else {
    // Показываем панель поиска
    searchContainer.classList.add('active');
    
    // Фокусируемся на поле ввода
    setTimeout(() => {
      searchInput.focus();
    }, 100);
    
    searchMessagesActive = true;
  }
}

// Функция для форматирования времени сообщения
function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Функция для форматирования даты сообщения
function formatMessageDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (date.toDateString() === today.toDateString()) {
    return 'Сегодня';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Вчера';
  } else {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }
}

// Функция для сброса и очистки поиска при смене диалога
function resetSearchOnChatChange() {
  if (searchMessagesActive) {
    toggleSearchMessages(); // Скрываем панель поиска
  }
  clearSearchMessages(); // Очищаем результаты поиска
}