// V2-Core-82 (#198, Fantasy World Vertical Slice 6, step 3 -- the echo): through the ordinary step() API
// and the real pack. No engine change; additive content only (D-92/D-96):
//   what the castle town says of the frontier comes back south with the next caravan (a round trip,
//   `caravan_visits` >= 2). The ferryman relays it: the legend while the town still tells it (low
//   confidence; it never overwrites what a character saw, D-14), the corrected account once the correction
//   reached the town (`*_truth_north`). Where the village (the elder) or the market (the herbalist) has
//   corrected a story the town still tells as the legend, they say so -- a reason to carry the truth north
//   oneself (V2-Core-81). Tales are in-world accounts: the world's facts never change; the round-trip
//   threshold is a gameplay value.
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
const FERRY = [P("act_talk_ferryman"), C("opt_ferryman_news")];
const HERB = [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")];
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
const ECHO = /^txt_ferryman_north_/;

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
// a world state: both stories legends (age 3), the spring purified, at `place`, after `visits` caravans
const world = (place, visits, extra = {}) => {
  const s = structuredClone(town);
  s.actors.player_1.locationId = place;
  s.signals.caravan_visits = visits;
  s.signals.bandits_tale_age = 3;
  s.signals.well_tale_age = 3;
  s.facts.fact_well_fate = { value: "purified" };
  s.cases.case_fouled_well = { stage: "resolved", since: 0 };
  Object.assign(s.flags, extra);
  for (const rumor of ["rum_bandits_fate", "rum_bandits_legend", "rum_well_fate", "rum_well_legend"]) delete s.knowledge.player_1[rumor];
  return s;
};
const echoes = (state) => texts(run(state, FERRY).log[1]).filter((t) => ECHO.test(t));

// 1. the ferryman: the town's talk, back with a caravan's round trip
function testFerryman() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(town.signals.caravan_visits, 1, "one caravan came down; none has gone up and back");
  assert.deepStrictEqual(echoes(world("loc_river_ford", 1)), [], "one caravan: nothing has come back yet");
  // the legend, as the town tells it
  const legend = world("loc_river_ford", 2);
  const told = run(legend, FERRY);
  const t = texts(told.log[1]);
  assert.deepStrictEqual(t.filter((x) => ECHO.test(x)), ["txt_ferryman_north_bandits_tale", "txt_ferryman_north_well_tale"]);
  assert.ok(t.indexOf("txt_ferryman_north_bandits_tale") > t.indexOf("txt_ferryman_leader_fell"), "after his own news");
  assert.strictEqual(kn(told.state, "rum_bandits_legend").claim, "slain");
  assert.strictEqual(kn(told.state, "rum_bandits_legend").confidence, 30, "talk twice removed");
  assert.ok(kn(told.state, "rum_bandits_legend").sources.includes("npc_ferryman"));
  assert.strictEqual(kn(told.state, "rum_well_legend").claim, "spirit_appeased");
  assert.strictEqual(kn(told.state, "rum_well_legend").confidence, 30);
  assert.deepStrictEqual(factsOf(told.state), factsOf(legend), "accounts never change the facts");
  // the corrected account, once the correction reached the town
  const truth = run(world("loc_river_ford", 2, { bandits_truth_north: true, well_truth_north: true }), FERRY);
  assert.deepStrictEqual(texts(truth.log[1]).filter((x) => ECHO.test(x)), ["txt_ferryman_north_bandits_truth", "txt_ferryman_north_well_truth"]);
  assert.strictEqual(kn(truth.state, "rum_bandits_fate").claim, "dispersed");
  assert.strictEqual(kn(truth.state, "rum_bandits_fate").confidence, 50);
  assert.strictEqual(kn(truth.state, "rum_well_fate").claim, "purified");
  assert.strictEqual(kn(truth.state, "rum_bandits_legend"), undefined, "no legend learned with it");
  assert.deepStrictEqual(factsOf(truth.state), factsOf(legend), "nor does the corrected account");
  // each story on its own; a story not yet a legend, and not corrected, is not told up north
  assert.deepStrictEqual(echoes(world("loc_river_ford", 2, { bandits_truth_north: true })), ["txt_ferryman_north_bandits_truth", "txt_ferryman_north_well_tale"]);
  const young = world("loc_river_ford", 3);
  young.signals.bandits_tale_age = 2;
  assert.deepStrictEqual(echoes(young), ["txt_ferryman_north_well_tale"]);
  delete young.signals.well_tale_age;
  assert.deepStrictEqual(echoes(young), []);
  // a legend heard so far away does not overwrite what a character saw (D-14)
  const seen = world("loc_river_ford", 2);
  seen.knowledge.player_1.rum_bandits_legend = { rumorId: "rum_bandits_legend", factId: "fact_bandits_fate", claim: "dispersed", source: "obs_loc_ruins", sources: ["obs_loc_ruins"], confidence: 80, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const kept = run(seen, FERRY).state;
  assert.strictEqual(kn(kept, "rum_bandits_legend").claim, "dispersed");
  assert.strictEqual(kn(kept, "rum_bandits_legend").confidence, 80);
}

// 2. the village and the market: "up north they still tell the legend" -- while they do
function testStillTold() {
  const elder = (visits, extra) => texts(run(world("loc_village", visits, extra), E("opt_ask_bandit_news")).log[1]);
  const herbalist = (visits, extra) => texts(run(world("loc_market", visits, extra), HERB).log[1]);
  assert.ok(elder(2, { bandits_tale_corrected: true }).includes("txt_elder_north_legend"));
  assert.ok(elder(2, { bandits_tale_corrected: true }).includes("txt_bandit_news_corrected"), "after the corrected account");
  assert.ok(!elder(1, { bandits_tale_corrected: true }).includes("txt_elder_north_legend"), "nothing has come back yet");
  assert.ok(!elder(2, { bandits_tale_corrected: true, bandits_truth_north: true }).includes("txt_elder_north_legend"), "the town tells it rightly now");
  assert.ok(!elder(2, {}).includes("txt_elder_north_legend"), "the village tells the legend itself");
  assert.ok(!elder(2, { well_tale_corrected: true }).includes("txt_elder_north_legend"), "each story on its own");
  assert.ok(herbalist(2, { well_tale_corrected: true }).includes("txt_herbalist_north_legend"));
  assert.ok(herbalist(2, { well_tale_corrected: true }).includes("txt_herbalist_well_corrected"));
  assert.ok(!herbalist(1, { well_tale_corrected: true }).includes("txt_herbalist_north_legend"));
  assert.ok(!herbalist(2, { well_tale_corrected: true, well_truth_north: true }).includes("txt_herbalist_north_legend"));
  assert.ok(!herbalist(2, {}).includes("txt_herbalist_north_legend"));
  assert.ok(!herbalist(2, { bandits_tale_corrected: true }).includes("txt_herbalist_north_legend"));
  // fresh news, never corrected: nothing to say of the north
  const fresh = (place, extra) => { const s = world(place, 2, extra); s.signals.bandits_tale_age = 1; s.signals.well_tale_age = 1; return s; };
  assert.ok(!texts(run(fresh("loc_village", {}), E("opt_ask_bandit_news")).log[1]).includes("txt_elder_north_legend"));
  assert.ok(!texts(run(fresh("loc_market", {}), HERB).log[1]).includes("txt_herbalist_north_legend"));
  const facts = factsOf(world("loc_village", 2));
  assert.deepStrictEqual(factsOf(run(world("loc_village", 2, { bandits_tale_corrected: true }), E("opt_ask_bandit_news")).state), facts);
}

// 3. the world moves on: the caravans carry the correction north, and the echo turns with it
function testTheWordArrives() {
  const corrected = world("loc_village", 2, { bandits_tale_corrected: true });
  assert.ok(texts(run(corrected, E("opt_ask_bandit_news")).log[1]).includes("txt_elder_north_legend"));
  const later = run(corrected, [HOUR, DAY, DAY, DAY]).state;
  assert.strictEqual(later.flags.bandits_truth_north, true, "the caravans carried it");
  assert.ok(!texts(run(later, E("opt_ask_bandit_news")).log[1]).includes("txt_elder_north_legend"), "and the elder stops saying it");
  let ford = later;
  for (const to of ["loc_crossroads", "loc_river_ford"]) ford = run(ford, [M(to)]).state;
  assert.ok(echoes(ford).includes("txt_ferryman_north_bandits_truth"), "the ferryman hears the corrected account back");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/north/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const start = world("loc_river_ford", 2, { bandits_tale_corrected: true });
  const path = [...FERRY, M("loc_crossroads"), M("loc_village"), ...E("opt_ask_bandit_news"), HOUR, DAY, DAY, DAY, ...E("opt_ask_bandit_news")];
  const end = run(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_echo", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start, path).state, end, "the same input, the same world");
}

testFerryman();
testStillTold();
testTheWordArrives();
testSaveAndDeterminism();
console.log("V2-Core-82 data-world-echo.test.js: all checks passed");
