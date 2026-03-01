/**
 * Service Worker
 *
 * Responsible for: Providing offline support via hybrid caching — network-first for
 *   HTML/navigation, stale-while-revalidate for static assets (JS, CSS, images).
 * NOT responsible for: Application logic — this runs in a separate thread and only
 *   intercepts network requests.
 *
 * Key functions:
 *   - networkFirst: Tries network, falls back to cache (used for navigation)
 *   - staleWhileRevalidate: Serves cache immediately, refreshes in background
 *   - isNavigationRequest: Identifies page navigation requests
 *   - isStaticAssetRequest: Identifies cacheable static asset requests
 *   - cacheResponse: Stores a response clone in the versioned cache
 *
 * Dependencies: None (runs independently in the service worker thread)
 *
 * Notes: CACHE_VERSION must be bumped when assets change to trigger cache refresh.
 *   The activate handler deletes old cache versions automatically. Navigation
 *   requests fall back to index.html for SPA-style routing support.
 */

const CACHE_VERSION = 'coloring-book-v9';

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
    './js/feedback-manager.js',
    './js/storage-manager.js',
    './js/progress-manager.js',
    './images/icons/icon-192.svg',
    './images/icons/icon-512.svg',
    './images/coloring-pages/cat.svg',
    './images/coloring-pages/dog.svg',
    './images/coloring-pages/butterfly.svg',
    './images/coloring-pages/fish.svg',
    './images/coloring-pages/rocket.svg',
    './images/coloring-pages/flower.svg',
    './images/coloring-pages/unicorn.svg',
    './images/coloring-pages/car.svg',
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

// Identifies same-origin GET requests for files that change infrequently
// and benefit from stale-while-revalidate. Checks both file extensions
// and known asset directories to catch all static resources.
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

// Tries the network first so navigation always gets the latest HTML.
// On failure (offline), falls back to the cached version. If no cached
// version exists at all, serves index.html as a last resort so the
// app shell still loads.
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

// Returns the cached version immediately for fast rendering, while
// fetching a fresh copy in the background to update the cache for
// next time. If nothing is cached yet, waits for the network response.
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
