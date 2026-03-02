# ADR-016: Classic Test Mode via URL Parameter

## Status
Accepted

## Context
Phase 1 introduced a dual-mode UI (ADR-015) where `ModeManager` applies a `data-mode` attribute to `<html>`, driving CSS selectors that hide the classic `#toolbar` and `#color-palette` in both Kids and Studio modes. The 87 existing Playwright tests rely on interacting with these classic UI elements (e.g., clicking `#tool-brush`, reading `#color-palette` swatches).

Without a bypass mechanism, ModeManager's initialization would hide the classic toolbar on test load, breaking all tests that interact with it.

## Decision
When the URL contains a `?classic` query parameter, `ModeManager.initialize()` removes the `data-mode` attribute from `<html>` and returns immediately without applying any mode state. A CSS rule ensures all mode-specific elements are hidden when `data-mode` is absent:

```css
:root:not([data-mode]) .kids-only,
:root:not([data-mode]) .studio-only,
:root:not([data-mode]) .mode-switch {
    display: none !important;
}
```

This makes the app behave as it did before dual-mode UI was added: classic toolbar and color palette are visible, mode-specific elements are hidden.

### Usage in tests
All test files use `page.goto('/index.html?classic=1')` instead of `page.goto('/index.html')`:

```javascript
test.beforeEach(async ({ page }) => {
    await page.goto('/index.html?classic=1');
});
```

### Rules
- All existing characterisation tests must use `?classic=1` in their `page.goto()` URL
- New tests for mode-specific UI (Kids/Studio) should NOT use `?classic` and should instead interact with the mode-specific elements directly
- The `?classic` parameter is a test-infrastructure concern only — it is not intended for end users
- `ModeManager.initialize()` must check for `?classic` before reading localStorage or applying any attributes

## Consequences
- All 10 test files modified to include `?classic=1`
- `ModeManager.initialize()` has an early return path for classic mode
- Classic toolbar and color palette remain in the DOM in all modes (just hidden via CSS)
- Test stability preserved: existing tests pass without modification to their assertions
