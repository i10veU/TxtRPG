# Phase 272 — World Depth & UI Vertical Slice

## Goal
Expand the playable world and upgrade the interface together, while preserving the existing text-RPG core and offline-first architecture.

## Scope

### World
- Expand the existing five-location city region with additional named sublocations, NPCs, organizations, rumors, cases, and causal relationships.
- Prefer systemic relationships over isolated lore: locations should affect NPC schedules, resources, factions, cases, and available actions.
- Add at least one multi-step situation that can evolve through player intervention rather than a single scripted quest.
- Keep the world data-driven and compatible with the existing state normalization/save system.

### UI
- Replace the current extremely compressed presentation with a simple but polished responsive game layout while retaining the text-first identity.
- Improve hierarchy for location/time, narrative log, player status, command entry, and information panels.
- Preserve keyboard accessibility and mobile/touch usability.
- Do not introduce a UI framework or unnecessary dependency.

### Reliability
- Add focused regression tests before changing behavior where practical.
- Add browser smoke coverage for the important new UI interactions.
- Verify no uncaught exceptions during initial load, command execution, panel switching, save/load, and the new world interaction flow.
- Preserve Worker/fallback parity and IndexedDB compatibility.

## Quality bar
The task is intentionally broad. A larger coherent patch is acceptable when it improves the vertical slice as a whole and remains maintainable.

Extra quality weight should go to:
1. More varied and interconnected world simulation rather than static text volume.
2. A simple, restrained, high-quality UI rather than decorative complexity.
3. Zero-error behavior across syntax, unit/regression, browser, and save/load verification.
4. Coherent integration with the existing architecture rather than parallel systems.

Do not optimize for line count. Complexity is valuable only when it creates meaningful gameplay consequences.
