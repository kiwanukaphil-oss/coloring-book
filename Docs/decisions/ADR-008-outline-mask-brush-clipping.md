# ADR-008: Precomputed Outline Mask for Brush Clipping

## Status
Accepted

## Context
The brush tool paints directly onto the coloring canvas without awareness of the outline layer. This means brush strokes can visually cross outline boundaries — paint appears on both sides of a line. In a kids' coloring book, the expected behavior is that paint stays "inside the lines."

The flood fill already reads the outline canvas to detect boundaries (`isOutlinePixel()` in `flood-fill.js`), but it does so by reading full `getImageData()` per fill operation. For the brush, we need per-stroke-segment checks, so reading the outline canvas image data on every `pointermove` event would be expensive.

## Decision
### 1. Precompute a binary outline mask on template load

After `makeWhitePixelsTransparent()` completes in `loadOutlineImage()`, compute a `Uint8Array` mask where `1` = outline pixel, `0` = non-outline. Store it in `CanvasManager` and expose via `getOutlineMask()`.

The mask uses the same thresholds as `isOutlinePixel()` in `flood-fill.js`:
- Alpha >= `OUTLINE_ALPHA_THRESHOLD` (128)
- Luminance < `OUTLINE_LUMINANCE_THRESHOLD` (80)

```javascript
// In canvas-manager.js:
let outlineMask = null;

function computeOutlineMask() {
    const width = outlineCanvas.width;
    const height = outlineCanvas.height;
    const imageData = withNativeTransform(outlineCtx, (ctx) => {
        return ctx.getImageData(0, 0, width, height);
    });
    const pixels = imageData.data;
    outlineMask = new Uint8Array(width * height);
    for (let i = 0; i < outlineMask.length; i++) {
        const idx = i * 4;
        const a = pixels[idx + 3];
        if (a < 128) continue;
        const luminance = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (luminance < 80) {
            outlineMask[i] = 1;
        }
    }
}
```

### 2. Post-draw outline pixel restoration in the brush engine

After each brush draw operation (initial dot in `handlePointerDown`, stroke segments in `handlePointerMove`), compute the bounding box of the affected area and restore outline pixels to white within that region.

This "draw then clean up" approach is chosen over alternatives because:
- **Simple**: works with the existing `lineTo()` / `arc()` drawing code unchanged
- **Correct**: outline pixels on the coloring canvas should always be white (the outline renders on a separate z-3 canvas)
- **Performant**: only reads/writes the small bounding box of each stroke segment, not the full canvas
- **No visual flash**: restoration happens within the same `withNativeTransform` callback, before the frame renders

```javascript
// In brush-engine.js:
function restoreOutlinePixels(ctx, regionX, regionY, regionWidth, regionHeight) {
    const mask = CanvasManager.getOutlineMask();
    if (!mask) return;
    // ... clamp bounds, getImageData, restore white for mask[i] === 1, putImageData
}
```

### 3. Mask lifecycle

- **Created**: at the end of `loadOutlineImage()`, after `makeWhitePixelsTransparent()`
- **Cleared**: set to `null` in `clearAllCanvases()` (when switching coloring pages)
- **Recomputed on resize**: in `handleWindowResize()`, after outlines are rescaled

## Consequences
- `canvas-manager.js`: add `outlineMask` state, `computeOutlineMask()`, `getOutlineMask()` getter, clear in `clearAllCanvases()`, recompute in `handleWindowResize()`
- `brush-engine.js`: add `restoreOutlinePixels()`, call after each draw in `handlePointerDown` and `handlePointerMove`
- Memory: `Uint8Array(2048 * 2048)` = 4MB worst case. Acceptable for a single-page coloring app.
- `flood-fill.js`: could be refactored later to use the precomputed mask instead of reading outline `getImageData()` per fill. Not part of this ADR.

## What this replaces
- No prior pattern existed for brush-outline interaction. Brush previously painted without any outline awareness.
