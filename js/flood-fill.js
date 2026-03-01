/**
 * Flood Fill
 *
 * Responsible for: Filling enclosed regions on the coloring canvas using an iterative
 *   scanline stack-based algorithm that respects outline boundaries.
 * NOT responsible for: Detecting tap vs drag gestures (Toolbar), choosing the fill color
 *   (ColorPalette), or converting CSS coords to canvas coords (CanvasManager).
 *
 * Key functions:
 *   - executeFloodFillAtPoint: Entry point — reads both canvases, fills matching region
 *   - scanlineFill: Core algorithm — processes horizontal spans via a stack
 *   - matchesTargetColor: Checks if a pixel is within FILL_TOLERANCE of the target
 *   - isOutlinePixel: Checks if a pixel is a dark outline boundary
 *
 * Dependencies: CanvasManager, UndoManager
 *
 * Notes: Uses tolerance-based matching (FILL_TOLERANCE = 32) to handle anti-aliased
 *   edges from SVG rendering. The outline canvas is read separately so fills stop at
 *   black lines regardless of what's on the coloring layer. Undo snapshot is saved
 *   only when at least one pixel actually changes.
 */

const FloodFill = (() => {
    const FILL_TOLERANCE = 32;
    const OUTLINE_LUMINANCE_THRESHOLD = 80;
    const OUTLINE_ALPHA_THRESHOLD = 128;

    // Executes a flood fill starting from the given canvas
    // pixel coordinates. Reads outline canvas to detect
    // boundaries, then fills matching pixels on the coloring
    // canvas with the chosen color using a scanline stack
    // approach for performance.
    function executeFloodFillAtPoint(canvasX, canvasY, fillColorHex) {
        const startX = Math.floor(canvasX);
        const startY = Math.floor(canvasY);

        const coloringCanvas = CanvasManager.getColoringCanvas();
        const coloringCtx = CanvasManager.getColoringContext();
        const outlineCtx = CanvasManager.getOutlineContext();

        const width = coloringCanvas.width;
        const height = coloringCanvas.height;

        if (startX < 0 || startX >= width || startY < 0 || startY >= height) {
            return;
        }

        // Read pixel data from both canvases at native resolution
        const coloringImageData = CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });

        const outlineImageData = CanvasManager.withNativeTransform(outlineCtx, (ctx) => {
            return ctx.getImageData(0, 0, width, height);
        });

        const coloringPixels = coloringImageData.data;
        const outlinePixels = outlineImageData.data;

        const fillColor = hexToRgba(fillColorHex);
        const startIndex = (startY * width + startX) * 4;

        // Read the target color at the tap position
        const targetR = coloringPixels[startIndex];
        const targetG = coloringPixels[startIndex + 1];
        const targetB = coloringPixels[startIndex + 2];
        const targetA = coloringPixels[startIndex + 3];

        // Don't fill if tapping on an outline pixel
        if (isOutlinePixel(outlinePixels, startIndex)) {
            return;
        }

        // Don't fill if already the same color
        if (
            Math.abs(targetR - fillColor.r) <= 1 &&
            Math.abs(targetG - fillColor.g) <= 1 &&
            Math.abs(targetB - fillColor.b) <= 1
        ) {
            return;
        }

        const filledPixelCount = scanlineFill(
            coloringPixels, outlinePixels, width, height,
            startX, startY,
            targetR, targetG, targetB, targetA,
            fillColor
        );

        if (filledPixelCount === 0) {
            return;
        }

        // Save undo snapshot only when at least one pixel changed.
        // Canvas content is still unchanged at this point.
        UndoManager.saveSnapshot();

        // Write the modified pixel data back to the canvas
        CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
            ctx.putImageData(coloringImageData, 0, 0);
        });

        ProgressManager.scheduleAutoSave();
    }

    // Scanline stack-based flood fill: processes horizontal spans
    // of matching pixels, pushing adjacent spans onto a stack.
    // Much faster than per-pixel recursion for large regions.
    function scanlineFill(
        pixels, outlinePixels, width, height,
        startX, startY,
        targetR, targetG, targetB, targetA,
        fillColor
    ) {
        const visited = new Uint8Array(width * height);
        const stack = [[startX, startY]];
        let filledPixelCount = 0;

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
                pixels[pixelIndex] = fillColor.r;
                pixels[pixelIndex + 1] = fillColor.g;
                pixels[pixelIndex + 2] = fillColor.b;
                pixels[pixelIndex + 3] = 255;
                filledPixelCount++;

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

        return filledPixelCount;
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

    // Determines if a pixel belongs to a black outline by
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

    function hexToRgba(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
            a: 255
        };
    }

    return {
        executeFloodFillAtPoint
    };
})();
