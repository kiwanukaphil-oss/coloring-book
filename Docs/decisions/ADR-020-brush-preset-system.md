# ADR-020: Brush Preset System

## Status
Accepted

## Context
`BrushEngine` currently has a single rendering mode: continuous `lineTo()` with round line caps. This produces a clean marker-like stroke. The transformation audit (Phase 2.2) recommends adding texture-based brush presets for sensory richness: crayon, watercolor, pencil, and sparkle.

The existing rendering loop in `handlePointerMove()` iterates through coalesced events and draws line segments. The new preset system replaces line-segment rendering with stamp-based rendering (placing textured marks at each point along the stroke path).

## Decision
Introduce a pluggable brush preset system within `BrushEngine`. Each preset provides a `renderStamp(ctx, x, y, size, color, pressure)` function called at each coalesced event point.

### Preset interface
```javascript
{
    name: string,           // 'marker', 'crayon', 'watercolor', 'pencil', 'sparkle'
    spacing: number,        // Distance between stamps as fraction of brush size (0 = continuous)
    renderStamp(ctx, x, y, size, color, pressure) { /* draws one mark */ }
}
```

### Preset specifications

| Preset | Spacing | Rendering | Pressure |
|--------|---------|-----------|----------|
| **Marker** | 0 (continuous `lineTo`) | Round caps, full opacity | None |
| **Crayon** | 0.3× size | Textured circle with noise dots, alpha 0.6-0.9 | Size ×0.8-1.2 |
| **Watercolor** | 0.5× size | Soft-edge radial gradient, alpha 0.15-0.4 | Opacity varies |
| **Pencil** | 0.15× size | Thin circle, alpha 0.6, sharp edges | Size ×0.5-1.5 |
| **Sparkle** | 0.8× size | 3-5 random small circles, varied hues | Count varies |

### Pressure sensitivity
`event.pressure` from the Pointer Events API is now read (defaults to 0.5 on devices without pressure support). Each preset defines how pressure affects rendering.

### Spacing algorithm
For stamp-based presets (spacing > 0), stamps are placed at regular intervals along the stroke path. The distance between consecutive coalesced event points is measured, and stamps are distributed at `spacing × brushSize` intervals. This prevents gaps in fast strokes and overdraw in slow strokes.

### Marker backward compatibility
The marker preset retains the existing `lineTo()` + round caps rendering path exactly. It is not converted to stamp-based rendering. This preserves all existing test behavior.

### Outline pixel restoration (ADR-008)
The existing `restoreOutlinePixels()` in `BrushEngine` operates on the bounding box of the affected region. For stamp-based presets, the bbox must account for stamp scatter (sparkle particles may land outside the direct stroke path). Each preset can optionally define `extraPadding` for bbox expansion.

### Rules
- The marker preset must produce identical output to the current `lineTo()` rendering
- All presets must work with the bounding-box undo system (ADR-017)
- `BrushEngine.setActivePreset(name)` / `getActivePreset()` are the public API
- Preset selection persists per project via `ProgressManager` (saved alongside tool, color, brush size)
- Keyboard shortcuts: `1`-`5` switch presets (1=marker, 2=crayon, 3=watercolor, 4=pencil, 5=sparkle)
- `globalAlpha` must be reset to 1.0 after each stamp to prevent bleed into outline restoration

## Consequences
- Modified: `js/brush-engine.js` (preset system, stamp rendering loop, pressure reading)
- Modified: `js/toolbar.js` (preset selection UI, keyboard shortcuts 1-5)
- Modified: `js/mode-manager.js` (wire preset buttons for kids/studio modes)
- Modified: `js/progress-manager.js` (save/restore active preset)
- Modified: `index.html` (preset selector in all three UI modes)
- Modified: `css/styles.css` (preset button styles)
- Brush engine grows from ~276 to ~450 LOC
- The marker preset path is untouched — existing characterisation tests verify it still works
