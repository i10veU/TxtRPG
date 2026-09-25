---
name: copilot-issue-association
description: Associate an already-created GitHub Issue with a Copilot coding agent, including selecting the appropriate custom agent, preserving task context, and verifying the resulting agent session or pull request. Use when an existing TxtRPG Issue is ready for Copilot execution.
---

# Copilot Issue Association

Use this skill only for the **Issue → Copilot coding-agent association** step.

## Core rule

The Issue is created and specified by the separate **TxtRPG Issue Creation** workflow/chat. This skill must not create, modify, or duplicate Issues unless a later GitHub-supported feature explicitly requires a minimal association-side update.

Use GitHub's supported Issue assignment flow. Do not invent or depend on undocumented REST payloads, bot usernames, or `agent_assignment` request bodies.

The supported cloud-agent flow is:

1. Receive an existing GitHub Issue created by the TxtRPG Issue Creation workflow/chat.
2. Read the Issue and verify that it contains a concrete task contract: goal, scope, constraints, acceptance criteria, and verification requirements.
3. Determine the smallest specialized TxtRPG custom agent that fully covers the task.
4. Open the Issue's **Assignees** control.
5. Select **Copilot**.
6. In the assignment dialog, choose the target repository/base branch and, when available, the appropriate custom agent.
7. Add task-specific instructions only when they are not already expressed by the Issue or repository instructions.
8. Start the Copilot task.
9. Verify that Copilot created a working branch/session and subsequently a pull request.
10. Validate the resulting PR with repository CI and required review gates.

Do not create a second Issue merely because association has not yet started.

## Agent selection

Choose the smallest specialized agent that fully covers the task.

- `txtrpg-director`: task decomposition, planning, and routing; do not use it as a default implementation agent.
- `txtrpg-lore`: world, lore, narrative data, systemic content, and consistency work.
- `txtrpg-engine`: game state, simulation, persistence, workers, deterministic logic, and engine behavior.
- `txtrpg-ui`: browser UI, interaction, accessibility, rendering, and input behavior.
- `txtrpg-qa`: verification, regression analysis, browser smoke tests, and release-readiness checks.

If a task crosses domains, prefer one primary implementation agent and explicitly state the secondary verification responsibilities already defined by the Issue. Do not create multiple competing implementation sessions for the same files unless the work is intentionally isolated.

## Issue contract

The association step expects the existing Issue to contain:

```markdown
## Goal

## Scope

## Constraints

## Acceptance criteria

## Verification
```

The Issue is the task contract. Do not move critical requirements into a transient assignment message merely to compensate for an incomplete Issue. If the contract is materially incomplete, return the Issue to the Issue Creation workflow rather than inventing requirements here.

## Repository context

The assigned agent must respect, in order:

1. `.github/copilot-instructions.md`
2. `AGENTS.md` and other repository instructions applicable to the changed paths
3. the selected custom agent profile
4. relevant Agent Skills
5. the Issue-specific requirements

When these conflict, do not silently choose a convenient interpretation. Resolve the conflict using repository policy and the narrowest safe change.

## Association validation

After assignment, verify the actual GitHub state rather than assuming the assignment succeeded.

Check for:

- Copilot appearing as the Issue assignee/session owner.
- The selected custom agent, when the GitHub UI/API surface exposes it.
- A working branch or agent session associated with the Issue.
- A PR generated from the task.
- CI checks on the resulting PR.

Do not claim that an Issue is associated merely because the Issue exists or because an assignment request was attempted.

## Failure handling

### Copilot is not available in Assignees

Report the blocking condition and check the repository/account Copilot eligibility and organization/repository policies. Do not emulate the assignment with an undocumented API request.

### Custom agent is not listed

Check that the profile exists under `.github/agents/`, has valid frontmatter, is available to the relevant Copilot surface, and that the repository branch containing the profile is available to that surface. Do not assume a custom agent name alone is sufficient to create an assignment.

### Assignment appears successful but no work starts

Inspect the Issue and repository state first. Distinguish Copilot service/permission/configuration problems from repository build or task problems. Do not repeatedly reassign the same Issue without identifying the cause.

### Agent creates a PR but verification fails

Treat the failed verification as authoritative. Route the failure back to the same Issue/PR with the concrete failure output and request a bounded correction. Never reinterpret a failed check as success.

## Automation boundary

Issue creation is intentionally outside this Skill. The **TxtRPG Issue Creation** workflow/chat is the sole source of new development Issues for this process.

This Skill performs no Issue-generation workflow and must not rely on an undocumented REST request such as assigning `copilot-swe-agent[bot]` with an `agent_assignment` payload.

If a future GitHub-supported API exposes first-class Copilot assignment, update this Skill only after verifying the behavior against current GitHub documentation.

## TxtRPG quality gate

Association is successful only when the resulting development task can be verified. The assigned agent should inspect the current repository before editing and run the applicable syntax, focused regression, full regression, and browser verification required by the repository. Preserve offline-first behavior, IndexedDB compatibility, and Worker/fallback parity where relevant.
