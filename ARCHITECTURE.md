# Architecture

## Overview

This is a kids' coloring book Progressive Web App (PWA) built with vanilla JavaScript and no build system (~8,200 LOC JS + 2,000 LOC CSS, zero runtime dependencies). Users pick or upload coloring page outlines, then paint them using flood-fill and freehand brush tools on a multi-layer canvas system (up to 5 user layers managed by LayerManager). The app supports dual-mode UI (Kids and Studio modes via ADR-015), 5 pluggable brush presets (ADR-020), an eyedropper tool (ADR-018), zoom/pan via CSS transforms (ADR-009), an HSL color picker (ADR-012), command-based layer-aware undo with region-aware bounding-box optimization and structural layer-delete undo (ADR-017, ADR-024, ADR-026), and Web Workers for off-main-thread pixel processing (ADR-021). Kids mode features confetti celebration animations (ADR-022). Studio mode provides a radial tool menu (ADR-023), a layer panel (ADR-025), and glassmorphism UI with performance fallback. It works fully offline via a service worker and is designed for touch-first tablet/mobile use.

## Entry Points

| Entry Point | Type | Purpose |
|-------------|------|---------|
| `index.html` | Browser | Main HTML document; loads all CSS and JS via `<script>` tags in dependency order (lines 97–105) |
| `js/app.js` | Application bootstrap | IIFE that initializes all modules in sequence, registers the service worker, and opens the gallery on first load |
| `service-worker.js` | PWA lifecycle | Runs in a separate thread; handles install/activate/fetch events for offline caching |
| `scripts/static-server.js` | Dev tooling | Node.js HTTP server on port 4173 used by Playwright for e2e testing |

## Data Flow

### Coloring Flow (primary user interaction)

1. **App boots** — `app.js` detects performance tier, then initializes modules in dependency order: TouchGuard → CanvasManager (which initializes LayerManager) → FloodFill → BrushEngine → ImageLoader → Toolbar → ModeManager → CelebrationManager → RadialMenu → LayerPanel → ProgressManager, then registers the service worker and opens the gallery modal.
2. **User picks a coloring page** — `ImageLoader` loads the selected SVG/PNG via `CanvasManager.loadOutlineImage()`, which draws it centered on the **outline canvas** and calls `makeWhitePixelsTransparent()` to strip white backgrounds. All coloring layers are cleared; layer-0 is filled white. Undo history is reset.
3. **User selects a color** — `ColorPalette` updates its internal `currentColor` state and highlights the chosen swatch.
4. **User taps (fill tool)** — `Toolbar.setupFillTapHandler()` detects taps on the **interaction canvas**, calls `FloodFill.executeFloodFillAtPoint()`. In production mode, pixel data is transferred to a Web Worker for off-main-thread scanline fill (ADR-021). In classic/test mode, the fill runs synchronously on the main thread. Region-aware undo (ADR-017) saves only the filled bounding box. Fills emit `fill:complete` for celebration animations (ADR-022).
5. **User draws (brush/eraser tool)** — `BrushEngine` captures pointer events (including coalesced events for smooth strokes) on the **interaction canvas** and draws onto the **coloring canvas** using the active brush preset (ADR-020). The marker preset uses `lineTo()` paths; other presets (crayon, watercolor, pencil, sparkle) use stamp-based rendering at even intervals. The eraser always uses marker rendering. When the brush tool is active, strokes are drawn onto a per-stroke scratch canvas (z-index 7) and composited onto the active layer at `brushOpacity` on pointer-up, preventing within-stroke alpha compounding (ADR-027). Region-aware undo (ADR-017) saves only the stroke bounding box.
6. **User undoes/redoes** — `UndoManager` delegates to `CommandManager`, which pops the most recent command from its undo stack and restores the **coloring canvas** via `putImageData()` (ADR-011). Region commands (ADR-017) restore only the affected bounding box for memory efficiency. New drawing actions clear the redo stack.
7. **User saves** — `CanvasManager.renderCompositeForSave()` composites the coloring and outline layers onto an offscreen canvas and produces a PNG data URL. A temporary `<a>` element triggers a download.
8. **User uploads reference image** — `ImageLoader` reads the file as a data URL and displays it in a draggable/resizable floating `<div>` panel overlaying the canvas area.

