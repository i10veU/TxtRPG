# Phase 289 — Finale persistence round-trip

Finale-ready and canonical terminal campaign states now have storage regression coverage. The test verifies that `campaignPhase`, `finaleReady`, `ending`, and `gameStatus` survive IndexedDB entity snapshots, unavailable-IndexedDB localStorage fallback, and IndexedDB write-failure fallback without mutating the caller state.

A restored canonical terminal state rejects ordinary actions and preserves absolute time, while the finale-ready state remains active.

Verification: `tests/phase289-finale-storage-persistence.js`, plus the Phase 284–288 regressions.
