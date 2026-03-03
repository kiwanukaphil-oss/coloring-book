# REVIEW BRIEF — /review Remediation (Feature 2.5: Brush Opacity)

**Date:** 2026-03-03
**Scope:** Resolves all 4 WARNs from the /review of Feature 2.5 (Brush Opacity).

---

## What Changed

| File | Change |
|------|--------|
| `js/brush-engine.js` | Module header: added `getStrokeContext` and `setBrushOpacity/getBrushOpacity` to Key functions; removed `{ willReadFrequently: true }` from scratchCtx creation; `handlePointerUp`: added `else` branch that explicitly calls `restoreOutlinePixels` for eraser strokes |
| `js/toolbar.js` | Module header: added `setBrushOpacity` to Key functions list |
| `Docs/decisions/ADR-027-brush-opacity.md` | "Outline restoration" section rewritten to document both-tool coverage; "Scratch canvas sizing" updated to remove the `willReadFrequently` hint and explain why it is not used |
| `tests/characterisation/brush-engine.spec.js` | Added `'eraser stroke does not modify outline pixels (ADR-008)'` test |
| `ARCHITECTURE.md` | Test counts: brush-engine.spec.js 16→17, characterisation 146→147, total 150→151 |
| `tests/characterisation/image-loader.spec.js` | Fixed pre-existing flaky test: replaced synchronous `page.evaluate()` with `page.waitForFunction()` in `'uploading a reference image shows the reference panel'` — the upload handler uses `FileReader.readAsDataURL` (async) so the panel visibility check must wait for the `onload` callback |

## Findings Resolved

| # | Finding | Resolution |
|---|---------|------------|
| W1 | `restoreOutlinePixels` not called for eraser — no comment + no test | Added explicit `else` branch in `handlePointerUp` that calls `restoreOutlinePixels` for the eraser; added characterisation test |
| W2 | `setBrushOpacity`/`getBrushOpacity` missing from brush-engine.js header | Added both to Key functions list; also added `getStrokeContext` |
| W3 | `setBrushOpacity` missing from toolbar.js header | Added to Key functions list |
| W4 | `willReadFrequently: true` on scratchCtx unnecessary / potentially counterproductive | Removed from `scratchCanvas.getContext('2d', ...)` call; ADR-027 updated to explain why it is not used |

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-008 | `restoreOutlinePixels` now explicitly called for eraser strokes in `handlePointerUp` `else` branch |
| ADR-027 | Updated to match corrected implementation (both-tool outline restoration, no `willReadFrequently`) |

## Test Results

```
151 passed, 0 failed, 0 flaky
  — 1 new eraser outline-preservation test: passes
  — image-loader flaky test: now deterministic (waitForFunction fix)
```

---

# REVIEW BRIEF — Feature 2.5: Brush Opacity

**Date:** 2026-03-03
**Scope:** Per-stroke brush opacity slider (5%–100%) using a scratch-canvas compositing
approach to prevent within-stroke alpha compounding.

---

## What Changed

### New Files

| File | Purpose |
|------|---------|
| `Docs/decisions/ADR-027-brush-opacity.md` | Scratch-canvas design, eraser bypass, outline restoration deferral, rules |

### Modified Files

| File | Change Summary |
|------|----------------|
| `js/brush-engine.js` | Added `scratchCanvas`/`scratchCtx`/`brushOpacity` state; `getStrokeContext()`; `setBrushOpacity`/`getBrushOpacity`; modified `handlePointerDown` to create scratch canvas for brush tool; `renderMarkerSegment` and `renderStampedSegment` now target `getStrokeContext()` with per-segment `restoreOutlinePixels` removed; `handlePointerUp` composites scratch canvas at `brushOpacity` and runs outline restoration once |
| `js/toolbar.js` | Added `setupBrushOpacitySlider()`, `setBrushOpacity()` public function; `#brush-opacity-control` shown for brush only (hidden for eraser/fill/eyedropper) via `setActiveTool()` |
| `index.html` | Added `#brush-opacity-control` div (range 5–100%, step 5) after `#brush-size-control` |
| `css/styles.css` | Added `.brush-opacity-control`, `.brush-opacity-slider`, `.brush-opacity-value` styles |
| `tests/characterisation/brush-engine.spec.js` | Added 10 new tests covering opacity API, clamping, UI visibility, stroke pixel content at 1.0 and 0.5, and scratch canvas DOM cleanup |
| `ARCHITECTURE.md` | Updated BrushEngine/Toolbar module entries; data flow step 5; file table; ADR count 26→27; test count 140→150 |