### Canvas Layer Architecture

```
z-index 31 ┌─────────────────────────────────┐  cursor-canvas (brush preview, pointer-events: none)
z-index 30 ┌─────────────────────────────────┐  reference-panel (HTML div, draggable)
z-index 21 ┌─────────────────────────────────┐  interaction-canvas (captures all pointer events)
z-index 11 │  ┌───────────────────────────┐  │  outline-canvas (line art, pointer-events: none)
z-index 2–6│  │  ┌─────────────────────┐  │  │  layer-0..layer-N (user paint, dynamic canvases)
z-index 1  │  │  │                     │  │  │  reference-canvas (guide overlay, 35% opacity)
           └──┘──┘─────────────────────┘──┘──┘
```

User coloring layers (up to 5) are created dynamically by `LayerManager` and inserted between `reference-canvas` and `outline-canvas` in the DOM (ADR-024). Layer-0 has a white background; higher layers are transparent. `CanvasManager.getColoringCanvas()` and `getColoringContext()` proxy to the active layer. All canvases share the same dimensions, DPI-scaled: `canvas.width = containerWidth × devicePixelRatio`, capped at `MAX_CANVAS_DIMENSION = 2048`. All drawing operations use `CanvasManager.withNativeTransform(ctx, callback)` (ADR-007) to work at native pixel resolution. Coordinates are converted from CSS space to canvas pixel space via `CanvasManager.getCanvasPixelCoords(event)` (ADR-002).

### Offline / PWA Flow

1. On first visit, the service worker precaches all app assets listed in `ASSETS_TO_CACHE`.
2. Navigation requests use **network-first** strategy (try network, fall back to cache).
3. Static assets (JS, CSS, images) use **stale-while-revalidate** (serve cache immediately, update in background).
4. Old cache versions are deleted on service worker activation.

## Modules

