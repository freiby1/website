// Функция для обновления статуса пользователя с использованием update вместо set

// Функция для настройки переноса длинного текста статуса
function setupStatusTextWrapping() {
    console.log('Настройка переноса длинного текста статуса');
    
    const statusText = document.getElementById('status-text');
    const statusContainer = document.getElementById('profile-status');
    
    if (statusText) {
        // Прямое применение стилей к элементу
        statusText.style.wordBreak = 'break-word';  // Добавляем принудительный перенос слов
        statusText.style.wordWrap = 'break-word';
        statusText.style.overflowWrap = 'break-word';
        statusText.style.whiteSpace = 'normal';     // Используем normal вместо pre-wrap
        statusText.style.maxWidth = '300px';        // Ограничиваем ширину конкретным значением
        statusText.style.display = 'block';         // Используем block вместо inline-block
        statusText.style.textAlign = 'left';
        statusText.style.overflow = 'hidden';       // Добавляем скрытие переполнения
        statusText.style.margin = '0';              // Убираем автоматические отступы для левого выравнивания
        statusText.style.width = '100%';            // Занимаем всю доступную ширину
        statusText.style.fontStyle = 'normal';      // Убираем курсив
        statusText.style.fontSize = '14px';         // Устанавливаем размер шрифта 14px
    }
    
    if (statusContainer) {
        // Усиленные стили для контейнера
        statusContainer.style.flexWrap = 'wrap';
        statusContainer.style.display = 'block';    // Меняем на block
        statusContainer.style.maxWidth = '350px';   // Фиксированная максимальная ширина
        statusContainer.style.margin = '10px 0';
        statusContainer.style.textAlign = 'left';   // Левое выравнивание содержимого
        statusContainer.style.overflow = 'hidden';  // Скрытие переполнения
        statusContainer.style.width = '100%';       // Занимаем всю доступную ширину
    }
    
    // Добавляем !important ко всем правилам CSS
    const styleElement = document.createElement('style');
    styleElement.id = 'status-text-wrap-style';
    styleElement.textContent = `
        #status-text {
            word-break: break-word !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
            white-space: normal !important;
            max-width: 300px !important;
            display: block !important;
            text-align: left !important;
            overflow: hidden !important;
            margin: 0 !important;
            width: 100% !important;
            float: none !important;
            font-style: normal !important;
            font-size: 14px !important;
        }
        
        .profile-status {
            display: block !important;
            flex-wrap: wrap !important;
            max-width: 350px !important;
            margin: 10px 0 !important;
            text-align: left !important;
            overflow: hidden !important;
            width: 100% !important;
        }
        
        /* Применяем стили к родительским контейнерам, ограничивая их ширину */
        .profile-info {
            max-width: 400px !important;
            overflow: hidden !important;
            text-align: left !important;
        }
        
        /* Выравниваем кнопку редактирования статуса по центру */
        .edit-status-btn {
            display: inline-block !important;
            margin: 5px auto !important;
            float: none !important;
        }
    `;
    
    // Удаляем предыдущий стиль, если он был
    const existingStyle = document.getElementById('status-text-wrap-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    // Добавляем стиль в head
    document.head.appendChild(styleElement);
    
    // Применяем стили с задержкой для гарантии их применения
    setTimeout(() => {
        if (statusText) {
            statusText.style.wordBreak = 'break-word';
            statusText.style.wordWrap = 'break-word';
            statusText.style.overflowWrap = 'break-word';
            statusText.style.whiteSpace = 'normal';
            statusText.style.maxWidth = '300px';
            statusText.style.display = 'block';
            statusText.style.textAlign = 'left';
            statusText.style.overflow = 'hidden';
            statusText.style.margin = '0';
            statusText.style.width = '100%';
            statusText.style.float = 'none';
            statusText.style.fontStyle = 'normal';
            statusText.style.fontSize = '14px';
        }
        
        // Принудительно выравниваем по левому краю родительский контейнер
        const profileInfo = document.querySelector('.profile-info');
        if (profileInfo) {
            profileInfo.style.textAlign = 'left';
        }
    }, 100);
}

// Функция для временного отключения эффектов анимации на аватарах
function disableAvatarAnimations() {
    console.log('Удаление эффектов анимации с аватаров');
    
    // Находим все аватары на странице
    const allAvatars = document.querySelectorAll('.profile-avatar img, .comment-avatar, .comment-form-avatar');
    
    // Удаляем свойства анимации
    allAvatars.forEach(avatar => {
        if (avatar) {
            avatar.style.transition = 'none';
            avatar.style.opacity = '1';
        }
    });
    
    return allAvatars;
}

// Функция для полного отключения всех анимаций аватаров через CSS
function disableAllAvatarAnimations() {
    console.log('Создаем CSS-правило для отключения всех анимаций аватаров');
    
    // Находим и отключаем анимации для всех типов аватаров
    const avatarSelectors = [
        '.profile-avatar img', 
        '.comment-avatar', 
        '.comment-form-avatar',
        '.modal-comment-avatar img',
        '.modal-reply-avatar img'
    ];
    
    // Создаем глобальный стиль для отключения анимаций
    const styleElement = document.createElement('style');
    styleElement.id = 'disable-avatar-animations-style';
    styleElement.textContent = `
        ${avatarSelectors.join(', ')} {
            transition: none !important;
            opacity: 1 !important;
        }
    `;
    
    // Удаляем предыдущий стиль, если он был
    const existingStyle = document.getElementById('disable-avatar-animations-style');
    if (existingStyle) {
        existingStyle.remove();
    }
    
    // Добавляем новый стиль в документ
    document.head.appendChild(styleElement);
}

// Функция для временного отключения слушателей обновления аватаров
async function updateUserStatusSafely(userId, newStatus) {
    try {
        console.log('Запуск безопасного обновления статуса');
        
        // Проверяем наличие необходимых объектов Firebase
        if (!window.db || !window.ref || !window.update) {
            console.error('Firebase объекты недоступны');
            return false;
        }
        
        // Отключаем анимации на аватарах
        disableAvatarAnimations();
        disableAllAvatarAnimations();
        
        // Сохраняем ссылки на оригинальные слушатели
        const originalOnValue = window.onValue;
        const originalUpdateAvatarsOnPage = window.updateUserAvatarsOnPage;
        
        // Временно отключаем слушатели, влияющие на обновление аватаров
        console.log('Временно отключаем слушатели аватаров');
        window.onValue = function() { 
            console.log('Вызов onValue заблокирован во время обновления статуса');
            return null; 
        };
        window.updateUserAvatarsOnPage = function() { 
            console.log('Вызов updateUserAvatarsOnPage заблокирован во время обновления статуса');
            return null; 
        };
        
        try {
            // Выполняем обновление статуса
            const userRef = window.ref(window.db, `users/${userId}`);
            await window.update(userRef, {
                status: newStatus,
                statusUpdatedAt: new Date().toISOString()
            });
            
            // Обновляем UI
            const statusText = document.getElementById('status-text');
            if (statusText) {
                statusText.textContent = newStatus || 'Статус не установлен';
            }
            
            console.log('Статус успешно обновлен');
            return true;
        } finally {
            // Восстанавливаем оригинальные слушатели независимо от результата
            console.log('Восстанавливаем слушатели аватаров');
            window.onValue = originalOnValue;
            window.updateUserAvatarsOnPage = originalUpdateAvatarsOnPage;
            
            // Убеждаемся, что все аватары отображаются без анимации
            disableAvatarAnimations();
        }
    } catch (error) {
        console.error('Ошибка при безопасном обновлении статуса:', error);
        return false;
    }
}

// Добавляем функции в глобальную область видимости
window.updateUserStatusSafely = updateUserStatusSafely;
window.disableAvatarAnimations = disableAvatarAnimations;
window.disableAllAvatarAnimations = disableAllAvatarAnimations;
window.setupStatusTextWrapping = setupStatusTextWrapping;

// Добавляем CSS для скрытия кнопки редактирования статуса для всех пользователей
function setupEditButtonVisibility() {
    // Создаем CSS правило, которое скрывает кнопку для всех пользователей
    const styleElement = document.createElement('style');
    styleElement.id = 'edit-status-btn-visibility';
    styleElement.innerHTML = `
        /* Полностью скрываем кнопку редактирования статуса для всех пользователей */
        #edit-status-btn {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            position: absolute !important;
            left: -9999px !important;
        }
    `;
    
    // Удаляем старый стиль, если такой есть
    const oldStyle = document.getElementById('edit-status-btn-visibility');
    if (oldStyle) {
        oldStyle.remove();
    }
    
    // Добавляем новый стиль в head
    document.head.appendChild(styleElement);
    
    // Находим кнопку редактирования статуса
    const editStatusBtn = document.getElementById('edit-status-btn');
    if (editStatusBtn) {
        // Вместо удаления создаем заглушку
        // Скрываем кнопку всеми возможными способами
        editStatusBtn.style.display = 'none';
        editStatusBtn.style.visibility = 'hidden';
        editStatusBtn.style.opacity = '0';
        editStatusBtn.style.pointerEvents = 'none';
        editStatusBtn.disabled = true;
        editStatusBtn.setAttribute('disabled', 'disabled');
        editStatusBtn.setAttribute('hidden', 'hidden');
        editStatusBtn.setAttribute('dummy-processed', 'true');
        
        // Отключаем обработчик клика
        editStatusBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            console.log('Кнопка редактирования статуса отключена');
            return false;
        };
        
        console.log('Кнопка редактирования статуса деактивирована при инициализации');
    } else {
        // Если кнопки нет, создаем заглушку
        const dummyBtn = document.createElement('button');
        dummyBtn.id = 'edit-status-btn';
        dummyBtn.className = 'edit-status-btn';
        dummyBtn.style.display = 'none';
        dummyBtn.style.visibility = 'hidden';
        dummyBtn.style.opacity = '0';
        dummyBtn.disabled = true;
        dummyBtn.setAttribute('disabled', 'disabled');
        dummyBtn.setAttribute('hidden', 'hidden');
        dummyBtn.setAttribute('dummy-processed', 'true');
        
        dummyBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return false;
        };
        
        document.body.appendChild(dummyBtn);
        console.log('Создана кнопка-заглушка edit-status-btn при инициализации');
    }
}

