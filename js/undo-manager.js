/**
 * Undo Manager
 *
 * Responsible for: Storing compressed snapshots of the coloring canvas as PNG data URLs
 *   and restoring them on undo/redo, supporting up to 10 undo steps.
 * NOT responsible for: Deciding when to snapshot — callers (BrushEngine, FloodFill,
 *   Toolbar) trigger saveSnapshot at the appropriate moment.
 *
 * Key functions:
 *   - saveSnapshot: Captures current coloring canvas state as a PNG data URL
 *   - undoLastAction: Restores the most recent snapshot onto the canvas
 *   - redoLastAction: Re-applies the most recently undone action
 *   - clearHistory: Discards all undo and redo snapshots
 *   - hasUndoSteps / hasRedoSteps: Returns whether steps are available
 *
 * Dependencies: CanvasManager
 *
 * Notes: Snapshots are stored as PNG data URLs rather than raw ImageData to reduce
 *   memory usage (~10x smaller). The trade-off is a small decode cost on undo/redo.
 *   Any new drawing action (saveSnapshot) clears the redo stack, matching standard
 *   undo/redo behavior in all editors. A processing lock prevents concurrent
 *   undo/redo operations from corrupting state.
 */

const UndoManager = (() => {
    const MAX_UNDO_STEPS = 10;
    let snapshotStack = [];
    let redoStack = [];
    let isProcessing = false;

    // Captures the current state of the coloring canvas
    // as a compressed PNG data URL and pushes it onto the
    // undo stack. Drops the oldest snapshot if the stack
    // exceeds MAX_UNDO_STEPS. Clears the redo stack since
    // a new action invalidates any undone history.
    function saveSnapshot() {
        const canvas = CanvasManager.getColoringCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        snapshotStack.push(dataUrl);

        if (snapshotStack.length > MAX_UNDO_STEPS) {
            snapshotStack.shift();
        }

        redoStack = [];
    }

    // Restores the coloring canvas to its previous state
    // by popping the most recent snapshot and drawing it
    // back onto the canvas. Pushes the current state onto
    // the redo stack before restoring. Locked to prevent
    // concurrent operations from corrupting state.
    function undoLastAction() {
        if (isProcessing || snapshotStack.length === 0) {
            return Promise.resolve(false);
        }

        isProcessing = true;

        // Save current state to redo stack before restoring
        const canvas = CanvasManager.getColoringCanvas();
        redoStack.push(canvas.toDataURL('image/png'));

        const dataUrl = snapshotStack.pop();
        return restoreCanvasFromDataUrl(dataUrl);
    }

    // Re-applies the most recently undone action by popping
    // from the redo stack and restoring onto the canvas.
    // Pushes the current state onto the undo stack so the
    // user can undo the redo if needed. Locked to prevent
    // concurrent operations from corrupting state.
    function redoLastAction() {
        if (isProcessing || redoStack.length === 0) {
            return Promise.resolve(false);
        }

        isProcessing = true;

        // Save current state to undo stack before restoring
        const canvas = CanvasManager.getColoringCanvas();
        snapshotStack.push(canvas.toDataURL('image/png'));

        const dataUrl = redoStack.pop();
        return restoreCanvasFromDataUrl(dataUrl);
    }

    // Loads a PNG data URL into an Image and draws it onto the
    // coloring canvas at native resolution. Releases the processing
    // lock when done, whether the load succeeds or fails.
    function restoreCanvasFromDataUrl(dataUrl) {
        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();
        const image = new Image();

        return new Promise((resolve) => {
            image.onload = () => {
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.clearRect(0, 0, canvas.width, canvas.height);
                    c.drawImage(image, 0, 0);
                });
                isProcessing = false;
                resolve(true);
            };
            image.onerror = () => {
                console.warn('Undo/redo: failed to load snapshot image');
                isProcessing = false;
                resolve(false);
            };
            image.src = dataUrl;
        });
    }

    function clearHistory() {
        snapshotStack = [];
        redoStack = [];
        isProcessing = false;
    }

    function hasUndoSteps() {
        return snapshotStack.length > 0;
    }

    function hasRedoSteps() {
        return redoStack.length > 0;
    }

    return {
        saveSnapshot,
        undoLastAction,
        redoLastAction,
        clearHistory,
        hasUndoSteps,
        hasRedoSteps
    };
})();
