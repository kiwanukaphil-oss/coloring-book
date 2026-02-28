/* ========================================
   App Initialization
   Entry point that bootstraps all modules
   in the correct order and registers the
   service worker for PWA offline support.
   ======================================== */

(function initializeColoringBookApp() {
    // Initialize modules in dependency order:
    // 1. Touch guards first (prevent browser gesture interference)
    // 2. Canvas system (everything else depends on this)
    // 3. Undo manager (needs canvas)
    // 4. Color palette (standalone UI)
    // 5. Brush engine (needs canvas + color palette + toolbar)
    // 6. Image loader (needs canvas + undo manager)
    // 7. Toolbar last (wires up all other modules)
    TouchGuard.initialize();
    CanvasManager.initialize();
    // UndoManager has no init — it's ready to use immediately
    ColorPalette.initialize();
    BrushEngine.initialize();
    ImageLoader.initialize();
    Toolbar.initialize();

    registerServiceWorker();
    showGalleryOnFirstLoad();
})();

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('./service-worker.js')
            .then(() => {
                console.log('Service worker registered');
            })
            .catch((error) => {
                console.warn('Service worker registration failed:', error);
            });
    }
}

// Opens the image gallery automatically on first load
// so the kid can pick a coloring page right away
function showGalleryOnFirstLoad() {
    ImageLoader.showGallery();
}
