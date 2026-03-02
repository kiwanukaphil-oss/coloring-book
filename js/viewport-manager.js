/**
 * Viewport Manager (ADR-009)
 *
 * Responsible for: Zoom and pan of the canvas container via CSS transforms.
 *   Handles Ctrl+scroll zoom (desktop), pinch zoom (touch), spacebar+drag pan,
 *   two-finger pan, and keyboard zoom shortcuts.
 * NOT responsible for: Drawing or canvas pixel operations — those use
 *   CanvasManager.getCanvasPixelCoords() which reads getBoundingClientRect()
 *   and therefore works at any zoom level automatically.
 *
 * Key functions:
 *   - zoomAtPoint: Zooms around a pivot point, keeping it fixed on screen
 *   - resetView: Returns to scale=1, offset=0,0
 *   - getScale / getOffset: Getters for current viewport state
 *   - handleWheelZoom: Ctrl+scroll zoom with cursor pivot
 *   - handlePinchGesture: Two-finger pinch zoom and pan for touch devices
 *
 * Dependencies: EventBus, CanvasManager (for container element)
 *
 * Notes: Uses CSS transform on #canvas-container with transform-origin: 0 0.
 *   This approach keeps all canvas pixel math unchanged because
 *   getBoundingClientRect() reflects the scaled/translated position.
 *   Zoom range is 0.5x to 5x. Default state is scale=1, offset=0,0.
 */

