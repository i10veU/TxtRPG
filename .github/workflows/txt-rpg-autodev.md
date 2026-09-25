---
name: TxtRPG Autonomous Development
on:
  workflow_dispatch:
  repository_dispatch:
    types: [txt-rpg-autodev-run]

permissions:
  contents: read
  issues: read
  pull-requests: read
  actions: read
  copilot-requests: write

engine:
  id: copilot
  version: "1.0.87"
  model: gpt-5.6
  copilot-sdk: true

imports:
  - .github/agents/director.agent.md

network: defaults

tools:
  github:
    toolsets: [default]

safe-outputs:
  github-token: ${{ secrets.GITHUB_TOKEN }}
  create-pull-request:
    max: 1
    title-prefix: "[TxtRPG AutoDev] "
    draft: true
  add-comment:
    max: 1

max-ai-credits: 150
---

# TxtRPG Autonomous Development

Run exactly one bounded autonomous development task for `i10veU/TxtRPG`.

The goal is a reliable one-shot automation tool, not an endlessly self-triggering development loop.

## Run contract

1. Inspect `AGENTS.md`, `PROJECT_STATE.md`, the relevant code/tests, recent commits, open issues, and open pull requests.
2. Select exactly one small, verifiable task. Prefer a concrete bug, regression, test gap, or small feature over broad refactoring.
3. Check for duplicate open work before editing.
4. Define acceptance criteria internally.
5. Implement the smallest safe change using existing project structure.
6. Run focused tests first, then applicable regression/static/browser checks.
7. If verification fails, diagnose and repair within the same run. Do not weaken tests to obtain a pass.
8. Stop after one task. Do not invent or start another task in the same run.
9. When verification passes, request exactly one draft PR containing only the task's changes and a concise verification report.
10. If verification cannot be completed because of an external environment limitation, keep the PR draft and report the exact limitation rather than claiming success.

## Project constraints

- Preserve the existing offline-first Edge/Chromium runtime.
- Do not introduce servers, APIs, CDNs, or new dependencies unless the repository explicitly requires them.
- Preserve Worker/fallback parity and persistence compatibility.
- Preserve existing commands and behavior unless the selected task explicitly changes them.
- Keep world content data-driven.
- Use YAGNI: reuse existing code before adding abstractions, files, or infrastructure.
- Never modify workflow/security configuration as part of the selected product task.
- Never force-push, rewrite history, delete persistent game data, or merge a PR.

## Agent use

Use a specialist only when the selected task genuinely benefits from it. One focused specialist is normally enough. For behavioral changes, use `txtrpg-qa` for verification when available.

Do not create artificial multi-agent orchestration for simple tasks.

## Escalation

Stop and report when there is a material blocker such as a security issue, data-loss risk, unresolved regression, missing credentials, or a genuinely unresolved product decision.

Do not escalate for ordinary test failures that can be repaired within scope.

## Editing reliability

The repository previously encountered a Responses API edit-tool ID mismatch (`ctc_call_*` vs `fc_*`). If repository editing through a built-in edit tool fails with that error, use a deterministic shell/Python/Node replacement instead and inspect the diff immediately.

## Completion

The unit of work is:

inspect → select one task → implement → verify → draft PR

There is intentionally no automatic merge and no automatic next-cycle dispatch.

## Current project direction

The game runtime already contains NPC schedules/goals, organization decisions, regional economy, event causality, player goal discovery, persistence normalization, Worker/fallback parity, finale persistence, and long-play browser coverage.

Do not expand these systems merely to create more phases. Only make a change when it closes a concrete, verifiable gap.
