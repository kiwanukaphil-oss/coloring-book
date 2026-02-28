/* ========================================
   Brush Engine
   Handles free-hand painting with Pointer
   Events. Uses coalesced events for smooth
   strokes on touch devices. Draws onto the
   coloring canvas with round line caps.
   ======================================== */

const BrushEngine = (() => {
    let isDrawing = false;
    let brushSize = 12;
    let lastX = 0;
    let lastY = 0;

    function initialize() {
        const interactionCanvas = CanvasManager.getInteractionCanvas();

        interactionCanvas.addEventListener('pointerdown', handlePointerDown);
        interactionCanvas.addEventListener('pointermove', handlePointerMove);
        interactionCanvas.addEventListener('pointerup', handlePointerUp);
        interactionCanvas.addEventListener('pointercancel', handlePointerUp);
        interactionCanvas.addEventListener('pointerleave', handlePointerUp);
    }

    function handlePointerDown(event) {
        if (Toolbar.getActiveTool() !== 'brush') return;

        event.preventDefault();
        event.target.setPointerCapture?.(event.pointerId);
        isDrawing = true;

        // Save undo snapshot at the start of each stroke
        UndoManager.saveSnapshot();

        const coords = getCanvasCoords(event);
        lastX = coords.x;
        lastY = coords.y;

        // Draw a dot at the starting point for single taps
        const ctx = CanvasManager.getColoringContext();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = ColorPalette.getCurrentColor();
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Processes pointer movement during a brush stroke. Uses
    // getCoalescedEvents() to capture all intermediate touch
    // positions between animation frames, producing smoother
    // lines on fast-moving finger strokes.
    function handlePointerMove(event) {
        if (!isDrawing || Toolbar.getActiveTool() !== 'brush') return;

        event.preventDefault();

        const ctx = CanvasManager.getColoringContext();
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = ColorPalette.getCurrentColor();
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Use coalesced events for smoother strokes (when available)
        const coalescedEvents = event.getCoalescedEvents
            ? event.getCoalescedEvents()
            : [event];

        for (const coalescedEvent of coalescedEvents) {
            const coords = getCanvasCoords(coalescedEvent);
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            lastX = coords.x;
            lastY = coords.y;
        }

        ctx.restore();
    }

    function handlePointerUp(event) {
        if (!isDrawing) return;
        event.target.releasePointerCapture?.(event.pointerId);
        isDrawing = false;
    }

    // Converts pointer event CSS coordinates to native canvas
    // pixel coordinates so drawing remains correct regardless
    // of the context's current transform.
    function getCanvasCoords(event) {
        const canvas = CanvasManager.getInteractionCanvas();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    function setBrushSize(size) {
        brushSize = size;
    }

    function getBrushSize() {
        return brushSize;
    }

    return {
        initialize,
        setBrushSize,
        getBrushSize
    };
})();
