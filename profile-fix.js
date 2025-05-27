// Функция для прокрутки к оригинальному комментарию
window.scrollToOriginalComment = function(commentId) {
    console.log("Scrolling to comment:", commentId);
    // Пробуем найти комментарий по data-comment-id
    let originalComment = document.querySelector(`.comment[data-comment-id="${commentId}"]`);
    
    // Если не нашли, пробуем другие варианты селекторов
    if (!originalComment) {
        console.log("Comment not found by data-comment-id, trying dataset.commentId");
        // Ищем все комментарии и проверяем их dataset
        const allComments = document.querySelectorAll('.comment');
        for (const comment of allComments) {
            if (comment.dataset.commentId === commentId) {
                originalComment = comment;
                console.log("Found comment using dataset.commentId");
                break;
            }
        }
    }
    
    if (originalComment) {
        console.log("Comment found, scrolling to it");
        // Добавляем подсветку для комментария
        originalComment.classList.add("highlight-comment");
        
        // Удаляем класс подсветки через некоторое время
        setTimeout(() => {
            originalComment.classList.remove("highlight-comment");
        }, 1500);
        
        // Плавно прокручиваем к комментарию
        originalComment.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
        console.error("Comment not found:", commentId);
    }
};

// Функция для удаления класса new-comment после завершения анимации
function handleNewComments() {
    // Получаем все комментарии с классом new-comment
    const newComments = document.querySelectorAll('.comment.new-comment');
    
    // Для каждого комментария устанавливаем таймер для удаления класса
    newComments.forEach(comment => {
        // Анимация длится 3 секунды, поэтому ставим таймер на 3 секунды
        setTimeout(() => {
            comment.classList.remove('new-comment');
            console.log('Класс new-comment удален для комментария', comment.dataset.commentId);
        }, 3000); // 3000мс = 3с, совпадает с длительностью анимации newCommentHighlight
    });
}

// Функция для обновления аватарки в сайдбаре
function updateSidebarAvatar(newAvatarURL) {
    console.log('Обновляем аватары в сайдбаре:', newAvatarURL);
    
    // Массив селекторов для всех возможных мест с аватаркой в интерфейсе
    const avatarSelectors = [
        // Основной аватар в сайдбаре
        {id: 'user-avatar', type: 'container'},
        // Мини-аватар в свернутом сайдбаре
        {id: 'mini-user-avatar', type: 'container'},
        // Выпадающее меню профиля
        {query: '.profile-dropdown-standalone img', type: 'img'},
        // Заголовок профиля (если есть)
        {query: '.user-profile-header img', type: 'img'},
        // Автор комментария "основного аватара" в хедере
        {query: '.header-user-avatar img', type: 'img'}
    ];
    
    // Обновляем каждый найденный элемент аватара
    avatarSelectors.forEach(selector => {
        let element;
        
        if (selector.id) {
            element = document.getElementById(selector.id);
        } else if (selector.query) {
            element = document.querySelector(selector.query);
        }
        
        if (!element) return; // Пропускаем если элемент не найден
        
        if (selector.type === 'container') {
            // Для контейнера аватара находим вложенный img или создаем новый
            const avatarImage = element.querySelector('img');
            if (avatarImage) {
                // Если есть элемент img, обновляем его src
                avatarImage.style.transition = 'opacity 0.3s ease-in-out';
                avatarImage.style.opacity = '0';
                
                setTimeout(() => {
                    avatarImage.src = newAvatarURL;
                    avatarImage.style.opacity = '1';
                }, 300);
            } else {
                // Если нет элемента img, создаем новый
                element.innerHTML = `<img src="${newAvatarURL}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; transition: opacity 0.3s ease-in-out;">`;
            }
        } else if (selector.type === 'img') {
            // Для элемента img обновляем src напрямую
            element.style.transition = 'opacity 0.3s ease-in-out';
            element.style.opacity = '0';
            
            setTimeout(() => {
                element.src = newAvatarURL;
                element.style.opacity = '1';
            }, 300);
        }
    });
    
    // Дополнительно ищем все аватарки по классу, которые могли быть добавлены динамически
    const avatarClasses = ['.user-avatar', '.header-avatar', '.profile-dropdown-avatar', '.sidebar-avatar'];
    
    avatarClasses.forEach(className => {
        const avatars = document.querySelectorAll(`${className} img`);
        avatars.forEach(avatar => {
            avatar.style.transition = 'opacity 0.3s ease-in-out';
            avatar.style.opacity = '0';
            
            setTimeout(() => {
                avatar.src = newAvatarURL;
                avatar.style.opacity = '1';
            }, 300);
        });
    });
}

