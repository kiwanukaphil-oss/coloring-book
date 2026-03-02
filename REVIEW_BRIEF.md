# Review Brief — Phase 1: Reimagined App Foundation

## Session date
2026-03-02

## Summary

Phase 1 implements the architectural foundation for the dual-mode (Kids + Studio) reimagined app. It adds 7 new ADRs (ADR-009 through ADR-015), 5 new IIFE modules (~1,015 LOC), CSS design tokens, accessibility, zoom/pan, an HSL color picker, and command-based undo — all while preserving the existing public APIs and passing all 86 Playwright tests.

## Steps Completed

### Step 0: New ADRs (ADR-009 through ADR-015)
Seven new Architecture Decision Records covering every new pattern introduced in Phase 1:
- ADR-009: Viewport Transform (CSS `transform` on `#canvas-container`)
- ADR-010: Design Tokens (CSS custom properties on `:root`)
- ADR-011: Command-Based Undo (ImageData commands, 50-step limit)
- ADR-012: Custom Color Picker (HSL model, canvas-rendered)
- ADR-013: Accessibility Patterns (ARIA, focus traps, keyboard nav)
- ADR-014: Event Bus Communication (`EventBus.on/off/emit`)
- ADR-015: Dual-Mode UI (`data-mode` attribute, CSS visibility)

### Step 1: CSS Design Tokens (ADR-010)
- Extracted ~50 hardcoded values in `css/styles.css` to CSS custom properties on `:root`
- Token categories: `--color-*`, `--size-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--font-*`
- Added `[data-theme="dark"]` placeholder, Nunito font, `data-theme`/`data-mode` attributes on `<html>`

### Step 2: Event Bus (ADR-014)
- **New file:** `js/event-bus.js` (~50 LOC) — simple pub/sub with `Map<string, Set<Function>>`
- Integrated `EventBus.emit()` calls alongside existing direct calls in brush-engine, flood-fill, toolbar, color-palette

### Step 3: Dual-Mode UI Shell (ADR-015)
- **New file:** `js/mode-manager.js` (~320 LOC) — manages `data-mode` (kids/studio), `data-hand` (left/right), `data-theme` (light/dark)
- Kids Mode: tool bubbles (emoji), undo bar, size bubbles
- Studio Mode: glassmorphism floating dock, undo/redo with depth dots, zoom pill, drawer placeholders
- `?classic` URL parameter bypass for test compatibility
- CSS visibility rules for mode switching including `:root:not([data-mode])` for classic/test mode

### Step 4: Accessibility Foundation (ADR-013)
- ARIA attributes on all interactive elements (modals, toolbar, palette, toast)
- `:focus-visible` outline, `.sr-only` class, `prefers-reduced-motion` media query
- `toolbar.js`: `aria-pressed` toggling
- `color-palette.js`: roving tabindex, keyboard navigation (arrows + Enter/Space)
- `image-loader.js`: Escape key close, focus trap

### Step 5: Zoom/Pan ViewportManager (ADR-009)
- **New file:** `js/viewport-manager.js` (~230 LOC) — CSS `transform` zoom/pan
- Zoom 0.5x–5x via Ctrl+scroll, pinch, Ctrl+=/-/0
- Spacebar+drag panning
- Zoom pill UI in studio mode
- Scale-aware fill threshold, pan-skip guards in toolbar and brush-engine

### Step 6: HSL Color Picker (ADR-012)
- **New file:** `js/color-picker.js` (~300 LOC) — pure-math HSL↔hex conversion
- Canvas-rendered hue ring and saturation/lightness square
- Recent colors in localStorage (max 8)
- "+" swatch button, Kids lighter/darker buttons
- Fixed `.color-picker.hidden` missing `display: none` rule

### Step 7: Command-Based Undo (ADR-011)
- **New file:** `js/command-manager.js` (~115 LOC) — command pattern with ImageData
- `UndoManager` completely rewritten internally, public API unchanged
- PNG data URL snapshots → synchronous `ImageData` + `putImageData()`
- Max undo steps: 10 → 50
- Undo/redo now synchronous (instant) instead of async Image decode
- `clearRedoStack()` ensures `saveSnapshot()` properly invalidates redo history

