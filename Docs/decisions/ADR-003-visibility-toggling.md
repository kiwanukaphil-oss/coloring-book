# ADR-003: Visibility Toggling

## Status
Accepted

## Context
UI element visibility is toggled in two different ways:

1. **CSS class pattern** (dominant): `element.classList.add('hidden')` / `element.classList.remove('hidden')`, driven by `.hidden { display: none }` in `styles.css:273`. Used consistently in `toolbar.js`, `image-loader.js` for modals, panels, and controls.
2. **Inline style manipulation** (single occurrence): `card.style.display = 'none'` in `image-loader.js:72` for hiding gallery thumbnails when their image fails to load.

The inline style approach breaks the established convention and is harder to override or debug via CSS.

## Decision
All visibility toggling must use the CSS class pattern. Never manipulate `style.display` directly.

```javascript
// CORRECT — use CSS class:
element.classList.add('hidden');     // hide
element.classList.remove('hidden');  // show

// INCORRECT — never do this:
element.style.display = 'none';
element.style.display = '';
```

The `.hidden` class is defined in `styles.css` as:
```css
.hidden {
    display: none;
}
```

For conditional visibility checks, use `classList.contains`:
```javascript
if (element.classList.contains('hidden')) {
    // element is not visible
}
```

## Consequences
- `image-loader.js:72`: change `card.style.display = 'none'` to `card.classList.add('hidden')`

## What this replaces
- Direct `style.display` manipulation (Pattern C in state management inventory)
