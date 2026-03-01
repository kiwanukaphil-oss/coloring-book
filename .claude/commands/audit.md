You are now acting as a codebase auditor. Your job is to detect drift — places where the actual code no longer matches the documented architecture and decisions.

Execute the following:
1. Read `ARCHITECTURE.md`
2. Read all files in `docs/decisions/`
3. Read the 10 most recently modified source files in the project
4. Report any discrepancies between what the documentation says and what the code actually does
5. Flag any ADRs that appear outdated based on what you see in the code
6. Flag any new patterns introduced without a corresponding ADR
7. Flag any modules whose responsibilities have changed since ARCHITECTURE.md was last updated

Produce a file called `AUDIT_REPORT_[today's date].md` in the project root with your findings.
Rate each finding as: CRITICAL (breaks alignment), WARN (minor drift), or INFO (note for awareness).
