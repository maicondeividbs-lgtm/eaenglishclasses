/* EA English Classes — Service Worker (PWA)
   Estratégia segura:
   - Apenas requisições GET de MESMA origem são tratadas.
   - Supabase/API/CDNs (cross-origin) e POST/PUT passam direto (dados e auth sempre ao vivo).
   - Páginas autenticadas (dashboards/login) nunca são armazenadas em cache.
*/
const VERSION = 'ea-v1';
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
  if (req.method !== 'GET') return;                 // POST/PUT/DELETE → rede (forms, Supabase writes)
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;  // cross-origin (Supabase, CDNs) → rede
  if (url.pathname.startsWith('/api/')) return;      // serverless API → rede

  // Navegações (HTML): network-first → cache (só público) → offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && PUBLIC_PAGES.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Assets estáticos (css/js/img/fontes): stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
