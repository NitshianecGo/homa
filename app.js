import { initializeApp } from "[https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js](https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js)";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "[https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js](https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js)";
import { getDatabase, ref, set, push, onValue, off, remove, onDisconnect, serverTimestamp } from "[https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js](https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js)";

const firebaseConfig = {
  apiKey: "AIzaSyBRi7lwyM1XELz02Gy_llBXt3c0V7kpLCI",
  authDomain: "homa-27efb.firebaseapp.com",
  databaseURL: "[https://homa-27efb-default-rtdb.firebaseio.com](https://homa-27efb-default-rtdb.firebaseio.com)",
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
let recordTimerInterval = null;
let recordSeconds = 0;
let typingTimeout = null;
let replyTargetMessage = null;

let messagesRefUnsub = null;
let typingRefUnsub = null;
let pinnedRefUnsub = null;

// WEB AUDIO API СИНТЕТИКА ЗВУКОВ ОПОВЕЩЕНИЙ
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'send') {
            osc.frequency.setValueAtTime(600, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } else if (type === 'receive') {
            osc.frequency.setValueAtTime(800, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.12);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.12);
        }
    } catch(e) {}
}

// HAPTIC FEEDBACK (ВИБРООТКЛИК)
function triggerHaptic() {
    if ("vibrate" in navigator) {
        navigator.vibrate(40);
    }
}

// Web Push Уведомления
if ("Notification" in window && Notification.permission !== "granted") {
    Notification.requestPermission();
}

function showNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
        new Notification(title, { body: body, icon: "apple-touch-icon.png" });
    }
}

// ФИКС ВЫСОТЫ iOS SAFARI
function fixIOSHeight() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}
window.addEventListener('resize', fixIOSHeight);
window.addEventListener('orientationchange', fixIOSHeight);
fixIOSHeight();

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
    triggerHaptic();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    signInWithEmailAndPassword(auth, email, pass)
        .catch(err => document.getElementById('auth-error').innerText = "Ошибка входа: " + err.message);
});

document.getElementById('logout-btn').addEventListener('click', () => {
    triggerHaptic();
    signOut(auth);
});

// ОНЛАЙН СТАТУС И lastSeen
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
    checkAutoRetention();
    
    document.getElementById('user-email-text').innerText = currentUser.email;
    document.getElementById('user-display-name').innerText = currentUser.email.split('@')[0];

    onValue(ref(db, `users/${currentUser.uid}`), (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.avatar) {
            document.getElementById('user-avatar').src = userData.avatar;
        }
    });
}

