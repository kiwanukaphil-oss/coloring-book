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
});