---

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-007 | `CanvasManager.withNativeTransform()` used for all scratch canvas composite and outline restoration calls |
| ADR-008 | `restoreOutlinePixels` deferred from per-segment to once per stroke on `handlePointerUp` — result is identical |
| ADR-013 | `aria-label="Brush opacity"` on the new slider input |
| ADR-017 | Stroke bbox accumulation unchanged; region command finalized normally on `handlePointerUp` |
| ADR-020 | Preset `renderStamp()` functions unchanged — they draw to `getStrokeContext()` at their own internal alpha |
| ADR-027 | (New) Governs scratch-canvas compositing, eraser bypass, opacity range, and coordination responsibility |

---

## Decisions Not Covered by Existing ADRs

All decisions are covered by ADR-027 (new). No inline-only decisions remain.

---

## Known Limitations

- Eraser opacity not supported (by design — partial erase would be confusing)
- Window resize during an active stroke may misalign the scratch canvas (edge case; result is discarded at stroke end)
- Opacity not persisted in saved projects (no ProgressManager integration in this phase)

---

## Test Results

```
150 passed, 0 failed  (22.9s)
  — 140 pre-existing tests: all pass
  — 10 new brush-engine opacity characterisation tests: all pass
```

---

# REVIEW BRIEF — /review Remediation (Phase 3 Deferred Items Follow-up)

**Date:** 2026-03-02
**Scope:** Resolves all findings from the /review run after Phase 3 deferred-item
implementation: 4 real FAILs, 1 false-positive FAIL, and 10 WARNs.

---

## What Changed

### Modified Files

| File | Change Summary |
|------|----------------|
| `Docs/decisions/ADR-024-layer-architecture.md` | Removed stale rule "Layer add/delete/reorder do not push undo commands"; updated to reflect ADR-026 (F5) |
| `Docs/decisions/ADR-026-layer-structural-undo.md` | Added ADR-011 interface deviation note; renamed `imageData`→`canvasData` in snapshot format (W1, F1) |
| `Docs/decisions/ADR-025-layer-panel-ui.md` | Updated Consequences LOC from ~170 to ~210 (W2) |
| `js/layer-manager.js` | Renamed snapshot field `imageData`→`canvasData` in `getLayerSnapshot()`; added `MAX_LAYERS` guard to `insertLayer()`; removed dead initial z-index value (F1, F2, W7) |
| `js/canvas-manager.js` | Clarified `clearAllColoringCanvases()` comment to explain why it intentionally does not clear outline/reference/interaction canvases (F3 false positive — functions are NOT duplicates) |
| `js/command-manager.js` | Added inline ADR-011 deviation note to `createLayerDeleteCommand` (W3) |
| `js/layer-panel.js` | Extracted `handleLayerDelete` and `handleLayerDrop` as named functions (ADR-005, W4); added explicit `getLayerCount() <= 1` guard in delete handler (W6); fixed `dragleave` to only remove `.drag-over` when pointer truly leaves the `<li>` (W5); added `dragend` cleanup handler (W5) |
| `tests/characterisation/layer-manager.spec.js` | Updated snapshot field check `imageData`→`canvasData`; added pixel-data accessibility assertion to undo test (F1, W9) |
| `tests/characterisation/toolbar.spec.js` | Added layer-0-is-white assertion to the clear test (W8) |
| `ARCHITECTURE.md` | Added ADR-026 to overview paragraph undo reference (W10) |

