# TxtRPG Project State

> This file is a compact coordination snapshot for human and AI agents. Update it after meaningful milestones.

## Mission

Build a large-scale offline-first text RPG in the browser where the player discovers goals inside a living simulated world.

## Runtime

- Primary: Microsoft Edge / Chromium
- Persistence: IndexedDB with existing fallback behavior
- Simulation: Web Worker with fallback path
- Rendering: existing HTML/CSS/UI plus Canvas where appropriate

## Current implemented direction

- NPC autonomous schedules and goals
- Organization autonomous decisions
- Organization relationships and conflict
- Trigger -> Event -> Consequence event chains
- Dynamic grain economy plus regional resources/trade routes
- Information/rumor provenance and confidence
- NPC relationship/conflict network
- Event history, follow-up triggers, and grain/faction/trade-route/NPC-dispute consequences that apply both organization pressure and durable NPC goal progress
- Command-based player goal discovery from open cases and high-confidence rumors
- Browser smoke coverage for Worker, IndexedDB, actions, reload/restore
- Worker and fallback reset paths initialize regional economy and NPC relationship state consistently
- Delayed case aftermath is covered by a 120-day Worker/fallback parity and bounded-state stress test
- Player case goals are persisted as two-step, idempotent quest chains and exposed through actionable goal recommendations

## Current next milestones

1. Separate IndexedDB entities where justified and stress-test long simulations.
2. Expand quest chains into case aftermath and deeper multi-step discovery.
3. Validate the complete game loop, tutorial, and long-play/end-state structure.

## Agent ownership

| Area | Agent |
| --- | --- |
| World/content | `txtrpg-lore` |
| Engine/simulation | `txtrpg-engine` |
| UI/browser interaction | `txtrpg-ui` |
| Verification | `txtrpg-qa` |
| Cross-cutting planning | `txtrpg-director` |

## Non-negotiable invariants

- Existing working commands should not disappear without an explicit change.
- Worker and fallback simulation paths should remain semantically aligned.
- Persistent state must have a migration/default path.
- World content must remain data-driven and connected to the simulation.
- Events must have explicit triggers and consequences.
- NPC autonomy must not depend on player presence.
- Do not add speculative dependencies or architecture.

## Latest known baseline

Main currently contains the existing phase history through the economic/information/organization/NPC relationship/case-causality work described in `README.md`, plus the repository's existing gh-aw/autodev tooling work. The regional economy now distinguishes healthy-route startup replenishment from degraded-route supply crises, preserving crisis signals for low-reliability routes while avoiding a false crisis on the first daily simulation.

## How to update this file

Record only durable project state. Do not turn this into a commit log. Keep the next milestones short and actionable.
