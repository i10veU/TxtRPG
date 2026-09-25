---
name: copilot-issue-association
description: Prepare and validate GitHub Issues for assignment to Copilot coding agents, including selecting the appropriate custom agent, preserving task context, and verifying the resulting agent session or pull request. Use when creating, assigning, reassigning, or troubleshooting Issue-to-Copilot work in TxtRPG.
---

# Copilot Issue Association

Use this skill for the repository's Issue → Copilot coding-agent workflow.

## Core rule

Use GitHub's supported Issue assignment flow. Do not invent or depend on undocumented REST payloads, bot usernames, or `agent_assignment` request bodies.

The supported cloud-agent flow is:

1. Create or open a GitHub Issue with a concrete task specification.
2. Ensure the Issue contains goal, scope, constraints, acceptance criteria, and verification requirements.
3. Open the Issue's **Assignees** control.
4. Select **Copilot**.
5. In the assignment dialog, choose the target repository/base branch and, when available, the appropriate custom agent.
6. Add task-specific instructions only when they are not already expressed by the Issue or repository instructions.
7. Start the Copilot task.
8. Verify that Copilot created a working branch/session and subsequently a pull request.
9. Validate the PR with repository CI and required review gates.

## Agent selection

Choose the smallest specialized agent that fully covers the task.

- `txtrpg-director`: task decomposition, planning, and routing; do not use it as a default implementation agent.
- `txtrpg-lore`: world, lore, narrative data, systemic content, and consistency work.
- `txtrpg-engine`: game state, simulation, persistence, workers, deterministic logic, and engine behavior.
- `txtrpg-ui`: browser UI, interaction, accessibility, rendering, and input behavior.
- `txtrpg-qa`: verification, regression analysis, browser smoke tests, and release-readiness checks.

If a task crosses domains, prefer one primary implementation agent and explicitly state the secondary verification responsibilities in the Issue. Do not create multiple competing implementation sessions for the same files unless the work is intentionally isolated.

## Issue contract

Before association, confirm the Issue has:

```markdown
## Goal

## Scope

## Constraints

## Acceptance criteria

## Verification
```

The Issue is the task contract. Avoid putting critical requirements only in a chat message or transient assignment field.

## Repository context

The assigned agent must respect, in order:

1. `.github/copilot-instructions.md`
2. `AGENTS.md` and other repository instructions applicable to the changed paths
3. the selected custom agent profile
4. relevant Agent Skills
5. the Issue-specific requirements

When these conflict, do not silently choose a convenient interpretation. Resolve the conflict using repository policy and the narrowest safe change.

## Skills and instructions

Use repository-wide instructions for rules that apply to nearly every task. Use Agent Skills for specialized procedures that should be loaded only when relevant. Do not duplicate the entire repository policy inside every Issue or agent profile.

For a known skill, it may be explicitly requested with `/skill-name` where the invoking surface supports slash-command skill invocation. Otherwise rely on the skill description and agent selection to make it available when relevant.

## Association validation

After assignment, verify the actual GitHub state rather than assuming the assignment succeeded.

Check for:

- Copilot appearing as the Issue assignee/session owner.
- The selected custom agent, when the GitHub UI/API surface exposes it.
- A working branch or agent session associated with the Issue.
- A PR generated from the task.
- CI checks on the resulting PR.

Do not claim that an Issue is associated merely because an Issue was created.

## Failure handling

### Copilot is not available in Assignees

Report the blocking condition and check the repository/account Copilot eligibility and organization/repository policies. Do not emulate the assignment with an undocumented API request.

### Custom agent is not listed

Check that the profile exists under `.github/agents/`, has valid frontmatter, is available to the relevant Copilot surface, and that the repository branch contains the profile. Do not assume a custom agent name alone is sufficient to create an assignment.

### Assignment appears successful but no work starts

Inspect the Issue and repository state first. Distinguish Copilot service/permission/configuration problems from repository build or task problems. Do not repeatedly reassign the same Issue without identifying the cause.

### Agent creates a PR but verification fails

Treat the failed verification as authoritative. Route the failure back to the same Issue/PR with the concrete failure output and request a bounded correction. Never reinterpret a failed check as success.

## Automation boundary

GitHub officially documents Issue assignment to Copilot through the GitHub UI and its assignment dialog. Repository automation may create and prepare Issues, but this skill must not rely on an undocumented REST request such as assigning `copilot-swe-agent[bot]` with an `agent_assignment` payload.

If a future GitHub-supported API exposes first-class Copilot assignment, update this skill only after verifying the behavior against current GitHub documentation.

## TxtRPG quality gate

Association is successful only when the resulting development task can be verified. The agent should inspect the current repository before editing and run the applicable syntax, focused regression, full regression, and browser verification required by the repository. Preserve offline-first behavior, IndexedDB compatibility, and Worker/fallback parity where relevant.
