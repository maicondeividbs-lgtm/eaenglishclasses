/* EA English Classes — Service Worker (PWA)
   Estratégia segura:
   - Apenas requisições GET de MESMA origem são tratadas.
   - Supabase/API/CDNs (cross-origin) e POST/PUT passam direto (dados e auth sempre ao vivo).
   - Páginas autenticadas (dashboards/login) nunca são armazenadas em cache.
*/
const VERSION = 'ea-v2';
const CACHE = 'ea-shell-' + VERSION;
const PRECACHE = [
  '/offline.html',
  '/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];
// Páginas públicas que PODEM ser cacheadas para uso offline
const PUBLIC_PAGES = ['/', '/index.html', '/cursos.html', '/contato.html', '/biblioteca.html', '/404.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST/PUT → rede (forms, Supabase writes)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // Supabase/CDNs → rede
  if (url.pathname.startsWith('/api/')) return;      // serverless → rede

  // MESMA ORIGEM: network-first (sempre a versão mais recente do site quando online),
  // com cache apenas como reserva offline. Dashboards/login nunca são gravados em cache.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
        const isNav = req.mode === 'navigate';
        if (!isNav || PUBLIC_PAGES.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
      }
      return res;
    }).catch(() =>
      caches.match(req).then((cached) =>
        cached || (req.mode === 'navigate' ? caches.match('/offline.html') : Promise.reject('offline'))
      )
    )
  );
});
