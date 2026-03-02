# ADR-010: CSS Design Tokens

## Status
Accepted

## Context
The current `styles.css` has hardcoded hex colors, pixel sizes, border radii, and shadows throughout its 676 lines. This makes theme changes (e.g., dark mode) impossible without duplicating every rule. The reimagined mockup introduces a comprehensive design system with specific values for colors, typography, spacing, animations, and glassmorphism effects.

## Decision
All visual values are extracted to CSS custom properties on `:root`. No new CSS may use hardcoded hex, px, or timing values — it must reference tokens.

### Token naming convention
```
--color-*       Colors (brand, surface, semantic, text)
--size-*        Fixed dimensions (toolbar height, touch targets, swatch size)
--radius-*      Border radii (sm, md, lg, round, pill)
--shadow-*      Box shadows (modal, panel, swatch, toast, float)
--font-*        Font families and weights
--ease-*        Timing functions (spring, standard)
--t-*           Transition durations (fast, normal, slow)
--glass-*       Glassmorphism properties (background, blur)
```

### Dark mode
Dark mode overrides are applied via `[data-theme="dark"]` selector on `<html>`:
```css
[data-theme="dark"] {
    --color-surface: #1a1a2e;
    --color-canvas: #ffffff;  /* Canvas always stays white */
    --color-toolbar: #0f3460;
    /* ... */
}
```

The `data-theme` attribute is managed by `ModeManager` (ADR-015).

### Mode-specific tokens
Mode-specific overrides use `[data-mode="kids"]` and `[data-mode="studio"]` selectors:
```css
[data-mode="kids"] {
    --size-touch-target: 64px;
}
[data-mode="studio"] {
    --size-touch-target: 44px;
}
```

### Key tokens from mockup
```css
:root {
    --color-primary: #FF6F00;
    --color-surface: #FFF9C4;
    --color-canvas: #ffffff;
    --font-primary: 'Nunito', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    --glass-bg: rgba(255, 255, 255, 0.82);
    --glass-blur: 16px;
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --shadow-float: 0 8px 32px rgba(0, 0, 0, 0.10);
}
```

### Rules
- All new CSS must use token references, never hardcoded values
- Existing CSS is migrated to tokens in Step 1 (mechanical find-and-replace)
- Canvas background (`--color-canvas`) is always `#ffffff` regardless of theme
- Typography switches to Nunito (loaded via Google Fonts `<link>` tag)

## Consequences
- Modified: `css/styles.css` (add `:root` block, replace all hardcoded values)
- Modified: `index.html` (add Nunito font link, add `data-theme` attribute to `<html>`)
- All subsequent CSS additions must use tokens
- Dark mode structure exists from day one (actual dark values populated in Phase 2)