---

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-005 | `handleLayerDelete` and `handleLayerDrop` extracted as named functions in `layer-panel.js` |
| ADR-024 | `insertLayer()` now enforces `MAX_LAYERS` guard matching `addLayer()` |
| ADR-026 | ADR-011 deviation documented in both ADR-026 and `command-manager.js` inline comment |

---

## F3 False Positive

The review flagged `clearAllColoringCanvases()` as an exact duplicate of `clearAllCanvases()`.
This is incorrect: `clearAllCanvases()` also clears the outline canvas, interaction canvas,
reference canvas, and nulls the outline mask — it is used on template load. The Clear button
must NOT erase the coloring page outline, so `clearAllColoringCanvases()` intentionally calls
only `LayerManager.clearAllLayers()`. The function was kept; its comment was improved to make
the distinction explicit.

---

## Decisions Not Covered by Existing ADRs

None — all changes either correct conformance to existing ADRs or document previously
undocumented intent.

---

## Test Results

```
140 passed, 0 failed
```

---

# REVIEW BRIEF — Phase 3 Completion (Deferred Items)

**Date:** 2026-03-02
**Scope:** Implementation of the four known limitations deferred from Phase 3.

---

## What Changed

### New Files

| File | Purpose |
|------|---------|
| `Docs/decisions/ADR-026-layer-structural-undo.md` | Documents why only delete is undoable; rationale for no add/reorder undo; snapshot format and command interface |

### Modified Files

| File | Change Summary |
|------|----------------|
| `Docs/decisions/ADR-025-layer-panel-ui.md` | Added drag-to-reorder section; updated interactions table and rules |
| `js/layer-manager.js` | Added `getLayerSnapshot(index)` and `insertLayer(index, snapshot)` |
| `js/command-manager.js` | Added `createLayerDeleteCommand(layerIndex, snapshot)` factory |
| `js/layer-panel.js` | Delete handler now coordinates undo (snapshot → command → delete); added HTML5 drag-to-reorder events; added `CommandManager` to Dependencies |
| `js/canvas-manager.js` | Added `clearAllColoringCanvases()` proxy to `LayerManager.clearAllLayers()` |
| `js/toolbar.js` | Clear confirmation handler now calls `UndoManager.clearHistory()` + `CanvasManager.clearAllColoringCanvases()` instead of saveSnapshot + active-layer clear |
| `js/mode-manager.js` | `switchMode('kids')` and `initialize()` now call `LayerManager.setActiveLayer(0)`; added `LayerManager` to Dependencies |
| `css/styles.css` | Added `.layer-list-item.drag-over` style (dashed outline for drop-target feedback) |
| `tests/characterisation/layer-manager.spec.js` | Added 5 new tests for `getLayerSnapshot`, `insertLayer`, and layer-delete undo |
| `tests/characterisation/toolbar.spec.js` | Updated "confirming clear" test to match new behavior (history wiped, not saved) |
| `ARCHITECTURE.md` | ModeManager dependency added LayerManager; LayerPanel dependency added CommandManager; ADR count 25→26; test counts updated |

---

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-003 | `.drag-over` CSS class toggled via classList (not inline style) |
| ADR-007 | `insertLayer()` uses raw save/setTransform/restore with documented circular-dependency exception comment |
| ADR-011 | `createLayerDeleteCommand` is self-contained: undo/redo closures call LayerManager directly |
| ADR-024 | `clearAllColoringCanvases()` added; Kids mode layer-0 enforcement |
| ADR-026 | (New) Governs layer-delete undo design, snapshot format, and coordination responsibility |

---

## Decisions Not Covered by Existing ADRs

All decisions are covered by ADR-026 (new) or existing ADRs. No inline-only decisions remain.

---

## Test Results

```
140 passed, 0 failed  (42.7s)
  — 135 pre-existing tests: all pass (1 updated to match new Clear behavior)
  — 5 new layer-manager characterisation tests: all pass
```

