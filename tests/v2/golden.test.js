// V2-Core-40 (Issue #111, D-75): the golden test of CORE_CONTRACTS §13.2 -- "고정 seed와 고정
// 시퀀스의 최종 state 해시를 기록한다. 바뀌면 실패하며, 갱신은 의도된 변경일 때만 사유와 함께 한다".
// The same-run-twice tests elsewhere cannot see an engine change that alters every run alike (an RNG
// draw, a check modifier, an Effect or trigger order); this file compares against values recorded in
// tests/v2/fixtures/golden-path.json, so such a change fails here until it is recorded on purpose.
// tests/v2-ui-golden-browser.spec.js runs the same fixture in real Chromium and compares every step
// with Node (§2.7: the engine's goal is the same result for server and client).
//
// To update after an INTENDED change: `node tests/v2/golden.test.js --print`, paste the output over
// `stepHashes`/`finalStateHash` in the fixture, and give the reason in the commit/PR and in D-75.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ (not the
// fixtures/ folder) and skips `*.spec.js`. node:assert/strict only (§13.1); the fixture uses abstract
// IDs only (§13.1, DEVELOPMENT_RULES).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { hashString } from "../../web/v2/core/rng.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";

const FIXTURE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "golden-path.json");
const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));

// JSON with object keys sorted (no localeCompare, §2.6): the fingerprint depends on content, not on
// the order in which the engine happened to create the keys
function canonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined)
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}
const fingerprint = (value) => hashString(canonicalJson(value)).toString(16).padStart(8, "0");

// createInitialState, then every action in order; each entry is that call's {state, events}
function play(seed, actions, data, from) {
  const results = [];
  let current = from ?? createInitialState({ worldSeed: seed, data });
  if (from === undefined) results.push(current);
  for (const action of actions) {
    current = step(current.state, action, data);
    results.push(current);
  }
  return results;
}

const results = play(fixture.worldSeed, fixture.actions, fixture.data);
const stepHashes = results.map(fingerprint);
const finalState = results.at(-1).state;

if (process.argv.includes("--print")) {
  console.log(JSON.stringify({ stepHashes, finalStateHash: fingerprint(finalState) }, null, 2));
  process.exit(0);
}

// 1. the fixture is valid data and still walks the paths it is meant to lock (a fixture that stopped
// exercising them would keep "passing" while guarding nothing)
function testFixtureCoverage() {
  assert.deepStrictEqual(validateData(fixture.data), []);
  assert.strictEqual(results.length, fixture.actions.length + 1);
  const events = results.flatMap((result) => result.events);
  const types = new Set(events.map((e) => e.type));
  const tiers = new Set(events.filter((e) => e.type === "check.resolved").map((e) => e.data.tier));
  const rejected = new Set(events.filter((e) => e.type === "action.rejected").map((e) => e.data.code));
  const fired = new Set(events.filter((e) => e.type === "trigger.fired").map((e) => e.data.eventId));
  assert.deepStrictEqual([...tiers].sort(), ["fail", "great", "partial", "success"], "every check tier");
  assert.deepStrictEqual([...fired].sort(), ["e_alarm", "e_day", "e_found", "e_report"], "events, incl. one that rolls a check");
  assert.deepStrictEqual([...rejected].sort(), ["invalid_action", "no_pending_choice", "pending_new_character", "requirements_not_met"]);
  for (const type of ["actor.moved", "day.started", "choice.offered", "rumor.learned", "rumor.updated", "fact.changed", "case.updated",
    "relation.changed", "level.up", "unlock.granted", "skill.changed", "trait.changed", "item.changed", "actor.died", "character.started"]) {
    assert.ok(types.has(type), `the sequence produces ${type}`);
  }
  assert.strictEqual(finalState.actors.player_1.alive, false);
  assert.strictEqual(finalState.actors.player_1.growth.growth_a.level, 3);
  assert.deepStrictEqual(finalState.player, { actorId: "player_2", characterCount: 2 });
  assert.ok(finalState.attempts.search_b > 1, "a retried check (retryPenalty)");
  const chained = results.find((result) => result.events.filter((e) => e.type === "trigger.fired").length === 2);
  assert.deepStrictEqual(chained?.events.filter((e) => e.type === "trigger.fired").map((e) => e.data.eventId), ["e_found", "e_report"], "a same-step chain in id order");
  // world generation (D-76): both `initial` forms are seeded at creation, so the C1 seed input is locked
  assert.deepStrictEqual(Object.keys(results[0].state.facts), ["fact_fixed", "fact_seeded"], "seeded at creation (fact_a stays lazy)");
  assert.deepStrictEqual(results[0].state.facts.fact_fixed, { value: "start", since: 0 });
  assert.deepStrictEqual(validateState(finalState), []);
}

// 2. the golden: every step and the final state match the recorded fingerprints
function testGolden() {
  const firstDifference = stepHashes.findIndex((hash, index) => hash !== fixture.stepHashes[index]);
  assert.strictEqual(
    firstDifference,
    -1,
    firstDifference === -1 ? "" : `golden mismatch from step ${firstDifference} (${firstDifference === 0 ? "createInitialState" : JSON.stringify(fixture.actions[firstDifference - 1])}): ` +
      `recorded ${fixture.stepHashes[firstDifference]}, got ${stepHashes[firstDifference]}. If the change is intended, ` +
      "update the fixture with `node tests/v2/golden.test.js --print` and record the reason (D-75)."
  );
  assert.strictEqual(stepHashes.length, fixture.stepHashes.length);
  assert.strictEqual(fingerprint(finalState), fixture.finalStateHash);
}

// 3. the same final state when the run is cut anywhere, saved, loaded and continued
function testSaveLoadMidRun() {
  for (const cut of [1, 10, 20, 30, 34]) {
    const head = play(fixture.worldSeed, fixture.actions.slice(0, cut), fixture.data);
    const saved = JSON.parse(JSON.stringify(buildSaveRecord("slot_golden", head.at(-1).state, { savedAt: cut })));
    const loaded = parseLoadedRecord(saved);
    const tail = play(undefined, fixture.actions.slice(cut), fixture.data, { state: loaded, events: [] });
    assert.strictEqual(fingerprint(tail.at(-1).state), fixture.finalStateHash, `cut after ${cut} actions`);
  }
}

testFixtureCoverage();
testGolden();
testSaveLoadMidRun();

console.log("V2-Core-40 golden.test.js: all checks passed");
