/**
 * Mask Worker (ADR-021)
 *
 * Responsible for: Computing a binary outline mask from outline canvas pixel
 *   data off the main thread using Transferable ArrayBuffers.
 * NOT responsible for: Canvas DOM operations, rendering, or brush clipping logic.
 *
 * Key functions:
 *   - handleMaskRequest: Receives outline pixels, computes mask, returns result
 *
 * Dependencies: None (self-contained — no imports, no DOM, no module globals)
 *
 * Notes: The mask is a Uint8Array where 1 = outline pixel, 0 = non-outline.
 *   Uses the same luminance/alpha thresholds as FloodFill.isOutlinePixel()
 *   and CanvasManager.computeOutlineMask() for consistency. Constants are
 *   duplicated here intentionally to keep the worker self-contained.
 */

self.addEventListener('message', function handleMaskRequest(event) {
    const {
        outlinePixels,
        width,
        height,
        luminanceThreshold,
        alphaThreshold
    } = event.data;

    // Wrap transferred ArrayBuffer in typed array for pixel access
    const pixels = new Uint8ClampedArray(outlinePixels);
    const totalPixels = width * height;
    const mask = new Uint8Array(totalPixels);

    for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const a = pixels[idx + 3];
        if (a < alphaThreshold) continue;

        const luminance = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        if (luminance < luminanceThreshold) {
            mask[i] = 1;
        }
    }

    // Transfer the mask buffer back (zero-copy)
    self.postMessage({
        mask: mask.buffer
    }, [mask.buffer]);
});

// Signal that the worker is ready to receive mask requests
self.postMessage({ type: 'ready' });