// Настройка наблюдателя за изменениями в DOM для обработки новых комментариев
document.addEventListener('DOMContentLoaded', function() {
    console.log('Применяем дополнительные исправления...');
    
    // Счетчик символов и автовысота textarea
    const commentInput = document.getElementById('comment-input');
    const characterCounter = document.getElementById('character-counter');
    const MAX_CHARS = 1000;
    
    if (commentInput && characterCounter) {
        // Функция для автоматического изменения высоты textarea
        function autoResizeTextarea() {
            commentInput.style.height = ''; // Сбрасываем высоту
            commentInput.style.height = Math.min(commentInput.scrollHeight, 300) + 'px';
        }
        
        // Функция для обновления счетчика символов
        function updateCharacterCount() {
            const length = commentInput.value.length;
            characterCounter.textContent = `${length}/${MAX_CHARS}`;
            
            // Показываем счетчик только когда есть текст
            if (length > 0) {
                characterCounter.classList.add('visible');
            } else {
                characterCounter.classList.remove('visible');
                commentInput.style.height = ''; // Сбрасываем высоту при пустом поле
            }
            
            // Изменяем стиль в зависимости от количества символов
            characterCounter.classList.remove('warning', 'error');
            if (length > MAX_CHARS * 0.8) {
                characterCounter.classList.add('warning');
            }
            if (length > MAX_CHARS * 0.95) {
                characterCounter.classList.add('error');
            }
        }
        
        // Применяем обработчики событий
        commentInput.addEventListener('input', function() {
            autoResizeTextarea();
            updateCharacterCount();
        });
        
        commentInput.addEventListener('focus', function() {
            autoResizeTextarea();
            updateCharacterCount();
        });
        
        // Сброс при очистке поля
        const cancelButton = document.getElementById('cancel-comment-button');
        if (cancelButton) {
            const originalClickHandler = cancelButton.onclick;
            
            cancelButton.onclick = function(e) {
                if (originalClickHandler) {
                    originalClickHandler.call(this, e);
                }
                
                // Сбрасываем счетчик и высоту
                characterCounter.classList.remove('visible');
                commentInput.style.height = '';
            };
        }
    }

    // Вызываем функцию для обработки уже существующих комментариев с классом new-comment
    handleNewComments();
    
    // Настраиваем MutationObserver для отслеживания новых комментариев
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            // Если были добавлены новые узлы
            if (mutation.addedNodes.length) {
                // Проверяем, есть ли среди добавленных узлов комментарии с классом new-comment
                let hasNewComments = false;
                
                mutation.addedNodes.forEach(node => {
                    // Проверяем, является ли узел элементом и имеет ли он класс comment и new-comment
                    if (node.nodeType === 1 && node.classList && 
                        node.classList.contains('comment') && 
                        node.classList.contains('new-comment')) {
                        hasNewComments = true;
                    }
                    
                    // Также проверяем вложенные элементы
                    if (node.nodeType === 1 && node.querySelectorAll) {
                        const nestedNewComments = node.querySelectorAll('.comment.new-comment');
                        if (nestedNewComments.length > 0) {
                            hasNewComments = true;
                        }
                    }
                });
                
                // Если были добавлены новые комментарии, обрабатываем их
                if (hasNewComments) {
                    handleNewComments();
                }
            }
        });
    });
    
    // Настраиваем наблюдателя для отслеживания изменений в дереве DOM
    observer.observe(document.body, { 
        childList: true,    // наблюдаем за добавлением/удалением дочерних элементов
        subtree: true       // наблюдаем за всем поддеревом
    });
    
    // Добавляем глобальный обработчик для кнопок "Отмена" в ответах
    document.body.addEventListener('click', function(e) {
        // Проверяем, была ли нажата кнопка отмены ответа
        if (e.target.closest('.cancel-reply-button')) {
            const button = e.target.closest('.cancel-reply-button');
            const commentId = button.dataset.commentId;
            if (!commentId) return;
            
            // Находим элемент комментария
            const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (!commentElement) return;
            
            // Находим форму ответа
            const replyForm = commentElement.querySelector('.reply-form');
            if (!replyForm) return;
            
            // Очищаем текстовое поле
            const replyInput = replyForm.querySelector('.reply-input');
            if (replyInput) {
                replyInput.value = '';
                replyInput.blur();
            }
            
            // Очищаем загруженные изображения
            if (commentElement.replyImageUpload && typeof commentElement.replyImageUpload.clearImages === 'function') {
                commentElement.replyImageUpload.clearImages();
            }
            
            // Скрываем форму ответа
            replyForm.classList.remove('active');
            
            // Предотвращаем дальнейшее всплытие события
            e.stopPropagation();
        }
    });
    
    // Исправляем кнопку отмены для основного комментария
    const cancelCommentButton = document.getElementById('cancel-comment-button');
    if (cancelCommentButton) {
        cancelCommentButton.addEventListener('click', function() {
            // Очищаем текстовое поле
            const commentInput = document.getElementById('comment-input');
            if (commentInput) {
                commentInput.value = '';
                commentInput.blur();
                commentInput.style.height = '55px'; // Возвращаем высоту к исходной
            }
            
            // Скрываем счетчик символов
            const characterCounter = document.getElementById('character-counter');
            if (characterCounter) {
                characterCounter.classList.remove('visible');
            }
            
            // Очищаем загруженные изображения
            if (window.commentImageUpload && typeof window.commentImageUpload.clearImages === 'function') {
                window.commentImageUpload.clearImages();
            }
        });
    }

    console.log('Заменяем функцию updateUserAvatarsInComments на улучшенную версию, которая обновляет аватары в сайдбаре');
    
    // Подменяем глобальную функцию для обновления аватаров
    window.updateUserAvatarsInComments = async function(userId, newAvatarURL) {
        console.log('Вызвана улучшенная функция updateUserAvatarsInComments', { userId, newAvatarURL });
        
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
            
            // Обновляем аватар в сайдбаре
            updateSidebarAvatar(newAvatarURL);
            
            // Обновляем аватар в узле users базы данных Firebase
            if (typeof window.updateUserAvatarInDatabase === 'function') {
                await window.updateUserAvatarInDatabase(userId, newAvatarURL);
            }
            
            // САМОЕ ВАЖНОЕ: Обновляем поле authorPhotoURL во всех комментариях этого пользователя в базе данных
            await updateAvatarInAllUserComments(userId, newAvatarURL);
        }
        
        // Обновляем существующие комментарии пользователя - более надежный способ
        try {
            // Находим все комментарии этого пользователя
            const userComments = document.querySelectorAll(`[data-author-id="${userId}"]`);
            console.log(`Найдено ${userComments.length} комментариев пользователя ${userId}`);
            
            userComments.forEach(comment => {
                // Находим аватар в комментарии
                const avatars = comment.querySelectorAll('.comment-avatar, .comment-header img, .comment-author-avatar');
                avatars.forEach(avatar => {
                    avatar.style.transition = 'opacity 0.3s ease-in-out';
                    avatar.style.opacity = '0';
                    
                    setTimeout(() => {
                        avatar.src = newAvatarURL;
                        avatar.style.opacity = '1';
                    }, 300);
                });
            });
        } catch (error) {
            console.error('Ошибка при обновлении аватаров в комментариях по data-author-id:', error);
        }
        
        // Дополнительно ищем по более широкому селектору (старый способ)
        // Находим все аватары пользователя в комментариях
        const userAvatars = document.querySelectorAll(`
            .comment-avatar[src*="${userId}"], 
            .comment-avatar-link[href*="${userId}"] .comment-avatar, 
            .comment-form-avatar[src*="${userId}"],
            .modal-comment-avatar img[src*="${userId}"],
            .modal-reply-avatar img[src*="${userId}"],
            .profile-avatar img[src*="${userId}"]
        `);
        
        console.log(`Найдено ${userAvatars.length} аватаров по URL селектору`);
        
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
        
        // Дополнительно ищем все аватарки в комментариях, если у них есть атрибут data-user-id
        const dataUserIdAvatars = document.querySelectorAll(`[data-user-id="${userId}"] img`);
        console.log(`Найдено ${dataUserIdAvatars.length} аватаров по data-user-id`);
        
        dataUserIdAvatars.forEach(avatar => {
            avatar.style.transition = 'opacity 0.3s ease-in-out';
            avatar.style.opacity = '0';
            
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
        if (window.currentUser && window.currentUser.uid === userId) {
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
            
            // Устанавливаем специальный флаг, чтобы не загружать устаревшие аватарки
            try {
                localStorage.setItem(`avatar_updated_${userId}`, Date.now().toString());
            } catch (error) {
                console.error('Ошибка при установке флага обновления аватара:', error);
            }
        }
        
        // Запускаем принудительное обновление кеша браузера для аватарок
        try {
            // Получаем все изображения на странице
            const allImages = document.querySelectorAll('img');
            // Перебираем изображения и добавляем случайный параметр к URL для тех, которые могут быть аватарками
            allImages.forEach(img => {
                const src = img.getAttribute('src');
                if (src && src.includes('/avatars/') && !src.includes('?v=')) {
                    // Добавляем параметр v= с временной меткой для обхода кеша
                    img.src = `${src}?v=${Date.now()}`;
                }
            });
        } catch (error) {
            console.error('Ошибка при обновлении кеша изображений:', error);
        }
    };

    // Добавляем обработчик отправки формы комментария для сброса высоты поля
    const commentForm = document.getElementById('comment-form');
    if (commentForm) {
        const originalSubmitHandler = commentForm.onsubmit;
        
        commentForm.addEventListener('submit', function(e) {
            // Не предотвращаем отправку формы, а выполняем дополнительные действия
            
            // Получаем элементы
            const commentInput = document.getElementById('comment-input');
            const characterCounter = document.getElementById('character-counter');
            
            // Устанавливаем таймер для сброса формы после отправки
            setTimeout(() => {
                if (commentInput) {
                    commentInput.style.height = '55px'; // Возвращаем высоту к исходной
                }
                
                if (characterCounter) {
                    characterCounter.classList.remove('visible');
                }
            }, 100); // Небольшая задержка, чтобы успела сработать стандартная очистка формы
        });
    }

    // Добавляем обработчик для полей ответа
    document.body.addEventListener('input', function(e) {
        // Проверяем, является ли элемент textarea с классом reply-input
        if (e.target.classList.contains('reply-input')) {
            const replyInput = e.target;
            const commentId = replyInput.closest('.reply-form').dataset.parentId;
            const counterElement = document.querySelector(`.reply-character-counter[data-comment-id="${commentId}"]`);
            
            // Функция для автоматического изменения высоты textarea
            function autoResizeReplyTextarea() {
                replyInput.style.height = ''; // Сбрасываем высоту
                replyInput.style.height = Math.min(replyInput.scrollHeight, 200) + 'px';
            }
            
            // Функция для обновления счетчика символов
            function updateReplyCharacterCount() {
                const length = replyInput.value.length;
                const MAX_CHARS = 1000;
                
                if (counterElement) {
                    counterElement.textContent = `${length}/${MAX_CHARS}`;
                    
                    // Показываем счетчик только когда есть текст
                    if (length > 0) {
                        counterElement.classList.add('visible');
                    } else {
                        counterElement.classList.remove('visible');
                        replyInput.style.height = ''; // Сбрасываем высоту при пустом поле
                    }
                    
                    // Изменяем стиль в зависимости от количества символов
                    counterElement.classList.remove('warning', 'error');
                    if (length > MAX_CHARS * 0.8) {
                        counterElement.classList.add('warning');
                    }
                    if (length > MAX_CHARS * 0.95) {
                        counterElement.classList.add('error');
                    }
                }
            }
            
            // Выполняем обе функции
            autoResizeReplyTextarea();
            updateReplyCharacterCount();
        }
    });
    
    // Добавляем обработчик для фокуса на полях ответа
    document.body.addEventListener('focus', function(e) {
        if (e.target.classList.contains('reply-input')) {
            const replyInput = e.target;
            // Получаем родительскую форму и её ID
            const replyForm = replyInput.closest('.reply-form');
            if (!replyForm) return;
            
            const commentId = replyForm.dataset.parentId;
            const counterElement = document.querySelector(`.reply-character-counter[data-comment-id="${commentId}"]`);
            
            // Обновляем высоту поля и счетчик
            replyInput.style.height = ''; // Сбрасываем высоту
            replyInput.style.height = Math.min(replyInput.scrollHeight, 200) + 'px';
            
            // Показываем счетчик, если в поле есть текст
            if (replyInput.value.length > 0 && counterElement) {
                counterElement.classList.add('visible');
            }
        }
    }, true);
    
    // Добавляем обработчик для кнопок отмены в формах ответа
    document.body.addEventListener('click', function(e) {
        // Проверяем, была ли нажата кнопка отмены ответа
        if (e.target.closest('.cancel-reply-button')) {
            const button = e.target.closest('.cancel-reply-button');
            const commentId = button.dataset.commentId;
            if (!commentId) return;
            
            // Находим элемент комментария
            const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (!commentElement) return;
            
            // Находим форму ответа
            const replyForm = commentElement.querySelector('.reply-form');
            if (!replyForm) return;
            
            // Находим текстовое поле и счетчик
            const replyInput = replyForm.querySelector('.reply-input');
            const counterElement = document.querySelector(`.reply-character-counter[data-comment-id="${commentId}"]`);
            
            // Очищаем текстовое поле и сбрасываем его высоту
            if (replyInput) {
                replyInput.value = '';
                replyInput.blur();
                replyInput.style.height = '55px'; // Возвращаем исходную высоту
            }
            
            // Скрываем счетчик символов
            if (counterElement) {
                counterElement.classList.remove('visible');
            }
            
            // Очищаем загруженные изображения
            if (commentElement.replyImageUpload && typeof commentElement.replyImageUpload.clearImages === 'function') {
                commentElement.replyImageUpload.clearImages();
            }
            
            // Скрываем форму ответа
            replyForm.classList.remove('active');
        }
    });
    
    // Добавляем обработчик отправки форм ответа
    document.body.addEventListener('submit', function(e) {
        // Проверяем, была ли отправлена форма ответа
        if (e.target.classList.contains('reply-form')) {
            const replyForm = e.target;
            const commentId = replyForm.dataset.parentId;
            
            // Получаем текстовое поле и счетчик
            const replyInput = replyForm.querySelector('.reply-input');
            const counterElement = document.querySelector(`.reply-character-counter[data-comment-id="${commentId}"]`);
            
            // Устанавливаем таймер для сброса формы после отправки
            setTimeout(() => {
                if (replyInput) {
                    replyInput.style.height = '55px'; // Возвращаем высоту к исходной
                }
                
                if (counterElement) {
                    counterElement.classList.remove('visible');
                }
            }, 100); // Небольшая задержка, чтобы успела сработать стандартная очистка формы
        }
    });
});

