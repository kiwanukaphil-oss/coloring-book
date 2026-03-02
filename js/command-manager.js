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
 *   - createRegionCommand: Factory for bounding-box ImageData commands (ADR-017)
 *
 * Dependencies: CanvasManager (for canvas/context access and withNativeTransform)
 *
 * Notes: Commands come in two forms: full-canvas (for clear, image load) and
 *   region-specific (for brush strokes, flood fills). Region commands store
 *   only the affected bounding box, reducing memory from ~32 MB to ~300 KB
 *   per command. See ADR-011 and ADR-017 for specifications.
 */

const CommandManager = (() => {
    // MEMORY NOTE: Region commands store only the affected bounding box
    // (~300 KB typical for a brush stroke). Full-canvas commands (~16 MB
    // each) are still used for clear/load operations. At 50 steps with
    // mostly region commands, typical memory is ~15 MB. See ADR-017.
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

    // Creates a command object that stores ImageData for only the
    // affected bounding-box region. undo() restores the before region;
    // redo() restores the after region. Both use putImageData with
    // the bbox offset for partial canvas restore. (ADR-017)
    function createRegionCommand(type, bbox, beforeImageData, afterImageData) {
        return {
            type: type,
            timestamp: Date.now(),
            boundingBox: {
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
            },
            beforeImageData: beforeImageData,
            afterImageData: afterImageData,
            undo() {
                const ctx = CanvasManager.getColoringContext();
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.putImageData(this.beforeImageData, this.boundingBox.x, this.boundingBox.y);
                });
            },
            redo() {
                const ctx = CanvasManager.getColoringContext();
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.putImageData(this.afterImageData, this.boundingBox.x, this.boundingBox.y);
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
        createRegionCommand,
        pushCommand,
        undoCommand,
        redoCommand,
        clearRedoStack,
        clearCommands,
        getUndoDepth,
        getRedoDepth
    };
})();
