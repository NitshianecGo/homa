import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getDatabase, ref, set, get, push, onValue, remove, update, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// KONFIGURACIYA FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyBRi7lwyM1XELz02Gy_llBXt3c0V7kpLCI",
    authDomain: "homa-27efb.firebaseapp.com",
    databaseURL: "https://homa-27efb-default-rtdb.firebaseio.com",
    projectId: "homa-27efb",
    messagingSenderId: "365610803694",
    appId: "1:365610803694:web:76a5554f8ab0c51c0f2eff"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// SOSTOYANIE PRILOZHENIYA
let currentUser = null;
let currentChatId = 'global';
let currentChatName = 'Общий чат';
let currentChatType = 'global'; // 'global' или 'private'
let replyingToMsg = null;
let editingMsgKey = null;
let targetReactionMsgKey = null;

let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;
let recordingTimerInterval = null;

let allContacts = [];
let unreadCounts = {};
let activeCategoryFilter = 'all';

// SAFARI / MOBILE HEIGHT FIX
function fixIOSHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', fixIOSHeight);
fixIOSHeight();

// ИНИЦИАЛИЗАЦИЯ И АВТОРИЗАЦИЯ
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        
        setupUserPresence();
        loadUserProfile();
        loadContacts();
        switchChat('global', 'global', 'Общий чат');
        loadWallPosts();
        loadLocalSettings();
    } else {
        currentUser = null;
        document.getElementById('auth-screen').classList.add('active');
        document.getElementById('app-screen').classList.remove('active');
    }
});

// ФОРМА ВХОДА
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errDiv = document.getElementById('auth-error');
    errDiv.textContent = '';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        errDiv.textContent = 'Ошибка входа: ' + err.message;
    }
});

// ЛОГАУТ
document.getElementById('logout-btn').addEventListener('click', () => {
    if (currentUser) {
        set(ref(db, `status/${currentUser.uid}`), { state: 'offline', last_changed: Date.now() });
        signOut(auth);
    }
});

// ПРЕЗЕНС СТАТУС (ONLINE / OFFLINE)
function setupUserPresence() {
    if (!currentUser) return;
    const myStatusRef = ref(db, `status/${currentUser.uid}`);
    const connectedRef = ref(db, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(myStatusRef).set({ state: 'offline', last_changed: Date.now() });
            set(myStatusRef, { state: 'online', last_changed: Date.now() });
        }
    });

    // Сохранить метаданные пользователя
    set(ref(db, `users/${currentUser.uid}`), {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName || currentUser.email.split('@')[0],
        photoURL: currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`
    });
}

// ПРОФИЛЬ
function loadUserProfile() {
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-display-name');
    const email = document.getElementById('user-email-text');

    avatar.src = currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`;
    name.textContent = currentUser.displayName || currentUser.email.split('@')[0];
    email.textContent = currentUser.email;
}

// РЕДАКТИРОВАНИЕ АВАТАРА
document.getElementById('avatar-edit-btn').addEventListener('click', () => {
    document.getElementById('avatar-file-input').click();
});
document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await compressMedia(file, 200, 200, 0.8);
    await updateProfile(currentUser, { photoURL: base64 });
    await set(ref(db, `users/${currentUser.uid}/photoURL`), base64);
    loadUserProfile();
});

// КОНТАКТЫ И ЧАТЫ
function loadContacts() {
    const usersRef = ref(db, 'users');
    const statusRef = ref(db, 'status');

    onValue(usersRef, (snap) => {
        const users = snap.val() || {};
        allContacts = Object.values(users).filter(u => u.uid !== currentUser.uid);

        onValue(statusRef, (statusSnap) => {
            const statuses = statusSnap.val() || {};
            renderContactsList(statuses);
        });
    });

    // Отслеживание непрочитанных
    onValue(ref(db, 'messages'), (messagesSnap) => {
        const allMsgs = messagesSnap.val() || {};
        unreadCounts = {};
        
        Object.keys(allMsgs).forEach(chatKey => {
            const msgs = allMsgs[chatKey] || {};
            let count = 0;
            Object.values(msgs).forEach(m => {
                if (m.senderId !== currentUser.uid && (!m.readBy || !m.readBy[currentUser.uid])) {
                    count++;
                }
            });
            unreadCounts[chatKey] = count;
        });
        
        renderContactsList();
    });
}

