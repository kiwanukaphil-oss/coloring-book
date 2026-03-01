# ADR-006: Folder Casing Convention

## Status
Accepted

## Context
The project has a `Docs/` folder (capital D) containing project documentation (`app_review_worldclass_status.md`, `worldclass_roadmap.md`) and a `docs/decisions/` path used for ADRs. On Windows (case-insensitive filesystem) these resolve to the same physical folder. On Linux/macOS (case-sensitive) they would be two separate directories, causing the ADRs to be invisible on one platform and the documentation on the other.

All other folders in the project use lowercase: `js/`, `css/`, `images/`, `scripts/`, `tests/`.

## Decision
All folder names must use **lowercase**. The canonical path for project documentation is `docs/`.

```
docs/                           — all project documentation
docs/decisions/                 — Architecture Decision Records (ADR-*.md)
docs/app_review_worldclass_status.md
docs/worldclass_roadmap.md
```

This aligns with the existing convention used by every other folder in the project.

## Consequences
- Rename `Docs/` to `docs/` (on case-sensitive systems, this requires `git mv`; on Windows it requires a two-step rename like `Docs` → `docs_temp` → `docs` or `git mv Docs docs`)
- Update any references to `Docs/` in documentation or code
- All future folders must be lowercase

## What this replaces
- Capital-D `Docs/` folder name
