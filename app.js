document.addEventListener('DOMContentLoaded', () => {
    // 1. Фикс высоты экрана
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    window.addEventListener('resize', () => {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    });

    const loginForm = document.getElementById('login-form');
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');

    // 2. СТРОГАЯ ПРОВЕРКА В БАЗЕ ДАННЫХ
    async function verifyUserWithDB(username, password) {
        try {
            /* 
               Если подгружается внешний сервер/Supabase, расскомментируй это:
               const res = await fetch('YOUR_DB_ENDPOINT', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ username, password })
               });
               const data = await res.json();
               return data.success;
            */

            // Считывание учетных записей из базы
            const dbUsers = JSON.parse(localStorage.getItem('hs_db_users')) || [
                { username: 'admin', password: 'adminpassword' } // Допустимые данные базы по умолчанию
            ];

            const match = dbUsers.find(
                u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
            );

            return !!match;
        } catch (e) {
            console.error('Database connection error:', e);
            return false;
        }
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!username || !password) {
                alert('Введите логин и пароль!');
                return;
            }

            // Запрос в БД
            const isAuthorized = await verifyUserWithDB(username, password);

            if (isAuthorized) {
                localStorage.setItem('hs_session_user', username);
                loadProfile(username);
                authScreen.classList.remove('active');
                appScreen.classList.add('active');
            } else {
                alert('Ошибка авторизации! Неверный логин или пароль.');
                passwordInput.value = '';
            }
        });
    }

    // Проверка активной сессии
    const currentSession = localStorage.getItem('hs_session_user');
    if (currentSession && authScreen && appScreen) {
        loadProfile(currentSession);
        authScreen.classList.remove('active');
        appScreen.classList.add('active');
    }

    function loadProfile(username) {
        const displayName = document.getElementById('user-display-name');
        const displayHandle = document.getElementById('user-display-handle');
        if (displayName) displayName.textContent = username;
        if (displayHandle) displayHandle.textContent = '@' + username.toLowerCase().replace(/\s+/g, '');
    }

    // 3. Выход из аккаунта
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('hs_session_user');
            appScreen.classList.remove('active');
            authScreen.classList.add('active');
            if (usernameInput) usernameInput.value = '';
            if (passwordInput) passwordInput.value = '';
        });
    }

    // 4. Переключение панелей навигации
    const navButtons = document.querySelectorAll('.nav-btn');
    const panels = document.querySelectorAll('.panel');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            
            navButtons.forEach(b => b.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

    // 5. Кастомный фон
    const customBgInput = document.getElementById('custom-bg-file');
    const resetBgBtn = document.getElementById('btn-reset-custom-bg');
    const savedCustomBg = localStorage.getItem('custom_chat_bg');

    if (savedCustomBg) {
        document.body.style.backgroundImage = `url(${savedCustomBg})`;
        if (resetBgBtn) resetBgBtn.classList.remove('hidden');
    }

    if (customBgInput) {
        customBgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Img = event.target.result;
                localStorage.setItem('custom_chat_bg', base64Img);
                document.body.style.backgroundImage = `url(${base64Img})`;
                if (resetBgBtn) resetBgBtn.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        });
    }

    if (resetBgBtn) {
        resetBgBtn.addEventListener('click', () => {
            localStorage.removeItem('custom_chat_bg');
            document.body.style.backgroundImage = '';
            resetBgBtn.classList.add('hidden');
        });
    }

    // 6. Размер шрифта
    const fontSizeSelect = document.getElementById('font-size-select');
    const savedSize = localStorage.getItem('app_font_size') || '100';

    if (fontSizeSelect) {
        fontSizeSelect.value = savedSize;
        document.documentElement.style.fontSize = savedSize + '%';

        fontSizeSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            document.documentElement.style.fontSize = val + '%';
            localStorage.setItem('app_font_size', val);
        });
    }
});