| Module | File Path | Responsibility | Dependencies |
|--------|-----------|----------------|--------------|
| EventBus | `js/event-bus.js` | Lightweight pub/sub event system for decoupled cross-module communication using `noun:verb` event naming (ADR-014) | None |
| TouchGuard | `js/touch-guard.js` | Prevents browser gestures (pinch-zoom, context menu, double-tap zoom) from interfering with drawing on touch devices | None |
| FeedbackManager | `js/feedback-manager.js` | Loading spinner overlay, toast notifications for user feedback on save/error events | None |
| ModeManager | `js/mode-manager.js` | Manages dual-mode UI state (Kids/Studio), handedness (left/right), and theme (light/dark) via `data-mode`/`data-hand`/`data-theme` attributes (ADR-015). Wires mode-specific buttons to delegate to existing module APIs. Forces active layer to 0 on Kids mode switch (ADR-024) | EventBus, LayerManager |
| LayerManager | `js/layer-manager.js` | Manages up to 5 dynamic user coloring layer canvases: creation, z-index stacking, visibility/opacity, active layer selection, compositing for save, resize/snapshot for window reflow (ADR-024). Initialized inside `CanvasManager.initialize()` | None |
| CanvasManager | `js/canvas-manager.js` | Creates and manages the canvas system (reference, outline, interaction, cursor) plus coloring layers via LayerManager; handles sizing, DPI scaling, image loading, white-pixel transparency, composite rendering for save, resize preservation, and outline mask computation (ADR-008). `getColoringCanvas()`/`getColoringContext()` proxy to the active layer (ADR-024). Provides shared utilities: `withNativeTransform()` (ADR-007), `getCanvasPixelCoords()` (ADR-002), `getOutlineMask()` (ADR-008) | LayerManager |
| ViewportManager | `js/viewport-manager.js` | Zoom (0.5x–5x) and pan of the canvas container via CSS transforms. Handles Ctrl+scroll, pinch, spacebar+drag, and keyboard zoom shortcuts (ADR-009) | EventBus, CanvasManager |
| CommandManager | `js/command-manager.js` | Maintains undo/redo stacks of command objects using `ImageData` for synchronous canvas restore. Max 50 steps (ADR-011) | CanvasManager, LayerManager |
| UndoManager | `js/undo-manager.js` | Backward-compatible facade over CommandManager; captures canvas state as `ImageData` commands for instant synchronous undo/redo (ADR-011). Public API unchanged from original PNG snapshot approach | CanvasManager, CommandManager |
| ColorPalette | `js/color-palette.js` | Renders a vertical grid of 20 kid-friendly color swatches with roving tabindex keyboard navigation (ADR-013); manages the currently selected color | None |
| ColorPicker | `js/color-picker.js` | HSL color picker with canvas-rendered hue ring and saturation/lightness square, recent colors in localStorage (ADR-012) | ColorPalette |
| FloodFill | `js/flood-fill.js` | Scanline stack-based flood fill with Web Worker dispatch (ADR-021), sync fallback in classic mode, region-aware undo (ADR-017), and `isFillInProgress` guard for concurrent fill prevention | CanvasManager, UndoManager, FeedbackManager |
| BrushEngine | `js/brush-engine.js` | Freehand painting/erasing with 5 pluggable brush presets (marker, crayon, watercolor, pencil, sparkle per ADR-020), stamp-based rendering, pressure sensitivity, edge-aware outline clipping (ADR-008), per-stroke opacity via scratch-canvas compositing (ADR-027), and cursor preview | CanvasManager, ColorPalette, Toolbar |
| ImageLoader | `js/image-loader.js` | Manages the coloring page gallery modal (pre-loaded thumbnails + file upload), the saved artwork gallery ("My Art" tab with resume/delete), reference image upload, and the draggable/resizable reference panel. Focus trap and Escape key close for accessibility (ADR-013) | CanvasManager, UndoManager, StorageManager, ProgressManager |
| Toolbar | `js/toolbar.js` | Manages tool selection (fill/brush/eraser/eyedropper per ADR-018), brush size slider, brush opacity slider (ADR-027), brush preset switching (ADR-020), undo/redo/clear/save/gallery button actions, keyboard shortcuts 1-5 for presets, fill-tap detection, and the clear confirmation dialog. Emits `save:complete` for celebrations. Provides `saveAndDownload()` and `setActivePreset()` for mode-specific UI (ADR-015) | CanvasManager, UndoManager, ColorPalette, FloodFill, BrushEngine, ImageLoader, ProgressManager, ViewportManager |
| CelebrationManager | `js/celebration-manager.js` | CSS-animated confetti celebrations in Kids mode on fill/save events (ADR-022). Reduced-motion users get a border glow pulse. Confetti count reduced on low-performance devices | EventBus, ModeManager, CanvasManager, FeedbackManager |
| RadialMenu | `js/radial-menu.js` | Semicircular tool menu in Studio mode with staggered pop-in animation, full keyboard navigation (arrows, Enter, Escape, Tab trap per ADR-013), and tool delegation to Toolbar (ADR-023) | Toolbar |
| LayerPanel | `js/layer-panel.js` | Studio-mode layer management UI: layer list with thumbnails, visibility toggles, opacity sliders, add/delete buttons, drag-to-reorder. Delete is undoable (ADR-026). Hidden in Kids mode via `.studio-only` CSS (ADR-025) | LayerManager, CommandManager, EventBus |
| StorageManager | `js/storage-manager.js` | Promise-based IndexedDB wrapper for persisting coloring projects. Schema v2: `coloringBlobs[]` + `layerMetadata[]`; backward-compat read path for v1 projects (ADR-024) | None |
| ProgressManager | `js/progress-manager.js` | Orchestrates auto-save of all coloring layers, project lifecycle (start/save/complete), brush preset persistence, and multi-layer resume-from-previous-session flow (ADR-024) | StorageManager, CanvasManager, LayerManager, UndoManager, Toolbar, BrushEngine, ColorPalette, FeedbackManager |
| FillWorker | `workers/fill-worker.js` | Self-contained scanline flood fill running off the main thread (ADR-021). Receives/returns pixel data via Transferable ArrayBuffers | None (Web Worker — no DOM access) |
| MaskWorker | `workers/mask-worker.js` | Self-contained outline mask computation running off the main thread (ADR-021). Receives outline pixels, returns binary Uint8Array mask | None (Web Worker — no DOM access) |
| App | `js/app.js` | Entry point; detects performance tier, initializes all modules in dependency order, registers the service worker, opens IndexedDB, and checks for resumable projects | All modules |
| ServiceWorker | `service-worker.js` | Hybrid caching strategy for offline PWA support (network-first HTML, stale-while-revalidate static assets) | None (runs in separate thread) |
| StaticServer | `scripts/static-server.js` | Lightweight Node.js HTTP file server for local development and Playwright e2e testing | Node.js built-ins (http, fs, path) |

