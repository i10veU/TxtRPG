---
name: TxtRPG Task Creator
on:
  workflow_dispatch:
    inputs:
      task:
        description: "Optional task. Leave blank to have the workflow find one small, concrete task."
        required: false
        type: string
        default: ""

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

network: defaults

tools:
  github:
    toolsets: [default]

safe-outputs:
  create-issue:
    max: 1
    title-prefix: "[TxtRPG Task] "
    labels: [agent-task]
    assignees: [copilot]
    deduplicate-by-title: 1

max-ai-credits: 75
---

# TxtRPG Task Creator

Create exactly one GitHub Issue for a human-reviewed coding task, then stop.

This workflow is a task dispatcher, not an autonomous development loop.

## Task selection

If the workflow input `task` is non-empty, use it as the requested task.

If `task` is empty:

1. Inspect `AGENTS.md`, `PROJECT_STATE.md`, the relevant implementation and tests, recent commits, open issues, and open pull requests.
2. Find exactly one small, concrete, verifiable task that is useful to the current repository.
3. Prefer a bug, regression, test gap, compatibility problem, or narrowly scoped improvement.
4. Do not invent a large milestone or continue a numbered Phase roadmap.
5. Do not select work already represented by an open issue or pull request.

## Issue requirements

Create exactly one issue containing:

- a concise title;
- the problem or requested change;
- relevant files/systems to inspect;
- explicit acceptance criteria;
- required verification;
- constraints and compatibility considerations.

The issue is assigned directly to GitHub Copilot coding agent. The agent should receive enough context to implement the task without another planning phase.

## Implementation guidance for Copilot

Tell the assigned coding agent to:

1. inspect the current repository before editing;
2. make the smallest safe change using existing architecture;
3. follow `AGENTS.md` and the repository's Ponytail/YAGNI principles;
4. preserve offline-first Edge/Chromium operation, IndexedDB compatibility, and Worker/fallback parity where applicable;
5. add or update focused tests for changed behavior;
6. run appropriate syntax, regression, and browser verification;
7. create a pull request when the implementation is ready;
8. never merge the pull request.

## Human review boundary

The workflow must not modify source code, create branches, create pull requests, merge changes, dispatch another workflow, or assign another agent itself.

Its only write operation is the creation of one issue assigned to Copilot.

The human workflow after this run is:

`Run workflow → review Issue/PR → request changes or merge`

If no useful task can be identified, do not create a speculative task. Use the workflow's no-op output and explain why.
