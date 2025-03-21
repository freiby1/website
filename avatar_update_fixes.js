/**
 * Исправления для функций обновления аватаров
 * 
 * Скопируйте и вставьте эти функции в ваш файл profile.html
 * в раздел <script type="module"> перед функцией updateUserAvatarsInComments
 */

// Функция для обновления аватара пользователя в узле users базы данных
async function updateUserAvatarInDatabase(userId, newAvatarURL) {
    try {
        const userRef = ref(db, `users/${userId}`);
        const userSnapshot = await get(userRef);
        
        if (userSnapshot.exists()) {
            // Обновляем только поле photoURL
            update(userRef, { photoURL: newAvatarURL });
        } else {
            // Если записи пользователя нет, создаем ее
            set(userRef, {
                photoURL: newAvatarURL,
                displayName: currentUser.displayName || '',
                email: currentUser.email || ''
            });
        }
    } catch (error) {
        console.error('Ошибка при обновлении аватара в узле users:', error);
    }
}

// Функция для обновления аватаров пользователя на странице (без обновления в базе данных)
function updateUserAvatarsOnPage(userId, photoURL) {
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
            avatar.src = photoURL;
            avatar.style.opacity = '1';
        }, 300);
    });
}

// Функция для настройки слушателя изменений аватаров пользователей
function setupUserAvatarListener() {
    // Слушаем изменения в узле users
    const usersRef = ref(db, 'users');
    
    // Используем onValue из Firebase
    onValue(usersRef, (snapshot) => {
        if (snapshot.exists()) {
            const users = snapshot.val();
            
            // Проходим по всем пользователям
            Object.keys(users).forEach(userId => {
                const user = users[userId];
                if (user && user.photoURL) {
                    // Обновляем все аватары этого пользователя на странице
                    updateUserAvatarsOnPage(userId, user.photoURL);
                }
            });
        }
    });
}

/**
 * Обновленная функция updateUserAvatarsInComments
 * Замените существующую функцию на эту
 */
async function updateUserAvatarsInComments(userId, newAvatarURL) {
    // Сохраняем URL аватара текущего пользователя для использования в новых комментариях
    if (currentUser && currentUser.uid === userId) {
        currentUserAvatarURL = newAvatarURL;
        
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
        await updateUserAvatarInDatabase(userId, newAvatarURL);
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
    if (modalReplyAvatar && currentUser && currentUser.uid === userId) {
        modalReplyAvatar.src = newAvatarURL;
    }
    
    // Обновляем аватар в Firebase Auth
    if (currentUser && currentUser.uid === userId) {
        updateProfile(currentUser, {
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
        
        // Обновляем аватар в базе данных Firebase для всех комментариев пользователя
        try {
            // Получаем все комментарии текущего профиля
            const commentsRef = ref(db, `comments/${numericId}`);
            const commentsSnapshot = await get(commentsRef);
            
            if (commentsSnapshot.exists()) {
                // Проходим по всем комментариям
                commentsSnapshot.forEach((commentSnapshot) => {
                    const comment = commentSnapshot.val();
                    
                    // Если комментарий принадлежит текущему пользователю, обновляем его аватар в базе данных
                    if (comment.authorId === userId) {
                        // Обновляем аватар в базе данных
                        const commentRef = ref(db, `comments/${numericId}/${commentSnapshot.key}`);
                        update(commentRef, { authorPhotoURL: newAvatarURL });
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
                            const commentRef = ref(db, `comments/${numericId}/${commentSnapshot.key}`);
                            update(commentRef, { replies: updatedReplies });
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Ошибка при обновлении аватаров в комментариях:', error);
        }
    }
}

/**
 * Добавьте вызов функции setupUserAvatarListener в обработчик DOMContentLoaded
 * 
 * document.addEventListener('DOMContentLoaded', function() {
 *     // ... existing code ...
 *     
 *     // Настраиваем слушатель изменений аватаров пользователей
 *     setupUserAvatarListener();
 * });
 */ 