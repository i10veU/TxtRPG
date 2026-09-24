# Phase 290 — Browser finale progression and restoration

The Chromium browser smoke suite now covers the complete canonical finale path. It seeds a persisted `finale-ready` campaign, restores that state, resolves `결말` through the Worker, reloads the page, and verifies that `won`, `complete`, `finaleReady`, and `canonical` survive restoration.

The test also confirms that a post-ending `휴식` command does not advance absolute time and returns the terminal-state narrative.

Verification: `node --check tests/phase255-browser.spec.js` and the Phase 284–289 regression suite. The Playwright smoke test requires the repository’s CI browser-test dependencies.
