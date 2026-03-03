# ADR-022: Celebration Animations

## Status
Accepted

## Context
The mockup reimagined UI includes confetti/star-burst celebrations for Kids mode. These visual rewards are a key differentiator for children's apps — they provide sensory feedback that makes coloring feel satisfying and fun. The mockup assessment notes that `prefers-reduced-motion` should degrade celebrations to a simple color pulse rather than removing all feedback entirely.

## Decision
A new `CelebrationManager` module handles celebration animations using CSS-only particles (not canvas) to avoid interfering with the drawing surface.

### Trigger events
| Event | Celebration | Mode | Status |
|-------|------------|------|--------|
| First fill on a region (`fill:complete`) | Confetti burst at tap point | Kids only | Implemented |
| Saving artwork (`save:complete`) | Confetti from top | Kids only | Implemented |
| Completing a coloring page | Extended confetti | Kids only | **Deferred to Phase 3** |
| Any of the above | Subtle toast | Studio only | **Deferred to Phase 3** |

> **Note (Phase 2):** The "completing a coloring page" trigger requires a reliable signal for
> when all regions are filled, which depends on the region-tracking logic planned for Phase 3
> (layer system). The Studio toast trigger is also deferred as Studio mode celebrations were
> deprioritised in favour of the radial menu (ADR-023). Both will be revisited when the layer
> system provides fill-coverage data.

### Implementation
Confetti particles are `div` elements appended to a `#celebration-container` overlay (`pointer-events: none`, `z-index: 100`). Each particle receives a random color, position, and animation delay. After the animation completes (~2 seconds), all particles are removed.

### Reduced motion (ADR-013)
When `prefers-reduced-motion: reduce` is active, `CelebrationManager` replaces confetti with a simple screen-edge color pulse (a brief glow on the canvas border). Celebrations are never fully suppressed — reduced motion users still receive visual feedback.

### Performance
- Maximum 30 confetti particles per burst (tested on low-end devices)
- CSS `will-change: transform, opacity` on particles for GPU compositing
- Particles are removed from DOM after animation, not hidden
- On `[data-performance="low"]` devices, confetti count is reduced to 15

### Rules
- Celebrations are Kids-mode only; Studio mode uses toast notifications
- `prefers-reduced-motion` users get a color pulse, not nothing
- Confetti container has `pointer-events: none` — drawing is never blocked
- Particle cleanup is guaranteed via `setTimeout` matching animation duration
- No sound effects in this ADR (sound is a separate Phase 3 concern)

## Consequences
- New: `js/celebration-manager.js` (~80 LOC)
- Modified: `index.html` (add `#celebration-container`)
- Modified: `css/styles.css` (confetti keyframes, pulse animation, particle styles)
- Modified: `js/app.js` (add to initialization sequence)
- Modified: `js/flood-fill.js` (emit celebration event on first fill)
- Modified: `js/toolbar.js` (trigger celebration on save in kids mode)
