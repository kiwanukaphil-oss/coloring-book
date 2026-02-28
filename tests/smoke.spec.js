const path = require('path');
const { test, expect } = require('@playwright/test');

async function loadDefaultColoringPage(page) {
  await page.goto('/index.html');
  const firstGalleryItem = page.locator('.gallery-item').first();
  await expect(firstGalleryItem).toBeVisible();
  await firstGalleryItem.click();
  await page.waitForFunction(() => {
    const region = window.CanvasManager?.getImageRegion?.();
    return !!region && region.width > 0 && region.height > 0;
  });
}

test('app boots and exposes both upload actions', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#image-gallery-modal')).toBeVisible();
  await expect(page.locator('#upload-input')).toBeAttached();
  await expect(page.locator('#reference-upload-input')).toBeAttached();
});

test('brush stroke is undoable', async ({ page }) => {
  await loadDefaultColoringPage(page);

  await page.click('#tool-brush');
  const canvas = page.locator('#interaction-canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  const beforeStroke = await page.evaluate(() => {
    return window.CanvasManager.getColoringCanvas().toDataURL('image/png');
  });

  const startX = box.x + box.width * 0.3;
  const startY = box.y + box.height * 0.3;
  const endX = startX + 60;
  const endY = startY + 40;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();

  const afterStroke = await page.evaluate(() => {
    return window.CanvasManager.getColoringCanvas().toDataURL('image/png');
  });
  expect(afterStroke).not.toBe(beforeStroke);

  await page.click('#tool-undo');
  await page.waitForTimeout(120);

  const afterUndo = await page.evaluate(() => {
    return window.CanvasManager.getColoringCanvas().toDataURL('image/png');
  });
  expect(afterUndo).toBe(beforeStroke);
});

test('reference panel upload, move, and resize works', async ({ page }) => {
  await page.goto('/index.html');

  const referenceFile = path.resolve(__dirname, '../images/coloring-pages/cat.svg');
  await page.setInputFiles('#reference-upload-input', referenceFile);

  const panel = page.locator('#reference-panel');
  await expect(panel).toBeVisible();

  const beforeMove = await panel.boundingBox();
  expect(beforeMove).toBeTruthy();

  const handle = page.locator('#reference-panel-handle');
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();

  await page.mouse.move(handleBox.x + 20, handleBox.y + 18);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 100, handleBox.y + 80, { steps: 10 });
  await page.mouse.up();

  const afterMove = await panel.boundingBox();
  expect(afterMove.x).not.toBe(beforeMove.x);
  expect(afterMove.y).not.toBe(beforeMove.y);

  const resizeHandle = page.locator('#reference-panel-resize');
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).toBeTruthy();

  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 70, resizeBox.y + 60, { steps: 8 });
  await page.mouse.up();

  const afterResize = await panel.boundingBox();
  expect(afterResize.width).toBeGreaterThan(afterMove.width);
  expect(afterResize.height).toBeGreaterThan(afterMove.height);
});

test('drawing persists through viewport resize', async ({ page }) => {
  await loadDefaultColoringPage(page);

  await page.click('#tool-brush');
  const canvas = page.locator('#interaction-canvas');
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();

  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.4, { steps: 10 });
  await page.mouse.up();

  const hasInkBeforeResize = await page.evaluate(() => {
    const canvasEl = window.CanvasManager.getColoringCanvas();
    const ctx = window.CanvasManager.getColoringContext();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    ctx.restore();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!(r === 255 && g === 255 && b === 255)) return true;
    }
    return false;
  });
  expect(hasInkBeforeResize).toBe(true);

  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(200);

  const hasInkAfterResize = await page.evaluate(() => {
    const canvasEl = window.CanvasManager.getColoringCanvas();
    const ctx = window.CanvasManager.getColoringContext();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
    ctx.restore();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (!(r === 255 && g === 255 && b === 255)) return true;
    }
    return false;
  });
  expect(hasInkAfterResize).toBe(true);
});
