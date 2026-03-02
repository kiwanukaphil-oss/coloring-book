# ADR-017: Bounding-Box Undo Optimization

## Status
Accepted

## Context
Phase 1 (ADR-011) introduced command-based undo using full-canvas `ImageData` for both before and after states. At 2048×2048×4 bytes = 16 MB per snapshot, each command stores ~32 MB. With a 50-step limit, worst case is 1.6 GB — a known Phase 1 trade-off documented in `command-manager.js`. This memory ceiling blocks both longer sessions and future features like layers (which would multiply memory per layer).

The codebase already tracks local bounding boxes in `BrushEngine.handlePointerMove()` for outline pixel restoration (ADR-008), and `FloodFill.scanlineFill()` iterates all affected pixels. Both modules can report the bounding box of their action.

## Decision
Add a region-specific command factory `CommandManager.createRegionCommand(type, bbox, beforeImageData, afterImageData)` alongside the existing `createCanvasCommand()`. Region commands call `putImageData(data, bbox.x, bbox.y)` for partial canvas restore on undo/redo.

### Region command interface
```javascript
{
    type: string,
    timestamp: number,
    boundingBox: { x, y, width, height },
    beforeImageData: ImageData,   // Only the bbox region
    afterImageData: ImageData,    // Only the bbox region
    undo() { putImageData(beforeImageData, bbox.x, bbox.y) },
    redo() { putImageData(afterImageData, bbox.x, bbox.y) }
}
```

### Two-phase region capture strategy (Approach A: deferred crop)
1. **Stroke start / fill start**: Capture full-canvas "before" as `pendingBeforeState` (temporary, same as current Phase 1 behavior)
2. **Stroke end / fill end**: Crop both `pendingBeforeState` and current canvas to the computed bounding box. Create a `createRegionCommand()` with the cropped regions.
3. **Memory**: Temporary spike during active stroke (one 16 MB full-canvas), released immediately on finalize. Stored commands hold only the bbox region.

This avoids the complexity of predicting the bbox before drawing starts.

### BrushEngine bbox tracking
- On `pointerdown`: initialize stroke accumulator (`strokeMinX`, `strokeMinY`, `strokeMaxX`, `strokeMaxY`) from the starting coordinate
- On each `pointermove`: expand with coalesced event coordinates ± brush radius
- On `pointerup`: pad bbox by `brushRadius + 2` pixels for safety, clamp to canvas bounds, pass to `UndoManager.finalizeWithRegion(bbox)`

### FloodFill bbox tracking
- Track `bboxMinX`, `bboxMinY`, `bboxMaxX`, `bboxMaxY` during the scanline fill loop
- Return `{ filledPixelCount, bbox }` from `scanlineFill()`
- Use the bbox for region-specific undo

### UndoManager facade additions
- `saveSnapshotForRegion()`: captures full-canvas "before" (same as `saveSnapshot()`) but marks the pending state as region-awaiting
- `finalizeWithRegion(bbox)`: crops pending before-state and current canvas to bbox, creates region command
- Existing `saveSnapshot()` and `finalizePendingIfNeeded()` continue to use full-canvas commands for backward compatibility (e.g., "clear canvas")

### Rules
- Bounding box must be padded by the brush radius + 2 pixels on all sides
- Bounding box must be clamped to `[0, 0, canvas.width, canvas.height]`
- Full-canvas `createCanvasCommand()` remains for operations without a bounding box (clear canvas, image load)
- The `pushCommand()` / `undoCommand()` / `redoCommand()` stack operations are unchanged — both region and full-canvas commands coexist in the same stacks

## Consequences
- Modified: `js/command-manager.js` (add `createRegionCommand()`)
- Modified: `js/undo-manager.js` (add `saveSnapshotForRegion()`, `finalizeWithRegion()`)
- Modified: `js/brush-engine.js` (stroke bbox accumulator)
- Modified: `js/flood-fill.js` (fill extent tracking, bbox return)
- New: `tests/characterisation/bbox-undo.spec.js`
- Undo memory per command drops from ~32 MB (full canvas) to ~300 KB typical (small brush stroke region)
- Existing 11 undo tests continue to pass (clear canvas still uses full-canvas commands)
