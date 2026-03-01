# World-Class Coloring Book PWA -- Developer Roadmap

**Date**: 2026-02-28
**Project**: `c:\Users\kiwan\OneDrive\Drawing app`
**Status**: Approved, Phase 0 next

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
- **Script loading**: raw `<script>` tags in `index.html` (lines 97-105) in dependency order
- **CSS**: single file `css/styles.css`, no preprocessor
- **PWA**: service worker (`service-worker.js`) with hybrid caching, `manifest.json` for install prompt
- **Total size**: ~71KB (excluding SVG templates)

### Canvas Architecture (4 layers)

```
z-index 4  ┌──────────────────────────┐  interaction-canvas (pointer events only)
z-index 3  │  ┌────────────────────┐  │  outline-canvas (line art, non-interactive)
z-index 2  │  │  ┌──────────────┐  │  │  reference-canvas (guide overlay, semi-transparent)
z-index 1  │  │  │              │  │  │  coloring-canvas (user paint, writable)
           └──┘──┘──────────────┘──┘──┘
```

- **coloring-canvas** (z-1): user's paint layer. White background. All brush strokes and flood fills go here.
- **reference-canvas** (z-2): guide overlay at 35% opacity. Loaded separately via "Upload Reference Image".
- **outline-canvas** (z-3): the line art (SVG outline). White pixels are made transparent via `makeWhitePixelsTransparent()` so the coloring layer shows through.
- **interaction-canvas** (z-4): captures all pointer events. Never drawn to directly (except potential cursor preview in future). Fill tool detects taps here, brush engine captures strokes here.

All canvases share the same dimensions, DPI-scaled: `canvas.width = containerWidth * devicePixelRatio`, capped at `MAX_CANVAS_DIMENSION = 2048` to prevent memory issues on high-DPI tablets.

### Coordinate System
Every drawing operation uses `ctx.setTransform(1, 0, 0, 1, 0, 0)` to draw at native pixel resolution, bypassing the context's scale transform. Coordinates are converted from CSS space to canvas pixel space via:

```javascript
// From brush-engine.js:94-102
function getCanvasCoords(event) {
    const canvas = CanvasManager.getInteractionCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}
```

### Module Initialization Order (app.js:17-23)

```
1. TouchGuard.initialize()     -- prevent browser gesture interference
2. CanvasManager.initialize()  -- set up 4-layer canvas system
3. ColorPalette.initialize()   -- build color swatch UI
4. BrushEngine.initialize()    -- attach pointer event listeners
5. ImageLoader.initialize()    -- build gallery, set up uploads
6. Toolbar.initialize()        -- wire up all tool buttons
7. registerServiceWorker()     -- register PWA service worker
8. showGalleryOnFirstLoad()    -- open gallery for first pick
```

New modules must be inserted at the correct point in this chain based on their dependencies.

---

## 2. Current State & What's Been Done

### Completed (verified in code, Feb 2026)

| Fix | File | Lines | Commit |
|-----|------|-------|--------|
| Flood fill undo snapshots only fire when pixels changed | `js/flood-fill.js` | 83-89 | `489e866` |
| Canvas resize preserves layers via snapshot + scaled redraw | `js/canvas-manager.js` | 262-296 | `489e866` |
| Service worker upgraded to hybrid caching (network-first HTML, stale-while-revalidate static) | `service-worker.js` | 86-131 | staged |
| Playwright smoke test suite scaffolded | `tests/smoke.spec.js`, `playwright.config.js`, `scripts/static-server.js` | -- | staged |
| Reference image panel: draggable, resizable, separate upload flow | `js/image-loader.js` | 126-254 | `9494c9d` |

### Still Open

- **Touch guard scoping**: all listeners are on `document` (global), blocking accessibility features (`js/touch-guard.js` lines 18-51)
- **Playwright tests not executed**: dependency install blocked by offline cache mode
- **All roadmap features below**

---

## 3. Phase 0 -- Stability & Trust

**Goal**: Ship nothing new until the foundation is solid.

### 0.1 Scope Touch Guards to Canvas Only

**Problem**: `js/touch-guard.js` adds `touchmove`, `gesturestart`, `gesturechange`, `contextmenu`, and `touchend` listeners on `document` (lines 18-51). This blocks browser accessibility features, prevents text selection in modals, and interferes with scrolling in the gallery.

**Solution**: Replace `document` with `CanvasManager.getContainerElement()` (returns `#canvas-container`) for all listeners. The container wraps all 4 canvases and the reference panel.

**Implementation**:
```javascript
// BEFORE (touch-guard.js:18)
document.addEventListener('touchmove', (event) => { ... }, { passive: false });

// AFTER
function initialize() {
    const canvasContainer = document.getElementById('canvas-container');
    preventPinchZoom(canvasContainer);
    preventContextMenu(canvasContainer);
    preventDoubleTapZoom(canvasContainer);
}

function preventPinchZoom(target) {
    target.addEventListener('touchmove', (event) => {
        if (event.touches.length > 1) {
            event.preventDefault();
        }
    }, { passive: false });
    // ... same for gesturestart, gesturechange
}
```

