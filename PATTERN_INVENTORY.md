# Pattern Inventory

Produced during Phase 2 of the Codebase Alignment Guide.
Date: 2026-02-28

---

## Error Handling

- **Pattern A: Promise rejection with `new Error()`** — `canvas-manager.js:115-116` (`loadOutlineImage` onerror), `canvas-manager.js:150-151` (`loadReferenceImage` onerror). Errors are constructed and rejected, but the callers handle them inconsistently (see Pattern C and Pattern D below).
- **Pattern B: Silent DOM-level error swallow** — `image-loader.js:71-72` (gallery thumbnail `img.onerror` hides the card via `card.style.display = 'none'`), `image-loader.js:44-45` (reference preview `error` event clears the image). No logging, no user feedback. Errors are silently absorbed.
- **Pattern C: `.catch()` with `console.error()`** — `image-loader.js:281-282` (failed coloring page load). Logs to developer console but shows nothing to the user.
- **Pattern D: `.catch()` with `console.warn()`** — `app.js:36-37` (service worker registration failure). Uses `warn` instead of `error` for a different severity level, but still console-only.
- **Pattern E: `.then()` with `console.log()`** — `app.js:33-34` (service worker registration success). Success logging, not error handling, but part of the same inconsistent console output strategy.

**Recommended canonical pattern:** All user-visible failures should use a single feedback mechanism (e.g., a toast/notification system) rather than `console.error`/`console.warn`. Internal/dev-only errors (service worker registration, thumbnail 404s) can remain silent or use `console.warn`. Promise rejections with `new Error()` (Pattern A) are the correct approach for async operations but need consistent handling at the call site. Standardise on: (1) throw/reject for async operations, (2) a `showUserError(message)` function for user-visible failures, (3) `console.warn` only for non-critical developer diagnostics.

---

## Data Fetching

No external API calls exist. All data operations are local. Two patterns are used for loading assets:

- **Pattern A: `new Image()` with `.src` and `.onload` / `.onerror` callbacks** — `canvas-manager.js:87-120` (outline image), `canvas-manager.js:128-155` (reference image), `undo-manager.js:38-50` (restoring undo snapshot). This is the dominant pattern for loading images into canvases.
- **Pattern B: `FileReader.readAsDataURL()` with `.onload` callback** — `image-loader.js:94-98` (user upload), `image-loader.js:115-118` (reference upload). Used for reading user-selected files from the device.

**Recommended canonical pattern:** Both patterns are appropriate for their respective use cases (Pattern A for loading URLs/data URLs, Pattern B for reading user files). No inconsistency here — each serves a distinct purpose. Both are consistently callback-based (not async/await). Maintain as-is.

---

## State Management

- **Pattern A: Module-private variables in IIFE closures** — Used by every module. Examples: `activeTool` in `toolbar.js:10`, `currentColor` in `color-palette.js:32`, `brushSize` in `brush-engine.js:11`, `snapshotStack` in `undo-manager.js:10`, `imageRegion` in `canvas-manager.js:24`, drag/resize state in `image-loader.js:22-33`. Access controlled via public getter/setter methods. This is the universal pattern.
- **Pattern B: CSS class toggling for UI visibility state** — `classList.add('hidden')` / `classList.remove('hidden')` used consistently in `toolbar.js`, `image-loader.js` for modals, panels, and controls. CSS rule `.hidden { display: none }` drives the toggle.
- **Pattern C: Inline `style.display` manipulation** — `image-loader.js:72` uses `card.style.display = 'none'` directly instead of the `hidden` class. This is the only instance and breaks the CSS class convention.
- **Pattern D: CSS class toggling for selection state** — `classList.add('active')` / `classList.remove('active')` for tool buttons in `toolbar.js:32-41`. `classList.toggle('selected', condition)` for color swatches in `color-palette.js:72`. Two different class names (`active` vs `selected`) for conceptually similar "currently chosen" states, though they apply to different UI elements (tools vs colors).

**Recommended canonical pattern:** Pattern A (IIFE closures with getters/setters) is correct and consistent — keep it. Pattern B (CSS class toggling) is the correct approach for UI visibility — standardise on this and eliminate Pattern C. The lone `style.display = 'none'` in `image-loader.js:72` should use `classList.add('hidden')` instead. Pattern D is acceptable — `active` and `selected` convey different semantics (tool mode vs colour choice).

---

## Authentication / Authorisation

No authentication or authorisation exists anywhere in the codebase. The app is fully client-side with no user accounts, no API keys, and no access control. Not applicable at this stage.

---

## Formatting and Display

### Coordinate Conversion (CSS → Canvas pixel space)

