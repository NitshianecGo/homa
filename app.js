// Конфигурация Firebase (замените на ваши актуальные данные, если требуется)
const firebaseConfig = {
    databaseURL: "https://homa-app-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let currentUser = localStorage.getItem('homa_user') || null;
let currentChatUser = null;
window.allContacts = {};

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNavigation();
    initAppLogic();
});

// 🔐 Логика авторизации
function initAuth() {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    const usernameInput = document.getElementById('usernameInput');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileName = document.getElementById('profileName');

    if (currentUser) {
        authScreen.classList.remove('active');
        appScreen.classList.add('active');
        if (profileName) profileName.textContent = currentUser;
        startApp();
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const val = usernameInput.value.trim();
            if (!val) return;
            currentUser = val;
            localStorage.setItem('homa_user', currentUser);
            authScreen.classList.remove('active');
            appScreen.classList.add('active');
            if (profileName) profileName.textContent = currentUser;
            startApp();
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('homa_user');
            location.reload();
        });
    }
}

// 🧭 Управление нижней навигацией (переключение панелей)
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const panels = document.querySelectorAll('.panel');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === targetId) {
                    panel.classList.add('active');
                }
            });
        });
    });
}

// 🚀 Запуск основной функциональности после входа
function startApp() {
    // Статус пользователя в Firebase
    const userRef = db.ref('users/' + currentUser);
    userRef.update({ name: currentUser, online: true });
    userRef.onDisconnect().update({ online: false });

    loadContacts();
}

// 👥 Загрузка контактов с полной защитой от undefined (.toLowerCase ошибка устранена навсегда)
function initAppLogic() {
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

    // Безопасное получение значения фильтра (защита от undefined)
    const filter = searchInput && searchInput.value ? searchInput.value.toLowerCase() : '';
    contactsList.innerHTML = '';

    for (const [id, contact] of Object.entries(window.allContacts)) {
        if (!contact || contact.name === currentUser) continue;

        // Жесткая страховка от падений через (contact.name || '')
        const contactName = (contact.name || '').toLowerCase();
        if (filter && !contactName.includes(filter)) {
            continue;
        }

        const item = document.createElement('div');
        item.className = 'contact-item glass-panel';
        item.innerHTML = `
            <div style="flex: 1;">
                <h4 style="margin: 0; font-size: 1rem;">${contact.name || 'Без имени'}</h4>
                <span style="font-size: 0.75rem; color: ${contact.online ? 'var(--accent)' : 'var(--text-muted)'}">
                    ${contact.online ? '• в сети' : '• не в сети'}
                </span>
            </div>
        `;
        
        // Клик по контакту переключает на панель чата с этим пользователем
        item.addEventListener('click', () => {
            currentChatUser = contact.name;
            const chatTitle = document.getElementById('chatTitle');
            if (chatTitle) chatTitle.textContent = `Чат с: ${currentChatUser}`;
            
            // Переключаем экран на панель чата программно
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            
            const chatPanel = document.getElementById('panel-chat');
            if (chatPanel) chatPanel.classList.add('active');
            
            const chatNavBtn = document.querySelector('.nav-btn[data-target="panel-chat"]');
            if (chatNavBtn) chatNavBtn.classList.add('active');
        });

        contactsList.appendChild(item);
    }
}
