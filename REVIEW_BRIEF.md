# Review Brief — Phase 2: Advanced Features & Polish

## Session date
2026-03-02

## Summary

Phase 2 adds 7 new ADRs (ADR-017 through ADR-023), 5 new IIFE modules, 2 Web Workers, a template metadata catalog, and 3 new characterisation test files (34 new tests, bringing total to 119). Key features: region-aware bounding-box undo, eyedropper tool, 5 pluggable brush presets with stamp-based rendering, off-main-thread flood fill via Web Workers, confetti celebration animations, a studio radial tool menu, and glassmorphism performance fallback. All 119 tests pass.

## Steps Completed

### Step 0: New ADRs (ADR-017 through ADR-023)
Seven new Architecture Decision Records covering every new pattern introduced in Phase 2:
- ADR-017: Bounding-Box Undo (region-aware undo commands storing only affected bbox)
- ADR-018: Eyedropper Tool (transient tool pattern with auto-switch-back)
- ADR-019: Content Pipeline (template manifest with categories, difficulty, search tags)
- ADR-020: Brush Preset System (pluggable presets with stamp-based rendering)
- ADR-021: Web Worker Pixel Processing (Transferable ArrayBuffer dispatch with sync fallback)
- ADR-022: Celebration Animations (CSS confetti in Kids mode, reduced-motion pulse)
- ADR-023: Studio Radial Menu (semicircular tool menu with keyboard nav)

### Step 1: Bounding-Box Undo (ADR-017)
- Modified `js/command-manager.js` — added `RegionCommand` class storing only the bbox portion of before/after ImageData
- Modified `js/undo-manager.js` — added `saveSnapshotForRegion()` and `finalizeWithRegion(bbox)` for region-aware commands
- Modified `js/brush-engine.js` — tracks stroke bbox and uses region commands for all strokes
- Modified `js/flood-fill.js` — uses region commands with fill bbox
- **New test file:** `tests/characterisation/bbox-undo.spec.js` (7 tests)

### Step 2: Dark Mode Completion
- Updated `css/styles.css` — completed `[data-theme="dark"]` overrides for all UI elements
- All glassmorphism panels, modals, gallery cards, and tool buttons have dark mode variants
- Mode switch and theme toggle respect each other independently

### Step 3: Eyedropper Tool (ADR-018)
- Modified `js/toolbar.js` — added eyedropper as a transient tool that auto-switches back to previous tool after picking a color
- Modified `js/canvas-manager.js` — added `getPixelColorAt()` for single-pixel color reading
- Modified `js/brush-engine.js` — eyedropper pointer handling with tap detection
- **New test file:** `tests/characterisation/eyedropper.spec.js` (10 tests)

### Step 4: Content Pipeline & Gallery Enhancements (ADR-019)
- **New file:** `templates/manifest.json` — metadata catalog for 8 templates with categories, difficulty ratings, tags
- Modified `js/image-loader.js` — gallery search, sort (A-Z, by category, by difficulty), template cards with metadata
- Modified `css/styles.css` — gallery controls (search input, sort dropdown) visible in studio mode only

### Step 5: Brush Presets & Textures (ADR-020)
- Modified `js/brush-engine.js` (317 → 629 LOC) — added `BRUSH_PRESETS` object with 5 presets:
  - **Marker**: original `lineTo()` path (backward compatible)
  - **Crayon**: grainy textured stamps with random scatter
  - **Watercolor**: soft translucent overlapping stamps (globalAlpha 0.15)
  - **Pencil**: thin directional strokes with fine spacing
  - **Sparkle**: hue-varied scattered dots with extraPadding for bbox expansion
- Modified `js/toolbar.js` — preset switching, keyboard shortcuts 1-5, `setActivePreset()`/`getActivePreset()`
- Modified `js/mode-manager.js` — kids preset bubbles and studio preset bar delegation
- Modified `js/progress-manager.js` — saves/restores active preset
- Modified `index.html` — preset UI for classic, kids, and studio modes
- Modified `css/styles.css` — preset button styles for all three UIs
- **New test file:** `tests/characterisation/brush-presets.spec.js` (17 tests)

