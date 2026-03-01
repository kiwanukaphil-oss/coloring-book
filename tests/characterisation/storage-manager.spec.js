// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('StorageManager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    // Wait for async StorageManager initialization to complete
    await page.waitForFunction(() => StorageManager.isAvailable());
  });

  test('isAvailable returns true after initialization', async ({ page }) => {
    const isAvailable = await page.evaluate(() => StorageManager.isAvailable());
    expect(isAvailable).toBe(true);
  });

  test('saveProject and loadProject round-trip a project record', async ({ page }) => {
    const loaded = await page.evaluate(async () => {
      const project = {
        id: 'test-project-1',
        templateSrc: 'images/coloring-pages/cat.svg',
        status: 'in-progress',
        activeTool: 'brush',
        brushSize: 20,
        activeColor: '#0000FF',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await StorageManager.saveProject(project);
      const result = await StorageManager.loadProject('test-project-1');

      // Clean up
      await StorageManager.deleteProject('test-project-1');

      return result;
    });

    expect(loaded).not.toBeNull();
    expect(loaded.id).toBe('test-project-1');
    expect(loaded.status).toBe('in-progress');
    expect(loaded.brushSize).toBe(20);
    expect(loaded.activeColor).toBe('#0000FF');
  });

  test('getInProgressProject returns the in-progress project', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await StorageManager.saveProject({
        id: 'completed-1',
        status: 'completed',
        updatedAt: 1000
      });
      await StorageManager.saveProject({
        id: 'in-progress-1',
        status: 'in-progress',
        updatedAt: 2000
      });

      const project = await StorageManager.getInProgressProject();

      // Clean up
      await StorageManager.deleteProject('completed-1');
      await StorageManager.deleteProject('in-progress-1');

      return project;
    });

    expect(result).not.toBeNull();
    expect(result.id).toBe('in-progress-1');
    expect(result.status).toBe('in-progress');
  });

  test('deleteProject removes the record', async ({ page }) => {
    const result = await page.evaluate(async () => {
      await StorageManager.saveProject({
        id: 'delete-me',
        status: 'completed',
        updatedAt: Date.now()
      });

      await StorageManager.deleteProject('delete-me');
      return await StorageManager.loadProject('delete-me');
    });

    expect(result).toBeNull();
  });

  test('listProjects returns projects sorted by updatedAt descending', async ({ page }) => {
    const ids = await page.evaluate(async () => {
      await StorageManager.saveProject({ id: 'old', status: 'completed', updatedAt: 1000 });
      await StorageManager.saveProject({ id: 'new', status: 'completed', updatedAt: 3000 });
      await StorageManager.saveProject({ id: 'mid', status: 'completed', updatedAt: 2000 });

      const projects = await StorageManager.listProjects();
      const projectIds = projects.map(p => p.id);

      // Clean up
      await StorageManager.deleteProject('old');
      await StorageManager.deleteProject('mid');
      await StorageManager.deleteProject('new');

      return projectIds;
    });

    expect(ids[0]).toBe('new');
    expect(ids[1]).toBe('mid');
    expect(ids[2]).toBe('old');
  });
});
