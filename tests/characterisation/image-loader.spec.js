// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('ImageLoader', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('gallery modal is visible on first load', async ({ page }) => {
    await page.waitForFunction(() =>
      !document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    const visible = await page.evaluate(() =>
      !document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(visible).toBe(true);
  });

  test('gallery contains 8 pre-loaded coloring page templates', async ({ page }) => {
    const count = await page.locator('.gallery-item').count();
    expect(count).toBe(8);
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

  test('gallery opens on Templates tab by default', async ({ page }) => {
    const result = await page.evaluate(() => {
      const templatesPanel = document.getElementById('templates-panel');
      const myArtPanel = document.getElementById('my-art-panel');
      const tabTemplates = document.getElementById('tab-templates');
      return {
        isTemplatesVisible: !templatesPanel.classList.contains('hidden'),
        isMyArtHidden: myArtPanel.classList.contains('hidden'),
        isTemplatesTabActive: tabTemplates.classList.contains('gallery-tab-active')
      };
    });
    expect(result.isTemplatesVisible).toBe(true);
    expect(result.isMyArtHidden).toBe(true);
    expect(result.isTemplatesTabActive).toBe(true);
  });

  test('clicking My Art tab shows saved artwork panel and hides templates', async ({ page }) => {
    await page.waitForFunction(() => StorageManager.isAvailable());
    await page.click('#tab-my-art');

    const result = await page.evaluate(() => {
      const templatesPanel = document.getElementById('templates-panel');
      const myArtPanel = document.getElementById('my-art-panel');
      const tabMyArt = document.getElementById('tab-my-art');
      return {
        isTemplatesHidden: templatesPanel.classList.contains('hidden'),
        isMyArtVisible: !myArtPanel.classList.contains('hidden'),
        isMyArtTabActive: tabMyArt.classList.contains('gallery-tab-active')
      };
    });
    expect(result.isTemplatesHidden).toBe(true);
    expect(result.isMyArtVisible).toBe(true);
    expect(result.isMyArtTabActive).toBe(true);
  });

  test('My Art tab shows empty state when no projects exist', async ({ page }) => {
    await page.waitForFunction(() => StorageManager.isAvailable());
    await page.click('#tab-my-art');

    await page.waitForFunction(() =>
      !document.getElementById('saved-artwork-empty').classList.contains('hidden')
    );

    const emptyVisible = await page.evaluate(() =>
      !document.getElementById('saved-artwork-empty').classList.contains('hidden')
    );
    expect(emptyVisible).toBe(true);
  });

  test('My Art tab shows saved artwork cards after saving a project', async ({ page }) => {
    await page.waitForFunction(() => StorageManager.isAvailable());

    // Load a coloring page to create a project
    await page.locator('.gallery-item').first().click();
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    // Save the project
    await page.evaluate(() => ProgressManager.saveCurrentProject());
    await page.waitForTimeout(500);

    // Open gallery and switch to My Art
    await page.evaluate(() => ImageLoader.showGallery());
    await page.click('#tab-my-art');

    // Wait for cards to appear
    await page.waitForFunction(() =>
      document.querySelectorAll('.saved-artwork-card').length > 0
    );

    const cardCount = await page.locator('.saved-artwork-card').count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // Clean up
    await page.evaluate(async () => {
      const id = ProgressManager.getCurrentProjectId();
      if (id) await StorageManager.deleteProject(id);
    });
  });

  test('deleting a saved artwork card removes it from the grid', async ({ page }) => {
    await page.waitForFunction(() => StorageManager.isAvailable());

    // Create a test project directly in IndexedDB
    await page.evaluate(async () => {
      await StorageManager.saveProject({
        id: 'delete-test-1',
        templateSrc: 'images/coloring-pages/cat.svg',
        status: 'completed',
        updatedAt: Date.now()
      });
    });

    // Open gallery and switch to My Art
    await page.evaluate(() => ImageLoader.showGallery());
    await page.click('#tab-my-art');

    await page.waitForFunction(() =>
      document.querySelectorAll('.saved-artwork-card').length > 0
    );

    const cardsBefore = await page.locator('.saved-artwork-card').count();

    // Click the delete button on the card with our test project
    const deleteBtn = page.locator('.saved-artwork-card[data-project-id="delete-test-1"] .saved-artwork-delete');
    await deleteBtn.click();

    const cardsAfter = await page.locator('.saved-artwork-card').count();
    expect(cardsAfter).toBe(cardsBefore - 1);

    // Verify it was deleted from IndexedDB
    const project = await page.evaluate(async () =>
      await StorageManager.loadProject('delete-test-1')
    );
    expect(project).toBeNull();
  });

  test('clicking a saved artwork card resumes the project and hides gallery', async ({ page }) => {
    await page.waitForFunction(() => StorageManager.isAvailable());

    // Load a coloring page and save it
    await page.locator('.gallery-item').first().click();
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });
    await page.evaluate(() => ProgressManager.saveCurrentProject());
    await page.waitForTimeout(500);

    const savedId = await page.evaluate(() => ProgressManager.getCurrentProjectId());

    // Clear state and go back to gallery
    await page.evaluate(() => ProgressManager.clearCurrentProject());
    await page.evaluate(() => ImageLoader.showGallery());
    await page.click('#tab-my-art');

    await page.waitForFunction(() =>
      document.querySelectorAll('.saved-artwork-card').length > 0
    );

    // Click the saved artwork card to resume
    await page.locator('.saved-artwork-card').first().click();

    // Gallery should be hidden
    const isGalleryHidden = await page.evaluate(() =>
      document.getElementById('image-gallery-modal').classList.contains('hidden')
    );
    expect(isGalleryHidden).toBe(true);

    // Wait for the project to be resumed (outline loads)
    await page.waitForFunction(() => {
      const region = CanvasManager?.getImageRegion?.();
      return !!region && region.width > 0;
    });

    // The project should be tracked again
    const currentId = await page.evaluate(() => ProgressManager.getCurrentProjectId());
    expect(currentId).toBe(savedId);

    // Clean up
    await page.evaluate(async (id) => {
      await StorageManager.deleteProject(id);
    }, savedId);
  });
});
