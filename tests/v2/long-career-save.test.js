// V2-Core-147 (roadmap M8, MG-081 long play and the save, D-125, Issue #367): whole careers on the real pack, played by the
// story harness's policies (tests/v2/measure/story-careers.mjs), saved and loaded through the real save record.
//   1. a hero's 240 days (the name, the realm's name, and the long while after): a valid state; the save round-trips exactly
//   2. the save stays small and does not grow with the days -- under 32 KB, and day 240 within a tenth of day 120 (the
//      state is bounded: knowledge, relations and the events' bookkeeping are per id, not per day)
//   3. loaded, the world goes on as the unsaved one does (a day, then a week)
//   4. the other paths at 240 days -- the prepared village (prepare3), the lord's banner (lord3), the informed fighter
//      (fight2), the guard who does nothing (idle) -- valid, round-tripping, bounded
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { step, validateState } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";
import { playCareer } from "./measure/story-careers.mjs";

const SAVE_LIMIT = 32 * 1024;
const DAY = { type: "wait", minutes: 1440 };
const saved = (state) => JSON.stringify(buildSaveRecord("slot_long", state, { savedAt: 1 }));
const load = (json) => parseLoadedRecord(JSON.parse(json));
const days = (state, n) => {
  for (let i = 0; i < n; i += 1) state = step(state, DAY, worldData).state;
  return state;
};

function testAHerosLongCareer() {
  const mid = playCareer("hero", "inj-9", 0, 120);
  const end = playCareer("hero", "inj-9", 0, 240);
  assert.equal(end.row.fate, 1, "the name");
  assert.ok(end.row.dayRenown !== null, "the realm's name");
  assert.deepEqual(validateState(end.state), []);
  const json = saved(end.state);
  assert.deepEqual(load(json), end.state, "the save round-trips exactly");
  assert.ok(json.length < SAVE_LIMIT, `small: ${json.length} bytes`);
  const midBytes = saved(mid.state).length;
  assert.ok(json.length <= midBytes * 1.1, `not growing with the days: ${midBytes} -> ${json.length}`);
  // loaded, the world goes on as the unsaved one does
  const loaded = load(json);
  assert.deepEqual(days(loaded, 1), days(end.state, 1));
  assert.deepEqual(days(loaded, 7), days(end.state, 7));
}

function testTheOtherPaths() {
  for (const pol of ["prepare3", "lord3", "fight2", "idle"]) {
    const { state } = playCareer(pol, "history-41", 1, 240);
    assert.deepEqual(validateState(state), [], pol);
    const json = saved(state);
    assert.deepEqual(load(json), state, `${pol}: the save round-trips exactly`);
    assert.ok(json.length < SAVE_LIMIT, `${pol}: ${json.length} bytes`);
  }
}

testAHerosLongCareer();
testTheOtherPaths();
console.log("V2-Core-147 long-career-save.test.js: all checks passed");
