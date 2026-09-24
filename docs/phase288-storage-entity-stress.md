# Phase 288 — IndexedDB entity snapshot stress

Repeated IndexedDB entity-snapshot saves now have regression coverage. The test alternates populated and minimal world/simulation states for 100 save/load cycles, checks caller immutability, and verifies that removed entities do not leak back from prior snapshots.

The same coverage independently removes `meta`, `world`, and `simulation` records and confirms normalized defaults preserve available state without throwing.

Verification: `tests/phase288-storage-entity-stress.js`, plus the Phase 282–287 storage, game-loop, ending, and long-play regression tests.
