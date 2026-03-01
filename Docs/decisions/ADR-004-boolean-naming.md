# ADR-004: Boolean Naming Convention

## Status
Accepted

## Context
The codebase alignment guide requires that all boolean variables start with `is`, `has`, `can`, or `should`. Most booleans in the codebase already follow this convention:

- `isDrawing` in `brush-engine.js:10` — correct
- `isDraggingReferencePanel` in `image-loader.js:22` — correct
- `isResizingReferencePanel` in `image-loader.js:23` — correct

However, three booleans deviate:

- `fillPointerDown` in `toolbar.js:117` — should be `isFillPointerDown`
- `scanLeft` in `flood-fill.js:125` — should be `isScanningLeft`
- `scanRight` in `flood-fill.js:126` — should be `isScanningRight`

## Decision
All boolean variables and properties must start with one of: `is`, `has`, `can`, or `should`. Choose the prefix that best describes the semantic meaning:

- `is` — current state or condition (`isDrawing`, `isVisible`, `isFillPointerDown`)
- `has` — possession or existence (`hasUndoSteps`, `hasChanges`)
- `can` — capability or permission (`canUndo`, `canRedo`)
- `should` — recommendation or configuration (`shouldAutoSave`, `shouldAnimate`)

```javascript
// CORRECT:
let isDrawing = false;
let isFillPointerDown = false;
let isScanningLeft = false;
let hasUndoSteps = true;

// INCORRECT:
let drawing = false;
let fillPointerDown = false;
let scanLeft = false;
```

Boolean-returning functions should also follow this convention when practical:
```javascript
function hasUndoSteps() { return snapshotStack.length > 0; }  // correct
function isOutlinePixel(outlinePixels, index) { ... }          // correct
```

## Consequences
- `toolbar.js:117`: rename `fillPointerDown` to `isFillPointerDown` (also update references on lines 124, 130, 131, 134)
- `flood-fill.js:125`: rename `scanLeft` to `isScanningLeft` (also update references on lines 160, 163)
- `flood-fill.js:126`: rename `scanRight` to `isScanningRight` (also update references on lines 177, 180)

## What this replaces
- Unprefixed boolean variable names (`fillPointerDown`, `scanLeft`, `scanRight`)
