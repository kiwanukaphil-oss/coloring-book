# ADR-007: Canvas Context Reset Pattern

## Status
Accepted

## Context
All canvas drawing operations at native pixel resolution use a 3-line boilerplate to bypass the context's DPI scale transform:

```javascript
ctx.save();
ctx.setTransform(1, 0, 0, 1, 0, 0);
// ... drawing operations at native pixel coordinates ...
ctx.restore();
```

This pattern is repeated approximately 15 times across 4 files (`canvas-manager.js`, `flood-fill.js`, `brush-engine.js`, `undo-manager.js`). It is applied consistently everywhere (no deviations), but the repetition creates boilerplate and a risk that a future developer forgets one of the three steps.

## Decision
Add a `withNativeTransform(ctx, callback)` helper to `CanvasManager` that wraps the save/setTransform/restore pattern. All modules should use this helper instead of the raw 3-line pattern.

```javascript
// In canvas-manager.js:
function withNativeTransform(ctx, callback) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    callback(ctx);
    ctx.restore();
}
```

### Usage:
```javascript
// BEFORE:
coloringCtx.save();
coloringCtx.setTransform(1, 0, 0, 1, 0, 0);
coloringCtx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
coloringCtx.restore();

// AFTER:
CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
    ctx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
});
```

### Exception
Within `canvas-manager.js` itself, the internal `withNativeTransform` function may be called directly (not via the module's public API) since it's in the same scope.

### Return values
If the callback needs to return a value (e.g., `getImageData`), the helper passes it through:

```javascript
function withNativeTransform(ctx, callback) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const result = callback(ctx);
    ctx.restore();
    return result;
}

// Usage with return value:
const imageData = CanvasManager.withNativeTransform(outlineCtx, (ctx) => {
    return ctx.getImageData(0, 0, width, height);
});
```

## Consequences
- `canvas-manager.js`: add `withNativeTransform(ctx, callback)` to the module and its public API
- `canvas-manager.js`: refactor ~8 internal uses to use the helper
- `flood-fill.js`: refactor ~4 uses to use `CanvasManager.withNativeTransform()`
- `brush-engine.js`: refactor ~2 uses to use `CanvasManager.withNativeTransform()`
- `undo-manager.js`: refactor ~1 use to use `CanvasManager.withNativeTransform()`

## What this replaces
- Raw `ctx.save(); ctx.setTransform(1,0,0,1,0,0); ... ctx.restore()` boilerplate repeated across 4 modules
