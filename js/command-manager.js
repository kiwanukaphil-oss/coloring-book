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
 *   - createLayerDeleteCommand: Factory for undoable layer-delete commands (ADR-026)
 *
 * Dependencies: CanvasManager (for withNativeTransform), LayerManager (for getLayerAt)
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

    // Creates a command object that stores full-canvas ImageData for both before
    // and after states. layerIndex identifies which layer's context to restore to,
    // so undo/redo target the correct layer even if the active layer has changed
    // since the command was created. (ADR-024)
    function createCanvasCommand(type, beforeImageData, afterImageData, layerIndex = 0) {
        return {
            type: type,
            timestamp: Date.now(),
            layerIndex: layerIndex,
            boundingBox: {
                x: 0,
                y: 0,
                width: beforeImageData.width,
                height: beforeImageData.height
            },
            beforeImageData: beforeImageData,
            afterImageData: afterImageData,
            undo() {
                const layer = LayerManager.getLayerAt(this.layerIndex);
                if (!layer) return;
                CanvasManager.withNativeTransform(layer.ctx, (c) => {
                    c.putImageData(this.beforeImageData, 0, 0);
                });
            },
            redo() {
                const layer = LayerManager.getLayerAt(this.layerIndex);
                if (!layer) return;
                CanvasManager.withNativeTransform(layer.ctx, (c) => {
                    c.putImageData(this.afterImageData, 0, 0);
                });
            }
        };
    }

    // Creates a command object that stores ImageData for only the affected
    // bounding-box region. layerIndex ensures undo/redo restore to the layer
    // the action was performed on, regardless of the current active layer. (ADR-017, ADR-024)
    function createRegionCommand(type, bbox, beforeImageData, afterImageData, layerIndex = 0) {
        return {
            type: type,
            timestamp: Date.now(),
            layerIndex: layerIndex,
            boundingBox: {
                x: bbox.x,
                y: bbox.y,
                width: bbox.width,
                height: bbox.height
            },
            beforeImageData: beforeImageData,
            afterImageData: afterImageData,
            undo() {
                const layer = LayerManager.getLayerAt(this.layerIndex);
                if (!layer) return;
                CanvasManager.withNativeTransform(layer.ctx, (c) => {
                    c.putImageData(this.beforeImageData, this.boundingBox.x, this.boundingBox.y);
                });
            },
            redo() {
                const layer = LayerManager.getLayerAt(this.layerIndex);
                if (!layer) return;
                CanvasManager.withNativeTransform(layer.ctx, (c) => {
                    c.putImageData(this.afterImageData, this.boundingBox.x, this.boundingBox.y);
                });
            }
        };
    }

    // Factory for a command that makes deleteLayer undoable. snapshot is the
    // object from LayerManager.getLayerSnapshot() (offscreen canvas + metadata).
    // undo() re-inserts the layer at the original index via LayerManager.insertLayer();
    // redo() deletes it again. The command is self-contained per ADR-011. (ADR-026)
    //
    // ADR-011 interface note: this command intentionally omits boundingBox,
    // beforeImageData, and afterImageData. It stores a canvasData snapshot (an
    // offscreen HTMLCanvasElement) instead of per-pixel ImageData. undoCommand() and
    // redoCommand() call undo()/redo() directly and never inspect those fields,
    // so the structural deviation from the drawing-command interface is safe.
    function createLayerDeleteCommand(layerIndex, snapshot) {
        return {
            type: 'layer-delete',
            timestamp: Date.now(),
            layerIndex: layerIndex,
            snapshot: snapshot,
            undo() {
                LayerManager.insertLayer(this.layerIndex, this.snapshot);
                LayerManager.setActiveLayer(this.layerIndex);
            },
            redo() {
                LayerManager.deleteLayer(this.layerIndex);
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
        createLayerDeleteCommand,
        pushCommand,
        undoCommand,
        redoCommand,
        clearRedoStack,
        clearCommands,
        getUndoDepth,
        getRedoDepth
    };
})();