### Initialization Order (`app.js`)

```
0. detectPerformanceTier()           — set data-performance for glassmorphism fallback
1. TouchGuard.initialize()           — prevent browser gesture interference
2. FeedbackManager.initialize()      — set up spinner and toast elements
3. CanvasManager.initialize()        — sets up canvas system + calls LayerManager.initialize()
                                       internally (ADR-024) + starts mask worker (ADR-021)
4. ViewportManager.initialize()      — set up zoom/pan on canvas container (ADR-009)
5. ColorPalette.initialize()         — build color swatch UI
6. ColorPicker.initialize()          — set up HSL picker popover (ADR-012)
7. FloodFill.initialize()            — create fill worker (ADR-021)
8. BrushEngine.initialize()          — attach pointer event listeners, set up presets (ADR-020)
9. ImageLoader.initialize()          — build gallery, set up uploads
10. Toolbar.initialize()             — wire up all tool buttons + preset switching
11. ModeManager.initialize()         — apply Kids/Studio mode, wire mode-specific UI (ADR-015)
12. CelebrationManager.initialize()  — wire fill/save celebration events (ADR-022)
13. RadialMenu.initialize()          — build radial menu items, wire trigger (ADR-023)
14. LayerPanel.initialize()          — wire layer UI and EventBus listeners (ADR-025)
15. ProgressManager.initialize()     — register visibilitychange listener
16. registerServiceWorker()          — register PWA service worker
17. StorageManager.initialize()      — async: open IndexedDB
18. checkForResumableProject()       — async: resume modal or gallery
```

New modules must be inserted at the correct point in this chain based on their dependencies.

## File & Folder Index

### Root Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML document with 5-layer canvas markup, gallery (tabbed: Templates + My Art)/clear/resume modals, toolbar buttons, color palette container, and script loading |
| `manifest.json` | PWA manifest defining app name ("My Coloring Book"), start URL, display mode, theme colors, and icon references |
| `service-worker.js` | Service worker with hybrid caching strategy (v19) and precache asset list |
| `package.json` | Project metadata and Playwright e2e test scripts; only dev dependency is `@playwright/test` |
| `playwright.config.js` | Playwright config: test dir `./tests`, base URL `http://127.0.0.1:4173`, service workers blocked during tests |

### `js/` — Application Modules