// Вызываем функцию скрытия кнопки при загрузке документа
document.addEventListener('DOMContentLoaded', setupEditButtonVisibility);

// Периодически проверяем и отключаем кнопку, если она появилась
setInterval(() => {
    const editBtn = document.getElementById('edit-status-btn');
    // Если кнопки нет, создаем заглушку
    if (!editBtn) {
        const dummyBtn = document.createElement('button');
        dummyBtn.id = 'edit-status-btn';
        dummyBtn.className = 'edit-status-btn';
        dummyBtn.style.display = 'none';
        dummyBtn.setAttribute('disabled', 'disabled');
        dummyBtn.onclick = function(e) {
            e.preventDefault();
            return false;
        };
        document.body.appendChild(dummyBtn);
    } else if (!editBtn.hasAttribute('dummy-processed')) {
        // Если кнопка есть, но не обработана нами
        editBtn.style.display = 'none';
        editBtn.style.visibility = 'hidden';
        editBtn.style.opacity = '0';
        editBtn.style.pointerEvents = 'none';
        editBtn.disabled = true;
        editBtn.setAttribute('disabled', 'disabled');
        editBtn.setAttribute('hidden', 'hidden');
        editBtn.setAttribute('dummy-processed', 'true');
        
        // Отключаем обработчик клика
        editBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Кнопка редактирования статуса отключена');
            return false;
        };
    }
}, 1000);

