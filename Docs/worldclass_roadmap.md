# World-Class Coloring Book PWA -- Developer Roadmap

**Date**: 2026-03-02 (last updated — original plan: 2026-02-28)
**Project**: `c:\Users\kiwan\OneDrive\Drawing app`
**Status**: Phase 4 in progress — Brush Opacity (2.5) complete, Social Sharing (3.3) next

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Current State & What's Been Done](#2-current-state--whats-been-done)
3. [Phase 0 -- Stability & Trust](#3-phase-0----stability--trust)
4. [Tier 1 -- Core Polish](#4-tier-1----core-polish)
5. [Tier 2 -- Engaging Features](#5-tier-2----engaging-features)
6. [Tier 3 -- Delight & Retention](#6-tier-3----delight--retention)
7. [Tier 3B -- Progress Saving & Cloud Storage](#7-tier-3b----progress-saving--cloud-storage)
8. [Tier 4 -- Platform Excellence](#8-tier-4----platform-excellence)
9. [Build Order & Phasing](#9-build-order--phasing)
10. [Module Dependency Map](#10-module-dependency-map)
11. [Conventions & Patterns](#11-conventions--patterns)
12. [Testing Strategy](#12-testing-strategy)
13. [Critical Files Reference](#13-critical-files-reference)

---

## 1. Architecture Overview

### Tech Stack
- **Pure vanilla JS** -- zero npm dependencies, no build system
- **Module pattern**: every JS file is an IIFE returning a public API object
- **Script loading**: raw `<script>` tags in `index.html` in dependency order
- **CSS**: single file `css/styles.css`, CSS design tokens on `:root` (ADR-010), no preprocessor
- **PWA**: service worker (`service-worker.js`) with hybrid caching (v19), `manifest.json` for install
- **Total size**: ~8,200 LOC JS + 2,000 LOC CSS, zero runtime dependencies
- **ADRs**: 26 Architecture Decision Records in `docs/decisions/` govern all canonical patterns

### Canvas Architecture (current — 7+ layers)

```
z-index 31  ┌─────────────────────────────────┐  cursor-canvas (brush preview)
z-index 21  ┌─────────────────────────────────┐  interaction-canvas (pointer events)
z-index 11  │  ┌───────────────────────────┐  │  outline-canvas (line art, non-interactive)
z-index 2-6 │  │  ┌─────────────────────┐  │  │  layer-0..layer-N (user paint, dynamic, max 5)
z-index 1   │  │  │                     │  │  │  reference-canvas (guide overlay, 35% opacity)
            └──┘──┘─────────────────────┘──┘──┘
```

- **layer-0** (z-2): user's base paint layer. White background. Managed by `LayerManager` (ADR-024).
- **layer-1..4** (z-3..6): additional transparent user layers. Up to 5 total.
- **reference-canvas** (z-1): guide overlay at 35% opacity. Loaded separately.
- **outline-canvas** (z-11): the line art. White pixels made transparent via `makeWhitePixelsTransparent()`.
- **interaction-canvas** (z-21): captures all pointer events. Never drawn to directly.
- **cursor-canvas** (z-31): brush size/color preview circle, `pointer-events: none`.

All canvases share the same dimensions, DPI-scaled: `canvas.width = containerWidth × devicePixelRatio`,
capped at `MAX_CANVAS_DIMENSION = 2048`. All drawing uses `CanvasManager.withNativeTransform(ctx, callback)` (ADR-007).
`CanvasManager.getColoringCanvas()` / `getColoringContext()` proxy to the active layer (ADR-024).

### Current Module Initialization Order (`app.js`)

```
0. detectPerformanceTier()           -- set data-performance for glassmorphism fallback
1. TouchGuard.initialize()           -- prevent browser gesture interference
2. FeedbackManager.initialize()      -- spinner and toast elements
3. CanvasManager.initialize()        -- sets up canvas system + LayerManager (ADR-024) + mask worker
4. ViewportManager.initialize()      -- zoom/pan on canvas container (ADR-009)
5. ColorPalette.initialize()         -- build color swatch UI
6. ColorPicker.initialize()          -- HSL picker popover (ADR-012)
7. FloodFill.initialize()            -- create fill worker (ADR-021)
8. BrushEngine.initialize()          -- pointer event listeners, brush presets (ADR-020)
9. ImageLoader.initialize()          -- gallery, uploads, reference panel
10. Toolbar.initialize()             -- wire all tool buttons + preset switching
11. ModeManager.initialize()         -- Kids/Studio mode, handedness, theme (ADR-015)
12. CelebrationManager.initialize()  -- fill/save celebration events (ADR-022)
13. RadialMenu.initialize()          -- radial tool menu for Studio mode (ADR-023)
14. LayerPanel.initialize()          -- layer UI and EventBus listeners (ADR-025)
15. ProgressManager.initialize()     -- register visibilitychange listener
16. registerServiceWorker()          -- register PWA service worker
17. StorageManager.initialize()      -- async: open IndexedDB
18. checkForResumableProject()       -- async: resume modal or gallery
```

---

## 2. Current State & What's Been Done

### Phases Completed (as of 2026-03-02)

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Stability & Trust | ✅ Complete |
| Phase 1 | Core Polish | ✅ Complete |
| Phase 2 | Feedback layer | ✅ Complete |
| Phase 3 | Persistence + Layers | ✅ Complete (full layer system + deferred items) |

### Completed Features

#### Stability (Phase 0)
- **0.1 Touch guard scoping** ✅ — all listeners scoped to `#canvas-container` (ADR-001)
- **0.2 E2E Tests** ✅ — 140 tests (4 smoke + 136 characterisation) all passing
- **0.3 QA Checklist** — not tracked as a formal deliverable

#### Core Polish (Tier 1)
- **1.1 More coloring templates** ✅ — 8 bundled SVG templates (cat, dog, butterfly, fish, rocket, flower, unicorn, car)
- **1.2 Gallery categories + labels** ✅ — `templates/manifest.json` with categories, difficulty, tags
- **1.3 Eraser tool** ✅ — full eraser with marker rendering, ADR-020 brush preset
- **1.4 Redo support** ✅ — 50-step undo/redo via `CommandManager` (ADR-011)
- **1.5 Animations + transitions** ✅ — CSS-animated confetti, glassmorphism, staggered radial menu pop-in
- **1.6 Loading & feedback indicators** ✅ — `FeedbackManager`: spinner, toast, fill progress overlay
- **1.7 User-facing error messages** ✅ — `FeedbackManager.showToast()` replaces `console.error`
- **1.8 Brush cursor preview** ✅ — `cursor-canvas` at z-31 with semi-transparent circle preview
- **1.9 Enhanced color picker** ✅ — HSL picker with hue ring + SL square + 8 recent colors (ADR-012)
- **1.10 Keyboard shortcuts** ✅ — `B/F/E` tools, `[/]` brush size, `Ctrl+Z/Y` undo/redo, `Ctrl+S` save, `1-5` presets

#### Engaging Features (Tier 2)
- **2.1 Zoom and pan** ✅ — `ViewportManager`: 0.5x–5x via pinch, scroll, spacebar+drag (ADR-009)
- **2.2 Stickers & stamps** ❌ — not implemented
- **2.3 Sound effects** ❌ — not implemented
- **2.4 Eyedropper tool** ✅ — long-press on canvas picks pixel color (ADR-018)
- **2.5 Brush opacity** ✅ — scratch-canvas compositing, opacity slider 5–100% (ADR-027)
- **2.6 Edge-aware brush** ✅ — strokes clipped at outline edges via precomputed mask (ADR-008)
- **2.7 Smart fill tolerance** ✅ — `FILL_TOLERANCE = 32` in `flood-fill.js` (hardcoded; UI slider not yet added)
- **2.8 Pattern & texture fill** ❌ — not implemented
- **2.9 User layers** ✅ — up to 5 independent drawing layers via `LayerManager` (ADR-024, ADR-025, ADR-026)

#### Delight & Retention (Tier 3)
- **3.1 Achievement system** ❌ — not implemented
- **3.2 Saved artwork gallery** ✅ — "My Art" tab with resume/delete in `ImageLoader`
- **3.3 Social sharing** ❌ — **next feature**
- **3.4 Confetti & celebrations** ✅ — `CelebrationManager`: CSS confetti on fill/save, reduced-motion support (ADR-022)
- **3.5 Seasonal content** ❌ — not implemented
- **3.6 Favorites + progress tracking** ❌ — not implemented
- **3.7 Guided coloring modes** ❌ — not implemented
- **3.8 AI-generated outlines** ❌ — not implemented

#### Progress Saving (Tier 3B)
- **3B.1 Local progress saving** ✅ — IndexedDB via `StorageManager`, auto-save via `ProgressManager` (ADR-024)
- **3B.2 Saved artwork gallery** ✅ — `ImageLoader` "My Art" tab with thumbnails
- **3B.3 Cloud sync via Firebase** ❌ — not implemented

#### Platform Excellence (Tier 4)
- **4.1 Dark mode** ✅ — CSS design tokens on `:root`, `data-theme="dark"` support (ADR-010)
- **4.2 Accessibility** ✅ — ARIA roles, focus traps, roving tabindex, `prefers-reduced-motion`, 3px focus indicators (ADR-013)
- **4.3 Multi-language (i18n)** ❌ — not implemented
- **4.4 Parental controls** ❌ — not implemented
- **4.5 Web Workers** ✅ — fill worker + mask worker off main thread (ADR-021)
- **4.6 Precomputed outline masks** ✅ — `Uint8Array` mask computed async after template load (ADR-008, ADR-021)
- **4.7 Telemetry dashboard** ❌ — not implemented

#### Features beyond original roadmap (implemented during alignment phases)
- **Dual-mode UI** ✅ — Kids mode / Studio mode via `ModeManager` (ADR-015)
- **Radial tool menu** ✅ — semicircular Studio menu with keyboard nav + focus trap (ADR-023)
- **5 brush presets** ✅ — marker, crayon, watercolor, pencil, sparkle (ADR-020)
- **Event bus** ✅ — `EventBus` pub/sub with `noun:verb` naming (ADR-014)
- **Region-aware undo** ✅ — bounding-box `ImageData` commands reduce memory (ADR-017)
- **Layer-delete undo** ✅ — snapshot + `CommandManager.createLayerDeleteCommand` (ADR-026)

### Still Open
- Social sharing (3.3) — next
- Fill tolerance UI slider (2.7 partial — value hardcoded)
- Fill tolerance UI slider (2.7 partial — value hardcoded)
- Cloud sync / Firebase (3B.3) — major future phase
- Sound effects, stickers, achievements, seasonal content, i18n, parental controls

---

## 3. Phase 0 -- Stability & Trust ✅ COMPLETE

All Phase 0 items resolved. Touch guards scoped to `#canvas-container`. 140 Playwright tests passing.

---

## 4. Tier 1 -- Core Polish ✅ COMPLETE

All Tier 1 items implemented. See "Completed Features" above.

---

## 5. Tier 2 -- Engaging Features (partial)

### 2.1 Zoom and Pan ✅ COMPLETE (ADR-009)

### 2.2 Stickers & Stamps ❌

Pre-drawn SVG stamps that kids tap to place on canvas.

**New module**: `js/stamp-engine.js`
**New assets**: `images/stamps/*.svg` (15-20 stamps)
**Interaction**: when stamp tool active, show preview following pointer; tap to place via `coloringCtx.drawImage()`. Each placement calls `UndoManager.saveSnapshot()` first.

### 2.3 Sound Effects ❌

Web Audio API with mute toggle. Sounds: splat (fill), brush stroke, color pop, whoosh (undo), shutter (save), chime (gallery).

**New module**: `js/sound-manager.js`
**New assets**: `audio/*.mp3` (50-200KB total, each under 1s and 50KB)
**Critical**: mobile browsers require user gesture before audio. Call `audioContext.resume()` on first `pointerdown`. Mute toggle persists to `localStorage`.

### 2.4 Eyedropper Tool ✅ COMPLETE (ADR-018)

### 2.5 Brush Opacity ✅ COMPLETE (ADR-027)

**Problem**: brush strokes always paint at 100% opacity. No semi-transparency.

**Approach (scratch-canvas technique)**:
1. On `pointerdown`: create an offscreen scratch canvas, same dimensions as the active layer
2. During stroke (`pointermove`): paint each stamp/segment onto the scratch canvas at `globalAlpha = 1.0`
3. On `pointerup`: composite the scratch canvas onto the active coloring layer at the desired opacity
   (`globalAlpha = brushOpacity`), then discard the scratch canvas

This prevents intra-stroke opacity compounding (where overlapping brush stamps would darken mid-stroke).

**UI**: Add an opacity slider (range 10–100, step 5) to the toolbar, visible when brush or eraser is active — same pattern as the brush size slider (`#brush-size-control`). Default 100%.

**Files**: `js/brush-engine.js`, `index.html`, `css/styles.css`
**ADR**: new ADR-027 before implementation

### 2.6 Edge-Aware Brush ✅ COMPLETE (ADR-008)

### 2.7 Smart Fill Tolerance Control (partial) ✅ / ❌

Value is hardcoded (`FILL_TOLERANCE = 32`). Worker and sync fill both use it. A UI slider for user control is not yet implemented.

**Remaining work**: expose tolerance as a slider in the toolbar (visible when fill tool active, like brush size). Pass value through `FloodFill.executeFloodFillAtPoint()`.

### 2.8 Pattern & Texture Fill ❌

**New module**: `js/pattern-manager.js` -- generates `CanvasPattern` objects from procedurally drawn 16x16 tiles.
Requires refactoring `scanlineFill()` to separate region detection from pixel writing.

### 2.9 User Layers ✅ COMPLETE (ADR-024, ADR-025, ADR-026)

---

## 6. Tier 3 -- Delight & Retention (partial)

### 3.1 Achievement System ❌

Badges stored in `localStorage`. Trigger checks after save, fill, color select. Trophy case modal.

### 3.2 Saved Artwork Gallery ✅ COMPLETE

### 3.3 Social Sharing ❌ — NEXT FEATURE

**Implementation**: `navigator.share({ files: [pngFile], title: 'My coloring!', text: 'Look what I made!' })`

**Fallback chain**:
1. `navigator.share` (supported on mobile Chrome/Safari) — native share sheet
2. `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` — copy to clipboard
3. Download link fallback (already implemented via `CanvasManager.renderCompositeForSave()`)

**Files**: `js/toolbar.js` (extend save button or add share button), `index.html`, `css/styles.css`
**ADR**: document share/fallback chain before implementation

### 3.4 Confetti & Celebrations ✅ COMPLETE (ADR-022)

### 3.5 Seasonal Content + Themed Packs ❌

Date-filtered `SEASONAL_COLORING_PAGES` array in `image-loader.js`. Themed packs (underwater, space, dinosaurs).

### 3.6 Favorites + Per-Page Progress Tracking ❌

`localStorage` tracks pages colored and completion. Gallery shows progress indicators and "Recent" section.

### 3.7 Guided Coloring Modes ❌

Step-by-step color-by-number with pulsing region highlights. Tutorial data: ordered regions with center coords and color suggestions.

### 3.8 AI-Generated Outlines ❌

Text prompt → image generation API → line-art PNG → `makeWhitePixelsTransparent()`. Requires backend.

---

## 7. Tier 3B -- Progress Saving & Cloud Storage (partial)

### 3B.1 Local Progress Saving ✅ COMPLETE (StorageManager + ProgressManager, ADR-024)

### 3B.2 Saved Artwork Gallery ✅ COMPLETE

### 3B.3 Cloud Sync via Firebase ❌

Local-first, cloud-mirror architecture. Firebase Anonymous Auth (zero friction) + Firestore metadata + Storage blobs. Last-write-wins conflict resolution. Cross-device via email link (parent-initiated). See original roadmap for full Firebase security rules and sync flow.

**New module**: `js/cloud-sync.js`

---

## 8. Tier 4 -- Platform Excellence (partial)

### 4.1 Dark Mode ✅ COMPLETE (ADR-010)

### 4.2 Accessibility ✅ COMPLETE (ADR-013)

### 4.3 Multi-Language (i18n) ❌

`data-i18n="key"` attributes on HTML. `I18n.t('key')` lookups. Auto-detect `navigator.language`. RTL support.

### 4.4 Parental Controls ❌

Parent gate (math problem), settings panel with sound toggle, time limit reminder, dark mode, language, data export.

### 4.5 Performance: Web Workers ✅ COMPLETE (ADR-021)

### 4.6 Precomputed Outline Masks ✅ COMPLETE (ADR-008, ADR-021)

### 4.7 Telemetry Dashboard ❌

Local-only analytics in `localStorage`. Track: popular templates, session duration, tool usage. Behind parent gate.

---

## 9. Build Order & Phasing

| Phase | Features | Status | Focus |
|-------|----------|--------|-------|
| **0** | 0.1, 0.2, 0.3 | ✅ Complete | Stability |
| **1** | 1.1–1.10 | ✅ Complete | Core polish + feedback layer |
| **2** | 3B.1, 3B.2 | ✅ Complete | Persistence + saved gallery |
| **3** | 2.9 + ADR discipline | ✅ Complete | Layer system (5 layers), layer panel, layer-delete undo, drag-reorder |
| **4** | **2.5, 3.3** | **← Current** | Brush opacity + social sharing |
| **5** | 2.7 UI, 2.3 | Next | Fill tolerance slider + sound effects |
| **6** | 3.1, 3.5, 3.6, 3.4 extras | Future | Achievements, seasonal content, progress tracking |
| **7** | 3B.3 | Future (large) | Cloud sync via Firebase |
| **8** | 4.3, 4.4 | Future | i18n, parental controls |
| **9** | 2.2, 2.8, 3.7, 3.8, 4.7 | Future | Stickers, pattern fill, guided modes, AI outlines, telemetry |

---

## 10. Module Dependency Map

```
                    ┌─────────────────────┐
                    │       app.js         │  (bootstraps everything)
                    └──────────┬──────────┘
                               │
    ┌──────────────────────────┼──────────────────────────────┐
    │                          │                              │
┌───▼──────────┐   ┌───────────▼──────┐          ┌───────────▼────────┐
│ TouchGuard   │   │  FeedbackManager │          │  StorageManager     │
└──────────────┘   └──────────────────┘          └───────────┬────────┘
                                                             │
┌───────────────────────────────────────────┐    ┌───────────▼────────┐
│ CanvasManager (initializes LayerManager)  │    │  ProgressManager   │
│   └─ LayerManager                         │    └────────────────────┘
└───────────────┬───────────────────────────┘
                │
    ┌───────────┼───────────────────┐
    │           │                   │
┌───▼──────┐ ┌─▼──────────┐ ┌──────▼──────┐
│EventBus  │ │CommandMgr  │ │ViewportMgr  │
└──────────┘ │  + UndoMgr │ └─────────────┘
             └────────────┘
    ┌────────────────────────────────────────────┐
    │ ColorPalette  ColorPicker  FloodFill        │
    │ BrushEngine   ImageLoader  Toolbar          │
    │ ModeManager   CelebrationMgr  RadialMenu    │
    │ LayerPanel                                  │
    └────────────────────────────────────────────┘
```

---

## 11. Conventions & Patterns

All patterns are governed by ADRs in `docs/decisions/`. Key rules:

- **ADR-001**: `console.warn` for infrastructure errors; user-facing errors via `FeedbackManager.showToast()`
- **ADR-002**: `CanvasManager.getCanvasPixelCoords(event)` for CSS→canvas coord conversion
- **ADR-003**: Visibility via `classList.add/remove('hidden')` or `.visually-hidden`
- **ADR-004**: Booleans prefixed with `is/has/can/should`
- **ADR-005**: Named functions for multi-step handlers; inline arrows only for trivial one-liners
- **ADR-006**: All folders lowercase
- **ADR-007**: `CanvasManager.withNativeTransform(ctx, callback)` for all canvas pixel ops
- **ADR-010**: CSS design tokens on `:root` — no hardcoded colours or sizes
- **ADR-011**: Command objects with `undo()`/`redo()` and `layerIndex` for layer-aware restore
- **ADR-014**: EventBus `noun:verb` naming
- **ADR-015**: `.studio-only` / `.kids-only` CSS classes for dual-mode visibility

### Adding a New Module
1. Create `js/module-name.js` following the IIFE pattern
2. Add `<script src="js/module-name.js"></script>` to `index.html` at the correct position
3. Add path to `ASSETS_TO_CACHE` in `service-worker.js`; bump `CACHE_VERSION`
4. Call `ModuleName.initialize()` in `app.js` at the correct boot step
5. Write the ADR **before** implementing the pattern
6. Add characterisation tests to `tests/characterisation/module-name.spec.js`

---

## 12. Testing Strategy

### Running Tests
```bash
npx playwright test                 # Run all 140 tests headless
npx playwright test --headed        # Run with visible browser
npx playwright test --ui            # Interactive Playwright UI
```

### Test Counts (current)
- **4** smoke tests (`tests/smoke.spec.js`)
- **136** characterisation tests across 14 module spec files
- **140 total** — all passing as of 2026-03-02

### Tests to Add per Remaining Feature

| Feature | Test |
|---------|------|
| 2.5 Brush opacity | Paint stroke at 50% opacity; verify pixel alpha on composite |
| 2.7 Fill tolerance slider | Fill with low vs high tolerance; verify fill area differs |
| 2.3 Sound effects | Mock AudioContext; verify `play()` called on fill/save events |
| 3.3 Social sharing | Mock `navigator.share`; verify called with PNG file on share button click |
| 3B.3 Cloud sync | Mock Firebase; verify `syncStatus` transitions in StorageManager |

---

## 13. Critical Files Reference

| File | Lines | Role |
|------|-------|------|
| `js/app.js` | ~140 | Bootstrap entry point; 18-step init sequence |
| `js/canvas-manager.js` | ~540 | Canvas system, DPI scaling, image loading, composite rendering, outline mask |
| `js/layer-manager.js` | ~430 | Up to 5 dynamic coloring layer canvases (ADR-024) |
| `js/layer-panel.js` | ~210 | Studio-mode layer UI panel (ADR-025) |
| `js/brush-engine.js` | ~310 | 5 brush presets, stamp-based rendering, edge clipping (ADR-020) |
| `js/flood-fill.js` | ~290 | Scanline fill, Worker dispatch, region undo (ADR-017, ADR-021) |
| `js/toolbar.js` | ~350 | Tool switching, keyboard shortcuts, clear/save/undo wiring |
| `js/command-manager.js` | ~190 | Undo/redo stacks, command factories (ADR-011) |
| `js/undo-manager.js` | ~110 | Backward-compatible facade over CommandManager |
| `js/mode-manager.js` | ~130 | Kids/Studio dual-mode state (ADR-015) |
| `js/image-loader.js` | ~450 | Gallery modal, file upload, saved artwork, reference panel |
| `js/progress-manager.js` | ~240 | Multi-layer auto-save, project lifecycle, resume flow |
| `js/storage-manager.js` | ~130 | Promise-based IndexedDB wrapper (schema v2) |
| `css/styles.css` | ~2,000 | All styles — design tokens, dark mode, layer panel, animations |
| `index.html` | ~220 | HTML structure, canvas markup, modal scaffolding, script tags |
| `service-worker.js` | ~140 | Hybrid caching (v19), precache asset list |
| `workers/fill-worker.js` | ~90 | Scanline flood fill off main thread |
| `workers/fill-algorithm.js` | ~120 | Shared fill algorithm (imported by worker and sync fallback) |
| `workers/mask-worker.js` | ~40 | Outline mask computation off main thread |
| `docs/decisions/ADR-001..ADR-026` | -- | 26 Architecture Decision Records |
