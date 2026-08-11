import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let currentUser = null;
let currentChatTarget = 'global';
let selectedPostFile = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let typingTimeout = null;
let replyTargetMessage = null;

// АВТОРИЗАЦИЯ
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        setupPresence(user.uid);
        initAppData();
    } else {
        currentUser = null;
        document.getElementById('app-screen').classList.remove('active');
        document.getElementById('auth-screen').classList.add('active');
    }
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass)
        .catch(err => document.getElementById('auth-error').innerText = "Ошибка входа: " + err.message);
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// ОНЛАЙН СТАТУС
function setupPresence(uid) {
    const userStatusRef = ref(db, `/status/${uid}`);
    const connectedRef = ref(db, '.info/connected');

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(userStatusRef).set({ state: 'offline', lastChanged: serverTimestamp() });
            set(userStatusRef, { state: 'online', lastChanged: serverTimestamp() });
        }
    });
}

function initAppData() {
    loadContacts();
    switchChat('global', 'Общий чат');
    loadPosts();
    
    document.getElementById('user-email-text').innerText = currentUser.email;
    document.getElementById('user-display-name').innerText = currentUser.email.split('@')[0];

    onValue(ref(db, `users/${currentUser.uid}`), (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.avatar) {
            document.getElementById('user-avatar').src = userData.avatar;
        }
    });
}

// 1. КОНТАКТЫ
function loadContacts() {
    onValue(ref(db, 'users'), (snapshot) => {
        const container = document.getElementById('contacts-list');
        container.innerHTML = '';
        const users = snapshot.val() || {};
        
        const globalChatDiv = document.createElement('div');
        globalChatDiv.className = 'contact-item';
        globalChatDiv.innerHTML = `<strong>📢 Общий Чат</strong>`;
        globalChatDiv.onclick = () => {
            switchChat('global', 'Общий чат');
            openMobileTab('panel-chat');
        };
        container.appendChild(globalChatDiv);

        Object.keys(users).forEach(uid => {
            if (uid === currentUser.uid) return;
            const u = users[uid];
            const div = document.createElement('div');
            div.className = 'contact-item';
            
            const privateChatId = currentUser.uid < uid ? `private_${currentUser.uid}_${uid}` : `private_${uid}_${currentUser.uid}`;

            div.innerHTML = `
                <img src="${u.avatar || 'https://via.placeholder.com/35'}" class="avatar-sm">
                <div>
                    <div><strong>${u.name || u.email.split('@')[0]}</strong></div>
                    <span id="status-${uid}" class="text-muted" style="font-size:0.75rem;">⚪ Оффлайн</span>
                </div>
            `;
            
            div.onclick = () => {
                switchChat(privateChatId, `💬 Чат с ${u.name || u.email.split('@')[0]}`);
                openMobileTab('panel-chat');
            };
            container.appendChild(div);

            onValue(ref(db, `/status/${uid}`), (sSnap) => {
                const st = sSnap.val();
                const el = document.getElementById(`status-${uid}`);
                if (el && st) {
                    el.innerText = st.state === 'online' ? '🟢 В сети' : '⚪ Оффлайн';
                }
            });
        });
    });
}

// 2. ЧАТ И ЦИТИРОВАНИЕ
function switchChat(targetId, title) {
    currentChatTarget = targetId;
    document.getElementById('chat-title').innerText = title;
    cancelReply();
    loadMessages(targetId);
    listenTyping(targetId);
}

document.getElementById('send-msg-btn').addEventListener('click', sendTextMessage);
document.getElementById('chat-text-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendTextMessage();
});

document.getElementById('chat-text-input').addEventListener('input', () => {
    if (!currentUser) return;
    set(ref(db, `typing/${currentChatTarget}/${currentUser.uid}`), true);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        set(ref(db, `typing/${currentChatTarget}/${currentUser.uid}`), false);
    }, 2000);
});

