# ADR-018: Eyedropper Tool

## Status
Accepted

## Context
The mockup assessment identifies the eyedropper (color sampling from canvas) as the "#1 missing color workflow." Users frequently want to continue painting with an exact shade they used earlier. Currently, they must remember which swatch they used or scroll through recent colors.

The existing tool set is `fill`, `brush`, and `eraser`. Adding a fourth tool follows the same `Toolbar.setActiveTool()` pattern.

## Decision
Add an `'eyedropper'` tool that samples a pixel color from the coloring canvas at the tap/click point.

### Behavior
1. User activates eyedropper (button click, keyboard shortcut `I`, or mode-specific UI)
2. Pointer cursor changes to a crosshair
3. User taps/clicks on the canvas
4. The pixel color at that point is read via `CanvasManager.getPixelColorAt(x, y)` — a new utility that returns a hex string from a 1×1 `getImageData` call
5. The sampled color is set via `ColorPalette.setCurrentColor(hex)` and added to recent colors via `ColorPicker.addRecentColor(hex)`
6. A toast confirms the action ("Color picked!")
7. The tool **auto-switches back** to the previously active tool (transient tool pattern)

### Auto-switch-back pattern
The eyedropper is a transient tool — users don't stay in eyedropper mode. On activation, `Toolbar` stores the current tool as `previousToolBeforeEyedropper`. After sampling, `setActiveTool(previousToolBeforeEyedropper)` restores the previous state.

### Canvas coordinate handling
`getPixelColorAt(canvasX, canvasY)` receives coordinates already in canvas pixel space (via `CanvasManager.getCanvasPixelCoords(event)` per ADR-002). It reads from the coloring canvas at native resolution using `withNativeTransform` (ADR-007).

### Mode-specific UI
- **Kids mode**: Magnifying glass emoji bubble (🔍) in the tool column
- **Studio mode**: Additional tool in the dock and radial menu
- **Classic mode**: Standard toolbar button with title="Eyedropper"

### Keyboard shortcut
`I` key (industry standard: Photoshop, Figma, etc.) toggles eyedropper on. Sampling auto-switches back.

### Rules
- Eyedropper reads from the coloring canvas only (not outline or reference layers)
- If the sampled pixel is transparent (alpha = 0), return `null` and show no toast
- Auto-switch-back is mandatory — eyedropper never persists as active tool
- Eyedropper does not trigger undo snapshots (it's a read-only operation)
- Cursor preview shows a crosshair, not a brush circle

## Consequences
- Modified: `js/canvas-manager.js` (add `getPixelColorAt()`)
- Modified: `js/toolbar.js` (add `'eyedropper'` tool, auto-switch-back, `I` shortcut)
- Modified: `js/color-palette.js` (ensure `setCurrentColor()` works with arbitrary hex)
- Modified: `js/mode-manager.js` (wire eyedropper buttons for kids/studio)
- Modified: `index.html` (eyedropper buttons in all three UI modes)
- Modified: `css/styles.css` (crosshair cursor, button styling)
- New: `tests/characterisation/eyedropper.spec.js`
