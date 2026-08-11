import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, onDisconnect, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBRi7lwyM1XELz02Gy_llBXt3c0V7kpLCI",
  authDomain: "homa-27efb.firebaseapp.com",
  databaseURL: "https://homa-27efb-default-rtdb.firebaseio.com",
  projectId: "homa-27efb",
  storageBucket: "homa-27efb.firebasestorage.app",
  messagingSenderId: "365610803694",
  appId: "1:365610803694:web:76a5554f8ab0c51c0f2eff"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);

let currentUser = null;
let currentChatTarget = 'global';
let selectedPostImage = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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
    loadMessages('global');
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

// КОНТАКТЫ
function loadContacts() {
    onValue(ref(db, 'users'), (snapshot) => {
        const container = document.getElementById('contacts-list');
        container.innerHTML = '';
        const users = snapshot.val() || {};
        
        const globalChatDiv = document.createElement('div');
        globalChatDiv.className = 'contact-item';
        globalChatDiv.innerHTML = `<strong>📢 Общий Чат</strong>`;
        globalChatDiv.onclick = () => switchChat('global', 'Общий чат');
        container.appendChild(globalChatDiv);

        Object.keys(users).forEach(uid => {
            if(uid === currentUser.uid) return;
            const u = users[uid];
            const div = document.createElement('div');
            div.className = 'contact-item';
            div.innerHTML = `
                <img src="${u.avatar || 'https://via.placeholder.com/35'}" class="avatar-sm">
                <div>
                    <div><strong>${u.name || u.email}</strong></div>
                    <span id="status-${uid}" class="text-muted" style="font-size:0.75rem;">⚪ Оффлайн</span>
                </div>
            `;
            div.onclick = () => switchChat(uid, u.name || u.email);
            container.appendChild(div);

            onValue(ref(db, `/status/${uid}`), (sSnap) => {
                const st = sSnap.val();
                const el = document.getElementById(`status-${uid}`);
                if(el && st) {
                    el.innerText = st.state === 'online' ? '🟢 В сети' : '⚪ Был(а) недавно';
                }
            });
        });
    });
}

// ЧАТ И СООБЩЕНИЯ
function switchChat(targetId, title) {
    currentChatTarget = targetId;
    document.getElementById('chat-title').innerText = title;
    loadMessages(targetId);
}

document.getElementById('send-msg-btn').addEventListener('click', sendTextMessage);
document.getElementById('chat-text-input').addEventListener('keypress', (e) => {
    if(e.key === 'Enter') sendTextMessage();
});

function sendTextMessage() {
    const input = document.getElementById('chat-text-input');
    const text = input.value.trim();
    if(!text) return;

    push(ref(db, `messages/${currentChatTarget}`), {
        sender: currentUser.uid,
        type: 'text',
        content: text,
        timestamp: serverTimestamp()
    });
    input.value = '';
}

function loadMessages(targetId) {
    onValue(ref(db, `messages/${targetId}`), (snapshot) => {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        Object.values(data).forEach(msg => {
            const isOutgoing = msg.sender === currentUser.uid;
            const bubble = document.createElement('div');
            bubble.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;
            
            let body = msg.content;
            if(msg.type === 'image') {
                body = `<img src="${msg.content}" class="chat-media-img">`;
            } else if (msg.type === 'audio') {
                body = `<div class="audio-player"><audio src="${msg.content}" controls preload="metadata"></audio></div>`;
            }

            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '...';
            bubble.innerHTML = `${body} <div class="msg-meta">${timeStr} ✓</div>`;
            container.appendChild(bubble);
        });
        container.scrollTop = container.scrollHeight;
    });
}

// ПРИВЯЗКА НАЖАТИЙ ДЛЯ iOS SAFARI
document.getElementById('chat-file-btn').addEventListener('click', () => {
    document.getElementById('chat-file-input').click();
});

document.getElementById('avatar-edit-btn').addEventListener('click', () => {
    document.getElementById('avatar-file-input').click();
});

document.getElementById('post-file-btn').addEventListener('click', () => {
    document.getElementById('post-file-input').click();
});

