const CACHE_NAME = 'jet-portal-v15';
const ASSETS = [
  '/',
  '/index.html',
  '/duty-cards/',
  '/duty-cards/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/index_files/jet-data.js',
  '/index_files/jet-data-layer.js',
  '/index_files/jet-ui-helpers.js',
  '/index_files/jet-stop-directory.js',
  '/index_files/duty-cards-app.js',
  '/index_files/app.js'
];
const NETWORK_FIRST_PATHS = new Set([
  '/',
  '/index.html',
  '/duty-cards/',
  '/duty-cards/index.html',
  '/index_files/app.js',
  '/index_files/duty-cards-app.js',
  '/index_files/jet-data.js',
  '/index_files/jet-data-layer.js',
  '/index_files/jet-ui-helpers.js',
  '/index_files/jet-stop-directory.js'
]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => 
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/')))
  );
});
