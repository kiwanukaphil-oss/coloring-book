// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('BrushEngine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('default brush size is 12', async ({ page }) => {
    const size = await page.evaluate(() => BrushEngine.getBrushSize());
    expect(size).toBe(12);
  });

  test('setBrushSize changes the brush size', async ({ page }) => {
    const result = await page.evaluate(() => {
      BrushEngine.setBrushSize(24);
      return BrushEngine.getBrushSize();
    });
    expect(result).toBe(24);
  });

  test('brush stroke modifies canvas pixels when brush tool is active', async ({ page }) => {
    // Close gallery first
    await page.evaluate(() => ImageLoader.hideGallery());

    // Switch to brush tool
    await page.click('#tool-brush');

    const canvas = page.locator('#interaction-canvas');
    const box = await canvas.boundingBox();

    // Capture canvas state before stroke
    const before = await page.evaluate(() => {
      const c = CanvasManager.getColoringCanvas();
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, (ct) => {
        const data = ct.getImageData(0, 0, c.width, c.height).data;
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
            nonWhite++;
          }
        }
        return nonWhite;
      });
    });

    // Draw a brush stroke
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 100, { steps: 5 });
    await page.mouse.up();

    // Capture canvas state after stroke
    const after = await page.evaluate(() => {
      const c = CanvasManager.getColoringCanvas();
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, (ct) => {
        const data = ct.getImageData(0, 0, c.width, c.height).data;
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
            nonWhite++;
          }
        }
        return nonWhite;
      });
    });

    expect(before).toBe(0);
    expect(after).toBeGreaterThan(0);
  });

  test('brush stroke saves an undo snapshot', async ({ page }) => {
    await page.evaluate(() => ImageLoader.hideGallery());
    await page.click('#tool-brush');

    const hadStepsBefore = await page.evaluate(() => UndoManager.hasUndoSteps());

    const canvas = page.locator('#interaction-canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 150, box.y + 100, { steps: 3 });
    await page.mouse.up();

    const hasStepsAfter = await page.evaluate(() => UndoManager.hasUndoSteps());

    expect(hadStepsBefore).toBe(false);
    expect(hasStepsAfter).toBe(true);
  });

  test('brush stroke does not paint on outline pixels (ADR-008)', async ({ page }) => {
    // Load a coloring page so the outline mask is computed
    const firstItem = page.locator('.gallery-item').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0 && region.height > 0;
    });

    // Verify the outline mask was computed
    const hasMask = await page.evaluate(() => CanvasManager.getOutlineMask() !== null);
    expect(hasMask).toBe(true);

    // Find outline pixel positions on the coloring canvas
    const outlineInfo = await page.evaluate(() => {
      const mask = CanvasManager.getOutlineMask();
      const width = CanvasManager.getColoringCanvas().width;
      let outlinePixelCount = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 1) outlinePixelCount++;
      }
      return { outlinePixelCount, width };
    });
    expect(outlineInfo.outlinePixelCount).toBeGreaterThan(0);

    // Switch to brush and draw a large stroke across the canvas
    await page.click('#tool-brush');
    await page.evaluate(() => BrushEngine.setBrushSize(40));

    const canvas = page.locator('#interaction-canvas');
    const box = await canvas.boundingBox();

    // Draw a horizontal stroke across the middle of the canvas
    const startX = box.x + box.width * 0.1;
    const endX = box.x + box.width * 0.9;
    const midY = box.y + box.height * 0.5;

    await page.mouse.move(startX, midY);
    await page.mouse.down();
    await page.mouse.move(endX, midY, { steps: 20 });
    await page.mouse.up();

    // Check that outline pixels on the coloring canvas are still white
    const outlinePixelsAreWhite = await page.evaluate(() => {
      const mask = CanvasManager.getOutlineMask();
      const c = CanvasManager.getColoringCanvas();
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, (ct) => {
        const data = ct.getImageData(0, 0, c.width, c.height).data;
        let outlinesPaintedOver = 0;
        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === 1) {
            const idx = i * 4;
            const isWhite = data[idx] === 255 && data[idx + 1] === 255 && data[idx + 2] === 255;
            if (!isWhite) outlinesPaintedOver++;
          }
        }
        return outlinesPaintedOver;
      });
    });

    expect(outlinePixelsAreWhite).toBe(0);
  });
});