function listenTyping(chatId) {
    onValue(ref(db, `typing/${chatId}`), (snapshot) => {
        const typingData = snapshot.val() || {};
        let isTyping = false;
        
        Object.keys(typingData).forEach(uid => {
            if (uid !== currentUser.uid && typingData[uid] === true) {
                isTyping = true;
            }
        });

        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.innerText = isTyping ? '✏️ печатает...' : '';
            indicator.style.color = 'var(--accent)';
            indicator.style.fontSize = '0.8rem';
        }
    });
}

function sendTextMessage() {
    const input = document.getElementById('chat-text-input');
    const text = input.value.trim();
    if(!text) return;

    const msgPayload = {
        sender: currentUser.uid,
        senderName: currentUser.email.split('@')[0],
        type: 'text',
        content: text,
        timestamp: serverTimestamp(),
        read: false
    };

    if (replyTargetMessage) {
        msgPayload.replyTo = {
            senderName: replyTargetMessage.senderName,
            content: replyTargetMessage.type === 'text' ? replyTargetMessage.content : `[${replyTargetMessage.type}]`
        };
    }

    push(ref(db, `messages/${currentChatTarget}`), msgPayload);
    
    set(ref(db, `typing/${currentChatTarget}/${currentUser.uid}`), false);
    input.value = '';
    cancelReply();
}

function cancelReply() {
    replyTargetMessage = null;
    document.getElementById('reply-preview').style.display = 'none';
}
document.getElementById('cancel-reply-btn').addEventListener('click', cancelReply);

function loadMessages(targetId) {
    onValue(ref(db, `messages/${targetId}`), (snapshot) => {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        Object.keys(data).forEach(msgKey => {
            const msg = data[msgKey];
            const isOutgoing = msg.sender === currentUser.uid;

            if (!isOutgoing && msg.read === false) {
                set(ref(db, `messages/${targetId}/${msgKey}/read`), true);
            }

            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
            
            // Клик для цитирования сообщения
            bubble.onclick = () => {
                replyTargetMessage = msg;
                document.getElementById('reply-user-name').innerText = msg.senderName || 'Пользователь';
                document.getElementById('reply-text-preview').innerText = msg.type === 'text' ? msg.content : `[${msg.type}]`;
                document.getElementById('reply-preview').style.display = 'flex';
            };

            let quoteHTML = '';
            if (msg.replyTo) {
                quoteHTML = `
                    <div class="quote-block">
                        <span class="quote-user">${msg.replyTo.senderName}</span>
                        <span class="quote-text">${msg.replyTo.content}</span>
                    </div>
                `;
            }

            let body = msg.content;
            if (msg.type === 'image') {
                body = `<img src="${msg.content}" class="chat-media-img">`;
            } else if (msg.type === 'video') {
                body = `<video src="${msg.content}" controls class="chat-media-video"></video>`;
            } else if (msg.type === 'audio') {
                const uniqueAudioId = `audio_${msgKey}`;
                body = `
                    <div class="audio-player-custom">
                        <button class="audio-play-btn" onclick="event.stopPropagation(); window.toggleAudioPlay('${uniqueAudioId}')">▶</button>
                        <div class="audio-track" onclick="event.stopPropagation(); window.seekAudio('${uniqueAudioId}', event)">
                            <div id="progress_${uniqueAudioId}" class="audio-progress"></div>
                        </div>
                        <span id="time_${uniqueAudioId}" class="audio-time">0:00</span>
                        <audio id="${uniqueAudioId}" src="${msg.content}" preload="metadata" style="display:none;"></audio>
                    </div>
                `;
            }

            let checkMark = '';
            if (isOutgoing) {
                checkMark = msg.read ? '<span style="color:#89b4fa; font-weight:bold;">✓✓</span>' : '<span style="color:#89b4fa; font-weight:bold;">✓</span>';
            }

            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';
            bubble.innerHTML = `${quoteHTML}${body} <div class="msg-meta">${timeStr} ${checkMark}</div>`;
            container.appendChild(bubble);

            // Инициализация кастомного аудиоплеера
            if (msg.type === 'audio') {
                setTimeout(() => initAudioPlayerEvents(`audio_${msgKey}`), 50);
            }
        });
        container.scrollTop = container.scrollHeight;
    });
}

