// V2-Core-69 (#170, Fantasy World Vertical Slice 3, step 2 -- the spring's tale): the purification
// becomes history, through the ordinary step() API and the real pack. No engine change; additive
// content only (D-92/D-93), the bandits' tale pattern (V2-Core-45/46, D-74's day clock):
//   `evt_well_tale` records `fact_well_fate` and counts `well_tale_age` 1..3 a day apart; the herbalist
//   tells the news while it is fresh and the market's legend after about two days; a search at the
//   purified spring sees the truth and corrects a believed legend; that character can tell her, once
//   for the world (+5 on their own edge), and from then on she tells everyone the truth.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// herb-30 (tests/v2/data-world-well-resolution.test.js): the remedy, then the purification
const SEED = "herb-30";
const TO_PURIFIED = [
  P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
  P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), M("loc_forest_spring"),
  P("act_purify_spring")
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
const start = (seed = SEED) => createInitialState({ worldSeed: seed, data: worldData }).state;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const claim = (state, rumorId) => state.knowledge?.[state.player.actorId]?.[rumorId]?.claim;
const offered = (state) => {
  const option = worldData.choices.choice_herbalist_dialogue.options.find((o) => o.id === "opt_herbalist_correct_legend");
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const ask = (state) => run(state, H("opt_herbalist_ask_sickness"));
const signalValue = (state) => state.signals?.well_tale_age;
// a successful search at the purified spring (find a roll)
function searchSucceeds(state) {
  for (let i = 0; i < 200; i += 1) {
    const r = step({ ...state, rng: start(`tale-roll-${i}`).rng }, P("act_search_spring"), worldData);
    if (r.events.find((e) => e.type === "check.resolved").data.tier === "success") return r;
  }
  assert.fail("no successful search found");
}

const purified = run(start(), TO_PURIFIED).state;

// 1. the clock: the fact on the purification's step, the age a day apart, until 3
function testClock() {
  assert.deepStrictEqual(validateData(worldData), []);
  const beforePurify = run(start(), TO_PURIFIED.slice(0, -1)).state;
  assert.strictEqual(beforePurify.facts?.fact_well_fate, undefined, "no history before the purification");
  assert.strictEqual(signalValue(beforePurify), undefined);
  assert.strictEqual(purified.facts.fact_well_fate.value, "purified");
  assert.strictEqual(signalValue(purified), 1);
  const atMarket = run(purified, [M("loc_village"), M("loc_market")]).state;
  assert.strictEqual(signalValue(atMarket), 1, "not yet a day");
  const day1 = run(atMarket, [DAY]).state;
  assert.strictEqual(signalValue(day1), 2);
  const day2 = run(day1, [DAY]).state;
  assert.strictEqual(signalValue(day2), 3);
  assert.strictEqual(signalValue(run(day2, [DAY, DAY]).state), 3, "it stops at 3");
  return { atMarket, day1, day2 };
}

// 2. the herbalist: the news while it is fresh, the market's legend afterwards
function testNewsThenLegend({ atMarket, day1, day2 }) {
  const fresh = ask(atMarket);
  assert.deepStrictEqual(texts(fresh.log[1]), ["txt_herbalist_sickness_passed"]);
  assert.strictEqual(claim(fresh.state, "rum_well_fate"), "purified");
  assert.deepStrictEqual(texts(ask(day1).log[1]), ["txt_herbalist_sickness_passed"], "a day on: still the news");
  const legend = ask(day2);
  assert.deepStrictEqual(texts(legend.log[1]), ["txt_herbalist_well_legend"]);
  assert.strictEqual(claim(legend.state, "rum_well_legend"), "spirit_appeased");
  assert.deepStrictEqual(legend.state.knowledge.player_1.rum_well_legend.sources, ["src_market_legend"]);
  assert.strictEqual(offered(legend.state), false, "a legend believed is not yet a truth seen");
  return legend.state;
}

// 3. the truth at the spring corrects the legend; telling her corrects the world's account
function testCorrection(believing) {
  const atSpring = run(believing, [M("loc_village"), M("loc_forest_spring")]).state;
  const seen = searchSucceeds(atSpring);
  assert.ok(texts(seen).includes("txt_search_spring_purified"));
  assert.ok(!texts(seen).includes("txt_search_spring_success"), "the carcass is buried");
  assert.strictEqual(claim(seen.state, "rum_well_legend"), "purified", "corrected first-hand");
  assert.ok(seen.state.knowledge.player_1.rum_well_legend.sources.includes("obs_loc_forest_spring"));
  assert.ok(seen.state.knowledge.player_1.rum_well_fate.sources.includes("obs_loc_forest_spring"), "the truth, first-hand");
  const back = run(seen.state, [M("loc_village"), M("loc_market")]).state;
  assert.ok(offered(back));
  const before = back.relations["npc_herbalist:player_1"].score;
  const told = run(back, H("opt_herbalist_correct_legend"));
  assert.deepStrictEqual(texts(told.log[1]), ["txt_herbalist_correct_legend"]);
  assert.strictEqual(told.state.flags.well_tale_corrected, true);
  assert.strictEqual(told.state.relations["npc_herbalist:player_1"].score, before + 5);
  assert.strictEqual(offered(told.state), false, "once for the world");
  // from now on the truth, for anyone
  assert.deepStrictEqual(texts(ask(told.state).log[1]), ["txt_herbalist_well_corrected"]);
  return told.state;
}

// 4. a successor: no knowledge, but the world's corrected account -- and, on an uncorrected world, the legend
function deathOf(state) {
  let s = run(state, [M("loc_village"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 5 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  return run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
}
function testSuccessor(corrected, believing) {
  const next = deathOf(corrected);
  assert.strictEqual(claim(next, "rum_well_legend"), undefined, "knowledge is not inherited");
  const heard = run(next, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]);
  assert.deepStrictEqual(texts(heard.log[2]), ["txt_herbalist_well_corrected"], "the world's corrected account");
  // on a world nobody corrected, the successor hears the legend and can correct it themselves
  const other = deathOf(believing);
  const legend = run(other, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]);
  assert.deepStrictEqual(texts(legend.log[2]), ["txt_herbalist_well_legend"]);
  const seen = searchSucceeds(run(legend.state, [M("loc_village"), M("loc_forest_spring")]).state);
  const told = run(seen.state, [M("loc_village"), M("loc_market"), ...H("opt_herbalist_correct_legend")]).state;
  assert.strictEqual(told.flags.well_tale_corrected, true);
  assert.strictEqual(told.relations["npc_herbalist:player_2"].score, 10, "on the successor's own edge: their first consultation and the correction");
}

// 5. save/load and determinism
function testSaveAndDeterminism(corrected) {
  assert.deepStrictEqual(validateState(corrected), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_tale", purified, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, purified);
  const path = [M("loc_village"), M("loc_market"), DAY, DAY, ...H("opt_herbalist_ask_sickness")];
  assert.deepStrictEqual(run(loaded, path).state, run(purified, path).state, "loaded, the same history");
  assert.deepStrictEqual(run(start(), TO_PURIFIED).state, purified, "the same input, the same world");
}

const days = testClock();
const believing = testNewsThenLegend(days);
const corrected = testCorrection(believing);
testSuccessor(corrected, believing);
testSaveAndDeterminism(corrected);

console.log("V2-Core-69 data-world-spring-tale.test.js: all checks passed");
