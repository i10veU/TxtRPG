# Phase 286 — Long-play ending gate

The tutorial now transitions into a persistent long-play phase instead of ending when any quest chain completes. Completing the canonical grain-warehouse chain and its aftermath marks the campaign as finale-ready; ordinary side-quest completion leaves the campaign active. The player must explicitly enter `결말` (or `ending`/`finale`) to resolve the canonical ending.

Campaign phase, finale readiness, and ending identity are normalized with the save state. Worker and fallback action loops use the same campaign progression logic, and terminal actions remain blocked after restoration.

Verification: `tests/phase286-long-play-ending.js`, `tests/phase278-case-aftermath-stress.js`, and the existing phase 284–285 regressions.