// 3. АУДИОСООБЩЕНИЯ С ПАУЗОЙ И ТАЙМЕРОМ
window.toggleAudioPlay = function(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const playBtn = audio.parentElement.querySelector('.audio-play-btn');

    // Остановка всех остальных плееров
    document.querySelectorAll('audio').forEach(a => {
        if (a.id !== audioId && !a.paused) {
            a.pause();
            const btn = a.parentElement.querySelector('.audio-play-btn');
            if (btn) btn.innerText = '▶';
        }
    });

    if (audio.paused) {
        audio.play();
        playBtn.innerText = '⏸';
    } else {
        audio.pause();
        playBtn.innerText = '▶';
    }
};

window.seekAudio = function(audioId, e) {
    const audio = document.getElementById(audioId);
    if (!audio || !audio.duration) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
};

function initAudioPlayerEvents(audioId) {
    const audio = document.getElementById(audioId);
    if (!audio) return;
    const progress = document.getElementById(`progress_${audioId}`);
    const timeDisplay = document.getElementById(`time_${audioId}`);

    audio.ontimeupdate = () => {
        if (audio.duration) {
            const pct = (audio.currentTime / audio.duration) * 100;
            if (progress) progress.style.width = `${pct}%`;
            
            const mins = Math.floor(audio.currentTime / 60);
            const secs = Math.floor(audio.currentTime % 60);
            if (timeDisplay) timeDisplay.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }
    };

    audio.onended = () => {
        if (progress) progress.style.width = '0%';
        const playBtn = audio.parentElement.querySelector('.audio-play-btn');
        if (playBtn) playBtn.innerText = '▶';
    };
}

const recordBtn = document.getElementById('record-audio-btn');
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    push(ref(db, `messages/${currentChatTarget}`), {
                        sender: currentUser.uid,
                        senderName: currentUser.email.split('@')[0],
                        type: 'audio',
                        content: base64Audio,
                        timestamp: serverTimestamp(),
                        read: false
                    });
                };
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.innerText = '🛑';
            recordBtn.style.color = 'var(--danger)';
        } catch (err) {
            alert('Ошибка доступа к микрофону: ' + err.message);
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.innerText = '🎙️';
        recordBtn.style.color = 'var(--text-primary)';
    }
});

// КЛИКАБЕЛЬНОСТЬ И ВЫБОР ФАЙЛОВ
document.getElementById('chat-file-btn').addEventListener('click', () => document.getElementById('chat-file-input').click());
document.getElementById('avatar-edit-btn').addEventListener('click', () => document.getElementById('avatar-file-input').click());
document.getElementById('post-file-btn').addEventListener('click', () => document.getElementById('post-file-input').click());

// ФУНКЦИЯ ЧТЕНИЯ И КОНВЕРТАЦИИ В BASE64 ДЛЯ ФОТО И ВИДЕО
async function fileToBase64(file, maxWidth = 800) {
    return new Promise((resolve, reject) => {
        if (file.type.startsWith('video/')) {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        } else {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    if (w > maxWidth) {
                        h = Math.round((h * maxWidth) / w);
                        w = maxWidth;
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/webp', 0.7));
                };
            };
        }
    });
}

// 4. ОТПРАВКА МЕДИСФАЙЛОВ В ЧАТ (ПК И СМАРТФОН)
document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try {
        const isVideo = file.type.startsWith('video/');
        const base64Content = await fileToBase64(file, 800);

        push(ref(db, `messages/${currentChatTarget}`), {
            sender: currentUser.uid,
            senderName: currentUser.email.split('@')[0],
            type: isVideo ? 'video' : 'image',
            content: base64Content,
            timestamp: serverTimestamp(),
            read: false
        });
    } catch (err) {
        alert('Ошибка отправки файла: ' + err.message);
    }
});

