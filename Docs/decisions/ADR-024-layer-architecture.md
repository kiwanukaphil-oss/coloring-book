# ADR-024: Layer Architecture

## Status
Accepted

## Context
The app currently has a single user-writable coloring canvas. Phase 3 adds up to five
independent drawing layers so users can separate elements of their artwork — for example,
a background fill on layer 0 and detailed line work on layer 1 — without each stroke
affecting the others. Layers must survive save/resume cycles and compose correctly for
PNG export and thumbnail generation.

## Decision

### Canvas stacking
Layer canvases are created dynamically by `LayerManager` and inserted into `#canvas-container`
between the static `reference-canvas` and `outline-canvas` elements.
The static `coloring-canvas` DOM element is removed; `LayerManager` owns all coloring canvases.

CSS z-index values ensure correct visual stacking regardless of DOM insertion order:

| Canvas | z-index |
|--------|---------|
| reference-canvas | 1 |
| layer-0 | 2 |
| layer-1 | 3 |
| layer-N | N + 2 |
| outline-canvas | 11 |
| interaction-canvas | 21 |
| cursor-canvas | 31 |

Maximum 5 user layers (indices 0–4, z-index 2–6). Gap to outline-canvas (z-index 11) leaves
room for all five layers with no conflict.

### LayerManager module
`js/layer-manager.js` owns all layer state:
- `layers` array: `[{ id, name, canvas, ctx, visible, opacity }]`
- `activeLayerIndex` (0-based integer)

Each canvas element has `position: absolute; top: 0; left: 0` set inline and is sized by
`LayerManager.resizeLayers()`, which is called by `CanvasManager.resizeCanvasesToFitContainer()`
after computing the canvas dimensions.

Layer canvas contexts are created with `{ willReadFrequently: true }` because flood fill and
undo both call `getImageData` on the active layer extensively.

### CanvasManager proxying
`CanvasManager.getColoringCanvas()` and `CanvasManager.getColoringContext()` become thin
proxies to `LayerManager.getActiveLayerCanvas()` and `LayerManager.getActiveLayerContext()`.
All existing modules (BrushEngine, FloodFill, UndoManager, ProgressManager) continue to call
`CanvasManager.getColoringCanvas/Context()` unchanged and automatically operate on the active
layer without modification.

### Layer-aware undo (CommandManager)
Both command factories gain an optional `layerIndex` parameter (default 0):

```javascript
CommandManager.createCanvasCommand(type, before, after, layerIndex = 0)
CommandManager.createRegionCommand(type, bbox, before, after, layerIndex = 0)
```

The `undo()` and `redo()` closures inside each command object look up the correct canvas
context at restore time via `LayerManager.getLayerAt(this.layerIndex).ctx` instead of
`CanvasManager.getColoringContext()`. This ensures undo targets the layer the action was
performed on, even if the user has since switched to a different active layer.

`UndoManager` captures `LayerManager.getActiveLayerIndex()` into `pendingLayerIndex` when
`saveSnapshot()` / `saveSnapshotForRegion()` is called, then passes it to the command
factory when the command is finalized.

### Compositing for save and thumbnail
`LayerManager.compositeAllLayers()` creates an offscreen canvas and draws all visible layers
(bottom to top) using their current opacity:

```javascript
function compositeAllLayers() {
    const offscreen = document.createElement('canvas');
    offscreen.width = layers[0].canvas.width;
    offscreen.height = layers[0].canvas.height;
    const ctx = offscreen.getContext('2d');
    layers.forEach((layer) => {
        if (layer.visible) {
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layer.canvas, 0, 0);
        }
    });
    ctx.globalAlpha = 1;
    return offscreen;
}
```

`CanvasManager.renderCompositeForSave()` calls `LayerManager.compositeAllLayers()` and then
draws `outlineCanvas` on top. `ProgressManager.generateThumbnailBlob()` is unchanged because
it calls `CanvasManager.renderCompositeForSave()`.

### StorageManager schema migration (v1 → v2)
`DB_VERSION` bumps from 1 to 2. No structural store changes are required — the object store
schema (keyPath 'id', indices 'updatedAt' and 'status') is unchanged.

New project save shape:
```
coloringBlobs: Blob[]          (one per layer, ordered by layer index)
layerMetadata: [{name, visible, opacity}]
```

The old `coloringBlob` singular field is dropped for new saves. `ProgressManager.resumeProject()`
uses the backward-compat read path:
```javascript
const coloringBlobs = project.coloringBlobs || [project.coloringBlob];
```
This allows v1 projects to resume on layer 0 without a data migration step.

### Window resize
`LayerManager.snapshotAllLayers()` returns an array of snapshot canvases. After
`resizeCanvasesToFitContainer()` runs, `LayerManager.restoreAllLayersFromSnapshots()` scales
each snapshot onto its corresponding resized layer canvas.

### Rules
- `LayerManager` is initialized inside `CanvasManager.initialize()` — callers do not initialize it directly
- Maximum 5 layers enforced by `LayerManager.addLayer()` (returns `false` at limit)
- Layer canvases are always `position: absolute; top: 0; left: 0` in `#canvas-container`
- Layer-0 canvas fills white on initialization (same as the previous `coloring-canvas` behavior)
- Layers above layer-0 are transparent by default (not filled white) so layer-0's white background shows through
- `compositeAllLayers()` respects `visible` and `opacity` per layer
- Layer delete is undoable via `CommandManager.createLayerDeleteCommand()` (ADR-026);
  add and reorder do not push undo commands (see ADR-026 for rationale)
- Kids mode always uses layer 0 only; the layer panel is hidden in Kids mode (ADR-025)

## Consequences
- New: `js/layer-manager.js` (~160 LOC)
- Modified: `js/canvas-manager.js` — proxy getColoringCanvas/Context; update clearAll, resize, renderCompositeForSave, handleWindowResize
- Modified: `js/command-manager.js` — layerIndex parameter; layer-aware undo/redo
- Modified: `js/undo-manager.js` — pendingLayerIndex capture
- Modified: `js/storage-manager.js` — DB_VERSION 1→2
- Modified: `js/progress-manager.js` — multi-layer save/restore
- Modified: `index.html` — remove coloring-canvas; add layer-manager.js script tag
- The static `coloring-canvas` DOM element no longer exists
- All existing tests pass unchanged (CanvasManager proxy is transparent to callers)