| File | Description |
|------|-------------|
| `js/app.js` | Bootstrap entry point; initializes all modules, registers the service worker, opens IndexedDB, and checks for resumable projects |
| `js/event-bus.js` | Pub/sub event system with `on`/`off`/`emit` and `noun:verb` naming (ADR-014) |
| `js/layer-manager.js` | Dynamic user coloring layer management: up to 5 layer canvases, z-index stacking, active layer, visibility/opacity, compositing, resize (ADR-024) |
| `js/canvas-manager.js` | Canvas system management: sizing, DPI scaling, image loading, transparency processing, composite rendering, resize handling, outline mask computation. Proxies getColoringCanvas/Context to LayerManager (ADR-024) |
| `js/mode-manager.js` | Dual-mode UI state (Kids/Studio), handedness, theme management via data attributes (ADR-015) |
| `js/viewport-manager.js` | CSS transform zoom/pan on canvas container, 0.5x–5x range (ADR-009) |
| `js/command-manager.js` | Command-based undo/redo stacks using ImageData, max 50 steps (ADR-011) |
| `js/undo-manager.js` | Backward-compatible facade over CommandManager; synchronous ImageData undo/redo (ADR-011) |
| `js/color-palette.js` | 20-color kid-friendly swatch grid with roving tabindex keyboard navigation (ADR-013) |
| `js/color-picker.js` | HSL color picker with hue ring, SL square, recent colors (ADR-012) |
| `js/flood-fill.js` | Scanline stack-based flood fill with Web Worker dispatch (ADR-021), sync fallback, region-aware undo (ADR-017) |
| `js/brush-engine.js` | Freehand painting/erasing with 5 pluggable brush presets (ADR-020), stamp-based rendering, pressure sensitivity, outline clipping (ADR-008), per-stroke opacity via scratch-canvas compositing (ADR-027) |
| `js/image-loader.js` | Gallery modal with Templates/My Art tabs, file upload handlers, saved artwork resume/delete, and draggable/resizable reference image panel |
| `js/toolbar.js` | Tool switching (fill/brush/eraser/eyedropper), button actions, keyboard shortcuts (including 1-5 for presets), brush size slider, brush opacity slider (ADR-027), preset switching (ADR-020), fill-tap detection, programmatic setters |
| `js/celebration-manager.js` | CSS confetti celebrations in Kids mode, border pulse for reduced-motion, low-perf particle reduction (ADR-022) |
| `js/radial-menu.js` | Semicircular Studio tool menu with staggered animation, keyboard nav, focus trap (ADR-023) |
| `js/layer-panel.js` | Studio-mode layer panel UI: thumbnails, visibility toggles, opacity sliders, add/delete (undoable, ADR-026), drag-to-reorder (ADR-025) |
| `js/touch-guard.js` | Blocks pinch-zoom, context menu, and double-tap zoom on touch devices |
| `js/storage-manager.js` | Promise-based IndexedDB wrapper for persisting coloring projects (schema v2: coloringBlobs[], ADR-024) |
| `js/progress-manager.js` | Multi-layer auto-save orchestration, project lifecycle, and resume-from-previous-session flow (ADR-024) |

### `css/` — Styles

| File | Description |
|------|-------------|
| `css/styles.css` | Single stylesheet with CSS design tokens on `:root` (ADR-010), dark mode overrides, accessibility styles (`:focus-visible`, `.sr-only`, `prefers-reduced-motion` per ADR-013), dual-mode UI visibility rules (ADR-015), app layout, canvas layers, reference panel, color palette, toolbar, modals, gallery tabs, saved artwork cards, gallery grid, confirmation dialog, zoom pill, color picker popover, glassmorphism, and CSS animations |

### `images/` — Static Assets

| File | Description |
|------|-------------|
| `images/coloring-pages/*.svg` | 8 bundled coloring page templates: cat, dog, butterfly, fish, rocket, flower, unicorn, car |
| `images/icons/icon-192.svg` | PWA icon at 192×192 size |
| `images/icons/icon-512.svg` | PWA icon at 512×512 size |

### `workers/` — Web Workers (ADR-021)

| File | Description |
|------|-------------|
| `workers/fill-worker.js` | Self-contained scanline flood fill for off-main-thread pixel processing. Receives/returns ArrayBuffers via Transferable |
| `workers/mask-worker.js` | Self-contained outline mask computation for off-main-thread processing. Returns binary Uint8Array mask |

### `templates/` — Content Pipeline (ADR-019)

| File | Description |
|------|-------------|
| `templates/manifest.json` | Template metadata catalog with categories, difficulty ratings, and search tags for the gallery |

### `scripts/` — Dev Tooling

| File | Description |
|------|-------------|
| `scripts/static-server.js` | Minimal Node.js HTTP server serving project root on port 4173 with MIME type mapping and path traversal protection |

### `tests/` — Test Suite (151 tests total)