// СМЕНА АВАТАРКИ
document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    try {
        const base64Avatar = await fileToBase64(file, 150);
        await set(ref(db, `users/${currentUser.uid}`), {
            name: currentUser.email.split('@')[0],
            email: currentUser.email,
            avatar: base64Avatar
        });
        document.getElementById('user-avatar').src = base64Avatar;
        alert('Аватар обновлен!');
    } catch (err) {
        alert('Ошибка смены аватарки: ' + err.message);
    }
});

// 5. ПУБЛИКАЦИЯ И УДАЛЕНИЕ ПОСТОВ СО СТЕНЫ
document.getElementById('post-file-input').addEventListener('change', (e) => {
    selectedPostFile = e.target.files[0];
    document.getElementById('post-file-name').innerText = selectedPostFile ? selectedPostFile.name : '';
});

document.getElementById('submit-post-btn').addEventListener('click', async () => {
    const text = document.getElementById('post-text-input').value.trim();
    if(!text && !selectedPostFile) return;

    let mediaUrl = '';
    let mediaType = 'text';

    if(selectedPostFile) {
        mediaType = selectedPostFile.type.startsWith('video/') ? 'video' : 'image';
        mediaUrl = await fileToBase64(selectedPostFile, 600);
    }

    push(ref(db, 'posts'), {
        author: currentUser.uid,
        authorEmail: currentUser.email,
        text: text,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        timestamp: serverTimestamp()
    });

    document.getElementById('post-text-input').value = '';
    selectedPostFile = null;
    document.getElementById('post-file-name').innerText = '';
});

function loadPosts() {
    onValue(ref(db, 'posts'), (snapshot) => {
        const container = document.getElementById('wall-posts');
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        Object.keys(data).reverse().forEach(key => {
            const post = data[key];
            const isMyPost = post.author === currentUser.uid;
            const item = document.createElement('div');
            item.className = 'post-item';
            
            let mediaHTML = '';
            if (post.mediaUrl) {
                if (post.mediaType === 'video') {
                    mediaHTML = `<video src="${post.mediaUrl}" controls class="post-media-video"></video>`;
                } else {
                    mediaHTML = `<img src="${post.mediaUrl}" class="post-media-img">`;
                }
            }

            // Кнопка УДАЛИТЬ только для создателя поста
            let deleteBtn = isMyPost ? `<button class="btn-delete-post" onclick="window.deletePost('${key}')">🗑️ Удалить</button>` : '';

            item.innerHTML = `
                <div class="post-header-row">
                    <strong>${post.authorEmail.split('@')[0]}</strong>
                    ${deleteBtn}
                </div>
                <p style="margin-top: 6px;">${post.text}</p>
                ${mediaHTML}
                <div class="post-footer">
                    <button class="btn-sm btn-outline" onclick="window.likePost('${key}')">❤️ ${post.likes ? Object.keys(post.likes).length : 0}</button>
                </div>
            `;
            container.appendChild(item);
        });
    });
}

window.likePost = function(postKey) {
    const likeRef = ref(db, `posts/${postKey}/likes/${currentUser.uid}`);
    set(likeRef, true);
};

window.deletePost = function(postKey) {
    if(confirm("Вы уверены, что хотите удалить эту запись со стены?")) {
        remove(ref(db, `posts/${postKey}`));
    }
};

// НАСТРОЙКИ
document.getElementById('theme-toggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
});

let fontSize = 100;
document.getElementById('font-inc').addEventListener('click', () => changeFontSize(10));
document.getElementById('font-dec').addEventListener('click', () => changeFontSize(-10));

function changeFontSize(delta) {
    fontSize = Math.min(Math.max(fontSize + delta, 80), 150);
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}%`);
    document.getElementById('font-size-val').innerText = `${fontSize}%`;
}

// МОБИЛЬНАЯ НАВИГАЦИЯ
function openMobileTab(targetId) {
    document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-target') === targetId);
    });
    document.querySelectorAll('.panel').forEach(p => {
        p.classList.toggle('active', p.id === targetId);
    });
}

document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        openMobileTab(btn.getAttribute('data-target'));
    });
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}
