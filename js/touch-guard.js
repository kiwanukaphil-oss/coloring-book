/* ========================================
   Touch Guard
   Prevents browser gestures (zoom, scroll,
   context menu) from interfering with the
   drawing experience on touch devices.
   ======================================== */

const TouchGuard = (() => {
    function initialize() {
        preventPinchZoom();
        preventContextMenu();
        preventDoubleTapZoom();
    }

    // Blocks pinch-to-zoom and pull-to-refresh by
    // intercepting multi-touch and non-passive touch events
    function preventPinchZoom() {
        document.addEventListener('touchmove', (event) => {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('gesturestart', (event) => {
            event.preventDefault();
        });

        document.addEventListener('gesturechange', (event) => {
            event.preventDefault();
        });
    }

    // Blocks the long-press context menu so it doesn't
    // pop up while the kid is coloring
    function preventContextMenu() {
        document.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    // Blocks double-tap zoom on iOS/Android by intercepting
    // rapid successive taps on the canvas area
    function preventDoubleTapZoom() {
        let lastTapTime = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTapTime < 300) {
                event.preventDefault();
            }
            lastTapTime = now;
        }, { passive: false });
    }

    return { initialize };
})();
