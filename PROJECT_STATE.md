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
- Player case goals are persisted as idempotent quest chains through root-case aftermath, with legacy two-step saves migrated safely and actionable recommendations exposed only as follow-up cases open
- Main-thread fallback reset initializes and persists the same player quest chains as Worker reset, covered by an app-level regression test
- Storage loads normalize legacy/incomplete saves at the IndexedDB and localStorage boundaries and rewrite the normalized state, covered by a three-path regression test
- Storage saves normalize once before IndexedDB writes, keep record metadata aligned with the normalized schema, and use the same normalized snapshot for localStorage fallback writes without mutating caller state
- The first-session tutorial now advances through market inspection, archive travel, and goal discovery; campaign state records active/won/lost outcomes, blocks terminal actions, and is normalized for persistence
- Terminal `won`/`lost` campaign states are regression-tested across IndexedDB and both localStorage fallback paths, including restored action blocking and time preservation

## Current next milestones

1. Extend the validated tutorial/end-state contract into a complete long-play and ending structure.
2. Separate IndexedDB entities where justified and stress-test long simulations.

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