// 1. КОНТАКТЫ С ВРЕМЕНЕМ ПОСЛЕДНЕГО ВИЗИТА
function loadContacts() {
    onValue(ref(db, 'users'), (snapshot) => {
        const container = document.getElementById('contacts-list');
        container.innerHTML = '';
        const users = snapshot.val() || {};
        
        const globalChatDiv = document.createElement('div');
        globalChatDiv.className = 'contact-item';
        globalChatDiv.innerHTML = `<strong>📢 Общий Чат</strong>`;
        globalChatDiv.onclick = () => {
            triggerHaptic();
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
                <img src="${u.avatar || '[https://via.placeholder.com/35](https://via.placeholder.com/35)'}" class="avatar-sm">
                <div>
                    <div><strong>${u.name || u.email.split('@')[0]}</strong></div>
                    <span id="status-${uid}" class="text-muted" style="font-size:0.75rem;">⚪ Оффлайн</span>
                </div>
            `;
            
            div.onclick = () => {
                triggerHaptic();
                switchChat(privateChatId, `💬 Чат с ${u.name || u.email.split('@')[0]}`);
                openMobileTab('panel-chat');
            };
            container.appendChild(div);

            onValue(ref(db, `/status/${uid}`), (sSnap) => {
                const st = sSnap.val();
                const el = document.getElementById(`status-${uid}`);
                if (el && st) {
                    if (st.state === 'online') {
                        el.innerText = '🟢 В сети';
                        el.style.color = '#a6e3a1';
                    } else {
                        const lastTime = st.lastChanged ? new Date(st.lastChanged).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
                        el.innerText = `⚪ Был(а) в сети ${lastTime ? 'в ' + lastTime : ''}`;
                        el.style.color = 'var(--text-muted)';
                    }
                }
            });
        });
    });
}

// 2. ЧАТ, ЗАКРЕП И ОЧИСТКА
function switchChat(targetId, title) {
    currentChatTarget = targetId;
    document.getElementById('chat-title').innerText = title;
    cancelReply();
    loadMessages(targetId);
    listenTyping(targetId);
    listenPinnedMessage(targetId);
}

document.getElementById('clear-chat-btn').addEventListener('click', () => {
    triggerHaptic();
    if (confirm("Вы уверены, что хотите полностью очистить этот диалог из базы данных?")) {
        remove(ref(db, `messages/${currentChatTarget}`))
            .then(() => alert("Диалог успешно очищен."))
            .catch((err) => alert("Ошибка при очистке: " + err.message));
    }
});

// ЗАКРЕПЛЕНИЕ СООБЩЕНИЙ
document.getElementById('pin-msg-btn').addEventListener('click', () => {
    triggerHaptic();
    const text = prompt("Введите текст для закрепления в шапке чата:");
    if (text) {
        set(ref(db, `pinned/${currentChatTarget}`), text);
    }
});

document.getElementById('unpin-btn').addEventListener('click', () => {
    triggerHaptic();
    remove(ref(db, `pinned/${currentChatTarget}`));
});

function listenPinnedMessage(chatId) {
    if (pinnedRefUnsub) off(pinnedRefUnsub);
    pinnedRefUnsub = ref(db, `pinned/${chatId}`);
    onValue(pinnedRefUnsub, (snap) => {
        const val = snap.val();
        const bar = document.getElementById('pinned-bar');
        if (val) {
            document.getElementById('pinned-text').innerText = val;
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    });
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
    if (typingRefUnsub) off(typingRefUnsub);
    
    typingRefUnsub = ref(db, `typing/${chatId}`);
    onValue(typingRefUnsub, (snapshot) => {
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
    triggerHaptic();
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
    playSound('send');
    
    set(ref(db, `typing/${currentChatTarget}/${currentUser.uid}`), false);
    input.value = '';
    cancelReply();
}

function cancelReply() {
    replyTargetMessage = null;
    document.getElementById('reply-preview').style.display = 'none';
}
document.getElementById('cancel-reply-btn').addEventListener('click', cancelReply);

let isInitialLoad = true;

function loadMessages(targetId) {
    if (messagesRefUnsub) off(messagesRefUnsub);
    isInitialLoad = true;

    messagesRefUnsub = ref(db, `messages/${targetId}`);
    onValue(messagesRefUnsub, (snapshot) => {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        const keys = Object.keys(data);
        keys.forEach((msgKey, index) => {
            const msg = data[msgKey];
            const isOutgoing = msg.sender === currentUser.uid;

            if (!isOutgoing && msg.read === false) {
                set(ref(db, `messages/${targetId}/${msgKey}/read`), true);
                if (!isInitialLoad && index === keys.length - 1) {
                    playSound('receive');
                    showNotification(msg.senderName, msg.type === 'text' ? msg.content : `Отправил(а) [${msg.type}]`);
                }
            }

            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
            
            bubble.onclick = () => {
                triggerHaptic();
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
                body = `<img src="${msg.content}" class="chat-media-img" onclick="window.openLightbox('${msg.content}')">`;
            } else if (msg.type === 'video') {
                body = `<video src="${msg.content}" controls class="chat-media-video"></video>`;
            } else if (msg.type === 'audio') {
                const uniqueAudioId = `audio-${msgKey}`;
                body = `
                    <div class="audio-voice-message">
                        <div class="waveform-visual">
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                        </div>
                        <audio id="${uniqueAudioId}" src="${msg.content}" controls playsinline preload="metadata" class="custom-audio-elem"></audio>
                        <button class="btn btn-outline btn-sm glass-btn speed-btn" onclick="window.toggleAudioSpeed('${uniqueAudioId}', this)">1x</button>
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
        });

        isInitialLoad = false;
        container.scrollTop = container.scrollHeight;
    });
}

