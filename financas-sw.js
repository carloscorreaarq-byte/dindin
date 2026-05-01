// Service Worker — Finanças Pessoais
const CACHE = 'financas-v19';
const APP_SHELL = [
  './index.html',
  './financas-manifest.json',
  './financas-sw.js',
  './financas-core.js',
  './financas-app.js',
  './financas-init.js',
  './icons/dindin-mark.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        const isSameOrigin = new URL(e.request.url).origin === self.location.origin;
        if (isSameOrigin && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return response;
      });
    })
  );
});
