# Architecture

## Overview

This is a kids' coloring book Progressive Web App (PWA) built with vanilla JavaScript and no build system. Users pick or upload coloring page outlines, then paint them using flood-fill and freehand brush tools on a 5-layer canvas system. The app supports dual-mode UI (Kids and Studio modes via ADR-015), zoom/pan via CSS transforms (ADR-009), an HSL color picker (ADR-012), and command-based undo with 50-step history (ADR-011). It works fully offline via a service worker and is designed for touch-first tablet/mobile use.

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
6. **User undoes/redoes** — `UndoManager` delegates to `CommandManager`, which pops the most recent `ImageData` command from its undo stack and calls `putImageData()` to synchronously restore the **coloring canvas** (ADR-011). The command is pushed onto the redo stack. Redo reverses this. New drawing actions clear the redo stack.
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
| EventBus | `js/event-bus.js` | Lightweight pub/sub event system for decoupled cross-module communication using `noun:verb` event naming (ADR-014) | None |
| TouchGuard | `js/touch-guard.js` | Prevents browser gestures (pinch-zoom, context menu, double-tap zoom) from interfering with drawing on touch devices | None |
| FeedbackManager | `js/feedback-manager.js` | Loading spinner overlay, toast notifications for user feedback on save/error events | None |
| ModeManager | `js/mode-manager.js` | Manages dual-mode UI state (Kids/Studio), handedness (left/right), and theme (light/dark) via `data-mode`/`data-hand`/`data-theme` attributes (ADR-015). Wires mode-specific buttons to delegate to existing module APIs | EventBus |
| CanvasManager | `js/canvas-manager.js` | Creates and manages the 5-layer canvas system (coloring, reference, outline, interaction, cursor); handles sizing, DPI scaling, image loading, white-pixel transparency, composite rendering for save, resize preservation, and outline mask computation (ADR-008). Provides shared utilities: `withNativeTransform()` (ADR-007), `getCanvasPixelCoords()` (ADR-002), and `getOutlineMask()` (ADR-008) | None |
| ViewportManager | `js/viewport-manager.js` | Zoom (0.5x–5x) and pan of the canvas container via CSS transforms. Handles Ctrl+scroll, pinch, spacebar+drag, and keyboard zoom shortcuts (ADR-009) | EventBus, CanvasManager |
| CommandManager | `js/command-manager.js` | Maintains undo/redo stacks of command objects using `ImageData` for synchronous canvas restore. Max 50 steps (ADR-011) | CanvasManager |
| UndoManager | `js/undo-manager.js` | Backward-compatible facade over CommandManager; captures canvas state as `ImageData` commands for instant synchronous undo/redo (ADR-011). Public API unchanged from original PNG snapshot approach | CanvasManager, CommandManager |
| ColorPalette | `js/color-palette.js` | Renders a vertical grid of 20 kid-friendly color swatches with roving tabindex keyboard navigation (ADR-013); manages the currently selected color | None |
| ColorPicker | `js/color-picker.js` | HSL color picker with canvas-rendered hue ring and saturation/lightness square, recent colors in localStorage (ADR-012) | ColorPalette |
| FloodFill | `js/flood-fill.js` | Iterative scanline stack-based flood fill with configurable tolerance for anti-aliased edges and outline boundary detection | CanvasManager, UndoManager |
| BrushEngine | `js/brush-engine.js` | Handles freehand painting and erasing via Pointer Events with coalesced events for smooth strokes; supports configurable brush size and cursor preview | CanvasManager, ColorPalette, Toolbar |
| ImageLoader | `js/image-loader.js` | Manages the coloring page gallery modal (pre-loaded thumbnails + file upload), the saved artwork gallery ("My Art" tab with resume/delete), reference image upload, and the draggable/resizable reference panel. Focus trap and Escape key close for accessibility (ADR-013) | CanvasManager, UndoManager, StorageManager, ProgressManager |
| Toolbar | `js/toolbar.js` | Manages tool selection (fill/brush/eraser), brush size slider, undo/redo/clear/save/gallery button actions, keyboard shortcuts, fill-tap detection, and the clear confirmation dialog. Provides `saveAndDownload()` for mode-specific save buttons (ADR-015) | CanvasManager, UndoManager, ColorPalette, FloodFill, BrushEngine, ImageLoader, ProgressManager, ViewportManager |
| StorageManager | `js/storage-manager.js` | Promise-based IndexedDB wrapper for persisting coloring projects (canvas blobs, metadata, thumbnails) | None |
| ProgressManager | `js/progress-manager.js` | Orchestrates auto-save of drawing progress, project lifecycle (start/save/complete), and resume-from-previous-session flow | StorageManager, CanvasManager, UndoManager, Toolbar, BrushEngine, ColorPalette, FeedbackManager |
| App | `js/app.js` | Entry point; initializes all modules in dependency order, registers the service worker, opens IndexedDB, and checks for resumable projects | All modules |
| ServiceWorker | `service-worker.js` | Hybrid caching strategy for offline PWA support (network-first HTML, stale-while-revalidate static assets) | None (runs in separate thread) |
| StaticServer | `scripts/static-server.js` | Lightweight Node.js HTTP file server for local development and Playwright e2e testing | Node.js built-ins (http, fs, path) |

