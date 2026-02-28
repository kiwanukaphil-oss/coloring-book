/* ========================================
   Service Worker
   Hybrid strategy for offline support:
   - Network-first for HTML/navigation
   - Stale-while-revalidate for static assets
   Improves update freshness while retaining
   strong offline behavior.
   ======================================== */

const CACHE_VERSION = 'coloring-book-v4';

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

function isNavigationRequest(request) {
    return request.mode === 'navigate';
}

function isStaticAssetRequest(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;

    return (
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.jpeg') ||
        url.pathname.endsWith('.webp') ||
        url.pathname.endsWith('.json') ||
        url.pathname.startsWith('/images/') ||
        url.pathname.startsWith('/css/') ||
        url.pathname.startsWith('/js/')
    );
}

function cacheResponse(request, response) {
    if (!response || !response.ok) return Promise.resolve();
    return caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
}

function networkFirst(request) {
    return fetch(request)
        .then((networkResponse) => {
            cacheResponse(request, networkResponse);
            return networkResponse;
        })
        .catch(() => {
            return caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return caches.match('./index.html');
            });
        });
}

function staleWhileRevalidate(request) {
    return caches.match(request).then((cachedResponse) => {
        const networkPromise = fetch(request)
            .then((networkResponse) => {
                cacheResponse(request, networkResponse);
                return networkResponse;
            })
            .catch(() => null);

        return cachedResponse || networkPromise;
    });
}

// Uses hybrid caching to balance freshness and responsiveness.
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    if (isNavigationRequest(event.request)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if (isStaticAssetRequest(event.request)) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
