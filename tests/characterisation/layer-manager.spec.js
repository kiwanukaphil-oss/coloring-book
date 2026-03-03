// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('LayerManager', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html?classic=1');
        // Wait for app to initialize and LayerManager to be ready
        await page.waitForFunction(() => typeof LayerManager !== 'undefined' &&
            LayerManager.getLayerCount() > 0);
    });

    test('initially has exactly 1 layer', async ({ page }) => {
        const count = await page.evaluate(() => LayerManager.getLayerCount());
        expect(count).toBe(1);
    });

    test('initially has layer-0 as the active layer', async ({ page }) => {
        const index = await page.evaluate(() => LayerManager.getActiveLayerIndex());
        expect(index).toBe(0);
    });

    test('addLayer creates a second layer and returns its index', async ({ page }) => {
        const result = await page.evaluate(() => LayerManager.addLayer());
        const count = await page.evaluate(() => LayerManager.getLayerCount());
        expect(result).toBe(1);
        expect(count).toBe(2);
    });

    test('cannot add more than 5 layers', async ({ page }) => {
        await page.evaluate(() => {
            // Add layers until limit
            LayerManager.addLayer(); // 2
            LayerManager.addLayer(); // 3
            LayerManager.addLayer(); // 4
            LayerManager.addLayer(); // 5
        });

        const count = await page.evaluate(() => LayerManager.getLayerCount());
        expect(count).toBe(5);

        const result = await page.evaluate(() => LayerManager.addLayer());
        expect(result).toBe(false);

        const finalCount = await page.evaluate(() => LayerManager.getLayerCount());
        expect(finalCount).toBe(5);
    });

    test('setActiveLayer changes the active layer index', async ({ page }) => {
        await page.evaluate(() => LayerManager.addLayer());
        await page.evaluate(() => LayerManager.setActiveLayer(1));

        const index = await page.evaluate(() => LayerManager.getActiveLayerIndex());
        expect(index).toBe(1);
    });

    test('getActiveLayerCanvas returns a canvas element', async ({ page }) => {
        const result = await page.evaluate(() => {
            const canvas = LayerManager.getActiveLayerCanvas();
            return canvas instanceof HTMLCanvasElement;
        });
        expect(result).toBe(true);
    });

    test('getActiveLayerContext returns a CanvasRenderingContext2D', async ({ page }) => {
        const result = await page.evaluate(() => {
            const ctx = LayerManager.getActiveLayerContext();
            return ctx instanceof CanvasRenderingContext2D;
        });
        expect(result).toBe(true);
    });

    test('deleteLayer removes a layer and count decreases', async ({ page }) => {
        await page.evaluate(() => {
            LayerManager.addLayer();
            LayerManager.addLayer();
        });

        const countBefore = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countBefore).toBe(3);

        await page.evaluate(() => LayerManager.deleteLayer(1));

        const countAfter = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countAfter).toBe(2);
    });

    test('cannot delete the last remaining layer', async ({ page }) => {
        await page.evaluate(() => LayerManager.deleteLayer(0));

        const count = await page.evaluate(() => LayerManager.getLayerCount());
        expect(count).toBe(1);
    });

    test('setLayerVisibility updates the visible property', async ({ page }) => {
        await page.evaluate(() => LayerManager.setLayerVisibility(0, false));
        const visible = await page.evaluate(() => LayerManager.getLayerAt(0).visible);
        expect(visible).toBe(false);

        await page.evaluate(() => LayerManager.setLayerVisibility(0, true));
        const visibleAfter = await page.evaluate(() => LayerManager.getLayerAt(0).visible);
        expect(visibleAfter).toBe(true);
    });

    test('setLayerOpacity clamps to 0-1 and updates the opacity property', async ({ page }) => {
        await page.evaluate(() => LayerManager.setLayerOpacity(0, 0.5));
        const opacity = await page.evaluate(() => LayerManager.getLayerAt(0).opacity);
        expect(opacity).toBeCloseTo(0.5, 2);

        await page.evaluate(() => LayerManager.setLayerOpacity(0, 1.5));
        const clamped = await page.evaluate(() => LayerManager.getLayerAt(0).opacity);
        expect(clamped).toBe(1);
    });

    test('compositeAllLayers returns an HTMLCanvasElement', async ({ page }) => {
        const result = await page.evaluate(() => {
            const offscreen = LayerManager.compositeAllLayers();
            return offscreen instanceof HTMLCanvasElement;
        });
        expect(result).toBe(true);
    });

    test('compositeAllLayers excludes hidden layers', async ({ page }) => {
        // Paint layer-0 red then hide it; composite should be white
        const pixelColor = await page.evaluate(() => {
            const activeCtx = LayerManager.getActiveLayerContext();
            const activeCanvas = LayerManager.getActiveLayerCanvas();

            // Paint the active layer red
            activeCtx.save();
            activeCtx.setTransform(1, 0, 0, 1, 0, 0);
            activeCtx.fillStyle = 'red';
            activeCtx.fillRect(0, 0, activeCanvas.width, activeCanvas.height);
            activeCtx.restore();

            // Hide layer-0
            LayerManager.setLayerVisibility(0, false);

            // Composite — should have no visible pixels from layer-0
            const composite = LayerManager.compositeAllLayers();
            const ctx = composite.getContext('2d');
            const pixel = ctx.getImageData(0, 0, 1, 1).data;
            return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
        });

        // Hidden layer-0 means composite has transparent/empty content
        expect(pixelColor.a).toBe(0);
    });

    test('CanvasManager.getColoringCanvas proxies to LayerManager active layer', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cmCanvas = CanvasManager.getColoringCanvas();
            const lmCanvas = LayerManager.getActiveLayerCanvas();
            return cmCanvas === lmCanvas;
        });
        expect(result).toBe(true);
    });

    test('CanvasManager.getColoringContext proxies to LayerManager active layer', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cmCtx = CanvasManager.getColoringContext();
            const lmCtx = LayerManager.getActiveLayerContext();
            return cmCtx === lmCtx;
        });
        expect(result).toBe(true);
    });

    test('switching active layer changes CanvasManager proxy target', async ({ page }) => {
        await page.evaluate(() => LayerManager.addLayer());
        await page.evaluate(() => LayerManager.setActiveLayer(1));

        const result = await page.evaluate(() => {
            const cmCtx = CanvasManager.getColoringContext();
            const layer1Ctx = LayerManager.getLayerAt(1).ctx;
            return cmCtx === layer1Ctx;
        });
        expect(result).toBe(true);
    });

    // getLayerSnapshot / insertLayer (ADR-026)

    test('getLayerSnapshot returns null for an invalid index', async ({ page }) => {
        const result = await page.evaluate(() => LayerManager.getLayerSnapshot(-1));
        expect(result).toBeNull();
    });

    test('getLayerSnapshot returns an object with expected fields for layer 0', async ({ page }) => {
        const snapshot = await page.evaluate(() => {
            const s = LayerManager.getLayerSnapshot(0);
            return {
                hasCanvasData: s.canvasData instanceof HTMLCanvasElement,
                name: s.name,
                visible: s.visible,
                opacityIsNumber: typeof s.opacity === 'number',
                scaleFactorIsPositive: s.scaleFactor > 0
            };
        });
        expect(snapshot.hasCanvasData).toBe(true);
        expect(snapshot.name).toBe('Layer 1');
        expect(snapshot.visible).toBe(true);
        expect(snapshot.opacityIsNumber).toBe(true);
        expect(snapshot.scaleFactorIsPositive).toBe(true);
    });

    test('insertLayer increases layer count by 1', async ({ page }) => {
        await page.evaluate(() => LayerManager.addLayer()); // now 2 layers
        const countBefore = await page.evaluate(() => LayerManager.getLayerCount());

        await page.evaluate(() => {
            const snapshot = LayerManager.getLayerSnapshot(0);
            LayerManager.insertLayer(1, snapshot);
        });

        const countAfter = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countAfter).toBe(countBefore + 1);
    });

    test('insertLayer then deleteLayer round-trips to original count', async ({ page }) => {
        const countBefore = await page.evaluate(() => LayerManager.getLayerCount());

        await page.evaluate(() => {
            const snapshot = LayerManager.getLayerSnapshot(0);
            LayerManager.insertLayer(0, snapshot);
            LayerManager.deleteLayer(0);
        });

        const countAfter = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countAfter).toBe(countBefore);
    });

    test('layer-delete undo via CommandManager restores layer count', async ({ page }) => {
        await page.evaluate(() => LayerManager.addLayer()); // 2 layers

        const countBefore = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countBefore).toBe(2);

        // Simulate what LayerPanel does: snapshot → command → delete
        await page.evaluate(() => {
            const snapshot = LayerManager.getLayerSnapshot(1);
            CommandManager.pushCommand(
                CommandManager.createLayerDeleteCommand(1, snapshot)
            );
            LayerManager.deleteLayer(1);
        });

        const countAfterDelete = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countAfterDelete).toBe(1);

        // Undo restores the deleted layer
        await page.evaluate(() => CommandManager.undoCommand());

        const countAfterUndo = await page.evaluate(() => LayerManager.getLayerCount());
        expect(countAfterUndo).toBe(2);

        // Verify the restored layer has accessible pixel data (canvas is real, not a stub)
        const hasRestoredLayerPixelData = await page.evaluate(() => {
            const layer = LayerManager.getLayerAt(1);
            const pixel = layer.canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
            return pixel.length === 4;
        });
        expect(hasRestoredLayerPixelData).toBe(true);
    });
});
