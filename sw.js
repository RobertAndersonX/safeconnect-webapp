// ---- SafeConnect SW (GH Pages / Telegram) ----
const CACHE = 'sc-cache-v4';
const ASSETS = [
  './',                // для GH Pages в подкаталоге подходит
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

// Универсальная очистка всех кэшей
async function purgeAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // удалим старые версии кэша
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));

    // нав. preload не обязателен, но помогает на мобильных
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
  })());
  self.clients.claim();
});

// Позволяет странице принудительно снять SW (мы шлём это из index.html при ?no-sw=1)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'FORCE_UNREGISTER') {
    (async () => {
      try {
        await purgeAllCaches();
        await self.registration.unregister();
      } catch {}
    })();
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Никогда не проксировать/кешировать наш API на Workers
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(fetch(req));
    return;
  }

  // HTML / навигация — network-first, с запасным index.html из кэша
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith((async () => {
      try {
        // пробуем сеть
        const net = await fetch(req, { cache: 'no-store' });
        // подменять кэш index.html не будем, чтобы не залипла старая версия
        return net;
      } catch {
        // если оффлайн — вернём кешированный index.html
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // Статика — offline-first
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const net = await fetch(req);
      const cache = await caches.open(CACHE);
      // Кешируем только same-origin статику
      if (url.origin === location.origin) cache.put(req, net.clone());
      return net;
    } catch {
      // последний шанс — что-то из кэша
      const fallback = await caches.match(req);
      return fallback || Response.error();
    }
  })());
});
