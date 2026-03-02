/**
 * Brush Engine
 *
 * Responsible for: Handling free-hand painting via Pointer Events, drawing smooth
 *   strokes onto the coloring canvas using coalesced events and round line caps.
 *   Also handles eraser strokes (identical to brush but hardcoded to white).
 * NOT responsible for: Tool selection (Toolbar), color choice (ColorPalette),
 *   or managing undo history beyond triggering a snapshot at stroke start.
 *
 * Key functions:
 *   - handlePointerDown: Starts a stroke, saves undo snapshot, draws initial dot
 *   - handlePointerMove: Draws line segments using coalesced events for smoothness
 *   - handlePointerUp: Ends the stroke and releases pointer capture
 *   - getStrokeColor: Returns the eraser color (white) or the palette color
 *   - restoreOutlinePixels: Resets outline pixels to white after each draw (ADR-008)
 *   - updateCursorPreview: Draws a semi-transparent circle on the cursor canvas
 *   - clearCursorPreview: Clears the cursor canvas when pointer leaves
 *   - setBrushSize / getBrushSize: Controls the stroke width
 *
 * Dependencies: CanvasManager, Toolbar, UndoManager, ColorPalette
 *
 * Notes: Uses pointer capture so strokes continue even if the finger/mouse leaves
 *   the canvas mid-stroke. Coalesced events (getCoalescedEvents API) provide
 *   sub-frame touch positions for smoother lines on mobile devices.
 */

