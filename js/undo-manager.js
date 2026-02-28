/* ========================================
   Undo Manager
   Stores compressed snapshots of the coloring
   canvas as PNG data URLs. Supports up to 10
   undo steps with minimal memory footprint.
   ======================================== */

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
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0);
                ctx.restore();
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
