// Service worker simplified cache versioning
const CACHE_VERSION = 'v2::shillong-teer-pro-assets';
const PRECACHE_URLS = [ '/', '/index.html', '/styles.css?v=2', '/app.js?v=2' ];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map(key => { if (key !== CACHE_VERSION) return caches.delete(key); return null; })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network-first for API, cache-first for static
  const req = event.request;
  if (req.url.includes('/api/')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((res) => res || fetch(req))
  );
});