const BrushEngine = (() => {
    const ERASER_COLOR = '#FFFFFF';

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

        // Cursor preview follows the pointer whenever the brush tool is active
        interactionCanvas.addEventListener('pointermove', updateCursorPreview);
        interactionCanvas.addEventListener('pointerleave', clearCursorPreview);
    }

    // Returns true when the active tool uses stroke-based drawing
    // (brush or eraser). Both share the same pointer handling.
    function isStrokeTool() {
        const tool = Toolbar.getActiveTool();
        return tool === 'brush' || tool === 'eraser';
    }

    // Returns white for the eraser, or the palette color for
    // the brush. Centralizes the color decision so both
    // handlePointerDown and handlePointerMove stay DRY.
    function getStrokeColor() {
        return Toolbar.getActiveTool() === 'eraser'
            ? ERASER_COLOR
            : ColorPalette.getCurrentColor();
    }

    // Returns the brush size scaled to native canvas pixel
    // resolution. The slider value is in CSS pixels, but
    // withNativeTransform draws at identity transform, so
    // we multiply by the DPI scale factor to keep the visual
    // stroke size matching the slider value on high-DPI screens.
    function getScaledBrushSize() {
        return brushSize * CanvasManager.getScaleFactor();
    }

    function handlePointerDown(event) {
        if (!isStrokeTool()) return;
        // Skip brush strokes during spacebar pan (ADR-009)
        if (typeof ViewportManager !== 'undefined' && ViewportManager.isPanActive()) return;

        event.preventDefault();
        event.target.setPointerCapture?.(event.pointerId);
        isDrawing = true;

        // Save undo snapshot at the start of each stroke
        UndoManager.saveSnapshot();

        const coords = CanvasManager.getCanvasPixelCoords(event);
        lastX = coords.x;
        lastY = coords.y;

        const scaledSize = getScaledBrushSize();

        // Draw a dot at the starting point for single taps
        CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
            ctx.fillStyle = getStrokeColor();
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, scaledSize / 2, 0, Math.PI * 2);
            ctx.fill();

            // Restore outline pixels that the dot may have covered (ADR-008)
            const halfBrush = scaledSize / 2 + 2;
            restoreOutlinePixels(ctx,
                coords.x - halfBrush, coords.y - halfBrush,
                scaledSize + 4, scaledSize + 4
            );
        });
    }

    // Processes pointer movement during a brush stroke. Uses
    // getCoalescedEvents() to capture all intermediate touch
    // positions between animation frames, producing smoother
    // lines on fast-moving finger strokes.
    function handlePointerMove(event) {
        if (!isDrawing || !isStrokeTool()) return;

        event.preventDefault();

        const scaledSize = getScaledBrushSize();

        CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
            ctx.strokeStyle = getStrokeColor();
            ctx.lineWidth = scaledSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Use coalesced events for smoother strokes (when available)
            const coalescedEvents = event.getCoalescedEvents
                ? event.getCoalescedEvents()
                : [event];

            // Track bounding box across all coalesced segments
            // for a single outline-pixel restoration pass (ADR-008)
            let minX = lastX;
            let minY = lastY;
            let maxX = lastX;
            let maxY = lastY;

            for (const coalescedEvent of coalescedEvents) {
                const coords = CanvasManager.getCanvasPixelCoords(coalescedEvent);
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();

                minX = Math.min(minX, coords.x);
                minY = Math.min(minY, coords.y);
                maxX = Math.max(maxX, coords.x);
                maxY = Math.max(maxY, coords.y);

                lastX = coords.x;
                lastY = coords.y;
            }

            // Restore outline pixels in the affected bounding box (ADR-008)
            const halfBrush = scaledSize / 2 + 2;
            restoreOutlinePixels(ctx,
                minX - halfBrush, minY - halfBrush,
                (maxX - minX) + scaledSize + 4,
                (maxY - minY) + scaledSize + 4
            );
        });
    }

    // After drawing a brush segment, resets any pixels that
    // overlap with outline boundaries back to white. This keeps
    // paint "inside the lines." Only operates on the small
    // bounding box of the affected stroke segment for performance.
    // Skips entirely when no outline mask is loaded. (ADR-008)
    function restoreOutlinePixels(ctx, regionX, regionY, regionWidth, regionHeight) {
        const mask = CanvasManager.getOutlineMask();
        if (!mask) return;

        const canvasWidth = CanvasManager.getColoringCanvas().width;
        const canvasHeight = CanvasManager.getColoringCanvas().height;

        // Clamp to canvas bounds
        const x0 = Math.max(0, Math.floor(regionX));
        const y0 = Math.max(0, Math.floor(regionY));
        const x1 = Math.min(canvasWidth, Math.ceil(regionX + regionWidth));
        const y1 = Math.min(canvasHeight, Math.ceil(regionY + regionHeight));
        const w = x1 - x0;
        const h = y1 - y0;
        if (w <= 0 || h <= 0) return;

        const imageData = ctx.getImageData(x0, y0, w, h);
        const pixels = imageData.data;
        let hasOutlineOverlap = false;

        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const maskIndex = (y0 + row) * canvasWidth + (x0 + col);
                if (mask[maskIndex] === 1) {
                    const pixelIndex = (row * w + col) * 4;
                    // Restore outline pixels to white so the outline
                    // layer (z-3) renders cleanly on top
                    pixels[pixelIndex] = 255;
                    pixels[pixelIndex + 1] = 255;
                    pixels[pixelIndex + 2] = 255;
                    pixels[pixelIndex + 3] = 255;
                    hasOutlineOverlap = true;
                }
            }
        }

        if (hasOutlineOverlap) {
            ctx.putImageData(imageData, x0, y0);
        }
    }

    // Draws a semi-transparent circle on the cursor canvas showing
    // the brush size and color at the current pointer position.
    // Hides the default CSS cursor when active. Only runs when the
    // brush tool is selected. Skips during active drawing to avoid
    // visual clutter during fast strokes.
    // Shows a circular cursor preview for brush and eraser tools.
    // The eraser shows a gray outline (since white on white canvas
    // would be invisible), while the brush shows the selected color.
    function updateCursorPreview(event) {
        const interactionCanvas = CanvasManager.getInteractionCanvas();

        if (!isStrokeTool()) {
            interactionCanvas.classList.remove('brush-active');
            clearCursorPreview();
            return;
        }

        interactionCanvas.classList.add('brush-active');

        const cursorCanvas = CanvasManager.getCursorCanvas();
        const cursorCtx = CanvasManager.getCursorContext();
        const coords = CanvasManager.getCanvasPixelCoords(event);
        const isEraser = Toolbar.getActiveTool() === 'eraser';

        const scaledSize = getScaledBrushSize();

        CanvasManager.withNativeTransform(cursorCtx, (ctx) => {
            ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, scaledSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = isEraser ? '#999999' : ColorPalette.getCurrentColor();
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
        });
    }

    function clearCursorPreview() {
        const cursorCanvas = CanvasManager.getCursorCanvas();
        if (!cursorCanvas) return;
        const cursorCtx = CanvasManager.getCursorContext();
        CanvasManager.withNativeTransform(cursorCtx, (ctx) => {
            ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        });
    }

    function handlePointerUp(event) {
        if (!isDrawing) return;
        event.target.releasePointerCapture?.(event.pointerId);
        isDrawing = false;
        ProgressManager.scheduleAutoSave();
        EventBus.emit('stroke:complete');
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