**Files**: `js/touch-guard.js`
**Complexity**: Low
**Test**: Open gallery modal on a touch device. Verify scrolling works inside the gallery grid. Verify pinch-zoom is still blocked on the canvas.

### 0.2 Execute and Stabilize E2E Tests

**Problem**: Playwright tests exist but have never run. Dependencies aren't installed.

**Steps**:
1. Run `npm install` to install `@playwright/test` (see `package.json` line 11)
2. Run `npx playwright install chromium` to download the browser binary
3. Run `npm run test:e2e` to execute the smoke suite
4. Fix any failures
5. Optionally add `.github/workflows/e2e.yml` for CI

**Files**: `package.json`, `playwright.config.js`, `tests/smoke.spec.js`
**Complexity**: Low-Medium

### 0.3 QA Checklist

Create `Docs/qa-checklist.md` covering manual testing for:
- Fill tool: boundaries, anti-aliased edges, tap vs drag rejection, same-color skip
- Undo: 10-step history, undo after fill, undo after brush, undo after clear
- Resize: portrait↔landscape on tablet, content scaled proportionally
- Upload: custom PNG, custom SVG, invalid file, large file
- Reference panel: drag within bounds, resize within bounds, close button
- Cross-browser: Chrome, Safari, Firefox on iOS, Android, Desktop

**Files**: `Docs/qa-checklist.md` (new)
**Complexity**: Low

---

## 4. Tier 1 -- Core Polish

### 1.1 More Coloring Templates (5-8 SVGs)

Only 1 template (`cat.svg`) exists. Add 5-8 more covering categories kids love.

**SVG conventions** (match `cat.svg`):
- 800x800 `viewBox`
- `fill="none"` on all paths (transparent fill, stroke-only)
- `stroke="black"` with `stroke-width="3"` or `"4"`
- Simple, recognizable shapes with clear enclosed regions for flood fill

**Suggested templates**:
| ID | Title | Category | File |
|----|-------|----------|------|
| dog | Dog | Animals | `images/coloring-pages/dog.svg` |
| butterfly | Butterfly | Animals | `images/coloring-pages/butterfly.svg` |
| fish | Fish | Animals | `images/coloring-pages/fish.svg` |
| car | Car | Vehicles | `images/coloring-pages/car.svg` |
| rocket | Rocket | Vehicles | `images/coloring-pages/rocket.svg` |
| flower | Flower | Nature | `images/coloring-pages/flower.svg` |
| unicorn | Unicorn | Fantasy | `images/coloring-pages/unicorn.svg` |
| tree | Tree | Nature | `images/coloring-pages/tree.svg` |

**Files to modify**:
- `js/image-loader.js` line 11: add entries to `PRELOADED_COLORING_PAGES`
- `service-worker.js` line 12: add SVG paths to `ASSETS_TO_CACHE`

**How `makeWhitePixelsTransparent()` handles them**: SVGs render with transparent backgrounds, so the function (canvas-manager.js:188-212) processes them identically to `cat.svg`. No changes needed.

**Gallery auto-layout**: The CSS grid at `styles.css` line 296 (`grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`) auto-flows new cards. No CSS changes needed.

### 1.2 Gallery Categories + Labels

Group templates under headers and show titles beneath thumbnails.

**Approach**: Extend `PRELOADED_COLORING_PAGES` entries with a `category` property. In `buildGalleryThumbnails()` (image-loader.js:58-83), sort by category, insert `<h3>` headers when category changes, and add a `<span>` label below each thumbnail.

**Data shape**:
```javascript
{ id: 'dog', title: 'Dog', src: 'images/coloring-pages/dog.svg', category: 'Animals' }
```

**Files**: `js/image-loader.js`, `css/styles.css`

### 1.3 Eraser Tool

**Current state**: white swatch (`#FFFFFF`) at palette index 19 acts as a de facto eraser, but kids don't discover this.

**Implementation**: Add an eraser button to `index.html` (between brush and undo, around line 73). In `toolbar.js`, extend `activeTool` to accept `'eraser'`. In `brush-engine.js`, check for eraser tool in `handlePointerDown` (line 26) and `handlePointerMove` (line 55):

```javascript
// In brush-engine.js handlePointerDown/handlePointerMove:
const tool = Toolbar.getActiveTool();
if (tool !== 'brush' && tool !== 'eraser') return;

const color = (tool === 'eraser') ? '#FFFFFF' : ColorPalette.getCurrentColor();
```

Show the brush size slider for both brush and eraser tools.

**Files**: `index.html`, `js/toolbar.js`, `js/brush-engine.js`

### 1.4 Redo Support

**Current state**: `undo-manager.js` has only `snapshotStack` (line 10). No redo.

**Implementation**:
1. Add `let redoStack = []` to `undo-manager.js`
2. In `undoLastAction()` (line 30): before restoring, capture current canvas state and push to `redoStack`
3. Add `redoLastAction()`: pop from `redoStack`, capture current state onto `snapshotStack`, restore
4. In `saveSnapshot()` (line 16): set `redoStack = []` (new action invalidates forward history)
5. Add redo button to `index.html` after the undo button (line 81)
6. Wire in `toolbar.js`

