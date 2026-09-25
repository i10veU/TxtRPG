---
name: code-review
description: Review a TxtRPG pull request for correctness, regressions, architecture consistency, persistence behavior, offline-first behavior, Worker/fallback parity, and browser-facing regressions. Use when reviewing a pull request or validating a Copilot-generated change.
---

# TxtRPG Code Review

Review the pull request against its Issue requirements and the current repository behavior. Treat review as evidence gathering, not as a request to redesign unrelated code.

## Review order

1. Read the PR description and linked Issue requirements.
2. Inspect the changed files and surrounding code needed to understand behavior.
3. Check for regressions against the Issue acceptance criteria.
4. Check persistence and state transitions when the change touches game state or IndexedDB.
5. Check Worker/fallback parity when both execution paths are relevant.
6. Check offline-first assumptions and avoid introducing unnecessary network dependencies.
7. Check browser UI/input behavior for affected surfaces.
8. Check tests and CI evidence. Do not treat the existence of a test as proof that the behavior is correct.
9. Report only actionable findings supported by the changed code and repository evidence.

## Severity

Prioritize findings that can cause incorrect behavior, data loss, security problems, broken persistence, broken compatibility, or failure of the Issue acceptance criteria. Do not block a PR for stylistic preferences unless repository policy explicitly requires them.

## Review scope

Do not expand the review into unrelated refactors. If a finding requires a broader architectural change than the Issue reasonably covers, describe the risk and return it to planning rather than forcing an opportunistic redesign.

## Follow-up

For actionable findings, prefer a bounded correction through the PR workflow. After fixes, re-check the affected behavior and CI. A passing CI run does not by itself close a review finding.
