/**
 * App Initialization
 *
 * Responsible for: Bootstrapping all modules in dependency order and registering
 *   the service worker for PWA offline support.
 * NOT responsible for: Any runtime application logic — each module manages its own
 *   behavior after initialization.
 *
 * Key functions:
 *   - initializeColoringBookApp: IIFE that calls initialize() on all modules in order
 *   - registerServiceWorker: Registers the service worker (logs warning on failure)
 *   - showGalleryOnFirstLoad: Opens the gallery modal so the user picks a page
 *
 * Dependencies: TouchGuard, CanvasManager, ColorPalette, BrushEngine, ImageLoader,
 *   Toolbar (all modules)
 *
 * Notes: Module initialization order matters — CanvasManager must come before any
 *   module that reads canvas elements, and Toolbar must come last because it wires
 *   up event handlers that reference all other modules.
 */

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
