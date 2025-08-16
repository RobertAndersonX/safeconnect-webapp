const CACHE = 'sc-cache-v2'; // Инкрементировано с v1 на v2
const ASSETS = [
  './',            // index.html из текущей директории
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Не кэшировать наш API на Workers
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // network-first для будущего фида (пример — JSON/alerts)
  if (url.pathname.includes('/api/alerts')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // offline-first для статики
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
