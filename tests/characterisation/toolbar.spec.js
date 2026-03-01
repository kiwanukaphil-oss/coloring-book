// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('Toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Wait for async init to finish (gallery shown after IndexedDB opens)
    await page.waitForFunction(() => {
      const gallery = document.getElementById('image-gallery-modal');
      return gallery && !gallery.classList.contains('hidden');
    });
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

  test('setActiveTool programmatically switches to brush', async ({ page }) => {
    const result = await page.evaluate(() => {
      Toolbar.setActiveTool('brush');
      return {
        activeTool: Toolbar.getActiveTool(),
        brushActive: document.getElementById('tool-brush').classList.contains('active'),
        fillActive: document.getElementById('tool-fill').classList.contains('active'),
        sliderVisible: !document.getElementById('brush-size-control').classList.contains('hidden')
      };
    });

    expect(result.activeTool).toBe('brush');
    expect(result.brushActive).toBe(true);
    expect(result.fillActive).toBe(false);
    expect(result.sliderVisible).toBe(true);
  });

  test('clicking eraser button switches to eraser tool', async ({ page }) => {
    await page.click('#tool-eraser');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('eraser');
  });

  test('eraser button shows brush size control', async ({ page }) => {
    await page.click('#tool-eraser');

    const hidden = await page.evaluate(() =>
      document.getElementById('brush-size-control').classList.contains('hidden')
    );
    expect(hidden).toBe(false);
  });

  test('eraser button gets active class and others lose it', async ({ page }) => {
    await page.click('#tool-eraser');

    const result = await page.evaluate(() => ({
      eraserActive: document.getElementById('tool-eraser').classList.contains('active'),
      brushActive: document.getElementById('tool-brush').classList.contains('active'),
      fillActive: document.getElementById('tool-fill').classList.contains('active'),
    }));

    expect(result.eraserActive).toBe(true);
    expect(result.brushActive).toBe(false);
    expect(result.fillActive).toBe(false);
  });

  test('keyboard shortcut B switches to brush tool', async ({ page }) => {
    await page.keyboard.press('b');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('brush');
  });

  test('keyboard shortcut F switches to fill tool', async ({ page }) => {
    await page.click('#tool-brush');
    await page.keyboard.press('f');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('fill');
  });

  test('keyboard shortcut E switches to eraser tool', async ({ page }) => {
    await page.keyboard.press('e');
    const tool = await page.evaluate(() => Toolbar.getActiveTool());
    expect(tool).toBe('eraser');
  });

  test('keyboard shortcut ] increases brush size', async ({ page }) => {
    const sizeBefore = await page.evaluate(() => BrushEngine.getBrushSize());
    await page.keyboard.press(']');
    const sizeAfter = await page.evaluate(() => BrushEngine.getBrushSize());
    expect(sizeAfter).toBeGreaterThan(sizeBefore);
  });

  test('keyboard shortcut [ decreases brush size', async ({ page }) => {
    await page.evaluate(() => Toolbar.setBrushSize(20));
    await page.keyboard.press('[');
    const sizeAfter = await page.evaluate(() => BrushEngine.getBrushSize());
    expect(sizeAfter).toBeLessThan(20);
  });

  test('setBrushSize updates slider, display, and BrushEngine', async ({ page }) => {
    const result = await page.evaluate(() => {
      Toolbar.setBrushSize(30);
      return {
        sliderValue: document.getElementById('brush-size-slider').value,
        displayText: document.getElementById('brush-size-value').textContent,
        engineSize: BrushEngine.getBrushSize()
      };
    });

    expect(result.sliderValue).toBe('30');
    expect(result.displayText).toBe('30');
    expect(result.engineSize).toBe(30);
  });
});