// УСКОРЕНИЕ ГОЛОСОВЫХ
window.toggleAudioSpeed = function(audioId, btn) {
    triggerHaptic();
    const audio = document.getElementById(audioId);
    if (!audio) return;
    if (audio.playbackRate === 1) {
        audio.playbackRate = 1.5;
        btn.innerText = '1.5x';
    } else if (audio.playbackRate === 1.5) {
        audio.playbackRate = 2.0;
        btn.innerText = '2x';
    } else {
        audio.playbackRate = 1.0;
        btn.innerText = '1x';
    }
};

// LIGHTBOX ДЛЯ ФОТО
window.openLightbox = function(src) {
    triggerHaptic();
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    img.src = src;
    modal.style.display = 'flex';
};

document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox-modal').style.display = 'none';
});
document.getElementById('lightbox-modal').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') {
        document.getElementById('lightbox-modal').style.display = 'none';
    }
});

// 3. ЗАПИСЬ ГОЛОСОВЫХ С ТАЙМЕРОМ
const recordBtn = document.getElementById('record-audio-btn');
const recordTimerElem = document.getElementById('record-timer');

function getSupportedMimeType() {
    const types = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    for (let type of types) {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

recordBtn.addEventListener('click', async () => {
    triggerHaptic();
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });
            
            const mimeType = getSupportedMimeType();
            mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                clearInterval(recordTimerInterval);
                recordTimerElem.style.display = 'none';
                
                const finalMime = mediaRecorder.mimeType || 'audio/mp4';
                const audioBlob = new Blob(audioChunks, { type: finalMime });
                
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    push(ref(db, `messages/${currentChatTarget}`), {
                        sender: currentUser.uid,
                        senderName: currentUser.email.split('@')[0],
                        type: 'audio',
                        content: reader.result,
                        timestamp: serverTimestamp(),
                        read: false
                    });
                    playSound('send');
                };

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            document.getElementById('record-icon').innerText = '🛑';
            
            // Запуск таймера
            recordSeconds = 0;
            recordTimerElem.innerText = '00:00';
            recordTimerElem.style.display = 'inline';
            recordTimerInterval = setInterval(() => {
                recordSeconds++;
                const mins = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
                const secs = String(recordSeconds % 60).padStart(2, '0');
                recordTimerElem.innerText = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            alert('Разрешите доступ к микрофону в настройках.');
        }
    } else {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        isRecording = false;
        document.getElementById('record-icon').innerText = '🎙️';
    }
});

// ФАЙЛЫ И ВЫБОР
document.getElementById('chat-file-btn').addEventListener('click', () => { triggerHaptic(); document.getElementById('chat-file-input').click(); });
document.getElementById('avatar-edit-btn').addEventListener('click', () => { triggerHaptic(); document.getElementById('avatar-file-input').click(); });
document.getElementById('post-file-btn').addEventListener('click', () => { triggerHaptic(); document.getElementById('post-file-input').click(); });

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

