importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBRi7lwyM1XELz02Gy_llBXt3c0V7kpLCI",
  authDomain: "homa-27efb.firebaseapp.com",
  projectId: "homa-27efb",
  storageBucket: "homa-27efb.firebasestorage.app",
  messagingSenderId: "365610803694",
  appId: "1:365610803694:web:76a5554f8ab0c51c0f2eff"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
