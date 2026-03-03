# ADR-026: Layer Structural Undo

## Status
Accepted

## Context
Phase 3 added up to 5 user drawing layers. Structural layer operations (add, delete,
reorder) were initially marked as non-undoable. The most painful omission is delete:
if a user accidentally deletes a layer containing drawn artwork, there is no recovery.

This ADR documents which structural operations are made undoable and why.

## Decision

### Scope: delete only

Only `deleteLayer` is made undoable. `addLayer` and `reorderLayer` remain non-undoable.

**Rationale for no add-undo:**
Drawing commands store `layerIndex` as an integer and capture ImageData at action time.
If a user adds Layer 2 (empty), draws on it (producing drawing commands for layerIndex=2),
then undoes the add, the drawing commands for layerIndex=2 become orphaned: they reference
an index that no longer holds the expected canvas. Re-doing the add would re-create an
empty layer at that index, which the drawing commands would then overwrite with stale data.
There is no safe mechanism to invalidate or replay interleaved drawing commands when the
add is undone.

**Rationale for no reorder-undo:**
Drawing commands store `layerIndex` as an integer. After `reorderLayer(from, to)`, those
integers point to different canvases than they did when the drawing occurred. Undoing the
reorder does not fix the drawing-command indices — undo of a subsequent drawing action
would write into the wrong canvas. The mismatch is silent and produces corrupted artwork.

**Rationale for delete-undo being safe:**
Before deletion, the layer's full pixel data and metadata are captured in a snapshot.
The delete command's `undo()` calls `LayerManager.insertLayer(index, snapshot)`, which
reconstructs the canvas at the same index. Drawing commands that previously targeted
`layerIndex=N` will find the restored canvas at index N via `LayerManager.getLayerAt(N)`
and restore correctly. The existing null guard (`if (!layer) return`) in all drawing
command closures protects against the edge case where undo is called out of order.

### Snapshot format

`LayerManager.getLayerSnapshot(index)` returns a plain object:

```javascript
{
    canvasData: HTMLCanvasElement, // offscreen canvas with full pixel copy (not ImageData)
    name:       string,
    visible:    boolean,
    opacity:    number,            // 0.0–1.0
    scaleFactor: number            // canvas.width / CSS width
}
```

The snapshot is self-contained. No references to live LayerManager state.

### Command interface

The delete command is created via `CommandManager.createLayerDeleteCommand(layerIndex, snapshot)`.

**ADR-011 interface note:** Standard drawing commands (ADR-011) carry `boundingBox`,
`beforeImageData`, and `afterImageData`. The `layer-delete` command intentionally omits
these fields — it stores a `snapshot` (offscreen `canvasData` canvas + metadata) instead of
per-pixel `ImageData`. `CommandManager.undoCommand()` / `redoCommand()` call `undo()` and
`redo()` directly and never inspect those fields, so the deviation is safe.

```javascript
{
    type: 'layer-delete',
    timestamp: number,
    layerIndex: number,
    snapshot: object,
    undo() { LayerManager.insertLayer(this.layerIndex, this.snapshot);
              LayerManager.setActiveLayer(this.layerIndex); },
    redo() { LayerManager.deleteLayer(this.layerIndex); }
}
```

The command goes on the shared `CommandManager` undo stack alongside drawing commands.

### Coordination responsibility

`LayerPanel` coordinates the delete undo. Before calling `LayerManager.deleteLayer(index)`,
it:
1. Calls `LayerManager.getLayerSnapshot(index)` to capture the snapshot
2. Creates the command via `CommandManager.createLayerDeleteCommand(index, snapshot)`
3. Pushes the command via `CommandManager.pushCommand(command)`
4. Calls `LayerManager.deleteLayer(index)`

This keeps `LayerManager` free of `CommandManager` dependency (which would create
a CommandManager → LayerManager → CommandManager cycle). The pattern mirrors how
`Toolbar.js` coordinates undo snapshots for the clear action.

### ADR-007 exception for insertLayer

`LayerManager.insertLayer()` uses raw `ctx.save(); ctx.setTransform(1,0,0,1,0,0);
... ctx.restore()` to restore pixel data from the snapshot canvas. This is the same
circular-dependency exception documented in ADR-007 for all LayerManager canvas
operations (`fillLayerWhite`, `clearActiveLayer`, `clearAllLayers`,
`restoreAllLayersFromSnapshots`).

### Rules
- Only `deleteLayer` is undoable. `addLayer` and `reorderLayer` do not push commands.
- The snapshot must be captured before `deleteLayer()` is called.
- `LayerPanel` is responsible for snapshot capture and command creation.
- Delete commands must not be created if only one layer remains (the delete is blocked).
- The command type string is `'layer-delete'`.

## Consequences
- Modified: `js/layer-manager.js` — new `getLayerSnapshot()` and `insertLayer()` functions
- Modified: `js/command-manager.js` — new `createLayerDeleteCommand()` factory
- Modified: `js/layer-panel.js` — delete handler coordinates snapshot + command creation;
  Dependencies updated to include CommandManager
- Known limitation removed: "Layer add/delete/reorder are not undoable" replaced by
  "Layer add and reorder are not undoable" (documented rationale above)