// Функция для обновления аватара во всех комментариях пользователя в базе данных
async function updateAvatarInAllUserComments(userId, newAvatarURL) {
    try {
        console.log('Начинаем обновление аватара в комментариях в базе данных Firebase');
        
        // Проверяем, что Firebase инициализирован и доступен
        if (!window.db || !window.dbRef || !window.dbGet || !window.dbUpdate) {
            console.error('Firebase функции не доступны');
            return;
        }
        
        // Показываем уведомление о процессе обновления
        if (typeof window.showInfo === 'function') {
            window.showInfo('Обновляем ваш аватар во всех комментариях...');
        }
        
        // Получаем все профили, где мог комментировать пользователь
        // Для этого получаем корневой узел comments
        const commentsRef = window.dbRef(window.db, 'comments');
        const commentsSnapshot = await window.dbGet(commentsRef);
        
        if (!commentsSnapshot.exists()) {
            console.log('В базе данных нет комментариев');
            return;
        }
        
        // Счетчики для статистики
        let totalProfiles = 0;
        let totalCommentsUpdated = 0;
        let totalRepliesUpdated = 0;
        
        // Перебираем все профили
        const profiles = commentsSnapshot.val();
        for (const profileId in profiles) {
            totalProfiles++;
            const profileComments = profiles[profileId];
            
            // Перебираем все комментарии в профиле
            for (const commentId in profileComments) {
                const comment = profileComments[commentId];
                
                // Проверяем, принадлежит ли комментарий пользователю
                if (comment.authorId === userId) {
                    // Обновляем аватар в комментарии
                    const commentRef = window.dbRef(window.db, `comments/${profileId}/${commentId}`);
                    await window.dbUpdate(commentRef, { authorPhotoURL: newAvatarURL });
                    totalCommentsUpdated++;
                }
                
                // Проверяем и обновляем ответы на комментарии
                if (comment.replies) {
                    for (const replyId in comment.replies) {
                        const reply = comment.replies[replyId];
                        
                        if (reply.authorId === userId) {
                            // Обновляем аватар в ответе
                            const replyRef = window.dbRef(window.db, `comments/${profileId}/${commentId}/replies/${replyId}`);
                            await window.dbUpdate(replyRef, { authorPhotoURL: newAvatarURL });
                            totalRepliesUpdated++;
                        }
                    }
                }
            }
        }
        
        console.log(`Обновление аватара завершено. Обработано профилей: ${totalProfiles}, обновлено комментариев: ${totalCommentsUpdated}, ответов: ${totalRepliesUpdated}`);
        
        // Показываем уведомление о завершении
        if (typeof window.showSuccess === 'function') {
            window.showSuccess(`Аватар обновлен в ${totalCommentsUpdated} комментариях и ${totalRepliesUpdated} ответах`);
        }
    } catch (error) {
        console.error('Ошибка при обновлении аватара в комментариях в базе данных:', error);
        
        // Показываем уведомление об ошибке
        if (typeof window.showError === 'function') {
            window.showError('Не удалось обновить аватар во всех комментариях');
        }
    }
} 