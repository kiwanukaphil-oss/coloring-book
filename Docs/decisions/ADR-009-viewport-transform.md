# ADR-009: Viewport Transform (Zoom/Pan)

## Status
Accepted

## Context
The app currently has no zoom or pan capability. Users cannot zoom into fine details when coloring small areas or pan around a zoomed canvas. On mobile devices, the browser's native pinch-zoom is deliberately blocked by `TouchGuard` to prevent accidental page zooming, but this also prevents any zoom interaction with the artwork.

The worldclass transformation audit identifies "no zoom/pan" as architectural ceiling #1, limiting the app's usefulness for detailed coloring work.

## Decision
A new `ViewportManager` module manages viewport state (`{ scale, offsetX, offsetY }`) and applies it as a CSS `transform` on `#canvas-container`.

### Zoom/Pan mechanics
- **CSS transform approach**: `transform: translate(Xpx, Ypx) scale(S)` on `#canvas-container` with `transform-origin: 0 0`
- **Zoom range**: 0.5x (half size) to 5x (5x magnification)
- **Default state**: scale=1, offsetX=0, offsetY=0

### Input bindings
- **Desktop**: Ctrl+scroll for zoom (pivot at cursor), spacebar+drag for pan
- **Touch**: Pinch gesture redirected from `TouchGuard` to `ViewportManager`, two-finger drag for pan
- **Keyboard**: Ctrl+= zoom in, Ctrl+- zoom out, Ctrl+0 reset view

### Coordinate conversion
Because the CSS transform changes `getBoundingClientRect()` to reflect the scaled/translated position, the existing `CanvasManager.getCanvasPixelCoords(event)` (ADR-002) should continue to work at any zoom level without modification. This must be verified with tests at scale 1, 0.5, 2, and 5.

If `getBoundingClientRect()` does not correctly account for the CSS transform in all browsers, fallback to manual coordinate adjustment:
```javascript
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

### TouchGuard interaction
`TouchGuard` calls `event.preventDefault()` on multi-touch events to block the browser's native pinch-zoom. `ViewportManager` registers its own `touchstart`/`touchmove`/`touchend` listeners on the same `#canvas-container` to handle app-level pinch zoom and two-finger pan. Both listener sets coexist because `preventDefault()` blocks browser behavior without stopping event propagation to other listeners. The redundant `preventDefault()` call in ViewportManager is harmless.

### Events
- `EventBus.emit('viewport:zoomed', { scale })` after zoom
- `EventBus.emit('viewport:panned', { offsetX, offsetY })` after pan
- `EventBus.emit('viewport:reset')` after reset to default

### Mode-specific UI
- **Studio mode**: Zoom pill control at bottom-left shows percentage and +/- buttons
- **Kids mode**: No visible zoom controls; pinch gesture still works

## Consequences
- New file: `js/viewport-manager.js`
- Unchanged: `js/touch-guard.js` (continues blocking browser pinch; ViewportManager handles app pinch independently)
- Modified: `js/toolbar.js` (scale-aware fill tap threshold: `10 * ViewportManager.getScale()`)
- Modified: `index.html` (zoom pill HTML, script tag)
- Modified: `js/app.js` (add to initialization sequence after CanvasManager)
- Existing `getCanvasPixelCoords()` must be tested at multiple zoom levels