**Files**: `js/undo-manager.js`, `index.html`, `js/toolbar.js`

### 1.5 Animations + Transitions

**Current state**: modals toggle via `.hidden { display: none }` (styles.css:269). No entrance/exit animations. Color swatches have `transform: scale(1.15)` on selection but no bounce.

**Implementation**:
- Replace `.modal.hidden { display: none }` with opacity+transform animation using `@keyframes`
- Add `@keyframes swatch-pop` for color selection bounce
- Add gallery card entrance stagger via `animation-delay`
- Use `animationend` event in JS to set `display: none` after exit animation

**CSS additions**:
```css
@keyframes modal-enter { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
@keyframes modal-exit { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
@keyframes swatch-pop { 0% { transform: scale(1); } 50% { transform: scale(1.3); } 100% { transform: scale(1.15); } }
```

**Files**: `css/styles.css`, `js/image-loader.js`, `js/color-palette.js`

### 1.6 Loading & Feedback Indicators

**Problem**: zero visual feedback for async operations. `loadOutlineImage()` is async (canvas-manager.js:85) but shows nothing during decode.

**New module**: `js/feedback-manager.js` (IIFE) exposing:
- `FeedbackManager.showLoadingSpinner()` / `hideLoadingSpinner()`
- `FeedbackManager.showToast(message, durationMs)`
- `FeedbackManager.showFillPulse(x, y)`

**Implementation**:
- Spinner: CSS-only animation inside `#canvas-container`, centered
- Toast: `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%)` with fade animation
- Fill pulse: expanding ring at tap coordinates, self-removes after 400ms

**Integration points**:
- `image-loader.js:277`: show spinner before `loadOutlineImage()`, hide in `.then()`
- `toolbar.js:101`: show toast "Saved!" after download link click
- `toolbar.js:145-149`: show fill pulse at tap position

**Files**: new `js/feedback-manager.js`, `index.html`, `css/styles.css`, `js/image-loader.js`, `js/toolbar.js`, `service-worker.js`

### 1.7 User-Facing Error Messages

Replace `console.error` calls with friendly toast messages (depends on 1.6).

**Locations**:
- `image-loader.js:282`: `console.error('Failed to load coloring page:', error)` → `FeedbackManager.showToast('Oops! Could not load that picture.')`
- `canvas-manager.js:116`: `image.onerror` → `FeedbackManager.showToast('Oops! That picture did not load.')`
- `canvas-manager.js:151`: same for reference image

### 1.8 Brush Cursor Preview

**Problem**: cursor is CSS `crosshair` -- kids can't see brush size.

**Approach**: Add a 5th canvas (`cursor-canvas`) at z-index 5 dedicated to cursor preview. On `pointermove`, draw a semi-transparent circle matching brush size and color. Set CSS `cursor: none` on `#interaction-canvas` when brush/eraser is active.

```javascript
// Pseudocode for cursor preview
interactionCanvas.addEventListener('pointermove', (event) => {
    if (tool !== 'brush' && tool !== 'eraser') return;
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    cursorCtx.beginPath();
    cursorCtx.arc(canvasX, canvasY, brushSize / 2, 0, Math.PI * 2);
    cursorCtx.strokeStyle = currentColor;
    cursorCtx.globalAlpha = 0.4;
    cursorCtx.stroke();
});
```

**Files**: `js/brush-engine.js`, `index.html` (new canvas), `css/styles.css`

### 1.9 Enhanced Color Picker

Add a "+" button at the palette bottom opening an HSL color wheel modal. Max 5 custom colors.

**New module**: `js/color-picker-modal.js`
**Files**: `js/color-palette.js` (add "+" button, add `setCurrentColor(hex)` API), `index.html`, `css/styles.css`

### 1.10 Keyboard Shortcuts

```
Ctrl+Z        Undo
Ctrl+Y        Redo
B             Brush tool
F             Fill tool
E             Eraser tool
Ctrl+S        Save (preventDefault to block browser save dialog)
[             Decrease brush size by 2 (min 4)
]             Increase brush size by 2 (max 40)
```

**Implementation**: `document.addEventListener('keydown', ...)` in `toolbar.js`. Expose `BrushEngine.adjustBrushSize(delta)` that also updates the slider DOM.

**Files**: `js/toolbar.js`, `js/brush-engine.js`

---

## 5. Tier 2 -- Engaging Features

### 2.1 Zoom and Pan

Pinch-to-zoom + two-finger pan on touch; scroll-wheel + middle-click on desktop. 0.5x-5x range.

**New module**: `js/viewport-manager.js` -- maintains `{ scale, offsetX, offsetY }` and exposes `screenToCanvas(x, y)`, `canvasToScreen(x, y)`, `setZoom(level, cx, cy)`, `pan(dx, dy)`, `resetView()`.

