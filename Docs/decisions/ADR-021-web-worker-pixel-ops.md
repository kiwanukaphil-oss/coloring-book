# ADR-021: Web Worker Pixel Processing

## Status
Accepted

## Context
`FloodFill.scanlineFill()` and `CanvasManager.computeOutlineMask()` process millions of pixels on the main thread. On a 2048×2048 canvas, flood filling a large region can take 100-300ms, causing visible frame drops and UI jank on mid-range tablets.

Web Workers run on a separate thread and can process pixel arrays without blocking the main thread. The Transferable interface allows zero-copy transfer of ArrayBuffers between threads.

## Decision
Move the pixel-intensive algorithms to Web Workers. The main-thread code dispatches pixel data to the worker and receives results asynchronously. A synchronous fallback executes on the main thread when Workers are unavailable.

### Worker architecture

#### `workers/fill-worker.js`
Receives: coloring pixel data, outline pixel data, canvas dimensions, start point, target color, fill color, tolerance, thresholds.
Returns: modified coloring pixel data, filled pixel count, bounding box of filled region.

The fill algorithm is self-contained — a copy of `scanlineFill()` and its helpers (`matchesTargetColor`, `isOutlinePixel`, `hexToRgba`) within the worker file. The worker has no imports or dependencies.

#### `workers/mask-worker.js`
Receives: outline canvas pixel data, canvas width, canvas height, luminance threshold, alpha threshold.
Returns: `Uint8Array` binary mask (1 = outline pixel, 0 = not).

### Transfer protocol
```javascript
// Main thread → Worker
worker.postMessage({
    coloringPixels: coloringImageData.data.buffer,
    outlinePixels: outlineImageData.data.buffer,
    // ... scalar parameters
}, [coloringImageData.data.buffer, outlineImageData.data.buffer]);

// Worker → Main thread
self.postMessage({
    coloringPixels: modifiedBuffer,
    filledPixelCount,
    bbox
}, [modifiedBuffer]);
```

ArrayBuffers are transferred (not copied) in both directions. After transfer, the original reference becomes detached and cannot be used.

### Fallback strategy
```javascript
function executeFloodFillAtPoint(canvasX, canvasY, fillColorHex) {
    if (fillWorker) {
        return executeFloodFillViaWorker(canvasX, canvasY, fillColorHex);
    }
    return executeFloodFillMainThread(canvasX, canvasY, fillColorHex);
}
```

Worker creation happens once on module init. If `new Worker()` throws (some WebView contexts), the module falls back to main-thread execution permanently.

### Loading indicator
For fills that take >100ms, a brief loading indicator is shown via `FeedbackManager.showSpinner()`. The spinner is hidden on worker response.

### Rules
- Worker files are self-contained: no imports, no references to DOM or module globals
- ArrayBuffers are transferred (not copied) for zero-copy performance
- The main-thread fallback must produce identical results to the worker
- Workers are created once on init, not per-operation
- If a fill operation is already in progress when a new one is requested, the new request waits (no concurrent fills)
- Worker files are added to `ASSETS_TO_CACHE` in the service worker

## Consequences
- New: `workers/fill-worker.js` (~120 LOC)
- New: `workers/mask-worker.js` (~80 LOC)
- Modified: `js/flood-fill.js` (worker dispatch, async fill path, fallback)
- Modified: `js/canvas-manager.js` (worker dispatch for `computeOutlineMask()`, fallback)
- Modified: `service-worker.js` (add worker files to cache)
- Flood fill becomes asynchronous when using workers (main-thread fallback remains synchronous)
- Frame drops eliminated on mid-range tablets for large fills
