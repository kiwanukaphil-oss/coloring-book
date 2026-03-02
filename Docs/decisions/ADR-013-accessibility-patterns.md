# ADR-013: Accessibility Patterns

## Status
Accepted

## Context
The current app has no ARIA attributes, no keyboard navigation, no focus management, and no reduced-motion support. This excludes users who rely on screen readers, keyboard navigation, or motion-sensitive settings. The reimagined mockup specifies comprehensive accessibility support targeting WCAG 2.1 AA compliance.

## Decision
All interactive elements must follow these accessibility patterns.

### ARIA roles and attributes
```html
<!-- Toolbars -->
<div role="toolbar" aria-label="Drawing tools">
    <button aria-pressed="true" aria-label="Fill tool">Fill</button>
</div>

<!-- Modals -->
<div role="dialog" aria-modal="true" aria-label="Image Gallery">

<!-- Alert dialogs (destructive confirmations) -->
<div role="alertdialog" aria-modal="true" aria-label="Confirm clear">

<!-- Toast notifications -->
<div role="alert" aria-live="assertive">

<!-- Color swatches (radio group pattern) -->
<div role="radiogroup" aria-label="Color palette">
    <button role="radio" aria-checked="true" aria-label="Red" tabindex="0">
</div>
```

### Keyboard navigation

**Tool buttons**: `aria-pressed` toggled by `Toolbar.setActiveTool()`. Tab moves between tools.

**Color swatches**: Arrow keys (Up/Down/Left/Right) move focus between swatches. Enter/Space selects. Uses roving tabindex pattern (active swatch has `tabindex="0"`, others have `tabindex="-1"`).

**Modals**: Focus trapped inside open modals. Tab/Shift+Tab cycles through focusable elements. Escape closes the modal. Focus returns to the trigger element on close.

### Focus indicators
```css
:focus-visible {
    outline: 3px solid var(--color-primary);
    outline-offset: 3px;
}
```
Only visible on keyboard focus (not mouse/touch clicks), using `:focus-visible` pseudo-class.

### Screen reader utilities
```css
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
}
```

### Reduced motion
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
```
This respects the user's OS-level motion preference. State changes (color, visibility) still work; only movement animations are suppressed.

### Rules
- All buttons must have either visible text or `aria-label`
- All modals must have `role="dialog"` and `aria-modal="true"`
- All toggle buttons must update `aria-pressed` on state change
- Color selections must be announced (via `aria-live` region or `aria-label` update)
- Focus must never be trapped outside a modal while one is open
- Keyboard users must be able to reach every interactive element

## Consequences
- Modified: `index.html` (ARIA attributes on all interactive elements)
- Modified: `css/styles.css` (`:focus-visible`, `.sr-only`, `@media prefers-reduced-motion`)
- Modified: `js/toolbar.js` (`aria-pressed` in `setActiveTool()`)
- Modified: `js/color-palette.js` (keyboard navigation, ARIA roles on swatches)
- Modified: `js/image-loader.js` (focus trap in gallery modal, Escape key)
- All new UI elements (Kids mode, Studio mode) must include ARIA from the start
