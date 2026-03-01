---
description: Apply whenever writing new code or modifying existing code in this project
---

## Before writing any code

1. Check `docs/decisions/` for an ADR covering the pattern you are about to use
2. If an ADR exists, follow it exactly — do not introduce a variation
3. If no ADR exists and you are introducing a new pattern, stop and write the ADR first before writing the code
4. Never introduce a second way to solve a problem that already has an ADR

## After writing any code

1. Confirm the code matches the relevant ADR
2. Record the ADR numbers applied in `REVIEW_BRIEF.md`
3. If you made a decision not covered by any ADR, document it as an inline comment in the code AND flag it in `REVIEW_BRIEF.md` for a new ADR to be written
