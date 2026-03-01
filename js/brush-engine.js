/**
 * Brush Engine
 *
 * Responsible for: Handling free-hand painting via Pointer Events, drawing smooth
 *   strokes onto the coloring canvas using coalesced events and round line caps.
 * NOT responsible for: Tool selection (Toolbar), color choice (ColorPalette),
 *   or managing undo history beyond triggering a snapshot at stroke start.
 *
 * Key functions:
 *   - handlePointerDown: Starts a stroke, saves undo snapshot, draws initial dot
 *   - handlePointerMove: Draws line segments using coalesced events for smoothness
 *   - handlePointerUp: Ends the stroke and releases pointer capture
 *   - setBrushSize / getBrushSize: Controls the stroke width
 *
 * Dependencies: CanvasManager, Toolbar, UndoManager, ColorPalette
 *
 * Notes: Uses pointer capture so strokes continue even if the finger/mouse leaves
 *   the canvas mid-stroke. Coalesced events (getCoalescedEvents API) provide
 *   sub-frame touch positions for smoother lines on mobile devices.
 */

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

        const coords = CanvasManager.getCanvasPixelCoords(event);
        lastX = coords.x;
        lastY = coords.y;

        // Draw a dot at the starting point for single taps
        CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
            ctx.fillStyle = ColorPalette.getCurrentColor();
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Processes pointer movement during a brush stroke. Uses
    // getCoalescedEvents() to capture all intermediate touch
    // positions between animation frames, producing smoother
    // lines on fast-moving finger strokes.
    function handlePointerMove(event) {
        if (!isDrawing || Toolbar.getActiveTool() !== 'brush') return;

        event.preventDefault();

        CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
            ctx.strokeStyle = ColorPalette.getCurrentColor();
            ctx.lineWidth = brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Use coalesced events for smoother strokes (when available)
            const coalescedEvents = event.getCoalescedEvents
                ? event.getCoalescedEvents()
                : [event];

            for (const coalescedEvent of coalescedEvents) {
                const coords = CanvasManager.getCanvasPixelCoords(coalescedEvent);
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
                lastX = coords.x;
                lastY = coords.y;
            }
        });
    }

    function handlePointerUp(event) {
        if (!isDrawing) return;
        event.target.releasePointerCapture?.(event.pointerId);
        isDrawing = false;
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