| File | Description |
|------|-------------|
| `tests/smoke.spec.js` | 4 Playwright e2e smoke tests: app boot, brush stroke + undo, reference panel drag/resize, drawing persistence through viewport resize |
| `tests/characterisation/canvas-manager.spec.js` | 10 characterisation tests for CanvasManager |
| `tests/characterisation/undo-manager.spec.js` | 12 characterisation tests for UndoManager (including 6 redo tests) |
| `tests/characterisation/color-palette.spec.js` | 6 characterisation tests for ColorPalette |
| `tests/characterisation/flood-fill.spec.js` | 5 characterisation tests for FloodFill |
| `tests/characterisation/brush-engine.spec.js` | 17 characterisation tests for BrushEngine (including eraser stroke, eraser outline preservation, brush opacity API, and scratch canvas cleanup — ADR-027, ADR-008) |
| `tests/characterisation/toolbar.spec.js` | 17 characterisation tests for Toolbar (including eraser, keyboard shortcuts) |
| `tests/characterisation/image-loader.spec.js` | 16 characterisation tests for ImageLoader (including 6 saved artwork gallery tests) |
| `tests/characterisation/storage-manager.spec.js` | 5 characterisation tests for StorageManager |
| `tests/characterisation/progress-manager.spec.js` | 4 characterisation tests for ProgressManager |
| `tests/characterisation/bbox-undo.spec.js` | 7 characterisation tests for region-aware bounding-box undo (ADR-017) |
| `tests/characterisation/eyedropper.spec.js` | 10 characterisation tests for eyedropper tool (ADR-018) |
| `tests/characterisation/brush-presets.spec.js` | 17 characterisation tests for brush preset system (ADR-020) |
| `tests/characterisation/layer-manager.spec.js` | 21 characterisation tests for LayerManager and CanvasManager proxy (ADR-024, ADR-026) |

### `docs/` — Project Documentation

| File | Description |
|------|-------------|
| `docs/app_review_worldclass_status.md` | Review findings, world-class ideas, and current implementation status |
| `docs/decisions/ADR-001` through `ADR-027` | Architecture Decision Records defining canonical patterns |

### Folders

| Folder | Purpose |
|--------|---------|
| `js/` | All application JavaScript modules (vanilla JS, IIFE pattern) |
| `css/` | Application stylesheet |
| `images/coloring-pages/` | Coloring page SVG/PNG templates |
| `images/icons/` | PWA icon assets |
| `scripts/` | Development tooling scripts |
| `tests/` | Playwright e2e test specs |
| `tests/characterisation/` | 147 characterisation tests across 13 module test files |
| `docs/` | Project documentation, roadmap, and Architecture Decision Records |
| `docs/decisions/` | 27 ADRs (ADR-001 through ADR-027) defining canonical patterns |
| `workers/` | Web Workers for off-main-thread pixel processing (ADR-021) |
| `templates/` | Template metadata catalog for the gallery (ADR-019) |
| `.claude/commands/` | Claude Code custom slash commands (/review, /audit, /check) |
| `.claude/rules/` | Claude Code rule files (ADR enforcement) |

## External Dependencies

| Package | Purpose | Status |
|---------|---------|--------|
| `@playwright/test` | End-to-end browser testing framework (dev dependency) | Active — used in `tests/smoke.spec.js` |
| Node.js `http` | Built-in module used by `scripts/static-server.js` | Active — dev tooling only |
| Node.js `fs` | Built-in module used by `scripts/static-server.js` | Active — dev tooling only |
| Node.js `path` | Built-in module used by `scripts/static-server.js` | Active — dev tooling only |

**Notable**: The application itself has **zero runtime dependencies**. All application code is vanilla JavaScript with no npm packages, no framework, and no build system. The only npm dependency (`@playwright/test`) is a dev dependency for testing.

## Environment Variables

| Variable | Purpose | Required | Used In |
|----------|---------|----------|---------|
| `PORT` | Override the static dev server port (defaults to `4173`) | No | `scripts/static-server.js` line 6 |

**Notable**: The application has no runtime environment variables. There are no API keys, backend URLs, or configuration files. All configuration is hardcoded:

