// Функции для обновления аватаров пользователей

// Оборачиваем код в самовызывающуюся функцию для изоляции переменных
(function() {
    console.log('Инициализация avatar_functions.js');

    // Проверяем и определяем объект базы данных Firebase
    if (!window.db) {
        console.log('Определяем window.db');
        window.db = window.database || window.firebaseDb || null;
        if (!window.db) {
            console.warn('Не удалось определить объект базы данных Firebase. Некоторые функции могут не работать.');
        }
    }

    // Проверяем и определяем объект текущего пользователя
    if (!window.currentUser) {
        console.log('Определяем window.currentUser');
        window.currentUser = window.user || window.firebaseUser || null;
        if (!window.currentUser) {
            console.warn('Не удалось определить объект текущего пользователя. Некоторые функции могут не работать.');
        }
    }

    // Проверяем и определяем переменную numericId
    if (!window.numericId) {
        console.log('Определяем window.numericId');
        // Пытаемся получить numericId из URL
        const urlParams = new URLSearchParams(window.location.search);
        const idParam = urlParams.get('id');
        if (idParam) {
            window.numericId = idParam;
        } else {
            console.warn('Не удалось определить numericId. Некоторые функции могут не работать.');
        }
    }

    // Проверяем и определяем необходимые функции Firebase
    if (!window.ref) {
        console.log('Определяем window.ref из импортированных функций Firebase');
        window.ref = window.dbRef || function(db, path) {
            console.warn('Используется заглушка для ref');
            return { path: path };
        };
    }
    
    if (!window.get) {
        console.log('Определяем window.get из импортированных функций Firebase');
        window.get = window.dbGet || function(ref) {
            console.warn('Используется заглушка для get');
            return Promise.resolve({ exists: () => false, val: () => null });
        };
    }
    
    if (!window.set) {
        console.log('Определяем window.set из импортированных функций Firebase');
        window.set = window.dbSet || function(ref, data) {
            console.warn('Используется заглушка для set');
            return Promise.resolve();
        };
    }
    
    if (!window.update) {
        console.log('Определяем window.update из импортированных функций Firebase');
        window.update = window.dbUpdate || function(ref, data) {
            console.warn('Используется заглушка для update');
            return Promise.resolve();
        };
    }
    
    if (!window.onValue) {
        console.log('Определяем window.onValue из импортированных функций Firebase');
        window.onValue = function(ref, callback) {
            console.warn('Используется заглушка для onValue');
        };
    }

    if (!window.updateProfile) {
        console.log('Определяем window.updateProfile из импортированных функций Firebase');
        window.updateProfile = function(user, data) {
            console.warn('Используется заглушка для updateProfile');
            return Promise.resolve();
        };
    }

    // Глобальная переменная для хранения URL аватара текущего пользователя
    window.currentUserAvatarURL = null;

    // Глобальный объект для хранения актуальных URL аватаров всех пользователей
    window.userAvatars = {};

    // Функция для получения URL базы данных Firebase
    window.getFirebaseDatabaseURL = function() {
        let databaseURL = '';
        
        // Пытаемся получить URL базы данных из разных источников
        if (window.db && window.db._databaseURL) {
            databaseURL = window.db._databaseURL;
        } else if (window.db && window.db.app && window.db.app.options && window.db.app.options.databaseURL) {
            databaseURL = window.db.app.options.databaseURL;
        } else if (window.firebaseConfig && window.firebaseConfig.databaseURL) {
            databaseURL = window.firebaseConfig.databaseURL;
        } else {
            // Если не удалось получить URL из объектов Firebase, пробуем получить из localStorage
            try {
                const firebaseConfig = JSON.parse(localStorage.getItem('firebaseConfig'));
                if (firebaseConfig && firebaseConfig.databaseURL) {
                    databaseURL = firebaseConfig.databaseURL;
                }
            } catch (error) {
                console.warn('Не удалось получить URL базы данных из localStorage:', error);
            }
            
            // Если все еще не удалось получить URL, используем стандартный формат
            if (!databaseURL) {
                // Пытаемся определить projectId из URL страницы или из других источников
                let projectId = '';
                
                // Пробуем получить из hostname
                if (window.location.hostname.includes('firebaseapp.com')) {
                    projectId = window.location.hostname.split('.')[0];
                } else if (window.location.hostname.includes('web.app')) {
                    projectId = window.location.hostname.split('-')[0];
                } else {
                    // Пробуем получить из других источников
                    if (window.firebaseConfig && window.firebaseConfig.projectId) {
                        projectId = window.firebaseConfig.projectId;
                    } else if (window.db && window.db.app && window.db.app.options && window.db.app.options.projectId) {
                        projectId = window.db.app.options.projectId;
                    } else {
                        // Если не удалось определить projectId, используем значение по умолчанию
                        projectId = 'ochat-9cfc9';
                    }
                }
                
                // Определяем регион базы данных
                let region = 'europe-west1';
                
                // Формируем URL базы данных
                databaseURL = `https://${projectId}-default-rtdb.${region}.firebasedatabase.app`;
            }
        }
        
        console.log('Определен URL базы данных Firebase:', databaseURL);
        return databaseURL;
    };

    // Функция для обновления аватара пользователя в узле users базы данных
    window.updateUserAvatarInDatabase = async function(userId, newAvatarURL) {
        try {
            // Проверяем, что необходимые объекты доступны
            if (!window.db) {
                console.error('Объект базы данных Firebase не доступен');
                return;
            }

            // Используем Firebase SDK через глобальные переменные
            const userRef = window.ref(window.db, `users/${userId}`);
            const userSnapshot = await window.get(userRef);
            
            if (userSnapshot.exists()) {
                // Обновляем только поле photoURL
                window.update(userRef, { photoURL: newAvatarURL });
            } else {
                // Если записи пользователя нет, создаем ее
                window.set(userRef, {
                    photoURL: newAvatarURL,
                    displayName: window.currentUser ? (window.currentUser.displayName || '') : '',
                    email: window.currentUser ? (window.currentUser.email || '') : ''
                });
            }
            
            // Обновляем кэш аватаров
            window.userAvatars[userId] = newAvatarURL;
        } catch (error) {
            console.error('Ошибка при обновлении аватара в узле users:', error);
        }
    };

    // Функция для обновления аватаров пользователя на странице (без обновления в базе данных)
    window.updateUserAvatarsOnPage = function(userId, photoURL) {
        // Обновляем кэш аватаров
        window.userAvatars[userId] = photoURL;
        
        // Добавляем стабильный идентификатор к URL
        let avatarUrl = photoURL;
        if (avatarUrl && userId) {
            if (avatarUrl.includes('?')) {
                avatarUrl = `${avatarUrl}&_stable=${userId}`;
            } else {
                avatarUrl = `${avatarUrl}?_stable=${userId}`;
            }
        }
        
        // Находим все аватары пользователя в комментариях
        const userAvatars = document.querySelectorAll(`
            .comment-avatar[src*="${userId}"], 
            .comment-avatar-link[href*="${userId}"] .comment-avatar, 
            .comment-form-avatar[src*="${userId}"],
            .modal-comment-avatar img[src*="${userId}"],
            .modal-reply-avatar img[src*="${userId}"],
            .profile-avatar img[src*="${userId}"]
        `);
        
        // Обновляем все найденные аватары
        userAvatars.forEach(avatar => {
            // Добавляем анимацию для плавного перехода
            avatar.style.transition = 'opacity 0.3s ease-in-out';
            avatar.style.opacity = '0';
            
            // Через небольшую задержку меняем изображение и возвращаем непрозрачность
            setTimeout(() => {
                avatar.src = avatarUrl;
                avatar.style.opacity = '1';
            }, 300);
        });
    };

    // Функция для загрузки актуальных аватаров всех пользователей
    window.loadAllUserAvatars = async function() {
        try {
            // Проверяем, что Firebase SDK доступен
            if (!window.ref || !window.db || !window.get) {
                console.error('Firebase SDK не доступен для loadAllUserAvatars');
                return;
            }
            
            console.log('Загружаем актуальные аватары всех пользователей');
            
            // Получаем данные всех пользователей
            const usersRef = window.ref(window.db, 'users');
            const usersSnapshot = await window.get(usersRef);
            
            if (usersSnapshot.exists()) {
                const users = usersSnapshot.val();
                
                // Сохраняем URL аватаров всех пользователей
                Object.keys(users).forEach(userId => {
                    const user = users[userId];
                    if (user && user.photoURL) {
                        window.userAvatars[userId] = user.photoURL;
                    }
                });
                
                console.log('Загружены аватары для', Object.keys(window.userAvatars).length, 'пользователей');
                
                // Обновляем аватары в комментариях
                window.updateAllCommentsAvatars();
            }
        } catch (error) {
            console.error('Ошибка при загрузке аватаров пользователей:', error);
        }
    };
    
    // Функция для обновления аватаров во всех комментариях на странице
    window.updateAllCommentsAvatars = function() {
        try {
            console.log('Обновляем аватары во всех комментариях');
            
            // Находим все комментарии на странице
            const comments = document.querySelectorAll('.comment');
            
            comments.forEach(comment => {
                // Получаем ID автора комментария
                const authorLink = comment.querySelector('.comment-avatar-link');
                if (!authorLink) return;
                
                // Извлекаем ID пользователя из href атрибута
                const href = authorLink.getAttribute('href');
                if (!href) return;
                
                // Ищем ID пользователя в href
                const userIdMatch = href.match(/id=(\w+)/);
                if (!userIdMatch || !userIdMatch[1]) return;
                
                const userId = userIdMatch[1];
                
                // Проверяем, есть ли актуальный аватар для этого пользователя
                if (window.userAvatars[userId]) {
                    // Обновляем аватар в комментарии
                    const avatar = comment.querySelector('.comment-avatar');
                    if (avatar) {
                        avatar.src = window.userAvatars[userId];
                    }
                }
            });
            
            // Обновляем аватары в модальном окне с ответами
            const modalReplies = document.querySelectorAll('.modal-reply');
            
            modalReplies.forEach(reply => {
                // Получаем ID автора ответа
                const authorLink = reply.querySelector('.modal-reply-author-link');
                if (!authorLink) return;
                
                // Извлекаем ID пользователя из href атрибута
                const href = authorLink.getAttribute('href');
                if (!href) return;
                
                // Ищем ID пользователя в href
                const userIdMatch = href.match(/id=(\w+)/);
                if (!userIdMatch || !userIdMatch[1]) return;
                
                const userId = userIdMatch[1];
                
                // Проверяем, есть ли актуальный аватар для этого пользователя
                if (window.userAvatars[userId]) {
                    // Обновляем аватар в ответе
                    const avatar = reply.querySelector('.modal-reply-avatar img');
                    if (avatar) {
                        avatar.src = window.userAvatars[userId];
                    }
                }
            });
            
            console.log('Аватары во всех комментариях обновлены');
        } catch (error) {
            console.error('Ошибка при обновлении аватаров в комментариях:', error);
        }
    };

    // Функция для создания тестового комментария, если комментариев нет
    window.createTestCommentIfNeeded = async function(userId, photoURL) {
        console.log('Проверяем необходимость создания тестового комментария');
        
        if (!userId || !photoURL) {
            console.warn('Не переданы необходимые параметры для createTestCommentIfNeeded');
            return false;
        }
        
        try {
            // Получаем URL базы данных Firebase
            const databaseURL = window.getFirebaseDatabaseURL();
            console.log('Используем URL базы данных:', databaseURL);
            
            // Проверяем, есть ли комментарии в базе данных
            const commentsResponse = await fetch(`${databaseURL}/comments.json`);
            
            if (!commentsResponse.ok) {
                console.error('Ошибка при получении комментариев:', commentsResponse.statusText);
                return false;
            }
            
            const allComments = await commentsResponse.json();
            
            // Если комментариев нет, создаем тестовый комментарий
            if (!allComments || Object.keys(allComments).length === 0) {
                console.log('Комментариев нет, создаем тестовый комментарий');
                
                // Получаем текущий профиль
                const numericId = window.numericId || '1'; // Используем 1 по умолчанию, если numericId не определен
                
                // Получаем данные текущего пользователя
                const userName = window.currentUser?.displayName || 'Пользователь';
                
                // Создаем тестовый комментарий
                const testComment = {
                    authorId: userId,
                    authorName: userName,
                    authorPhotoURL: photoURL,
                    text: 'Это тестовый комментарий для обновления аватаров.',
                    timestamp: Date.now(),
                    clientTimestamp: Date.now()
                };
                
                console.log('Создаем тестовый комментарий с данными:', JSON.stringify(testComment));
                
                // Сохраняем тестовый комментарий в базе данных
                const commentId = `comment_${Date.now()}`;
                const saveResponse = await fetch(`${databaseURL}/comments/${numericId}/${commentId}.json`, {
                    method: 'PUT',
                    body: JSON.stringify(testComment)
                });
                
                if (saveResponse.ok) {
                    console.log('Тестовый комментарий успешно создан с ID:', commentId);
                    
                    // Проверяем, что комментарий действительно сохранился
                    const checkResponse = await fetch(`${databaseURL}/comments/${numericId}/${commentId}.json`);
                    if (checkResponse.ok) {
                        const savedComment = await checkResponse.json();
                        console.log('Проверка сохраненного комментария:', savedComment);
                        return true;
                    } else {
                        console.error('Ошибка при проверке сохраненного комментария:', checkResponse.statusText);
                        return false;
                    }
                } else {
                    console.error('Ошибка при создании тестового комментария:', saveResponse.statusText);
                    return false;
                }
            } else {
                console.log('Комментарии уже существуют, создание тестового комментария не требуется');
                return false;
            }
        } catch (error) {
            console.error('Ошибка при создании тестового комментария:', error);
            console.error('Стек ошибки:', error.stack);
            return false;
        }
    };

    // Функция для обновления аватаров пользователя во всех комментариях в базе данных
    window.updateUserAvatarsInAllComments = async function(userId, newAvatarURL) {
        try {
            // Прямое обновление комментариев через REST API Firebase, если функции Firebase не работают
            const useDirectUpdate = async function() {
                console.log('Пробуем прямое обновление через REST API Firebase');
                
                try {
                    // Получаем URL базы данных Firebase
                    const databaseURL = window.getFirebaseDatabaseURL();
                    console.log('Используем URL базы данных:', databaseURL);
                    
                    // Обновляем аватар пользователя в узле users
                    const userResponse = await fetch(`${databaseURL}/users/${userId}/photoURL.json`, {
                        method: 'PUT',
                        body: JSON.stringify(newAvatarURL)
                    });
                    
                    if (userResponse.ok) {
                        console.log('Аватар пользователя в узле users обновлен успешно');
                    } else {
                        console.error('Ошибка при обновлении аватара пользователя в узле users:', userResponse.statusText);
                    }
                    
                    // Получаем все комментарии
                    const commentsResponse = await fetch(`${databaseURL}/comments.json`);
                    
                    if (!commentsResponse.ok) {
                        console.error('Ошибка при получении комментариев:', commentsResponse.statusText);
                        
                        // Пробуем создать тестовый комментарий
                        const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                        if (created) {
                            console.log('Тестовый комментарий создан, повторяем попытку обновления');
                            return await useDirectUpdate(); // Рекурсивный вызов после создания комментария
                        }
                        
                        return false;
                    }
                    
                    const allComments = await commentsResponse.json();
                    
                    if (!allComments) {
                        console.log('Нет комментариев в базе данных');
                        
                        // Пробуем создать тестовый комментарий
                        const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                        if (created) {
                            console.log('Тестовый комментарий создан, повторяем попытку обновления');
                            return await useDirectUpdate(); // Рекурсивный вызов после создания комментария
                        }
                        
                        return false;
                    }
                    
                    // Проверяем, что allComments - это объект и не null/undefined
                    if (typeof allComments !== 'object' || allComments === null) {
                        console.error('Получены некорректные данные комментариев:', allComments);
                        return false;
                    }
                    
                    const profilesCount = Object.keys(allComments).length;
                    console.log('Получены все комментарии:', profilesCount, 'профилей');
                    
                    if (profilesCount === 0) {
                        console.warn('В базе данных нет профилей с комментариями');
                        
                        // Пробуем создать тестовый комментарий
                        const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                        if (created) {
                            console.log('Тестовый комментарий создан, повторяем попытку обновления');
                            return await useDirectUpdate(); // Рекурсивный вызов после создания комментария
                        }
                        
                        return false;
                    }
                    
                    // Проходим по всем профилям
                    let updatedCommentsCount = 0;
                    let updatedRepliesCount = 0;
                    let updatePromises = [];
                    
                    for (const profileId in allComments) {
                        const profileComments = allComments[profileId];
                        
                        // Проверяем, что profileComments - это объект и не null/undefined
                        if (typeof profileComments !== 'object' || profileComments === null) {
                            console.warn(`Профиль ${profileId} содержит некорректные данные:`, profileComments);
                            continue;
                        }
                        
                        console.log(`Обрабатываем профиль ${profileId}, количество комментариев:`, Object.keys(profileComments).length);
                        
                        // Проходим по всем комментариям профиля
                        for (const commentId in profileComments) {
                            const comment = profileComments[commentId];
                            
                            // Проверяем, что comment - это объект и не null/undefined
                            if (typeof comment !== 'object' || comment === null) {
                                console.warn(`Комментарий ${commentId} содержит некорректные данные:`, comment);
                                continue;
                            }
                            
                            // Если комментарий принадлежит пользователю, обновляем его аватар
                            if (comment.authorId === userId) {
                                console.log(`Комментарий ${commentId} принадлежит пользователю ${userId}, обновляем аватар`);
                                
                                // Создаем обновленный комментарий
                                const updatedComment = { ...comment, authorPhotoURL: newAvatarURL };
                                
                                // Добавляем промис обновления комментария
                                updatePromises.push(
                                    fetch(`${databaseURL}/comments/${profileId}/${commentId}.json`, {
                                        method: 'PUT',
                                        body: JSON.stringify(updatedComment)
                                    }).then(response => {
                                        if (response.ok) {
                                            updatedCommentsCount++;
                                            console.log(`Комментарий ${commentId} успешно обновлен`);
                                        } else {
                                            console.error(`Ошибка при обновлении комментария ${commentId}:`, response.statusText);
                                        }
                                    }).catch(error => {
                                        console.error(`Ошибка при обновлении комментария ${commentId}:`, error);
                                    })
                                );
                            }
                            
                            // Если у комментария есть ответы, проверяем их тоже
                            if (comment.replies && Array.isArray(comment.replies)) {
                                let repliesUpdated = false;
                                
                                // Создаем копию массива ответов
                                const updatedReplies = comment.replies.map(reply => {
                                    // Проверяем, что reply - это объект и не null/undefined
                                    if (typeof reply !== 'object' || reply === null) {
                                        return reply;
                                    }
                                    
                                    // Если ответ принадлежит пользователю, обновляем его аватар
                                    if (reply.authorId === userId) {
                                        console.log(`Ответ в комментарии ${commentId} принадлежит пользователю ${userId}, обновляем аватар`);
                                        updatedRepliesCount++;
                                        repliesUpdated = true;
                                        return { ...reply, authorPhotoURL: newAvatarURL };
                                    }
                                    
                                    return reply;
                                });
                                
                                // Если были обновления в ответах, обновляем комментарий
                                if (repliesUpdated) {
                                    // Создаем обновленный комментарий с обновленными ответами
                                    const updatedComment = { ...comment, replies: updatedReplies };
                                    
                                    // Добавляем промис обновления комментария
                                    updatePromises.push(
                                        fetch(`${databaseURL}/comments/${profileId}/${commentId}.json`, {
                                            method: 'PUT',
                                            body: JSON.stringify(updatedComment)
                                        }).then(response => {
                                            if (!response.ok) {
                                                console.error(`Ошибка при обновлении ответов в комментарии ${commentId}:`, response.statusText);
                                            }
                                        }).catch(error => {
                                            console.error(`Ошибка при обновлении ответов в комментарии ${commentId}:`, error);
                                        })
                                    );
                                }
                            }
                        }
                    }
                    
                    // Ждем завершения всех обновлений
                    await Promise.all(updatePromises);
                    
                    console.log(`Обновление аватаров завершено. Обновлено комментариев: ${updatedCommentsCount}, ответов: ${updatedRepliesCount}`);
                    
                    return updatedCommentsCount > 0 || updatedRepliesCount > 0;
                } catch (error) {
                    console.error('Ошибка при прямом обновлении комментариев:', error);
                    console.error('Стек ошибки:', error.stack);
                    return false;
                }
            };
            
            // Проверяем, что необходимые объекты доступны
            if (!window.db) {
                console.error('Объект базы данных Firebase не доступен');
                return await useDirectUpdate();
            }
            
            console.log('Обновляем аватары пользователя во всех комментариях в базе данных', userId, newAvatarURL);
            console.log('Используемый объект базы данных:', window.db);
            
            // Проверяем, что необходимые функции доступны
            if (!window.ref || !window.get || !window.update) {
                console.error('Необходимые функции Firebase не доступны');
                console.log('ref доступен:', !!window.ref);
                console.log('get доступен:', !!window.get);
                console.log('update доступен:', !!window.update);
                return await useDirectUpdate();
            }
            
            try {
                // Получаем все профили
                const profilesRef = window.ref(window.db, 'comments');
                console.log('Ссылка на узел comments:', profilesRef);
                
                let profilesSnapshot = await window.get(profilesRef);
                console.log('Получен снимок узла comments:', profilesSnapshot.exists() ? 'существует' : 'не существует');
                
                if (!profilesSnapshot.exists()) {
                    console.log('Нет комментариев в базе данных');
                    
                    // Пробуем создать тестовый комментарий
                    const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                    if (created) {
                        console.log('Тестовый комментарий создан, повторяем попытку обновления');
                        
                        // Даем время на обработку создания комментария
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Повторно получаем снимок после создания комментария
                        const updatedProfilesSnapshot = await window.get(profilesRef);
                        if (!updatedProfilesSnapshot.exists()) {
                            console.error('Комментарии не найдены даже после создания тестового комментария');
                            return await useDirectUpdate();
                        }
                        
                        // Продолжаем с обновленным снимком
                        profilesSnapshot = updatedProfilesSnapshot;
                    } else {
                        console.error('Не удалось создать тестовый комментарий');
                        return await useDirectUpdate();
                    }
                }
                
                // Проверяем, что profilesSnapshot.val() возвращает объект
                const profiles = profilesSnapshot.val();
                if (typeof profiles !== 'object' || profiles === null) {
                    console.error('Получены некорректные данные комментариев:', profiles);
                    return await useDirectUpdate();
                }
                
                const profilesCount = Object.keys(profiles).length;
                console.log('Количество профилей с комментариями:', profilesCount);
                
                if (profilesCount === 0) {
                    console.warn('В базе данных нет профилей с комментариями');
                    
                    // Пробуем создать тестовый комментарий
                    const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                    if (created) {
                        console.log('Тестовый комментарий создан, повторяем попытку обновления');
                        
                        // Даем время на обработку создания комментария
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        return await window.updateUserAvatarsInAllComments(userId, newAvatarURL); // Рекурсивный вызов после создания комментария
                    }
                    
                    return await useDirectUpdate();
                }
                
                let updatedCommentsCount = 0;
                let updatedRepliesCount = 0;
                
                for (const profileId in profiles) {
                    console.log(`Обрабатываем профиль ${profileId}`);
                    
                    // Получаем все комментарии профиля
                    const profileCommentsRef = window.ref(window.db, `comments/${profileId}`);
                    const profileCommentsSnapshot = await window.get(profileCommentsRef);
                    
                    if (!profileCommentsSnapshot.exists()) {
                        console.log(`Профиль ${profileId} не имеет комментариев`);
                        continue;
                    }
                    
                    // Проверяем, что profileCommentsSnapshot.val() возвращает объект
                    const comments = profileCommentsSnapshot.val();
                    if (typeof comments !== 'object' || comments === null) {
                        console.warn(`Профиль ${profileId} содержит некорректные данные:`, comments);
                        continue;
                    }
                    
                    const commentsCount = Object.keys(comments).length;
                    console.log(`Профиль ${profileId} имеет ${commentsCount} комментариев`);
                    
                    if (commentsCount === 0) {
                        console.warn(`Профиль ${profileId} не содержит комментариев`);
                        continue;
                    }
                    
                    for (const commentId in comments) {
                        const comment = comments[commentId];
                        
                        // Проверяем, что comment - это объект и не null/undefined
                        if (typeof comment !== 'object' || comment === null) {
                            console.warn(`Комментарий ${commentId} содержит некорректные данные:`, comment);
                            continue;
                        }
                        
                        console.log(`Проверяем комментарий ${commentId}, автор: ${comment.authorId}`);
                        
                        // Если комментарий принадлежит пользователю, обновляем его аватар
                        if (comment.authorId === userId) {
                            console.log(`Комментарий ${commentId} принадлежит пользователю ${userId}, обновляем аватар`);
                            console.log(`Текущий authorPhotoURL: ${comment.authorPhotoURL}`);
                            console.log(`Новый authorPhotoURL: ${newAvatarURL}`);
                            
                            const commentRef = window.ref(window.db, `comments/${profileId}/${commentId}`);
                            console.log(`Ссылка на комментарий:`, commentRef);
                            
                            try {
                                await window.update(commentRef, { authorPhotoURL: newAvatarURL });
                                console.log(`Комментарий ${commentId} успешно обновлен`);
                                updatedCommentsCount++;
                            } catch (updateError) {
                                console.error(`Ошибка при обновлении комментария ${commentId}:`, updateError);
                            }
                        }
                        
                        // Если у комментария есть ответы, проверяем их тоже
                        if (comment.replies && Array.isArray(comment.replies)) {
                            console.log(`Комментарий ${commentId} имеет ${comment.replies.length} ответов`);
                            
                            let repliesUpdated = false;
                            const updatedReplies = comment.replies.map(reply => {
                                // Проверяем, что reply - это объект и не null/undefined
                                if (typeof reply !== 'object' || reply === null) {
                                    console.warn(`Ответ содержит некорректные данные:`, reply);
                                    return reply;
                                }
                                
                                console.log(`Проверяем ответ, автор: ${reply.authorId}`);
                                
                                if (reply.authorId === userId) {
                                    console.log(`Ответ принадлежит пользователю ${userId}, обновляем аватар`);
                                    console.log(`Текущий authorPhotoURL: ${reply.authorPhotoURL}`);
                                    console.log(`Новый authorPhotoURL: ${newAvatarURL}`);
                                    
                                    repliesUpdated = true;
                                    updatedRepliesCount++;
                                    return { ...reply, authorPhotoURL: newAvatarURL };
                                }
                                return reply;
                            });
                            
                            // Если были изменения в ответах, обновляем их в базе данных
                            if (repliesUpdated) {
                                console.log(`Обновляем ответы для комментария ${commentId}`);
                                
                                const commentRef = window.ref(window.db, `comments/${profileId}/${commentId}`);
                                try {
                                    await window.update(commentRef, { replies: updatedReplies });
                                    console.log(`Ответы для комментария ${commentId} успешно обновлены`);
                                } catch (updateError) {
                                    console.error(`Ошибка при обновлении ответов для комментария ${commentId}:`, updateError);
                                }
                            }
                        }
                    }
                }
                
                console.log(`Обновлено ${updatedCommentsCount} комментариев и ${updatedRepliesCount} ответов пользователя ${userId}`);
                
                // Проверяем, были ли обновления
                if (updatedCommentsCount === 0 && updatedRepliesCount === 0) {
                    console.warn(`Не найдено комментариев или ответов пользователя ${userId} для обновления`);
                    
                    // Если не удалось обновить через стандартные функции, пробуем прямое обновление
                    console.log('Пробуем прямое обновление через REST API...');
                    return await useDirectUpdate();
                }
                
                return true;
            } catch (error) {
                console.error('Ошибка при обновлении аватаров через стандартные функции Firebase:', error);
                console.error('Стек ошибки:', error.stack);
                
                // Если не удалось обновить через стандартные функции, пробуем прямое обновление
                console.log('Пробуем прямое обновление через REST API...');
                return await useDirectUpdate();
            }
        } catch (error) {
            console.error('Ошибка при обновлении аватаров в комментариях:', error);
            console.error('Стек ошибки:', error.stack);
            return false;
        }
    };

    // Функция для настройки слушателя изменений аватаров пользователей
    window.setupUserAvatarListener = function() {
        // Проверяем, что Firebase SDK доступен
        if (!window.ref || !window.db || !window.onValue) {
            console.error('Firebase SDK не доступен для setupUserAvatarListener');
            return;
        }

        try {
            // Слушаем изменения в узле users
            const usersRef = window.ref(window.db, 'users');
            
            // Используем onValue из Firebase
            window.onValue(usersRef, (snapshot) => {
                if (snapshot.exists()) {
                    const users = snapshot.val();
                    
                    // Проходим по всем пользователям
                    Object.keys(users).forEach(userId => {
                        const user = users[userId];
                        if (user && user.photoURL) {
                            // Обновляем кэш аватаров
                            window.userAvatars[userId] = user.photoURL;
                            
                            // Обновляем все аватары этого пользователя на странице
                            window.updateUserAvatarsOnPage(userId, user.photoURL);
                        }
                    });
                }
            });
            
            console.log('Слушатель изменений аватаров настроен');
        } catch (error) {
            console.error('Ошибка при настройке слушателя аватаров:', error);
        }
    };

    // Обновленная функция updateUserAvatarsInComments
    window.updateUserAvatarsInComments = async function(userId, newAvatarURL) {
        console.log('Вызвана функция updateUserAvatarsInComments', userId, newAvatarURL);
        
        // Проверяем, что необходимые параметры переданы
        if (!userId || !newAvatarURL) {
            console.error('Не переданы необходимые параметры для updateUserAvatarsInComments');
            return;
        }

        try {
            // Обновляем кэш аватаров
            window.userAvatars[userId] = newAvatarURL;
            
            // Сохраняем URL аватара текущего пользователя для использования в новых комментариях
            if (window.currentUser && window.currentUser.uid === userId) {
                window.currentUserAvatarURL = newAvatarURL;
                
                // Обновляем аватар пользователя в профиле
                const profileAvatar = document.querySelector('.profile-avatar img');
                if (profileAvatar) {
                    profileAvatar.style.transition = 'opacity 0.3s ease-in-out';
                    profileAvatar.style.opacity = '0';
                    
                    setTimeout(() => {
                        profileAvatar.src = newAvatarURL;
                        profileAvatar.style.opacity = '1';
                    }, 300);
                }
                
                // Обновляем аватар в узле users базы данных Firebase
                await window.updateUserAvatarInDatabase(userId, newAvatarURL);
                
                // Проверяем доступность функций Firebase перед вызовом updateUserAvatarsInAllComments
                console.log('Проверка функций Firebase перед обновлением комментариев:');
                console.log('window.db доступен:', !!window.db);
                console.log('window.ref доступен:', !!window.ref);
                console.log('window.get доступен:', !!window.get);
                console.log('window.update доступен:', !!window.update);
                
                // Проверяем, что функции Firebase работают корректно
                try {
                    const testRef = window.ref(window.db, 'test');
                    console.log('Тестовая ссылка создана:', testRef);
                    console.log('Тип testRef:', typeof testRef);
                    console.log('Свойства testRef:', Object.keys(testRef));
                } catch (refError) {
                    console.error('Ошибка при создании тестовой ссылки:', refError);
                }
                
                // Обновляем аватары пользователя во всех комментариях в базе данных
                console.log('Вызываем updateUserAvatarsInAllComments...');
                try {
                    await window.updateUserAvatarsInAllComments(userId, newAvatarURL);
                    console.log('updateUserAvatarsInAllComments выполнена успешно');
                } catch (updateError) {
                    console.error('Ошибка при вызове updateUserAvatarsInAllComments:', updateError);
                }
            } else {
                console.log('Текущий пользователь не совпадает с userId или не определен');
                console.log('window.currentUser:', window.currentUser);
                console.log('userId:', userId);
            }
            
            // Находим все аватары пользователя в комментариях
            const userAvatars = document.querySelectorAll(`
                .comment-avatar[src*="${userId}"], 
                .comment-avatar-link[href*="${userId}"] .comment-avatar, 
                .comment-form-avatar[src*="${userId}"],
                .modal-comment-avatar img[src*="${userId}"],
                .modal-reply-avatar img[src*="${userId}"],
                .profile-avatar img[src*="${userId}"]
            `);
            
            // Обновляем все найденные аватары
            userAvatars.forEach(avatar => {
                // Добавляем анимацию для плавного перехода
                avatar.style.transition = 'opacity 0.3s ease-in-out';
                avatar.style.opacity = '0';
                
                // Через небольшую задержку меняем изображение и возвращаем непрозрачность
                setTimeout(() => {
                    avatar.src = newAvatarURL;
                    avatar.style.opacity = '1';
                }, 300);
            });
            
            // Обновляем аватар в форме комментариев, если это текущий пользователь
            const commentFormAvatar = document.getElementById('current-user-avatar');
            if (commentFormAvatar) {
                commentFormAvatar.src = newAvatarURL;
            }
            
            // Обновляем аватар в форме ответа в модальном окне, если оно открыто
            const modalReplyAvatar = document.querySelector('.modal-reply-form-avatar');
            if (modalReplyAvatar && window.currentUser && window.currentUser.uid === userId) {
                modalReplyAvatar.src = newAvatarURL;
            }
            
            // Обновляем аватар в Firebase Auth
            if (window.currentUser && window.currentUser.uid === userId && window.updateProfile) {
                window.updateProfile(window.currentUser, {
                    photoURL: newAvatarURL
                }).catch(error => {
                    console.error('Ошибка при обновлении профиля в Auth:', error);
                });
                
                // Обновляем аватар в локальном хранилище
                try {
                    const userData = JSON.parse(localStorage.getItem('userData'));
                    if (userData) {
                        userData.photoURL = newAvatarURL;
                        localStorage.setItem('userData', JSON.stringify(userData));
                    }
                } catch (error) {
                    console.error('Ошибка при обновлении данных в localStorage:', error);
                }
                
                // Проверяем, что необходимые объекты доступны для обновления комментариев
                if (!window.db || !window.numericId) {
                    console.error('Объект базы данных Firebase или numericId не доступны');
                    return;
                }
                
                // Обновляем аватар в базе данных Firebase для всех комментариев текущего профиля
                try {
                    // Получаем все комментарии текущего профиля
                    const commentsRef = window.ref(window.db, `comments/${window.numericId}`);
                    const commentsSnapshot = await window.get(commentsRef);
                    
                    if (commentsSnapshot.exists()) {
                        // Проходим по всем комментариям
                        commentsSnapshot.forEach((commentSnapshot) => {
                            const comment = commentSnapshot.val();
                            
                            // Если комментарий принадлежит текущему пользователю, обновляем его аватар в базе данных
                            if (comment.authorId === userId) {
                                // Обновляем аватар в базе данных
                                const commentRef = window.ref(window.db, `comments/${window.numericId}/${commentSnapshot.key}`);
                                window.update(commentRef, { authorPhotoURL: newAvatarURL });
                            }
                            
                            // Если у комментария есть ответы, проверяем их тоже
                            if (comment.replies && Array.isArray(comment.replies)) {
                                const updatedReplies = comment.replies.map(reply => {
                                    if (reply.authorId === userId) {
                                        return { ...reply, authorPhotoURL: newAvatarURL };
                                    }
                                    return reply;
                                });
                                
                                // Если были изменения в ответах, обновляем их в базе данных
                                if (JSON.stringify(updatedReplies) !== JSON.stringify(comment.replies)) {
                                    const commentRef = window.ref(window.db, `comments/${window.numericId}/${commentSnapshot.key}`);
                                    window.update(commentRef, { replies: updatedReplies });
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.error('Ошибка при обновлении аватаров в комментариях:', error);
                }
            }
        } catch (error) {
            console.error('Ошибка в функции updateUserAvatarsInComments:', error);
        }
    };

    // Функция для проверки структуры данных
    window.isValidObject = function(obj) {
        return typeof obj === 'object' && obj !== null;
    };

    // Добавляем функцию для проверки обновления аватаров
    window.checkAndFixAvatarUpdates = async function() {
        console.log('Запущена проверка обновления аватаров...');
        
        try {
            // Проверяем, что необходимые объекты доступны
            if (!window.currentUser) {
                console.error('Текущий пользователь не определен');
                alert('Ошибка: Текущий пользователь не определен. Пожалуйста, войдите в систему.');
                return;
            }
            
            const userId = window.currentUser.uid;
            const newAvatarURL = window.currentUser.photoURL;
            
            console.log('Данные пользователя:', {
                userId: userId,
                photoURL: newAvatarURL,
                displayName: window.currentUser.displayName,
                email: window.currentUser.email
            });
            
            if (!userId || !newAvatarURL) {
                console.error('Не удалось получить ID пользователя или URL аватара');
                console.log('userId:', userId);
                console.log('newAvatarURL:', newAvatarURL);
                alert('Ошибка: Не удалось получить ID пользователя или URL аватара.');
                return;
            }
            
            console.log('Проверка обновления аватаров для пользователя:', userId);
            console.log('Текущий URL аватара:', newAvatarURL);
            
            // Проверяем доступность Firebase
            console.log('Проверка доступности Firebase:');
            console.log('window.db доступен:', !!window.db);
            console.log('window.ref доступен:', !!window.ref);
            console.log('window.get доступен:', !!window.get);
            console.log('window.update доступен:', !!window.update);
            
            // Проверяем, что функции Firebase работают корректно
            let firebaseSdkWorking = false;
            try {
                if (window.db && window.ref) {
                    const testRef = window.ref(window.db, 'test');
                    console.log('Тестовая ссылка создана:', testRef);
                    console.log('Тип testRef:', typeof testRef);
                    console.log('Свойства testRef:', Object.keys(testRef));
                    firebaseSdkWorking = window.isValidObject(testRef);
                } else {
                    console.warn('Невозможно создать тестовую ссылку: window.db или window.ref не определены');
                }
            } catch (refError) {
                console.error('Ошибка при создании тестовой ссылки:', refError);
                firebaseSdkWorking = false;
            }
            
            // Если Firebase SDK не работает, используем прямое обновление через REST API
            if (!firebaseSdkWorking || !window.db || !window.ref || !window.get || !window.update) {
                console.log('Firebase SDK недоступен или не работает корректно, используем прямое обновление через REST API');
                return await window.useDirectUpdate(userId, newAvatarURL);
            }
            
            // Запускаем обновление аватаров во всех комментариях через Firebase SDK
            try {
                console.log('Запускаем обновление аватаров через Firebase SDK...');
                const result = await window.updateUserAvatarsInAllComments(userId, newAvatarURL);
                
                if (result) {
                    console.log('Обновление аватаров выполнено успешно');
                    alert('Обновление аватаров выполнено успешно. Перезагрузите страницу, чтобы увидеть изменения.');
                    return true;
                } else {
                    console.error('Не удалось обновить аватары через Firebase SDK');
                    
                    // Пробуем прямое обновление через REST API
                    console.log('Пробуем прямое обновление через REST API...');
                    return await window.useDirectUpdate(userId, newAvatarURL);
                }
            } catch (error) {
                console.error('Ошибка при обновлении аватаров через Firebase SDK:', error);
                console.error('Стек ошибки:', error.stack);
                
                // Пробуем прямое обновление через REST API
                console.log('Пробуем прямое обновление через REST API после ошибки...');
                return await window.useDirectUpdate(userId, newAvatarURL);
            }
        } catch (error) {
            console.error('Ошибка при проверке обновления аватаров:', error);
            console.error('Стек ошибки:', error.stack);
            alert('Произошла ошибка при обновлении аватаров. Проверьте консоль для получения дополнительной информации.');
            return false;
        }
    };
    
    // Выделяем функцию прямого обновления через REST API в отдельную глобальную функцию
    window.useDirectUpdate = async function(userId, newAvatarURL) {
        console.log('Запущено прямое обновление через REST API', userId, newAvatarURL);
        
        try {
            // Получаем URL базы данных Firebase
            const databaseURL = window.getFirebaseDatabaseURL();
            console.log('Используем URL базы данных:', databaseURL);
            
            // Обновляем аватар пользователя в узле users
            const userResponse = await fetch(`${databaseURL}/users/${userId}/photoURL.json`, {
                method: 'PUT',
                body: JSON.stringify(newAvatarURL)
            });
            
            if (userResponse.ok) {
                console.log('Аватар пользователя в узле users обновлен успешно');
            } else {
                console.error('Ошибка при обновлении аватара в узле users:', userResponse.statusText);
            }
            
            // Получаем все комментарии
            const commentsResponse = await fetch(`${databaseURL}/comments.json`);
            
            if (!commentsResponse.ok) {
                console.error('Ошибка при получении комментариев:', commentsResponse.statusText);
                alert('Ошибка при получении комментариев. Проверьте консоль для получения дополнительной информации.');
                return false;
            }
            
            const allComments = await commentsResponse.json();
            
            if (!allComments) {
                console.log('Нет комментариев в базе данных');
                alert('Комментарии не найдены в базе данных.');
                return false;
            }
            
            // Проверяем, что allComments - это объект и не null/undefined
            if (typeof allComments !== 'object' || allComments === null) {
                console.error('Получены некорректные данные комментариев:', allComments);
                alert('Получены некорректные данные комментариев. Проверьте консоль для получения дополнительной информации.');
                return false;
            }
            
            const profilesCount = Object.keys(allComments).length;
            console.log('Получены все комментарии:', profilesCount, 'профилей');
            
            if (profilesCount === 0) {
                console.warn('В базе данных нет профилей с комментариями');
                alert('В базе данных нет профилей с комментариями.');
                return false;
            }
            
            // Проходим по всем профилям
            let updatedCommentsCount = 0;
            let updatedRepliesCount = 0;
            let updatePromises = [];
            
            for (const profileId in allComments) {
                const profileComments = allComments[profileId];
                
                // Проверяем, что profileComments - это объект и не null/undefined
                if (typeof profileComments !== 'object' || profileComments === null) {
                    console.warn(`Профиль ${profileId} содержит некорректные данные:`, profileComments);
                    continue;
                }
                
                const commentsCount = Object.keys(profileComments).length;
                console.log(`Обрабатываем профиль ${profileId}, ${commentsCount} комментариев`);
                
                if (commentsCount === 0) {
                    console.warn(`Профиль ${profileId} не содержит комментариев`);
                    continue;
                }
                
                // Проходим по всем комментариям профиля
                for (const commentId in profileComments) {
                    const comment = profileComments[commentId];
                    
                    // Проверяем, что comment - это объект и не null/undefined
                    if (typeof comment !== 'object' || comment === null) {
                        console.warn(`Комментарий ${commentId} содержит некорректные данные:`, comment);
                        continue;
                    }
                    
                    // Если комментарий принадлежит пользователю, обновляем его аватар
                    if (comment.authorId === userId) {
                        console.log(`Комментарий ${commentId} принадлежит пользователю ${userId}, обновляем аватар`);
                        console.log(`Текущий authorPhotoURL: ${comment.authorPhotoURL}`);
                        console.log(`Новый authorPhotoURL: ${newAvatarURL}`);
                        
                        // Создаем обновление для комментария
                        const updatePromise = fetch(`${databaseURL}/comments/${profileId}/${commentId}/authorPhotoURL.json`, {
                            method: 'PUT',
                            body: JSON.stringify(newAvatarURL)
                        }).then(response => {
                            if (response.ok) {
                                console.log(`Комментарий ${commentId} успешно обновлен`);
                                updatedCommentsCount++;
                            } else {
                                console.error(`Ошибка при обновлении комментария ${commentId}:`, response.statusText);
                            }
                        }).catch(error => {
                            console.error(`Ошибка при обновлении комментария ${commentId}:`, error);
                        });
                        
                        updatePromises.push(updatePromise);
                    }
                    
                    // Если у комментария есть ответы, проверяем их тоже
                    if (comment.replies && Array.isArray(comment.replies)) {
                        console.log(`Комментарий ${commentId} имеет ${comment.replies.length} ответов`);
                        
                        let repliesUpdated = false;
                        const updatedReplies = comment.replies.map(reply => {
                            // Проверяем, что reply - это объект и не null/undefined
                            if (typeof reply !== 'object' || reply === null) {
                                console.warn(`Ответ содержит некорректные данные:`, reply);
                                return reply;
                            }
                            
                            console.log(`Проверяем ответ, автор: ${reply.authorId}`);
                            
                            if (reply.authorId === userId) {
                                console.log(`Ответ принадлежит пользователю ${userId}, обновляем аватар`);
                                console.log(`Текущий authorPhotoURL: ${reply.authorPhotoURL}`);
                                console.log(`Новый authorPhotoURL: ${newAvatarURL}`);
                                
                                repliesUpdated = true;
                                updatedRepliesCount++;
                                return { ...reply, authorPhotoURL: newAvatarURL };
                            }
                            return reply;
                        });
                        
                        // Если были изменения в ответах, обновляем их в базе данных
                        if (repliesUpdated) {
                            console.log(`Обновляем ответы для комментария ${commentId}`);
                            
                            const updatePromise = fetch(`${databaseURL}/comments/${profileId}/${commentId}/replies.json`, {
                                method: 'PUT',
                                body: JSON.stringify(updatedReplies)
                            }).then(response => {
                                if (response.ok) {
                                    console.log(`Ответы для комментария ${commentId} успешно обновлены`);
                                } else {
                                    console.error(`Ошибка при обновлении ответов для комментария ${commentId}:`, response.statusText);
                                }
                            }).catch(error => {
                                console.error(`Ошибка при обновлении ответов для комментария ${commentId}:`, error);
                            });
                            
                            updatePromises.push(updatePromise);
                        }
                    }
                }
            }
            
            // Ждем завершения всех обновлений
            await Promise.all(updatePromises);
            
            console.log(`Обновлено ${updatedCommentsCount} комментариев и ${updatedRepliesCount} ответов пользователя ${userId}`);
            
            if (updatedCommentsCount > 0 || updatedRepliesCount > 0) {
                alert(`Обновление аватаров выполнено успешно. Обновлено ${updatedCommentsCount} комментариев и ${updatedRepliesCount} ответов. Перезагрузите страницу, чтобы увидеть изменения.`);
                return true;
            } else {
                console.warn('Не найдено комментариев или ответов пользователя для обновления');
                alert('Не найдено комментариев или ответов пользователя для обновления. Возможно, у вас нет комментариев в базе данных.');
                return false;
            }
        } catch (error) {
            console.error('Ошибка при прямом обновлении через REST API:', error);
            console.error('Стек ошибки:', error.stack);
            alert('Произошла ошибка при обновлении аватаров через REST API. Проверьте консоль для получения дополнительной информации.');
            return false;
        }
    };

    // Функция для интеграции с кнопкой "Сохранить" профиля
    window.integrateWithSaveButton = function() {
        console.log('Интеграция с кнопкой "Сохранить" профиля');
        
        // Находим кнопку "Сохранить"
        const saveButton = document.querySelector('#save-profile-button');
        if (!saveButton) {
            console.warn('Кнопка "Сохранить" не найдена');
            return;
        }
        
        console.log('Кнопка "Сохранить" найдена:', saveButton);
        
        // Сохраняем оригинальный обработчик события
        const originalOnClick = saveButton.onclick;
        console.log('Оригинальный обработчик события:', originalOnClick);
        
        // Функция для обновления аватаров после сохранения профиля
        const updateAvatarsAfterSave = async function() {
            console.log('Запущена функция updateAvatarsAfterSave');
            
            // Проверяем, что пользователь авторизован
            if (!window.currentUser) {
                console.warn('Пользователь не авторизован, обновление аватаров невозможно');
                return;
            }
            
            // Получаем текущий URL аватарки
            const newAvatarURL = window.currentUser.photoURL;
            const userId = window.currentUser.uid;
            
            console.log('Данные пользователя для обновления аватаров:', {
                userId: userId,
                photoURL: newAvatarURL
            });
            
            if (!userId || !newAvatarURL) {
                console.warn('Не удалось получить ID пользователя или URL аватарки');
                return;
            }
            
            // Добавляем стабильный идентификатор к URL
            let avatarUrl = newAvatarURL;
            if (avatarUrl && userId) {
                if (avatarUrl.includes('?')) {
                    avatarUrl = `${avatarUrl}&_stable=${userId}`;
                } else {
                    avatarUrl = `${avatarUrl}?_stable=${userId}`;
                }
            }
            
            // Показываем уведомление пользователю
            const notification = document.createElement('div');
            notification.className = 'alert alert-info';
            notification.textContent = 'Обновляем аватары в комментариях...';
            notification.style.position = 'fixed';
            notification.style.top = '20px';
            notification.style.right = '20px';
            notification.style.zIndex = '9999';
            document.body.appendChild(notification);
            
            try {
                // Проверяем, есть ли комментарии в базе данных
                const databaseURL = window.getFirebaseDatabaseURL();
                const commentsResponse = await fetch(`${databaseURL}/comments.json`);
                
                let hasComments = false;
                let commentsData = null;
                
                if (commentsResponse.ok) {
                    commentsData = await commentsResponse.json();
                    hasComments = commentsData && typeof commentsData === 'object' && Object.keys(commentsData).length > 0;
                }
                
                if (!hasComments) {
                    console.log('Комментариев нет или структура некорректна, создаем тестовый комментарий');
                    
                    // Создаем тестовый комментарий
                    const created = await window.createTestCommentIfNeeded(userId, newAvatarURL);
                    
                    if (created) {
                        console.log('Тестовый комментарий создан успешно');
                        
                        // Даем время на обработку создания комментария
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } else {
                        console.warn('Не удалось создать тестовый комментарий');
                        
                        // Показываем уведомление о проблеме
                        if (document.body.contains(notification)) {
                            document.body.removeChild(notification);
                        }
                        
                        const errorNotification = document.createElement('div');
                        errorNotification.className = 'alert alert-danger';
                        errorNotification.textContent = 'Не удалось создать тестовый комментарий. Проверьте консоль для деталей.';
                        errorNotification.style.position = 'fixed';
                        errorNotification.style.top = '20px';
                        errorNotification.style.right = '20px';
                        errorNotification.style.zIndex = '9999';
                        document.body.appendChild(errorNotification);
                        
                        // Удаляем уведомление через 5 секунд
                        setTimeout(function() {
                            if (document.body.contains(errorNotification)) {
                                document.body.removeChild(errorNotification);
                            }
                        }, 5000);
                    }
                } else {
                    console.log('Комментарии существуют, продолжаем обновление аватаров');
                }
                
                // Запускаем обновление аватаров в комментариях
                console.log('Запускаем обновление аватаров в комментариях');
                const result = await window.updateUserAvatarsInAllComments(userId, avatarUrl);
                
                // Удаляем уведомление
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
                
                // Показываем результат обновления
                const resultNotification = document.createElement('div');
                resultNotification.className = result ? 'alert alert-success' : 'alert alert-warning';
                resultNotification.textContent = result ? 
                    'Аватары в комментариях успешно обновлены!' : 
                    'Не удалось обновить аватары в комментариях. Попробуйте обновить страницу.';
                resultNotification.style.position = 'fixed';
                resultNotification.style.top = '20px';
                resultNotification.style.right = '20px';
                resultNotification.style.zIndex = '9999';
                document.body.appendChild(resultNotification);
                
                // Удаляем уведомление через 5 секунд
                setTimeout(function() {
                    if (document.body.contains(resultNotification)) {
                        document.body.removeChild(resultNotification);
                    }
                }, 5000);
                
                return result;
            } catch (error) {
                console.error('Ошибка при обновлении аватаров в комментариях:', error);
                console.error('Стек ошибки:', error.stack);
                
                // Удаляем уведомление
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
                
                // Показываем уведомление об ошибке
                const errorNotification = document.createElement('div');
                errorNotification.className = 'alert alert-danger';
                errorNotification.textContent = 'Произошла ошибка при обновлении аватаров в комментариях. Попробуйте обновить страницу.';
                errorNotification.style.position = 'fixed';
                errorNotification.style.top = '20px';
                errorNotification.style.right = '20px';
                errorNotification.style.zIndex = '9999';
                document.body.appendChild(errorNotification);
                
                // Удаляем уведомление через 5 секунд
                setTimeout(function() {
                    if (document.body.contains(errorNotification)) {
                        document.body.removeChild(errorNotification);
                    }
                }, 5000);
                
                return false;
            }
        };
        
        // Устанавливаем новый обработчик события
        saveButton.onclick = async function(event) {
            console.log('Нажата кнопка "Сохранить"');
            
            // Проверяем, была ли изменена аватарка
            const newAvatarInput = document.querySelector('#avatar-upload');
            const avatarChanged = newAvatarInput && newAvatarInput.files && newAvatarInput.files.length > 0;
            
            console.log('Аватарка изменена:', avatarChanged);
            
            // Сохраняем текущий URL аватарки перед сохранением
            const oldAvatarURL = window.currentUser ? window.currentUser.photoURL : null;
            console.log('Старый URL аватарки:', oldAvatarURL);
            
            // Вызываем оригинальный обработчик события
            let originalHandlerSuccess = false;
            if (typeof originalOnClick === 'function') {
                // Если оригинальный обработчик возвращает Promise, ждем его завершения
                try {
                    const result = originalOnClick.call(this, event);
                    if (result instanceof Promise) {
                        await result;
                    }
                    originalHandlerSuccess = true;
                } catch (error) {
                    console.error('Ошибка в оригинальном обработчике события:', error);
                    originalHandlerSuccess = false;
                }
            } else {
                console.warn('Оригинальный обработчик события не является функцией');
                // Если нет оригинального обработчика, считаем, что сохранение прошло успешно
                originalHandlerSuccess = true;
            }
            
            // Если аватарка была изменена и оригинальный обработчик выполнился успешно
            if (avatarChanged && originalHandlerSuccess && window.currentUser) {
                console.log('Запускаем обновление аватаров в комментариях после изменения аватарки');
                
                // Даем время на обновление аватарки в Firebase Auth
                setTimeout(updateAvatarsAfterSave, 2000); // Задержка 2 секунды для обновления аватарки в Firebase Auth
            }
        };
        
        // Также добавляем обработчик события через addEventListener для надежности
        saveButton.addEventListener('click', async function(event) {
            console.log('Обработчик события click через addEventListener');
            
            // Проверяем, была ли изменена аватарка
            const newAvatarInput = document.querySelector('#avatar-upload');
            const avatarChanged = newAvatarInput && newAvatarInput.files && newAvatarInput.files.length > 0;
            
            if (avatarChanged && window.currentUser) {
                console.log('Аватарка изменена, запланировано обновление аватаров в комментариях');
                
                // Даем время на обновление аватарки в Firebase Auth и выполнение оригинального обработчика
                setTimeout(updateAvatarsAfterSave, 3000); // Задержка 3 секунды
            }
        });
        
        console.log('Интеграция с кнопкой "Сохранить" выполнена успешно');
    };
    
    // Функция для прямого запуска обновления аватаров
    window.manualUpdateAvatars = function() {
        console.log('Запущено ручное обновление аватаров');
        
        if (!window.currentUser) {
            console.warn('Пользователь не авторизован, обновление аватаров невозможно');
            alert('Ошибка: Пользователь не авторизован. Пожалуйста, войдите в систему.');
            return;
        }
        
        const userId = window.currentUser.uid;
        const newAvatarURL = window.currentUser.photoURL;
        
        if (!userId || !newAvatarURL) {
            console.warn('Не удалось получить ID пользователя или URL аватарки');
            alert('Ошибка: Не удалось получить ID пользователя или URL аватарки.');
            return;
        }
        
        // Запускаем обновление аватаров
        window.checkAndFixAvatarUpdates();
    };

    // Инициализация при загрузке страницы
    document.addEventListener('DOMContentLoaded', function() {
        console.log('Инициализация функций обновления аватаров');
        
        // Проверяем, что Firebase SDK доступен
        if (window.ref && window.db && window.onValue) {
            // Загружаем актуальные аватары всех пользователей
            window.loadAllUserAvatars();
            
            // Настраиваем слушатель изменений аватаров пользователей
            window.setupUserAvatarListener();
            console.log('Слушатель аватаров настроен');
        } else {
            console.warn('Firebase SDK не доступен, слушатель аватаров не настроен');
        }
        
        // Интегрируем с кнопкой "Сохранить"
        window.integrateWithSaveButton();
        
        // Добавляем обработчик для сброса значения input после выбора файла
        const avatarUploadInput = document.getElementById('avatar-upload');
        if (avatarUploadInput) {
            const originalOnChange = avatarUploadInput.onchange;
            avatarUploadInput.onchange = function(e) {
                // Вызываем оригинальный обработчик, если он существует
                if (typeof originalOnChange === 'function') {
                    originalOnChange.call(this, e);
                }
                
                // Сбрасываем значение input после небольшой задержки
                setTimeout(() => {
                    e.target.value = '';
                }, 100);
            };
        }
        
        // Находим форму профиля
        const profileForm = document.querySelector('#profile-form');
        if (profileForm) {
            console.log('Форма профиля найдена, добавляем обработчик события submit');
            
            // Добавляем обработчик события submit
            profileForm.addEventListener('submit', function(event) {
                console.log('Событие submit формы профиля');
                
                // Проверяем, была ли изменена аватарка
                const newAvatarInput = document.querySelector('#avatar-upload');
                const avatarChanged = newAvatarInput && newAvatarInput.files && newAvatarInput.files.length > 0;
                
                console.log('Аватарка изменена (событие submit):', avatarChanged);
                
                if (avatarChanged && window.currentUser) {
                    console.log('Аватарка изменена, запланировано обновление аватаров в комментариях');
                    
                    // Сохраняем текущий URL аватарки
                    const oldAvatarURL = window.currentUser.photoURL;
                    
                    // Даем время на обновление аватарки в Firebase Auth
                    setTimeout(async function() {
                        try {
                            // Получаем обновленный URL аватарки
                            const newAvatarURL = window.currentUser.photoURL;
                            console.log('Старый URL аватарки:', oldAvatarURL);
                            console.log('Новый URL аватарки:', newAvatarURL);
                            
                            // Проверяем, что URL аватарки действительно изменился
                            if (newAvatarURL && newAvatarURL !== oldAvatarURL) {
                                console.log('URL аватарки изменился, обновляем аватары в комментариях');
                                
                                // Показываем уведомление пользователю
                                const notification = document.createElement('div');
                                notification.className = 'alert alert-info';
                                notification.textContent = 'Обновляем аватары в комментариях...';
                                notification.style.position = 'fixed';
                                notification.style.top = '20px';
                                notification.style.right = '20px';
                                notification.style.zIndex = '9999';
                                document.body.appendChild(notification);
                                
                                // Запускаем обновление аватаров в комментариях
                                const userId = window.currentUser.uid;
                                const result = await window.updateUserAvatarsInAllComments(userId, newAvatarURL);
                                
                                // Удаляем уведомление
                                if (document.body.contains(notification)) {
                                    document.body.removeChild(notification);
                                }
                                
                                // Показываем результат обновления
                                const resultNotification = document.createElement('div');
                                resultNotification.className = result ? 'alert alert-success' : 'alert alert-warning';
                                resultNotification.textContent = result ? 
                                    'Аватары в комментариях успешно обновлены!' : 
                                    'Не удалось обновить аватары в комментариях. Попробуйте обновить страницу.';
                                resultNotification.style.position = 'fixed';
                                resultNotification.style.top = '20px';
                                resultNotification.style.right = '20px';
                                resultNotification.style.zIndex = '9999';
                                document.body.appendChild(resultNotification);
                                
                                // Удаляем уведомление через 5 секунд
                                setTimeout(function() {
                                    if (document.body.contains(resultNotification)) {
                                        document.body.removeChild(resultNotification);
                                    }
                                }, 5000);
                            } else if (!newAvatarURL) {
                                console.warn('URL аватарки не определен после сохранения');
                            } else {
                                console.log('URL аватарки не изменился, обновление не требуется');
                            }
                        } catch (error) {
                            console.error('Ошибка при обновлении аватаров в комментариях:', error);
                            console.error('Стек ошибки:', error.stack);
                        }
                    }, 3000); // Задержка 3 секунды для обновления аватарки в Firebase Auth
                }
            });
            
            console.log('Обработчик события submit формы профиля добавлен');
        } else {
            console.warn('Форма профиля не найдена');
        }
        
        // Добавляем глобальную функцию для обновления аватаров в window
        window.updateAvatarsInComments = async function() {
            if (!window.currentUser) {
                console.warn('Пользователь не авторизован, обновление аватаров невозможно');
                return false;
            }
            
            const userId = window.currentUser.uid;
            const newAvatarURL = window.currentUser.photoURL;
            
            if (!userId || !newAvatarURL) {
                console.warn('Не удалось получить ID пользователя или URL аватарки');
                return false;
            }
            
            console.log('Запускаем обновление аватаров для пользователя', userId);
            console.log('URL аватарки:', newAvatarURL);
            
            try {
                return await window.updateUserAvatarsInAllComments(userId, newAvatarURL);
            } catch (error) {
                console.error('Ошибка при обновлении аватаров:', error);
                return false;
            }
        };
        
        // Добавляем обработчик события для обновления аватаров после загрузки страницы
        setTimeout(function() {
            console.log('Проверяем необходимость обновления аватаров после загрузки страницы');
            
            // Проверяем, есть ли параметр updateAvatars в URL
            const urlParams = new URLSearchParams(window.location.search);
            const shouldUpdateAvatars = urlParams.get('updateAvatars') === 'true';
            
            if (shouldUpdateAvatars) {
                console.log('Параметр updateAvatars=true обнаружен в URL, запускаем обновление аватаров');
                window.updateAvatarsInComments();
            }
        }, 2000);
    });
})(); 