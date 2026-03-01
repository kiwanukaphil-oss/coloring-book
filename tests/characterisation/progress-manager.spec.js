// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('ProgressManager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Wait for async StorageManager initialization to complete
    await page.waitForFunction(() => StorageManager.isAvailable());
  });

  test('getCurrentProjectId is null before loading a coloring page', async ({ page }) => {
    const projectId = await page.evaluate(() => ProgressManager.getCurrentProjectId());
    expect(projectId).toBeNull();
  });

  test('loading a coloring page creates a project with an ID', async ({ page }) => {
    // Click a gallery item to load a coloring page
    const firstItem = page.locator('.gallery-item').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();

    // Wait for the outline to load
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    const projectId = await page.evaluate(() => ProgressManager.getCurrentProjectId());
    expect(projectId).not.toBeNull();
    expect(projectId).toMatch(/^project-\d+$/);
  });

  test('auto-save persists project to IndexedDB after drawing', async ({ page }) => {
    // Load a coloring page
    const firstItem = page.locator('.gallery-item').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    // Trigger an immediate save (instead of waiting for debounce)
    await page.evaluate(() => ProgressManager.saveCurrentProject());

    // Wait a moment for the async save to complete
    await page.waitForTimeout(500);

    const project = await page.evaluate(async () => {
      const id = ProgressManager.getCurrentProjectId();
      return await StorageManager.loadProject(id);
    });

    expect(project).not.toBeNull();
    expect(project.status).toBe('in-progress');
    expect(project.templateSrc).toContain('cat.svg');
    expect(project.coloringBlob).toBeTruthy();
    expect(project.thumbnailBlob).toBeTruthy();
  });

  test('starting a new project marks the previous one as completed', async ({ page }) => {
    // Load first coloring page
    const firstItem = page.locator('.gallery-item').first();
    await expect(firstItem).toBeVisible();
    await firstItem.click();
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    // Save the first project
    await page.evaluate(() => ProgressManager.saveCurrentProject());
    await page.waitForTimeout(500);

    const firstId = await page.evaluate(() => ProgressManager.getCurrentProjectId());

    // Load another coloring page (same one, but triggers new project)
    await page.evaluate(() => ImageLoader.showGallery());
    await firstItem.click();
    await page.waitForFunction((prevId) => {
      const id = ProgressManager.getCurrentProjectId();
      return id !== null && id !== prevId;
    }, firstId);

    // Wait for the completion save
    await page.waitForTimeout(500);

    const oldProject = await page.evaluate(async (id) => {
      return await StorageManager.loadProject(id);
    }, firstId);

    expect(oldProject).not.toBeNull();
    expect(oldProject.status).toBe('completed');
  });
});
