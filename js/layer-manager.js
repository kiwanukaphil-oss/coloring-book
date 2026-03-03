/**
 * Layer Manager
 *
 * Responsible for: Creating and managing up to 5 independent user coloring layers,
 *   including dynamic canvas creation, z-index stacking, visibility/opacity, compositing,
 *   and resize/snapshot support.
 * NOT responsible for: Layer panel UI (LayerPanel), canvas coordinate conversion
 *   (CanvasManager), or undo tracking (UndoManager/CommandManager).
 *
 * Key functions:
 *   - initialize: Creates the first layer canvas and inserts it into the container
 *   - addLayer: Creates a new layer canvas (max 5)
 *   - deleteLayer: Removes a layer canvas and adjusts activeLayerIndex
 *   - setActiveLayer: Changes which layer brush/fill operations target
 *   - compositeAllLayers: Returns an offscreen canvas with all visible layers composited
 *   - resizeLayers: Resizes all layer canvases to new dimensions (called by CanvasManager)
 *   - snapshotAllLayers / restoreAllLayersFromSnapshots: Supports window-resize reflow
 *
 * Dependencies: None (foundational module — CanvasManager depends on this)
 *
 * Notes: Layer canvases are `position: absolute` in #canvas-container, z-index 2..6.
 *   Layer-0 is filled white on init; higher layers are transparent. See ADR-024.
 */

