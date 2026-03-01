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
5. **User draws (brush tool)** — `BrushEngine` captures pointer events (including coalesced events for smooth strokes) on the **interaction canvas** and draws directly onto the **coloring canvas** using the selected color and brush size. An undo snapshot is saved at stroke start.
6. **User undoes** — `UndoManager` pops the most recent PNG data URL snapshot from its stack and restores it onto the **coloring canvas**.
7. **User saves** — `CanvasManager.renderCompositeForSave()` composites the coloring and outline layers onto an offscreen canvas and produces a PNG data URL. A temporary `<a>` element triggers a download.
8. **User uploads reference image** — `ImageLoader` reads the file as a data URL and displays it in a draggable/resizable floating `<div>` panel overlaying the canvas area.

### Canvas Layer Architecture

```
z-index 5  ┌─────────────────────────────────┐  reference-panel (HTML div, draggable)
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
| CanvasManager | `js/canvas-manager.js` | Creates and manages the 4-layer canvas system; handles sizing, DPI scaling, image loading, white-pixel transparency, composite rendering for save, resize preservation, and outline mask computation (ADR-008). Provides shared utilities: `withNativeTransform()` (ADR-007), `getCanvasPixelCoords()` (ADR-002), and `getOutlineMask()` (ADR-008) | None |
| UndoManager | `js/undo-manager.js` | Stores up to 10 compressed PNG data URL snapshots of the coloring canvas; provides undo and history clearing | CanvasManager |
| ColorPalette | `js/color-palette.js` | Renders a vertical grid of 20 kid-friendly color swatches; manages the currently selected color | None |
| FloodFill | `js/flood-fill.js` | Iterative scanline stack-based flood fill with configurable tolerance for anti-aliased edges and outline boundary detection | CanvasManager, UndoManager |
| BrushEngine | `js/brush-engine.js` | Handles freehand painting via Pointer Events with coalesced events for smooth strokes; supports configurable brush size | CanvasManager, ColorPalette, Toolbar |
| ImageLoader | `js/image-loader.js` | Manages the coloring page gallery modal (pre-loaded thumbnails + file upload), reference image upload, and the draggable/resizable reference panel | CanvasManager, UndoManager |
| Toolbar | `js/toolbar.js` | Manages tool selection (fill/brush), brush size slider, undo/clear/save/gallery button actions, fill-tap detection, and the clear confirmation dialog | CanvasManager, UndoManager, ColorPalette, FloodFill, BrushEngine, ImageLoader |
| App | `js/app.js` | Entry point; initializes all modules in dependency order, registers the service worker, and opens the gallery on first load | All modules |
| ServiceWorker | `service-worker.js` | Hybrid caching strategy for offline PWA support (network-first HTML, stale-while-revalidate static assets) | None (runs in separate thread) |
| StaticServer | `scripts/static-server.js` | Lightweight Node.js HTTP file server for local development and Playwright e2e testing | Node.js built-ins (http, fs, path) |

### Initialization Order (`app.js` lines 17–23)

```
1. TouchGuard.initialize()     — prevent browser gesture interference
2. CanvasManager.initialize()  — set up 4-layer canvas system
3. ColorPalette.initialize()   — build color swatch UI
4. BrushEngine.initialize()    — attach pointer event listeners
5. ImageLoader.initialize()    — build gallery, set up uploads
6. Toolbar.initialize()        — wire up all tool buttons
7. registerServiceWorker()     — register PWA service worker
8. showGalleryOnFirstLoad()    — open gallery for first pick
```

New modules must be inserted at the correct point in this chain based on their dependencies.

## File & Folder Index

### Root Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML document with 4-layer canvas markup, gallery and clear-confirmation modals, toolbar buttons, color palette container, and script loading |
| `manifest.json` | PWA manifest defining app name ("My Coloring Book"), start URL, display mode, theme colors, and icon references |
| `service-worker.js` | Service worker with hybrid caching strategy (v4) and precache asset list |
| `package.json` | Project metadata and Playwright e2e test scripts; only dev dependency is `@playwright/test` |
| `playwright.config.js` | Playwright config: test dir `./tests`, base URL `http://127.0.0.1:4173`, service workers blocked during tests |

### `js/` — Application Modules