---

## Known Limitations (updated)

- Layer add and reorder are not undoable (see ADR-026 for rationale)
- No drag-and-drop reordering on touch devices (HTML5 drag events are pointer-based)

---

# REVIEW BRIEF — Phase 3 Code Review Remediation

**Date:** 2026-03-02
**Scope:** Remediation of all 9 FAILs and 6 WARNs identified in the Phase 3 code review.

---

## What Changed

### Modified Files

| File | Change Summary |
|------|----------------|
| `Docs/decisions/ADR-007-canvas-context-reset.md` | Added "LayerManager circular dependency" exception section |
| `Docs/decisions/ADR-025-layer-panel-ui.md` | Fixed DOM example (`hidden`→`studio-only`), removed `mode-manager.js` from Consequences, updated ADR citations from ADR-003 to ADR-015 for panel visibility |
| `js/layer-manager.js` | ADR-003: replaced `style.display` with `classList.toggle('hidden')` in `setLayerVisibility`; scaleFactor: replaced `window.devicePixelRatio` with `scaleFactor` in `createLayer`; ADR-007 exception comments added to 4 functions |
| `css/styles.css` | Added `.visually-hidden { visibility: hidden }` utility class (ADR-003) |
| `js/layer-panel.js` | Replaced `deleteBtn.style.visibility = 'hidden'` with `classList.add('visually-hidden')`; removed dead empty `if (result === false) {}` block from `handleAddLayer` |
| `js/command-manager.js` | Replaced `resolvedLayerIndex` local var with default parameter `layerIndex = 0` in both factories; added null guard (`if (!layer) return`) before `.ctx` access in all 4 undo/redo closures; updated Dependencies in module header |
| `js/undo-manager.js` | Added `pendingLayerIndex = 0` reset after `pendingBeforeState = null` in `finalizePendingIfNeeded` |
| `ARCHITECTURE.md` | Fixed test counts (layer-manager 15→16, canvas-manager 9→10, undo-manager 11→12, total characterisation 130→131, total tests 134→135); fixed service-worker v17→v19; fixed DB_VERSION 1→2; added LayerManager to CommandManager dependencies |

---

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-003 | `setLayerVisibility` now uses `classList.toggle('hidden')`; `deleteBtn` uses `.visually-hidden` class |
| ADR-007 | Exception documented for LayerManager circular-dependency case |
| ADR-015 | ADR-025 now correctly cites ADR-015 (`.studio-only`) for panel visibility |

---

## Decisions Not Covered by Existing ADRs

None — all fixes either correct conformance to existing ADRs or update documentation
to match already-implemented code.

---

## Test Results

```
135 passed, 0 failed  (33.4s)
```

---

# REVIEW BRIEF — Phase 3: Full Layer System (original)

**Date:** 2026-03-02
**Scope:** Layer system with up to 5 independent drawing layers, UI panel, and all
supporting infrastructure changes.

---

## What Changed

### New Files

| File | Purpose |
|------|---------|
| `Docs/decisions/ADR-024-layer-architecture.md` | Layer canvas creation, z-index stacking, CanvasManager proxying, CommandManager layerIndex, StorageManager schema v1→v2 |
| `Docs/decisions/ADR-025-layer-panel-ui.md` | Layer panel placement, interactions, accessibility, thumbnail previews |
| `js/layer-manager.js` | IIFE module: creates/manages up to 5 coloring layer canvases; EventBus emitter |
| `js/layer-panel.js` | IIFE module: Studio-mode-only layer list UI |
| `tests/characterisation/layer-manager.spec.js` | 16 new characterisation tests for LayerManager and CanvasManager proxying |

### Modified Files

