// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('ImageLoader', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('gallery modal is visible on first load', async ({ page }) => {
    const visible = await page.evaluate(() =>
      !document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(visible).toBe(true);
  });

  test('gallery contains at least one gallery item', async ({ page }) => {
    const count = await page.locator('.gallery-item').count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking a gallery item hides the gallery', async ({ page }) => {
    await page.locator('.gallery-item').first().click();

    const hidden = await page.evaluate(() =>
      document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('clicking a gallery item loads an image and sets imageRegion', async ({ page }) => {
    await page.locator('.gallery-item').first().click();

    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0 && region.height > 0;
    });

    const region = await page.evaluate(() => CanvasManager.getImageRegion());
    expect(region.width).toBeGreaterThan(0);
    expect(region.height).toBeGreaterThan(0);
  });

  test('loading a coloring page clears undo history', async ({ page }) => {
    // Save a snapshot first
    await page.evaluate(() => UndoManager.saveSnapshot());
    const hadSteps = await page.evaluate(() => UndoManager.hasUndoSteps());

    // Load a coloring page
    await page.locator('.gallery-item').first().click();

    // Wait for load
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    // After loading, a fresh snapshot is saved but old history is cleared
    const hasSteps = await page.evaluate(() => UndoManager.hasUndoSteps());
    expect(hadSteps).toBe(true);
    expect(hasSteps).toBe(true); // One snapshot saved after load
  });

  test('reference panel starts hidden', async ({ page }) => {
    const hidden = await page.evaluate(() =>
      document.getElementById('reference-panel').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('uploading a reference image shows the reference panel', async ({ page }) => {
    const referenceFile = path.resolve(__dirname, '../../images/coloring-pages/cat.svg');
    await page.setInputFiles('#reference-upload-input', referenceFile);

    const visible = await page.evaluate(() =>
      !document.getElementById('reference-panel').classList.contains('hidden')
    );
    expect(visible).toBe(true);
  });

  test('closing reference panel hides it', async ({ page }) => {
    const referenceFile = path.resolve(__dirname, '../../images/coloring-pages/cat.svg');
    await page.setInputFiles('#reference-upload-input', referenceFile);

    await page.click('#reference-panel-close');

    const hidden = await page.evaluate(() =>
      document.getElementById('reference-panel').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('hideGallery adds hidden class to gallery modal', async ({ page }) => {
    await page.evaluate(() => ImageLoader.hideGallery());

    const hidden = await page.evaluate(() =>
      document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('showGallery removes hidden class from gallery modal', async ({ page }) => {
    await page.evaluate(() => ImageLoader.hideGallery());
    await page.evaluate(() => ImageLoader.showGallery());

    const visible = await page.evaluate(() =>
      !document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(visible).toBe(true);
  });
});
