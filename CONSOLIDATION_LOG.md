# Consolidation Log

---

## canvas-manager.js — 2026-02-28

- Patterns replaced:
  - 8 occurrences of raw `ctx.save(); ctx.setTransform(1,0,0,1,0,0); ... ctx.restore()` boilerplate replaced with `withNativeTransform()` helper calls
  - Added `withNativeTransform(ctx, callback)` helper function (ADR-007)
  - Added `getCanvasPixelCoords(event)` shared coordinate conversion utility (ADR-002)
- ADRs applied: ADR-002, ADR-007
- Verified: Playwright e2e tests — 2 passing tests (app boot, reference panel) still pass. 2 pre-existing failing tests unchanged.
- Notes: `withNativeTransform` and `getCanvasPixelCoords` added to the module's public API for use by other modules.

---

## flood-fill.js — 2026-02-28

- Patterns replaced:
  - Removed internal CSS→canvas coordinate conversion (inline `getBoundingClientRect` + scale math). Function now accepts canvas pixel coordinates directly (ADR-002).
  - 4 occurrences of raw save/setTransform/restore replaced with `CanvasManager.withNativeTransform()` (ADR-007)
  - Renamed `scanLeft` → `isScanningLeft`, `scanRight` → `isScanningRight` (ADR-004)
  - Removed unused `interactionCanvas` and `outlineCanvas` local variables (only their contexts are needed)
- ADRs applied: ADR-002, ADR-004, ADR-007
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: The function signature changed from `executeFloodFillAtPoint(cssX, cssY, ...)` to `executeFloodFillAtPoint(canvasX, canvasY, ...)`. All callers (toolbar.js) were updated to pass canvas pixel coordinates.

---

## brush-engine.js — 2026-02-28

- Patterns replaced:
  - Removed private `getCanvasCoords(event)` function; replaced with `CanvasManager.getCanvasPixelCoords(event)` (ADR-002)
  - 2 occurrences of raw save/setTransform/restore replaced with `CanvasManager.withNativeTransform()` (ADR-007)
- ADRs applied: ADR-002, ADR-007
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: None.

---

## undo-manager.js — 2026-02-28

- Patterns replaced:
  - 1 occurrence of raw save/setTransform/restore in `undoLastAction()` replaced with `CanvasManager.withNativeTransform()` (ADR-007)
- ADRs applied: ADR-007
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: None.

---

## toolbar.js — 2026-02-28

- Patterns replaced:
  - Removed partial CSS-only coordinate conversion (`getBoundingClientRect` + subtract). Now uses `CanvasManager.getCanvasPixelCoords(event)` and passes canvas pixel coordinates to `FloodFill.executeFloodFillAtPoint()` (ADR-002).
  - Renamed `fillPointerDown` → `isFillPointerDown` (ADR-004)
- ADRs applied: ADR-002, ADR-004
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: None.

---

## image-loader.js — 2026-02-28

- Patterns replaced:
  - Changed `card.style.display = 'none'` to `card.classList.add('hidden')` in `buildGalleryThumbnails()` (ADR-003)
  - Changed `console.error(...)` to `console.warn(...)` in `loadColoringPage()` error handler (ADR-001)
- ADRs applied: ADR-001, ADR-003
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: User-facing error messages (toast/alert) deferred until FeedbackManager module is built (roadmap item 1.6). Current change brings logging to the correct severity level per ADR-001.

---

## app.js — 2026-02-28

- Patterns replaced:
  - Removed `console.log('Service worker registered')` success logging (ADR-001 — no success logging in production paths)
- ADRs applied: ADR-001
- Verified: Playwright e2e tests — no regressions. JS syntax check passed.
- Notes: None.

---

## Folder casing — 2026-02-28

- Patterns replaced:
  - Renamed `Docs/app_review_worldclass_status.md` to `docs/app_review_worldclass_status.md` in git tracking (ADR-006)
- ADRs applied: ADR-006
- Verified: `git ls-files docs/` confirms lowercase tracking. Two-step rename used for Windows case-insensitive filesystem.
- Notes: `worldclass_roadmap.md` was untracked; it and ADR files in `docs/decisions/` will be picked up as `docs/` when committed. The physical folder on Windows is case-insensitive so all files already coexist.