- **Pattern A: Dedicated helper function** — `brush-engine.js:94-102` has `getCanvasCoords(event)` which uses `getBoundingClientRect()` and `canvas.width / rect.width` scaling. Returns an `{ x, y }` object. Reused across `handlePointerDown` and `handlePointerMove`.
- **Pattern B: Inline calculation** — `flood-fill.js:20-25` performs the same math inline within `executeFloodFillAtPoint()`: `getBoundingClientRect()`, `canvas.width / rect.width`, `Math.floor()`. Identical logic, not extracted into a function.
- **Pattern C: Partial inline — CSS coords only** — `toolbar.js:141-143` computes `cssX`/`cssY` relative to the canvas `getBoundingClientRect()` but does not convert to canvas pixel space, passing CSS coords to `FloodFill.executeFloodFillAtPoint()` which then does its own conversion (Pattern B).

**Recommended canonical pattern:** Extract a single shared `canvasCoordsFromPointerEvent(event)` utility (or add it to `CanvasManager`) and use it everywhere. The current duplication means a coordinate conversion bug would need to be fixed in multiple places. `FloodFill.executeFloodFillAtPoint()` should accept canvas pixel coordinates (already converted), not CSS coordinates.

### Canvas Context Reset Pattern

- **Pattern A: `ctx.save(); ctx.setTransform(1,0,0,1,0,0); ... ctx.restore()`** — Used in `canvas-manager.js` (lines 74-78, 189-211, 215-228, 234-237, 242-245, 288-296), `flood-fill.js` (lines 40-43, 45-48, 92-95), `brush-engine.js` (lines 41-47, 60-82), `undo-manager.js` (lines 42-46). This 3-line boilerplate is repeated ~15 times across 4 files. The pattern is consistent (good), but there is no shared helper to reduce repetition.

**Recommended canonical pattern:** The pattern itself is correct and consistent everywhere. Consider extracting a helper like `CanvasManager.withNativeTransform(ctx, callback)` to reduce boilerplate, but this is a DRY improvement, not a consistency fix.

### Visibility Toggling

- **Pattern A: CSS `hidden` class** — Used in `toolbar.js` (clear modal), `image-loader.js` (gallery modal, reference panel, brush size control). Driven by `.hidden { display: none }` in `styles.css:273`.
- **Pattern B: Direct `style.display` manipulation** — `image-loader.js:72` (`card.style.display = 'none'`). Only one occurrence.

**Recommended canonical pattern:** Standardise on Pattern A (CSS class toggling) for all visibility changes. Replace `image-loader.js:72` with `card.classList.add('hidden')`.

### Color Representation

All colors use hex string format (`#RRGGBB`) consistently throughout: `color-palette.js` swatch array, `flood-fill.js:221-229` `hexToRgba()` conversion, `brush-engine.js:43` and `brush-engine.js:62` via `ColorPalette.getCurrentColor()`. No inconsistency.

---

## Naming Conventions

### Overall Assessment

Naming is largely consistent across the codebase:

- **Files**: `kebab-case.js` — consistent across all 9 JS modules
- **Module names**: `PascalCase` — consistent (`CanvasManager`, `BrushEngine`, `FloodFill`, etc.)
- **Functions**: `camelCase` with intent-based names — consistent and descriptive (e.g., `executeFloodFillAtPoint`, `makeWhitePixelsTransparent`, `preventPinchZoom`)
- **Constants**: `UPPER_SNAKE_CASE` — consistent (`MAX_CANVAS_DIMENSION`, `FILL_TOLERANCE`, `CACHE_VERSION`, etc.)
- **CSS classes/IDs**: `kebab-case` — consistent throughout `styles.css` and `index.html`

### Deviations Found

- **Boolean naming**: Several booleans do not follow the `is/has/can/should` prefix convention:
  - `fillPointerDown` in `toolbar.js:117` — should be `isFillPointerDown`
  - `scanLeft` / `scanRight` in `flood-fill.js:125-126` — should be `isScanningLeft` / `isScanningRight`
  - `isDraggingReferencePanel` in `image-loader.js:22` — **correct** (follows convention)
  - `isResizingReferencePanel` in `image-loader.js:23` — **correct** (follows convention)
  - `isDrawing` in `brush-engine.js:10` — **correct** (follows convention)

- **Event handler naming inconsistency**:
  - Pattern A: Named function references — `handlePointerDown`, `handlePointerMove`, `handlePointerUp` in `brush-engine.js:18-22`. `handleReferencePanelPointerDown`, `handleReferencePanelResizePointerDown`, etc. in `image-loader.js:127-131`. Clear, descriptive, traceable in stack traces.
  - Pattern B: Inline anonymous arrow functions — used throughout `toolbar.js` (lines 30, 37, 57, 69, 73, 79, 84, 95, 106) and `color-palette.js:53`. Shorter, but harder to debug and not reusable.

**Recommended canonical pattern:** All naming conventions are followed well except: (1) rename boolean variables `fillPointerDown`, `scanLeft`, `scanRight` to use `is` prefix; (2) prefer named function references (Pattern A) over anonymous arrows for event handlers to improve debuggability, though the inline approach is acceptable for truly simple one-liners.

---

## File and Folder Structure

### Overall Assessment

The folder structure follows a clear and consistent logic:

