# Architecture

## Overview

This is a kids' coloring book Progressive Web App (PWA) built with vanilla JavaScript and no build system. Users pick or upload coloring page outlines, then paint them using flood-fill and freehand brush tools on a 4-layer canvas system. The app works fully offline via a service worker and is designed for touch-first tablet/mobile use.

## Entry Points

| Entry Point | Type | Purpose |
|-------------|------|---------|
| `index.html` | Browser | Main HTML document; loads all CSS and JS via `<script>` tags in dependency order (lines 97–105) |
| `js/app.js` | Application bootstrap | IIFE that initializes all modules in sequence, registers the service worker, and opens the gallery on first load |
| `service-worker.js` | PWA lifecycle | Runs in a separate thread; handles install/activate/fetch events for offline caching |
| `scripts/static-server.js` | Dev tooling | Node.js HTTP server on port 4173 used by Playwright for e2e testing |

## Data Flow

### Coloring Flow (primary user interaction)

1. **App boots** — `app.js` initializes modules in dependency order: TouchGuard → CanvasManager → ColorPalette → BrushEngine → ImageLoader → Toolbar, then registers the service worker and opens the gallery modal.
2. **User picks a coloring page** — `ImageLoader` loads the selected SVG/PNG via `CanvasManager.loadOutlineImage()`, which draws it centered on the **outline canvas** and calls `makeWhitePixelsTransparent()` to strip white backgrounds. The **coloring canvas** is cleared and filled white. Undo history is reset.
3. **User selects a color** — `ColorPalette` updates its internal `currentColor` state and highlights the chosen swatch.
4. **User taps (fill tool)** — `Toolbar.setupFillTapHandler()` detects taps on the **interaction canvas**, calls `FloodFill.executeFloodFillAtPoint()`. FloodFill reads pixel data from both the **coloring canvas** (for target color matching) and **outline canvas** (for boundary detection), then runs a scanline stack fill on the coloring canvas pixel data. An undo snapshot is saved before the modified pixels are written back.
5. **User draws (brush/eraser tool)** — `BrushEngine` captures pointer events (including coalesced events for smooth strokes) on the **interaction canvas** and draws directly onto the **coloring canvas**. The brush uses the selected palette color; the eraser uses white (#FFFFFF). An undo snapshot is saved at stroke start.
6. **User undoes/redoes** — `UndoManager` pops the most recent PNG data URL snapshot from its undo stack and restores it onto the **coloring canvas**, pushing the current state onto the redo stack. Redo reverses this. New drawing actions clear the redo stack.
7. **User saves** — `CanvasManager.renderCompositeForSave()` composites the coloring and outline layers onto an offscreen canvas and produces a PNG data URL. A temporary `<a>` element triggers a download.
8. **User uploads reference image** — `ImageLoader` reads the file as a data URL and displays it in a draggable/resizable floating `<div>` panel overlaying the canvas area.

### Canvas Layer Architecture

```
z-index 6  ┌─────────────────────────────────┐  reference-panel (HTML div, draggable)
z-index 5  ┌─────────────────────────────────┐  cursor-canvas (brush preview, pointer-events: none)
z-index 4  ┌─────────────────────────────────┐  interaction-canvas (captures all pointer events)
z-index 3  │  ┌───────────────────────────┐  │  outline-canvas (line art, pointer-events: none)
z-index 2  │  │  ┌─────────────────────┐  │  │  reference-canvas (guide overlay, 35% opacity)
z-index 1  │  │  │                     │  │  │  coloring-canvas (user paint, white background)
           └──┘──┘─────────────────────┘──┘──┘
```

All canvases share the same dimensions, DPI-scaled: `canvas.width = containerWidth × devicePixelRatio`, capped at `MAX_CANVAS_DIMENSION = 2048`. All drawing operations use `CanvasManager.withNativeTransform(ctx, callback)` (ADR-007) to work at native pixel resolution. Coordinates are converted from CSS space to canvas pixel space via `CanvasManager.getCanvasPixelCoords(event)` (ADR-002).

### Offline / PWA Flow

1. On first visit, the service worker precaches all app assets listed in `ASSETS_TO_CACHE`.
2. Navigation requests use **network-first** strategy (try network, fall back to cache).
3. Static assets (JS, CSS, images) use **stale-while-revalidate** (serve cache immediately, update in background).
4. Old cache versions are deleted on service worker activation.

## Modules

| Module | File Path | Responsibility | Dependencies |
|--------|-----------|----------------|--------------|
| TouchGuard | `js/touch-guard.js` | Prevents browser gestures (pinch-zoom, context menu, double-tap zoom) from interfering with drawing on touch devices | None |
| FeedbackManager | `js/feedback-manager.js` | Loading spinner overlay, toast notifications for user feedback on save/error events | None |
| CanvasManager | `js/canvas-manager.js` | Creates and manages the 5-layer canvas system (coloring, reference, outline, interaction, cursor); handles sizing, DPI scaling, image loading, white-pixel transparency, composite rendering for save, resize preservation, and outline mask computation (ADR-008). Provides shared utilities: `withNativeTransform()` (ADR-007), `getCanvasPixelCoords()` (ADR-002), and `getOutlineMask()` (ADR-008) | None |
| UndoManager | `js/undo-manager.js` | Stores up to 10 compressed PNG data URL snapshots of the coloring canvas; provides undo, redo, and history clearing | CanvasManager |
| ColorPalette | `js/color-palette.js` | Renders a vertical grid of 20 kid-friendly color swatches; manages the currently selected color | None |
| FloodFill | `js/flood-fill.js` | Iterative scanline stack-based flood fill with configurable tolerance for anti-aliased edges and outline boundary detection | CanvasManager, UndoManager |
| BrushEngine | `js/brush-engine.js` | Handles freehand painting and erasing via Pointer Events with coalesced events for smooth strokes; supports configurable brush size and cursor preview | CanvasManager, ColorPalette, Toolbar |
| ImageLoader | `js/image-loader.js` | Manages the coloring page gallery modal (pre-loaded thumbnails + file upload), the saved artwork gallery ("My Art" tab with resume/delete), reference image upload, and the draggable/resizable reference panel | CanvasManager, UndoManager, StorageManager, ProgressManager |
| Toolbar | `js/toolbar.js` | Manages tool selection (fill/brush/eraser), brush size slider, undo/redo/clear/save/gallery button actions, keyboard shortcuts, fill-tap detection, and the clear confirmation dialog | CanvasManager, UndoManager, ColorPalette, FloodFill, BrushEngine, ImageLoader, ProgressManager |
| StorageManager | `js/storage-manager.js` | Promise-based IndexedDB wrapper for persisting coloring projects (canvas blobs, metadata, thumbnails) | None |
| ProgressManager | `js/progress-manager.js` | Orchestrates auto-save of drawing progress, project lifecycle (start/save/complete), and resume-from-previous-session flow | StorageManager, CanvasManager, UndoManager, Toolbar, BrushEngine, ColorPalette, FeedbackManager |
| App | `js/app.js` | Entry point; initializes all modules in dependency order, registers the service worker, opens IndexedDB, and checks for resumable projects | All modules |
| ServiceWorker | `service-worker.js` | Hybrid caching strategy for offline PWA support (network-first HTML, stale-while-revalidate static assets) | None (runs in separate thread) |
| StaticServer | `scripts/static-server.js` | Lightweight Node.js HTTP file server for local development and Playwright e2e testing | Node.js built-ins (http, fs, path) |

### Initialization Order (`app.js` lines 26–46)

```
1. TouchGuard.initialize()        — prevent browser gesture interference
2. FeedbackManager.initialize()   — set up spinner and toast elements
3. CanvasManager.initialize()     — set up 5-layer canvas system
4. ColorPalette.initialize()      — build color swatch UI
5. BrushEngine.initialize()       — attach pointer event listeners
6. ImageLoader.initialize()       — build gallery, set up uploads
7. Toolbar.initialize()           — wire up all tool buttons
8. ProgressManager.initialize()   — register visibilitychange listener
9. registerServiceWorker()        — register PWA service worker
10. StorageManager.initialize()   — async: open IndexedDB
11. checkForResumableProject()    — async: resume modal or gallery
```

New modules must be inserted at the correct point in this chain based on their dependencies.

## File & Folder Index

### Root Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML document with 5-layer canvas markup, gallery (tabbed: Templates + My Art)/clear/resume modals, toolbar buttons, color palette container, and script loading |
| `manifest.json` | PWA manifest defining app name ("My Coloring Book"), start URL, display mode, theme colors, and icon references |
| `service-worker.js` | Service worker with hybrid caching strategy (v8) and precache asset list |
| `package.json` | Project metadata and Playwright e2e test scripts; only dev dependency is `@playwright/test` |
| `playwright.config.js` | Playwright config: test dir `./tests`, base URL `http://127.0.0.1:4173`, service workers blocked during tests |

### `js/` — Application Modules

| File | Description |
|------|-------------|
| `js/app.js` | Bootstrap entry point; initializes all modules, registers the service worker, opens IndexedDB, and checks for resumable projects |
| `js/canvas-manager.js` | 5-layer canvas system management: sizing, DPI scaling, image loading, transparency processing, composite rendering, resize handling, outline mask computation |
| `js/undo-manager.js` | PNG snapshot-based undo/redo stack (max 10 steps) |
| `js/color-palette.js` | 20-color kid-friendly swatch grid with selection management and programmatic color setting |
| `js/flood-fill.js` | Scanline stack-based flood fill with tolerance and outline boundary detection |
| `js/brush-engine.js` | Freehand painting and erasing with Pointer Events, coalesced event smoothing, and cursor preview |
| `js/image-loader.js` | Gallery modal with Templates/My Art tabs, file upload handlers, saved artwork resume/delete, and draggable/resizable reference image panel |
| `js/toolbar.js` | Tool switching (fill/brush/eraser), button actions (undo, redo, clear, save, gallery), keyboard shortcuts, brush size slider, fill-tap detection, programmatic tool/size setters |
| `js/touch-guard.js` | Blocks pinch-zoom, context menu, and double-tap zoom on touch devices |
| `js/storage-manager.js` | Promise-based IndexedDB wrapper for persisting coloring projects |
| `js/progress-manager.js` | Auto-save orchestration, project lifecycle, and resume-from-previous-session flow |

### `css/` — Styles

| File | Description |
|------|-------------|
| `css/styles.css` | Single stylesheet covering reset, app layout, canvas layers, reference panel, color palette, toolbar, modals, gallery tabs, saved artwork cards, gallery grid, confirmation dialog, and CSS animations (modal-enter, swatch-bounce, card-enter) |

### `images/` — Static Assets

| File | Description |
|------|-------------|
| `images/coloring-pages/*.svg` | 8 bundled coloring page templates: cat, dog, butterfly, fish, rocket, flower, unicorn, car |
| `images/icons/icon-192.svg` | PWA icon at 192×192 size |
| `images/icons/icon-512.svg` | PWA icon at 512×512 size |

### `scripts/` — Dev Tooling

| File | Description |
|------|-------------|
| `scripts/static-server.js` | Minimal Node.js HTTP server serving project root on port 4173 with MIME type mapping and path traversal protection |

### `tests/` — Test Suite (87 tests total)

| File | Description |
|------|-------------|
| `tests/smoke.spec.js` | 4 Playwright e2e smoke tests: app boot, brush stroke + undo, reference panel drag/resize, drawing persistence through viewport resize |
| `tests/characterisation/canvas-manager.spec.js` | 9 characterisation tests for CanvasManager |
| `tests/characterisation/undo-manager.spec.js` | 11 characterisation tests for UndoManager (including 6 redo tests) |
| `tests/characterisation/color-palette.spec.js` | 6 characterisation tests for ColorPalette |
| `tests/characterisation/flood-fill.spec.js` | 5 characterisation tests for FloodFill |
| `tests/characterisation/brush-engine.spec.js` | 6 characterisation tests for BrushEngine (including eraser stroke test) |
| `tests/characterisation/toolbar.spec.js` | 17 characterisation tests for Toolbar (including eraser, keyboard shortcuts) |
| `tests/characterisation/image-loader.spec.js` | 16 characterisation tests for ImageLoader (including 6 saved artwork gallery tests) |
| `tests/characterisation/storage-manager.spec.js` | 5 characterisation tests for StorageManager |
| `tests/characterisation/progress-manager.spec.js` | 4 characterisation tests for ProgressManager |

### `docs/` — Project Documentation

| File | Description |
|------|-------------|
| `docs/app_review_worldclass_status.md` | Review findings, world-class ideas, and current implementation status |
| `docs/decisions/ADR-001` through `ADR-008` | Architecture Decision Records defining canonical patterns |

### Folders

| Folder | Purpose |
|--------|---------|
| `js/` | All application JavaScript modules (vanilla JS, IIFE pattern) |
| `css/` | Application stylesheet |
| `images/coloring-pages/` | Coloring page SVG/PNG templates |
| `images/icons/` | PWA icon assets |
| `scripts/` | Development tooling scripts |
| `tests/` | Playwright e2e test specs |
| `tests/characterisation/` | 83 characterisation tests across 9 module test files |
| `docs/` | Project documentation, roadmap, and Architecture Decision Records |
| `docs/decisions/` | 8 ADRs defining canonical patterns (error handling, coordinates, visibility, booleans, event handlers, folder casing, canvas context reset, outline mask brush clipping) |
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

- Service worker cache version: `CACHE_VERSION = 'coloring-book-v8'` in `service-worker.js`
- Max canvas dimension: `MAX_CANVAS_DIMENSION = 2048` in `canvas-manager.js`
- Undo stack depth: `MAX_UNDO_STEPS = 10` in `undo-manager.js`
- Fill tolerance: `FILL_TOLERANCE = 32` in `flood-fill.js`
- Outline detection thresholds: `OUTLINE_LUMINANCE_THRESHOLD = 80`, `OUTLINE_ALPHA_THRESHOLD = 128` in `flood-fill.js`
- Reference panel minimums: `REFERENCE_PANEL_MIN_WIDTH = 140`, `REFERENCE_PANEL_MIN_HEIGHT = 120` in `image-loader.js`
- Color palette: 20 hardcoded hex values in `color-palette.js`
- Coloring page catalog: 8 entries (cat, dog, butterfly, fish, rocket, flower, unicorn, car) in `image-loader.js`
- Auto-save delay: `AUTO_SAVE_DELAY_MS = 5000` in `progress-manager.js`
- Thumbnail size: `THUMBNAIL_SIZE = 200` in `progress-manager.js`
- IndexedDB database: `DB_NAME = 'coloring-book-db'`, `DB_VERSION = 1` in `storage-manager.js`

## Known Issues

1. ~~**Touch guards are global**~~ — **Resolved.** All touch/gesture prevention listeners in `touch-guard.js` are now scoped to `#canvas-container`, preserving text selection and scrolling in modals.
2. ~~**Playwright tests never executed**~~ — **Resolved.** Dependencies installed, all 87 tests passing (4 smoke + 83 characterisation).
3. ~~**Only one coloring template**~~ — **Resolved.** `PRELOADED_COLORING_PAGES` now contains 8 templates: cat, dog, butterfly, fish, rocket, flower, unicorn, car.
4. ~~**No persistence**~~ — **Resolved.** Drawing progress is auto-saved to IndexedDB via `StorageManager` + `ProgressManager`. On return, a resume modal offers to restore the previous session.
5. ~~**No redo**~~ — **Resolved.** `UndoManager` now supports redo via `redoStack`. Undo pushes to redo; new actions clear redo.
6. ~~**No loading indicators**~~ — **Resolved.** `FeedbackManager` provides a loading spinner and toast notifications for save/error events.
7. ~~**Console.warn-only error reporting**~~ — **Resolved.** Failed image loads now show a user-facing toast ("Oops! Could not load that picture.") via `FeedbackManager.showToast()` alongside `console.warn` (ADR-001).
8. ~~**`Docs` vs `docs` folder casing**~~ — **Resolved.** Standardized to lowercase `docs/` per ADR-006.
