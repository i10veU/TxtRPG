# TxtRPG V2 — Temporal World Graph and Agentic World Design

**Status: design only.** No new runtime code, dependencies, AI calls, schema migrations, tests or gameplay changes are included.

**Target integration branch:** `feature/v2-core`, not `main`. Respect `AGENTS.md`, `docs/v2/DEVELOPMENT_RULES.md`, and the current Core contract.

## Why now / constraints from current V2

The V2 Core already models actors, directed relations, fact/rumor/knowledge, events, triggers, consequences, time, deterministic RNG, save/load, succession, and a playable story vertical slice. Existing M0–M7 development and pending M8 completion/balance evidence must not be displaced by an AI platform rewrite. The graph is a **derived query/index and world-history enhancement**, not a replacement for `step(state, action, data) -> {state,events}`.

The latest inspected V2 README (2026-10-16) points to M7 PR #347, fix PR #350, and World Bible PR #348. These may have moved since that snapshot: refresh PR/head status before implementation. M8 release verification remains a separate priority.

## Core architectural decision

Use a **temporal event projection** of existing authoritative game state and events. No LLM inference inside Core; no Graphiti database/service dependency in the browser baseline.

```
World data pack + existing state
  -> pure step(state, action, data)
  -> {nextState, events}
  -> deterministic temporal projector (pure)
  -> versioned WorldGraphSnapshot + evidence links
  -> pure graph queries / NPC perception / player-visible view
  -> future optional offline content-authoring agents
```

### Node kinds (semantic categories, not a new runtime object hierarchy)

- `Entity`: actor, NPC, creature, deity, organization/faction.
- `Location`: settlement, region, dungeon, dimension.
- `Resource`: goods, food, ore, mana, technology, currency.
- `Event`: birth, death, conflict, discovery, rumor, trade, migration.
- `Knowledge`: facts, claims, rumors, beliefs, provenance and observer-specific knowledge.

Reuse existing IDs and data pack fields. Do **not** invent missing canonical entities or infer truth from rumors. A graph node may be a view of an existing entity, not a duplicated authoritative record.

### Temporal edge model (proposal; version before implementation)

`edge_id`, `subject_id`, `predicate`, `object_id|literal`, `valid_from_minute`, `valid_to_minute|null`, `asserted_at_minute`, `source_event_id`, `observer_id|null`, `epistemic_status` (`fact|rumor|belief|disputed`), `visibility`, `projection_version`.

- Game time uses existing integer absolute minutes, never wall-clock `Date.now()`.
- Stable IDs and deterministic ordering, including identical-minute tie-breaks.
- Close prior temporal interval when a mutually exclusive relation changes; preserve historical edge and source.
- A belief/rumor must remain separate from world truth. `observer_id` gates what a character can know; no omniscient leak to NPC or player queries.
- Prefer provenance derived from existing event/knowledge identifiers. If no stable event ID exists, define deterministic derivation from replay sequence and event ordinal; verify this against save/replay behavior before adopting.
- Missing origin/uncertain chronology must be marked unknown, not synthesized as canon.

## P0 — Pure temporal graph projection (first implementation slice)

Implement **one** bounded end-to-end scenario with existing elder, bandit organization, village, ruin, rumor and confrontation outcomes:

1. Player hears a rumor from the elder (source-specific knowledge).
2. Player confirms or fails to confirm it at the ruins (observer-specific belief update).
3. Confrontation changes an NPC/organization relationship and an event is recorded.
4. Time advances; the world retains old relations while current-state queries show only active ones.
5. Player `view` reveals only discoverable knowledge and relevant consequences.

Keep authoritative `state` unchanged for P0. Build a read-only graph snapshot on demand or from a bounded event log. Do not persist a second authoritative graph until deterministic replay, memory size and save compatibility are proven. Keep Core free of DOM, IndexedDB, fetch, timers, global RNG and model calls.

### Suggested pure APIs (names provisional)