| File | Description |
|------|-------------|
| `js/app.js` | Bootstrap entry point; initializes all modules and registers the service worker |
| `js/canvas-manager.js` | 4-layer canvas system management: sizing, DPI scaling, image loading, transparency processing, composite rendering, resize handling |
| `js/undo-manager.js` | PNG snapshot-based undo stack (max 10 steps) |
| `js/color-palette.js` | 20-color kid-friendly swatch grid with selection management |
| `js/flood-fill.js` | Scanline stack-based flood fill with tolerance and outline boundary detection |
| `js/brush-engine.js` | Freehand painting with Pointer Events and coalesced event smoothing |
| `js/image-loader.js` | Gallery modal, file upload handlers, and draggable/resizable reference image panel |
| `js/toolbar.js` | Tool switching, button actions (undo, clear, save, gallery), brush size slider, fill-tap detection |
| `js/touch-guard.js` | Blocks pinch-zoom, context menu, and double-tap zoom on touch devices |

### `css/` — Styles

| File | Description |
|------|-------------|
| `css/styles.css` | Single stylesheet covering reset, app layout, canvas layers, reference panel, color palette, toolbar, modals, gallery grid, and confirmation dialog (~411 lines) |

### `images/` — Static Assets

| File | Description |
|------|-------------|
| `images/coloring-pages/cat.svg` | The only bundled coloring page template (cat outline) |
| `images/icons/icon-192.svg` | PWA icon at 192×192 size |
| `images/icons/icon-512.svg` | PWA icon at 512×512 size |

### `scripts/` — Dev Tooling

| File | Description |
|------|-------------|
| `scripts/static-server.js` | Minimal Node.js HTTP server serving project root on port 4173 with MIME type mapping and path traversal protection |

### `tests/` — Test Suite (54 tests total)

| File | Description |
|------|-------------|
| `tests/smoke.spec.js` | 4 Playwright e2e smoke tests: app boot, brush stroke + undo, reference panel drag/resize, drawing persistence through viewport resize |
| `tests/characterisation/canvas-manager.spec.js` | 9 characterisation tests for CanvasManager |
| `tests/characterisation/undo-manager.spec.js` | 5 characterisation tests for UndoManager |
| `tests/characterisation/color-palette.spec.js` | 5 characterisation tests for ColorPalette |
| `tests/characterisation/flood-fill.spec.js` | 5 characterisation tests for FloodFill |
| `tests/characterisation/brush-engine.spec.js` | 5 characterisation tests for BrushEngine |
| `tests/characterisation/toolbar.spec.js` | 7 characterisation tests for Toolbar |
| `tests/characterisation/image-loader.spec.js` | 9 characterisation tests for ImageLoader |

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
| `tests/characterisation/` | 50 characterisation tests across 7 module test files |
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

- Service worker cache version: `CACHE_VERSION = 'coloring-book-v4'` in `service-worker.js`
- Max canvas dimension: `MAX_CANVAS_DIMENSION = 2048` in `canvas-manager.js`
- Undo stack depth: `MAX_UNDO_STEPS = 10` in `undo-manager.js`
- Fill tolerance: `FILL_TOLERANCE = 32` in `flood-fill.js`
- Outline detection thresholds: `OUTLINE_LUMINANCE_THRESHOLD = 80`, `OUTLINE_ALPHA_THRESHOLD = 128` in `flood-fill.js`
- Reference panel minimums: `REFERENCE_PANEL_MIN_WIDTH = 140`, `REFERENCE_PANEL_MIN_HEIGHT = 120` in `image-loader.js`
- Color palette: 20 hardcoded hex values in `color-palette.js`
- Coloring page catalog: 1 entry (`cat.svg`) in `image-loader.js`

## Known Issues

1. ~~**Touch guards are global**~~ — **Resolved.** All touch/gesture prevention listeners in `touch-guard.js` are now scoped to `#canvas-container`, preserving text selection and scrolling in modals.
2. ~~**Playwright tests never executed**~~ — **Resolved.** Dependencies installed, all 51 tests passing (4 smoke + 47 characterisation).
3. **Only one coloring template** — `PRELOADED_COLORING_PAGES` in `image-loader.js` contains only `cat.svg`. The gallery and gallery grid CSS are ready for more, but no additional templates have been added.
4. **No persistence** — All user work is lost on page reload. There is no local storage, IndexedDB, or cloud save mechanism.
5. **No redo** — `UndoManager` supports undo only; there is no forward-history (redo) capability.
6. **No loading indicators** — Asynchronous operations (image loading, reference image loading) provide no visual feedback to the user.
7. **Console.warn-only error reporting** — Failed image loads are logged to `console.warn` (ADR-001) with no user-facing message. User-facing feedback deferred until FeedbackManager module is built.
8. ~~**`Docs` vs `docs` folder casing**~~ — **Resolved.** Standardized to lowercase `docs/` per ADR-006.