**Critical change**: all coordinate conversions in `brush-engine.js:94` and `flood-fill.js:22-25` must go through `ViewportManager.screenToCanvas()` instead of raw scale calculations.

**Touch guard impact**: `touch-guard.js` must conditionally allow two-finger gestures for zoom/pan instead of blocking all multi-touch.

**Files**: new `js/viewport-manager.js`, modify `js/touch-guard.js`, `js/canvas-manager.js`, `js/brush-engine.js`, `js/flood-fill.js`
**Complexity**: High

### 2.2 Stickers & Stamps

Pre-drawn SVG stamps that kids tap to place on canvas.

**New module**: `js/stamp-engine.js`
**New assets**: `images/stamps/*.svg` (15-20 stamps)
**Interaction**: when stamp tool active, show preview following pointer; tap to place via `coloringCtx.drawImage()`. Each placement calls `UndoManager.saveSnapshot()` first.

### 2.3 Sound Effects

Web Audio API with mute toggle. Sounds: splat (fill), brush stroke, color pop, whoosh (undo), shutter (save), chime (gallery).

**New module**: `js/sound-manager.js`
**New assets**: `audio/*.mp3` (50-200KB total, each under 1s and 50KB)
**Critical**: mobile browsers require user gesture before audio. Call `audioContext.resume()` on first `pointerdown`. Mute toggle persists to `localStorage`.

### 2.4 Eyedropper Tool

Long-press gesture (500ms hold) on canvas picks color at that pixel. Avoids extra toolbar button.

**Implementation**: read pixel via `coloringCtx.getImageData(x, y, 1, 1)`. Convert RGB to hex. Call `ColorPalette.setCurrentColor(hex)` (new public method needed -- currently no setter exists in color-palette.js).

### 2.5 Brush Opacity

Opacity slider (10-100%) next to brush size. Use scratch canvas technique to prevent intra-stroke compounding:
1. Paint full stroke on transparent offscreen canvas at `globalAlpha = 1.0`
2. On `pointerup`, composite offscreen → coloring canvas at desired `globalAlpha`

### 2.6 Edge-Aware Brush (Respect Outlines)

Brush strokes stop at outline edges. Check outline canvas alpha before painting each pixel.

**Approach**: before each `lineTo()` segment, sample outline pixels along the path. If an outline pixel (luminance < 80, alpha > 128 -- same thresholds as `isOutlinePixel()` in flood-fill.js:207-218) is detected, truncate the stroke at that point.

**Prerequisite**: feature 4.6 (Precomputed Outline Masks) makes this much faster by providing a pre-built binary mask instead of reading `getImageData()` per stroke.

### 2.7 Smart Fill Tolerance Control

**Current state**: `FILL_TOLERANCE = 32` is hardcoded in `flood-fill.js:11`.

**Implementation**: expose tolerance as a parameter. Add a slider (0-100) to the toolbar that appears when fill tool is active (like the brush size slider). Pass the value through `FloodFill.executeFloodFillAtPoint(cssX, cssY, color, tolerance)`.

```javascript
// flood-fill.js modification:
function executeFloodFillAtPoint(cssX, cssY, fillColorHex, tolerance) {
    const fillTolerance = (typeof tolerance === 'number') ? tolerance : FILL_TOLERANCE;
    // ... pass fillTolerance to scanlineFill and matchesTargetColor
}
```

### 2.8 Pattern & Texture Fill

Stripes, dots, crosshatch as fill options. Requires refactoring `scanlineFill()` to separate "region detection" from "pixel writing".

**New module**: `js/pattern-manager.js` -- generates `CanvasPattern` objects from procedurally drawn tiles (16x16 each).

### 2.9 User Layers (3-5 max)

Major architectural change. The `coloring-canvas` becomes a composite display. Each user layer is an offscreen canvas. Drawing goes to the active layer's canvas.

**New module**: `js/layer-manager.js`
**Impact**: `canvas-manager.js`, `brush-engine.js`, `flood-fill.js`, `undo-manager.js` all need significant modification.

---

## 6. Tier 3 -- Delight & Retention

### 3.1 Achievement System
Badges stored in `localStorage`. Trigger checks after save, fill, color select. Trophy case modal.

### 3.2 Saved Artwork Gallery ("My Art")
See Tier 3B.2 below (part of the persistence feature).

### 3.3 Social Sharing
`navigator.share({ files: [pngFile] })`. Fallback: `navigator.clipboard.write()` or download.
Add `CanvasManager.renderCompositeAsBlob()` using `canvas.toBlob()` instead of `toDataURL()`.

### 3.4 Confetti & Celebrations
Particle system: 80-120 particles, random velocities, gravity (`vy += 0.15`), 2-second burst via `requestAnimationFrame`. Draw on a temporary overlay canvas.

### 3.5 Seasonal Content + Themed Packs
Date-filtered `SEASONAL_COLORING_PAGES` array in `image-loader.js`. Themed packs (underwater, space, dinosaurs) with difficulty levels (simple/medium/detailed stroke count).

### 3.6 Favorites + Per-Page Progress Tracking
`localStorage` tracks pages colored and completion percentage. Gallery shows progress indicators and a "Recent" section. Heart-to-favorite functionality.