```
/                       — Root: HTML, config, manifest, service worker
├── js/                 — All application JS modules (flat, no nesting)
├── css/                — Single stylesheet
├── images/
│   ├── coloring-pages/ — Coloring template SVGs
│   └── icons/          — PWA icons
├── scripts/            — Dev tooling (static server)
├── tests/              — Playwright e2e specs
└── Docs/               — Project documentation
```

### Deviations Found

- **`Docs/` vs `docs/` casing mismatch** — `Docs/` (capital D) contains project documentation (`app_review_worldclass_status.md`, `worldclass_roadmap.md`). `docs/decisions/` (lowercase d) was created for ADRs. On Windows (case-insensitive) these merge into one folder. On Linux/macOS (case-sensitive) they would be separate directories. This must be standardised to one casing.
- **`image-loader.js` has multiple concerns** — This module handles: (1) gallery modal rendering and interaction, (2) coloring page file upload, (3) reference image file upload, (4) reference panel drag/resize/close behavior. The drag/resize logic (lines 126–227) is a distinct UI interaction concern that could be separated. However, the coupling is manageable at the current codebase size.
- **No separation between "modules" and "utilities"** — All JS files sit flat in `js/`. There is no `js/utils/` or similar. At the current size (9 files) this is fine, but may need revisiting as modules are added.

**Recommended canonical pattern:** (1) Standardise folder casing to lowercase `docs/` and move existing `Docs/` contents into it. (2) Keep `js/` flat for now — unnecessary nesting at this codebase size would add friction. (3) The `image-loader.js` multi-concern issue is noted but not urgent to split at this size.

---

## Additional Patterns Discovered

### DOM Element Querying

- **Single pattern: `document.getElementById()`** — Used exclusively across all modules. No `querySelector`, `querySelectorAll`, or other DOM query APIs appear. This is fully consistent.

### Pointer Event Handling

- **Pattern A: Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`)** — Used in `brush-engine.js`, `image-loader.js`, `toolbar.js`, `color-palette.js`. This is the dominant and correct pattern for cross-device (mouse + touch + pen) input.
- **Pattern B: Touch Events API (`touchmove`, `touchend`)** — Used in `touch-guard.js:18, 45` for gesture prevention. These are touch-specific events needed because `preventDefault()` on touch events is the only way to suppress browser gestures like pinch-zoom.
- **Pattern C: Gesture Events (`gesturestart`, `gesturechange`)** — Used in `touch-guard.js:24, 28`. Safari-specific events for multi-touch gesture prevention.

**Recommended canonical pattern:** All three patterns are appropriate for their use cases. Pointer Events (Pattern A) for application interaction, Touch/Gesture Events (Patterns B/C) specifically for browser gesture suppression. No inconsistency.

### Pointer Capture

- **Consistent pattern: `element.setPointerCapture?.(event.pointerId)` / `element.releasePointerCapture?.(event.pointerId)`** — Used in `brush-engine.js:29, 87` and `image-loader.js:149, 166, 216, 223`. Optional chaining for safety. Consistent.

### Async Patterns

- **Pattern A: `new Promise()` constructor with callbacks** — `canvas-manager.js:86, 126` (image loading), `undo-manager.js:40` (undo restoration). Manual promise wrapping around callback-based APIs.
- **Pattern B: `.then().catch()` chaining** — `image-loader.js:277-283` (load coloring page), `app.js:31-39` (service worker registration).
- **No async/await** — The codebase uses zero `async`/`await`. All async code uses promise constructors and `.then()/.catch()` chains.

**Recommended canonical pattern:** The callback-wrapping approach (Pattern A) is necessary because the underlying APIs (`Image.onload`, `Image.onerror`) are callback-based. Pattern B for consumption is standard. The absence of `async`/`await` is consistent — the codebase predates modern async conventions or deliberately avoids them. Either approach is acceptable, but if new async code is written, `async`/`await` would be more readable. This should be decided in an ADR before introducing it.

### Module Structure

- **Consistent pattern: IIFE returning a public API object** — All 9 application modules follow `const ModuleName = (() => { ... return { publicMethod }; })();`. Modules expose `initialize()` as the setup entry point (except `UndoManager`, which needs no initialization). No deviations.

---

## Summary of Inconsistencies Requiring ADRs

| # | Category | Issue | Severity |
|---|----------|-------|----------|
| 1 | Error handling | Mixed `console.error`/`console.warn`/silent swallow with no user feedback mechanism | Medium |
| 2 | Coordinate conversion | Same CSS→canvas math duplicated in 3 places with no shared utility | Medium |
| 3 | Visibility toggling | One instance of `style.display = 'none'` vs consistent `classList` toggling | Low |
| 4 | Boolean naming | 3 booleans missing `is/has/can/should` prefix | Low |
| 5 | Event handler style | Mix of named functions and inline anonymous arrows | Low |
| 6 | Folder casing | `Docs/` vs `docs/` inconsistency | Low |
| 7 | Canvas context reset | `save/setTransform/restore` boilerplate repeated ~15 times with no helper | Low (DRY) |
