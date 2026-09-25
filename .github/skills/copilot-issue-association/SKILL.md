---
name: copilot-issue-association
description: Associate an already-created GitHub Issue with a Copilot coding agent, including selecting the appropriate custom agent, preserving task context, applying least-privilege agent configuration, preparing the cloud-agent environment, and verifying the resulting agent session or pull request. Use when an existing TxtRPG Issue is ready for Copilot execution.
---

# Copilot Issue Association

Use this skill for the **Issue → Copilot coding-agent association and handoff** step. Issue creation remains outside this skill.

## Core rule

The Issue is created and specified by the separate **TxtRPG Issue Creation** workflow/chat. Do not create, duplicate, or rewrite the Issue merely to prepare it for Copilot.

Use GitHub's documented Copilot assignment mechanisms. GitHub currently documents both the GitHub UI and the Issues REST/GraphQL APIs for assigning an existing Issue to Copilot with an optional `agent_assignment`/`agentAssignment` configuration. Do not treat that API as undocumented. It is currently a public-preview capability, so verify current documentation and API behavior before relying on it in automation.

Preferred execution order:

1. Receive an existing GitHub Issue created by the TxtRPG Issue Creation workflow/chat.
2. Read the Issue and verify that it contains a concrete task contract: goal, scope, constraints, acceptance criteria, and verification requirements.
3. Determine the smallest specialized TxtRPG custom agent that fully covers the task.
4. Preflight the selected custom agent profile and repository instructions.
5. Verify that the Copilot cloud-agent development environment is configured for the repository's verification needs.
6. Prefer the normal GitHub **Assignees → Copilot** flow when a human is performing the association.
7. When this workflow is being automated, use only the documented REST/GraphQL Issues API and its Copilot assignment fields. Do not invent payloads or infer undocumented endpoints.
8. When assigning through the API, preserve the intended `target_repo`/`targetRepositoryId`, `base_branch`/`baseRef`, and, when explicitly selected, `custom_agent`/`customAgent` and `model`. Keep `custom_instructions`/`customInstructions` limited to task-specific guidance that is not already encoded in the Issue or repository configuration.
9. Start the Copilot task and verify the resulting assignment/session rather than assuming the API call succeeded.
10. Verify that Copilot created a working branch/session and subsequently a pull request.
11. Validate the resulting PR with repository CI and required review gates.

For API-based assignment, first verify that Copilot cloud agent is enabled for the repository and that Copilot is returned as an assignable actor. For GraphQL, use the currently documented feature headers required by the assignment API. Treat preview API behavior as subject to change.

Do not create a second Issue merely because association has not yet started.

## Issue context boundary

Copilot receives the Issue title, description, existing comments, and additional assignment instructions **at assignment time**. Later Issue comments are not automatically incorporated into that assigned task.

Therefore:

- Finish the task contract before association.
- Do not use a later Issue comment as the primary way to change requirements after assignment.
- Put post-assignment corrections, new requirements, and review feedback on the resulting PR or in a supported Copilot session follow-up.
- If the requirement materially changes, stop and reassess whether the existing task should continue before requesting more work.

## Agent selection

Choose the smallest specialized agent that fully covers the task.

- `txtrpg-director`: task decomposition, planning, and routing; do not use it as a default implementation agent.
- `txtrpg-lore`: world, lore, narrative data, systemic content, and consistency work.
- `txtrpg-engine`: game state, simulation, persistence, workers, deterministic logic, and engine behavior.
- `txtrpg-ui`: browser UI, interaction, accessibility, rendering, and input behavior.
- `txtrpg-qa`: verification, regression analysis, browser smoke tests, and release-readiness checks.

These names are intended mappings, not proof that the profiles exist. Verify the actual `.github/agents/*.agent.md` files before selecting one. If the repository does not contain a requested profile, do not pretend that the custom agent exists.

If a task crosses domains, prefer one primary implementation agent and explicitly state the secondary verification responsibilities already defined by the Issue. Do not create multiple competing implementation sessions for the same files unless the work is intentionally isolated.

## Agent profile preflight

Before association, inspect the selected `.github/agents/*.agent.md` profile when it is available on the branch/base used by the Copilot surface.

Verify:

- `description` clearly matches the task domain.
- The prompt does not duplicate or contradict repository-wide policy.
- `target` includes `github-copilot` when the profile is intended for GitHub.com/cloud-agent use, or is omitted when cross-surface use is intentional.
- `tools` is explicitly scoped when the agent does not need every available tool. An omitted `tools` field grants access to all available tools, so do not omit it casually for specialized agents.
- `mcp-servers` is present only when the agent actually needs an MCP capability.
- Any `model` selection is intentional and compatible with the target surface; do not add a model merely to force a preference.

If the profile is missing or invalid, do not compensate by creating a transient prompt that pretends the custom agent exists. Report the configuration problem and return it to repository configuration work.

## Cloud-agent environment preflight

Copilot cloud agent runs in an ephemeral development environment. Repository-specific setup belongs in `.github/workflows/copilot-setup-steps.yml` rather than in the Issue prompt.

For TxtRPG, the setup file prepares Node.js and the browser-test dependency used by the existing Playwright smoke suite. Keep this setup deterministic and limited to dependencies required to inspect, test, and validate the repository.

