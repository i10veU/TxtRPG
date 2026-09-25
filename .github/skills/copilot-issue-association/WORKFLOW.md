# TxtRPG Copilot Development Workflow

This workflow defines the lifecycle for an already-created TxtRPG GitHub Issue from Copilot association through verification. It adapts the useful orchestration ideas from Ruflo without introducing a separate orchestration runtime, database, swarm, or consensus layer.

## State machine

```text
ISSUE_CREATED
    |
    v
VALIDATING
    |
    +---- invalid/broad ----> PLANNING_REQUIRED
    |                              |
    |                              v
    |                         ISSUE_REVISED
    |                              |
    +------------------------------+
    |
    v
ASSOCIATING
    |
    v
RUNNING
    |
    +---- blocked ------------> HUMAN_REVIEW
    |
    +---- failed -------------> FAILED
    |                              |
    |                 +------------+------------+
    |                 |                         |
    |                 v                         v
    |               RETRY                   REPLAN
    |                 |                         |
    |                 +------------+------------+
    |                              |
    +------------------------------+
    |
    v
PR_CREATED
    |
    v
VERIFYING
    |
    +---- failed -------------> CORRECTION
    |                              |
    |                              v
    +-------------------------- VERIFYING
    |
    v
REVIEW_REQUIRED
    |
    +---- changes requested --> CORRECTION
    |
    v
APPROVED
    |
    v
MERGED
```

A state is not inferred from a model response. It is established from observable GitHub state where possible: Issue assignment, branch/session, PR, checks, review state, and merge state.

## Ownership / claim

Use the Issue, branch, and PR as the source of truth for task ownership. Do not introduce a separate task database.

A normal development task has:

```text
Issue       = canonical work item
Primary agent = one verified implementation owner
Branch      = isolated implementation workspace
PR          = review/verification artifact
```

Do not launch competing implementation agents against the same files unless the Issue was deliberately decomposed into independently owned work.

When decomposition is necessary, each child task must have an explicit scope and owner, and the parent Issue remains the coordination record.

## Orchestrator role

`txtrpg-director` is an orchestrator/planner, not a general implementation agent. It may inspect and route work but does not receive routine write access merely to coordinate other agents.

The Director should only be invoked when the Issue is broad, ambiguous, cross-system, or genuinely requires decomposition. A focused Issue should go directly to its smallest appropriate implementation agent.

## Human gates

Human review is required when:

- the Issue contract materially changes after association;
- a task must be decomposed or reassigned;
- a security-sensitive workflow, permission, secret, or MCP configuration changes;
- verification fails and the cause is unclear;
- a correction would expand scope beyond the original Issue;
- a merge decision is required.

Do not encode human approval as a model-level instruction alone when GitHub review, branch protection, or another deterministic repository control can enforce it.

## Skill versus workflow

Agent Skills define reusable procedures for a particular kind of work. This workflow defines the lifecycle and ordering between those procedures.

Use:

- `copilot-issue-association` for Issue-to-agent handoff and lifecycle checks.
- implementation-specific Skills for implementation procedures.
- `code-review` for evidence-based review.
- `github-actions-failure-debugging` for bounded CI failure remediation.
- `copilot-workflow-security` for workflow/security-sensitive changes.

Do not duplicate the full workflow into every Skill or agent profile.

## Failure and retry rules

A failure must be classified before retrying:

- service/permission failure;
- custom-agent configuration failure;
- environment/setup failure;
- task implementation failure;
- verification/test failure;
- requirement ambiguity.

Retry only after the cause is identified. Reassigning the same Issue repeatedly without diagnosis is not a valid recovery strategy.

## Scope rule

Prefer:

```text
one Issue -> one primary implementation agent -> one branch -> one PR
```

Deviate only when the Issue is explicitly decomposed into independently verifiable work.
