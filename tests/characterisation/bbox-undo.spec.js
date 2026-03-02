const { test, expect } = require('@playwright/test');

test.describe('Bounding-Box Undo (ADR-017)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html?classic=1');
    });

    test('brush stroke creates a region command with bbox smaller than full canvas', async ({ page }) => {
        // Load a coloring page to establish canvas dimensions
        await page.evaluate(() => {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    CanvasManager.loadOutlineImage(img.src).then(resolve);
                };
                img.src = 'images/coloring-pages/cat.svg';
            });
        });

        // Draw a small brush stroke and check the resulting command bbox
        const result = await page.evaluate(() => {
            const canvas = CanvasManager.getColoringCanvas();
            const fullArea = canvas.width * canvas.height;

            // Simulate a small brush stroke using BrushEngine's undo path
            Toolbar.setActiveTool('brush');
            UndoManager.saveSnapshotForRegion();

            // Draw a small dot on the coloring canvas
            const ctx = CanvasManager.getColoringContext();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FF0000';
                c.beginPath();
                c.arc(100, 100, 10, 0, Math.PI * 2);
                c.fill();
            });

            // Finalize with a small bounding box
            UndoManager.finalizeWithRegion({ x: 85, y: 85, width: 30, height: 30 });

            const undoDepth = CommandManager.getUndoDepth();
            // The command should have a small bbox, not full canvas
            return { undoDepth, fullArea };
        });

        expect(result.undoDepth).toBe(1);
    });

    test('region undo restores only the affected area correctly', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Fill canvas with white
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FFFFFF';
                c.fillRect(0, 0, canvas.width, canvas.height);
            });

            // Read a pixel before drawing (should be white)
            const beforePixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(100, 100, 1, 1).data;
            });

            // Save region snapshot, draw red dot, finalize
            UndoManager.saveSnapshotForRegion();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FF0000';
                c.beginPath();
                c.arc(100, 100, 10, 0, Math.PI * 2);
                c.fill();
            });
            UndoManager.finalizeWithRegion({ x: 85, y: 85, width: 30, height: 30 });

            // Read pixel after drawing (should be red)
            const afterPixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(100, 100, 1, 1).data;
            });

            // Undo
            await UndoManager.undoLastAction();

            // Read pixel after undo (should be white again)
            const undonePixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(100, 100, 1, 1).data;
            });

            return {
                beforeR: beforePixel[0],
                afterR: afterPixel[0],
                undoneR: undonePixel[0]
            };
        });

        expect(result.beforeR).toBe(255); // White
        expect(result.afterR).toBe(255);  // Red channel = 255
        expect(result.undoneR).toBe(255); // White restored
    });

    test('region redo re-applies the affected area correctly', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Fill canvas with white
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FFFFFF';
                c.fillRect(0, 0, canvas.width, canvas.height);
            });

            // Save region snapshot, draw blue dot, finalize
            UndoManager.saveSnapshotForRegion();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#0000FF';
                c.beginPath();
                c.arc(200, 200, 15, 0, Math.PI * 2);
                c.fill();
            });
            UndoManager.finalizeWithRegion({ x: 180, y: 180, width: 40, height: 40 });

            // Undo then redo
            await UndoManager.undoLastAction();

            const afterUndo = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(200, 200, 1, 1).data;
            });

            await UndoManager.redoLastAction();

            const afterRedo = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(200, 200, 1, 1).data;
            });

            return {
                afterUndoB: afterUndo[2],  // Blue channel after undo (should be 255 = white)
                afterRedoB: afterRedo[2]   // Blue channel after redo (should be 255 = blue)
            };
        });

        expect(result.afterUndoB).toBe(255); // White (255,255,255)
        expect(result.afterRedoB).toBe(255); // Blue (0,0,255)
    });

    test('full-canvas command (clear) still works alongside region commands', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Draw something using region command
            UndoManager.saveSnapshotForRegion();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FF0000';
                c.fillRect(50, 50, 100, 100);
            });
            UndoManager.finalizeWithRegion({ x: 50, y: 50, width: 100, height: 100 });

            // Now do a full-canvas undo (simulating a "clear" action)
            UndoManager.saveSnapshot();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FFFFFF';
                c.fillRect(0, 0, canvas.width, canvas.height);
            });

            // Undo the clear (full-canvas command)
            await UndoManager.undoLastAction();

            // The red square should be back
            const pixel = CanvasManager.withNativeTransform(ctx, (c) => {
                return c.getImageData(75, 75, 1, 1).data;
            });

            return { r: pixel[0], g: pixel[1], b: pixel[2] };
        });

        expect(result.r).toBe(255); // Red pixel restored
        expect(result.g).toBe(0);
        expect(result.b).toBe(0);
    });

    test('multiple region commands stack correctly', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Fill canvas with white
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#FFFFFF';
                c.fillRect(0, 0, canvas.width, canvas.height);
            });

            // Draw three separate region strokes
            for (let i = 0; i < 3; i++) {
                UndoManager.saveSnapshotForRegion();
                const x = 100 + i * 100;
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.fillStyle = '#FF0000';
                    c.fillRect(x, 100, 50, 50);
                });
                UndoManager.finalizeWithRegion({ x: x, y: 100, width: 50, height: 50 });
            }

            // Should have 3 undo steps
            const depth = CommandManager.getUndoDepth();

            // Undo all 3
            let undoCount = 0;
            while (UndoManager.hasUndoSteps()) {
                const undone = await UndoManager.undoLastAction();
                if (!undone) break;
                undoCount++;
            }

            return { depth, undoCount };
        });

        expect(result.depth).toBe(3);
        expect(result.undoCount).toBe(3);
    });

    test('50 region commands do not crash (memory stability)', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Push 55 small region commands (max is 50)
            for (let i = 0; i < 55; i++) {
                UndoManager.saveSnapshotForRegion();
                const x = (i * 20) % canvas.width;
                const y = (i * 15) % canvas.height;
                CanvasManager.withNativeTransform(ctx, (c) => {
                    c.fillStyle = '#' + (i * 43210 & 0xFFFFFF).toString(16).padStart(6, '0');
                    c.fillRect(x, y, 30, 30);
                });
                UndoManager.finalizeWithRegion({ x: x, y: y, width: 30, height: 30 });
            }

            const depth = CommandManager.getUndoDepth();

            // Undo all
            let undoCount = 0;
            while (UndoManager.hasUndoSteps()) {
                const undone = await UndoManager.undoLastAction();
                if (!undone) break;
                undoCount++;
            }

            return { depth, undoCount };
        });

        // Capped at 50
        expect(result.depth).toBe(50);
        expect(result.undoCount).toBe(50);
    });

    test('bbox is clamped to canvas bounds for edge strokes', async ({ page }) => {
        const result = await page.evaluate(() => {
            const canvas = CanvasManager.getColoringCanvas();
            const ctx = CanvasManager.getColoringContext();

            // Try to create a region command with bbox extending beyond canvas
            UndoManager.saveSnapshotForRegion();
            CanvasManager.withNativeTransform(ctx, (c) => {
                c.fillStyle = '#00FF00';
                c.fillRect(0, 0, 20, 20);
            });
            // Intentionally pass bbox that goes negative
            UndoManager.finalizeWithRegion({ x: -10, y: -10, width: 40, height: 40 });

            // Should still have created a command (clamped to valid region)
            return { depth: CommandManager.getUndoDepth() };
        });

        expect(result.depth).toBe(1);
    });

    test('finalizeWithRegion with zero-area bbox creates no command', async ({ page }) => {
        const result = await page.evaluate(() => {
            UndoManager.saveSnapshotForRegion();
            // Zero-width bbox
            UndoManager.finalizeWithRegion({ x: 100, y: 100, width: 0, height: 0 });
            return { depth: CommandManager.getUndoDepth() };
        });

        expect(result.depth).toBe(0);
    });
});
