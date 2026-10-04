// V2-Core-81 (#198, Fantasy World Vertical Slice 6, step 2 -- the carrier): through the ordinary step() API
// and the real pack. No engine change; additive content only (D-92/D-96):
//   one who heard the legend and saw the truth (their legend corrected -- the same test the village's own
//   corrections use) can tell it at the castle town's board ("폐허에서 본 것" / "샘에서 본 것"): the
//   correction is in the town at once, ahead of the caravans (`bandits_truth_north`, `well_truth_north`),
//   even if the village itself never heard it. The town then tells the corrected account. A legend heard
//   far away (low confidence) does not overwrite what the carrier saw (D-14). Who carried the word is
//   player-dependent history; the world's facts never change.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal; two days on the legend; heard from the elder; the truth seen at the ruins
// (the character's legend corrected to "dispersed") -- the world-tale path, without telling the elder
const TO_SEEN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), DAY, DAY,
  ...E("opt_ask_bandit_news"), P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village")
];
const TO_TOWN = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const factsOf = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate"].map((f) => [f, s.facts?.[f]?.value]));

const seen = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_SEEN).state;
const atTown = run(seen, TO_TOWN).state;

// 1. the carrier: one whose own legend was corrected; the village never told
function testCarrier() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(seen.knowledge.player_1.rum_bandits_legend.claim, "dispersed", "the legend corrected by what was seen");
  assert.strictEqual(seen.flags.bandits_tale_corrected, undefined, "the village never heard the correction");
  assert.strictEqual(atTown.flags.bandits_truth_north, undefined, "nor has the town");
  // the town's legend (confidence 30) does not overwrite what the carrier saw
  const read = run(atTown, [P("act_read_castle_notices")]);
  assert.ok(texts(read.log[0]).includes("txt_castle_bandits_tale"), "the town still tells the legend");
  assert.strictEqual(read.state.knowledge.player_1.rum_bandits_legend.claim, "dispersed");
  // the telling
  const facts = factsOf(read.state);
  const told = run(read.state, [P("act_tell_town_ruins")]);
  assert.deepStrictEqual(texts(told.log[0]), ["txt_town_told_ruins"]);
  assert.strictEqual(told.state.flags.bandits_truth_north, true, "in the town at once");
  assert.strictEqual(told.state.time.minute - read.state.time.minute, 20);
  assert.deepStrictEqual(factsOf(told.state), facts, "the facts never change");
  assert.strictEqual(told.state.flags.bandits_tale_corrected, undefined, "the town's word is not the village's");
  // once told, not again; the board now tells the corrected account
  assert.strictEqual(rejected(told.state, P("act_tell_town_ruins")), "requirements_not_met");
  const after = run(told.state, [P("act_read_castle_notices")]);
  assert.ok(texts(after.log[0]).includes("txt_castle_bandits_truth"));
  return told.state;
}

// 2. who can carry: only one who saw it, only in the town, only while the town lacks it
function testWhoCanCarry() {
  const farBank = run(atTown, [M("loc_far_bank")]).state;
  assert.strictEqual(rejected(farBank, P("act_tell_town_ruins")), "requirements_not_met", "in the castle town");
  const heardOnly = structuredClone(atTown);
  heardOnly.knowledge.player_1.rum_bandits_legend.claim = "slain"; // heard the legend, never saw the truth
  assert.strictEqual(rejected(heardOnly, P("act_tell_town_ruins")), "requirements_not_met", "only one who saw the truth");
  const never = structuredClone(atTown);
  delete never.knowledge.player_1.rum_bandits_legend;
  assert.strictEqual(rejected(never, P("act_tell_town_ruins")), "requirements_not_met");
  const already = structuredClone(atTown);
  already.flags.bandits_truth_north = true; // the caravans brought it first
  assert.strictEqual(rejected(already, P("act_tell_town_ruins")), "requirements_not_met", "nothing left to carry");
  // the spring: the same, for one whose spring legend was corrected
  assert.strictEqual(rejected(atTown, P("act_tell_town_spring")), "requirements_not_met", "this one never saw the spring");
  const springSeen = structuredClone(atTown);
  springSeen.knowledge.player_1.rum_well_legend = { rumorId: "rum_well_legend", factId: "fact_well_fate", claim: "purified", source: "obs_loc_forest_spring", sources: ["obs_loc_forest_spring"], confidence: 90, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const spring = run(springSeen, [P("act_tell_town_spring")]);
  assert.deepStrictEqual(texts(spring.log[0]), ["txt_town_told_spring"]);
  assert.strictEqual(spring.state.flags.well_truth_north, true);
  assert.strictEqual(spring.state.flags.bandits_truth_north, undefined, "each story on its own");
  assert.strictEqual(rejected(spring.state, P("act_tell_town_spring")), "requirements_not_met");
}

// 3. the world remembers what was carried: a successor, knowing nothing, hears the corrected account
function testSuccessorHears(told) {
  let s = told;
  // back down to the village, then to the ruins until the end
  for (const to of ["loc_far_bank", "loc_river_ford", "loc_crossroads", "loc_village", "loc_ruins"]) s = run(s, [M(to)]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.flags.bandits_truth_north, true, "a world record, not a memory");
  const there = run(next, [...TO_TOWN, P("act_read_castle_notices")]);
  assert.ok(texts(there.log.at(-1)).includes("txt_castle_bandits_truth"), "the successor hears the corrected account in the town");
  assert.strictEqual(there.state.knowledge.player_2.rum_bandits_fate.claim, "dispersed");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const path = [P("act_read_castle_notices"), P("act_tell_town_ruins"), P("act_read_castle_notices")];
  const end = run(atTown, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_carrier", atTown, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, atTown);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_SEEN).state, TO_TOWN).state, path).state, end, "the same input, the same world");
}

const told = testCarrier();
testWhoCanCarry();
testSuccessorHears(told);
testSaveAndDeterminism();
console.log("V2-Core-81 data-world-carrier.test.js: all checks passed");
