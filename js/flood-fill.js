/**
 * Flood Fill
 *
 * Responsible for: Filling enclosed regions on the coloring canvas using an iterative
 *   scanline stack-based algorithm that respects outline boundaries.
 * NOT responsible for: Detecting tap vs drag gestures (Toolbar), choosing the fill color
 *   (ColorPalette), or converting CSS coords to canvas coords (CanvasManager).
 *
 * Key functions:
 *   - initialize: Creates fill worker for off-main-thread processing (ADR-021)
 *   - executeFloodFillAtPoint: Entry point — routes to worker or main thread fallback
 *
 * Dependencies: CanvasManager, UndoManager, FeedbackManager,
 *   workers/fill-algorithm.js (loaded via <script> tag — provides scanlineFill,
 *   matchesTargetColor, isOutlinePixel, FILL_TOLERANCE, and threshold constants)
 *
 * Notes: The fill algorithm (scanlineFill and helpers) lives in workers/fill-algorithm.js,
 *   the single source of truth shared by this module and the fill worker. Undo snapshot
 *   uses region-aware commands (ADR-017) to store only the filled bounding box.
 *   When a Web Worker is available, fills run off the main thread to eliminate
 *   frame drops on mid-range tablets (ADR-021). Classic mode (?classic=1) uses
 *   synchronous main-thread fills for test compatibility.
 */