const ViewportManager = (() => {
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 5;
    const ZOOM_STEP_WHEEL = 0.05;
    const ZOOM_STEP_KEY = 0.25;

    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let container = null;

    // Spacebar+drag pan state
    let isSpaceHeld = false;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let panStartOffsetX = 0;
    let panStartOffsetY = 0;

    // Pinch gesture state
    let initialPinchDistance = 0;
    let initialPinchScale = 1;
    let initialPinchMidX = 0;
    let initialPinchMidY = 0;
    let isPinching = false;

    function initialize() {
        container = CanvasManager.getContainerElement();
        container.style.transformOrigin = '0 0';

        setupWheelZoom();
        setupKeyboardZoom();
        setupSpacebarPan();
        setupTouchPanAndZoom();
        updateZoomPillDisplay();
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // Applies the current scale and offset as a CSS transform
    function applyTransform() {
        container.style.transform =
            'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';
    }

    // Zooms to newScale while keeping the point at (pivotX, pivotY)
    // fixed on screen. pivotX/pivotY are relative to the container's
    // parent origin (the untransformed coordinate space).
    function zoomAtPoint(newScale, pivotX, pivotY) {
        newScale = clamp(newScale, MIN_SCALE, MAX_SCALE);
        if (newScale === scale) return;

        const scaleFactor = newScale / scale;
        offsetX = pivotX - (pivotX - offsetX) * scaleFactor;
        offsetY = pivotY - (pivotY - offsetY) * scaleFactor;
        scale = newScale;

        applyTransform();
        updateZoomPillDisplay();
        EventBus.emit('viewport:zoomed', { scale });
    }

    // Zooms centered on the container (no pivot shift)
    function zoomCentered(newScale) {
        const parentRect = container.parentElement.getBoundingClientRect();
        const centerX = parentRect.width / 2;
        const centerY = parentRect.height / 2;
        zoomAtPoint(newScale, centerX, centerY);
    }

    function resetView() {
        scale = 1;
        offsetX = 0;
        offsetY = 0;
        applyTransform();
        updateZoomPillDisplay();
        EventBus.emit('viewport:reset');
    }

    // Updates the zoom pill percentage display in studio mode
    function updateZoomPillDisplay() {
        const zoomValue = document.getElementById('zoom-value');
        if (zoomValue) {
            zoomValue.textContent = Math.round(scale * 100) + '%';
        }
    }

    // --- Desktop: Ctrl+scroll zoom ---
    function setupWheelZoom() {
        container.addEventListener('wheel', function handleWheelZoom(event) {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();

            const parentRect = container.parentElement.getBoundingClientRect();
            const pivotX = event.clientX - parentRect.left;
            const pivotY = event.clientY - parentRect.top;

            const direction = event.deltaY > 0 ? -1 : 1;
            const newScale = scale + direction * ZOOM_STEP_WHEEL * scale;
            zoomAtPoint(newScale, pivotX, pivotY);
        }, { passive: false });
    }

    // --- Keyboard: Ctrl+=/-/0 zoom ---
    function setupKeyboardZoom() {
        document.addEventListener('keydown', function handleKeyboardZoom(event) {
            if (!event.ctrlKey && !event.metaKey) return;

            const key = event.key;
            if (key === '=' || key === '+') {
                event.preventDefault();
                zoomCentered(scale + ZOOM_STEP_KEY);
            } else if (key === '-') {
                event.preventDefault();
                zoomCentered(scale - ZOOM_STEP_KEY);
            } else if (key === '0') {
                event.preventDefault();
                resetView();
            }
        });
    }

    // --- Desktop: Spacebar+drag pan ---
    // Holding spacebar enables pan mode; mouse drag moves the canvas.
    function setupSpacebarPan() {
        document.addEventListener('keydown', function handleSpaceDown(event) {
            if (event.key === ' ' && !event.repeat && event.target === document.body) {
                event.preventDefault();
                isSpaceHeld = true;
                container.style.cursor = 'grab';
            }
        });

        document.addEventListener('keyup', function handleSpaceUp(event) {
            if (event.key === ' ') {
                isSpaceHeld = false;
                isPanning = false;
                container.style.cursor = '';
            }
        });

        container.addEventListener('pointerdown', function handlePanStart(event) {
            if (!isSpaceHeld) return;
            event.preventDefault();
            event.stopPropagation();
            isPanning = true;
            panStartX = event.clientX;
            panStartY = event.clientY;
            panStartOffsetX = offsetX;
            panStartOffsetY = offsetY;
            container.style.cursor = 'grabbing';
            container.setPointerCapture(event.pointerId);
        });

        container.addEventListener('pointermove', function handlePanMove(event) {
            if (!isPanning) return;
            event.preventDefault();
            offsetX = panStartOffsetX + (event.clientX - panStartX);
            offsetY = panStartOffsetY + (event.clientY - panStartY);
            applyTransform();
            EventBus.emit('viewport:panned', { offsetX, offsetY });
        });

        container.addEventListener('pointerup', function handlePanEnd(event) {
            if (!isPanning) return;
            isPanning = false;
            container.releasePointerCapture(event.pointerId);
            container.style.cursor = isSpaceHeld ? 'grab' : '';
        });
    }

    // --- Touch: Pinch zoom and two-finger pan ---
    // Called by TouchGuard when multi-touch is detected on the canvas.
    function setupTouchPanAndZoom() {
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: false });
        container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    }

    function handleTouchStart(event) {
        if (event.touches.length !== 2) return;
        event.preventDefault();

        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        initialPinchDistance = getTouchDistance(touch1, touch2);
        initialPinchScale = scale;

        const parentRect = container.parentElement.getBoundingClientRect();
        initialPinchMidX = (touch1.clientX + touch2.clientX) / 2 - parentRect.left;
        initialPinchMidY = (touch1.clientY + touch2.clientY) / 2 - parentRect.top;
        isPinching = true;
    }

    function handleTouchMove(event) {
        if (!isPinching || event.touches.length !== 2) return;
        event.preventDefault();

        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        const currentDistance = getTouchDistance(touch1, touch2);
        const pinchRatio = currentDistance / initialPinchDistance;
        const newScale = clamp(initialPinchScale * pinchRatio, MIN_SCALE, MAX_SCALE);

        zoomAtPoint(newScale, initialPinchMidX, initialPinchMidY);
    }

    function handleTouchEnd(event) {
        if (event.touches.length < 2) {
            isPinching = false;
        }
    }

    function getTouchDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // Returns whether the spacebar pan gesture is currently active,
    // so BrushEngine/Toolbar can skip drawing during pan
    function isPanActive() {
        return isPanning || isSpaceHeld;
    }

    function getScale() { return scale; }
    function getOffsetX() { return offsetX; }
    function getOffsetY() { return offsetY; }

    return {
        initialize,
        resetView,
        zoomAtPoint,
        zoomCentered,
        isPanActive,
        getScale,
        getOffsetX,
        getOffsetY
    };
})();