Before association, verify that the setup file exists on the branch/default context used by the Copilot surface and that its commands match the repository's current test requirements. Do not add credentials or tokens to this file.

If private resources or MCP servers later require credentials, use GitHub **Agents secrets and variables**. Never place secret values in an Issue, Skill, agent profile, setup workflow, or repository file.

## Context layering

Treat context as a hierarchy rather than copying the same instructions into every layer:

1. `.github/copilot-instructions.md` — rules that apply broadly to repository work.
2. `AGENTS.md` and path-specific repository instructions — local engineering policy.
3. Custom agent profile — role, expertise, tool scope, and behavior.
4. Relevant Agent Skills — detailed procedures loaded only when applicable.
5. Issue — the concrete task contract and acceptance criteria.
6. Optional Copilot Space — curated background context for large or cross-cutting tasks when a Space already exists or is deliberately created for that purpose.

The Issue remains the authoritative contract for the requested change. A Space or other contextual source must not silently override explicit Issue requirements.

Do not paste repository-wide rules into the assignment message merely to increase prompt size. Reference the existing repository configuration instead.

## Skills, hooks, and tools

Use repository-wide instructions for rules that apply to nearly every task. Use Agent Skills for specialized procedures that should be loaded only when relevant. Use hooks for deterministic controls that must run at a lifecycle point regardless of model interpretation. Use MCP only when an external capability is actually required.

For this association workflow, the repository hook `.github/hooks/copilot-agent-safety.json` blocks direct `git push` operations targeting `main`. This is a deterministic guard for the Issue → branch → PR workflow; it does not replace CI, branch protection, or human review.

Do not put ordinary prose policy into a hook when an instruction or Skill is sufficient. Hooks are reserved for machine-enforceable checks and should remain small, deterministic, and fail-safe.

## Secrets and variables

Copilot cloud-agent secrets and variables are distinct from GitHub Actions, Codespaces, and Dependabot secrets. If the agent needs a credential for a private resource or MCP server, configure it through the repository or organization **Agents** secret/variable mechanism.

Use `COPILOT_MCP_`-prefixed Agent secrets/variables only when a value must be exposed to an MCP server. Do not expose secrets to an agent when the task does not require them.

Never request, echo, commit, or paste secret values into the Issue or PR.

## Association validation

After assignment, verify the actual GitHub state rather than assuming the assignment succeeded.

Check for:

- Copilot appearing as the Issue assignee/session owner.
- The selected custom agent, when the GitHub UI/API surface exposes it.
- A working branch or agent session associated with the Issue.
- A PR generated from the task.
- CI checks on the resulting PR.

When using the API, record the returned Issue state and, where available, the assignment configuration. If no session/PR starts, distinguish service, permission, preview-API, configuration, and task failures before retrying.

## Post-assignment steering

For an existing Copilot-created PR, use PR comments and supported `@copilot` follow-ups for bounded corrections. Copilot can continue work on the PR and, for a PR created by a custom agent, subsequent `@copilot` requests can continue using that same agent.

Batch related review feedback into a single review where practical instead of triggering many independent correction sessions.

Do not use Issue comments after association as the primary steering mechanism because the assigned Issue context is fixed at assignment time.

## Failure handling

### Copilot is not available in Assignees

Report the blocking condition and check the repository/account Copilot eligibility and organization/repository policies. If automation is being used, verify that the documented API reports Copilot as an assignable actor before attempting assignment.

### Custom agent is not listed

Check that the profile exists under `.github/agents/`, has valid frontmatter, is available to the relevant Copilot surface, and that the repository branch containing the profile is available to that surface. Do not assume a custom agent name alone is sufficient to create an assignment.

### Custom agent has excessive tool access

Prefer fixing the agent profile's `tools` declaration rather than compensating in the Issue prompt. Least privilege belongs in the reusable agent definition.

### Agent environment is missing a required dependency

Update `.github/workflows/copilot-setup-steps.yml` through repository configuration work. Do not install persistent dependencies only through an Issue prompt unless the dependency is intentionally task-local and disposable.

### Assignment appears successful but no work starts

Inspect the Issue, assignment response/state, and repository state first. Distinguish Copilot service/permission/preview-API/configuration problems from repository build or task problems. Do not repeatedly reassign the same Issue without identifying the cause.

### Agent creates a PR but verification fails

Treat the failed verification as authoritative. Use the concrete CI failure to drive a bounded correction on the PR. GitHub also provides a **Fix with Copilot** path for failing Actions runs; use that only when the failure is within the agent's task scope. Never reinterpret a failed check as success.

## Automation boundary

Issue creation is intentionally outside this Skill. The **TxtRPG Issue Creation** workflow/chat is the sole source of new development Issues for this process.

This Skill may associate an already-created Issue using GitHub's documented UI or documented REST/GraphQL Copilot assignment APIs. It must not create a replacement Issue as an association workaround.

## Work-size gate

Prefer one focused Issue → one primary agent → one branch/PR lifecycle. If the Issue combines multiple independently testable subsystems or is too broad to validate in one bounded session, return it to Issue planning for decomposition instead of launching several competing implementation sessions.

## TxtRPG quality gate

Association is successful only when the resulting development task can be verified. The assigned agent should inspect the current repository before editing and run the applicable syntax, focused regression, full regression, and browser verification required by the repository. Preserve offline-first behavior, IndexedDB compatibility, and Worker/fallback parity where relevant.