function renderContactsList(statuses = {}) {
    const container = document.getElementById('contacts-list');
    const searchVal = document.getElementById('contact-search-input').value.toLowerCase();
    container.innerHTML = '';

    // Элемент общего чата
    const globalUnread = unreadCounts['global'] || 0;
    const globalDiv = document.createElement('div');
    globalDiv.className = `contact-item ${currentChatId === 'global' ? 'active' : ''}`;
    globalDiv.innerHTML = `
        <img src="https://api.dicebear.com/7.x/identicon/svg?seed=global" class="avatar-sm">
        <div style="flex: 1;">
            <strong>🌐 Общий чат</strong>
            <div class="text-muted" style="font-size: 0.8rem;">Чат со всеми пользователями</div>
        </div>
        ${globalUnread > 0 ? `<span class="unread-badge">${globalUnread}</span>` : ''}
    `;
    globalDiv.onclick = () => switchChat('global', 'global', 'Общий чат');
    container.appendChild(globalDiv);

    // Список личных контактов
    allContacts.filter(c => c.displayName.toLowerCase().includes(searchVal)).forEach(user => {
        const isOnline = statuses[user.uid]?.state === 'online';
        const privateChatId = getPrivateChatId(currentUser.uid, user.uid);
        const unread = unreadCounts[privateChatId] || 0;

        const item = document.createElement('div');
        item.className = `contact-item ${currentChatId === privateChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div style="position: relative;">
                <img src="${user.photoURL}" class="avatar-sm">
                <span style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? 'var(--success)' : 'var(--text-muted)'}; border: 2px solid var(--bg-secondary);"></span>
            </div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 600;">${user.displayName}</div>
                <div class="text-muted" style="font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${user.email}</div>
            </div>
            ${unread > 0 ? `<span class="unread-badge">${unread}</span>` : ''}
        `;
        item.onclick = () => switchChat(privateChatId, 'private', user.displayName);
        container.appendChild(item);
    });
}

document.getElementById('contact-search-input').addEventListener('input', () => renderContactsList());

function getPrivateChatId(uid1, uid2) {
    return uid1 < uid2 ? `private_${uid1}_${uid2}` : `private_${uid2}_${uid1}`;
}

// ПЕРЕКЛЮЧЕНИЕ ЧАТА
function switchChat(chatId, chatType, chatName) {
    currentChatId = chatId;
    currentChatType = chatType;
    currentChatName = chatName;

    document.getElementById('chat-title').textContent = chatName;
    document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));

    if (window.innerWidth < 768) {
        openMobileTab('panel-chat');
    }

    listenToChatMessages();
    listenToPinnedMessage();
}

