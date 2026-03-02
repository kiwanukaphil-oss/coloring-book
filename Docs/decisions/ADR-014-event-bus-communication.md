# ADR-014: Event Bus Communication

## Status
Accepted

## Context
The current modules communicate via direct function calls (e.g., `Toolbar` calls `BrushEngine.setBrushSize()`, `ProgressManager.scheduleAutoSave()` is called from 4 different modules). This creates tight coupling — every caller must know about every callee. As the module count grows from 12 to 18+ with the reimagined UI, direct coupling becomes unsustainable.

## Decision
A lightweight pub/sub `EventBus` module provides decoupled cross-module communication.

### API
```javascript
EventBus.on(eventName, handler)    // Subscribe
EventBus.off(eventName, handler)   // Unsubscribe
EventBus.emit(eventName, data)     // Publish
```

### Implementation
```javascript
const EventBus = (() => {
    const listeners = new Map();
    function on(eventName, handler) {
        if (!listeners.has(eventName)) listeners.set(eventName, new Set());
        listeners.get(eventName).add(handler);
    }
    function off(eventName, handler) {
        const handlers = listeners.get(eventName);
        if (handlers) handlers.delete(handler);
    }
    function emit(eventName, data) {
        const handlers = listeners.get(eventName);
        if (handlers) handlers.forEach((handler) => handler(data));
    }
    return { on, off, emit };
})();
```

### Event naming convention
`noun:verb` pattern in past tense (the event already happened):
```
stroke:complete     — Brush stroke finished
fill:complete       — Flood fill finished
tool:changed        — Active tool switched
color:changed       — Selected color changed
mode:changed        — Kids/Studio mode switched
viewport:zoomed     — Zoom level changed
viewport:panned     — Pan position changed
viewport:reset      — Viewport reset to default
undo:applied        — Undo action executed
redo:applied        — Redo action executed
```

### Coexistence with direct calls
The event bus is adopted **gradually**:
- Existing direct calls remain (do not break working code)
- Modules that already make direct calls **also** emit events as a parallel notification channel
- New code (ModeManager, ViewportManager, ColorPicker) listens to events instead of making direct calls
- Over time, direct calls can be replaced with events where it reduces coupling

### When to use events vs direct calls
- **Events**: For notifications ("something happened") where zero or many listeners may react. Example: `stroke:complete` triggers auto-save, UI updates, analytics.
- **Direct calls**: For request/response patterns ("give me the current color") where a specific return value is needed. Example: `ColorPalette.getCurrentColor()`.

### Rules
- Event names must follow `noun:verb` convention
- Event data must be a plain object (no DOM elements, no functions)
- Handlers must not throw — wrap in try/catch if needed
- Never use events for synchronous request/response patterns

## Consequences
- New file: `js/event-bus.js` (~30 LOC)
- Modified: `js/brush-engine.js` (emit `stroke:complete`)
- Modified: `js/flood-fill.js` (emit `fill:complete`)
- Modified: `js/toolbar.js` (emit `tool:changed`)
- Modified: `js/color-palette.js` (emit `color:changed`)
- Modified: `index.html` (script tag — must load before all other modules)
- Enables decoupled communication for all new Phase 1 modules
