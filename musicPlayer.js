// Файл с дополнительными функциями для музыкального плеера

/**
 * Исправляет проблему с вкладками в музыкальном плеере
 * Эта функция гарантирует, что вкладки работают правильно после динамической загрузки
 */
export function fixMusicPlayerTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Проверяем, найдены ли вкладки
  if (!tabButtons.length || !tabContents.length) {
    console.log('Вкладки музыкального плеера не найдены');
    return;
  }
  
  // Устанавливаем обработчики для всех кнопок вкладок
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
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
      }
    });
  });
  
  // Проверяем, есть ли активная вкладка, если нет - активируем первую
  const hasActiveTab = Array.from(tabButtons).some(btn => btn.classList.contains('active'));
  if (!hasActiveTab && tabButtons.length > 0) {
    tabButtons[0].click();
  }
}

/**
 * Проверяет и восстанавливает музыкальный плеер при необходимости
 * Эта функция вызывается при загрузке страницы
 */
export function checkAndRestoreMusicPlayer() {
  // Проверяем, было ли уже восстановление
  if (sessionStorage.getItem('audioRestored') === 'true') {
    console.log('Музыкальный плеер уже восстановлен');
    return true;
  }
  
  // Проверяем, есть ли сохраненное состояние
  const stateJson = sessionStorage.getItem('musicPlayerState');
  if (!stateJson) {
    console.log('Нет сохраненного состояния музыкального плеера');
    return false;
  }
  
  try {
    // Парсим состояние
    const state = JSON.parse(stateJson);
    
    // Проверяем, что есть необходимые данные
    if (!state.src) {
      console.log('Неполные данные о состоянии музыкального плеера');
      return false;
    }
    
    console.log('Найдено сохраненное состояние музыкального плеера');
    return true;
  } catch (e) {
    console.error('Ошибка при проверке состояния музыкального плеера:', e);
    return false;
  }
} 