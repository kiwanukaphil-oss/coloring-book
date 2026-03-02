/**
 * Fill Worker (ADR-021)
 *
 * Responsible for: Running scanline flood fill off the main thread using
 *   Transferable ArrayBuffers for zero-copy pixel processing.
 * NOT responsible for: Canvas DOM operations, undo management, or UI updates.
 *
 * Key functions:
 *   - handleFillRequest: Receives pixel buffers + parameters, runs fill, returns result
 *   - scanlineFill: Self-contained scanline stack-based algorithm (mirrors FloodFill)
 *   - matchesTargetColor: Tolerance-based color matching
 *   - isOutlinePixel: Luminance/alpha boundary detection
 *
 * Dependencies: None (self-contained — no imports, no DOM, no module globals)
 *
 * Notes: This file is a standalone copy of the scanline fill algorithm from
 *   flood-fill.js. Both implementations must produce identical results.
 *   Constants are duplicated here intentionally to keep the worker self-contained.
 *   ArrayBuffers are transferred (not copied) in both directions for zero-copy.
 */

const FILL_TOLERANCE = 32;
const OUTLINE_LUMINANCE_THRESHOLD = 80;
const OUTLINE_ALPHA_THRESHOLD = 128;

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

// Scanline stack-based flood fill: processes horizontal spans
// of matching pixels, pushing adjacent spans onto a stack.
// Returns { filledPixelCount, bbox } for region-aware undo.
// This is a self-contained copy of FloodFill.scanlineFill().
function scanlineFill(
    pixels, outlinePixels, width, height,
    startX, startY,
    targetR, targetG, targetB, targetA,
    fillR, fillG, fillB
) {
    const visited = new Uint8Array(width * height);
    const stack = [[startX, startY]];
    let filledPixelCount = 0;

    let bboxMinX = width;
    let bboxMinY = height;
    let bboxMaxX = 0;
    let bboxMaxY = 0;

    while (stack.length > 0) {
        const [x, y] = stack.pop();

        // Walk upward to find the topmost matching pixel in this column
        let currentY = y;
        while (
            currentY >= 0 &&
            matchesTargetColor(pixels, (currentY * width + x) * 4, targetR, targetG, targetB, targetA) &&
            !isOutlinePixel(outlinePixels, (currentY * width + x) * 4)
        ) {
            currentY--;
        }
        currentY++;

        let isScanningLeft = false;
        let isScanningRight = false;

        // Walk downward from the top, filling each pixel and
        // checking left/right neighbors for new spans to process
        while (
            currentY < height &&
            matchesTargetColor(pixels, (currentY * width + x) * 4, targetR, targetG, targetB, targetA) &&
            !isOutlinePixel(outlinePixels, (currentY * width + x) * 4)
        ) {
            const pixelIndex = (currentY * width + x) * 4;
            const flatIndex = currentY * width + x;

            if (visited[flatIndex]) {
                currentY++;
                continue;
            }
            visited[flatIndex] = 1;

            // Fill this pixel
            pixels[pixelIndex] = fillR;
            pixels[pixelIndex + 1] = fillG;
            pixels[pixelIndex + 2] = fillB;
            pixels[pixelIndex + 3] = 255;
            filledPixelCount++;

            // Expand fill bounding box
            if (x < bboxMinX) bboxMinX = x;
            if (x > bboxMaxX) bboxMaxX = x;
            if (currentY < bboxMinY) bboxMinY = currentY;
            if (currentY > bboxMaxY) bboxMaxY = currentY;

            // Check left neighbor
            if (x > 0) {
                const leftIndex = (currentY * width + (x - 1)) * 4;
                const leftFlat = currentY * width + (x - 1);
                const leftMatches =
                    !visited[leftFlat] &&
                    matchesTargetColor(pixels, leftIndex, targetR, targetG, targetB, targetA) &&
                    !isOutlinePixel(outlinePixels, leftIndex);

                if (!isScanningLeft && leftMatches) {
                    stack.push([x - 1, currentY]);
                    isScanningLeft = true;
                } else if (!leftMatches) {
                    isScanningLeft = false;
                }
            }

            // Check right neighbor
            if (x < width - 1) {
                const rightIndex = (currentY * width + (x + 1)) * 4;
                const rightFlat = currentY * width + (x + 1);
                const rightMatches =
                    !visited[rightFlat] &&
                    matchesTargetColor(pixels, rightIndex, targetR, targetG, targetB, targetA) &&
                    !isOutlinePixel(outlinePixels, rightIndex);

                if (!isScanningRight && rightMatches) {
                    stack.push([x + 1, currentY]);
                    isScanningRight = true;
                } else if (!rightMatches) {
                    isScanningRight = false;
                }
            }

            currentY++;
        }
    }

    return {
        filledPixelCount: filledPixelCount,
        bbox: {
            x: bboxMinX,
            y: bboxMinY,
            width: bboxMaxX - bboxMinX + 1,
            height: bboxMaxY - bboxMinY + 1
        }
    };
}

// Checks if a pixel's color is close enough to the target
// color within the configured tolerance. Handles anti-aliased
// edges by allowing small color differences.
function matchesTargetColor(pixels, index, targetR, targetG, targetB, targetA) {
    return (
        Math.abs(pixels[index] - targetR) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 1] - targetG) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 2] - targetB) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 3] - targetA) <= FILL_TOLERANCE
    );
}

// Determines if a pixel belongs to a dark outline by
// checking its luminance and alpha on the outline canvas.
// Dark, opaque pixels are treated as boundaries.
function isOutlinePixel(outlinePixels, index) {
    const r = outlinePixels[index];
    const g = outlinePixels[index + 1];
    const b = outlinePixels[index + 2];
    const a = outlinePixels[index + 3];

    if (a < OUTLINE_ALPHA_THRESHOLD) {
        return false;
    }

    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < OUTLINE_LUMINANCE_THRESHOLD;
}

// Signal that the worker is ready to receive fill requests
self.postMessage({ type: 'ready' });
