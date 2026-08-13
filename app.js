// Переменные и инициализация
document.addEventListener('DOMContentLoaded', () => {
    initCustomBackground();
    initFontSize();
    initNavigation();
});

// Функционал загрузки пользовательского фото на фон
function initCustomBackground() {
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
}

// Изменение размера шрифта (динамическое изменение всех тегов, включая информацию о хранении)
function initFontSize() {
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
}

// Переключение табов в мобильном меню
function initNavigation() {
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
}
