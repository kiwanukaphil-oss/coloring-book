/**
 * Fill Algorithm — Shared
 *
 * Responsible for: Providing the single source of truth for the scanline flood fill
 *   algorithm and its supporting functions. Loaded by the main thread via <script> and
 *   by fill-worker.js via importScripts() so both execution contexts use identical code.
 * NOT responsible for: Canvas DOM operations, undo management, worker messaging, or UI.
 *
 * Key functions:
 *   - scanlineFill: Scanline stack-based flood fill; returns { filledPixelCount, bbox }
 *   - matchesTargetColor: Tolerance-based pixel color matching (FILL_TOLERANCE = 32)
 *   - isOutlinePixel: Luminance/alpha boundary detection (ADR-008)
 *
 * Dependencies: None — pure functions, no globals, no imports, no DOM.
 *
 * Notes: Any change to the algorithm, constants, or function signatures must be verified
 *   against both the main-thread path (?classic=1) and the worker path. This file is the
 *   canonical implementation; flood-fill.js and fill-worker.js delegate here instead of
 *   maintaining their own copies. (ADR-021)
 */

// Threshold constants shared by fill and outline detection.
// Changing these affects both the main-thread and worker fill paths.
const FILL_TOLERANCE = 32;
const OUTLINE_LUMINANCE_THRESHOLD = 80;
const OUTLINE_ALPHA_THRESHOLD = 128;

// Scanline stack-based flood fill: processes horizontal spans of matching pixels,
// pushing adjacent spans onto a stack. All parameters are plain integers/typed arrays
// so the function works identically whether called on the main thread or in a worker.
//
// fillR/fillG/fillB: integer channel values (0-255) for the fill color.
// Returns { filledPixelCount, bbox } for region-aware undo (ADR-017).
function scanlineFill(
    pixels, outlinePixels, width, height,
    startX, startY,
    targetR, targetG, targetB, targetA,
    fillR, fillG, fillB
) {
    const visited = new Uint8Array(width * height);
    const stack = [[startX, startY]];
    let filledPixelCount = 0;

    // Track bounding box of all filled pixels (ADR-017)
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

        // Walk downward from the top, filling each pixel and checking
        // left/right neighbors for new spans to push onto the stack
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

            // Fill this pixel with the target color
            pixels[pixelIndex]     = fillR;
            pixels[pixelIndex + 1] = fillG;
            pixels[pixelIndex + 2] = fillB;
            pixels[pixelIndex + 3] = 255;
            filledPixelCount++;

            // Expand fill bounding box (ADR-017)
            if (x < bboxMinX) bboxMinX = x;
            if (x > bboxMaxX) bboxMaxX = x;
            if (currentY < bboxMinY) bboxMinY = currentY;
            if (currentY > bboxMaxY) bboxMaxY = currentY;

            // Check left neighbor — push a new span if entering a fillable region
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

            // Check right neighbor — push a new span if entering a fillable region
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

// Returns true if the pixel at the given index is within FILL_TOLERANCE
// of the target color on all four channels. Handles anti-aliased SVG edges
// by allowing small color differences rather than requiring exact matches.
function matchesTargetColor(pixels, index, targetR, targetG, targetB, targetA) {
    return (
        Math.abs(pixels[index]     - targetR) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 1] - targetG) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 2] - targetB) <= FILL_TOLERANCE &&
        Math.abs(pixels[index + 3] - targetA) <= FILL_TOLERANCE
    );
}

// Returns true if the pixel at the given index on the outline canvas is a dark
// boundary line. Dark, opaque pixels are treated as walls that fill cannot cross.
// Luminance and alpha thresholds match CanvasManager.computeOutlineMask() (ADR-008).
function isOutlinePixel(outlinePixels, index) {
    const a = outlinePixels[index + 3];
    if (a < OUTLINE_ALPHA_THRESHOLD) return false;

    const luminance = 0.299 * outlinePixels[index] +
                      0.587 * outlinePixels[index + 1] +
                      0.114 * outlinePixels[index + 2];
    return luminance < OUTLINE_LUMINANCE_THRESHOLD;
}
