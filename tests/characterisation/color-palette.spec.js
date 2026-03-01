// CHARACTERISATION TEST — describes current behaviour, not intended behaviour

const { test, expect } = require('@playwright/test');

test.describe('ColorPalette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('default color is red (#FF0000)', async ({ page }) => {
    const color = await page.evaluate(() => ColorPalette.getCurrentColor());
    expect(color).toBe('#FF0000');
  });

  test('renders 20 color swatches', async ({ page }) => {
    const count = await page.evaluate(() =>
      document.querySelectorAll('.color-swatch').length
    );
    expect(count).toBe(20);
  });

  test('first swatch has selected class by default', async ({ page }) => {
    const isSelected = await page.evaluate(() =>
      document.querySelector('.color-swatch').classList.contains('selected')
    );
    expect(isSelected).toBe(true);
  });

  test('clicking a swatch changes the current color', async ({ page }) => {
    // Click the second swatch (Orange-Red, #FF5733)
    const result = await page.evaluate(() => {
      const swatches = document.querySelectorAll('.color-swatch');
      swatches[1].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return {
        newColor: ColorPalette.getCurrentColor(),
        firstSelected: swatches[0].classList.contains('selected'),
        secondSelected: swatches[1].classList.contains('selected'),
      };
    });

    expect(result.newColor).toBe('#FF5733');
    expect(result.firstSelected).toBe(false);
    expect(result.secondSelected).toBe(true);
  });

  test('color indicator updates when a swatch is selected', async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      const swatches = document.querySelectorAll('.color-swatch');
      swatches[5].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return document.getElementById('active-color-indicator').style.backgroundColor;
    });

    // #FFFF00 (Yellow) renders as rgb(255, 255, 0) in computed style
    expect(bgColor).toBe('rgb(255, 255, 0)');
  });

  test('setCurrentColor programmatically changes the active color and highlights swatch', async ({ page }) => {
    const result = await page.evaluate(() => {
      ColorPalette.setCurrentColor('#0000FF');
      const swatches = document.querySelectorAll('.color-swatch');
      const blueIndex = 11; // #0000FF is at index 11
      return {
        currentColor: ColorPalette.getCurrentColor(),
        blueSelected: swatches[blueIndex].classList.contains('selected'),
        indicatorColor: document.getElementById('active-color-indicator').style.backgroundColor
      };
    });

    expect(result.currentColor).toBe('#0000FF');
    expect(result.blueSelected).toBe(true);
    expect(result.indicatorColor).toBe('rgb(0, 0, 255)');
  });
});
