// Импорт модулей Firebase SDK v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// -------------------------------------------------------------
// 1. ТВОЯ РЕАЛЬНАЯ КОНФИГУРАЦИЯ FIREBASE (ПРОЕКТ homa-27efb)
// -------------------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyBRi7lwyM1XELz02Gy_llBXt3c0V7kpLCI",
    authDomain: "homa-27efb.firebaseapp.com",
    projectId: "homa-27efb",
    storageBucket: "homa-27efb.firebasestorage.app",
    messagingSenderId: "365610803694",
    appId: "1:365610803694:web:76a5554f8ab0c51c0f2eff"
};

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------------------------------------------------
// 2. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА ПРИ ЗАГРУЗКЕ
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    
    // Адаптация высоты экрана под iOS Safe Area
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
    const loginBtn = document.getElementById('btn-login');

    // -------------------------------------------------------------
    // 3. АВТОРИЗАЦИЯ ЧЕРЕЗ FIREBASE AUTH
    // -------------------------------------------------------------
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const userInput = usernameInput.value.trim();
            const password = passwordInput.value.trim();

            if (!userInput || !password) {
                alert("Заполните логин/email и пароль!");
                return;
            }

            // Авто-преобразование username -> username@homespace.app если ввели без @
            const email = userInput.includes('@') ? userInput : `${userInput.toLowerCase()}@homespace.app`;

            try {
                if (loginBtn) {
                    loginBtn.disabled = true;
                    loginBtn.textContent = 'Проверка...';
                }

                // Вход в Firebase
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                await loadUserProfile(user);

            } catch (error) {
                console.error("Firebase Auth error:", error.code, error.message);
                
                let errorMsg = "Неверный логин или пароль!";
                if (error.code === 'auth/user-not-found') errorMsg = "Пользователь не найден!";
                if (error.code === 'auth/wrong-password') errorMsg = "Неверный пароль!";
                if (error.code === 'auth/invalid-credential') errorMsg = "Неверные учетные данные!";
                
                alert(errorMsg);
                if (passwordInput) passwordInput.value = '';
            } finally {
                if (loginBtn) {
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Войти';
                }
            }
        });
    }

    // -------------------------------------------------------------
    // 4. ОТСЛЕЖИВАНИЕ СЕССИИ (FIREBASE STATE)
    // -------------------------------------------------------------
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserProfile(user);
            if (authScreen) authScreen.classList.remove('active');
            if (appScreen) appScreen.classList.add('active');
        } else {
            if (appScreen) appScreen.classList.remove('active');
            if (authScreen) authScreen.classList.add('active');
        }
    });

    async function loadUserProfile(user) {
        const displayName = document.getElementById('user-display-name');
        const displayHandle = document.getElementById('user-display-handle');
        
        let name = user.displayName || user.email.split('@')[0];
        
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                if (data.username) name = data.username;
            }
        } catch (e) {
            console.log("Firestore skipped:", e);
        }

        if (displayName) displayName.textContent = name;
        if (displayHandle) displayHandle.textContent = '@' + name.toLowerCase().replace(/\s+/g, '');
    }

    // -------------------------------------------------------------
    // 5. ВЫХОД ИЗ АККАУНТА
    // -------------------------------------------------------------
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (err) {
                console.error("SignOut Error:", err);
            }
        });
    }

    // -------------------------------------------------------------
    // 6. ПАНЕЛИ, ТЕМЫ И КАСТОМНЫЙ ФОН
    // -------------------------------------------------------------
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

    // Загрузка своего фона
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

    // Настройка шрифта
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
