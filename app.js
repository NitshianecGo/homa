// Конфигурация Firebase (замените на ваши данные)
const firebaseConfig = {
    databaseURL: "https://homa-app-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentUser = localStorage.getItem('homa_user') || null;
window.allContacts = {};

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNavigation();
    initContacts();
});

// 🔐 Авторизация
function initAuth() {
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileName = document.getElementById('profileName');

    if (currentUser) {
        authScreen.classList.remove('active');
        mainScreen.classList.add('active');
        profileName.textContent = currentUser;
        startApp();
    }

    loginBtn.addEventListener('click', () => {
        const val = usernameInput.value.trim();
        if (!val) return;
        currentUser = val;
        localStorage.setItem('homa_user', currentUser);
        authScreen.classList.remove('active');
        mainScreen.classList.add('active');
        profileName.textContent = currentUser;
        startApp();
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('homa_user');
        location.reload();
    });
}

// 🧭 Навигация по табам
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabs = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('pageTitle');

    const titles = {
        chats: 'Чаты',
        contacts: 'Контакты',
        profile: 'Профиль'
    };

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            tabs.forEach(tab => tab.classList.remove('active'));
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            if (pageTitle) {
                pageTitle.textContent = titles[targetTab] || 'Homa';
            }
        });
    });
}

// 🚀 Запуск логики приложения после входа
function startApp() {
    // Регистрация пользователя в базе
    const userRef = db.ref('users/' + currentUser);
    userRef.set({ name: currentUser, online: true });
    userRef.onDisconnect().update({ online: false });

    loadContacts();
}

// 👥 Загрузка и рендеринг контактов (с защитой от undefined)
function initContacts() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', renderContactsList);
    }
}

function loadContacts() {
    db.ref('users').on('value', (snapshot) => {
        window.allContacts = snapshot.val() || {};
        renderContactsList();
    });
}

function renderContactsList() {
    const contactsList = document.getElementById('contactsList');
    const searchInput = document.getElementById('searchInput');
    if (!contactsList) return;

    const filter = searchInput ? (searchInput.value || '').toLowerCase() : '';
    contactsList.innerHTML = '';

    for (const [id, contact] of Object.entries(window.allContacts)) {
        if (contact.name === currentUser) continue; // Пропускаем себя

        const name = (contact.name || '').toLowerCase();
        if (filter && !name.includes(filter)) {
            continue;
        }

        const item = document.createElement('div');
        item.className = 'contact-item';
        item.innerHTML = `
            <span>${contact.name || 'Без имени'}</span>
            <span style="font-size: 0.8rem; color: ${contact.online ? '#22c55e' : '#64748b'}">
                ${contact.online ? '• в сети' : '• не в сети'}
            </span>
        `;
        contactsList.appendChild(item);
    }
}
