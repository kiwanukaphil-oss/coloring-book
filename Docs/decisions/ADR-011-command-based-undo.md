# ADR-011: Command-Based Undo

## Status
Accepted

## Context
The current `UndoManager` stores full-canvas PNG data URLs as undo snapshots. This approach has three problems:

1. **Memory**: Each snapshot is 1-4 MB (base64 PNG of a 2048x2048 canvas). At 10 max steps, that's 10-40 MB of strings in memory.
2. **Speed**: Undo requires creating an `Image()` element, setting `src` to the data URL, waiting for `onload`, then `drawImage()`. This is asynchronous and can take 50-200ms.
3. **Scalability**: The 10-step limit exists because of memory pressure. Users want 50+ undo steps.

The worldclass transformation audit identifies this as architectural ceiling #2.

## Decision
Replace PNG snapshot undo with a command pattern using `ImageData` bounding-box deltas.

### Command interface
```javascript
{
    type: string,         // 'brush-stroke', 'flood-fill', 'clear', etc.
    boundingBox: { x, y, width, height },
    beforeImageData: ImageData,
    afterImageData: ImageData,
    timestamp: number,
    undo() { /* puts beforeImageData back */ },
    redo() { /* puts afterImageData back */ }
}
```

### New module: `CommandManager`
- `pushCommand(command)` — adds to stack, clears redo stack
- `undoCommand()` — pops and calls `.undo()`, pushes to redo stack
- `redoCommand()` — pops redo and calls `.redo()`, pushes to command stack
- `clearCommands()` — empties both stacks
- `getUndoDepth()` / `getRedoDepth()` — for UI indicators
- Max 50 undo steps

### Facade: `UndoManager` API preserved
The existing `UndoManager` public API is unchanged:
- `saveSnapshot()` — captures "before" state (two-phase: see below)
- `undoLastAction()` — finalizes pending state, then delegates to `CommandManager.undoCommand()`
- `redoLastAction()` — delegates to `CommandManager.redoCommand()`
- `clearHistory()` — delegates to `CommandManager.clearCommands()`
- `hasUndoSteps()` — delegates to `CommandManager.getUndoDepth() > 0 || pendingBeforeState !== null`
- `hasRedoSteps()` — delegates to `CommandManager.getRedoDepth() > 0`

This ensures all existing characterisation tests pass without modification.

### Two-phase snapshot contract
`saveSnapshot()` uses a two-phase approach to create before/after command pairs:

1. **First call**: Captures the current canvas as `pendingBeforeState` (no command created yet)
2. **Second call**: The current canvas is the "after" for the previous action. Creates a command with `{ before: pendingBeforeState, after: currentCanvas }`, pushes it, then captures a new `pendingBeforeState`
3. **On undo**: If there's a pending before-state, `finalizePendingIfNeeded()` creates the command first, so the latest drawing action is undoable even before the next `saveSnapshot()`

Every call to `saveSnapshot()` also clears the redo stack via `CommandManager.clearRedoStack()` to match standard undo/redo behavior (a new action invalidates redo history).

### Phase 1 scope
In Phase 1, commands capture the full canvas as `ImageData` (not bounding-box optimized). Speed is ~10x better than PNG data URLs:
- `putImageData()` is synchronous (instant undo, no async decode)
- No base64 encoding overhead

**Memory trade-off**: Each command stores two `ImageData` objects (before + after). At 2048x2048x4 = 16 MB each, worst case is 32 MB per command x 50 = 1.6 GB. In practice, most canvases are smaller and the browser's garbage collector reclaims evicted commands, but this is a known regression from the old PNG approach (~1-4 MB per step x 10 = 10-40 MB). Bounding-box optimization is critical for Phase 2 to reduce per-command memory to ~330 KB typical.

True bounding-box optimization (capturing only the affected region) is added incrementally when `BrushEngine` and `FloodFill` are modified to report their affected bounding boxes.

### Rules
- All undoable actions must create a command via `CommandManager`
- Commands must be self-contained: `undo()` and `redo()` must work without external state
- The `UndoManager` facade must remain the public API for backward compatibility
- New code should use `CommandManager` directly; existing code continues using `UndoManager`

## Consequences
- New file: `js/command-manager.js`
- Modified: `js/undo-manager.js` (complete internal rewrite, public API unchanged)
- Modified: `index.html` (script tag for command-manager.js, before undo-manager.js)
- Undo depth increases from 10 to 50
- Undo becomes synchronous (instant) instead of async
- Memory usage per step: ~16 MB for full 2048x2048 ImageData, but only ~330 KB for a typical bounding-box region (once optimized)