document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    try {
        const isVideo = file.type.startsWith('video/');
        const mediaData = await fileToBase64(file, 800);

        push(ref(db, `messages/${currentChatTarget}`), {
            sender: currentUser.uid,
            senderName: currentUser.email.split('@')[0],
            type: isVideo ? 'video' : 'image',
            content: mediaData,
            timestamp: serverTimestamp(),
            read: false
        });
        playSound('send');
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

// ПУБЛИКАЦИЯ И УДАЛЕНИЕ ПОСТОВ
document.getElementById('post-file-input').addEventListener('change', (e) => {
    selectedPostFile = e.target.files[0];
    document.getElementById('post-file-name').innerText = selectedPostFile ? selectedPostFile.name : '';
});

document.getElementById('submit-post-btn').addEventListener('click', async () => {
    triggerHaptic();
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
            item.className = 'post-item glass-panel';
            
            let mediaHTML = '';
            if (post.mediaUrl) {
                if (post.mediaType === 'video') {
                    mediaHTML = `<video src="${post.mediaUrl}" controls class="post-media-video"></video>`;
                } else {
                    mediaHTML = `<img src="${post.mediaUrl}" class="post-media-img" onclick="window.openLightbox('${post.mediaUrl}')">`;
                }
            }

            let deleteBtn = isMyPost ? `<button class="btn-delete-post" onclick="window.deletePost('${key}')">🗑️ Удалить</button>` : '';

            item.innerHTML = `
                <div class="post-header-row">
                    <strong>${post.authorEmail.split('@')[0]}</strong>
                    ${deleteBtn}
                </div>
                <p style="margin-top: 6px;">${post.text}</p>
                ${mediaHTML}
                <div class="post-footer">
                    <button class="btn-sm btn-outline glass-btn" onclick="window.likePost('${key}')">❤️ ${post.likes ? Object.keys(post.likes).length : 0}</button>
                </div>
            `;
            container.appendChild(item);
        });
    });
}

window.likePost = function(postKey) {
    triggerHaptic();
    const likeRef = ref(db, `posts/${postKey}/likes/${currentUser.uid}`);
    set(likeRef, true);
};

window.deletePost = function(postKey) {
    triggerHaptic();
    if(confirm("Удалить эту запись со стены?")) {
        remove(ref(db, `posts/${postKey}`));
    }
};

// НАСТРОЙКИ ФОНА ЧАТА И ТЕМЫ
document.querySelectorAll('.bg-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        triggerHaptic();
        document.querySelectorAll('.bg-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const bg = btn.getAttribute('data-bg');
        if (bg === 'default') {
            document.body.removeAttribute('data-chat-bg');
        } else {
            document.body.setAttribute('data-chat-bg', bg);
        }
    });
});

document.getElementById('theme-toggle').addEventListener('click', () => {
    triggerHaptic();
    const currentTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
});

let fontSize = 100;
document.getElementById('font-inc').addEventListener('click', () => { triggerHaptic(); changeFontSize(10); });
document.getElementById('font-dec').addEventListener('click', () => { triggerHaptic(); changeFontSize(-10); });

function changeFontSize(delta) {
    fontSize = Math.min(Math.max(fontSize + delta, 80), 150);
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}%`);
    document.getElementById('font-size-val').innerText = `${fontSize}%`;
}

// АВТОУДАЛЕНИЕ СООБЩЕНИЙ ПО СРОКУ ХРАНЕНИЯ
document.getElementById('storage-retention-select').addEventListener('change', (e) => {
    triggerHaptic();
    const days = e.target.value;
    localStorage.setItem('retention_period', days);
    checkAutoRetention();
});

function checkAutoRetention() {
    const days = localStorage.getItem('retention_period') || 'forever';
    document.getElementById('storage-retention-select').value = days;
    if (days === 'forever') return;

    const maxAgeMs = parseInt(days) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    onValue(ref(db, 'messages'), (snapshot) => {
        const chats = snapshot.val() || {};
        Object.keys(chats).forEach(chatId => {
            const msgs = chats[chatId];
            Object.keys(msgs).forEach(msgKey => {
                const msg = msgs[msgKey];
                if (msg.timestamp && (now - msg.timestamp > maxAgeMs)) {
                    remove(ref(db, `messages/${chatId}/${msgKey}`));
                }
            });
        });
    }, { onlyOnce: true });
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
        triggerHaptic();
        openMobileTab(btn.getAttribute('data-target'));
    });
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}