- Service worker cache version: `CACHE_VERSION = 'coloring-book-v19'` in `service-worker.js`
- Max canvas dimension: `MAX_CANVAS_DIMENSION = 2048` in `canvas-manager.js`
- Undo stack depth: `MAX_UNDO_STEPS = 50` in `command-manager.js`
- Zoom range: `MIN_SCALE = 0.5`, `MAX_SCALE = 5` in `viewport-manager.js`
- Recent color limit: max 8 in `color-picker.js`
- Fill tolerance: `FILL_TOLERANCE = 32` in `flood-fill.js`
- Outline detection thresholds: `OUTLINE_LUMINANCE_THRESHOLD = 80`, `OUTLINE_ALPHA_THRESHOLD = 128` in `flood-fill.js`
- Reference panel minimums: `REFERENCE_PANEL_MIN_WIDTH = 140`, `REFERENCE_PANEL_MIN_HEIGHT = 120` in `image-loader.js`
- Brush presets: 5 presets (marker, crayon, watercolor, pencil, sparkle) in `brush-engine.js`
- Fill worker spinner delay: `SPINNER_DELAY_MS = 100` in `flood-fill.js`
- Confetti particles: `CONFETTI_COUNT = 30` (15 on low-perf devices) in `celebration-manager.js`
- Radial menu radius: `RADIUS = 80` pixels, stagger `40ms` per item in `radial-menu.js`
- Low-perf detection: `deviceMemory < 4` OR `hardwareConcurrency < 4` in `app.js`
- Color palette: 20 hardcoded hex values in `color-palette.js`
- Coloring page catalog: 8 entries (cat, dog, butterfly, fish, rocket, flower, unicorn, car) in `image-loader.js`
- Auto-save delay: `AUTO_SAVE_DELAY_MS = 5000` in `progress-manager.js`
- Thumbnail size: `THUMBNAIL_SIZE = 200` in `progress-manager.js`
- IndexedDB database: `DB_NAME = 'coloring-book-db'`, `DB_VERSION = 2` in `storage-manager.js`

## Known Issues

1. ~~**Touch guards are global**~~ — **Resolved.** All touch/gesture prevention listeners in `touch-guard.js` are now scoped to `#canvas-container`, preserving text selection and scrolling in modals.
2. ~~**Playwright tests never executed**~~ — **Resolved.** Dependencies installed, all 87 tests passing (4 smoke + 83 characterisation).
3. ~~**Only one coloring template**~~ — **Resolved.** `PRELOADED_COLORING_PAGES` now contains 8 templates: cat, dog, butterfly, fish, rocket, flower, unicorn, car.
4. ~~**No persistence**~~ — **Resolved.** Drawing progress is auto-saved to IndexedDB via `StorageManager` + `ProgressManager`. On return, a resume modal offers to restore the previous session.
5. ~~**No redo**~~ — **Resolved.** `UndoManager` now supports redo via `redoStack`. Undo pushes to redo; new actions clear redo.
6. ~~**No loading indicators**~~ — **Resolved.** `FeedbackManager` provides a loading spinner and toast notifications for save/error events.
7. ~~**Console.warn-only error reporting**~~ — **Resolved.** Failed image loads now show a user-facing toast ("Oops! Could not load that picture.") via `FeedbackManager.showToast()` alongside `console.warn` (ADR-001).
8. ~~**`Docs` vs `docs` folder casing**~~ — **Resolved.** Standardized to lowercase `docs/` per ADR-006.
9. ~~**No dual-mode UI**~~ — **Resolved.** Kids and Studio modes via `ModeManager` (ADR-015) with CSS design tokens (ADR-010).
10. ~~**No zoom/pan**~~ — **Resolved.** `ViewportManager` provides CSS transform zoom/pan (ADR-009).
11. ~~**Undo uses PNG data URLs (slow, 10 steps)**~~ — **Resolved.** `CommandManager` uses synchronous `ImageData` with 50-step limit (ADR-011).
12. ~~**No accessibility**~~ — **Resolved.** ARIA roles, keyboard navigation, focus traps, `prefers-reduced-motion` (ADR-013).
