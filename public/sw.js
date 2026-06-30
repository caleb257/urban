const CACHE_NAME = 'urban-v2';
const APP_SHELL = ['/m', '/manifest.json', '/apple-touch-icon.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for API calls — always prefer live data; when the network
// fails (bad signal at a property), fall back to the last-known-good
// response instead of just showing an error.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    if (e.request.method !== 'GET') return; // never cache/intercept writes
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return res;
      }).catch(() =>
        caches.match(e.request).then((cached) =>
          cached || new Response(JSON.stringify({ error: 'offline', cached: false }), {
            headers: { 'Content-Type': 'application/json' }, status: 503
          })
        )
      )
    );
    return;
  }
  // Network-first for the app shell itself — this is an actively-developed
  // app, not a static site, so a deploy should be visible the next time
  // someone opens it while online. Cache is purely the offline fallback.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