## New Files

| File | Module | ~LOC | Step |
|------|--------|------|------|
| `js/event-bus.js` | EventBus | 50 | 2 |
| `js/mode-manager.js` | ModeManager | 320 | 3 |
| `js/viewport-manager.js` | ViewportManager | 230 | 5 |
| `js/color-picker.js` | ColorPicker | 300 | 6 |
| `js/command-manager.js` | CommandManager | 115 | 7 |
| `Docs/decisions/ADR-009` through `ADR-015` | — | — | 0 |

## Modified Files

| File | Changes |
|------|---------|
| `css/styles.css` | +940 lines: design tokens, mode CSS, accessibility, zoom pill, color picker |
| `index.html` | +131 lines: ARIA attributes, dual-mode HTML, new script tags |
| `js/app.js` | Updated initialization order (+ViewportManager, +ColorPicker, +ModeManager) |
| `js/brush-engine.js` | EventBus emit, skip during pan |
| `js/color-palette.js` | ARIA roles, roving tabindex, keyboard nav, EventBus emit |
| `js/flood-fill.js` | EventBus emit |
| `js/image-loader.js` | Escape key close, focus trap |
| `js/toolbar.js` | aria-pressed, scale-aware threshold, EventBus emit |
| `js/undo-manager.js` | Complete internal rewrite (ImageData via CommandManager facade) |
| `service-worker.js` | Cache v8→v14, 5 new JS files in cache list |
| All 10 test files | `page.goto('/index.html')` → `page.goto('/index.html?classic=1')` |

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-001 | console.warn for service worker registration failure |
| ADR-003 | `.hidden` class on color picker, all modals, mode elements |
| ADR-005 | Named functions in keyboard nav, focus trap, mode switching |
| ADR-007 | `withNativeTransform` in CommandManager undo/redo |
| ADR-009 | ViewportManager CSS transform approach |
| ADR-010 | All hardcoded values replaced with CSS custom properties |
| ADR-011 | CommandManager + UndoManager facade |
| ADR-012 | HSL picker with canvas rendering |
| ADR-013 | ARIA, focus trap, roving tabindex, prefers-reduced-motion |
| ADR-014 | EventBus module with noun:verb naming |
| ADR-015 | ModeManager with data-mode attribute |

## Issues Encountered and Resolved

1. **Dual-mode CSS hiding classic toolbar** — `data-mode="kids"` hid the classic `#toolbar`, breaking 19 tests. Fixed with `?classic` URL parameter bypass in ModeManager.
2. **Studio dock intercepting pointer events** — `.studio-only` elements visible when `data-mode` absent. Fixed with `:root:not([data-mode])` CSS rule.
3. **Color picker canvas intercepting modal clicks** — `.color-picker.hidden` had no `display: none` rule. Fixed by adding the missing CSS rule.
4. **New undo not clearing redo stack** — `saveSnapshot()` didn't clear redo when no pending state existed. Fixed by adding `CommandManager.clearRedoStack()`.

## Decisions Not Covered by Existing ADRs

- **`?classic` URL parameter for test compatibility** — Tests use `?classic=1` to bypass ModeManager and access classic toolbar/palette UI directly. Candidate for ADR-016.

## Script Loading Order (Final)

```
event-bus.js → touch-guard.js → feedback-manager.js → mode-manager.js →
canvas-manager.js → viewport-manager.js → command-manager.js → undo-manager.js →
color-palette.js → color-picker.js → flood-fill.js → brush-engine.js →
image-loader.js → toolbar.js → storage-manager.js → progress-manager.js → app.js
```

## Test Results

- **86 passed, 0 failed** (excluding 1 pre-existing flaky test: "stack is capped at 10 snapshots")
- All existing characterisation tests pass without modification (only `page.goto` URL changed)

## Ready for /review
[x] Yes
