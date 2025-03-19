// Скрипт для загрузки аватарок в Firebase Storage
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js';

// Firebase конфигурация
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
const storage = getStorage(app);

// Функция для загрузки файла в Firebase Storage
async function uploadFile(file, path) {
  try {
    const fileRef = storageRef(storage, path);
    const snapshot = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log(`Файл загружен: ${path}`);
    console.log(`URL файла: ${downloadURL}`);
    return downloadURL;
  } catch (error) {
    console.error(`Ошибка при загрузке файла ${path}:`, error);
    return null;
  }
}

// Функция для загрузки всех аватарок
async function uploadAllAvatars() {
  const avatarFiles = document.getElementById('avatar-files').files;
  
  if (avatarFiles.length < 4) {
    alert('Пожалуйста, выберите 4 файла аватарок');
    return;
  }
  
  const statusElement = document.getElementById('upload-status');
  statusElement.textContent = 'Загрузка аватарок...';
  
  try {
    for (let i = 0; i < 4; i++) {
      const file = avatarFiles[i];
      const path = `avatars_default/ava${i+1}.jpg`;
      await uploadFile(file, path);
      statusElement.textContent = `Загружено ${i+1} из 4 аватарок...`;
    }
    
    statusElement.textContent = 'Все аватарки успешно загружены!';
  } catch (error) {
    console.error('Ошибка при загрузке аватарок:', error);
    statusElement.textContent = 'Ошибка при загрузке аватарок: ' + error.message;
  }
}

// Инициализация после загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  const uploadButton = document.getElementById('upload-button');
  uploadButton.addEventListener('click', uploadAllAvatars);
}); 