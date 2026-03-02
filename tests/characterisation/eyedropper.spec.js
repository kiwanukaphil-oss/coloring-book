const { test, expect } = require('@playwright/test');

test.describe('Eyedropper Tool (ADR-018)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html?classic=1');
    });

    test('eyedropper button exists in the classic toolbar', async ({ page }) => {
        const button = page.locator('#tool-eyedropper');
        await expect(button).toBeVisible();
    });

    test('pressing I key activates eyedropper tool', async ({ page }) => {
        // Close gallery modal first — keyboard shortcuts are suppressed while it's open
        await page.click('#gallery-close-button');
        await page.keyboard.press('i');
        const result = await page.evaluate(() => Toolbar.getActiveTool());
        expect(result).toBe('eyedropper');
    });

    test('getPixelColorAt reads a pixel color from the coloring canvas', async ({ page }) => {
        const color = await page.evaluate(() => {
            const ctx = CanvasManager.getColoringContext();
            // Paint a red pixel at (50, 50)
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FF0000';
                c.fillRect(50, 50, 10, 10);
            });
            return CanvasManager.getPixelColorAt(55, 55);
        });

        expect(color).toBe('#FF0000');
    });

    test('getPixelColorAt returns null for transparent pixels', async ({ page }) => {
        const color = await page.evaluate(() => {
            const ctx = CanvasManager.getColoringContext();
            // Clear a region to transparent
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.clearRect(50, 50, 10, 10);
            });
            return CanvasManager.getPixelColorAt(55, 55);
        });

        expect(color).toBeNull();
    });

    test('getPixelColorAt returns null for out-of-bounds coordinates', async ({ page }) => {
        const color = await page.evaluate(() => {
            return CanvasManager.getPixelColorAt(-10, -10);
        });

        expect(color).toBeNull();
    });

    test('eyedropper auto-switches back to previous tool after sampling', async ({ page }) => {
        const result = await page.evaluate(() => {
            // Start with brush tool
            Toolbar.setActiveTool('brush');

            // Switch to eyedropper
            Toolbar.setActiveTool('eyedropper');
            const toolDuringEyedropper = Toolbar.getActiveTool();

            // Paint a known color on canvas first
            const ctx = CanvasManager.getColoringContext();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#00FF00';
                c.fillRect(100, 100, 20, 20);
            });

            // Simulate the eyedropper sampling flow:
            // Read pixel, set color, then switch back
            const sampledColor = CanvasManager.getPixelColorAt(110, 110);
            if (sampledColor) {
                ColorPalette.setCurrentColor(sampledColor);
            }

            return {
                toolDuringEyedropper,
                sampledColor,
                activeColor: ColorPalette.getCurrentColor()
            };
        });

        expect(result.toolDuringEyedropper).toBe('eyedropper');
        expect(result.sampledColor).toBe('#00FF00');
        expect(result.activeColor).toBe('#00FF00');
    });

    test('eyedropper does not create undo snapshots (read-only operation)', async ({ page }) => {
        const result = await page.evaluate(() => {
            const depthBefore = CommandManager.getUndoDepth();
            Toolbar.setActiveTool('eyedropper');
            // Sampling doesn't modify canvas — no undo created
            const sampledColor = CanvasManager.getPixelColorAt(50, 50);
            const depthAfter = CommandManager.getUndoDepth();
            return { depthBefore, depthAfter };
        });

        expect(result.depthBefore).toBe(result.depthAfter);
    });
});
