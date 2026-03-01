/**
 * Undo Manager
 *
 * Responsible for: Storing compressed snapshots of the coloring canvas as PNG data URLs
 *   and restoring them on undo, supporting up to 10 steps.
 * NOT responsible for: Deciding when to snapshot — callers (BrushEngine, FloodFill,
 *   Toolbar) trigger saveSnapshot at the appropriate moment.
 *
 * Key functions:
 *   - saveSnapshot: Captures current coloring canvas state as a PNG data URL
 *   - undoLastAction: Restores the most recent snapshot onto the canvas
 *   - clearHistory: Discards all snapshots (used when loading a new coloring page)
 *   - hasUndoSteps: Returns whether any undo steps are available
 *
 * Dependencies: CanvasManager
 *
 * Notes: Snapshots are stored as PNG data URLs rather than raw ImageData to reduce
 *   memory usage (~10x smaller). The trade-off is a small decode cost on undo.
 */

const UndoManager = (() => {
    const MAX_UNDO_STEPS = 10;
    let snapshotStack = [];

    // Captures the current state of the coloring canvas
    // as a compressed PNG data URL and pushes it onto the
    // undo stack. Drops the oldest snapshot if the stack
    // exceeds MAX_UNDO_STEPS.
    function saveSnapshot() {
        const canvas = CanvasManager.getColoringCanvas();
        const dataUrl = canvas.toDataURL('image/png');
        snapshotStack.push(dataUrl);

        if (snapshotStack.length > MAX_UNDO_STEPS) {
            snapshotStack.shift();
        }
    }

    // Restores the coloring canvas to its previous state
    // by popping the most recent snapshot and drawing it
    // back onto the canvas. Returns a promise that resolves
    // when the restoration is complete.
    function undoLastAction() {
        if (snapshotStack.length === 0) {
            return Promise.resolve(false);
        }

        const dataUrl = snapshotStack.pop();
        const canvas = CanvasManager.getColoringCanvas();
        const ctx = CanvasManager.getColoringContext();
        const image = new Image();

        return new Promise((resolve) => {
            image.onload = () => {
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.clearRect(0, 0, canvas.width, canvas.height);
                    c.drawImage(image, 0, 0);
                });
                resolve(true);
            };
            image.src = dataUrl;
        });
    }

    function clearHistory() {
        snapshotStack = [];
    }

    function hasUndoSteps() {
        return snapshotStack.length > 0;
    }

    return {
        saveSnapshot,
        undoLastAction,
        clearHistory,
        hasUndoSteps
    };
})();
