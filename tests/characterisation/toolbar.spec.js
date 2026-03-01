// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.evaluate(() => ImageLoader.hideGallery());
  });

  test('default active tool is fill', async ({ page }) => {
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('fill');
  });

  test('clicking brush button switches to brush tool', async ({ page }) => {
    await page.click('#tool-brush');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('brush');
  });

  test('clicking fill button switches back to fill tool', async ({ page }) => {
    await page.click('#tool-brush');
    await page.click('#tool-fill');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('fill');
  });

  test('brush button shows brush size control', async ({ page }) => {
    const hiddenBefore = await page.evaluate(() =>
      document.getElementById('brush-size-control').classList.contains('hidden')
    );

    await page.click('#tool-brush');

    const hiddenAfter = await page.evaluate(() =>
      document.getElementById('brush-size-control').classList.contains('hidden')
    );

    expect(hiddenBefore).toBe(true);
    expect(hiddenAfter).toBe(false);
  });

  test('fill button hides brush size control', async ({ page }) => {
    await page.click('#tool-brush');
    await page.click('#tool-fill');

    const hidden = await page.evaluate(() =>
      document.getElementById('brush-size-control').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });

  test('active button gets active class, inactive loses it', async ({ page }) => {
    await page.click('#tool-brush');

    const result = await page.evaluate(() => ({
      brushActive: document.getElementById('tool-brush').classList.contains('active'),
      fillActive: document.getElementById('tool-fill').classList.contains('active'),
    }));

    expect(result.brushActive).toBe(true);
    expect(result.fillActive).toBe(false);
  });

  test('clear button shows confirmation modal', async ({ page }) => {
    await page.click('#tool-clear');

    const visible = await page.evaluate(() =>
      !document.getElementById('clear-confirm-modal').classList.contains('hidden')
    );
    expect(visible).toBe(true);
  });

  test('confirming clear saves snapshot and clears canvas', async ({ page }) => {
    // Draw something first so there's a visible change
    await page.evaluate(() => {
      const ctx = CanvasManager.getColoringContext();
      CanvasManager.withNativeTransform(ctx, (c) => {
        c.fillStyle = '#FF0000';
        c.fillRect(0, 0, 50, 50);
      });
    });

    await page.click('#tool-clear');
    await page.click('#clear-confirm-yes');

    const result = await page.evaluate(() => ({
      hasUndoSteps: UndoManager.hasUndoSteps(),
      modalHidden: document.getElementById('clear-confirm-modal').classList.contains('hidden'),
    }));

    expect(result.hasUndoSteps).toBe(true);
    expect(result.modalHidden).toBe(true);
  });

  test('cancelling clear dismisses modal without clearing', async ({ page }) => {
    await page.click('#tool-clear');
    await page.click('#clear-confirm-no');

    const hidden = await page.evaluate(() =>
      document.getElementById('clear-confirm-modal').classList.contains('hidden')
    );
    expect(hidden).toBe(true);
  });
});
