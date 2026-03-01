# ADR-002: Coordinate Conversion

## Status
Accepted

## Context
Converting pointer event coordinates from CSS space to canvas pixel space is done in three different places using the same math but with no shared utility:

1. `brush-engine.js:94-102` — `getCanvasCoords(event)` helper returning `{ x, y }`
2. `flood-fill.js:20-25` — inline calculation inside `executeFloodFillAtPoint()`
3. `toolbar.js:141-143` — partial conversion (CSS coords only), then passes to FloodFill which converts again

This duplication means a coordinate conversion bug would need to be fixed in multiple places. It also creates a confusing API where `FloodFill.executeFloodFillAtPoint()` accepts CSS coordinates, not canvas coordinates, and does its own conversion internally.

## Decision
Add a `getCanvasPixelCoords(event)` method to `CanvasManager` that converts a pointer event's CSS coordinates to native canvas pixel coordinates. All modules must use this single method instead of computing the conversion themselves.

```javascript
// In canvas-manager.js, add to the public API:
function getCanvasPixelCoords(event) {
    const rect = interactionCanvas.getBoundingClientRect();
    const scaleX = interactionCanvas.width / rect.width;
    const scaleY = interactionCanvas.height / rect.height;
    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}
```

### Calling convention
- Functions that operate on canvas pixels (e.g., flood fill, brush stroke) must accept **canvas pixel coordinates**, not CSS coordinates
- The coordinate conversion happens once at the event handler level, not inside each module's internals

```javascript
// BEFORE (toolbar.js — passes CSS coords):
const cssX = event.clientX - rect.left;
const cssY = event.clientY - rect.top;
FloodFill.executeFloodFillAtPoint(cssX, cssY, color);

// AFTER (toolbar.js — passes canvas pixel coords):
const coords = CanvasManager.getCanvasPixelCoords(event);
FloodFill.executeFloodFillAtPoint(coords.x, coords.y, color);
```

```javascript
// BEFORE (flood-fill.js — converts internally):
function executeFloodFillAtPoint(cssX, cssY, fillColorHex) {
    const rect = interactionCanvas.getBoundingClientRect();
    const scaleX = interactionCanvas.width / rect.width;
    const startX = Math.floor(cssX * scaleX);
    ...

// AFTER (flood-fill.js — receives canvas pixel coords):
function executeFloodFillAtPoint(canvasX, canvasY, fillColorHex) {
    const startX = Math.floor(canvasX);
    const startY = Math.floor(canvasY);
    ...
```

## Consequences
- `canvas-manager.js`: add `getCanvasPixelCoords(event)` to the module and its public API
- `brush-engine.js`: replace private `getCanvasCoords(event)` with `CanvasManager.getCanvasPixelCoords(event)`
- `flood-fill.js`: remove internal coordinate conversion; accept canvas pixel coords directly
- `toolbar.js`: use `CanvasManager.getCanvasPixelCoords(event)` and pass result to FloodFill

## What this replaces
- `brush-engine.js:94-102` private `getCanvasCoords()` function
- `flood-fill.js:20-25` inline coordinate conversion
- `toolbar.js:141-143` partial CSS-only coordinate computation
