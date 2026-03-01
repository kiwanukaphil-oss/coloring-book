Run the following consistency check on everything produced in this session and report results:

1. Does all new code follow the naming rules?
   - Function names express intent, not mechanics
   - Booleans start with is, has, can, or should
   - Arrays and collections are named in the plural
2. Does all new code use the canonical patterns from the ADRs in docs/decisions/?
3. Have any new dependencies been introduced? If yes, are they documented in ARCHITECTURE.md?
4. Have any new environment variables been introduced? If yes, are they documented?
5. Are there any functions longer than 10 lines without an explanatory comment explaining WHY (not what)?
6. Does CONSOLIDATION_LOG.md need updating?
7. Is REVIEW_BRIEF.md complete and ready for /review?

Output: PASS, WARN, or FAIL for each item with a one-line explanation.
If any item is FAIL, list the specific files and line numbers affected.
