# Review Brief

## Session date
2026-03-01

## Summary
Completed Phase 0 (Stability) and Phase 1 (Edge-Aware Brush). The brush engine now respects outline boundaries — paint stays "inside the lines." Backed by a precomputed binary outline mask for O(1) pixel lookups and 3 new tests.

## What was changed

### Phase 0.1: Touch Guard Scoping
- `js/touch-guard.js` — All 5 event listeners scoped from `document` to `#canvas-container`. Gallery modal scrolling and text selection now work on touch devices.

### Phase 0.2: E2E Test Stabilization
- Verified all 51 tests pass. No code changes needed.

### Phase 0.3: QA Checklist
- Created `Docs/qa-checklist.md` — 85 manual test cases across 13 categories (app launch, canvas, brush, fill, palette, undo, clear, save, reference panel, touch guards, PWA, performance, edge cases) with device testing matrix.

### Phase 1: Edge-Aware Brush (ADR-008)
- `docs/decisions/ADR-008-outline-mask-brush-clipping.md` — New ADR defining the precomputed outline mask pattern and post-draw pixel restoration approach.
- `js/canvas-manager.js` — Added `outlineMask` state, `computeOutlineMask()` function (runs after `makeWhitePixelsTransparent()` on template load), `getOutlineMask()` public getter. Mask is cleared on `clearAllCanvases()` and recomputed on `handleWindowResize()`.
- `js/brush-engine.js` — Added `restoreOutlinePixels(ctx, x, y, w, h)` that reads a small bounding box from the coloring canvas and resets any outline-mask pixels to white. Called after the initial dot in `handlePointerDown` and after all coalesced segments in `handlePointerMove`.
- `tests/characterisation/canvas-manager.spec.js` — 2 new tests: mask is null before page load, mask is populated after page load.
- `tests/characterisation/brush-engine.spec.js` — 1 new test: brush stroke across outline verifies zero outline pixels are painted over.

### Documentation Updates
- `ARCHITECTURE.md` — Updated test counts (51→54), ADR count (7→8), CanvasManager module description, resolved Known Issue #1 (touch guards).

## ADRs applied
- ADR-007: Canvas context reset (`withNativeTransform` for all canvas pixel operations)
- ADR-008: Outline mask brush clipping (new — precomputed mask + post-draw restoration)

## New decisions made (not yet in an ADR)
None. ADR-008 was written before implementation per ongoing discipline rules.

## Bugs found and fixed
None.

## Test results
54/54 passing (4.8s) — 4 smoke tests + 50 characterisation tests

## Files modified
| File | Change |
|------|--------|
| `js/canvas-manager.js` | +outlineMask, +computeOutlineMask(), +getOutlineMask(), mask lifecycle |
| `js/brush-engine.js` | +restoreOutlinePixels(), called in handlePointerDown + handlePointerMove |
| `js/touch-guard.js` | Scoped all listeners to #canvas-container |
| `docs/decisions/ADR-008-outline-mask-brush-clipping.md` | New ADR |
| `Docs/qa-checklist.md` | New QA checklist (85 test cases) |
| `tests/characterisation/canvas-manager.spec.js` | +2 outline mask tests |
| `tests/characterisation/brush-engine.spec.js` | +1 edge-aware brush test |
| `ARCHITECTURE.md` | Updated counts, descriptions, resolved issues |
| `REVIEW_BRIEF.md` | This file |

## Ready for /review
[x] Yes
