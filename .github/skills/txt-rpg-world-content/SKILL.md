---
name: txt-rpg-world-content
description: Extends TxtRPG world data while preserving canon, schema compatibility, systemic interactions, and player discovery.
---

# TxtRPG World Content

Before adding content, read the relevant world documents and existing data structures.

## Required checks
- Reuse existing identifiers and schemas where possible.
- Keep content data-driven and separate from engine/UI logic.
- Connect meaningful content to existing NPC, faction, economy, event, case, information, or consequence systems.
- Define triggers, state changes, persistence, and player-observable effects for new dynamic events.
- Preserve save/load normalization and backward compatibility.
- Avoid duplicate entities and disconnected lore.

## Canon rule
Existing repository world/content documents outrank agent assumptions. If a requirement conflicts with canon and the Issue does not explicitly resolve the conflict, stop and document the ambiguity rather than silently retconning it.