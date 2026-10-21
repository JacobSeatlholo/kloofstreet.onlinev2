/* KloofStreet.online v2 — service worker
   Shell precache + smart runtime caching. Bump VERSION on every deploy
   that changes index.html so clients pick up the new shell. */
var VERSION = 'kloofstreet-v2.0.14';
var SHELL = [
  './', './index.html', './manifest.webmanifest', './streetpass-config.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

var IMG_RE = /\.(?:png|jpe?g|webp|gif|svg|ico)(?:$|\?)/i;
var NEVER = /(supabase\.co|plausible|translate\.google|googleapis)/i;

function swr(req) {
  return caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.pathname.indexOf('/api/') === 0) return;        // auth, payments, AI — network only
  if (NEVER.test(url.hostname)) return;                    // supabase, analytics, translate
  if (req.mode === 'navigate') {                           // SPA: fresh when online, shell when offline
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () { return caches.match('./index.html'); })
    );
    return;
  }
  e.respondWith(swr(req));                                 // assets: stale-while-revalidate
});
