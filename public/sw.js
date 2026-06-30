// KILL SWITCH — the offline-support service worker risked showing stale
// cached data on real devices (iOS Safari in particular has quirky service
// worker update timing). Pulling it out cleanly: this version immediately
// unregisters itself, purges every cache it created, and forces any open
// tab to reload so nobody stays stuck on stale content.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clientList) => {
        clientList.forEach((client) => client.navigate(client.url));
      })
  );
});

// No fetch handler at all — every request just goes straight to the network.
