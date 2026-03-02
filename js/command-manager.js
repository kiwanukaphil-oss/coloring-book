/**
 * Command Manager
 *
 * Responsible for: Maintaining undo/redo stacks of command objects that capture
 *   canvas state as ImageData for instant, synchronous restore.
 * NOT responsible for: Deciding when to capture — callers (UndoManager facade,
 *   BrushEngine, FloodFill) push commands at the appropriate moment.
 *
 * Key functions:
 *   - pushCommand: Adds a command to the undo stack, clears redo stack
 *   - undoCommand: Pops from undo stack, calls command.undo(), pushes to redo
 *   - redoCommand: Pops from redo stack, calls command.redo(), pushes to undo
 *   - clearCommands: Empties both stacks
 *   - getUndoDepth / getRedoDepth: Returns stack sizes for UI indicators
 *   - createCanvasCommand: Factory for full-canvas ImageData commands
 *
 * Dependencies: CanvasManager (for canvas/context access and withNativeTransform)
 *
 * Notes: Phase 1 captures full-canvas ImageData per command. Bounding-box
 *   optimization (capturing only affected regions) will be added when
 *   BrushEngine and FloodFill report their affected bounding boxes.
 *   See ADR-011 for the command interface specification.
 */

const CommandManager = (() => {
    // MEMORY NOTE: Each command stores two full-canvas ImageData objects
    // (before + after). At 2048x2048x4 = 16 MB each, worst case is
    // 32 MB/command x 50 = 1.6 GB. Bounding-box optimization in Phase 2
    // will reduce this to ~330 KB/command typical. See ADR-011.
    const MAX_UNDO_STEPS = 50;
    let undoStack = [];
    let redoStack = [];

    // Creates a command object that stores full-canvas ImageData
    // for both before and after states. undo() restores the before
    // state; redo() restores the after state. Both use synchronous
    // putImageData via withNativeTransform (ADR-007).
    function createCanvasCommand(type, beforeImageData, afterImageData) {
        return {
            type: type,
            timestamp: Date.now(),
            boundingBox: {
                x: 0,
                y: 0,
                width: beforeImageData.width,
                height: beforeImageData.height
            },
            beforeImageData: beforeImageData,
            afterImageData: afterImageData,
            undo() {
                const ctx = CanvasManager.getColoringContext();
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.putImageData(this.beforeImageData, 0, 0);
                });
            },
            redo() {
                const ctx = CanvasManager.getColoringContext();
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.putImageData(this.afterImageData, 0, 0);
                });
            }
        };
    }

    // Adds a command to the undo stack and clears the redo stack
    // (standard undo/redo behavior: a new action invalidates redo).
    // Drops the oldest command if the stack exceeds MAX_UNDO_STEPS.
    function pushCommand(command) {
        undoStack.push(command);
        if (undoStack.length > MAX_UNDO_STEPS) {
            undoStack.shift();
        }
        redoStack = [];
    }

    // Pops the most recent command, calls its undo(), and pushes
    // it to the redo stack. Returns true on success, false if empty.
    function undoCommand() {
        if (undoStack.length === 0) return false;
        const command = undoStack.pop();
        command.undo();
        redoStack.push(command);
        return true;
    }

    // Pops from the redo stack, calls redo(), and pushes back
    // to the undo stack. Returns true on success, false if empty.
    function redoCommand() {
        if (redoStack.length === 0) return false;
        const command = redoStack.pop();
        command.redo();
        undoStack.push(command);
        return true;
    }

    function clearCommands() {
        undoStack = [];
        redoStack = [];
    }

    // Clears just the redo stack. Called by UndoManager.saveSnapshot()
    // to ensure a new action invalidates redo history even before
    // the command is finalized.
    function clearRedoStack() {
        redoStack = [];
    }

    function getUndoDepth() {
        return undoStack.length;
    }

    function getRedoDepth() {
        return redoStack.length;
    }

    return {
        createCanvasCommand,
        pushCommand,
        undoCommand,
        redoCommand,
        clearRedoStack,
        clearCommands,
        getUndoDepth,
        getRedoDepth
    };
})();
