# WNG-0/WNG-1 — Node Inventory Measurement Protocol

Status: proposed; read-only analysis. No Canon, save, engine or world-state changes.

## Execute

```sh
node tests/v2/measure/world-node-inventory.mjs
node tests/v2/measure/world-node-inventory.mjs --table
node tests/v2/measure/content-graph.mjs --table
```

## Counting contract

1. Count static definitions separately from runtime instances. Never interpret one NPC definition as a population of one.
2. Entity includes NPCs, organizations, factions; Location includes locations; Resource includes resources and items; Event includes event definitions; Knowledge includes facts and rumors.
3. Actions and choice options are reported as *interactive elements*, not counted as one of the five world Node kinds.
4. V1 and V2 are different versions; do not add them together without stable cross-version identity mapping.
5. Explicit edges in the WNG-0 script are only rumor ABOUT fact and location CONNECTED_TO location. Do not call its isolated-node figure a full relationship metric.
6. Compare with the existing content-graph measurement for Condition/Effect interaction density. Its channel counts are not a substitute for unique Node counts.
7. Preserve the V2 game loop and seed-based deterministic rules; graph extraction must not change the game.

## WNG-1 extension plan

Extract a read-only graph projection in this order:

- Explicit world links and rumor/fact references.
- NPC affiliation, resource ownership, production and consumption **only where actual data fields support the relationship**.
- Condition reads and Effect writes, with action/choice/event IDs as provenance records; avoid mistaking script statements for real-world Entity nodes.
- Event-to-state causal transitions, including knowledge time (`aboutDay` vs hearing time) where present.
- A missing-reference report with severity and provenance, keeping unresolved IDs separate from validated graph edges.

Every extractor must document its supported field names and fixtures. Do not infer edges from natural-language strings, ID prefix guesses or unsupported field semantics.

## Metrics

- Static definitions by kind, total unique definitions, duplicate IDs.
- Extracted edge count by type, unresolved reference count, isolated nodes *within the extracted subset*.
- Actions/options/events by system and location; compare existing baseline.
- Runtime CPU/memory and JSON output size for large packs, measured on a declared machine.
- Meaningful causality: how many decisions produce visible changes to a different NPC/location/resource/knowledge channel.

## Next gate

Run both commands on the exact PR commit and capture output. Review suspicious references, then add fixtures and a test that compares a known synthetic pack against expected counts. Do not claim WNG-0 measurement is complete until executed.
