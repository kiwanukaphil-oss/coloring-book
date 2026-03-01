# ADR-001: Error Handling

## Status
Accepted

## Context
The codebase handles errors in five different ways depending on the module and situation:

1. Promise rejection with `new Error()` (canvas-manager.js)
2. Silent DOM-level error swallowing — hiding elements or clearing state (image-loader.js)
3. `.catch()` with `console.error()` (image-loader.js)
4. `.catch()` with `console.warn()` (app.js)
5. `.then()` with `console.log()` for success (app.js)

None of these provide any feedback to the user. A child using the app who taps a broken image gets no indication that something went wrong.

## Decision
Errors are classified into two tiers and handled accordingly:

### Tier 1: User-visible failures (the user tried something and it didn't work)
Surface a brief, friendly message to the user. Until a toast/notification system is built (roadmap item 1.6), use `alert()` as a temporary placeholder. Once a `FeedbackManager.showToast(message)` exists, replace all `alert()` calls with it.

```javascript
// Canonical pattern for user-visible failures:
CanvasManager.loadOutlineImage(imageSrc)
    .then(() => {
        UndoManager.saveSnapshot();
    })
    .catch((error) => {
        console.warn('Failed to load coloring page:', error);
        // Replace alert() with FeedbackManager.showToast() when available
        alert('Oops! Could not load that picture.');
    });
```

### Tier 2: Non-critical / infrastructure failures (the user doesn't need to know)
Log with `console.warn()` only. Do not use `console.error()` — reserve `console.error` for truly unexpected exceptions that indicate bugs.

```javascript
// Canonical pattern for non-critical failures:
navigator.serviceWorker
    .register('./service-worker.js')
    .then(() => {
        // No success logging needed in production
    })
    .catch((error) => {
        console.warn('Service worker registration failed:', error);
    });
```

### Tier 3: DOM-level silent handling (expected, recoverable failures)
When an image fails to load in a gallery thumbnail or preview, silently hide/clear the element. This is acceptable because the failure is expected (file might not exist) and recoverable (user can pick something else). No logging needed.

```javascript
// Canonical pattern for expected DOM failures:
img.onerror = () => {
    card.classList.add('hidden');
};
```

### Rules
- Never use `console.error()` for handled errors — use `console.warn()` instead
- Never use `console.log()` for success confirmation in production paths
- All Promise-returning functions must have a `.catch()` at the call site
- User-facing error messages must be friendly and non-technical ("Oops! Could not load that picture." not "Error: ENOENT")

## Consequences
- `image-loader.js:281-282`: change `console.error` to `console.warn` and add a user-facing message
- `app.js:33-34`: remove `console.log('Service worker registered')` success logging
- `app.js:37`: already correct (`console.warn`)
- `canvas-manager.js:115-116, 150-151`: already correct (Promise rejection)
- `image-loader.js:71-72`: change `card.style.display = 'none'` to `card.classList.add('hidden')` (also covered by ADR-003)

## What this replaces
- `console.error()` for handled errors (Pattern C in inventory)
- `console.log()` for success confirmation (Pattern E in inventory)
