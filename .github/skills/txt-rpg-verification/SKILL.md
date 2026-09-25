---
name: txt-rpg-verification
description: Verifies changed TxtRPG behavior with focused regression, syntax, browser, persistence, and Worker/fallback checks.
---

# TxtRPG Verification

Use the repository's existing tests and CI commands; do not invent a new test runner.

## Sequence
1. Inspect changed files and identify behavior contracts.
2. Run the smallest focused regression.
3. Run JavaScript syntax/static checks for affected files.
4. Run the relevant full non-browser regression suite.
5. Run browser smoke/Playwright coverage when available.
6. For state changes, verify IndexedDB save/load and migration/fallback behavior.
7. For Worker changes, compare Worker and fallback outcomes.
8. Check `git diff --check`.

## Rules
- A passing unit test does not replace runtime verification when the browser path is affected.
- A failed environment dependency is not a product pass; record the limitation.
- Never remove or weaken a regression assertion only to obtain green CI.
- Prefer deterministic scenarios and explicit invariants for simulation changes.
- Report exact commands and results in the completion report.