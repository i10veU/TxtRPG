# TxtRPG Copilot Operating Rules

## Mission

TxtRPG is a large-scale offline-first text RPG. The repository is the source of truth for implementation state. Agents must preserve the existing working game while incrementally expanding the world simulation and player experience.

## Architecture baseline

- Microsoft Edge / Chromium is the primary local runtime.
- IndexedDB is the persistent structured-data layer.
- Web Worker is the preferred home for simulation work that can run off the UI thread.
- Canvas is available for high-volume rendering where it is actually useful.
- `web/` currently contains the runnable prototype and is already split into core/data/storage/worker/ui concerns.
- Preserve the existing fallback behavior where IndexedDB is unavailable.

## Project design baseline

The world is a connected simulation, not a collection of isolated quest scripts.

Important relationships include:

`region -> people -> faction -> economy -> NPC goals -> events -> consequences -> information -> player choices`

NPCs should have independent goals and schedules. Events should have explicit triggers and consequences. Information should have provenance and confidence where the current system supports it. Content should be data-driven and kept separate from engine logic.

## Development philosophy

1. YAGNI first.
2. Reuse existing code before creating abstractions.
3. Prefer the standard library and browser-native APIs before new dependencies.
4. Make the smallest change that solves the actual problem.
5. Do not rewrite working systems merely to make them look cleaner.
6. Do not introduce speculative frameworks, services, or infrastructure.
7. Keep changes incremental and testable.
8. Preserve backward compatibility unless a migration is explicitly designed and tested.

## Agent rules

Before editing:

- Inspect the current branch and relevant implementation.
- Read `README.md` and relevant documents under `docs/`.
- Search for existing implementations before creating new ones.
- Identify the smallest safe change.

While editing:

- Keep responsibilities separated.
- Avoid duplicated state or competing sources of truth.
- Keep world/content data independent from UI code.
- Do not silently alter established lore.
- Do not silently remove existing commands or behavior.

After editing:

- Run the most relevant available tests.
- Run syntax/static checks appropriate to the changed files.
- For simulation changes, include regression coverage where practical.
- For browser/runtime changes, perform the existing smoke-test path when available.
- Report what was tested and any limitations.

## Autonomous operation and human escalation

TxtRPG is intended to run as an autonomous development pipeline. Routine successful work must NOT request human review, approval, or confirmation beyond the platform's unavoidable Copilot task-completion notification.

Agents should self-review, run verification, fix ordinary failures, and continue iterating without waiting for the owner.

Escalate to the owner only when a material blocker or high-impact report requires a human decision. Examples include:

- security vulnerability, secret exposure, or unsafe permission change;
- data-loss risk or an irreversible migration;
- corruption of persistent game state or save compatibility;
- an unresolved regression after reasonable repair attempts;
- a conflict with an established non-negotiable invariant or world-canon rule;
- a major architectural decision with multiple materially different valid choices;
- inability to proceed because required information or credentials are unavailable;
- a release-blocking failure that cannot be safely repaired within scope.

For escalation, create or update a clearly labeled GitHub issue/report and explicitly `@mention` the owner with a concise explanation, evidence, impact, and the decision needed. Do not @mention the owner for ordinary test failures that the agent can repair, routine PR completion, or successful milestones.

Do not treat a PR review request generated automatically by GitHub as evidence that human review is required. The repository policy is autonomous operation; agents must continue verification and integration without waiting for the owner unless an escalation condition above is met.

## Git rules

- Work on a task-specific branch.
- Keep commits focused.
- Do not force-push or rewrite history.
- Prefer a pull request for non-trivial changes.
- Do not merge a change solely because it compiles; integration and regression behavior matter.

## Completion rule

A task is complete only when implementation, integration, and verification are complete. If verification fails, fix the cause or clearly leave the task blocked; never claim success from an unverified implementation.

## Authority order

When sources conflict, use this order:

1. Current executable behavior and tests.
2. Current architecture/design documents.
3. Current world/content documents.
4. Historical phase notes.
5. Agent assumptions.

If an important requirement is unclear, preserve existing behavior and document the uncertainty rather than inventing a rule.
