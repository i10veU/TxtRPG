---
name: github-actions-failure-debugging
description: Diagnose and correct a failing GitHub Actions workflow for a TxtRPG pull request after Copilot or a human change. Use when CI fails and the failure is within the current task scope.
---

# GitHub Actions Failure Debugging

Use this skill only for bounded CI failures on an existing TxtRPG branch or pull request.

## Procedure

1. Identify the failing workflow run and job for the current pull request.
2. Prefer the workflow/job failure summary before reading complete logs.
3. Read detailed logs only for the failing step or when the summary is insufficient.
4. Reproduce the failure locally or in the available agent environment when practical.
5. Identify whether the failure is caused by the change, the test/environment, or an unrelated repository/service problem.
6. Make the smallest correction that addresses the verified cause.
7. Re-run the focused test first, then the affected workflow or broader regression suite as appropriate.
8. Report unresolved external failures instead of changing production code to mask them.

## TxtRPG checks

For browser-facing changes, preserve the repository's Playwright smoke coverage. For engine changes, preserve deterministic behavior, IndexedDB persistence, Worker/fallback parity, and offline-first behavior where applicable.

Do not weaken assertions, disable workflows, skip tests, or alter CI policy solely to make a failing run pass unless the Issue explicitly requires a justified CI-policy change.

## GitHub integration

When GitHub provides a `Fix with Copilot` action for a failing Actions run, it may be used as a correction entry point. Keep the correction bounded to the verified failure and inspect the resulting diff and CI result before considering the task complete.

Use GitHub MCP workflow-log summarization when available to reduce unnecessary context consumption, then retrieve full logs only when required.
