// sw.js — SafeConnect (GitHub Pages scope-aware)
const CACHE = 'sc-cache-v5'; // bump при каждом изменении
const SCOPE = self.registration.scope; // напр.: https://...github.io/safeconnect-webapp/
const ASSET_PATHS = [
  '',                   // index.html
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png'
];
// делаем абсолютные URL под текущий scope (важно для GH Pages)
const ASSETS = ASSET_PATHS.map(p => new URL(p, SCOPE).toString());

// универсальная очистка (на будущее)
async function purgeAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
  })());
  self.clients.claim();
});

// возможность убить SW сообщением (если вдруг понадобится)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'FORCE_UNREGISTER') {
    (async () => {
      try { await purgeAllCaches(); await self.registration.unregister(); } catch {}
    })();
  }
});

// fetch: уважаем ?no-sw=1 и .workers.dev
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Полностью обходим SW если явно просят
  if (url.searchParams.get('no-sw') === '1') return;

  // Никогда не кэшируем Cloudflare Workers API
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Пример: network-first для будущего JSON-фида
  if (url.pathname.includes('/api/alerts')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // Offline-first для статики
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
