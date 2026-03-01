/**
 * Canvas Manager
 *
 * Responsible for: Creating and managing the 4-layer canvas system (coloring, reference,
 *   outline, interaction), DPI-aware sizing, image loading, and composite rendering.
 * NOT responsible for: Drawing strokes (BrushEngine), flood fill logic (FloodFill),
 *   or undo state (UndoManager).
 *
 * Key functions:
 *   - withNativeTransform: Wraps canvas ops at native pixel resolution (ADR-007)
 *   - getCanvasPixelCoords: Converts CSS event coords to canvas pixel coords (ADR-002)
 *   - loadOutlineImage: Loads a coloring page onto the outline layer
 *   - loadReferenceImage: Loads a guide image onto the reference layer
 *   - resizeCanvasesToFitContainer: Recalculates canvas dimensions on viewport change
 *   - makeWhitePixelsTransparent: Removes white backgrounds from loaded outline images
 *   - renderCompositeForSave: Composites coloring + outline layers for PNG export
 *   - handleWindowResize: Snapshots and restores all layers when the viewport changes
 *   - computeOutlineMask: Builds binary Uint8Array mask for edge-aware brush (ADR-008)
 *   - getOutlineMask: Returns precomputed mask for O(1) outline pixel checks
 *
 * Dependencies: None (foundational module — all other modules depend on this)
 *
 * Notes: Canvas resolution is capped at MAX_CANVAS_DIMENSION (2048) to prevent
 *   performance issues on high-DPI tablets. All drawing must go through
 *   withNativeTransform to bypass the DPI scale factor applied via ctx.scale().
 */

const CanvasManager = (() => {
    const MAX_CANVAS_DIMENSION = 2048;

    let container = null;
    let coloringCanvas = null;
    let referenceCanvas = null;
    let outlineCanvas = null;
    let interactionCanvas = null;
    let cursorCanvas = null;
    let coloringCtx = null;
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

    // Grabs DOM elements and creates drawing contexts. Three of the four
    // contexts use willReadFrequently because flood fill and undo both
    // call getImageData extensively — this hint lets the browser optimize
    // for frequent pixel reads instead of GPU-accelerated rendering.
    function initialize() {
        container = document.getElementById('canvas-container');
        coloringCanvas = document.getElementById('coloring-canvas');
        referenceCanvas = document.getElementById('reference-canvas');
        outlineCanvas = document.getElementById('outline-canvas');
        interactionCanvas = document.getElementById('interaction-canvas');
        cursorCanvas = document.getElementById('cursor-canvas');

        coloringCtx = coloringCanvas.getContext('2d', { willReadFrequently: true });
        referenceCtx = referenceCanvas.getContext('2d', { willReadFrequently: true });
        outlineCtx = outlineCanvas.getContext('2d', { willReadFrequently: true });
        interactionCtx = interactionCanvas.getContext('2d');
        cursorCtx = cursorCanvas.getContext('2d');

        resizeCanvasesToFitContainer();
        fillColoringCanvasWhite();

        window.addEventListener('resize', handleWindowResize);
    }

    // Calculates the optimal canvas resolution based on the
    // container size and device pixel ratio, capped at
    // MAX_CANVAS_DIMENSION to prevent performance issues on
    // high-DPI tablets
    function resizeCanvasesToFitContainer() {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;

        const scaleFactor = Math.min(
            window.devicePixelRatio || 1,
            MAX_CANVAS_DIMENSION / Math.max(containerWidth, containerHeight)
        );

        const canvasWidth = Math.floor(containerWidth * scaleFactor);
        const canvasHeight = Math.floor(containerHeight * scaleFactor);

        [coloringCanvas, referenceCanvas, outlineCanvas, interactionCanvas, cursorCanvas].forEach((canvas) => {
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.width = containerWidth + 'px';
            canvas.style.height = containerHeight + 'px';
        });

        coloringCtx.scale(scaleFactor, scaleFactor);
        referenceCtx.scale(scaleFactor, scaleFactor);
        outlineCtx.scale(scaleFactor, scaleFactor);
        interactionCtx.scale(scaleFactor, scaleFactor);
        cursorCtx.scale(scaleFactor, scaleFactor);
    }

    function fillColoringCanvasWhite() {
        withNativeTransform(coloringCtx, (ctx) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        });
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
                clearAllCanvases();
                fillColoringCanvasWhite();

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
                computeOutlineMask();

                resolve(fitDimensions);
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

    function clearAllCanvases() {
        withNativeTransform(coloringCtx, (ctx) => {
            ctx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        });
        withNativeTransform(outlineCtx, (ctx) => {
            ctx.clearRect(0, 0, outlineCanvas.width, outlineCanvas.height);
        });
        withNativeTransform(interactionCtx, (ctx) => {
            ctx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
        });
        clearReferenceCanvas();
        outlineMask = null;
    }

    function clearColoringCanvas() {
        withNativeTransform(coloringCtx, (ctx) => {
            ctx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        });
        fillColoringCanvasWhite();
    }

    function clearReferenceCanvas() {
        withNativeTransform(referenceCtx, (ctx) => {
            ctx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);
        });
    }

    // Composites the coloring and outline layers onto an offscreen
    // canvas and returns a PNG data URL for saving/downloading
    function renderCompositeForSave() {
        const offscreen = document.createElement('canvas');
        offscreen.width = coloringCanvas.width;
        offscreen.height = coloringCanvas.height;
        const ctx = offscreen.getContext('2d');

        ctx.drawImage(coloringCanvas, 0, 0);
        ctx.drawImage(outlineCanvas, 0, 0);

        return offscreen.toDataURL('image/png');
    }

    function handleWindowResize() {
        // Snapshot layers before resizing so they can be
        // re-rendered proportionally at the new resolution.
        const coloringSnapshot = captureCanvasSnapshot(coloringCanvas);
        const referenceSnapshot = captureCanvasSnapshot(referenceCanvas);
        const outlineSnapshot = captureCanvasSnapshot(outlineCanvas);

        resizeCanvasesToFitContainer();

        restoreScaledSnapshot(coloringCtx, coloringCanvas, coloringSnapshot);
        restoreScaledSnapshot(referenceCtx, referenceCanvas, referenceSnapshot);
        restoreScaledSnapshot(outlineCtx, outlineCanvas, outlineSnapshot);

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

    // Returns the pixel-ratio-aware scale factor used by the canvas,
    // needed by other modules to convert CSS coords to canvas coords
    function getScaleFactor() {
        return coloringCanvas.width / parseInt(coloringCanvas.style.width);
    }

    return {
        initialize,
        withNativeTransform,
        getCanvasPixelCoords,
        loadOutlineImage,
        loadReferenceImage,
        clearColoringCanvas,
        clearReferenceCanvas,
        clearAllCanvases,
        renderCompositeForSave,
        getScaleFactor,
        getColoringCanvas: () => coloringCanvas,
        getColoringContext: () => coloringCtx,
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