const LayerManager = (() => {
    const MAX_LAYERS = 5;

    // Each entry: { id, name, canvas, ctx, visible, opacity }
    let layers = [];
    let activeLayerIndex = 0;
    let container = null;
    let layerCounter = 0;

    // Base z-index for the first layer. Layers occupy z-index 2..6.
    // reference-canvas=1, outline-canvas=11, interaction-canvas=21, cursor-canvas=31
    const LAYER_BASE_Z_INDEX = 2;

    // Creates and inserts all initial layer state. Called by CanvasManager.initialize()
    // after it has computed the canvas dimensions and scaled the container.
    function initialize(canvasContainer, canvasWidth, canvasHeight, scaleFactor) {
        container = canvasContainer;
        layers = [];
        activeLayerIndex = 0;
        layerCounter = 0;

        const layer = createLayer(canvasWidth, canvasHeight, scaleFactor, LAYER_BASE_Z_INDEX);
        layers.push(layer);
        insertLayerCanvas(layer.canvas);

        // Layer-0 gets a white background; higher layers are transparent (ADR-024)
        fillLayerWhite(layer.ctx, canvasWidth, canvasHeight);
    }

    // Builds one layer entry: canvas + context + metadata. Each layer needs its own
    // absolutely-positioned canvas so it can participate in the z-index stack
    // (z-index 2–6 within #canvas-container, per ADR-024). ctx.scale(scaleFactor) is
    // applied once at creation so all drawing code uses logical CSS coordinates directly —
    // callers never need to compensate for device pixel ratio or dimension-capping at draw time.
    function createLayer(canvasWidth, canvasHeight, scaleFactor, zIndex) {
        layerCounter += 1;
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = String(zIndex);

        // CSS display dimensions match the container (set during CanvasManager resize).
        // scaleFactor already accounts for MAX_CANVAS_DIMENSION capping; devicePixelRatio alone would be wrong.
        const cssWidth = canvasWidth / scaleFactor;
        const cssHeight = canvasHeight / scaleFactor;
        canvas.style.width = cssWidth + 'px';
        canvas.style.height = cssHeight + 'px';

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.scale(scaleFactor, scaleFactor);

        return {
            id: 'layer-' + layerCounter,
            name: 'Layer ' + layerCounter,
            canvas,
            ctx,
            visible: true,
            opacity: 1
        };
    }

    // Inserts a layer canvas into the container just before outline-canvas
    // so it appears above reference-canvas but below the outline.
    function insertLayerCanvas(canvas) {
        const outlineCanvas = container.querySelector('#outline-canvas');
        if (outlineCanvas) {
            container.insertBefore(canvas, outlineCanvas);
        } else {
            container.appendChild(canvas);
        }
    }

    // Fills a layer canvas with solid white. Used only for layer-0
    // which serves as the paper background (ADR-024).
    // Raw save/setTransform/restore: LayerManager cannot call CanvasManager.withNativeTransform
    // without creating a circular dependency (ADR-007 exception, documented in ADR-007).
    function fillLayerWhite(ctx, width, height) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    // Adds a new transparent layer above the current top layer.
    // Returns the new layer's index, or false if the limit is reached.
    function addLayer() {
        if (layers.length >= MAX_LAYERS) return false;

        const existingCanvas = layers[0].canvas;
        const canvasWidth = existingCanvas.width;
        const canvasHeight = existingCanvas.height;
        const scaleFactor = canvasWidth / parseInt(existingCanvas.style.width);

        const newZIndex = LAYER_BASE_Z_INDEX + layers.length;
        const layer = createLayer(canvasWidth, canvasHeight, scaleFactor, newZIndex);
        layers.push(layer);
        insertLayerCanvas(layer.canvas);

        EventBus.emit('layer:added', { index: layers.length - 1 });
        return layers.length - 1;
    }

    // Removes the layer at the given index. Minimum 1 layer is enforced.
    // Removes the canvas element from the DOM and adjusts activeLayerIndex
    // if it pointed at or beyond the deleted layer.
    function deleteLayer(index) {
        if (layers.length <= 1) return;
        if (index < 0 || index >= layers.length) return;

        const layer = layers[index];
        container.removeChild(layer.canvas);
        layers.splice(index, 1);

        // Keep activeLayerIndex in bounds
        if (activeLayerIndex >= layers.length) {
            activeLayerIndex = layers.length - 1;
        }

        // Reassign z-indexes after deletion to close the gap
        layers.forEach((l, i) => {
            l.canvas.style.zIndex = String(LAYER_BASE_Z_INDEX + i);
        });

        EventBus.emit('layer:deleted', { index });
        EventBus.emit('layer:active-changed', { index: activeLayerIndex });
    }

    // Changes which layer subsequent brush/fill operations target.
    function setActiveLayer(index) {
        if (index < 0 || index >= layers.length) return;
        activeLayerIndex = index;
        EventBus.emit('layer:active-changed', { index: activeLayerIndex });
    }

    // Reorders a layer by moving it from fromIndex to toIndex.
    // Updates the z-index of all canvases to match the new order.
    function reorderLayer(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= layers.length) return;
        if (toIndex < 0 || toIndex >= layers.length) return;

        const [moved] = layers.splice(fromIndex, 1);
        layers.splice(toIndex, 0, moved);

        // Adjust activeLayerIndex to follow the moved layer if it was active
        if (activeLayerIndex === fromIndex) {
            activeLayerIndex = toIndex;
        } else if (activeLayerIndex > fromIndex && activeLayerIndex <= toIndex) {
            activeLayerIndex -= 1;
        } else if (activeLayerIndex < fromIndex && activeLayerIndex >= toIndex) {
            activeLayerIndex += 1;
        }

        // Update z-indexes to reflect new order
        layers.forEach((l, i) => {
            l.canvas.style.zIndex = String(LAYER_BASE_Z_INDEX + i);
        });

        EventBus.emit('layer:active-changed', { index: activeLayerIndex });
    }

    // Toggles a layer's CSS display. Hidden layers are excluded from compositing;
    // this controls whether they appear at all. Uses CSS class per ADR-003.
    function setLayerVisibility(index, visible) {
        if (index < 0 || index >= layers.length) return;
        layers[index].visible = visible;
        layers[index].canvas.classList.toggle('hidden', !visible);
        EventBus.emit('layer:visibility-changed', { index, visible });
    }

    // Sets a layer's CSS opacity (0.0–1.0). Affects both the live
    // canvas display and the compositeAllLayers() output.
    function setLayerOpacity(index, opacity) {
        if (index < 0 || index >= layers.length) return;
        const clamped = Math.max(0, Math.min(1, opacity));
        layers[index].opacity = clamped;
        layers[index].canvas.style.opacity = String(clamped);
        EventBus.emit('layer:opacity-changed', { index, opacity: clamped });
    }

    // Creates an offscreen canvas with all visible layers composited
    // bottom-to-top, respecting each layer's opacity. Used by
    // CanvasManager.renderCompositeForSave() and thumbnail generation. (ADR-024)
    function compositeAllLayers() {
        const offscreen = document.createElement('canvas');
        offscreen.width = layers[0].canvas.width;
        offscreen.height = layers[0].canvas.height;
        const ctx = offscreen.getContext('2d');

        layers.forEach((layer) => {
            if (layer.visible) {
                ctx.globalAlpha = layer.opacity;
                ctx.drawImage(layer.canvas, 0, 0);
            }
        });

        ctx.globalAlpha = 1;
        return offscreen;
    }

    // Resizes all layer canvases to the new pixel dimensions and applies the
    // new scale factor. Called by CanvasManager.resizeCanvasesToFitContainer()
    // after computing the new dimensions.
    function resizeLayers(canvasWidth, canvasHeight, scaleFactor) {
        const cssWidth = canvasWidth / scaleFactor;
        const cssHeight = canvasHeight / scaleFactor;

        layers.forEach((layer) => {
            layer.canvas.width = canvasWidth;
            layer.canvas.height = canvasHeight;
            layer.canvas.style.width = cssWidth + 'px';
            layer.canvas.style.height = cssHeight + 'px';
            layer.ctx.scale(scaleFactor, scaleFactor);
        });
    }

    // Clears the active layer and fills it white if it is layer-0,
    // or transparent otherwise. Called by CanvasManager.clearColoringCanvas().
    // Raw save/setTransform/restore: LayerManager cannot call CanvasManager.withNativeTransform
    // without creating a circular dependency (ADR-007 exception, documented in ADR-007).
    function clearActiveLayer() {
        const layer = layers[activeLayerIndex];
        layer.ctx.save();
        layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        if (activeLayerIndex === 0) {
            layer.ctx.fillStyle = '#ffffff';
            layer.ctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
        }
        layer.ctx.restore();
    }

    // Clears all layer canvases (layer-0 gets white fill, others transparent).
    // Called by CanvasManager.clearAllCanvases() on template load.
    // Raw save/setTransform/restore: LayerManager cannot call CanvasManager.withNativeTransform
    // without creating a circular dependency (ADR-007 exception, documented in ADR-007).
    function clearAllLayers() {
        layers.forEach((layer, i) => {
            layer.ctx.save();
            layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
            layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
            if (i === 0) {
                layer.ctx.fillStyle = '#ffffff';
                layer.ctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
            }
            layer.ctx.restore();
        });
    }

    // Captures all layer canvases into snapshot canvases for the window-resize
    // reflow cycle. Returns an array of canvas elements in layer order.
    function snapshotAllLayers() {
        return layers.map((layer) => {
            const snapshot = document.createElement('canvas');
            snapshot.width = layer.canvas.width;
            snapshot.height = layer.canvas.height;
            snapshot.getContext('2d').drawImage(layer.canvas, 0, 0);
            return snapshot;
        });
    }

    // Draws each snapshot back onto its corresponding layer canvas at the new
    // (post-resize) dimensions. Called by CanvasManager.handleWindowResize()
    // after resizeCanvasesToFitContainer() and resizeLayers() have run.
    // Raw save/setTransform/restore: LayerManager cannot call CanvasManager.withNativeTransform
    // without creating a circular dependency (ADR-007 exception, documented in ADR-007).
    function restoreAllLayersFromSnapshots(snapshots, newWidth, newHeight) {
        snapshots.forEach((snapshot, i) => {
            if (i >= layers.length) return;
            const layer = layers[i];
            layer.ctx.save();
            layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
            layer.ctx.clearRect(0, 0, newWidth, newHeight);
            layer.ctx.drawImage(
                snapshot,
                0, 0, snapshot.width, snapshot.height,
                0, 0, newWidth, newHeight
            );
            layer.ctx.restore();
        });
    }

    // Captures a layer's current canvas pixels and metadata into a
    // self-contained snapshot object for use by undo commands.
    // Returns null for an invalid index. The snapshot stores an
    // offscreen canvas (full pixel copy), name, visible, opacity,
    // and scaleFactor so insertLayer() can reconstruct the canvas
    // identically. (ADR-026)
    function getLayerSnapshot(index) {
        if (index < 0 || index >= layers.length) return null;
        const layer = layers[index];
        const snapshot = document.createElement('canvas');
        snapshot.width = layer.canvas.width;
        snapshot.height = layer.canvas.height;
        snapshot.getContext('2d').drawImage(layer.canvas, 0, 0);
        return {
            canvasData: snapshot,  // HTMLCanvasElement (not ImageData — named to avoid confusion)
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            scaleFactor: layer.canvas.width / parseInt(layer.canvas.style.width, 10)
        };
    }

    // Reconstructs a deleted layer from a snapshot and inserts it at
    // the given logical index. Called by the layer-delete undo command
    // (ADR-026). insertLayerCanvas() places the DOM element before
    // outline-canvas; z-indexes are then reassigned for all layers.
    // Raw save/setTransform/restore: LayerManager cannot call
    // CanvasManager.withNativeTransform without a circular dependency
    // (ADR-007 exception, documented in ADR-007).
    function insertLayer(index, snapshot) {
        if (index < 0 || index > layers.length) return;
        if (layers.length >= MAX_LAYERS) return;  // same limit as addLayer() (ADR-024)

        const layer = createLayer(
            snapshot.canvasData.width,
            snapshot.canvasData.height,
            snapshot.scaleFactor,
            LAYER_BASE_Z_INDEX  // z-index is reassigned by the forEach below
        );
        layer.name    = snapshot.name;
        layer.visible = snapshot.visible;
        layer.opacity = snapshot.opacity;

        // Restore pixel content from the snapshot canvas
        layer.ctx.save();
        layer.ctx.setTransform(1, 0, 0, 1, 0, 0);
        layer.ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.ctx.drawImage(snapshot.canvasData, 0, 0);
        layer.ctx.restore();

        // Apply visibility and opacity to the live DOM canvas
        layer.canvas.classList.toggle('hidden', !layer.visible);
        layer.canvas.style.opacity = String(layer.opacity);

        // Insert into the layers array and the DOM
        layers.splice(index, 0, layer);
        insertLayerCanvas(layer.canvas);

        // Reassign all z-indexes to close the insertion gap
        layers.forEach((l, i) => {
            l.canvas.style.zIndex = String(LAYER_BASE_Z_INDEX + i);
        });

        // Shift activeLayerIndex up if the insert displaced it
        if (activeLayerIndex >= index) {
            activeLayerIndex += 1;
        }

        EventBus.emit('layer:added', { index });
    }

    function getActiveLayerIndex() {
        return activeLayerIndex;
    }

    function getActiveLayerCanvas() {
        return layers[activeLayerIndex].canvas;
    }

    function getActiveLayerContext() {
        return layers[activeLayerIndex].ctx;
    }

    function getLayerAt(index) {
        return layers[index];
    }

    function getLayers() {
        return layers.slice();
    }

    function getLayerCount() {
        return layers.length;
    }

    return {
        initialize,
        addLayer,
        deleteLayer,
        setActiveLayer,
        reorderLayer,
        setLayerVisibility,
        setLayerOpacity,
        compositeAllLayers,
        resizeLayers,
        clearActiveLayer,
        clearAllLayers,
        snapshotAllLayers,
        restoreAllLayersFromSnapshots,
        getLayerSnapshot,
        insertLayer,
        getActiveLayerIndex,
        getActiveLayerCanvas,
        getActiveLayerContext,
        getLayerAt,
        getLayers,
        getLayerCount
    };
})();
