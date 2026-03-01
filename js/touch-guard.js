/**
 * Touch Guard
 *
 * Responsible for: Preventing browser gestures (zoom, scroll, context menu) from
 *   interfering with the drawing experience on touch devices.
 * NOT responsible for: Handling drawing input — that is managed by BrushEngine and Toolbar.
 *
 * Key functions:
 *   - preventPinchZoom: Blocks multi-touch zoom and pull-to-refresh
 *   - preventContextMenu: Blocks long-press context menu
 *   - preventDoubleTapZoom: Blocks rapid double-tap zoom on mobile
 *
 * Dependencies: None (standalone, runs before all other modules)
 *
 * Notes: All listeners are scoped to #canvas-container so browser gestures
 *   are only blocked over the drawing surface. Gallery modals, toolbar, and
 *   other UI retain normal touch/scroll/accessibility behavior.
 *   Uses non-passive event listeners where preventDefault is needed.
 *   Safari requires gesturestart/gesturechange listeners in addition to touchmove.
 */

const TouchGuard = (() => {
    function initialize() {
        const target = document.getElementById('canvas-container');
        preventPinchZoom(target);
        preventContextMenu(target);
        preventDoubleTapZoom(target);
    }

    // Blocks pinch-to-zoom and pull-to-refresh by
    // intercepting multi-touch and non-passive touch events
    function preventPinchZoom(target) {
        target.addEventListener('touchmove', (event) => {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false });

        target.addEventListener('gesturestart', (event) => {
            event.preventDefault();
        });

        target.addEventListener('gesturechange', (event) => {
            event.preventDefault();
        });
    }

    // Blocks the long-press context menu so it doesn't
    // pop up while the kid is coloring
    function preventContextMenu(target) {
        target.addEventListener('contextmenu', (event) => {
            event.preventDefault();
        });
    }

    // Blocks double-tap zoom on iOS/Android by intercepting
    // rapid successive taps on the canvas area
    function preventDoubleTapZoom(target) {
        let lastTapTime = 0;
        target.addEventListener('touchend', (event) => {
            const now = Date.now();
            if (now - lastTapTime < 300) {
                event.preventDefault();
            }
            lastTapTime = now;
        }, { passive: false });
    }

    return { initialize };
})();
