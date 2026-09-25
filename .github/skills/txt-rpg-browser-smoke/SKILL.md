---
name: txt-rpg-browser-smoke
description: Exercises the real TxtRPG browser runtime for affected gameplay and UI flows.
---

# TxtRPG Browser Smoke

Use the existing browser test configuration and local server path defined by the repository. Do not create a second browser harness.

## Minimum affected-flow checks
- boot and initial state
- Worker readiness or fallback startup
- command input and result rendering
- affected panels/navigation
- IndexedDB save and reload/restore when persistence is touched
- no uncaught page errors

For Worker-related changes, verify the same scenario through fallback where the repository already supports it. Record environment limitations such as missing Playwright or browser installation separately from product failures.