// ЗАГРУЗКА И ОТОБРАЖЕНИЕ СООБЩЕНИЙ
function listenToChatMessages() {
    const chatRef = ref(db, `messages/${currentChatId}`);
    
    onValue(chatRef, (snap) => {
        const messagesObj = snap.val() || {};
        const container = document.getElementById('chat-messages');
        const searchFilter = document.getElementById('chat-search-input').value.toLowerCase();
        container.innerHTML = '';

        let msgArray = Object.keys(messagesObj).map(key => ({ key, ...messagesObj[key] }));
        
        // Авто-удаление по сроку хранения (Retention)
        const retentionDays = parseInt(localStorage.getItem('homa_retention') || '0');
        if (retentionDays > 0) {
            const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
            msgArray.forEach(msg => {
                if (msg.timestamp < cutoff) {
                    remove(ref(db, `messages/${currentChatId}/${msg.key}`));
                }
            });
        }

        msgArray.sort((a, b) => a.timestamp - b.timestamp);

        msgArray.forEach(msg => {
            if (searchFilter && !msg.text?.toLowerCase().includes(searchFilter)) return;

            // Пометить прочитанным
            if (msg.senderId !== currentUser.uid && (!msg.readBy || !msg.readBy[currentUser.uid])) {
                set(ref(db, `messages/${currentChatId}/${msg.key}/readBy/${currentUser.uid}`), true);
            }

            const isMine = msg.senderId === currentUser.uid;
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${isMine ? 'outgoing' : 'incoming'}`;
            
            let quoteHTML = '';
            if (msg.replyTo) {
                quoteHTML = `<div class="quote-block"><strong>${msg.replyTo.senderName}:</strong> ${msg.replyTo.text || '[Медиа]'}</div>`;
            }

            let mediaHTML = '';
            if (msg.media) {
                if (msg.media.type.startsWith('image/')) {
                    mediaHTML = `<img src="${msg.media.data}" class="chat-media-img" onclick="window.open('${msg.media.data}')">`;
                } else if (msg.media.type.startsWith('video/')) {
                    mediaHTML = `<video src="${msg.media.data}" controls class="chat-media-video"></video>`;
                } else if (msg.media.type.startsWith('audio/')) {
                    mediaHTML = `
                        <div style="margin-top: 6px; display: flex; align-items: center; gap: 6px;">
                            <audio src="${msg.media.data}" controls id="audio-${msg.key}"></audio>
                            <button class="btn-sm btn-outline" onclick="window.changeAudioSpeed('audio-${msg.key}')">1.5x</button>
                        </div>
                    `;
                }
            }

            // Отрисовка реакций
            let reactionsHTML = '';
            if (msg.reactions) {
                const counts = {};
                Object.values(msg.reactions).forEach(r => counts[r] = (counts[r] || 0) + 1);
                reactionsHTML = `<div class="reactions-row">${Object.entries(counts).map(([r, c]) => `<span class="reaction-chip">${r} ${c}</span>`).join('')}</div>`;
            }

            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            bubble.innerHTML = `
                ${!isMine && currentChatType === 'global' ? `<div style="font-size: 0.75rem; font-weight: bold; color: var(--accent); margin-bottom: 2px;">${msg.senderName}</div>` : ''}
                ${quoteHTML}
                <div>${escapeHTML(msg.text || '')} ${msg.edited ? '<small style="opacity: 0.6;">(изм.)</small>' : ''}</div>
                ${mediaHTML}
                ${reactionsHTML}
                <div class="msg-meta">
                    ${timeStr} ${isMine ? (msg.readBy ? '✓✓' : '✓') : ''}
                </div>
            `;

            // Правый клик / контекстное меню реакций
            bubble.oncontextmenu = (e) => {
                e.preventDefault();
                showReactionPicker(e.clientX, e.clientY, msg.key);
            };

            bubble.onclick = () => {
                if (isMine) {
                    startEditing(msg);
                } else {
                    startReplying(msg);
                }
            };

            container.appendChild(bubble);
        });

        container.scrollTop = container.scrollHeight;
    });
}

document.getElementById('chat-search-input').addEventListener('input', () => listenToChatMessages());

// ЭМОДЗИ РЕАКЦИИ
function showReactionPicker(x, y, msgKey) {
    targetReactionMsgKey = msgKey;
    const picker = document.getElementById('reaction-picker');
    picker.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    picker.style.top = `${Math.min(y, window.innerHeight - 80)}px`;
    picker.classList.remove('hidden');
}

window.addReaction = (emoji) => {
    if (!targetReactionMsgKey || !currentUser) return;
    set(ref(db, `messages/${currentChatId}/${targetReactionMsgKey}/reactions/${currentUser.uid}`), emoji);
    document.getElementById('reaction-picker').classList.add('hidden');
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#reaction-picker') && !e.target.closest('.msg-bubble')) {
        document.getElementById('reaction-picker').classList.add('hidden');
    }
});

// ИЗМЕНЕНИЕ СКОРОСТИ АУДИО
window.changeAudioSpeed = (id) => {
    const audio = document.getElementById(id);
    if (!audio) return;
    if (audio.playbackRate === 1) audio.playbackRate = 1.5;
    else if (audio.playbackRate === 1.5) audio.playbackRate = 2.0;
    else audio.playbackRate = 1.0;
};

// ЗАКРЕПЛЕННЫЕ СООБЩЕНИЯ
function listenToPinnedMessage() {
    onValue(ref(db, `pinned/${currentChatId}`), (snap) => {
        const pinned = snap.val();
        const bar = document.getElementById('pinned-bar');
        if (pinned) {
            document.getElementById('pinned-text-preview').textContent = pinned.text || '[Медиа]';
            bar.classList.remove('hidden');
        } else {
            bar.classList.add('hidden');
        }
    });
}

document.getElementById('unpin-btn').addEventListener('click', () => {
    remove(ref(db, `pinned/${currentChatId}`));
});

// ОЧИСТКА ЧАТА
document.getElementById('clear-chat-btn').addEventListener('click', () => {
    if (confirm('Вы уверены, что хотите очистить всю историю этого чата?')) {
        remove(ref(db, `messages/${currentChatId}`));
        remove(ref(db, `pinned/${currentChatId}`));
    }
});

// ОТВЕТ И РЕДАКТИРОВАНИЕ
function startReplying(msg) {
    replyingToMsg = msg;
    editingMsgKey = null;
    document.getElementById('reply-user-name').textContent = msg.senderName;
    document.getElementById('reply-text-preview').textContent = msg.text || '[Медиа]';
    document.getElementById('reply-preview').style.display = 'flex';
}

function startEditing(msg) {
    editingMsgKey = msg.key;
    replyingToMsg = null;
    document.getElementById('chat-text-input').value = msg.text || '';
    document.getElementById('reply-user-name').textContent = 'Редактирование';
    document.getElementById('reply-text-preview').textContent = msg.text || '';
    document.getElementById('reply-preview').style.display = 'flex';
}

document.getElementById('cancel-reply-btn').addEventListener('click', () => {
    replyingToMsg = null;
    editingMsgKey = null;
    document.getElementById('reply-preview').style.display = 'none';
    document.getElementById('chat-text-input').value = '';
});

// ОТПРАВКА СООБЩЕНИЯ
async function sendMessage() {
    const textInput = document.getElementById('chat-text-input');
    const text = textInput.value.trim();
    const fileInput = document.getElementById('chat-file-input');

    if (!text && !fileInput.files[0] && audioChunks.length === 0) return;

    if (editingMsgKey) {
        update(ref(db, `messages/${currentChatId}/${editingMsgKey}`), {
            text: text,
            edited: true
        });
        editingMsgKey = null;
    } else {
        let mediaData = null;
        if (fileInput.files[0]) {
            const file = fileInput.files[0];
            const base64 = await compressMedia(file);
            mediaData = { type: file.type, data: base64 };
        }

        const newMsg = {
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email.split('@')[0],
            text: text,
            timestamp: Date.now(),
            replyTo: replyingToMsg ? { senderName: replyingToMsg.senderName, text: replyingToMsg.text } : null,
            media: mediaData
        };

        push(ref(db, `messages/${currentChatId}`), newMsg);
    }

    textInput.value = '';
    fileInput.value = '';
    replyingToMsg = null;
    document.getElementById('reply-preview').style.display = 'none';
}

document.getElementById('send-msg-btn').addEventListener('click', sendMessage);

document.getElementById('chat-text-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// КНОПКА ФАЙЛА В ЧАТЕ
document.getElementById('chat-file-btn').addEventListener('click', () => {
    document.getElementById('chat-file-input').click();
});

// ЗАПИСЬ ГОЛОСОВЫХ СООБЩЕНИЙ С ТАЙМЕРОМ
const recordBtn = document.getElementById('record-audio-btn');
const timerDisplay = document.getElementById('recording-timer');

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result;
                    push(ref(db, `messages/${currentChatId}`), {
                        senderId: currentUser.uid,
                        senderName: currentUser.displayName || currentUser.email.split('@')[0],
                        timestamp: Date.now(),
                        media: { type: 'audio/webm', data: base64Audio }
                    });
                };
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.textContent = '⏹️';
            timerDisplay.classList.remove('hidden');
            recordingStartTime = Date.now();
            recordingTimerInterval = setInterval(updateTimer, 1000);
        } catch (err) {
            alert('Не удалось получить доступ к микрофону: ' + err.message);
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.textContent = '🎙️';
        timerDisplay.classList.add('hidden');
        clearInterval(recordingTimerInterval);
    }
});

function updateTimer() {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    timerDisplay.textContent = `🔴 ${mins}:${secs}`;
}

// СТЕНА ПОСТОВ И КОММЕНТАРИИ
document.getElementById('post-file-btn').addEventListener('click', () => {
    document.getElementById('post-file-input').click();
});
document.getElementById('post-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('post-file-name').textContent = file ? file.name : '';
});

document.getElementById('submit-post-btn').addEventListener('click', async () => {
    const text = document.getElementById('post-text-input').value.trim();
    const category = document.getElementById('post-category-select').value;
    const fileInput = document.getElementById('post-file-input');
    
    if (!text && !fileInput.files[0]) return;

    let mediaData = null;
    if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const base64 = await compressMedia(file);
        mediaData = { type: file.type, data: base64 };
    }

    const postObj = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email.split('@')[0],
        authorAvatar: currentUser.photoURL || '',
        text: text,
        category: category,
        timestamp: Date.now(),
        media: mediaData,
        likes: {}
    };

    push(ref(db, 'posts'), postObj);

    document.getElementById('post-text-input').value = '';
    fileInput.value = '';
    document.getElementById('post-file-name').textContent = '';
});

// КАТЕГОРИИ ФИЛЬТРАЦИИ ПОСТОВ
document.querySelectorAll('.cat-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        activeCategoryFilter = e.target.dataset.cat;
        loadWallPosts();
    });
});

function loadWallPosts() {
    onValue(ref(db, 'posts'), (snap) => {
        const postsObj = snap.val() || {};
        const container = document.getElementById('wall-posts');
        container.innerHTML = '';

        let postList = Object.keys(postsObj).map(k => ({ key: k, ...postsObj[k] }));
        postList.sort((a, b) => b.timestamp - a.timestamp);

        postList.forEach(post => {
            if (activeCategoryFilter !== 'all' && post.category !== activeCategoryFilter) return;

            const postCard = document.createElement('div');
            postCard.className = 'post-item glass-panel';

            const isLiked = post.likes && post.likes[currentUser.uid];
            const likeCount = post.likes ? Object.keys(post.likes).length : 0;
            const canDelete = post.authorId === currentUser.uid;

            let mediaHTML = '';
            if (post.media) {
                if (post.media.type.startsWith('image/')) {
                    mediaHTML = `<img src="${post.media.data}" class="chat-media-img">`;
                } else if (post.media.type.startsWith('video/')) {
                    mediaHTML = `<video src="${post.media.data}" controls class="chat-media-video"></video>`;
                }
            }

            postCard.innerHTML = `
                <div class="post-header-row">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <img src="${post.authorAvatar}" class="avatar-sm">
                        <div>
                            <strong>${post.authorName}</strong>
                            <div class="text-muted" style="font-size: 0.75rem;">${new Date(post.timestamp).toLocaleString()} • #${post.category}</div>
                        </div>
                    </div>
                    ${canDelete ? `<button class="btn-icon danger" onclick="window.deletePost('${post.key}')">🗑️</button>` : ''}
                </div>
                <div>${escapeHTML(post.text || '')}</div>
                ${mediaHTML}
                <div style="display: flex; gap: 12px; margin-top: 6px;">
                    <button class="btn-sm ${isLiked ? 'btn-primary' : 'btn-outline'}" onclick="window.toggleLike('${post.key}')">❤️ ${likeCount}</button>
                    <button class="btn-sm btn-outline" onclick="window.toggleComments('${post.key}')">💬 Комментарии</button>
                </div>
                <div id="comments-box-${post.key}" class="comments-section hidden">
                    <div id="comments-list-${post.key}"></div>
                    <div style="display: flex; gap: 6px; margin-top: 8px;">
                        <input type="text" id="comment-input-${post.key}" placeholder="Ваш комментарий..." class="chat-search-field">
                        <button class="btn-sm btn-primary" onclick="window.addComment('${post.key}')">Отправить</button>
                    </div>
                </div>
            `;

            container.appendChild(postCard);
            loadComments(post.key);
        });
    });
}

window.toggleLike = (postKey) => {
    const likeRef = ref(db, `posts/${postKey}/likes/${currentUser.uid}`);
    get(likeRef).then(snap => {
        if (snap.exists()) remove(likeRef);
        else set(likeRef, true);
    });
};

window.deletePost = (postKey) => {
    if (confirm('Удалить этот пост?')) {
        remove(ref(db, `posts/${postKey}`));
    }
};

window.toggleComments = (postKey) => {
    const box = document.getElementById(`comments-box-${postKey}`);
    box.classList.toggle('hidden');
};

function loadComments(postKey) {
    onValue(ref(db, `posts/${postKey}/comments`), (snap) => {
        const comments = snap.val() || {};
        const listDiv = document.getElementById(`comments-list-${postKey}`);
        if (!listDiv) return;
        listDiv.innerHTML = '';

        Object.values(comments).forEach(c => {
            const item = document.createElement('div');
            item.className = 'comment-item';
            item.innerHTML = `<strong>${c.authorName}:</strong> ${escapeHTML(c.text)}`;
            listDiv.appendChild(item);
        });
    });
}

window.addComment = (postKey) => {
    const input = document.getElementById(`comment-input-${postKey}`);
    const text = input.value.trim();
    if (!text) return;

    push(ref(db, `posts/${postKey}/comments`), {
        authorName: currentUser.displayName || currentUser.email.split('@')[0],
        text: text,
        timestamp: Date.now()
    });
    input.value = '';
};

// ТЕМА И НАСТРОЙКИ
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('homa_theme', newTheme);
    themeBtn.textContent = newTheme === 'dark' ? '🌙 Тёмная тема' : '☀️ Светлая тема';
});

// ШРИФТ
let fontSizeFactor = 100;
document.getElementById('font-inc').addEventListener('click', () => {
    if (fontSizeFactor < 130) {
        fontSizeFactor += 5;
        document.documentElement.style.setProperty('--font-size-base', `${fontSizeFactor}%`);
        document.getElementById('font-size-val').textContent = `${fontSizeFactor}%`;
    }
});
document.getElementById('font-dec').addEventListener('click', () => {
    if (fontSizeFactor > 80) {
        fontSizeFactor -= 5;
        document.documentElement.style.setProperty('--font-size-base', `${fontSizeFactor}%`);
        document.getElementById('font-size-val').textContent = `${fontSizeFactor}%`;
    }
});

// СРОК ХРАНЕНИЯ
document.getElementById('retention-select').addEventListener('change', (e) => {
    localStorage.setItem('homa_retention', e.target.value);
});

// СВОЙ ФОН
document.getElementById('custom-bg-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await compressMedia(file, 1200, 1200, 0.7);
    document.body.style.setProperty('--custom-bg-url', `url(${base64})`);
    document.body.classList.add('has-custom-bg');
    localStorage.setItem('homa_custom_bg', base64);
    document.getElementById('reset-bg-btn').classList.remove('hidden');
});

document.getElementById('reset-bg-btn').addEventListener('click', () => {
    document.body.classList.remove('has-custom-bg');
    localStorage.removeItem('homa_custom_bg');
    document.getElementById('reset-bg-btn').classList.add('hidden');
});

function loadLocalSettings() {
    const savedTheme = localStorage.getItem('homa_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeBtn.textContent = savedTheme === 'dark' ? '🌙 Тёмная тема' : '☀️ Светлая тема';

    const savedBg = localStorage.getItem('homa_custom_bg');
    if (savedBg) {
        document.body.style.setProperty('--custom-bg-url', `url(${savedBg})`);
        document.body.classList.add('has-custom-bg');
        document.getElementById('reset-bg-btn').classList.remove('hidden');
    }

    const savedRetention = localStorage.getItem('homa_retention') || 'never';
    document.getElementById('retention-select').value = savedRetention;
}

// МОБИЛЬНАЯ НАВИГАЦИЯ ПАНЕЛЕЙ
document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.target;
        openMobileTab(target);
    });
});

window.openMobileTab = (panelId) => {
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById(panelId).classList.add('active');

    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.target === panelId);
    });
};

// СЖАТИЕ МЕДИАФАЙЛОВ В BASE64
function compressMedia(file, maxWidth = 1000, maxHeight = 1000, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }
                    } else {
                        if (height > maxHeight) {
                            width = Math.round((width * maxHeight) / height);
                            height = maxHeight;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
            } else {
                resolve(event.target.result);
            }
        };
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
