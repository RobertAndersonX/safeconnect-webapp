// sw.js — SafeConnect (GitHub Pages scope-aware)
const CACHE = 'sc-cache-v6'; // ↑ bump
const SCOPE = self.registration.scope;  // напр.: https://....github.io/safeconnect-webapp/
const ASSET_PATHS = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  // базовые индексы контента
  'content/index.json',
  // (фактические md подтянутся динамически и кэшируются по fetch)
  // звуки (если добавишь файлы):
  // 'audio/bell.mp3', 'audio/tick.mp3'
];

// абсолютные URL под текущий scope (важно для GH Pages)
const ASSETS = ASSET_PATHS.map(p => new URL(p, SCOPE).toString());

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// fetch: уважаем ?no-sw=1 и .workers.dev
self.addEventListener('fetch', (e) => {
  console.log('SW fetch: ', e.request.url);
  const url = new URL(e.request.url);

  // Полностью обходим SW, если явно просят
  if (url.searchParams.get('no-sw') === '1') return;

  // Никогда не кэшируем вызовы к Cloudflare Workers
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Пример: network-first для будущего JSON-фида
  if (url.pathname.includes('/api/alerts')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // контент (guide/practices): cache-first
  if (url.pathname.startsWith(new URL('content/', SCOPE).pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const fresh = await fetch(e.request);
        if (fresh.ok) cache.put(e.request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // аудио/мелкий статика (если будет): cache-first
  if (url.pathname.startsWith(new URL('audio/', SCOPE).pathname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }
  
  // Offline-first для остальной статики
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
