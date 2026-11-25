/* Menu Mag service worker: app shell + offline page.
   Only same-origin static files and Google Fonts are handled.
   Every other request (Supabase, ads, images from storage, POST) goes straight to the network. */
const VERSION = 'v2';
const STATIC = 'menu-static-' + VERSION;
const FONTS = 'menu-fonts-' + VERSION;
const PRECACHE = ['offline.html', 'menu-favicon.png', 'favicon.png', 'icon-192.png', 'icon-512-maskable.png', 'dashboard.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, FONTS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Page loads: always network first so owners and customers get the newest menu. Offline: friendly page.
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).catch(() => caches.match('offline.html').then((r) => r || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Google Fonts: cache first.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONTS).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }))
      )
    );
    return;
  }

  // Same-origin static files (icons, manifests): stale while revalidate.
  if (url.origin === self.location.origin && /\.(png|jpg|jpeg|webp|svg|ico|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
  }
  // Anything else: no respondWith, the browser handles it normally.
});
