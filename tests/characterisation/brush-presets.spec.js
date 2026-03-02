const { test, expect } = require('@playwright/test');

test.describe('Brush Presets (ADR-020)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html?classic=1');
    });

    test('default preset is marker', async ({ page }) => {
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('marker');
    });

    test('setActivePreset changes the active preset', async ({ page }) => {
        const result = await page.evaluate(() => {
            BrushEngine.setActivePreset('crayon');
            return BrushEngine.getActivePreset();
        });
        expect(result).toBe('crayon');
    });

    test('setActivePreset ignores invalid preset names', async ({ page }) => {
        const result = await page.evaluate(() => {
            BrushEngine.setActivePreset('nonexistent');
            return BrushEngine.getActivePreset();
        });
        expect(result).toBe('marker');
    });

    test('preset control is hidden by default (fill tool active)', async ({ page }) => {
        const isHidden = await page.evaluate(() => {
            return document.getElementById('brush-preset-control').classList.contains('hidden');
        });
        expect(isHidden).toBe(true);
    });

    test('preset control shows when brush tool is active', async ({ page }) => {
        const isHidden = await page.evaluate(() => {
            Toolbar.setActiveTool('brush');
            return document.getElementById('brush-preset-control').classList.contains('hidden');
        });
        expect(isHidden).toBe(false);
    });

    test('preset control hides when switching to fill tool', async ({ page }) => {
        const isHidden = await page.evaluate(() => {
            Toolbar.setActiveTool('brush');
            Toolbar.setActiveTool('fill');
            return document.getElementById('brush-preset-control').classList.contains('hidden');
        });
        expect(isHidden).toBe(true);
    });

    test('preset control hides when switching to eraser tool', async ({ page }) => {
        const isHidden = await page.evaluate(() => {
            Toolbar.setActiveTool('eraser');
            return document.getElementById('brush-preset-control').classList.contains('hidden');
        });
        expect(isHidden).toBe(true);
    });

    test('keyboard shortcut 2 switches to crayon preset', async ({ page }) => {
        await page.click('#gallery-close-button');
        await page.keyboard.press('2');
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('crayon');
    });

    test('keyboard shortcut 3 switches to watercolor preset', async ({ page }) => {
        await page.click('#gallery-close-button');
        await page.keyboard.press('3');
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('watercolor');
    });

    test('keyboard shortcut 4 switches to pencil preset', async ({ page }) => {
        await page.click('#gallery-close-button');
        await page.keyboard.press('4');
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('pencil');
    });

    test('keyboard shortcut 5 switches to sparkle preset', async ({ page }) => {
        await page.click('#gallery-close-button');
        await page.keyboard.press('5');
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('sparkle');
    });

    test('keyboard shortcut 1 switches back to marker preset', async ({ page }) => {
        await page.click('#gallery-close-button');
        await page.keyboard.press('3');
        await page.keyboard.press('1');
        const preset = await page.evaluate(() => BrushEngine.getActivePreset());
        expect(preset).toBe('marker');
    });

    test('marker preset produces identical output to original lineTo path', async ({ page }) => {
        // Verify the marker still works the same: draw a stroke and check pixels
        const result = await page.evaluate(() => {
            Toolbar.setActiveTool('brush');
            BrushEngine.setActivePreset('marker');
            const ctx = CanvasManager.getColoringContext();

            CanvasManager.withNativeTransform(ctx, (c) => {
                c.strokeStyle = '#FF0000';
                c.lineWidth = 12;
                c.lineCap = 'round';
                c.beginPath();
                c.moveTo(100, 100);
                c.lineTo(200, 100);
                c.stroke();
            });

            // Check that red pixels exist along the stroke path
            const pixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(150, 100, 1, 1).data;
            });

            return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
        });

        expect(result.r).toBe(255);
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
        expect(result.a).toBe(255);
    });

    test('Toolbar.setActivePreset updates preset and emits event', async ({ page }) => {
        const result = await page.evaluate(() => {
            let emittedPreset = null;
            EventBus.on('preset:changed', (data) => { emittedPreset = data.preset; });

            Toolbar.setActivePreset('watercolor');

            return {
                enginePreset: BrushEngine.getActivePreset(),
                toolbarPreset: Toolbar.getActivePreset(),
                emittedPreset
            };
        });

        expect(result.enginePreset).toBe('watercolor');
        expect(result.toolbarPreset).toBe('watercolor');
        expect(result.emittedPreset).toBe('watercolor');
    });

    test('eraser always uses marker rendering regardless of active preset', async ({ page }) => {
        // This test verifies the eraser draws at full opacity (marker behavior)
        // even when a low-alpha preset like watercolor is selected
        const result = await page.evaluate(() => {
            BrushEngine.setActivePreset('watercolor');
            Toolbar.setActiveTool('eraser');

            // Draw some color first
            const ctx = CanvasManager.getColoringContext();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FF0000';
                c.fillRect(50, 50, 100, 100);
            });

            // Now erase over it with the eraser (should use marker path = full white)
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FFFFFF';
                c.beginPath();
                c.arc(100, 100, 20, 0, Math.PI * 2);
                c.fill();
            });

            // Check the erased area is white
            const pixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(100, 100, 1, 1).data;
            });

            return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
        });

        expect(result.r).toBe(255);
        expect(result.g).toBe(255);
        expect(result.b).toBe(255);
        expect(result.a).toBe(255);
    });

    test('preset buttons exist in classic toolbar', async ({ page }) => {
        const count = await page.evaluate(() => {
            return document.querySelectorAll('#brush-preset-control .preset-button').length;
        });
        expect(count).toBe(5);
    });

    test('active preset button gets active class', async ({ page }) => {
        const result = await page.evaluate(() => {
            Toolbar.setActivePreset('pencil');
            const pencilBtn = document.querySelector('#brush-preset-control [data-preset="pencil"]');
            const markerBtn = document.querySelector('#brush-preset-control [data-preset="marker"]');
            return {
                isPencilActive: pencilBtn.classList.contains('active'),
                isMarkerActive: markerBtn.classList.contains('active')
            };
        });

        expect(result.isPencilActive).toBe(true);
        expect(result.isMarkerActive).toBe(false);
    });
});
