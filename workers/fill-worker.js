/**
 * Fill Worker (ADR-021)
 *
 * Responsible for: Running scanline flood fill off the main thread using
 *   Transferable ArrayBuffers for zero-copy pixel processing.
 * NOT responsible for: Canvas DOM operations, undo management, or UI updates.
 *
 * Key functions:
 *   - handleFillRequest: Receives pixel buffers + parameters, runs fill, returns result
 *
 * Dependencies: fill-algorithm.js (loaded via importScripts — provides scanlineFill,
 *   matchesTargetColor, isOutlinePixel, and the shared threshold constants)
 *
 * Notes: The fill algorithm lives in fill-algorithm.js (same directory). importScripts
 *   loads it synchronously before the message handler runs. ArrayBuffers are transferred
 *   (not copied) in both directions for zero-copy performance. (ADR-021)
 */

// Load the shared fill algorithm (scanlineFill, matchesTargetColor, isOutlinePixel,
// FILL_TOLERANCE, OUTLINE_LUMINANCE_THRESHOLD, OUTLINE_ALPHA_THRESHOLD).
// Path is relative to this worker file's location.
importScripts('./fill-algorithm.js');

self.addEventListener('message', function handleFillRequest(event) {
    const {
        coloringPixels,
        outlinePixels,
        width,
        height,
        startX,
        startY,
        targetR,
        targetG,
        targetB,
        targetA,
        fillR,
        fillG,
        fillB
    } = event.data;

    // Wrap transferred ArrayBuffers in typed arrays for pixel access
    const coloringData = new Uint8ClampedArray(coloringPixels);
    const outlineData = new Uint8ClampedArray(outlinePixels);

    const result = scanlineFill(
        coloringData, outlineData, width, height,
        startX, startY,
        targetR, targetG, targetB, targetA,
        fillR, fillG, fillB
    );

    // Transfer the modified coloring buffer back (zero-copy)
    self.postMessage({
        coloringPixels: coloringData.buffer,
        filledPixelCount: result.filledPixelCount,
        bbox: result.bbox
    }, [coloringData.buffer]);
});

// Signal that the worker is ready to receive fill requests
self.postMessage({ type: 'ready' });