// Заменяем функцию saveStatus в profile.html при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Внедрение безопасного обновления статуса');
    
    // Сразу отключаем анимации на аватарах
    disableAvatarAnimations();
    disableAllAvatarAnimations();
    
    // Настраиваем перенос текста статуса
    setupStatusTextWrapping();
    
    // Полностью скрываем кнопку редактирования статуса
    const editBtn = document.getElementById('edit-status-btn');
    if (editBtn) {
        // Вместо удаления создаем заглушку
        // Скрываем кнопку всеми возможными способами
        editBtn.style.display = 'none';
        editBtn.style.visibility = 'hidden';
        editBtn.style.opacity = '0';
        editBtn.style.pointerEvents = 'none';
        editBtn.disabled = true;
        editBtn.setAttribute('disabled', 'disabled');
        editBtn.setAttribute('hidden', 'hidden');
        editBtn.setAttribute('dummy-processed', 'true');
        
        // Отключаем обработчик клика
        editBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            console.log('Кнопка редактирования статуса отключена');
            return false;
        };
        
        console.log('Кнопка редактирования статуса деактивирована при инициализации');
    } else {
        // Если кнопки нет, создаем заглушку
        const dummyBtn = document.createElement('button');
        dummyBtn.id = 'edit-status-btn';
        dummyBtn.className = 'edit-status-btn';
        dummyBtn.style.display = 'none';
        dummyBtn.style.visibility = 'hidden';
        dummyBtn.style.opacity = '0';
        dummyBtn.disabled = true;
        dummyBtn.setAttribute('disabled', 'disabled');
        dummyBtn.setAttribute('hidden', 'hidden');
        dummyBtn.setAttribute('dummy-processed', 'true');
        
        dummyBtn.onclick = function(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            return false;
        };
        
        document.body.appendChild(dummyBtn);
        console.log('Создана кнопка-заглушка edit-status-btn при инициализации');
    }
    
    // Находим кнопку сохранения статуса и перехватываем клик
    const saveStatusBtns = document.querySelectorAll('#save-status-btn');
    if (saveStatusBtns.length > 0) {
        saveStatusBtns.forEach(btn => {
            btn.addEventListener('click', async function(e) {
                e.preventDefault();
                e.stopImmediatePropagation();
                
                // Отключаем анимации перед обновлением
                disableAvatarAnimations();
                disableAllAvatarAnimations();
                
                const statusInput = document.getElementById('status-input');
                if (statusInput && window.currentUser) {
                    const newStatus = statusInput.value.trim();
                    await window.updateUserStatusSafely(window.currentUser.uid, newStatus);
                    
                    // Снова отключаем анимации после обновления
                    disableAvatarAnimations();
                    disableAllAvatarAnimations();
                    
                    // Настраиваем перенос текста статуса после обновления
                    setupStatusTextWrapping();
                    
                    // Удаляем форму редактирования и показываем текст статуса
                    const statusForm = document.querySelector('.status-input-container');
                    if (statusForm) {
                        statusForm.remove();
                    }
                    
                    // Показываем только текст статуса, но НЕ кнопку редактирования
                    const statusText = document.getElementById('status-text');
                    const editBtn = document.getElementById('edit-status-btn');
                    
                    // Показываем текст статуса
                    if (statusText) statusText.style.display = 'inline-block';
                    
                    // Скрываем кнопку редактирования для всех пользователей
                    if (editBtn) {
                        // Скрываем кнопку всеми возможными способами
                        editBtn.style.display = 'none';
                        editBtn.style.visibility = 'hidden';
                        editBtn.style.opacity = '0';
                        editBtn.style.pointerEvents = 'none';
                        editBtn.disabled = true;
                        editBtn.setAttribute('disabled', 'disabled');
                        editBtn.setAttribute('hidden', 'hidden');
                        editBtn.setAttribute('dummy-processed', 'true');
                        
                        // Отключаем обработчик клика
                        editBtn.onclick = function(e) {
                            if (e) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                            console.log('Кнопка редактирования статуса отключена после сохранения');
                            return false;
                        };
                    }
                }
            }, true);
        });
        console.log('Безопасное обновление статуса внедрено');
    } else {
        console.warn('Кнопка сохранения статуса не найдена');
    }
});