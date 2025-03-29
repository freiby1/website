(function() {
  // Стили для всплывающего окна
  const styles = `
    .lobby-popup-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      display: flex;
      justify-content: center;
      align-items: center;
      animation: fadeIn 0.3s ease;
    }
    
    .lobby-popup {
      background-color: #fff;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      padding: 24px;
      max-width: 400px;
      width: 90%;
      position: relative;
      animation: slideUp 0.3s ease;
    }
    
    .lobby-popup-header {
      margin-bottom: 16px;
      text-align: center;
    }
    
    .lobby-popup-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #333;
      margin: 0;
    }
    
    .lobby-popup-content {
      margin-bottom: 24px;
      text-align: center;
      color: #555;
      font-size: 1rem;
      line-height: 1.5;
    }
    
    .lobby-popup-code {
      font-weight: bold;
      color: #4a6ee0;
    }
    
    .lobby-popup-buttons {
      display: flex;
      justify-content: center;
      gap: 16px;
    }
    
    .lobby-popup-button {
      padding: 12px 24px;
      border-radius: 8px;
      border: none;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .lobby-popup-button-primary {
      background-color: #4a6ee0;
      color: #fff;
    }
    
    .lobby-popup-button-primary:hover {
      background-color: #3a5ecc;
    }
    
    .lobby-popup-button-secondary {
      background-color: #f0f0f0;
      color: #555;
    }
    
    .lobby-popup-button-secondary:hover {
      background-color: #e0e0e0;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;

  /**
   * Функция для создания стилей всплывающего окна
   * @returns {HTMLStyleElement} Элемент стилей
   */
  function createStyles() {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    return styleElement;
  }

  /**
   * Создает разметку всплывающего окна
   * @param {string} lobbyCode - Код лобби
   * @returns {HTMLElement} Элемент всплывающего окна
   */
  function createPopupElement(lobbyCode) {
    const overlay = document.createElement('div');
    overlay.className = 'lobby-popup-overlay';
    
    const popup = document.createElement('div');
    popup.className = 'lobby-popup';
    
    popup.innerHTML = `
      <div class="lobby-popup-header">
        <h2 class="lobby-popup-title">Активная игра</h2>
      </div>
      <div class="lobby-popup-content">
        <p>Вы находитесь в активном лобби <span class="lobby-popup-code">${lobbyCode}</span>.</p>
        <p>Хотите вернуться в игру?</p>
      </div>
      <div class="lobby-popup-buttons">
        <button id="lobby-popup-return" class="lobby-popup-button lobby-popup-button-primary">
          Да, вернуться
        </button>
        <button id="lobby-popup-leave" class="lobby-popup-button lobby-popup-button-secondary">
          Нет, выйти из лобби
        </button>
      </div>
    `;
    
    overlay.appendChild(popup);
    return overlay;
  }

  /**
   * Получает текущего пользователя Firebase и экземпляр базы данных
   * @returns {Promise<{currentUser: Object, db: Object}>} Объект с текущим пользователем и экземпляром базы данных
   */
  async function getFirebaseInstances() {
    try {
      // Проверяем доступ к Firebase API через глобальную переменную (Firebase v8)
      if (typeof firebase !== 'undefined' && firebase.auth && firebase.database) {
        console.log('Используем Firebase v8 API');
        const currentUser = firebase.auth().currentUser;
        const db = firebase.database();
        return { currentUser, db };
      }
      
      // Проверяем доступ к импортированным модулям Firebase v9
      const userData = JSON.parse(localStorage.getItem('userData'));
      if (!userData || !userData.uid) {
        console.log('Данные пользователя не найдены в localStorage');
        return { currentUser: null, db: null };
      }
      
      console.log('Используем Firebase v9 API');
      
      // Импортируем Firebase модули v9
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js');
      const { getAuth } = await import('https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js');
      const { getDatabase } = await import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js');
      
      // Проверяем, инициализировано ли уже приложение Firebase
      let app;
      try {
        app = initializeApp({
          apiKey: "AIzaSyAR-ui1g1VurKML1wQwZFdon_2Bgcrz-ms",
          authDomain: "tpoproject-35957.firebaseapp.com",
          databaseURL: "https://tpoproject-35957-default-rtdb.europe-west1.firebasedatabase.app",
          projectId: "tpoproject-35957",
          storageBucket: "tpoproject-35957.appspot.com",
          messagingSenderId: "683982725892",
          appId: "1:683982725892:web:4d4e07e6ea913ddff5a2f7"
        });
      } catch (error) {
        // Если приложение уже инициализировано, получаем его экземпляр
        if (error.code === 'app/duplicate-app') {
          app = initializeApp(undefined, 'default');
        } else {
          throw error;
        }
      }
      
      const auth = getAuth(app);
      const db = getDatabase(app);
      
      // Создаем объект пользователя из localStorage
      const currentUser = {
        uid: userData.uid,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL
      };
      
      return { currentUser, db };
    } catch (error) {
      console.error('Ошибка при получении экземпляров Firebase:', error);
      return { currentUser: null, db: null };
    }
  }

  /**
   * Проверяет находится ли пользователь в лобби
   * @param {Function} callback - Функция обратного вызова, которая будет вызвана, если пользователь в лобби
   */
  async function checkUserInLobby(callback) {
    try {
      const { currentUser, db } = await getFirebaseInstances();
      
      if (!currentUser) {
        console.log('Пользователь не авторизован');
        return;
      }
      
      console.log('Проверяем пользователя в лобби:', currentUser.uid);
      
      // Импортируем модули Firebase, если используется v9
      if (typeof firebase === 'undefined' || !firebase.database) {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js');
        
        // Получаем ссылку на все лобби
        const lobbiesRef = ref(db, 'test_lobbies');
        
        // Получаем данные о лобби
        const snapshot = await get(lobbiesRef);
        
        if (snapshot.exists()) {
          const allLobbies = snapshot.val();
          
          // Проверяем все лобби на наличие текущего пользователя
          for (const [code, lobbyData] of Object.entries(allLobbies)) {
            if (lobbyData.participants && lobbyData.participants[currentUser.uid]) {
              // Пользователь находится в этом лобби
              callback(code, lobbyData);
              return;
            }
          }
        }
      } else {
        // Для Firebase v8
        const lobbiesRef = firebase.database().ref('test_lobbies');
        
        lobbiesRef.once('value').then(snapshot => {
          if (snapshot.exists()) {
            const allLobbies = snapshot.val();
            
            // Проверяем все лобби на наличие текущего пользователя
            for (const [code, lobbyData] of Object.entries(allLobbies)) {
              if (lobbyData.participants && lobbyData.participants[currentUser.uid]) {
                // Пользователь находится в этом лобби
                callback(code, lobbyData);
                return;
              }
            }
          }
        }).catch(error => {
          console.error('Ошибка при проверке лобби:', error);
        });
      }
    } catch (error) {
      console.error('Ошибка при инициализации проверки лобби:', error);
    }
  }

  /**
   * Показывает всплывающее окно с информацией о лобби
   * @param {string} lobbyCode - Код лобби
   * @param {Object} lobbyData - Данные лобби
   */
  async function showLobbyPopup(lobbyCode, lobbyData) {
    // Добавляем стили, если они еще не добавлены
    if (!document.querySelector('style#lobby-popup-styles')) {
      const styleElement = createStyles();
      styleElement.id = 'lobby-popup-styles';
      document.head.appendChild(styleElement);
    }
    
    // Создаем всплывающее окно, если оно еще не существует
    if (!document.querySelector('.lobby-popup-overlay')) {
      const popupElement = createPopupElement(lobbyCode);
      document.body.appendChild(popupElement);
      
      // Обработчик кнопки "Вернуться в лобби"
      document.getElementById('lobby-popup-return').addEventListener('click', () => {
        // Перенаправляем пользователя в лобби
        const testId = lobbyData.testId;
        
        // Сохраняем информацию о необходимости автоматически присоединиться к лобби
        sessionStorage.setItem('autoJoinLobby', lobbyCode);
        
        // Перенаправляем пользователя на страницу теста с параметрами для автоматического присоединения
        window.location.href = `view-test.html?id=${testId}&lobbyCode=${lobbyCode}&autoJoin=true`;
      });
      
      // Обработчик кнопки "Выйти из лобби"
      document.getElementById('lobby-popup-leave').addEventListener('click', async () => {
        try {
          const { currentUser, db } = await getFirebaseInstances();
          
          if (!currentUser) {
            console.error('Невозможно выйти из лобби: пользователь не авторизован');
            return;
          }
          
          // Импортируем модули Firebase, если используется v9
          if (typeof firebase === 'undefined' || !firebase.database) {
            const { ref, remove, get, update, set } = await import('https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js');
            
            // Проверяем, является ли пользователь хостом лобби
            const lobbySnapshot = await get(ref(db, `test_lobbies/${lobbyCode}`));
            if (lobbySnapshot.exists()) {
              const lobbyData = lobbySnapshot.val();
              const isHost = lobbyData.hostId === currentUser.uid;
              
              if (isHost) {
                console.log('Пользователь является хостом, передаем права хоста другому участнику');
                
                // Получаем список участников
                const participantsSnapshot = await get(ref(db, `test_lobbies/${lobbyCode}/participants`));
                if (participantsSnapshot.exists()) {
                  const participantsData = participantsSnapshot.val();
                  
                  // Находим других участников, кроме текущего пользователя
                  const otherParticipants = Object.entries(participantsData)
                    .filter(([uid, _]) => uid !== currentUser.uid)
                    .map(([uid, data]) => ({ uid, ...data }));
                  
                  if (otherParticipants.length > 0) {
                    // Выбираем первого участника как нового хоста
                    const newHost = otherParticipants[0];
                    
                    // Обновляем данные нового хоста
                    await update(ref(db, `test_lobbies/${lobbyCode}/participants/${newHost.uid}`), {
                      isHost: true
                    });
                    
                    // Обновляем hostId в данных лобби
                    await update(ref(db, `test_lobbies/${lobbyCode}`), {
                      hostId: newHost.uid
                    });
                    
                    console.log(`Права хоста переданы участнику ${newHost.name || 'Пользователь'} (${newHost.uid})`);
                  } else {
                    // Если других участников нет, удаляем лобби полностью
                    console.log('Других участников нет, удаляем лобби полностью');
                    await remove(ref(db, `test_lobbies/${lobbyCode}`));
                  }
                }
              }
            }
            
            // Удаляем пользователя из лобби
            const participantRef = ref(db, `test_lobbies/${lobbyCode}/participants/${currentUser.uid}`);
            await remove(participantRef);
            
            console.log('Успешно вышли из лобби');
            document.querySelector('.lobby-popup-overlay').remove();
            
            // Проверяем количество оставшихся участников
            const participantsRef = ref(db, `test_lobbies/${lobbyCode}/participants`);
            const snapshot = await get(participantsRef);
            
            if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
              // Если участников не осталось, удаляем лобби
              const lobbyRef = ref(db, `test_lobbies/${lobbyCode}`);
              await remove(lobbyRef);
              console.log('Лобби удалено, так как в нем не осталось участников');
            }
          } else {
            // Для Firebase v8
            // Проверяем, является ли пользователь хостом лобби
            firebase.database().ref(`test_lobbies/${lobbyCode}`).once('value')
              .then(snapshot => {
                if (snapshot.exists()) {
                  const lobbyData = snapshot.val();
                  const isHost = lobbyData.hostId === currentUser.uid;
                  
                  if (isHost) {
                    console.log('Пользователь является хостом, передаем права хоста другому участнику');
                    
                    // Получаем список участников
                    return firebase.database().ref(`test_lobbies/${lobbyCode}/participants`).once('value')
                      .then(participantsSnapshot => {
                        if (participantsSnapshot.exists()) {
                          const participantsData = participantsSnapshot.val();
                          
                          // Находим других участников, кроме текущего пользователя
                          const otherParticipants = Object.entries(participantsData)
                            .filter(([uid, _]) => uid !== currentUser.uid)
                            .map(([uid, data]) => ({ uid, ...data }));
                          
                          if (otherParticipants.length > 0) {
                            // Выбираем первого участника как нового хоста
                            const newHost = otherParticipants[0];
                            
                            // Обновляем данные нового хоста
                            const updates = {};
                            updates[`test_lobbies/${lobbyCode}/participants/${newHost.uid}/isHost`] = true;
                            updates[`test_lobbies/${lobbyCode}/hostId`] = newHost.uid;
                            
                            return firebase.database().ref().update(updates)
                              .then(() => {
                                console.log(`Права хоста переданы участнику ${newHost.name || 'Пользователь'} (${newHost.uid})`);
                                
                                // Удаляем текущего пользователя из лобби после передачи прав
                                return firebase.database().ref(`test_lobbies/${lobbyCode}/participants/${currentUser.uid}`).remove();
                              });
                          } else {
                            // Если других участников нет, удаляем лобби полностью
                            console.log('Других участников нет, удаляем лобби полностью');
                            return firebase.database().ref(`test_lobbies/${lobbyCode}`).remove();
                          }
                        }
                        
                        // Если не удалось получить данные участников, просто удаляем себя
                        return firebase.database().ref(`test_lobbies/${lobbyCode}/participants/${currentUser.uid}`).remove();
                      });
                  }
                  
                  // Если пользователь не хост, просто удаляем его из лобби
                  return firebase.database().ref(`test_lobbies/${lobbyCode}/participants/${currentUser.uid}`).remove();
                }
              })
              .then(() => {
                console.log('Успешно вышли из лобби');
                document.querySelector('.lobby-popup-overlay').remove();
                
                // Проверяем количество оставшихся участников
                return firebase.database().ref(`test_lobbies/${lobbyCode}/participants`).once('value');
              })
              .then(snapshot => {
                if (!snapshot.exists() || Object.keys(snapshot.val()).length === 0) {
                  // Если участников не осталось, удаляем лобби
                  return firebase.database().ref(`test_lobbies/${lobbyCode}`).remove()
                    .then(() => console.log('Лобби удалено, так как в нем не осталось участников'));
                }
              })
              .catch(error => {
                console.error('Ошибка при выходе из лобби:', error);
              });
          }
        } catch (error) {
          console.error('Ошибка при выходе из лобби:', error);
        }
      });
    }
  }
  
  /**
   * Пытается автоматически присоединиться к лобби по коду
   * @param {string} code - Код лобби для присоединения
   */
  function autoJoinLobby(code) {
    if (!code) return;
    
    console.log('Попытка автоматического присоединения к лобби:', code);
    
    // Ждем загрузки страницы
    setTimeout(() => {
      // Находим поле для ввода кода лобби и заполняем его
      const joinCodeInput = document.getElementById('join-code-input');
      if (joinCodeInput) {
        joinCodeInput.value = code;
        
        // Пытаемся найти и вызвать функцию присоединения к лобби
        if (typeof window.joinLobbyByCode === 'function') {
          window.joinLobbyByCode();
        } else {
          // Ищем кнопку присоединения к лобби с кодом
          const lobbyButtons = document.querySelectorAll('.join-lobby-btn');
          for (const button of lobbyButtons) {
            if (button.dataset.code === code) {
              button.click();
              break;
            }
          }
        }
      }
    }, 1500);
  }

  /**
   * Инициализирует проверку нахождения пользователя в лобби
   */
  function init() {
    // Проверяем, находится ли пользователь уже на странице лобби
    const currentUrl = window.location.href;
    const isAlreadyInLobbyPage = currentUrl.includes('lobbyCode=');
    
    // Если пользователь уже на странице лобби
    if (isAlreadyInLobbyPage) {
      // Проверяем наличие параметра autoJoin
      const urlParams = new URLSearchParams(window.location.search);
      const autoJoin = urlParams.get('autoJoin') === 'true';
      const lobbyCode = urlParams.get('lobbyCode');
      
      if (autoJoin && lobbyCode) {
        // Попытка автоматически присоединиться к лобби
        autoJoinLobby(lobbyCode);
      }
      
      return;
    }
    
    // Проверяем наличие сохраненного кода лобби в sessionStorage
    const savedLobbyCode = sessionStorage.getItem('autoJoinLobby');
    if (savedLobbyCode) {
      // Удаляем сохраненный код, чтобы не пытаться присоединиться повторно при обновлении страницы
      sessionStorage.removeItem('autoJoinLobby');
    }
    
    // Ждем загрузки страницы и авторизации пользователя
    window.addEventListener('DOMContentLoaded', () => {
      // Даем время для инициализации Firebase и авторизации
      setTimeout(() => {
        checkUserInLobby((lobbyCode, lobbyData) => {
          showLobbyPopup(lobbyCode, lobbyData);
        });
      }, 2000); // Увеличиваем задержку до 2 секунд для большей надежности
    });
  }

  // Запускаем инициализацию
  init();
  
  // Экспортируем функцию автоматического присоединения для внешнего использования
  window.autoJoinLobby = autoJoinLobby;
})(); 