const FloodFill = (() => {
    // FILL_TOLERANCE, OUTLINE_LUMINANCE_THRESHOLD, OUTLINE_ALPHA_THRESHOLD,
    // scanlineFill, matchesTargetColor, and isOutlinePixel are defined in
    // workers/fill-algorithm.js and available as globals (loaded via <script>). (ADR-021)
    const SPINNER_DELAY_MS = 100;

    // Worker state (ADR-021)
    let fillWorker = null;
    let isWorkerReady = false;
    let isFillInProgress = false;
    let pendingFillRequest = null;
    let activeFillContext = null;

    // Creates the fill worker for off-main-thread processing.
    // Skipped in ?classic=1 mode so existing tests use the
    // synchronous fallback path. Falls back to main-thread
    // permanently if Worker creation fails. (ADR-021)
    function initialize() {
        const isClassicMode = new URLSearchParams(window.location.search).has('classic');
        if (isClassicMode) return;

        try {
            fillWorker = new Worker('./workers/fill-worker.js');
            fillWorker.onmessage = handleWorkerMessage;
            fillWorker.onerror = handleWorkerError;
        } catch (error) {
            console.warn('Fill worker not available, using main-thread fallback:', error);
            fillWorker = null;
        }
    }

    // Handles messages from the fill worker (ADR-021).
    // The worker sends either a 'ready' signal on load or
    // a fill result with modified pixels, count, and bbox.
    function handleWorkerMessage(event) {
        if (event.data.type === 'ready') {
            isWorkerReady = true;
            return;
        }

        const ctx = activeFillContext;

        // Clear spinner timer and hide spinner
        if (ctx && ctx.spinnerTimer) {
            clearTimeout(ctx.spinnerTimer);
        }
        FeedbackManager.hideLoadingSpinner();

        const { coloringPixels: modifiedBuffer, filledPixelCount, bbox } = event.data;

        if (filledPixelCount > 0 && ctx) {
            const coloringCanvas = CanvasManager.getColoringCanvas();

            // Discard result if canvas resized during worker processing
            if (coloringCanvas.width === ctx.canvasWidth && coloringCanvas.height === ctx.canvasHeight) {
                UndoManager.saveSnapshotForRegion();

                const modifiedPixels = new Uint8ClampedArray(modifiedBuffer);
                const resultImageData = new ImageData(modifiedPixels, ctx.canvasWidth, ctx.canvasHeight);

                CanvasManager.withNativeTransform(ctx.coloringCtx, (c) => {
                    c.putImageData(resultImageData, 0, 0);
                });

                UndoManager.finalizeWithRegion(bbox);
                ProgressManager.scheduleAutoSave();
                EventBus.emit('fill:complete', { x: ctx.startX, y: ctx.startY });
            }
        }

        activeFillContext = null;
        isFillInProgress = false;
        processPendingFillRequest();
    }

    // Disables the worker permanently on error and falls
    // back to main-thread execution (ADR-021, ADR-001).
    function handleWorkerError(error) {
        console.warn('Fill worker error, falling back to main thread:', error);
        fillWorker = null;
        isWorkerReady = false;

        if (activeFillContext && activeFillContext.spinnerTimer) {
            clearTimeout(activeFillContext.spinnerTimer);
        }
        FeedbackManager.hideLoadingSpinner();

        activeFillContext = null;
        isFillInProgress = false;
        processPendingFillRequest();
    }

    // Executes the next queued fill request after the current
    // one completes. Only the most recent request is kept
    // (intermediate taps are dropped). (ADR-021)
    function processPendingFillRequest() {
        if (pendingFillRequest) {
            const req = pendingFillRequest;
            pendingFillRequest = null;
            executeFloodFillAtPoint(req.canvasX, req.canvasY, req.fillColorHex);
        }
    }

    // Executes a flood fill starting from the given canvas pixel
    // coordinates. Routes to the worker path when available, or
    // falls back to synchronous main-thread processing. If a fill
    // is already in progress, queues this request (latest wins,
    // intermediate requests are dropped). (ADR-021)
    function executeFloodFillAtPoint(canvasX, canvasY, fillColorHex) {
        if (isFillInProgress) {
            pendingFillRequest = { canvasX, canvasY, fillColorHex };
            return;
        }

        if (fillWorker && isWorkerReady) {
            executeFloodFillViaWorker(canvasX, canvasY, fillColorHex);
        } else {
            executeFloodFillMainThread(canvasX, canvasY, fillColorHex);
        }
    }

    // Synchronous main-thread fill path. Used as fallback when
    // workers are unavailable and in ?classic=1 mode for test
    // compatibility. (ADR-021)
    function executeFloodFillMainThread(canvasX, canvasY, fillColorHex) {
        const startX = Math.floor(canvasX);
        const startY = Math.floor(canvasY);

        const coloringCanvas = CanvasManager.getColoringCanvas();
        const coloringCtx = CanvasManager.getColoringContext();
        const outlineCtx = CanvasManager.getOutlineContext();

        const width = coloringCanvas.width;
        const height = coloringCanvas.height;

        if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
            return;
        }

        // Read pixel data from both canvases at native resolution
        const coloringImageData = CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });

        const outlineImageData = CanvasManager.withNativeTransform(outlineCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });

        const coloringPixels = coloringImageData.data;
        const outlinePixels = outlineImageData.data;

        const fillColor = hexToRgba(fillColorHex);
        const startIndex = (startY * width + startX) * 4;

        // Read the target color at the tap position
        const targetR = coloringPixels[startIndex];
        const targetG = coloringPixels[startIndex + 1];
        const targetB = coloringPixels[startIndex + 2];
        const targetA = coloringPixels[startIndex + 3];

        // Don't fill if tapping on an outline pixel
        if (isOutlinePixel(outlinePixels, startIndex)) {
            return;
        }

        // Don't fill if already the same color
        if (
            Math.abs(targetR - fillColor.r) <= 1 &&
            Math.abs(targetG - fillColor.g) <= 1 &&
            Math.abs(targetB - fillColor.b) <= 1
        ) {
            return;
        }

        const fillResult = scanlineFill(
            coloringPixels, outlinePixels, width, height,
            startX, startY,
            targetR, targetG, targetB, targetA,
            fillColor.r, fillColor.g, fillColor.b
        );

        if (fillResult.filledPixelCount === 0) {
            return;
        }

        // Save region-aware undo snapshot before writing pixels (ADR-017).
        // Canvas content is still unchanged at this point — saveSnapshotForRegion
        // captures the full canvas as "before", and we finalize with the fill bbox.
        UndoManager.saveSnapshotForRegion();

        // Write the modified pixel data back to the canvas
        CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
            ctx.putImageData(coloringImageData, 0, 0);
        });

        // Finalize region command with the fill bounding box (ADR-017)
        UndoManager.finalizeWithRegion(fillResult.bbox);

        ProgressManager.scheduleAutoSave();
        EventBus.emit('fill:complete', { x: startX, y: startY });
    }

    // Async worker fill path — transfers pixel buffers to the
    // fill worker for off-main-thread processing. Pre-checks
    // (bounds, outline pixel, same color) run on the main thread
    // to avoid unnecessary worker dispatch. Shows a spinner after
    // 100ms for long fills. (ADR-021)
    function executeFloodFillViaWorker(canvasX, canvasY, fillColorHex) {
        const startX = Math.floor(canvasX);
        const startY = Math.floor(canvasY);

        const coloringCanvas = CanvasManager.getColoringCanvas();
        const coloringCtx = CanvasManager.getColoringContext();
        const outlineCtx = CanvasManager.getOutlineContext();

        const canvasWidth = coloringCanvas.width;
        const canvasHeight = coloringCanvas.height;

        if (startX < 0 || startX >= canvasWidth || startY < 0 || startY >= canvasHeight) {
            return;
        }

        // Read pixel data from both canvases at native resolution
        const coloringImageData = CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
            return ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        });

        const outlineImageData = CanvasManager.withNativeTransform(outlineCtx, (ctx) => {
            return ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        });

        const coloringPixels = coloringImageData.data;
        const outlinePixels = outlineImageData.data;

        const fillColor = hexToRgba(fillColorHex);
        const startIndex = (startY * canvasWidth + startX) * 4;

        const targetR = coloringPixels[startIndex];
        const targetG = coloringPixels[startIndex + 1];
        const targetB = coloringPixels[startIndex + 2];
        const targetA = coloringPixels[startIndex + 3];

        // Pre-checks on main thread to avoid unnecessary worker dispatch
        if (isOutlinePixel(outlinePixels, startIndex)) {
            return;
        }

        if (
            Math.abs(targetR - fillColor.r) <= 1 &&
            Math.abs(targetG - fillColor.g) <= 1 &&
            Math.abs(targetB - fillColor.b) <= 1
        ) {
            return;
        }

        isFillInProgress = true;

        // Show spinner after delay for long fills (ADR-021)
        const spinnerTimer = setTimeout(() => {
            FeedbackManager.showLoadingSpinner();
        }, SPINNER_DELAY_MS);

        activeFillContext = {
            coloringCtx,
            canvasWidth,
            canvasHeight,
            startX,
            startY,
            spinnerTimer
        };

        // Transfer pixel buffers to worker (zero-copy via Transferable)
        fillWorker.postMessage({
            coloringPixels: coloringPixels.buffer,
            outlinePixels: outlinePixels.buffer,
            width: canvasWidth,
            height: canvasHeight,
            startX,
            startY,
            targetR,
            targetG,
            targetB,
            targetA,
            fillR: fillColor.r,
            fillG: fillColor.g,
            fillB: fillColor.b
        }, [coloringPixels.buffer, outlinePixels.buffer]);
    }

    function hexToRgba(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
            a: 255
        };
    }

    return {
        initialize,
        executeFloodFillAtPoint
    };
})();
