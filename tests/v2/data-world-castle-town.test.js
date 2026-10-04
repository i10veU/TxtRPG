// V2-Core-76 (#189, Fantasy World Vertical Slice 5, step 1 -- the road north and the castle town):
// through the ordinary step() API and the real pack. No engine change; additive content only (D-92):
//   from the far bank the wide road leads north to the lord's castle town (World Bible N-02; delegated
//   decision WB-0019); the first arrival is narrated once for the world; the town's notice board posts the
//   lord's decree at its source, and the frontier's news only as the information gradient allows (N-06) --
//   nothing before the caravans have carried it north, then only the legends (low confidence, uncorrected
//   even where the village corrected them), and the frontier's hero only by an epithet, never a name (G-04).
//   The tales are in-world belief, not truth: they never set a fact.
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
const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal (the leader lives) -- data-world-crossroads / data-world-river-ford
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
const TO_FAR_BANK = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), ...FERRY("opt_ferryman_cross")];

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
const kn = (state, rumor) => state.knowledge?.player_1?.[rumor];

const farBank = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FAR_BANK]).state;

// 1. the road north: only from the far bank; a long walk; the first arrival once for the world
function testRoad() {
  assert.deepStrictEqual(validateData(worldData), []);
  const into = Object.entries(worldData.locations).filter(([, l]) => l.links.some((k) => k.to === "loc_castle_town")).map(([id]) => id);
  assert.deepStrictEqual(into, ["loc_far_bank"], "the castle town is reached only by the road from the far bank");
  assert.strictEqual(farBank.actors.player_1.locationId, "loc_far_bank");
  const went = run(farBank, [M("loc_castle_town")]);
  assert.strictEqual(went.state.actors.player_1.locationId, "loc_castle_town");
  assert.strictEqual(went.state.time.minute - farBank.time.minute, 720);
  assert.ok(texts(went.log[0]).includes("txt_castle_town_first"));
  const again = run(went.state, [M("loc_far_bank"), M("loc_castle_town")]);
  assert.strictEqual(again.state.time.minute - went.state.time.minute, 1440, "and back the same road");
  assert.ok(!texts(again.log[1]).includes("txt_castle_town_first"), "the first arrival is once for the world");
  assert.strictEqual(rejected(farBank, P("act_read_castle_notices")), "requirements_not_met", "in the castle town");
  return went.state;
}

// 2. the lord's decree, at its source: read as written, without needing the frontier's news (no fact set)
function testDecree(town) {
  const early = structuredClone(town);
  delete early.facts.fact_realm_levy;
  delete early.knowledge.player_1.rum_realm_levy;
  const read = run(early, [P("act_read_castle_notices")]);
  assert.strictEqual(texts(read.log[0])[0], "txt_castle_levy_decree");
  assert.strictEqual(kn(read.state, "rum_realm_levy").confidence, 80);
  assert.deepStrictEqual(kn(read.state, "rum_realm_levy").sources, ["obs_loc_castle_town"]);
  assert.strictEqual(read.state.facts.fact_realm_levy, undefined, "reading the decree does not make the frontier's news");
  assert.strictEqual(read.state.time.minute - early.time.minute, 20);
}

// 3. the frontier's news: nothing before the caravans carried it north; then only the legends, low and
// uncorrected; the hero by an epithet. In-world belief: no fact changes.
function testFrontierNews(town) {
  const before = structuredClone(town);
  delete before.signals.caravan_visits;
  const quiet = run(before, [P("act_read_castle_notices")]);
  assert.deepStrictEqual(texts(quiet.log[0]), ["txt_castle_levy_decree", "txt_castle_no_frontier_news"]);

  const heard = structuredClone(town);
  heard.signals.caravan_visits = 1;
  heard.signals.bandits_tale_age = 3;
  heard.signals.well_tale_age = 3;
  heard.flags.village_honored = true;
  heard.flags.bandits_tale_corrected = true; // the village told it right ...
  heard.flags.well_tale_corrected = true;
  heard.facts.fact_well_fate = { value: "purified" };
  const factsBefore = structuredClone(heard.facts);
  const told = run(heard, [P("act_read_castle_notices")]);
  assert.deepStrictEqual(texts(told.log[0]), ["txt_castle_levy_decree", "txt_castle_bandits_tale", "txt_castle_well_tale", "txt_castle_epithet"]);
  for (const r of ["rum_bandits_legend", "rum_well_legend"]) {
    // ... but the correction has not travelled: the town has the legend
    assert.ok(kn(told.state, r).sources.includes("src_castle_town_talk"), r);
  }
  assert.strictEqual(kn(told.state, "rum_bandits_legend").claim, "slain");
  assert.strictEqual(kn(told.state, "rum_well_legend").claim, "spirit_appeased");
  assert.deepStrictEqual(told.state.facts, factsBefore, "a tale is belief, not truth: no fact changes");

  const fresh = structuredClone(heard);
  delete fresh.knowledge.player_1.rum_bandits_legend;
  delete fresh.knowledge.player_1.rum_well_legend;
  const low = run(fresh, [P("act_read_castle_notices")]).state;
  assert.strictEqual(kn(low, "rum_bandits_legend").confidence, 30, "low: a tale from far away");
  assert.strictEqual(kn(low, "rum_well_legend").confidence, 30);

  // the stories have not yet become legends: the caravans carried nothing the town would retell
  const young = structuredClone(heard);
  young.signals.bandits_tale_age = 2;
  young.signals.well_tale_age = 2;
  delete young.flags.village_honored;
  assert.deepStrictEqual(texts(run(young, [P("act_read_castle_notices")]).log[0]), ["txt_castle_levy_decree"]);
}

// 4. the natural road: the caravan that came when the road was walked carries the news north
function testNaturalRoad(town) {
  assert.strictEqual(town.signals.caravan_visits, 1, "the first caravan came with the first walker");
  const later = run(town, [DAY, DAY, DAY, P("act_read_castle_notices")]);
  const t = texts(later.log[3]);
  assert.strictEqual(t[0], "txt_castle_levy_decree");
  assert.ok(!t.includes("txt_castle_no_frontier_news"), "the caravans went north");
  assert.ok(t.includes("txt_castle_bandits_tale"), "the dispersal became a legend and travelled");
  assert.ok(!t.includes("txt_castle_epithet"), "nobody was honoured in this world");
}

// 5. save compatibility and determinism
function testSaveAndDeterminism(town) {
  assert.ok(!/castle/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [M("loc_castle_town"), P("act_read_castle_notices"), DAY, P("act_read_castle_notices")];
  const end = run(farBank, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_town", farBank, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, farBank);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FAR_BANK]).state, path).state, end, "the same input, the same world");
  assert.strictEqual(town.actors.player_1.locationId, "loc_castle_town");
}

const town = testRoad();
testDecree(town);
testFrontierNews(town);
testNaturalRoad(town);
testSaveAndDeterminism(town);
console.log("V2-Core-76 data-world-castle-town.test.js: all checks passed");