### 3.7 Guided Coloring Modes
Step-by-step color-by-number with pulsing region highlights and suggested colors. Tutorial data: ordered regions with center coordinates and color suggestions. Confetti on completion.

### 3.8 AI-Generated Outlines
Text prompt → image generation API → line-art PNG. Goes through `makeWhitePixelsTransparent()`. Requires backend (Firebase Cloud Function or direct API call). Rate limit: 5/day. Content safety filtering required.

---

## 7. Tier 3B -- Progress Saving & Cloud Storage

### 3B.1 Local Progress Saving (IndexedDB)

**Problem**: all work is lost on page reload. No persistence whatsoever.

**What gets saved per project**:

| Data | Format | Size | Purpose |
|------|--------|------|---------|
| Metadata | JSON | ~1 KB | Template ID, canvas dimensions, tool state, timestamps, status |
| Coloring canvas | PNG Blob via `canvas.toBlob()` | 200KB-2MB | The user's painting |
| Outline source | `templateId` string OR uploaded image Blob | 0-5MB | Re-render the line art |
| Reference image | Blob (if loaded) | 0-5MB | Guide image |
| Thumbnail | 200x200 PNG Blob | 5-20KB | Gallery preview |

**Why PNG Blobs, not data URLs**: `toBlob()` produces binary without base64 overhead (data URLs are ~33% larger). IndexedDB handles Blobs natively. `ImageData` at 2048x2048 would be ~16MB uncompressed.

**Auto-save triggers**:
1. **Idle timeout**: 30s after last pointer interaction (`pointerup`/`pointercancel`)
2. **After significant events**: flood fill completion, brush stroke end, clear confirmation
3. **On `visibilitychange`**: user switches tab, locks phone (most critical for mobile)
4. **On `beforeunload`**: last-resort save attempt

```javascript
// Auto-save debounce pattern:
let autoSaveTimer = null;

function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        ProgressManager.saveCurrentProgress();
    }, 30000);
}

function saveImmediately() {
    clearTimeout(autoSaveTimer);
    ProgressManager.saveCurrentProgress();
}
```

**Resume flow** (on app load, in `app.js`):
1. Open IndexedDB, read `last-open-project` setting
2. If exists and `status === "in-progress"`, show resume modal: "Keep going or start fresh?"
3. "Keep going": load outline (re-render SVG by ID or load stored blob), draw stored coloring blob, restore reference, restore tool settings
4. "Start fresh": open gallery as normal

**IndexedDB schema**:
```
Database: "coloring-book-db" (version 1)

Object Store: "projects"
  keyPath: "id" (UUID)
  indexes: "updatedAt", "status", "templateId"
  Record: {
    id: string,
    metadata: {
      templateId: string,          // "cat" or "custom-<hash>"
      status: "in-progress" | "completed",
      createdAt: number,
      updatedAt: number,
      canvasWidth: number,
      canvasHeight: number,
      imageRegion: { x, y, width, height },
      activeTool: "fill" | "brush" | "eraser",
      brushSize: number,
      activeColor: string
    },
    coloringBlob: Blob,            // PNG of coloring canvas
    outlineSource: string | Blob,  // templateId OR uploaded image blob
    referenceBlob: Blob | null,
    thumbnailBlob: Blob,           // 200x200 composite
    syncStatus: "local-only" | "synced" | "pending-upload" | "pending-delete",
    cloudId: string | null,
    lastSyncedAt: number | null
  }

Object Store: "app-settings"
  keyPath: "key"
  Records: { key: "last-open-project", value: "<project-id>" }, etc.
```

**New modules**:
- `js/storage-manager.js` -- IndexedDB wrapper with promise-based API: `saveProject()`, `loadProject(id)`, `listProjects()`, `deleteProject(id)`, `getSetting(key)`, `setSetting(key, value)`
- `js/progress-manager.js` -- serialization, auto-save timer, resume flow. Depends on `CanvasManager`, `StorageManager`, `ColorPalette`, `Toolbar`, `BrushEngine`

**Existing files modified**:
- `js/canvas-manager.js`: add `getLayerBlobs()` returning `{ coloringBlob, outlineBlob }` via `canvas.toBlob()`; add `restoreFromBlobs(coloringBlob, outlineImageSrc)` that draws blobs back onto canvases
- `js/app.js`: make init async for IndexedDB open; add resume-check before `showGalleryOnFirstLoad()`
- `js/brush-engine.js:85-89`: call `ProgressManager.scheduleAutoSave()` in `handlePointerUp`
- `js/flood-fill.js:94`: call `ProgressManager.scheduleAutoSave()` after `putImageData`
- `js/toolbar.js:95-102`: save button also persists to IndexedDB via `ProgressManager.markAsCompleted()`
- `js/image-loader.js`: expose `getCurrentImageSource()`, notify `ProgressManager.startNewProject()` on template load
- `index.html`: resume modal HTML, new `<script>` tags

### 3B.2 Saved Artwork Gallery ("My Art")