### Step 6: Web Workers for Pixel Ops (ADR-021)
- **New file:** `workers/fill-worker.js` (206 LOC) — self-contained scanline fill with Transferable ArrayBuffers
- **New file:** `workers/mask-worker.js` (51 LOC) — self-contained outline mask computation
- Modified `js/flood-fill.js` — added `initialize()`, worker dispatch with `isFillInProgress` guard, 100ms spinner delay, sync fallback in `?classic=1` mode, pending fill queue (latest wins)
- Modified `js/canvas-manager.js` — mask worker for `computeOutlineMaskAsync()`, sync fallback for `handleWindowResize()`
- Modified `js/app.js` — added `FloodFill.initialize()` to boot sequence
- Modified `service-worker.js` — added worker files to cache, `/workers/` to static asset detection

### Step 7: UI Polish (ADR-022, ADR-023)
**7a: Kids Celebration Animations (ADR-022)**
- **New file:** `js/celebration-manager.js` (151 LOC) — CSS confetti particles on `fill:complete` and `save:complete` events in Kids mode. Max 30 particles (15 on low-perf). `prefers-reduced-motion` degrades to border glow pulse. Particles removed from DOM after 2s animation.

**7b: Studio Radial Menu (ADR-023)**
- **New file:** `js/radial-menu.js` (233 LOC) — semicircular tool menu (5 items: Brush, Eraser, Clear, Eyedropper, Fill) opening from dock trigger. Staggered 40ms pop-in. Full keyboard nav: arrow keys, Home/End, Enter/Space, Escape, Tab focus trap.

**7c: Glassmorphism Performance Fallback**
- Added `detectPerformanceTier()` in `js/app.js` — sets `data-performance="low"` when `deviceMemory < 4` or `hardwareConcurrency < 4`
- CSS fallback: `[data-performance="low"]` replaces all `backdrop-filter: blur()` with opaque `var(--color-surface)` panels

### Step 8: Documentation & Final Verification
- Updated `ARCHITECTURE.md` — new modules (CelebrationManager, RadialMenu, FillWorker, MaskWorker), updated module descriptions (FloodFill, BrushEngine, Toolbar, ProgressManager), initialization order, file index, folder index, test counts (87 → 119), ADR range (1-16 → 1-23), cache version (v14 → v17), new constants
- Wrote this `REVIEW_BRIEF.md`

## New Files

| File | Module | ~LOC | Step |
|------|--------|------|------|
| `Docs/decisions/ADR-017` through `ADR-023` | — | — | 0 |
| `templates/manifest.json` | Data | 80 | 4 |
| `workers/fill-worker.js` | FillWorker | 206 | 6 |
| `workers/mask-worker.js` | MaskWorker | 51 | 6 |
| `js/celebration-manager.js` | CelebrationManager | 151 | 7 |
| `js/radial-menu.js` | RadialMenu | 233 | 7 |
| `tests/characterisation/bbox-undo.spec.js` | Tests | 7 tests | 1 |
| `tests/characterisation/eyedropper.spec.js` | Tests | 10 tests | 3 |
| `tests/characterisation/brush-presets.spec.js` | Tests | 17 tests | 5 |

## Modified Files

