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
- Event history and follow-up triggers
- Browser smoke coverage for Worker, IndexedDB, actions, reload/restore

## Current next milestones

1. Extend event causality into longer-term region and NPC goal changes.
2. Separate IndexedDB entities where justified and stress-test long simulations.
3. Strengthen player goal discovery and quest discovery layers.
4. Validate the complete game loop, tutorial, and long-play/end-state structure.

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

Main currently contains the existing phase history through the economic/information/organization/NPC relationship/case-causality work described in `README.md`, plus the repository's existing gh-aw/autodev tooling work.

## How to update this file

Record only durable project state. Do not turn this into a commit log. Keep the next milestones short and actionable.