| File | Change Summary |
|------|----------------|
| `js/canvas-manager.js` | Removed `coloringCanvas`/`coloringCtx` vars; proxies to LayerManager; `clearAllCanvases` delegates to `LayerManager.clearAllLayers()`; `handleWindowResize` uses `snapshotAllLayers/restoreAllLayersFromSnapshots`; `resizeCanvasesToFitContainer` returns `{canvasWidth, canvasHeight, scaleFactor}` |
| `js/command-manager.js` | Added `layerIndex` param to `createCanvasCommand` and `createRegionCommand`; `undo()`/`redo()` look up `LayerManager.getLayerAt(this.layerIndex).ctx` |
| `js/undo-manager.js` | Added `pendingLayerIndex`; captured on `saveSnapshot`/`saveSnapshotForRegion`; passed to all `CommandManager.create*Command()` calls |
| `js/storage-manager.js` | `DB_VERSION` 1→2; upgrade handler unchanged (migration is read-time only) |
| `js/progress-manager.js` | `saveCurrentProject` saves all layer blobs as `coloringBlobs[]` + `layerMetadata[]`; `resumeProject` restores all layers sequentially with backward-compat for v1 (`project.coloringBlobs || [project.coloringBlob]`) |
| `js/app.js` | Added `LayerPanel.initialize()` after `RadialMenu.initialize()` |
| `index.html` | Removed `<canvas id="coloring-canvas">`; added `<script>` tags for both new modules; added `#layer-panel` markup with `.studio-only` class |
| `css/styles.css` | Added ~120 LOC of layer panel CSS (`.layer-panel`, `.layer-list-item`, `.layer-thumbnail`, `.layer-opacity-slider`, dark mode overrides) |
| `service-worker.js` | `CACHE_VERSION` to `coloring-book-v19`; added both new JS files to `ASSETS_TO_CACHE` |
| `ARCHITECTURE.md` | Module table, canvas diagram, initialization order, test count, ADR range all updated |
| `tests/characterisation/progress-manager.spec.js` | Updated `project.coloringBlob` to `project.coloringBlobs[0]` to reflect Phase 3 schema |

---

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-001 | All `catch` blocks use `console.warn`; failures swallowed gracefully |
| ADR-003 | Kids mode uses `.studio-only` class (existing CSS rule hides panel automatically) |
| ADR-004 | Boolean variables: `isAtLimit`, `isMaskWorkerReady`, `isSaving`, `isClassicMode` |
| ADR-005 | Named functions for all multi-step handlers; inline arrows only for trivial one-liners |
| ADR-006 | All new folders/files are lowercase |
| ADR-007 | `withNativeTransform` used in all `LayerManager` canvas operations |
| ADR-013 | 3px focus outline on all interactive layer panel elements |
| ADR-021 | Mask worker skipped in `?classic=1` tests; sync fallback used |
| ADR-024 | (New) Governs this entire feature |
| ADR-025 | (New) Governs layer panel UI |

---

## Bugs Fixed During Implementation

1. **Stale `fillColoringCanvasWhite()` call** — `loadOutlineImage` still called this
   function after it was removed in the CanvasManager refactor. Caused a `ReferenceError`
   in `image.onload`, silently preventing `imageRegion` from ever being set. Fixed by
   removing the dead call; `LayerManager.clearAllLayers()` (called via `clearAllCanvases`)
   already fills layer-0 white.

2. **Phase 2 characterisation test schema mismatch** — `progress-manager.spec.js` checked
   `project.coloringBlob` (singular) which no longer exists. Updated to
   `project.coloringBlobs[0]` to match Phase 3 schema.

---

## Decisions Not Covered by Existing ADRs

All decisions were covered by the new ADR-024 and ADR-025 written before implementation.
No inline-only decisions remain.

---

## Test Results

```
135 passed, 0 failed  (37.9s)
  — 119 pre-existing tests: all pass
  — 16 new layer-manager characterisation tests: all pass
```

---

## Known Limitations (documented in ARCHITECTURE.md, deferred to Phase 4)

- Layer add/delete/reorder are not undoable
- "Clear" clears the active layer only (not all layers)
- Kids mode: panel hidden, drawing uses layer 0 only
- No drag-to-reorder in layer panel
