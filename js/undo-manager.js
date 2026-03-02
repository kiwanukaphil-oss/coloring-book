/**
 * Undo Manager
 *
 * Responsible for: Providing a backward-compatible facade over CommandManager,
 *   capturing canvas state as ImageData commands for instant synchronous undo/redo.
 * NOT responsible for: Deciding when to snapshot — callers (BrushEngine, FloodFill,
 *   Toolbar) trigger saveSnapshot at the appropriate moment.
 *
 * Key functions:
 *   - saveSnapshot: Captures "before" state as ImageData; finalized on next call
 *   - undoLastAction: Delegates to CommandManager.undoCommand()
 *   - redoLastAction: Delegates to CommandManager.redoCommand()
 *   - clearHistory: Delegates to CommandManager.clearCommands()
 *   - hasUndoSteps / hasRedoSteps: Delegates to CommandManager depth checks
 *
 * Dependencies: CanvasManager, CommandManager
 *
 * Notes: The facade preserves the existing public API so all characterisation
 *   tests pass without modification. Internally uses ImageData (synchronous
 *   putImageData) instead of PNG data URLs (async Image decode), providing
 *   ~10x faster undo/redo. See ADR-011 for the command pattern specification.
 *   Max undo steps increased from 10 to 50 via CommandManager.
 */

const UndoManager = (() => {
    // Holds the "before" ImageData captured by the most recent
    // saveSnapshot() call. When saveSnapshot() is called again,
    // the pending state is compared against the current canvas to
    // create a complete before/after command.
    let pendingBeforeState = null;

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

        // Finalize the previous pending snapshot as a command
        if (pendingBeforeState !== null) {
            const afterImageData = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(0, 0, canvas.width, canvas.height);
            });
            const command = CommandManager.createCanvasCommand(
                'snapshot',
                pendingBeforeState,
                afterImageData
            );
            CommandManager.pushCommand(command);
        }

        // Capture the current state as the new "before"
        pendingBeforeState = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(0, 0, canvas.width, canvas.height);
        });
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
        const afterImageData = CanvasManager.withNativeTransform(ctx, (c) => {
            return c.getImageData(0, 0, canvas.width, canvas.height);
        });

        const command = CommandManager.createCanvasCommand(
            'snapshot',
            pendingBeforeState,
            afterImageData
        );
        CommandManager.pushCommand(command);
        pendingBeforeState = null;
    }

    function clearHistory() {
        pendingBeforeState = null;
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
        undoLastAction,
        redoLastAction,
        clearHistory,
        hasUndoSteps,
        hasRedoSteps
    };
})();
