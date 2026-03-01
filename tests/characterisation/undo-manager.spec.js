// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('UndoManager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('starts with no undo steps', async ({ page }) => {
    const hasSteps = await page.evaluate(() => UndoManager.hasUndoSteps());
    expect(hasSteps).toBe(false);
  });

  test('saveSnapshot adds an undo step', async ({ page }) => {
    const result = await page.evaluate(() => {
      UndoManager.saveSnapshot();
      return UndoManager.hasUndoSteps();
    });
    expect(result).toBe(true);
  });

  test('undoLastAction returns false when stack is empty', async ({ page }) => {
    const result = await page.evaluate(() => UndoManager.undoLastAction());
    expect(result).toBe(false);
  });

  test('undoLastAction restores previous canvas state', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const ctx = CanvasManager.getColoringContext();
      const canvas = CanvasManager.getColoringCanvas();

      // Capture the initial white state
      const initialData = CanvasManager.withNativeTransform(ctx, (c) => {
        return c.getImageData(0, 0, canvas.width, canvas.height).data.slice(0, 16);
      });

      // Save a snapshot of the white canvas
      UndoManager.saveSnapshot();

      // Draw a red rectangle
      CanvasManager.withNativeTransform(ctx, (c) => {
        c.fillStyle = '#FF0000';
        c.fillRect(0, 0, 50, 50);
      });

      // Verify red was drawn
      const afterDraw = CanvasManager.withNativeTransform(ctx, (c) => {
        return c.getImageData(0, 0, 1, 1).data.slice(0, 4);
      });

      // Undo — should restore to white
      const undoResult = await UndoManager.undoLastAction();

      // Check the pixel is white again
      const afterUndo = CanvasManager.withNativeTransform(ctx, (c) => {
        return c.getImageData(0, 0, 1, 1).data.slice(0, 4);
      });

      return {
        drewRed: afterDraw[0] === 255 && afterDraw[1] === 0 && afterDraw[2] === 0,
        undoResult: undoResult,
        restoredWhite: afterUndo[0] === 255 && afterUndo[1] === 255 && afterUndo[2] === 255,
        noMoreSteps: !UndoManager.hasUndoSteps(),
      };
    });

    expect(result.drewRed).toBe(true);
    expect(result.undoResult).toBe(true);
    expect(result.restoredWhite).toBe(true);
    expect(result.noMoreSteps).toBe(true);
  });

  test('clearHistory removes all undo steps', async ({ page }) => {
    const result = await page.evaluate(() => {
      UndoManager.saveSnapshot();
      UndoManager.saveSnapshot();
      UndoManager.saveSnapshot();
      const hadSteps = UndoManager.hasUndoSteps();
      UndoManager.clearHistory();
      return {
        hadSteps,
        hasStepsAfterClear: UndoManager.hasUndoSteps(),
      };
    });

    expect(result.hadSteps).toBe(true);
    expect(result.hasStepsAfterClear).toBe(false);
  });

  test('stack is capped at 10 snapshots', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Push 15 snapshots
      for (let i = 0; i < 15; i++) {
        UndoManager.saveSnapshot();
      }

      // Pop them all and count how many come back
      let count = 0;
      while (UndoManager.hasUndoSteps()) {
        // undoLastAction is async but returns Promise<true> for each pop
        count++;
        // We can't await here in a sync loop, so just check hasUndoSteps
        // by calling the synchronous internal check
        UndoManager.undoLastAction(); // fire-and-forget
      }
      return count;
    });

    expect(result).toBe(10);
  });
});
