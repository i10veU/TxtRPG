# Phase 291 — Representative long-play browser progression

The Chromium browser suite now covers a representative active campaign beyond the tutorial and finale seed. It restores a long-play save with the canonical warehouse clue, resolves the root case through the Worker, advances into the next day, resolves the delayed grain aftermath, and verifies that the four-step player quest chain and finale gate persist after reload.

The scenario deliberately stops at `finale-ready`: the canonical `결말` action remains an explicit separate choice, so long-play progression does not silently enter the terminal state.

Verification: `tests/phase291-browser-long-play.spec.js`, together with the existing Phase 255 browser suite and Phase 280–289 engine/storage regressions.
