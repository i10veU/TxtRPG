// V2-Core-149 (roadmap M8, D-127, Issue #371): the first region's pack-level gates (docs/v2/first-region-baseline.md §3),
// measured by the tool itself (tests/v2/measure/content-graph.mjs) on the real pack, so a later change cannot let them slip
// unseen -- M2 left G1 at exactly 80.0%, and two clocks added by M7 took it to 79.1% without anyone measuring again (§9).
//   1. G1 interaction density: at least 80% of the actions, options and events touch two or more systems
//   2. G2 isolated channels: at most 10% of the facts, signals and flags are written but never read (or the reverse)
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(new URL("./measure/content-graph.mjs", import.meta.url));
// the real pack only: no candidate patch, no other checkout
const { CANDIDATE, PACK_ROOT, ...env } = process.env;
const report = JSON.parse(execFileSync(process.execPath, [tool], { encoding: "utf8", env }));

const { multiSystem, elements, share: density } = report.G1_density;
assert.ok(density >= 0.8, `G1 ${multiSystem}/${elements} = ${(100 * density).toFixed(1)}% (single-system: ${report.singleSystem.map((s) => s.id).join(", ")})`);
const { isolated, channels, share: isolation } = report.G2_isolated;
assert.ok(isolation <= 0.1, `G2 ${isolated}/${channels} = ${(100 * isolation).toFixed(1)}%`);
console.log(`V2-Core-149 content-density.test.js: all checks passed (G1 ${multiSystem}/${elements}, G2 ${isolated}/${channels})`);
