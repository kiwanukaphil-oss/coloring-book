/**
 * Canvas Manager
 *
 * Responsible for: Creating and managing the canvas system (reference, outline,
 *   interaction, cursor layers + user coloring layers via LayerManager), DPI-aware sizing,
 *   image loading, and composite rendering.
 * NOT responsible for: Drawing strokes (BrushEngine), flood fill logic (FloodFill),
 *   undo state (UndoManager), or coloring layer creation (LayerManager).
 *
 * Key functions:
 *   - withNativeTransform: Wraps canvas ops at native pixel resolution (ADR-007)
 *   - getCanvasPixelCoords: Converts CSS event coords to canvas pixel coords (ADR-002)
 *   - loadOutlineImage: Loads a coloring page onto the outline layer
 *   - loadReferenceImage: Loads a guide image onto the reference layer
 *   - resizeCanvasesToFitContainer: Recalculates canvas dimensions on viewport change
 *   - makeWhitePixelsTransparent: Removes white backgrounds from loaded outline images
 *   - renderCompositeForSave: Composites all coloring layers + outline for PNG export
 *   - handleWindowResize: Snapshots and restores all layers when the viewport changes
 *   - computeOutlineMask: Builds binary Uint8Array mask for edge-aware brush (ADR-008)
 *   - computeOutlineMaskAsync: Worker-accelerated mask computation (ADR-021)
 *   - getOutlineMask: Returns precomputed mask for O(1) outline pixel checks
 *   - getPixelColorAt: Reads a single pixel from the active coloring layer, returns hex (ADR-018)
 *
 * Dependencies: LayerManager (initialized inside initialize(); coloring layers are managed there)
 *
 * Notes: Canvas resolution is capped at MAX_CANVAS_DIMENSION (2048) to prevent
 *   performance issues on high-DPI tablets. All drawing must go through
 *   withNativeTransform to bypass the DPI scale factor applied via ctx.scale().
 *   getColoringCanvas() and getColoringContext() proxy to LayerManager's active layer
 *   so all callers automatically target the user's currently selected layer. (ADR-024)
 */

