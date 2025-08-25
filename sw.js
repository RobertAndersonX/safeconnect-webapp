// sw.js — SafeConnect (GitHub Pages scope-aware)
const CACHE = 'sc-cache-v7'; // bump
const SCOPE = self.registration.scope;  // напр.: https://....github.io/safeconnect-webapp/
const ASSET_PATHS = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'content/index.json',
];

const ASSETS = ASSET_PATHS.map(p => new URL(p, SCOPE).toString());

// === API base selector ===
const DEV_API  = 'http://127.0.0.1:8787';
const PROD_API = 'https://safeconnect-api-dev.spacewenderer1.workers.dev';

function isLocalHost(name) {
  return name === 'localhost' || name === '127.0.0.1';
}

function apiBaseForScope() {
  // если сам сайт открыт с localhost — работаем на локалку, иначе — прод
  const h = (new URL(SCOPE)).hostname;
  return isLocalHost(h) ? DEV_API : PROD_API;
}

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

// fetch: уважаем ?no-sw=1; никогда не кэшируем воркеры
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  console.log('SW fetch: ', req.url);

  // 1) Полностью обходим SW, если явно просят
  if (url.searchParams.get('no-sw') === '1') return;

  // 2) Никогда не кэшируем вызовы к Cloudflare Workers
  if (url.hostname.endsWith('.workers.dev')) {
    e.respondWith(fetch(req));
    return;
  }

  // 3) Если страница НЕ локальная, но запрос почему-то идёт на 127.0.0.1 — перепишем на прод
  if (!isLocalHost((new URL(SCOPE)).hostname) && isLocalHost(url.hostname)) {
    const rewritten = new URL(req.url);
    const base = new URL(apiBaseForScope());
    rewritten.protocol = base.protocol;
    rewritten.host     = base.host;
    e.respondWith(fetch(new Request(rewritten.toString(), req)));
    return;
  }

  // 4) API: network-first (alerts, verify, authed/*)
  const apiHost = new URL(apiBaseForScope()).host;
  const isApiCall =
    url.hostname === apiHost ||
    url.pathname === '/alerts' ||
    url.pathname.startsWith('/authed/') ||
    url.pathname === '/verify' ||
    url.pathname === '/verify-telegram';

  if (isApiCall) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // 5) контент (guide/practices): cache-first
  if (url.pathname.startsWith(new URL('content/', SCOPE).pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // 6) аудио/прочая статика (если появится): cache-first
  if (url.pathname.startsWith(new URL('audio/', SCOPE).pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // 7) Offline-first для остальной статики
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
