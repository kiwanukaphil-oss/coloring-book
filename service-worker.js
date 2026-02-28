/* ========================================
   Service Worker
   Cache-first strategy for offline support.
   Caches all app assets during install and
   serves them from cache on subsequent loads.
   ======================================== */

const CACHE_VERSION = 'coloring-book-v3';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/app.js',
    './js/canvas-manager.js',
    './js/flood-fill.js',
    './js/brush-engine.js',
    './js/color-palette.js',
    './js/toolbar.js',
    './js/image-loader.js',
    './js/undo-manager.js',
    './js/touch-guard.js',
    './images/icons/icon-192.svg',
    './images/icons/icon-512.svg',
    './images/coloring-pages/cat.svg',
];

// Caches all core app assets during service worker installation
// so the app works fully offline after the first visit
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Cleans up old cache versions when a new service worker
// takes over, preventing stale assets from accumulating
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_VERSION)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Serves cached assets first for speed, falling back to
// network for any assets not yet in the cache (e.g. uploaded images)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});
