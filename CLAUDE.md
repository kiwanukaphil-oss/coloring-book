# Project Alignment Instructions

## Before doing anything in this project
1. Read `ARCHITECTURE.md`
2. Read all ADRs in `docs/decisions/`
3. Check whether a similar function or pattern already exists before writing new code
4. If a new pattern is needed, write the ADR first — then implement

## Completed Phases
- Phase 1: Comprehension Audit — `ARCHITECTURE.md`
- Phase 2: Pattern Inventory — `PATTERN_INVENTORY.md`
- Phase 3: Architecture Decision Records — `docs/decisions/ADR-001` through `ADR-007`
- Phase 4: Consolidation — `CONSOLIDATION_LOG.md`
- Phase 5: Naming and Documentation — all module headers updated to prescribed format
- Phase 6: Characterisation Tests — `tests/characterisation/`, `TEST_COVERAGE.md`
- Phase 7: Ongoing Discipline — rules below

## Current Phase
Phase 7: Ongoing Discipline (all alignment phases complete)

## Ongoing Discipline Rules
1. **Read before writing.** Start every session by reading `ARCHITECTURE.md` and all ADRs.
2. **No duplicate functions.** Before writing a new function, check whether a similar one already exists.
3. **ADR before pattern.** Before introducing a new pattern, check whether an ADR covers it. If not, write the ADR first.
4. **Verify after every change.** After completing any feature or fix, run `npx playwright test` to verify no regressions.
5. **Document decisions.** Never leave a session with undocumented decisions.
6. **Use canonical patterns.** All code must follow the ADRs:
   - ADR-001: Error handling (console.warn for infrastructure, no console.error for handled errors)
   - ADR-002: Coordinate conversion via `CanvasManager.getCanvasPixelCoords(event)`
   - ADR-003: Visibility toggling via `classList.add/remove('hidden')`
   - ADR-004: Booleans prefixed with `is/has/can/should`
   - ADR-005: Named functions for multi-step handlers; inline arrows for trivial one-liners
   - ADR-006: All folders lowercase
   - ADR-007: Canvas context reset via `CanvasManager.withNativeTransform(ctx, callback)`

## Output Protocol
When completing any task:
1. Produce `REVIEW_BRIEF.md` summarising what changed, which ADRs were applied, and any decisions not covered by existing ADRs
2. Do not consider the task done until confirmed

## Role Awareness
You are acting as: BUILDER
Your output will be reviewed before any changes are accepted.
Use /review to trigger a review of your output.
Use /audit for a weekly drift check.
Use /check for an end-of-task consistency check.
