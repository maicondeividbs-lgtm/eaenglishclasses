/* EA English Classes — Service Worker (PWA)
   Estratégia segura:
   - Apenas requisições GET de MESMA origem são tratadas.
   - Supabase/API/CDNs (cross-origin) e POST/PUT passam direto (dados e auth sempre ao vivo).
   - Páginas autenticadas (dashboards/login) nunca são armazenadas em cache.
*/
const VERSION = 'ea-v10';
const CACHE = 'ea-shell-' + VERSION;
const PRECACHE = [
  '/offline',
  '/style.css',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/Logo_EA.jpg',
  '/icons/notif-icon.png',
  '/icons/notif-badge.png'
];
// Páginas públicas que PODEM ser cacheadas para uso offline
const PUBLIC_PAGES = ['/', '/cursos', '/contato', '/biblioteca', '/404'];

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

// ── Notificação padronizada da EA (logo oficial + categoria + ação) ──
function eaShowNotification(d) {
  d = d || {};
  var opts = {
    body: d.body || '',
    icon: '/icons/Logo_EA.jpg',      // logo da escola (aparece grande, recortada em círculo)
    badge: '/icons/notif-badge.png', // monocromático para a barra de status
    vibrate: [60, 30, 60],
    tag: d.tag || 'ea-notif',        // mesma categoria agrupa/atualiza
    renotify: true,
    lang: 'pt-BR', dir: 'ltr',
    timestamp: Date.now(),
    data: { url: d.url || '/login', cat: d.cat || 'geral' }
  };
  if (d.image) opts.image = d.image;                         // big picture (Android)
  if (d.actionLabel) opts.actions = [{ action: 'open', title: d.actionLabel }];
  return self.registration.showNotification(d.title || 'EA English Classes', opts);
}

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (e.data && e.data.type === 'EA_NOTIFY') {
    eaShowNotification(e.data.payload || {});
  }
});

// ── Push do servidor (app fechado) ──
self.addEventListener('push', (e) => {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'EA English Classes', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(eaShowNotification(data));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/login';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(url.replace(/^\//, '')) !== -1 && 'focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
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
        cached || (req.mode === 'navigate' ? caches.match('/offline') : Promise.reject('offline'))
      )
    )
  );
});
