# ADR-027: Brush Opacity

## Status
Accepted

## Context
BrushEngine draws strokes at full opacity. A user-controlled opacity slider requires that
overlapping stamps and marker segment caps do not compound alpha within a single stroke —
the entire stroke should appear at the chosen opacity uniformly.

Without special handling, drawing a marker stroke at `globalAlpha = 0.5` produces darkened
joints wherever one segment's round cap overlaps the next, making the stroke uneven. Stamp-based
presets (crayon, watercolor, pencil, sparkle) have the same problem: stamps overlap on slow
strokes and accumulate opacity within a single gesture.

## Decision

### Scratch-canvas compositing
Each brush stroke is drawn onto a per-stroke offscreen `scratchCanvas` at full preset alpha
(preset internal `globalAlpha` values are unchanged). On `pointerup`, the scratch canvas is
composited onto the active layer at `brushOpacity`:

```javascript
ctx.globalAlpha = brushOpacity;
ctx.drawImage(scratchCanvas, 0, 0);
ctx.globalAlpha = 1.0;
```

This prevents within-stroke compounding for both marker (overlapping round caps) and stamp-based
presets (overlapping stamps on slow strokes).

### DOM insertion for live visual feedback
The scratch canvas is inserted into `#canvas-container` at z-index 7 (above all 5 user layers
z-index 2–6, below outline at 11) with `style.opacity = brushOpacity`. This gives live visual
feedback during the stroke without modifying the active layer until `pointerup`.

`style.pointerEvents = 'none'` prevents the scratch canvas from intercepting pointer events
meant for the interaction canvas.

The container reference is obtained via `CanvasManager.getColoringCanvas().parentElement` —
no new `CanvasManager` function is needed.

### Outline restoration
`restoreOutlinePixels` is removed from per-segment rendering and runs once in `handlePointerUp`,
covering the full stroke bounding box, for **both** tools:

- **Brush tool**: runs inside the scratch canvas composite block, after `ctx.drawImage`.
- **Eraser tool**: runs in a separate `withNativeTransform` call in the `else` branch. The eraser
  draws directly to the active layer at full opacity so no compositing step exists, but
  `restoreOutlinePixels` is still called explicitly rather than relying on `ERASER_COLOR = '#FFFFFF'`
  being white — correct by construction if eraser behaviour ever changes.

This simplifies `renderMarkerSegment` and `renderStampedSegment` by removing the per-segment local
bbox tracking that existed only to bound the restoration call.

### Eraser bypass
The eraser always draws directly to the active layer at full opacity. The scratch canvas is not
created when `Toolbar.getActiveTool() === 'eraser'`. An eraser at partial opacity would leave
colour residue, which is not expected eraser behaviour.

### Scratch canvas sizing
Scratch canvas pixel dimensions match the active layer exactly:
- `scratchCanvas.width/height` from `CanvasManager.getColoringCanvas().width/height`
- CSS dimensions: `pixel width / scaleFactor` × `pixel height / scaleFactor`
- `scaleFactor` from `CanvasManager.getScaleFactor()` (already used by BrushEngine)
- Context created with `ctx.scale(scaleFactor, scaleFactor)` so coordinate space matches
  the active layer context. No `willReadFrequently` hint — scratchCtx is write-only during
  a stroke; pixel reads happen on the active layer context via `drawImage`, not on scratchCtx.

### Public API
- `BrushEngine.setBrushOpacity(opacity)` — accepts 0.05–1.0; clamps out-of-range values
- `BrushEngine.getBrushOpacity()` — returns current value
- Default: 1.0 (fully opaque — existing behaviour unchanged at default)

### Rules
- Scratch canvas created on every `pointerdown` for the brush tool; never for the eraser
- Scratch canvas removed from DOM and nulled in `handlePointerUp` (which is also the handler
  for `pointercancel` and `pointerleave`)
- `brushOpacity` range: 0.05–1.0; `setBrushOpacity()` clamps the value
- Toolbar owns the slider UI and calls `BrushEngine.setBrushOpacity()`
- Opacity slider shown for brush tool only; hidden for eraser, fill, eyedropper
- Known limitation: eraser opacity not supported (by design — see rationale above)
- Known limitation: window resize during an active stroke may misalign the scratch canvas
  (edge case; the scratch canvas is discarded at stroke end regardless)

## Consequences
- New: `Docs/decisions/ADR-027-brush-opacity.md`
- New: `tests/characterisation/brush-engine.spec.js`
- Modified: `js/brush-engine.js` — scratch canvas state, `getStrokeContext()`,
  `setBrushOpacity`/`getBrushOpacity`, modified `handlePointerDown`/`handlePointerUp`,
  simplified `renderMarkerSegment`/`renderStampedSegment`
- Modified: `js/toolbar.js` — `setupBrushOpacitySlider()`, `setBrushOpacity()` public function,
  show/hide in `setActiveTool()`
- Modified: `index.html` — `#brush-opacity-control` markup
- Modified: `css/styles.css` — opacity control styles (~30 LOC)
