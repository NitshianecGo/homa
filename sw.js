const CACHE_NAME = 'privatespace-v16';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=16',
  './app.js?v=16',
  './manifest.json',
  './apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url))
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // Удаляем старый кэш со светлой темой
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
