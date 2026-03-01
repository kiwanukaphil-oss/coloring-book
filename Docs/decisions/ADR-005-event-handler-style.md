# ADR-005: Event Handler Style

## Status
Accepted

## Context
Event handlers are registered in two different styles:

1. **Named function references** — Used in `brush-engine.js` (`handlePointerDown`, `handlePointerMove`, `handlePointerUp`) and `image-loader.js` (`handleReferencePanelPointerDown`, etc.). These are easier to debug (they appear in stack traces with meaningful names), easier to remove with `removeEventListener`, and encourage reuse.

2. **Inline anonymous arrow functions** — Used throughout `toolbar.js` and `color-palette.js`. Shorter to write, but harder to debug (anonymous in stack traces), impossible to remove with `removeEventListener`, and encourage inline complexity.

## Decision
Use **named function references** for event handlers that contain logic beyond a single function call. Inline anonymous arrows are acceptable only for trivial one-liner delegations.

### Named function (preferred for any non-trivial handler):
```javascript
// CORRECT — named function for multi-step logic:
function handleUndoButtonPress() {
    UndoManager.undoLastAction();
}
document.getElementById('tool-undo').addEventListener('pointerdown', handleUndoButtonPress);
```

### Inline arrow (acceptable for trivial one-liner delegation):
```javascript
// ACCEPTABLE — single function call, no logic:
closeButton.addEventListener('pointerdown', () => {
    hideGallery();
});

// ALSO ACCEPTABLE — direct reference:
closeButton.addEventListener('pointerdown', hideGallery);
```

### Not acceptable:
```javascript
// INCORRECT — multi-step logic in anonymous arrow:
button.addEventListener('pointerdown', () => {
    activeTool = 'fill';
    fillButton.classList.add('active');
    brushButton.classList.remove('active');
    brushSizeControl.classList.add('hidden');
});
```

## Consequences
- No immediate refactoring required. The existing inline arrows in `toolbar.js` work correctly and changing them is low priority.
- All **new** event handlers containing more than a single function call must use named functions.
- When `toolbar.js` is modified for other reasons (e.g., adding eraser tool, redo button), the affected handlers should be extracted into named functions at that time.

## What this replaces
- No existing code is immediately replaced. This ADR establishes the convention for new code and opportunistic cleanup.
