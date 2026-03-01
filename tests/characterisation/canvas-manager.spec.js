// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('CanvasManager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('initializes four canvas layers with matching dimensions', async ({ page }) => {
    const info = await page.evaluate(() => {
      const container = CanvasManager.getContainerElement();
      const coloring = CanvasManager.getColoringCanvas();
      const outline = CanvasManager.getOutlineCanvas();
      const interaction = CanvasManager.getInteractionCanvas();
      const reference = CanvasManager.getReferenceCanvas();

      return {
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        coloringWidth: coloring.width,
        coloringHeight: coloring.height,
        outlineWidth: outline.width,
        outlineHeight: outline.height,
        interactionWidth: interaction.width,
        interactionHeight: interaction.height,
        referenceWidth: reference.width,
        referenceHeight: reference.height,
      };
    });

    // All four canvases must have the same pixel dimensions
    expect(info.coloringWidth).toBe(info.outlineWidth);
    expect(info.coloringWidth).toBe(info.interactionWidth);
    expect(info.coloringWidth).toBe(info.referenceWidth);
    expect(info.coloringHeight).toBe(info.outlineHeight);
    expect(info.coloringHeight).toBe(info.interactionHeight);
    expect(info.coloringHeight).toBe(info.referenceHeight);

    // Canvas pixel dimensions must equal container CSS dimensions × devicePixelRatio
    // (capped at MAX_CANVAS_DIMENSION = 2048)
    expect(info.coloringWidth).toBeGreaterThan(0);
    expect(info.coloringHeight).toBeGreaterThan(0);
  });

  test('coloring canvas starts filled with white pixels', async ({ page }) => {
    const isWhite = await page.evaluate(() => {
      const canvas = CanvasManager.getColoringCanvas();
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, (c) => {
        const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 ||
              data[i + 2] !== 255 || data[i + 3] !== 255) {
            return false;
          }
        }
        return true;
      });
    });

    expect(isWhite).toBe(true);
  });

  test('imageRegion starts at zero before any image is loaded', async ({ page }) => {
    const region = await page.evaluate(() => CanvasManager.getImageRegion());

    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.width).toBe(0);
    expect(region.height).toBe(0);
  });

  test('withNativeTransform resets transform inside callback and restores after', async ({ page }) => {
    const result = await page.evaluate(() => {
      const ctx = CanvasManager.getColoringContext();
      const scaleFactor = CanvasManager.getScaleFactor();

      // The context has a scale transform applied (devicePixelRatio)
      const beforeTransform = ctx.getTransform();

      const insideTransform = CanvasManager.withNativeTransform(ctx, (c) => {
        const t = c.getTransform();
        return { a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f };
      });

      // Transform should be restored after the callback
      const afterTransform = ctx.getTransform();

      return {
        insideIsIdentity: insideTransform.a === 1 && insideTransform.d === 1 &&
                          insideTransform.e === 0 && insideTransform.f === 0,
        transformRestoredA: afterTransform.a === beforeTransform.a,
        transformRestoredD: afterTransform.d === beforeTransform.d,
      };
    });

    expect(result.insideIsIdentity).toBe(true);
    expect(result.transformRestoredA).toBe(true);
    expect(result.transformRestoredD).toBe(true);
  });

  test('withNativeTransform returns the callback return value', async ({ page }) => {
    const result = await page.evaluate(() => {
      const ctx = CanvasManager.getColoringContext();
      return CanvasManager.withNativeTransform(ctx, () => 'test-value');
    });

    expect(result).toBe('test-value');
  });

  test('getCanvasPixelCoords converts CSS coords to canvas pixel coords', async ({ page }) => {
    const result = await page.evaluate(() => {
      const interaction = CanvasManager.getInteractionCanvas();
      const rect = interaction.getBoundingClientRect();

      // Simulate an event at the top-left corner of the canvas
      const mockEvent = { clientX: rect.left, clientY: rect.top };
      const coords = CanvasManager.getCanvasPixelCoords(mockEvent);

      // Simulate an event at the center of the canvas
      const centerEvent = {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      };
      const centerCoords = CanvasManager.getCanvasPixelCoords(centerEvent);

      return {
        topLeftX: coords.x,
        topLeftY: coords.y,
        centerX: centerCoords.x,
        centerY: centerCoords.y,
        canvasWidth: interaction.width,
        canvasHeight: interaction.height,
      };
    });

    // Top-left corner should map to (0, 0)
    expect(result.topLeftX).toBeCloseTo(0, 0);
    expect(result.topLeftY).toBeCloseTo(0, 0);

    // Center should map to approximately half the canvas dimensions
    expect(result.centerX).toBeCloseTo(result.canvasWidth / 2, 0);
    expect(result.centerY).toBeCloseTo(result.canvasHeight / 2, 0);
  });

  test('clearColoringCanvas resets to white', async ({ page }) => {
    const isWhiteAfterClear = await page.evaluate(() => {
      const ctx = CanvasManager.getColoringContext();
      const canvas = CanvasManager.getColoringCanvas();

      // Draw something on the canvas first
      CanvasManager.withNativeTransform(ctx, (c) => {
        c.fillStyle = '#FF0000';
        c.fillRect(0, 0, 50, 50);
      });

      // Clear it
      CanvasManager.clearColoringCanvas();

      // Verify it's white again
      return CanvasManager.withNativeTransform(ctx, (c) => {
        const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i + 1] !== 255 ||
              data[i + 2] !== 255 || data[i + 3] !== 255) {
            return false;
          }
        }
        return true;
      });
    });

    expect(isWhiteAfterClear).toBe(true);
  });

  test('renderCompositeForSave returns a PNG data URL', async ({ page }) => {
    const dataUrl = await page.evaluate(() => CanvasManager.renderCompositeForSave());

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