In-app gallery showing all saved artwork from IndexedDB as thumbnails. Separate from template gallery.

**New module**: `js/gallery-manager.js` -- reads from `StorageManager.listProjects()`, renders thumbnail grid, supports open (resume), export, and delete.

**Max entries**: 50. Show storage warning when near limit.

### 3B.3 Cloud Sync via Firebase

**Recommended backend**: Firebase (compat SDK via CDN `<script>` tags).

**Why Firebase over alternatives**:
| Criteria | Firebase | Supabase | Cloudflare R2 | Custom |
|----------|----------|----------|---------------|--------|
| CDN script-tag loading | Yes (compat SDK) | Yes (UMD) | No (custom API) | No (custom API) |
| Offline persistence | Firestore built-in | None | None | None |
| Auth for kids | Anonymous + email link | Anonymous + magic link | DIY | DIY |
| Setup effort | Low | Medium | High | High |
| Free tier | Generous | Generous | Very generous | N/A |

**Architecture: local-first, cloud-mirror**

```
[User Action] → [CanvasManager] → [ProgressManager] → [IndexedDB]
                                                            │ (background)
                                                    [CloudSync/SyncManager]
                                                            │
                                                    [Firebase Cloud]
```

IndexedDB is always the source of truth. UI never waits for cloud.

**What gets synced**:

| Data | Cloud Location | Sync Priority |
|------|---------------|---------------|
| Project metadata | Firestore `users/{uid}/projects/{id}` | High (first) |
| Coloring PNG | Storage `users/{uid}/projects/{id}/coloring.png` | High |
| Uploaded templates | Storage `users/{uid}/projects/{id}/outline.png` | Medium |
| Reference images | Storage `users/{uid}/projects/{id}/reference.png` | Low |
| Thumbnails | Storage `users/{uid}/projects/{id}/thumbnail.png` | High (for gallery) |

Bundled templates (`cat.svg`, etc.) are NOT synced -- just the `templateId`.

**Sync flow**:
1. On save: set `syncStatus: "pending-upload"` in IndexedDB
2. SyncManager checks pending items every 60s when online + on `navigator.onLine` transitions
3. Upload blobs to Firebase Storage, write metadata to Firestore
4. On success: update `syncStatus: "synced"`, set `cloudId`, `lastSyncedAt`
5. On failure: leave as `"pending-upload"`, retry next cycle

**New device download**:
1. On first sign-in, query Firestore for all projects under `users/{uid}/projects`
2. Download metadata + thumbnails eagerly (small, fast)
3. Full blobs download lazily on project open (prevents 500MB download bomb)

**Conflict resolution**: last-write-wins by `updatedAt` timestamp. Canvas pixel data cannot be meaningfully merged.

**Auth for kids**:
1. **First launch**: Firebase Anonymous Auth -- zero friction, no sign-up
2. **Cross-device (parent-initiated)**: "Link Device" in settings → parent enters email → Firebase magic link → second device signs in with same email → both share same UID

**Firestore security rules**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Storage security rules**:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/projects/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      allow write: if request.resource.size < 10 * 1024 * 1024;
    }
  }
}
```

**COPPA note**: Anonymous auth collects no personal data from the child. Email link flow involves parent only. Formal legal review recommended before production launch.

**New module**: `js/cloud-sync.js`

**Script loading order after all 3B phases**:
```html
<!-- Firebase SDK (compat, no npm) -->
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.0/firebase-storage-compat.js"></script>

<!-- App modules -->
<script src="js/touch-guard.js"></script>
<script src="js/canvas-manager.js"></script>
<script src="js/undo-manager.js"></script>
<script src="js/color-palette.js"></script>
<script src="js/flood-fill.js"></script>
<script src="js/brush-engine.js"></script>
<script src="js/image-loader.js"></script>
<script src="js/toolbar.js"></script>
<script src="js/storage-manager.js"></script>
<script src="js/progress-manager.js"></script>
<script src="js/cloud-sync.js"></script>
<script src="js/gallery-manager.js"></script>
<script src="js/app.js"></script>
```

### 3B.4 Progressive Implementation Order

Each step is independently shippable:
1. **Local progress saving** (3B.1) -- resume on same device
2. **Artwork gallery** (3B.2) -- browse saved work locally
3. **Firebase anonymous auth** (3B.3 partial) -- establish UID
4. **Cloud sync** (3B.3 full) -- background upload/download
5. **Cross-device access** (email linking)

---

## 8. Tier 4 -- Platform Excellence

### 4.1 Dark Mode

Refactor all hardcoded colors in `styles.css` to CSS custom properties:

| Current Value | Variable | Light | Dark |
|---------------|----------|-------|------|
| `#FFF9C4` (body bg) | `--body-bg` | `#FFF9C4` | `#1a1a2e` |
| `#37474F` (toolbar bg) | `--toolbar-bg` | `#37474F` | `#0f3460` |
| `#546E7A` (button bg) | `--button-bg` | `#546E7A` | `#16213e` |
| `#f0f0f0` (palette bg) | `--palette-bg` | `#f0f0f0` | `#1a1a2e` |
| `#ffffff` (modal bg) | `--modal-bg` | `#ffffff` | `#16213e` |

