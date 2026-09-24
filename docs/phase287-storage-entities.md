# Phase 287 — IndexedDB entity snapshot migration

IndexedDB saves now use version 2 with separate `meta`, `world`, and `simulation` object stores. Saves are written in one transaction and reconstructed into the normalized game state on load. Existing monolithic `saves/main` records are read as a migration source, while localStorage remains the fallback boundary.

Missing optional entity records recover through the normal state defaults without losing campaign metadata, and callers are still protected from normalization mutation.

Verification: `tests/phase287-storage-entities.js`, `tests/phase282-storage-normalization.js`, `tests/phase283-storage-save-normalization.js`, `tests/phase284-game-loop.js`, `tests/phase285-terminal-persistence.js`, `tests/phase286-long-play-ending.js`, and `tests/phase278-case-aftermath-stress.js`.
