# ADR-015: Dual-Mode UI (Kids + Studio)

## Status
Accepted

## Context
The reimagined mockup defines two distinct UI paradigms for the app:
- **Kids Mode**: Large emoji tool bubbles, rainbow color arc, confetti celebrations, simplified controls designed for children aged 3-12.
- **Studio Mode**: Professional floating dock with radial menu, glassmorphism panels, edge-triggered drawers, HSL color wheel, and layer system designed for older children and casual creators.

Both modes share the same canvas system and drawing engine. The difference is purely in UI presentation and interaction patterns.

## Decision
A `data-mode` attribute on `<html>` drives CSS selectors that show/hide mode-specific UI elements. A `ModeManager` module manages the mode state.

### Mode switching mechanism
```html
<html lang="en" data-mode="kids" data-hand="right" data-theme="light">
```

CSS selectors:
```css
/* Hide studio elements in kids mode */
[data-mode="kids"] .studio-only { display: none !important; }

/* Hide kids elements in studio mode */
[data-mode="studio"] .kids-only { display: none !important; }

/* Hide classic toolbar/palette in both new modes */
[data-mode="kids"] #toolbar,
[data-mode="kids"] #color-palette,
[data-mode="studio"] #toolbar,
[data-mode="studio"] #color-palette { display: none !important; }
```

### ModeManager module
```javascript
const ModeManager = (() => {
    function initialize() { /* read localStorage, apply attributes, wire toggles */ }
    function switchMode(mode) { /* set data-mode, persist, emit mode:changed */ }
    function switchHand(hand) { /* set data-hand, persist */ }
    function switchTheme(theme) { /* set data-theme, persist */ }
    function getCurrentMode() { /* returns 'kids' or 'studio' */ }
    function getCurrentHand() { /* returns 'left' or 'right' */ }
    function getCurrentTheme() { /* returns 'light' or 'dark' */ }
    return { initialize, switchMode, switchHand, switchTheme, getCurrentMode, getCurrentHand, getCurrentTheme };
})();
```

### Persistence
- Mode, handedness, and theme are persisted to `localStorage`
- Keys: `'app-mode'`, `'app-hand'`, `'app-theme'`
- Default: `kids` mode, `right` hand, `light` theme (or system theme preference)

### Handedness
Kids mode tools are positioned on the left edge by default. For left-handed children, `data-hand="left"` mirrors them to the right edge:
```css
[data-hand="left"] #kids-tools {
    left: auto;
    right: 16px;
}
```

### Shared canvas and drawing engine
Both modes use the exact same:
- 5-layer canvas system (CanvasManager)
- Flood fill algorithm (FloodFill)
- Brush engine (BrushEngine)
- Undo system (UndoManager/CommandManager)
- Storage and auto-save (StorageManager/ProgressManager)

Mode-specific UI buttons delegate to the same underlying module APIs:
```javascript
// Kids tool bubble delegates to existing Toolbar API
kidsToolBrush.addEventListener('pointerdown', () => {
    Toolbar.setActiveTool('brush');
});
```

### Test compatibility
The classic toolbar (`#toolbar`) and color palette (`#color-palette`) remain in the DOM but are hidden via CSS in both Kids and Studio modes. Existing Playwright tests that interact with `#tool-fill`, `#tool-brush`, etc. continue to work because:
1. The elements exist in the DOM (just hidden)
2. Tests can remove the `data-mode` attribute to show classic UI:
   ```javascript
   await page.evaluate(() => document.documentElement.removeAttribute('data-mode'));
   ```

### Kids Mode UI elements
- `#kids-tools` — Tool bubbles on left edge (5 emoji buttons, 64px)
- `#kids-colors` — Rainbow color arc at bottom center
- `#kids-undo-bar` — Undo/redo at top right
- `#kids-size-bubbles` — Brush size (small/medium/large) at bottom left
- `#kids-gallery-btn` — Gallery button with completion ring at top left

### Studio Mode UI elements
- `#dock` — Floating dock at bottom center (tools + color preview + brush size)
- `#radial-menu` — Radial tool menu (opens above dock)
- `#undo-redo` — Undo/redo with depth dots at top right
- `#zoom-pill` — Zoom controls at bottom left
- `#color-river` — Color picker drawer (right edge, 300px)
- `#layer-drawer` — Layer drawer (left edge, 320px, placeholder for Phase 2)
- `.edge-trigger` — Invisible 24px zones on left/right edges to open drawers

### Rules
- Mode-specific elements must have `.kids-only` or `.studio-only` class (or be inside a mode-specific container)
- Both modes must provide access to all core drawing functions (fill, brush, eraser, undo, redo, save, gallery)
- Mode switch must not lose canvas state or undo history
- New UI buttons must delegate to existing module APIs, not duplicate logic

## Consequences
- New file: `js/mode-manager.js`
- Modified: `index.html` (dual-mode UI elements, mode switch toggle, data attributes)
- Modified: `css/styles.css` (mode-switching selectors, kids styles, studio styles)
- Modified: `js/app.js` (ModeManager.initialize() in boot sequence)
- Classic toolbar and palette preserved for backward compatibility
- All new UI modules (ViewportManager, ColorPicker) must be mode-aware
