/**
 * Undo Manager
 *
 * Responsible for: Providing a backward-compatible facade over CommandManager,
 *   capturing canvas state as ImageData commands for instant synchronous undo/redo.
 * NOT responsible for: Deciding when to snapshot — callers (BrushEngine, FloodFill,
 *   Toolbar) trigger saveSnapshot at the appropriate moment.
 *
 * Key functions:
 *   - saveSnapshot: Captures full-canvas "before" state; finalized on next call
 *   - saveSnapshotForRegion: Captures full-canvas "before" for later bbox crop (ADR-017)
 *   - finalizeWithRegion: Crops pending state to bbox, creates region command (ADR-017)
 *   - undoLastAction: Delegates to CommandManager.undoCommand()
 *   - redoLastAction: Delegates to CommandManager.redoCommand()
 *   - clearHistory: Delegates to CommandManager.clearCommands()
 *   - hasUndoSteps / hasRedoSteps: Delegates to CommandManager depth checks
 *
 * Dependencies: CanvasManager, CommandManager
 *
 * Notes: The facade preserves the existing public API so all characterisation
 *   tests pass without modification. Region-aware methods (ADR-017) enable
 *   bounding-box undo — callers capture a full-canvas "before" at action start,
 *   then finalize with the computed bbox at action end, storing only the affected
 *   region. See ADR-011 and ADR-017 for specifications.
 */