Canvas container stays `background-color: #ffffff` in both modes.

### 4.2 Accessibility (WCAG 2.1 AA)

- ARIA: `role="toolbar"`, `role="dialog"` on modals, `aria-pressed` on swatches, `aria-live="polite"` announcer
- Focus trapping in modals (Tab/Shift+Tab cycling)
- `@media (prefers-reduced-motion: reduce)` disables animations
- `@media (prefers-contrast: more)` for high-contrast mode

### 4.3 Multi-Language (i18n)

`data-i18n="key"` attributes on HTML elements. `I18n.t('gallery.title')` lookups in JS. Auto-detect `navigator.language`. RTL support for Arabic via `document.documentElement.dir = 'rtl'`.

### 4.4 Parental Controls

Parent gate (math problem), settings panel with sound toggle, time limit reminder, dark mode, language, data export (zip all saved artwork).

### 4.5 Performance: Web Workers + OffscreenCanvas

Move `scanlineFill()` to a Web Worker for non-blocking flood fill on large canvases. Use `OffscreenCanvas` where supported.

**New file**: `js/workers/flood-fill-worker.js`
**Integration**: `flood-fill.js` dispatches pixel data via `postMessage()`, awaits result, writes back with `putImageData()`.

### 4.6 Precomputed Outline Masks

On template load (after `makeWhitePixelsTransparent()`), generate a `Uint8Array` binary mask where `1` = outline pixel, `0` = non-outline. Store in memory. Used by edge-aware brush (2.6) and faster fill region detection.

```javascript
// Pseudocode for mask generation in canvas-manager.js:
function computeOutlineMask() {
    const imageData = outlineCtx.getImageData(0, 0, width, height);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) {
        const idx = i * 4;
        const a = imageData.data[idx + 3];
        const luminance = 0.299 * imageData.data[idx] + 0.587 * imageData.data[idx+1] + 0.114 * imageData.data[idx+2];
        mask[i] = (a >= 128 && luminance < 80) ? 1 : 0;
    }
    return mask;
}
```

### 4.7 Telemetry Dashboard

Local-only analytics in `localStorage`. Track: popular templates, session duration, tool usage frequency, device types. Optionally send via `navigator.sendBeacon()` to a backend. Accessible behind parent gate.

---

## 9. Build Order & Phasing

| Phase | Features | Focus | Estimated Scope |
|-------|----------|-------|-----------------|
| **0** | 0.1, 0.2, 0.3 | Stability -- scope touch guards, run tests, QA checklist | Small |
| **1** | 1.1, 1.3, 1.4, 1.5, 1.10 | Foundation -- templates, eraser, redo, animations, shortcuts | Medium |
| **2** | 1.6, 1.7, 1.8 | Feedback layer -- spinners, toasts, cursor preview | Medium |
| **3** | 3B.1, 3B.2 | Persistence -- local auto-save, resume, saved artwork gallery | Large |
| **4** | 3B.3 | Cloud -- Firebase auth + sync + cross-device access | Large |
| **5** | 2.3, 2.4, 2.7, 1.9, 2.5 | Creative tools -- sounds, eyedropper, fill tolerance, color picker, opacity | Medium |
| **6** | 2.1, 3.3, 2.6 | Navigation + precision -- zoom/pan, sharing, edge-aware brush | Large |
| **7** | 3.1, 3.5, 3.6, 3.4, 1.2 | Engagement -- achievements, seasonal content, progress tracking, celebrations | Medium |
| **8** | 4.1, 4.2, 4.4 | Platform -- dark mode, accessibility, parental controls | Medium |
| **9** | 2.8, 2.9, 4.3, 4.5, 4.6 | Advanced -- pattern fills, layers, i18n, workers, outline masks | Large |
| **10** | 3.7, 3.8, 2.2, 4.7 | Innovation -- guided modes, AI outlines, stickers, telemetry | Large |

---

## 10. Module Dependency Map

```
                    ┌─────────────────┐
                    │    app.js        │ (bootstraps everything)
                    └────────┬────────┘
                             │ initializes in order:
          ┌──────────────────┼──────────────────────┐
          │                  │                       │
   ┌──────▼──────┐  ┌───────▼──────┐  ┌────────────▼────────────┐
   │ TouchGuard   │  │CanvasManager │  │ StorageManager (future)  │
   └──────────────┘  └───────┬──────┘  └────────────┬────────────┘
                             │                       │
          ┌──────────────────┼──────────┐  ┌────────▼────────────┐
          │                  │          │  │ProgressManager (fut) │
   ┌──────▼──────┐  ┌───────▼──────┐   │  └────────┬────────────┘
   │ UndoManager  │  │ ColorPalette │   │           │
   └──────────────┘  └──────────────┘   │  ┌────────▼────────────┐
                                        │  │ CloudSync (future)   │
   ┌──────────────┐  ┌──────────────┐   │  └─────────────────────┘
   │ FloodFill    │  │ BrushEngine  │   │
   │ reads: CM,   │  │ reads: CM,   │   │
   │ UM, outline  │  │ CP, Toolbar  │   │
   └──────────────┘  └──────────────┘   │
                                        │
   ┌──────────────┐  ┌──────────────┐   │
   │ ImageLoader  │  │   Toolbar    │◄──┘
   │ reads: CM,   │  │ wires: all   │
   │ UM           │  │ tools        │
   └──────────────┘  └──────────────┘
```

