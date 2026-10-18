// V2-Core-156 (D-134): the chronicle's pure parts (storage/chronicle.js) and the pack's deeds and endings (ui/deeds.js).
//   1. a life record keeps its key, background (null when not known), start, baseline, deeds (once each), end and days;
//      an open life has no end yet; malformed lives are refused
//   2. firstTimes: of the deeds just done, the ones never done before
//   3. every deed and ending has its words; every ending's rumour is a rumour of the pack; deed ids are unique
//   4. a deed a predecessor did is not the successor's: what is true at a life's start is its baseline; an ending is
//      the ending rumour the character has just come to know
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { buildLifeRecord, firstTimes } from "../../web/v2/storage/chronicle.js";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";
import { deedsTrue, lifeDeeds, endingLearned } from "../../web/v2/ui/deeds.js";

// 1. records
const base = { key: "w_1:player_1", templateId: "start_wanderer", startMinute: 0, baseline: [], deeds: ["deed_spring", "deed_spring", "deed_honored"], end: "end_name", days: 23, endedAt: 5 };
assert.deepEqual(buildLifeRecord(base), { ...base, deeds: ["deed_spring", "deed_honored"] });
assert.equal(buildLifeRecord({ ...base, end: null }).endedAt, null, "a life still going on has not ended");
assert.throws(() => buildLifeRecord({ ...base, key: "" }), /key/);
assert.throws(() => buildLifeRecord({ ...base, templateId: "" }), /background/);
assert.equal(buildLifeRecord({ ...base, templateId: null }).templateId, null, "a life first found on loading an older save: its background is not known");
assert.throws(() => buildLifeRecord({ ...base, startMinute: -1 }), /began/);
assert.throws(() => buildLifeRecord({ ...base, days: 0 }), /day/);
assert.throws(() => buildLifeRecord({ ...base, end: "Not an id" }), /ending/);
assert.throws(() => buildLifeRecord({ ...base, deeds: ["Bad id"] }), /deeds/);

// 2. first times
assert.deepEqual(firstTimes(["deed_a", "deed_b", "deed_a"], ["deed_b"]), ["deed_a"]);
assert.deepEqual(firstTimes([], ["deed_b"]), []);

// 3. the pack's words
const T = worldData.texts;
const ids = worldData.world.deeds.map((d) => d.id);
assert.equal(new Set(ids).size, ids.length, "deed ids are unique");
assert.ok(ids.length >= 15);
for (const d of worldData.world.deeds) {
  assert.equal(typeof T[d.id], "string", `deed title ${d.id}`);
  assert.equal(typeof T[`${d.id}_desc`], "string", `deed words ${d.id}`);
}
assert.equal(worldData.world.endings.length, 4);
for (const e of worldData.world.endings) {
  assert.ok(worldData.rumors[e.rumor], `ending rumour ${e.rumor}`);
  assert.equal(typeof T[`${e.id}_title`], "string");
  assert.equal(typeof T[`${e.id}_body`], "string");
}
assert.equal(typeof T.end_died_title, "string");
assert.equal(typeof T.end_died_body, "string");
assert.equal(typeof T.end_died_after_body, "string", "a fall after the story closed");

// 4. a life's own deeds, and its ending
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const walk = (state, actions) => actions.reduce((s, a) => step(s, a, worldData).state, state);
let s = createInitialState({ worldSeed: "history-41", data: worldData }).state;
assert.deepEqual(deedsTrue(s, worldData), [], "a new world: nothing done");
const baseline = deedsTrue(s, worldData);
s = walk(s, [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins")]);
assert.deepEqual(lifeDeeds(s, worldData, baseline), ["deed_ruins_found"]);
assert.deepEqual(lifeDeeds(s, worldData, deedsTrue(s, worldData)), [], "a successor here: the ruins were found before it began");
const told = { [worldData.world.endings[1].rumor]: { rumorId: worldData.world.endings[1].rumor } };
assert.equal(endingLearned({}, told, worldData)?.id, worldData.world.endings[1].id);
assert.equal(endingLearned(told, told, worldData), null, "known before: not learned now");

console.log("V2-Core-156 chronicle.test.js: all checks passed");
