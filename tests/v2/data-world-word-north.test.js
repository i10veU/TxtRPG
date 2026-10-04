// V2-Core-80 (#198, Fantasy World Vertical Slice 6, step 1 -- the corrected word goes north): through the
// ordinary step() API and the real pack. No engine change; additive content only (D-92):
//   a correction made in the village (`bandits_tale_corrected`, `well_tale_corrected`) travels north with
//   the road's traffic: the first firing counts it out, the next one a caravan's cadence (three days) later
//   brings it to the castle town (`bandits_truth_north`, `well_truth_north`) -- only once the road is in
//   use. From then on the town's notice board tells the corrected account instead of the legend (World
//   Bible N-06, WB-0019 DC-03: news, corrections included, travels with the caravans). Tales stay in-world
//   accounts: the world's facts never change; the delay is a gameplay value.
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
const HOUR = { type: "wait", minutes: 60 };
// history-41: the dispersal, the crossing, the road north -- data-world-castle-town
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];

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
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const kn = (state, rumor) => state.knowledge?.player_1?.[rumor];
const factsOf = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate"].map((f) => [f, s.facts?.[f]?.value]));

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
// the stories have become legends (age 3), and the village has corrected both
const corrected = (() => {
  const s = structuredClone(town);
  s.signals.bandits_tale_age = 3;
  s.signals.well_tale_age = 3;
  s.facts.fact_well_fate = { value: "purified" };
  s.flags.bandits_tale_corrected = true;
  s.flags.well_tale_corrected = true;
  return s;
})();

// 1. the word's road: counted out at once, in the town a caravan's cadence later, and only then
function testDelay() {
  assert.deepStrictEqual(validateData(worldData), []);
  const first = run(corrected, [HOUR]).state;
  assert.strictEqual(first.signals.bandits_word_age, 1, "counted out");
  assert.strictEqual(first.signals.well_word_age, 1);
  assert.strictEqual(first.flags.bandits_truth_north, undefined, "not yet in the town");
  const twoDays = run(first, [DAY, DAY]).state;
  assert.strictEqual(twoDays.flags.bandits_truth_north, undefined, "two days: still on the road");
  assert.strictEqual(twoDays.flags.well_truth_north, undefined);
  const threeDays = run(twoDays, [DAY]).state;
  assert.strictEqual(threeDays.flags.bandits_truth_north, true, "three days: the correction reached the town");
  assert.strictEqual(threeDays.flags.well_truth_north, true);
  assert.strictEqual(threeDays.signals.bandits_word_age, 2);
  const later = run(threeDays, [DAY, DAY, DAY, DAY]).state;
  assert.strictEqual(later.signals.bandits_word_age, 2, "carried once");
  return threeDays;
}

// 2. only the road's traffic carries it: no walked road, no word north; no correction, nothing to carry
function testOnlyByTheRoad() {
  const noRoad = structuredClone(corrected);
  delete noRoad.flags.road_walked;
  const stuck = run(noRoad, [HOUR, DAY, DAY, DAY, DAY]).state;
  assert.strictEqual(stuck.signals.bandits_word_age, undefined);
  assert.strictEqual(stuck.flags.bandits_truth_north, undefined, "no road in use, no word north");
  assert.strictEqual(stuck.flags.well_truth_north, undefined);
  assert.strictEqual(stuck.signals.well_word_age, undefined);
  const uncorrected = structuredClone(corrected);
  delete uncorrected.flags.bandits_tale_corrected;
  delete uncorrected.flags.well_tale_corrected;
  const plain = run(uncorrected, [HOUR, DAY, DAY, DAY]).state;
  assert.strictEqual(plain.flags.bandits_truth_north, undefined, "nothing corrected, nothing carried");
  assert.strictEqual(plain.flags.well_truth_north, undefined);
  // one correction travels on its own
  const onlyWell = structuredClone(uncorrected);
  onlyWell.flags.well_tale_corrected = true;
  const well = run(onlyWell, [HOUR, DAY, DAY, DAY]).state;
  assert.strictEqual(well.flags.well_truth_north, true);
  assert.strictEqual(well.flags.bandits_truth_north, undefined);
}

// 3. the town's board: the legend until the word arrives, the corrected account after
function testTownTells(arrived) {
  const before = run(corrected, [P("act_read_castle_notices")]);
  assert.ok(texts(before.log[0]).includes("txt_castle_bandits_tale"), "the legend, before the word arrives");
  assert.ok(texts(before.log[0]).includes("txt_castle_well_tale"));
  const facts = factsOf(arrived);
  const after = run(arrived, [P("act_read_castle_notices")]);
  const t = texts(after.log[0]);
  assert.ok(t.includes("txt_castle_bandits_truth") && !t.includes("txt_castle_bandits_tale"), "the corrected account instead");
  assert.ok(t.includes("txt_castle_well_truth") && !t.includes("txt_castle_well_tale"));
  assert.strictEqual(kn(after.state, "rum_bandits_fate").claim, "dispersed");
  assert.ok(kn(after.state, "rum_bandits_fate").sources.includes("src_castle_town_talk"));
  assert.strictEqual(kn(after.state, "rum_well_fate").claim, "purified");
  assert.deepStrictEqual(factsOf(after.state), facts, "accounts never change the facts");
  const fresh = structuredClone(arrived);
  delete fresh.knowledge.player_1.rum_bandits_fate;
  delete fresh.knowledge.player_1.rum_well_fate;
  const told = run(fresh, [P("act_read_castle_notices")]).state;
  assert.strictEqual(kn(told, "rum_bandits_fate").confidence, 50, "surer than a legend, still far from first-hand");
  assert.strictEqual(kn(told, "rum_well_fate").confidence, 50);
  // the corrected account is told even before a legend would have formed
  const young = structuredClone(arrived);
  young.signals.bandits_tale_age = 1;
  assert.ok(texts(run(young, [P("act_read_castle_notices")]).log[0]).includes("txt_castle_bandits_truth"));
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/word_age|truth_north/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [HOUR, DAY, DAY, DAY, P("act_read_castle_notices")];
  const end = run(corrected, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_word", corrected, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, corrected);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(corrected, path).state, end, "the same input, the same world");
}

const arrived = testDelay();
testOnlyByTheRoad();
testTownTells(arrived);
testSaveAndDeterminism();
console.log("V2-Core-80 data-world-word-north.test.js: all checks passed");