const UndoManager = (() => {
    // Holds the "before" ImageData captured by the most recent
    // saveSnapshot() call. When saveSnapshot() is called again,
    // the pending state is compared against the current canvas to
    // create a complete before/after command.
    let pendingBeforeState = null;

    // When true, the pending state was captured via saveSnapshotForRegion()
    // and should be finalized with finalizeWithRegion(bbox) instead of
    // the standard full-canvas finalization.
    let isRegionPending = false;

    // The LayerManager layer index at the time the pending snapshot was captured.
    // Stored so the command targets the correct layer even if the user switches
    // layers between saveSnapshot() and the next finalization. (ADR-024)
    let pendingLayerIndex = 0;

    // Captures the current canvas state as the "before" for the
    // next undoable action. When called again, finalizes the
    // previous capture by creating a command with the before state
    // and the current canvas as the after state. This two-phase
    // approach matches the existing API contract: callers call
    // saveSnapshot() before modifying the canvas.
    function saveSnapshot() {
        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();

        // A new action always invalidates redo history
        CommandManager.clearRedoStack();

        // Finalize the previous pending snapshot as a full-canvas command
        if (pendingBeforeState !== null && !isRegionPending) {
            const afterImageData = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(0, 0, canvas.width, canvas.height);
            });
            const command = CommandManager.createCanvasCommand(
                'snapshot',
                pendingBeforeState,
                afterImageData,
                pendingLayerIndex
            );
            CommandManager.pushCommand(command);
        }

        // Capture the current active layer index and state as the new "before"
        pendingLayerIndex = LayerManager.getActiveLayerIndex();
        pendingBeforeState = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(0, 0, canvas.width, canvas.height);
        });
        isRegionPending = false;
    }

    // Captures the current full-canvas state as the "before" for a
    // region-aware action. The caller must later call finalizeWithRegion(bbox)
    // to crop both before and after states to the bounding box and create
    // a region command. (ADR-017: deferred-crop approach)
    function saveSnapshotForRegion() {
        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();

        // A new action always invalidates redo history
        CommandManager.clearRedoStack();

        // Capture the current active layer index and state as the new "before"
        pendingLayerIndex = LayerManager.getActiveLayerIndex();
        pendingBeforeState = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(0, 0, canvas.width, canvas.height);
        });
        isRegionPending = true;
    }

    // Finalizes a region-pending snapshot by cropping both the
    // "before" and current canvas to the given bounding box.
    // Creates a region command with only the affected pixels.
    // The bbox must be clamped to canvas bounds by the caller.
    // (ADR-017)
    function finalizeWithRegion(bbox) {
        if (pendingBeforeState === null || !isRegionPending) return;

        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();

        // Clamp bbox to canvas bounds
        const x = Math.max(0, Math.floor(bbox.x));
        const y = Math.max(0, Math.floor(bbox.y));
        const right = Math.min(canvas.width, Math.ceil(bbox.x + bbox.width));
        const bottom = Math.min(canvas.height, Math.ceil(bbox.y + bbox.height));
        const width = right - x;
        const height = bottom - y;

        if (width <= 0 || height <= 0) {
            pendingBeforeState = null;
            isRegionPending = false;
            return;
        }

        // Crop the full-canvas "before" to the bbox region
        // by creating a temporary canvas and extracting the region
        const beforeRegion = cropImageDataToRegion(
            pendingBeforeState, canvas.width, x, y, width, height
        );

        // Get the current canvas "after" state for just the bbox region
        const afterRegion = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(x, y, width, height);
        });

        const clampedBbox = { x: x, y: y, width: width, height: height };
        const command = CommandManager.createRegionCommand(
            'region-snapshot',
            clampedBbox,
            beforeRegion,
            afterRegion,
            pendingLayerIndex
        );
        CommandManager.pushCommand(command);

        pendingBeforeState = null;
        isRegionPending = false;
    }

    // Extracts a rectangular region from a full-canvas ImageData
    // by copying pixel rows. Avoids creating a temporary canvas.
    function cropImageDataToRegion(fullImageData, fullWidth, regionX, regionY, regionWidth, regionHeight) {
        const cropped = new ImageData(regionWidth, regionHeight);
        const srcData = fullImageData.data;
        const dstData = cropped.data;

        for (let row = 0; row < regionHeight; row++) {
            const srcOffset = ((regionY + row) * fullWidth + regionX) * 4;
            const dstOffset = row * regionWidth * 4;
            // Copy one row of pixels
            for (let i = 0; i < regionWidth * 4; i++) {
                dstData[dstOffset + i] = srcData[srcOffset + i];
            }
        }
        return cropped;
    }

    // Restores the canvas to its previous state by delegating
    // to CommandManager. If there's a pending before-state that
    // hasn't been finalized yet, finalize it first so the current
    // canvas modifications can be undone. Returns a resolved
    // Promise for backward compatibility with the async API.
    function undoLastAction() {
        finalizePendingIfNeeded();
        const result = CommandManager.undoCommand();
        return Promise.resolve(result);
    }

    // Re-applies the most recently undone action by delegating
    // to CommandManager. Returns a resolved Promise for backward
    // compatibility with the async API.
    function redoLastAction() {
        const result = CommandManager.redoCommand();
        return Promise.resolve(result);
    }

    // If there's a pending before-state, compares it against
    // the current canvas and pushes a command. This ensures
    // the latest drawing action is undoable even if saveSnapshot()
    // hasn't been called again yet (e.g., right before undo).
    function finalizePendingIfNeeded() {
        if (pendingBeforeState === null) return;

        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();

        if (isRegionPending) {
            // Region-pending state without a finalize call means
            // we don't have a bbox — fall back to full-canvas command
            isRegionPending = false;
        }

        const afterImageData = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(0, 0, canvas.width, canvas.height);
        });

        const command = CommandManager.createCanvasCommand(
            'snapshot',
            pendingBeforeState,
            afterImageData,
            pendingLayerIndex
        );
        CommandManager.pushCommand(command);
        pendingBeforeState = null;
        pendingLayerIndex = 0;
    }

    function clearHistory() {
        pendingBeforeState = null;
        isRegionPending = false;
        pendingLayerIndex = 0;
        CommandManager.clearCommands();
    }

    function hasUndoSteps() {
        return CommandManager.getUndoDepth() > 0 || pendingBeforeState !== null;
    }

    function hasRedoSteps() {
        return CommandManager.getRedoDepth() > 0;
    }

    return {
        saveSnapshot,
        saveSnapshotForRegion,
        finalizeWithRegion,
        undoLastAction,
        redoLastAction,
        clearHistory,
        hasUndoSteps,
        hasRedoSteps
    };
})();
