# ADR-012: Custom Color Picker

## Status
Accepted

## Context
The current color palette is a fixed grid of 20 kid-friendly hex colors. Users cannot pick custom colors, adjust lightness/darkness, or access recently used colors. The reimagined mockup specifies an HSL color wheel with a saturation/lightness square, a lightness slider, and recent colors history.

## Decision
A new `ColorPicker` module provides HSL color selection with mode-specific UIs.

### HSL color model
All color manipulation uses HSL (Hue, Saturation, Lightness):
- **Hue**: 0-360 degrees (full spectrum)
- **Saturation**: 0-100% (gray to vivid)
- **Lightness**: 0-100% (black to white)

Pure-math conversion functions (no library):
```javascript
function hslToHex(h, s, l) { /* ~20 lines, standard algorithm */ }
function hexToHsl(hex) { /* ~15 lines, inverse */ }
```

### Canvas-rendered picker
The hue ring and SL square are drawn on small `<canvas>` elements:
- **Hue ring**: Drawn via arc segments with incremental hue, not a CSS conic gradient (wider browser support)
- **SL square**: Horizontal saturation gradient overlaid with vertical lightness gradient

### Recent colors
- Stored in `localStorage` as a JSON array of hex strings
- Maximum 8 recent colors
- New colors added to front (most recent first)
- Duplicates removed (re-adds move to front)
- Key: `'recentColors'`

### Mode-specific rendering

**Kids Mode (`#kids-colors`):**
- Rainbow arc of preset color swatches at bottom center
- "Lighter" button (adjusts lightness +15) and "Darker" button (adjusts lightness -15)
- Large touch targets (per ADR-015 kids mode sizing)
- No full HSL wheel — simplified for young users

**Studio Mode (`#color-river`):**
- Full HSL wheel with hue ring and SL square
- Explicit lightness slider below wheel
- Color preview swatch showing current selection
- Eyedropper button (toggles eyedropper tool)
- Preset swatches organized by color families (warm, cool, neutral)
- Recent colors row (8 most recent)
- Pinned favorites with pin toggle

### Integration with existing ColorPalette
- `ColorPalette` gains a new public method: `setCurrentColor(hex)` — updates the active color and UI indicator
- A "+" swatch is added after the 20 preset colors, opening the picker on tap
- Both Kids lighter/darker buttons and Studio HSL picker call `ColorPalette.setCurrentColor(hex)` as the single entry point
- `EventBus.emit('color:changed', { color, source })` fired on any color change

### Rules
- `ColorPalette.setCurrentColor(hex)` is the single entry point for all color changes
- HSL math functions must be pure (no DOM, no side effects)
- Recent colors persist across sessions via `localStorage`
- Picker must be keyboard accessible (Tab through controls, Enter to confirm, Escape to close)

## Consequences
- New file: `js/color-picker.js`
- Modified: `js/color-palette.js` (add `setCurrentColor()`, "+" swatch, recent colors row)
- Modified: `index.html` (color river drawer HTML, kids color arc HTML, script tag)
- Modified: `css/styles.css` (picker popover styles, color river drawer styles)
- Users gain infinite color choice instead of 20 presets