- `projectWorldGraph({state,data,events,priorProjection?}) -> {projection,diagnostics}`
- `queryWorldAt(projection,{minute,observerId,visibility}) -> visible subgraph`
- `traceCausality(projection,eventId) -> source-backed predecessors`
- `validateWorldGraph(projection) -> diagnostics[]`

Any optional cache belongs outside Core and must be rebuildable. Use no extra API call or database for baseline gameplay.

## P1 — NPC memory, motives and society

Build NPC behavior **from rules and deterministic world state first**: needs, location, relationships, information, schedules and limited action choices. A character must not act on facts they have not observed. Events should affect at least two linked systems where meaningful (e.g. bandit defeat -> faction membership -> market safety -> rumor propagation). Use bounded action budgets, deterministic tie-breaking and existing resource/time mechanics. Do not spawn an LLM call per NPC or per tick.

Measure world interaction density, causally visible consequences, behavior diversity and contradiction rate rather than total node count. Player choice and existing combat grammar remain authoritative.

## P2 — Offline Worldbuilding Arena (optional)

Multiple content-design agents can propose new quests, myths, factions, cultures, NPC schedules or locations. They compete on:

- Canon consistency with World Bible, chronology and existing IDs.
- Gameplay contribution (information -> judgment -> action -> consequence).
- Interaction density, replay value, discoverability and resource cost.
- Cross-genre coherence without forcing one combat grammar on all worlds.
- Korean localization and original IP; distinguish historical/mythological references from invented lore.

Candidates are **offline data proposals** only. A deterministic validator and regression suite must pass before authored data enters a world pack. No automatic canon overwrite, mass node creation, or external API cost without explicit measured value. Graphiti/GEPA may inspire offline tooling; they are not runtime dependencies.

## Acceptance criteria / verification

### P0

- Same seed, data pack, action sequence -> byte-stable projection and visible queries across repeated runs.
- Graph generation and queries never mutate `state`, `data`, or events; Core `step` outputs unchanged.
- History query at T-before and T-after shows correct relation validity without deleting the earlier edge.
- Rumor vs fact and observer-specific knowledge remain distinct; no unrevealed fact leaks into player view.
- Every derived edge has a real source or explicit unknown provenance; impossible references rejected.
- Missing/damaged events produce diagnostics, not invented canon.
- Existing save/load/migrate and V1/V2 regression remain compatible; no new mandatory save fields.
- Browser and Node deterministic parity; Worker/fallback parity if used.
- Benchmark projection time and memory against a bounded fixture; choose a limit from actual baseline rather than inventing a capacity claim.

### P1 / P2

- NPC action decisions are reproducible for a fixed seed and world state.
- Long-horizon simulations have no invalid time intervals, orphaned entity IDs, impossible resource balances, or hidden-knowledge leaks.
- New content creates measurable player-visible choices and consequences, not just additional static nodes.
- Maintain M8 release-completion evidence and avoid changing pre-registered balance criteria to fit outcomes.

## Implementation sequence

1. Refresh `feature/v2-core`, relevant PRs, and M8 blockers. Inspect current `relations`, `knowledge`, `events`, `view`, persistence and test fixtures.
2. Document exact mapping from existing fields to graph nodes/edges; reject schema duplication.
3. Write a failing fixture for rumor -> confirmation -> faction change -> later historical query.
4. Implement pure projection + query, no state schema changes.
5. Add no-leak, determinism, replay, malformed data and save compatibility tests.
6. Run full Node and real Chromium/IndexedDB regression, plus long-horizon simulation.
7. Separate PR for deterministic NPC society; only then evaluate optional offline Arena authoring.

## Research and precedents

- [Graphiti](https://github.com/getzep/graphiti): temporal knowledge graph reference, not a required service.
- [Generative Agents](https://arxiv.org/abs/2304.03442): memory/reflection/planning ideas, not proof of scalable game simulation.
- [LangGraph](https://github.com/langchain-ai/langgraph): offline agent orchestration reference, not a browser Core dependency.

**Design PR only.** It is not an implemented graph, NPC simulation, or tested feature.