**Key**: CM = CanvasManager, UM = UndoManager, CP = ColorPalette

---

## 11. Conventions & Patterns

### Module Pattern
Every JS module is an IIFE returning a public API:
```javascript
const ModuleName = (() => {
    // Private state and functions

    function initialize() {
        // Setup code
    }

    // Public API
    return {
        initialize,
        publicMethod
    };
})();
```

### Adding a New Module
1. Create `js/module-name.js` following the IIFE pattern above
2. Add `<script src="js/module-name.js"></script>` to `index.html` at the correct dependency position
3. Add `'./js/module-name.js'` to `ASSETS_TO_CACHE` in `service-worker.js`
4. Bump the cache version in `service-worker.js` (e.g., `coloring-book-v4` → `coloring-book-v5`)
5. Call `ModuleName.initialize()` in `app.js` at the correct point in the boot sequence

### Canvas Drawing Convention
Always reset the transform before raw pixel operations:
```javascript
ctx.save();
ctx.setTransform(1, 0, 0, 1, 0, 0);
// ... draw at native pixel coordinates
ctx.restore();
```

### CSS Visibility Toggling
Use `.hidden { display: none }` class. For animated show/hide (after 1.5 is implemented), use animation classes with `animationend` listener to set `display: none` after exit animation completes.

### Naming Conventions
- **Files**: `kebab-case.js`
- **Modules**: `PascalCase` (e.g., `CanvasManager`, `BrushEngine`)
- **Functions**: `camelCase`, intent-based names (not generic like `handleData`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_CANVAS_DIMENSION`, `FILL_TOLERANCE`)
- **CSS classes**: `kebab-case` (e.g., `tool-button`, `gallery-item`)
- **IDs**: `kebab-case` (e.g., `canvas-container`, `tool-fill`)

### Comments
- Explanatory comment on any function longer than 10 lines
- Block comments above modules (`/* ===== Module Name ===== */`)

---

## 12. Testing Strategy

### Existing Tests
- `tests/smoke.spec.js`: 4 Playwright smoke tests covering boot, brush+undo, reference panel, and resize persistence
- `scripts/static-server.js`: local HTTP server on port 4173 for test runs
- `playwright.config.js`: configured with `serviceWorkers: 'block'` to prevent caching interference

### Running Tests
```bash
npm install                     # Install @playwright/test
npx playwright install chromium # Download browser binary
npm run test:e2e                # Run all tests headless
npm run test:e2e:headed         # Run with visible browser
npm run test:e2e:ui             # Interactive Playwright UI
```

### Tests to Add per Feature

| Feature | Test |
|---------|------|
| 0.1 Touch guard scoping | Verify gallery modal scrolls on touch device |
| 1.3 Eraser | Paint a stroke, switch to eraser, erase it, verify white pixels |
| 1.4 Redo | Undo, then redo, verify canvas matches original |
| 1.6 Toast | Save, verify toast appears and auto-dismisses |
| 2.7 Fill tolerance | Fill with low vs high tolerance, verify fill area differs |
| 3B.1 Progress save | Paint, reload page, verify resume modal appears |
| 3B.3 Cloud sync | Mock Firebase, verify `syncStatus` transitions |

---

## 13. Critical Files Reference

| File | Lines | Role | Most Modified By |
|------|-------|------|------------------|
| `js/toolbar.js` | 162 | Central hub wiring all tools | Nearly every feature |
| `js/canvas-manager.js` | 326 | 4-layer canvas system, coordinate transforms | Zoom, layers, save, persistence |
| `js/brush-engine.js` | 119 | Freehand painting with coalesced events | Eraser, opacity, cursor preview, auto-save |
| `js/flood-fill.js` | 235 | Scanline stack-based fill with tolerance | Fill tolerance, patterns, workers, auto-save |
| `js/image-loader.js` | 300 | Gallery, file upload, reference panel | Templates, categories, seasonal content |
| `js/undo-manager.js` | 68 | PNG snapshot stack (10 steps) | Redo, layers |
| `js/color-palette.js` | 90 | 20-color swatch grid | Color picker, eyedropper |
| `js/touch-guard.js` | 56 | Block browser gestures | Touch scoping, zoom/pan |
| `js/app.js` | 47 | Bootstrap and service worker registration | Async init, resume flow |
| `css/styles.css` | ~340 | All visual styling | Animations, dark mode, new components |
| `index.html` | 108 | HTML structure, script tags | New buttons, modals, Firebase CDN |
| `service-worker.js` | 133 | Hybrid caching (v4) | New asset caching, Firebase CDN rules |
