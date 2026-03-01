# Review Brief

## Session date
2026-02-28

## Summary
Completed all 7 phases of the Codebase Alignment Guide — from initial comprehension audit through to ongoing discipline. The codebase is now fully aligned with canonical patterns documented in 7 ADRs, covered by 51 automated tests, and ready for disciplined ongoing development.

## What was changed

### Phase 1: Comprehension Audit
- Created `ARCHITECTURE.md` — complete codebase map

### Phase 2: Pattern Inventory
- Created `PATTERN_INVENTORY.md` — 7 inconsistencies identified across 7 categories

### Phase 3: Architecture Decision Records
- Created `docs/decisions/ADR-001` through `ADR-007` (error handling, coordinate conversion, visibility toggling, boolean naming, event handler style, folder casing, canvas context reset)

### Phase 4: Consolidation
- `js/canvas-manager.js` — Added `withNativeTransform()` and `getCanvasPixelCoords()` shared utilities; refactored 8 internal save/setTransform/restore blocks
- `js/flood-fill.js` — Removed internal coord conversion; accepts canvas pixel coords directly; 4 save/setTransform/restore → withNativeTransform; renamed booleans
- `js/brush-engine.js` — Removed private `getCanvasCoords()`; uses shared utilities; 2 save/setTransform/restore → withNativeTransform
- `js/undo-manager.js` — 1 save/setTransform/restore → withNativeTransform
- `js/toolbar.js` — Uses `getCanvasPixelCoords()`; renamed `fillPointerDown` → `isFillPointerDown`
- `js/image-loader.js` — `style.display='none'` → `classList.add('hidden')`; `console.error` → `console.warn`
- `js/app.js` — Removed `console.log` success logging
- Git tracking: `Docs/` → `docs/` (lowercase)
- Created `CONSOLIDATION_LOG.md` — audit trail

### Phase 5: Naming and Documentation
- All 10 module files — replaced old-style `/* === ... === */` headers with prescribed `/** ... */` format including Responsible for / NOT responsible for / Key functions / Dependencies / Notes
- Added inline comments to 9 functions >10 lines that lacked them
- Aligned `filledCount` → `filledPixelCount` in flood-fill.js

### Phase 6: Characterisation Tests
- Created 7 test files in `tests/characterisation/` (47 tests total)
- Created `TEST_COVERAGE.md` — coverage map with gaps and recommendations
- Fixed CSS bug: added missing `.reference-panel.hidden` and `.gallery-item.hidden` rules

### Test Infrastructure Fixes
- `scripts/static-server.js` — Added `Access-Control-Allow-Origin: *` header
- `tests/smoke.spec.js` — Fixed `window.CanvasManager` → `CanvasManager` (const declarations don't create window properties); all 4 pre-existing tests now pass

### Phase 7: Ongoing Discipline
- Updated `CLAUDE.md` — embedded Phase 7 discipline rules, listed all completed phases, added ADR summary
- Updated `ARCHITECTURE.md` — reflected all changes from Phases 4-6, updated known issues, updated test suite section

## ADRs applied
- ADR-001: Error handling (`console.error` → `console.warn`, removed success logging)
- ADR-002: Coordinate conversion (3 private implementations → 1 shared `getCanvasPixelCoords`)
- ADR-003: Visibility toggling (`style.display` → `classList.add/remove('hidden')`)
- ADR-004: Boolean naming (`fillPointerDown` → `isFillPointerDown`, `scanLeft` → `isScanningLeft`, `scanRight` → `isScanningRight`)
- ADR-005: Event handler style (verified — already compliant)
- ADR-006: Folder casing (`Docs/` → `docs/` in git tracking)
- ADR-007: Canvas context reset (15 raw save/setTransform/restore blocks → `withNativeTransform()`)

## New decisions made (not yet in an ADR)
None. All patterns are covered by existing ADRs.

## Bugs found and fixed
1. **`window.CanvasManager` always undefined in tests** — `const` at script top level creates global lexical bindings, not `window` properties. All 8 occurrences in smoke tests silently returned `undefined` via optional chaining, causing 2 tests to timeout. Fixed by removing `window.` prefix.
2. **Missing CSS rules for `.hidden` class** — `.reference-panel.hidden` and `.gallery-item.hidden` had no CSS rules, so `classList.add('hidden')` had no visual effect. The reference panel was silently sitting at z-index 5 over the canvas corner. Fixed by adding both CSS rules.

## Test results
51/51 passing (4.5s) — 4 smoke tests + 47 characterisation tests

## Ready for /review
[x] Yes