| File | Changes |
|------|---------|
| `css/styles.css` | +127 lines: dark mode completion, preset styles, confetti keyframes, radial menu, performance fallback |
| `index.html` | +24 lines: preset UIs (classic/kids/studio), celebration container, radial menu, radial trigger, new script tags |
| `js/app.js` | Added `detectPerformanceTier()`, `FloodFill.initialize()`, `CelebrationManager.initialize()`, `RadialMenu.initialize()` |
| `js/brush-engine.js` | Complete rewrite: +312 LOC for 5 brush presets, stamp rendering, pressure, `getEffectivePreset()` |
| `js/canvas-manager.js` | +60 LOC: mask worker, `computeOutlineMaskAsync()`, `getPixelColorAt()` (ADR-018) |
| `js/command-manager.js` | +50 LOC: `RegionCommand` class, `saveSnapshotForRegion`, `finalizeWithRegion` (ADR-017) |
| `js/flood-fill.js` | +207 LOC: worker dispatch, `initialize()`, async path, `isFillInProgress`, spinner (ADR-021) |
| `js/image-loader.js` | Gallery search, sort, template metadata, category headers |
| `js/mode-manager.js` | +100 LOC: kids preset bubbles, studio preset bar, preset visibility/active state sync |
| `js/progress-manager.js` | Save/restore `activePreset` |
| `js/toolbar.js` | Eyedropper tool, preset switching, `setActivePreset()`, keyboard 1-5, `save:complete` event |
| `js/undo-manager.js` | `saveSnapshotForRegion()`, `finalizeWithRegion()` facade methods (ADR-017) |
| `service-worker.js` | Cache v15→v17, added 4 new files to cache list, `/workers/` static asset detection |
| `ARCHITECTURE.md` | Updated for all Phase 2 changes |

## ADRs Applied

| ADR | Where Applied |
|-----|---------------|
| ADR-001 | console.warn for worker errors and fallback messages |
| ADR-002 | `getCanvasPixelCoords()` in eyedropper pointer handling |
| ADR-003 | `.hidden` class on preset controls, radial menu, celebration container |
| ADR-004 | `isFillInProgress`, `isWorkerReady`, `isMaskWorkerReady`, `isReducedMotion`, `isScanningLeft/Right` |
| ADR-005 | Named handler functions in radial menu, celebration manager, worker handlers |
| ADR-007 | `withNativeTransform` in pixel reads for eyedropper, worker data extraction |
| ADR-008 | Outline mask in brush presets, `getEffectivePreset()` for edge-aware clipping |
| ADR-013 | Reduced-motion pulse, radial menu keyboard nav, focus trap, ARIA roles |
| ADR-014 | EventBus events: `fill:complete`, `save:complete`, `preset:changed`, `tool:changed` |
| ADR-015 | Kids/Studio preset UIs, celebration mode gating, radial menu studio-only |
| ADR-017 | Region commands in brush strokes and flood fill |
| ADR-018 | Eyedropper with transient tool auto-switch-back |
| ADR-019 | Template manifest with categories and difficulty |
| ADR-020 | 5 brush presets with pluggable `renderStamp()` interface |
| ADR-021 | Fill worker, mask worker, Transferable protocol, sync fallback |
| ADR-022 | Confetti celebrations in Kids mode, toast in Studio |
| ADR-023 | Radial menu with semicircular layout and keyboard nav |

## Key Design Decisions

1. **Marker preset preserves original lineTo() path** — backward compatibility with existing tests and rendering identity
2. **Eraser always uses marker rendering** — stamp-based erasure at low alpha (e.g., watercolor at 0.15) wouldn't fully remove paint
3. **Workers disabled in ?classic=1 mode** — all 119 existing tests use sync path, no test changes needed
4. **Worker error = permanent fallback** — on any worker error, the module falls back to main-thread processing permanently (no retry)
5. **Fill queue keeps latest request only** — intermediate taps during in-progress fill are dropped
6. **Canvas resize during worker fill = result discarded** — safety check prevents dimension mismatch
7. **Confetti uses CSS animations, not canvas** — pointer-events:none overlay never interferes with drawing
8. **Performance tier detection runs before module init** — CSS fallbacks apply immediately

## Test Results

- **119 passed, 0 failed**
- 4 smoke tests + 115 characterisation tests across 12 module test files
- 34 new tests added in Phase 2 (7 bbox-undo + 10 eyedropper + 17 brush-presets)

## Ready for /review
[x] Yes
