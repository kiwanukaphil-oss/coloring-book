# Test Coverage

## Summary

| Category | Tests | Files |
|----------|-------|-------|
| Smoke (e2e) | 4 | `tests/smoke.spec.js` |
| Characterisation | 47 | `tests/characterisation/*.spec.js` |
| **Total** | **51** | **8 files** |

All tests run via Playwright in headless Chromium. The app uses browser-only IIFE modules (not importable in Node), so all tests use `page.evaluate()` to exercise functions in the browser context.

---

## Module Coverage

| Module | Characterisation Tests | Smoke Tests | Coverage Notes |
|--------|----------------------|-------------|----------------|
| `js/canvas-manager.js` | 7 tests | 2 tests | Canvas initialization, white fill, imageRegion, withNativeTransform, getCanvasPixelCoords, clearColoringCanvas, renderCompositeForSave |
| `js/undo-manager.js` | 5 tests | 1 test | hasUndoSteps, saveSnapshot, undoLastAction, clearHistory, 10-step cap |
| `js/color-palette.js` | 5 tests | — | Default color, swatch count, selection, color indicator update |
| `js/flood-fill.js` | 5 tests | — | Fill white canvas, same-color no-op, out-of-bounds no-op, undo snapshot, outline boundary |
| `js/brush-engine.js` | 4 tests | 1 test | Default size, setBrushSize, stroke modifies pixels, stroke saves undo |
| `js/toolbar.js` | 7 tests | — | Default tool, tool switching, brush size control visibility, clear modal, confirm/cancel clear |
| `js/image-loader.js` | 9 tests | 2 tests | Gallery visibility, gallery items, click loads image, undo cleared on load, reference panel show/hide/close, showGallery/hideGallery |
| `js/touch-guard.js` | — | — | Not tested — gesture prevention is difficult to verify in headless Chromium (no real multi-touch/gesture events) |
| `js/app.js` | — | 1 test | Boot sequence verified indirectly via smoke test (modules load, gallery shows) |
| `service-worker.js` | — | — | Not tested — Playwright config blocks service workers (`serviceWorkers: 'block'`); caching strategies require network interception fixtures |

---

## Test Files

### Smoke Tests (`tests/smoke.spec.js`)
1. App boots and exposes both upload actions
2. Brush stroke is undoable
3. Reference panel upload, move, and resize works
4. Drawing persists through viewport resize

### Characterisation Tests (`tests/characterisation/`)

**canvas-manager.spec.js** (7 tests)
1. Initializes four canvas layers with matching dimensions
2. Coloring canvas starts filled with white pixels
3. imageRegion starts at zero before any image is loaded
4. withNativeTransform resets transform inside callback and restores after
5. withNativeTransform returns the callback return value
6. getCanvasPixelCoords converts CSS coords to canvas pixel coords
7. clearColoringCanvas resets to white
8. renderCompositeForSave returns a PNG data URL

**undo-manager.spec.js** (5 tests)
1. Starts with no undo steps
2. saveSnapshot adds an undo step
3. undoLastAction returns false when stack is empty
4. undoLastAction restores previous canvas state
5. clearHistory removes all undo steps
6. Stack is capped at 10 snapshots

**color-palette.spec.js** (5 tests)
1. Default color is red (#FF0000)
2. Renders 20 color swatches
3. First swatch has selected class by default
4. Clicking a swatch changes the current color
5. Color indicator updates when a swatch is selected

**flood-fill.spec.js** (5 tests)
1. Fills white canvas with the specified color
2. Does not fill if tapping on the same color
3. Does not fill outside canvas bounds
4. Saves undo snapshot before modifying canvas
5. Flood fill respects outline boundaries

**brush-engine.spec.js** (4 tests)
1. Default brush size is 12
2. setBrushSize changes the brush size
3. Brush stroke modifies canvas pixels when brush tool is active
4. Brush stroke saves an undo snapshot

**toolbar.spec.js** (7 tests)
1. Default active tool is fill
2. Clicking brush button switches to brush tool
3. Clicking fill button switches back to fill tool
4. Brush button shows brush size control
5. Fill button hides brush size control
6. Active button gets active class, inactive loses it
7. Clear button shows confirmation modal
8. Confirming clear saves snapshot and clears canvas
9. Cancelling clear dismisses modal without clearing

**image-loader.spec.js** (9 tests)
1. Gallery modal is visible on first load
2. Gallery contains at least one gallery item
3. Clicking a gallery item hides the gallery
4. Clicking a gallery item loads an image and sets imageRegion
5. Loading a coloring page clears undo history
6. Reference panel starts hidden
7. Uploading a reference image shows the reference panel
8. Closing reference panel hides it
9. hideGallery adds hidden class to gallery modal
10. showGallery removes hidden class from gallery modal

---

## Gaps and Recommendations

| Gap | Reason | Recommendation |
|-----|--------|----------------|
| TouchGuard not tested | Headless Chromium can't simulate multi-touch gestures or iOS gesture events | Manual testing on real devices; consider a touch-event mock library |
| Service worker not tested | Playwright blocks service workers in test config; testing cache strategies requires network interception | Add separate service worker tests using Workbox testing utilities or custom fetch mocks |
| Canvas resize handler not directly tested | Covered indirectly by smoke test "drawing persists through viewport resize" | Current coverage is sufficient |
| `calculateContainFit` not unit-tested | Internal function, not exposed on public API | Could expose for testing or test via `loadOutlineImage` behavior |