const CanvasManager = (() => {
    const MAX_CANVAS_DIMENSION = 2048;

    let container = null;
    // coloringCanvas and coloringCtx are removed — proxied via LayerManager (ADR-024)
    let referenceCanvas = null;
    let outlineCanvas = null;
    let interactionCanvas = null;
    let cursorCanvas = null;
    let referenceCtx = null;
    let outlineCtx = null;
    let interactionCtx = null;
    let cursorCtx = null;

    // Stores the loaded image dimensions/offset so other
    // modules know where the coloring page sits on the canvas
    let imageRegion = { x: 0, y: 0, width: 0, height: 0 };

    // Binary mask where 1 = outline pixel, 0 = non-outline.
    // Precomputed on template load for O(1) per-pixel lookups
    // by the brush engine (ADR-008).
    let outlineMask = null;

    // Mask worker state (ADR-021)
    let maskWorker = null;
    let isMaskWorkerReady = false;

    // Wraps canvas operations that need to work at native pixel
    // resolution by saving the context, resetting its transform,
    // running the callback, then restoring. Returns whatever the
    // callback returns so callers can retrieve getImageData etc.
    function withNativeTransform(ctx, callback) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const result = callback(ctx);
        ctx.restore();
        return result;
    }

    // Converts a pointer event's CSS coordinates to native canvas
    // pixel coordinates, accounting for the DPI scale factor.
    // All modules should use this instead of computing the
    // conversion themselves.
    function getCanvasPixelCoords(event) {
        const rect = interactionCanvas.getBoundingClientRect();
        const scaleX = interactionCanvas.width / rect.width;
        const scaleY = interactionCanvas.height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY
        };
    }

    // Grabs DOM elements and creates drawing contexts. Coloring layers are created
    // dynamically by LayerManager (ADR-024). The remaining contexts use
    // willReadFrequently where getImageData is called frequently.
    function initialize() {
        container = document.getElementById('canvas-container');
        referenceCanvas = document.getElementById('reference-canvas');
        outlineCanvas = document.getElementById('outline-canvas');
        interactionCanvas = document.getElementById('interaction-canvas');
        cursorCanvas = document.getElementById('cursor-canvas');

        referenceCtx = referenceCanvas.getContext('2d', { willReadFrequently: true });
        outlineCtx = outlineCanvas.getContext('2d', { willReadFrequently: true });
        interactionCtx = interactionCanvas.getContext('2d');
        cursorCtx = cursorCanvas.getContext('2d');

        const { canvasWidth, canvasHeight, scaleFactor } = resizeCanvasesToFitContainer();

        // Initialize LayerManager with computed canvas dimensions (ADR-024).
        // LayerManager creates layer-0 and fills it white.
        LayerManager.initialize(container, canvasWidth, canvasHeight, scaleFactor);

        initializeMaskWorker();

        window.addEventListener('resize', handleWindowResize);
    }

    // Creates the mask worker for off-main-thread outline mask
    // computation. Skipped in ?classic=1 mode for test
    // compatibility. Falls back to sync permanently if Worker
    // creation fails. (ADR-021)
    function initializeMaskWorker() {
        const isClassicMode = new URLSearchParams(window.location.search).has('classic');
        if (isClassicMode) return;

        try {
            maskWorker = new Worker('./workers/mask-worker.js');
            maskWorker.onmessage = handleMaskWorkerMessage;
            maskWorker.onerror = handleMaskWorkerError;
        } catch (error) {
            console.warn('Mask worker not available, using sync fallback:', error);
            maskWorker = null;
        }
    }

    // Handles messages from the mask worker (ADR-021)
    function handleMaskWorkerMessage(event) {
        if (event.data.type === 'ready') {
            isMaskWorkerReady = true;
            return;
        }

        // Store mask from worker result
        const maskBuffer = event.data.mask;
        outlineMask = new Uint8Array(maskBuffer);

        // Resolve any pending async mask computation
        if (pendingMaskResolve) {
            pendingMaskResolve();
            pendingMaskResolve = null;
        }
    }

    // Disables the mask worker permanently on error (ADR-021, ADR-001)
    function handleMaskWorkerError(error) {
        console.warn('Mask worker error, falling back to sync:', error);
        maskWorker = null;
        isMaskWorkerReady = false;

        // If there's a pending async request, fall back to sync
        if (pendingMaskResolve) {
            computeOutlineMask();
            pendingMaskResolve();
            pendingMaskResolve = null;
        }
    }

    // Resolve callback for async mask computation (ADR-021)
    let pendingMaskResolve = null;

    // Calculates the optimal canvas resolution based on the container size and
    // device pixel ratio, capped at MAX_CANVAS_DIMENSION. Resizes the four
    // static canvases (reference, outline, interaction, cursor) and delegates
    // coloring layer resizing to LayerManager. Returns the computed dimensions
    // and scaleFactor so initialize() can pass them to LayerManager.
    function resizeCanvasesToFitContainer() {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        const scaleFactor = Math.min(
            window.devicePixelRatio || 1,
            MAX_CANVAS_DIMENSION / Math.max(containerWidth, containerHeight)
        );

        const canvasWidth = Math.floor(containerWidth * scaleFactor);
        const canvasHeight = Math.floor(containerHeight * scaleFactor);

        [referenceCanvas, outlineCanvas, interactionCanvas, cursorCanvas].forEach((canvas) => {
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.width = containerWidth + 'px';
            canvas.style.height = containerHeight + 'px';
        });

        referenceCtx.scale(scaleFactor, scaleFactor);
        outlineCtx.scale(scaleFactor, scaleFactor);
        interactionCtx.scale(scaleFactor, scaleFactor);
        cursorCtx.scale(scaleFactor, scaleFactor);

        // Resize coloring layers if LayerManager is already initialized
        // (not on the very first call from initialize(), where LayerManager
        // is initialized separately right after this call).
        if (LayerManager.getLayerCount() > 0) {
            LayerManager.resizeLayers(canvasWidth, canvasHeight, scaleFactor);
        }

        return { canvasWidth, canvasHeight, scaleFactor };
    }

    // Loads a coloring page image onto the outline canvas,
    // centered and scaled to fit while maintaining aspect ratio.
    // Clears both canvases before drawing so previous work
    // doesn't bleed through.
    function loadOutlineImage(imageSrc) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';

            image.onload = () => {
                // clearAllCanvases() already fills layer-0 white via LayerManager.clearAllLayers() (ADR-024)
                clearAllCanvases();

                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;

                const fitDimensions = calculateContainFit(
                    image.width, image.height,
                    containerWidth, containerHeight
                );

                imageRegion = fitDimensions;

                outlineCtx.drawImage(
                    image,
                    fitDimensions.x, fitDimensions.y,
                    fitDimensions.width, fitDimensions.height
                );

                makeWhitePixelsTransparent();

                // Use async mask computation when worker is available,
                // sync fallback otherwise (ADR-021)
                computeOutlineMaskAsync().then(() => {
                    resolve(fitDimensions);
                });
            };

            image.onerror = () => {
                reject(new Error('Failed to load image: ' + imageSrc));
            };

            image.src = imageSrc;
        });
    }

    // Loads a reference image on its own layer. Unlike outline
    // loading, this does not clear coloring/outline content.
    function loadReferenceImage(imageSrc) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';

            image.onload = () => {
                clearReferenceCanvas();

                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;

                const fitDimensions = calculateContainFit(
                    image.width, image.height,
                    containerWidth, containerHeight
                );

                referenceCtx.drawImage(
                    image,
                    fitDimensions.x, fitDimensions.y,
                    fitDimensions.width, fitDimensions.height
                );

                resolve(fitDimensions);
            };

            image.onerror = () => {
                reject(new Error('Failed to load reference image: ' + imageSrc));
            };

            image.src = imageSrc;
        });
    }

    // Calculates position and size to fit an image inside a
    // container while preserving its aspect ratio ("contain" mode),
    // centering it horizontally and vertically
    function calculateContainFit(imgWidth, imgHeight, boxWidth, boxHeight) {
        const imgRatio = imgWidth / imgHeight;
        const boxRatio = boxWidth / boxHeight;

        let drawWidth, drawHeight;

        if (imgRatio > boxRatio) {
            drawWidth = boxWidth;
            drawHeight = boxWidth / imgRatio;
        } else {
            drawHeight = boxHeight;
            drawWidth = boxHeight * imgRatio;
        }

        return {
            x: (boxWidth - drawWidth) / 2,
            y: (boxHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
        };
    }

    // Processes the outline canvas after an image is loaded:
    // makes white and near-white pixels fully transparent so
    // the coloring canvas below shows through. Only dark outline
    // pixels remain visible. This handles images/SVGs that have
    // solid white backgrounds.
    function makeWhitePixelsTransparent() {
        withNativeTransform(outlineCtx, (ctx) => {
            const imageData = ctx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height);
            const pixels = imageData.data;

            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

                if (luminance > 200) {
                    // Light pixel — make fully transparent
                    pixels[i + 3] = 0;
                } else if (luminance > 80) {
                    // Anti-aliased fringe — partial transparency for smooth edges
                    pixels[i + 3] = Math.floor(255 * (1 - (luminance - 80) / 120));
                }
                // Dark pixels (luminance <= 80) stay fully opaque
            }

            ctx.putImageData(imageData, 0, 0);
        });
    }

    // Builds a binary lookup mask from the outline canvas so
    // the brush engine can check "is this pixel an outline?"
    // in O(1) without calling getImageData per stroke. Uses
    // the same luminance/alpha thresholds as flood-fill.js
    // isOutlinePixel() for consistency. (ADR-008)
    function computeOutlineMask() {
        const width = outlineCanvas.width;
        const height = outlineCanvas.height;
        const imageData = withNativeTransform(outlineCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });
        const pixels = imageData.data;
        outlineMask = new Uint8Array(width * height);

        for (let i = 0; i < outlineMask.length; i++) {
            const idx = i * 4;
            const a = pixels[idx + 3];
            if (a < 128) continue;
            const luminance = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            if (luminance < 80) {
                outlineMask[i] = 1;
            }
        }
    }

    // Worker-accelerated mask computation. Returns a Promise that
    // resolves when the mask is ready. Falls back to synchronous
    // computation when the mask worker is unavailable. Used by
    // loadOutlineImage for async template loading. (ADR-021)
    function computeOutlineMaskAsync() {
        if (!maskWorker || !isMaskWorkerReady) {
            computeOutlineMask();
            return Promise.resolve();
        }

        const width = outlineCanvas.width;
        const height = outlineCanvas.height;
        const imageData = withNativeTransform(outlineCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });

        return new Promise((resolve) => {
            pendingMaskResolve = resolve;

            // Transfer outline pixel buffer to worker (zero-copy)
            maskWorker.postMessage({
                outlinePixels: imageData.data.buffer,
                width: width,
                height: height,
                luminanceThreshold: 80,
                alphaThreshold: 128
            }, [imageData.data.buffer]);
        });
    }

    function clearAllCanvases() {
        // Clear all coloring layers (layer-0 gets white fill, others transparent)
        LayerManager.clearAllLayers();
        withNativeTransform(outlineCtx, (ctx) => {
            ctx.clearRect(0, 0, outlineCanvas.width, outlineCanvas.height);
        });
        withNativeTransform(interactionCtx, (ctx) => {
            ctx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
        });
        clearReferenceCanvas();
        outlineMask = null;
    }

    // Clears only the active coloring layer. Kept for internal use
    // where a single-layer clear is appropriate (e.g. image load).
    function clearColoringCanvas() {
        LayerManager.clearActiveLayer();
    }

    // Clears every coloring layer (layer-0 to white, others transparent).
    // Used by the Clear button for a non-undoable fresh start. (ADR-024, ADR-026)
    // Intentionally does NOT clear the outline, interaction, or reference canvases —
    // the user's coloring page template must remain visible. Use clearAllCanvases()
    // only when loading a new template (which reloads the outline itself).
    function clearAllColoringCanvases() {
        LayerManager.clearAllLayers();
    }

    function clearReferenceCanvas() {
        withNativeTransform(referenceCtx, (ctx) => {
            ctx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);
        });
    }

    // Composites all visible coloring layers and the outline layer onto an
    // offscreen canvas and returns a PNG data URL for saving/downloading. (ADR-024)
    function renderCompositeForSave() {
        const composite = LayerManager.compositeAllLayers();
        const offscreen = document.createElement('canvas');
        offscreen.width = composite.width;
        offscreen.height = composite.height;
        const ctx = offscreen.getContext('2d');

        ctx.drawImage(composite, 0, 0);
        ctx.drawImage(outlineCanvas, 0, 0);

        return offscreen.toDataURL('image/png');
    }

    function handleWindowResize() {
        // Snapshot all layers before resizing so they can be
        // re-rendered proportionally at the new resolution.
        const layerSnapshots = LayerManager.snapshotAllLayers();
        const referenceSnapshot = captureCanvasSnapshot(referenceCanvas);
        const outlineSnapshot = captureCanvasSnapshot(outlineCanvas);

        const { canvasWidth, canvasHeight } = resizeCanvasesToFitContainer();

        restoreScaledSnapshot(referenceCtx, referenceCanvas, referenceSnapshot);
        restoreScaledSnapshot(outlineCtx, outlineCanvas, outlineSnapshot);
        LayerManager.restoreAllLayersFromSnapshots(layerSnapshots, canvasWidth, canvasHeight);

        // Recompute mask from rescaled outline pixels (ADR-008)
        if (outlineMask) {
            computeOutlineMask();
        }
    }

    function captureCanvasSnapshot(sourceCanvas) {
        const snapshot = document.createElement('canvas');
        snapshot.width = sourceCanvas.width;
        snapshot.height = sourceCanvas.height;

        const snapshotCtx = snapshot.getContext('2d');
        snapshotCtx.drawImage(sourceCanvas, 0, 0);

        return snapshot;
    }

    function restoreScaledSnapshot(targetCtx, targetCanvas, snapshotCanvas) {
        withNativeTransform(targetCtx, (ctx) => {
            ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
            ctx.drawImage(
                snapshotCanvas,
                0, 0, snapshotCanvas.width, snapshotCanvas.height,
                0, 0, targetCanvas.width, targetCanvas.height
            );
        });
    }

    // Reads the color of a single pixel on the active coloring layer at
    // native canvas coordinates. Returns a hex string (#RRGGBB) or
    // null if the pixel is fully transparent. Used by the eyedropper
    // tool (ADR-018). Coordinates must already be in canvas pixel
    // space (via getCanvasPixelCoords per ADR-002).
    function getPixelColorAt(canvasX, canvasY) {
        const activeCanvas = LayerManager.getActiveLayerCanvas();
        const activeCtx = LayerManager.getActiveLayerContext();
        const x = Math.floor(canvasX);
        const y = Math.floor(canvasY);

        if (x < 0 || x >= activeCanvas.width || y < 0 || y >= activeCanvas.height) {
            return null;
        }

        const pixel = withNativeTransform(activeCtx, (ctx) => {
            return ctx.getImageData(x, y, 1, 1).data;
        });

        if (pixel[3] === 0) return null;

        const hex = '#' +
            ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
                .toString(16).slice(1).toUpperCase();
        return hex;
    }

    // Returns the pixel-ratio-aware scale factor used by the canvas,
    // needed by other modules to convert CSS coords to canvas coords
    function getScaleFactor() {
        const activeCanvas = LayerManager.getActiveLayerCanvas();
        return activeCanvas.width / parseInt(activeCanvas.style.width);
    }

    return {
        initialize,
        withNativeTransform,
        getCanvasPixelCoords,
        getPixelColorAt,
        loadOutlineImage,
        loadReferenceImage,
        clearColoringCanvas,
        clearAllColoringCanvases,
        clearReferenceCanvas,
        clearAllCanvases,
        renderCompositeForSave,
        getScaleFactor,
        // Proxy to LayerManager's active layer (ADR-024)
        getColoringCanvas: () => LayerManager.getActiveLayerCanvas(),
        getColoringContext: () => LayerManager.getActiveLayerContext(),
        getReferenceCanvas: () => referenceCanvas,
        getReferenceContext: () => referenceCtx,
        getOutlineCanvas: () => outlineCanvas,
        getOutlineContext: () => outlineCtx,
        getInteractionCanvas: () => interactionCanvas,
        getInteractionContext: () => interactionCtx,
        getCursorCanvas: () => cursorCanvas,
        getCursorContext: () => cursorCtx,
        getOutlineMask: () => outlineMask,
        getImageRegion: () => imageRegion,
        getContainerElement: () => container
    };
})();