// АУДИОСООБЩЕНИЯ (ЗАПИСЬ С МИКРОФОНА)
const recordBtn = document.getElementById('record-audio-btn');
recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp4' });
                const audioStorageRef = storageRef(storage, `audio/${Date.now()}.mp4`);
                await uploadBytes(audioStorageRef, audioBlob);
                const url = await getDownloadURL(audioStorageRef);

                push(ref(db, `messages/${currentChatTarget}`), {
                    sender: currentUser.uid,
                    type: 'audio',
                    content: url,
                    timestamp: serverTimestamp()
                });
            };

            mediaRecorder.start();
            isRecording = true;
            recordBtn.innerText = '🛑';
            recordBtn.style.color = 'var(--danger)';
        } catch (err) {
            alert('Нет доступа к микрофону: ' + err.message);
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.innerText = '🎙️';
        recordBtn.style.color = 'var(--text-primary)';
    }
});

// СЖАТИЕ КАРТИНОК
async function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
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
                canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
            };
        };
    });
}

// СМЕНА АВАТАРКИ
document.getElementById('avatar-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;

    try {
        const compressedAvatar = await compressImage(file, 150, 0.8);
        const avatarRef = storageRef(storage, `avatars/${currentUser.uid}.webp`);
        await uploadBytes(avatarRef, compressedAvatar);
        const downloadURL = await getDownloadURL(avatarRef);

        await set(ref(db, `users/${currentUser.uid}`), {
            name: currentUser.email.split('@')[0],
            email: currentUser.email,
            avatar: downloadURL
        });

        document.getElementById('user-avatar').src = downloadURL;
        alert('Аватар обновлен!');
    } catch (err) {
        alert('Ошибка загрузки аватарки: ' + err.message);
    }
});

// ОТПРАВКА КАРТИНОК В ЧАТ
document.getElementById('chat-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    try {
        const compressedBlob = await compressImage(file, 1200, 0.7);
        const fileStorageRef = storageRef(storage, `chat_media/${Date.now()}.webp`);
        await uploadBytes(fileStorageRef, compressedBlob);
        const url = await getDownloadURL(fileStorageRef);

        push(ref(db, `messages/${currentChatTarget}`), {
            sender: currentUser.uid,
            type: 'image',
            content: url,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        alert('Ошибка отправки файла: ' + err.message);
    }
});

// СТЕНА ПОСТОВ
document.getElementById('post-file-input').addEventListener('change', (e) => {
    selectedPostImage = e.target.files[0];
    document.getElementById('post-file-name').innerText = selectedPostImage ? selectedPostImage.name : '';
});

document.getElementById('submit-post-btn').addEventListener('click', async () => {
    const text = document.getElementById('post-text-input').value.trim();
    if(!text && !selectedPostImage) return;

    let mediaUrl = '';
    if(selectedPostImage) {
        const compressed = await compressImage(selectedPostImage, 800, 0.6);
        const pRef = storageRef(storage, `posts/${Date.now()}.webp`);
        await uploadBytes(pRef, compressed);
        mediaUrl = await getDownloadURL(pRef);
    }

    push(ref(db, 'posts'), {
        author: currentUser.uid,
        authorEmail: currentUser.email,
        text: text,
        mediaUrl: mediaUrl,
        timestamp: serverTimestamp()
    });

    document.getElementById('post-text-input').value = '';
    selectedPostImage = null;
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
            
            let imgHTML = post.mediaUrl ? `<img src="${post.mediaUrl}" class="post-media-img">` : '';
            let deleteBtn = isMyPost ? `<button class="btn-delete-post" onclick="window.deletePost('${key}')">🗑️ Удалить</button>` : '';

            item.innerHTML = `
                <div class="post-header-row">
                    <strong>${post.authorEmail.split('@')[0]}</strong>
                    ${deleteBtn}
                </div>
                <p style="margin-top: 4px;">${post.text}</p>
                ${imgHTML}
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
    if(confirm("Удалить эту запись со стены?")) {
        remove(ref(db, `posts/${postKey}`));
    }
};

// НАСТРОЙКИ ВЕРСТКИ
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

// РАЗРЕШЕНИЯ
document.getElementById('req-mic-btn').addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(() => alert('Микрофон разрешен!'));
});
document.getElementById('req-cam-btn').addEventListener('click', () => {
    navigator.mediaDevices.getUserMedia({ video: true }).then(() => alert('Камера разрешена!'));
});
document.getElementById('req-notif-btn').addEventListener('click', () => {
    Notification.requestPermission().then(perm => alert('Статус уведомлений: ' + perm));
});

// МОБИЛЬНАЯ НАВИГАЦИЯ
document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        document.querySelectorAll('.bottom-nav .nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        
        btn.classList.add('active');
        document.getElementById(target).classList.add('active');
    });
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
}
