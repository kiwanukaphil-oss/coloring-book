/* ========================================
   Canvas Manager
   Creates and manages the 4-layer canvas
   system: coloring (bottom), reference (guide),
   outline, and interaction (top). Handles sizing,
   image loading, and composite rendering.
   ======================================== */

const CanvasManager = (() => {
    const MAX_CANVAS_DIMENSION = 2048;

    let container = null;
    let coloringCanvas = null;
    let referenceCanvas = null;
    let outlineCanvas = null;
    let interactionCanvas = null;
    let coloringCtx = null;
    let referenceCtx = null;
    let outlineCtx = null;
    let interactionCtx = null;

    // Stores the loaded image dimensions/offset so other
    // modules know where the coloring page sits on the canvas
    let imageRegion = { x: 0, y: 0, width: 0, height: 0 };

    function initialize() {
        container = document.getElementById('canvas-container');
        coloringCanvas = document.getElementById('coloring-canvas');
        referenceCanvas = document.getElementById('reference-canvas');
        outlineCanvas = document.getElementById('outline-canvas');
        interactionCanvas = document.getElementById('interaction-canvas');

        coloringCtx = coloringCanvas.getContext('2d', { willReadFrequently: true });
        referenceCtx = referenceCanvas.getContext('2d', { willReadFrequently: true });
        outlineCtx = outlineCanvas.getContext('2d', { willReadFrequently: true });
        interactionCtx = interactionCanvas.getContext('2d');

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

        [coloringCanvas, referenceCanvas, outlineCanvas, interactionCanvas].forEach((canvas) => {
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            canvas.style.width = containerWidth + 'px';
            canvas.style.height = containerHeight + 'px';
        });

        coloringCtx.scale(scaleFactor, scaleFactor);
        referenceCtx.scale(scaleFactor, scaleFactor);
        outlineCtx.scale(scaleFactor, scaleFactor);
        interactionCtx.scale(scaleFactor, scaleFactor);
    }

    function fillColoringCanvasWhite() {
        coloringCtx.save();
        coloringCtx.setTransform(1, 0, 0, 1, 0, 0);
        coloringCtx.fillStyle = '#ffffff';
        coloringCtx.fillRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        coloringCtx.restore();
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
        outlineCtx.save();
        outlineCtx.setTransform(1, 0, 0, 1, 0, 0);
        const imageData = outlineCtx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height);
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

        outlineCtx.putImageData(imageData, 0, 0);
        outlineCtx.restore();
    }

    function clearAllCanvases() {
        coloringCtx.save();
        coloringCtx.setTransform(1, 0, 0, 1, 0, 0);
        coloringCtx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        coloringCtx.restore();

        outlineCtx.save();
        outlineCtx.setTransform(1, 0, 0, 1, 0, 0);
        outlineCtx.clearRect(0, 0, outlineCanvas.width, outlineCanvas.height);
        outlineCtx.restore();

        interactionCtx.save();
        interactionCtx.setTransform(1, 0, 0, 1, 0, 0);
        interactionCtx.clearRect(0, 0, interactionCanvas.width, interactionCanvas.height);
        interactionCtx.restore();

        clearReferenceCanvas();
    }

    function clearColoringCanvas() {
        coloringCtx.save();
        coloringCtx.setTransform(1, 0, 0, 1, 0, 0);
        coloringCtx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
        coloringCtx.restore();
        fillColoringCanvasWhite();
    }

    function clearReferenceCanvas() {
        referenceCtx.save();
        referenceCtx.setTransform(1, 0, 0, 1, 0, 0);
        referenceCtx.clearRect(0, 0, referenceCanvas.width, referenceCanvas.height);
        referenceCtx.restore();
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
        // Store current canvas content before resizing
        const coloringData = coloringCtx.getImageData(0, 0, coloringCanvas.width, coloringCanvas.height);
        const referenceData = referenceCtx.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
        const outlineData = outlineCtx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height);

        resizeCanvasesToFitContainer();

        // Restore content after resize
        coloringCtx.save();
        coloringCtx.setTransform(1, 0, 0, 1, 0, 0);
        coloringCtx.putImageData(coloringData, 0, 0);
        coloringCtx.restore();

        referenceCtx.save();
        referenceCtx.setTransform(1, 0, 0, 1, 0, 0);
        referenceCtx.putImageData(referenceData, 0, 0);
        referenceCtx.restore();

        outlineCtx.save();
        outlineCtx.setTransform(1, 0, 0, 1, 0, 0);
        outlineCtx.putImageData(outlineData, 0, 0);
        outlineCtx.restore();
    }

    // Returns the pixel-ratio-aware scale factor used by the canvas,
    // needed by other modules to convert CSS coords to canvas coords
    function getScaleFactor() {
        return coloringCanvas.width / parseInt(coloringCanvas.style.width);
    }

    return {
        initialize,
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
        getImageRegion: () => imageRegion,
        getContainerElement: () => container
    };
})();
