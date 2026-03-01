// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('FloodFill', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Close gallery so canvas is accessible
    await page.evaluate(() => ImageLoader.hideGallery());
  });

  test('fills white canvas with the specified color', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canvas = CanvasManager.getColoringCanvas();

      // Execute flood fill at center of canvas with blue
      FloodFill.executeFloodFillAtPoint(
        canvas.width / 2, canvas.height / 2, '#0000FF'
      );

      // Check that pixels were changed to blue
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, (c) => {
        const pixel = c.getImageData(
          Math.floor(canvas.width / 2),
          Math.floor(canvas.height / 2),
          1, 1
        ).data;
        return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
      });
    });

    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(255);
    expect(result.a).toBe(255);
  });

  test('does not fill if tapping on the same color', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canvas = CanvasManager.getColoringCanvas();
      const hadStepsBefore = UndoManager.hasUndoSteps();

      // Fill with white on a white canvas — should be a no-op
      FloodFill.executeFloodFillAtPoint(
        canvas.width / 2, canvas.height / 2, '#FFFFFF'
      );

      return {
        hadStepsBefore,
        hasStepsAfter: UndoManager.hasUndoSteps(),
      };
    });

    // No undo snapshot should be saved because no pixels changed
    expect(result.hadStepsBefore).toBe(false);
    expect(result.hasStepsAfter).toBe(false);
  });

  test('does not fill outside canvas bounds', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Negative coordinates — should be a no-op
      FloodFill.executeFloodFillAtPoint(-10, -10, '#FF0000');
      return UndoManager.hasUndoSteps();
    });

    expect(result).toBe(false);
  });

  test('saves undo snapshot before modifying canvas', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canvas = CanvasManager.getColoringCanvas();
      FloodFill.executeFloodFillAtPoint(10, 10, '#00FF00');
      return UndoManager.hasUndoSteps();
    });

    expect(result).toBe(true);
  });

  test('flood fill respects outline boundaries', async ({ page }) => {
    const result = await page.evaluate(() => {
      const canvas = CanvasManager.getColoringCanvas();
      const outlineCtx = CanvasManager.getOutlineContext();
      const coloringCtx = CanvasManager.getColoringContext();

      // Draw a black vertical line on the outline canvas at x=100
      CanvasManager.withNativeTransform(outlineCtx, (c) => {
        c.fillStyle = '#000000';
        c.fillRect(100, 0, 3, canvas.height);
      });

      // Fill left side of the line with red
      FloodFill.executeFloodFillAtPoint(50, 50, '#FF0000');

      // Check pixel at x=50 (should be red) and x=150 (should be white)
      return CanvasManager.withNativeTransform(coloringCtx, (c) => {
        const leftPixel = c.getImageData(50, 50, 1, 1).data;
        const rightPixel = c.getImageData(150, 50, 1, 1).data;
        return {
          leftIsRed: leftPixel[0] === 255 && leftPixel[1] === 0 && leftPixel[2] === 0,
          rightIsWhite: rightPixel[0] === 255 && rightPixel[1] === 255 && rightPixel[2] === 255,
        };
      });
    });

    expect(result.leftIsRed).toBe(true);
    expect(result.rightIsWhite).toBe(true);
  });
});
