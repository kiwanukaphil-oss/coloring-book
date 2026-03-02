# ADR-023: Studio Radial Menu

## Status
Accepted

## Context
The mockup reimagined UI shows a radial tool menu that opens from the Studio mode floating dock. This provides quick, gesture-friendly access to all tools without requiring a traditional toolbar. The current Studio dock exists as a placeholder with basic tool buttons in a horizontal row.

The mockup assessment notes that the radial menu needs a keyboard interaction model for accessibility (ADR-013).

## Decision
A new `RadialMenu` module implements a semicircular tool menu that opens above the Studio dock trigger button.

### Interaction
1. **Open**: Click or long-press the dock menu button → radial menu appears with staggered pop-in animation
2. **Select**: Click/tap a radial item → fires the tool action, menu closes
3. **Close**: Click outside the menu, press Escape, or select an item
4. **Keyboard**: Tab focuses the menu, arrow keys rotate through items, Enter selects, Escape closes

### Layout
Items are positioned in a semicircle (180° arc) above the anchor point using CSS `transform`. Each item is offset by `RADIUS` pixels from center at evenly spaced angles.

```
        [Clear]
      /         \
   [Eraser]   [Eyedropper]
    |              |
  [Brush]     [Fill]
       \     /
        [⊕]  ← dock trigger
```

### Menu items
| Item | Action | Icon |
|------|--------|------|
| Fill | `Toolbar.setActiveTool('fill')` | Bucket icon |
| Brush | `Toolbar.setActiveTool('brush')` | Brush icon |
| Eraser | `Toolbar.setActiveTool('eraser')` | Eraser icon |
| Eyedropper | `Toolbar.setActiveTool('eyedropper')` | Dropper icon |
| Clear | Opens clear confirmation (ADR-003) | Trash icon |

### Animation
- **Open**: Items pop in with staggered 40ms delay, using `var(--ease-spring)` timing
- **Close**: All items fade out simultaneously (no stagger)
- **`prefers-reduced-motion`**: Items appear/disappear instantly without animation

### Keyboard navigation (ADR-013)
- When the menu opens, focus moves to the first item
- Left/Right arrow keys cycle through items in the semicircle order
- Home/End jump to first/last item
- Enter/Space activates the focused item
- Escape closes the menu and returns focus to the dock trigger
- Each item has `role="menuitem"`, the container has `role="menu"`

### Rules
- Radial menu is Studio-mode only
- Menu must be fully keyboard-navigable (ADR-013)
- Each menu item delegates to existing `Toolbar` methods — no duplicate logic
- The menu container has `pointer-events: none` when closed to prevent event interception
- Staggered animation respects `prefers-reduced-motion`
- Focus trap: Tab within the open menu cycles through items only (ADR-013)

## Consequences
- New: `js/radial-menu.js` (~120 LOC)
- Modified: `index.html` (radial menu container, dock trigger button)
- Modified: `css/styles.css` (radial positioning, pop-in animation, focus ring)
- Modified: `js/app.js` (add to initialization sequence)
- Modified: `js/mode-manager.js` (wire dock trigger to RadialMenu)
- The radial menu is the primary tool-selection interface in Studio mode
- Classic toolbar and Kids tool bubbles are unaffected