### Initialization Order (`app.js` lines 26–52)

```
1. TouchGuard.initialize()        — prevent browser gesture interference
2. FeedbackManager.initialize()   — set up spinner and toast elements
3. CanvasManager.initialize()     — set up 5-layer canvas system
4. ViewportManager.initialize()   — set up zoom/pan on canvas container (ADR-009)
5. ColorPalette.initialize()      — build color swatch UI
6. ColorPicker.initialize()       — set up HSL picker popover (ADR-012)
7. BrushEngine.initialize()       — attach pointer event listeners
8. ImageLoader.initialize()       — build gallery, set up uploads
9. Toolbar.initialize()           — wire up all tool buttons
10. ModeManager.initialize()      — apply Kids/Studio mode, wire mode-specific UI (ADR-015)
11. ProgressManager.initialize()  — register visibilitychange listener
12. registerServiceWorker()       — register PWA service worker
13. StorageManager.initialize()   — async: open IndexedDB
14. checkForResumableProject()    — async: resume modal or gallery
```

New modules must be inserted at the correct point in this chain based on their dependencies.

## File & Folder Index

### Root Files

| File | Description |
|------|-------------|
| `index.html` | Main HTML document with 5-layer canvas markup, gallery (tabbed: Templates + My Art)/clear/resume modals, toolbar buttons, color palette container, and script loading |
| `manifest.json` | PWA manifest defining app name ("My Coloring Book"), start URL, display mode, theme colors, and icon references |
| `service-worker.js` | Service worker with hybrid caching strategy (v14) and precache asset list |
| `package.json` | Project metadata and Playwright e2e test scripts; only dev dependency is `@playwright/test` |
| `playwright.config.js` | Playwright config: test dir `./tests`, base URL `http://127.0.0.1:4173`, service workers blocked during tests |

### `js/` — Application Modules

| File | Description |
|------|-------------|
| `js/app.js` | Bootstrap entry point; initializes all modules, registers the service worker, opens IndexedDB, and checks for resumable projects |
| `js/event-bus.js` | Pub/sub event system with `on`/`off`/`emit` and `noun:verb` naming (ADR-014) |
| `js/canvas-manager.js` | 5-layer canvas system management: sizing, DPI scaling, image loading, transparency processing, composite rendering, resize handling, outline mask computation |
| `js/mode-manager.js` | Dual-mode UI state (Kids/Studio), handedness, theme management via data attributes (ADR-015) |
| `js/viewport-manager.js` | CSS transform zoom/pan on canvas container, 0.5x–5x range (ADR-009) |
| `js/command-manager.js` | Command-based undo/redo stacks using ImageData, max 50 steps (ADR-011) |
| `js/undo-manager.js` | Backward-compatible facade over CommandManager; synchronous ImageData undo/redo (ADR-011) |
| `js/color-palette.js` | 20-color kid-friendly swatch grid with roving tabindex keyboard navigation (ADR-013) |
| `js/color-picker.js` | HSL color picker with hue ring, SL square, recent colors (ADR-012) |
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
| `css/styles.css` | Single stylesheet with CSS design tokens on `:root` (ADR-010), dark mode overrides, accessibility styles (`:focus-visible`, `.sr-only`, `prefers-reduced-motion` per ADR-013), dual-mode UI visibility rules (ADR-015), app layout, canvas layers, reference panel, color palette, toolbar, modals, gallery tabs, saved artwork cards, gallery grid, confirmation dialog, zoom pill, color picker popover, glassmorphism, and CSS animations |

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
| `docs/decisions/ADR-001` through `ADR-016` | Architecture Decision Records defining canonical patterns |

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
| `docs/decisions/` | 16 ADRs defining canonical patterns (error handling, coordinates, visibility, booleans, event handlers, folder casing, canvas context reset, outline mask, viewport transform, design tokens, command undo, color picker, accessibility, event bus, dual-mode UI, classic test mode) |
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

- Service worker cache version: `CACHE_VERSION = 'coloring-book-v14'` in `service-worker.js`
- Max canvas dimension: `MAX_CANVAS_DIMENSION = 2048` in `canvas-manager.js`
- Undo stack depth: `MAX_UNDO_STEPS = 50` in `command-manager.js`
- Zoom range: `MIN_SCALE = 0.5`, `MAX_SCALE = 5` in `viewport-manager.js`
- Recent color limit: max 8 in `color-picker.js`
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
9. ~~**No dual-mode UI**~~ — **Resolved.** Kids and Studio modes via `ModeManager` (ADR-015) with CSS design tokens (ADR-010).
10. ~~**No zoom/pan**~~ — **Resolved.** `ViewportManager` provides CSS transform zoom/pan (ADR-009).
11. ~~**Undo uses PNG data URLs (slow, 10 steps)**~~ — **Resolved.** `CommandManager` uses synchronous `ImageData` with 50-step limit (ADR-011).
12. ~~**No accessibility**~~ — **Resolved.** ARIA roles, keyboard navigation, focus traps, `prefers-reduced-motion` (ADR-013).
