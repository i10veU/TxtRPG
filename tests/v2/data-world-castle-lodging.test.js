// V2-Core-100 (#244, RPG Depth 2, step 2 -- a bed in the castle town): through the ordinary step() API and the real
// pack. No engine change; additive content only (D-92/D-101):
//   in the castle town a guard can pay two silver for a night under a roof -- the village's rest (hp +4, stamina
//   refilled), for silver and a night instead of the long walk home. The village stays free: it is home. A night does
//   not close a road wound; only the herbalist's salve does, so a wound still sends a guard south.
//   1. where it is, and what it costs;
//   2. a road wound stays, and the night says so;
//   3. natural play: the honoured scout, her stamina spent on three escorts, rests in the town for two silver and
//      takes the next caravan from there -- days sooner than the walk home, the silver earned on the road spent on it;
//   4. save compatibility (the start is the same without it) and determinism.
// The bed is Provisional (no name, no keeper, nothing of the town's inner structure); price and time are gameplay
// values. No Canon.
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
const REST = P("act_rest_village");
const LODGE = P("act_lodge_castle_town");
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BACK_AND_WAIT = [M("loc_castle_town"), DAY, DAY, DAY];
// integrated-36, the honoured scout of Slice 3 -- data-world-guard-career
const SCOUT_HONOURED = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"), P("act_talk_herbalist"), C("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_report_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), ...E("opt_village_honor")
];
const TO_TOWN_BY_LETTER = [M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
const SCOUT_TO_TOWN = [REST, ...E("opt_ask_region"), ...E("opt_elder_letter"), ...TO_TOWN_BY_LETTER];
const THREE_ESCORTS = [...ESCORT, ...BACK_AND_WAIT, ...ESCORT, ...BACK_AND_WAIT, ...ESCORT, M("loc_castle_town")];
const WALK_HOME_AND_BACK = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), REST, ...TO_TOWN_BY_LETTER];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const stamina = (s) => growth(s).resources.stamina.current;

const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
const spent = play(scoutInTown, THREE_ESCORTS).state;

// 1. where it is, and what it costs
function testBed() {
  assert.deepStrictEqual(validateData(worldData), []);
  const tired = structuredClone(spent);
  me(tired).hp.current = me(tired).hp.max - 6;
  const night = play(tired, [LODGE]);
  assert.deepStrictEqual(night.said, ["txt_lodge_castle_town"]);
  assert.strictEqual(me(tired).money - me(night.state).money, 2, "two silver");
  assert.strictEqual(me(night.state).hp.current - me(tired).hp.current, 4, "the village's rest");
  assert.strictEqual(stamina(tired), 0);
  assert.strictEqual(stamina(night.state), 6, "refilled");
  assert.strictEqual(night.state.time.minute - tired.time.minute, 480, "a night");
  assert.strictEqual(me(play(night.state, [LODGE]).state).hp.current, me(night.state).hp.max, "two short of max: capped at max");
  // only in the castle town; only with the silver
  const poor = structuredClone(spent);
  me(poor).money = 1;
  assert.strictEqual(rejected(poor, LODGE), "requirements_not_met", "one silver is not enough");
  assert.strictEqual(rejected(play(spent, [M("loc_far_bank")]).state, LODGE), "requirements_not_met", "not at the far bank");
  const village = play(spent, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")]).state;
  assert.strictEqual(rejected(village, LODGE), "requirements_not_met", "not in the village");
  // the village stays free
  const home = play(village, [REST]).state;
  assert.strictEqual(me(home).money, me(village).money, "home costs nothing");
  assert.strictEqual(stamina(home), 6);
}

// 2. a mild road wound closes with the night, and the night says so (V2-Core-121, Death & Injury: it used to stay until the salve --
// the owner's change); the salve is still the herbalist's. A deep wound is data-world-deep-wound.test.js's
function testWoundCloses() {
  const hurt = structuredClone(spent);
  growth(hurt).traits = { ...(growth(hurt).traits ?? {}), road_wound: true };
  const night = play(hurt, [LODGE]);
  assert.deepStrictEqual(night.said, ["txt_lodge_castle_town", "txt_rest_wound_closes"]);
  assert.strictEqual(growth(night.state).traits.road_wound, undefined, "a night closes a mild wound");
  assert.strictEqual(rejected(night.state, P("act_treat_road_wound")), "requirements_not_met", "no salve in the town, and nothing left to treat");
}

// 3. natural play: rest in the town, take the next caravan from there
function testScoutStays() {
  // the fourth caravan comes while she is spent
  let s = spent;
  while ((s.signals.guards_owed ?? 0) < 1) s = play(s, [DAY]).state;
  assert.strictEqual(stamina(s), 0, "three escorts spent her");
  assert.strictEqual(rejected(play(s, [ESCORT[0]]).state, ESCORT[1]), "requirements_not_met", "work, but too tired to take the road");
  // stay: a night in the town, and the road from there
  const stayed = play(s, [LODGE, ...ESCORT]);
  assert.strictEqual(stayed.state.signals.guards_hired, 4);
  assert.strictEqual(me(s).money - me(play(s, [LODGE]).state).money, 2, "the silver the road earned, spent on staying near it");
  // or walk home to rest: the same escort, a day later and for nothing
  const walked = play(s, [...WALK_HOME_AND_BACK, ...ESCORT]);
  assert.strictEqual(walked.state.signals.guards_hired, 4, "the share waits for her");
  const lodgeTime = play(s, [LODGE]).state.time.minute - s.time.minute;
  const walkTime = play(s, WALK_HOME_AND_BACK).state.time.minute - s.time.minute;
  assert.strictEqual(lodgeTime, 480);
  assert.ok(walkTime > 2 * 720, `the walk home and back (${walkTime} minutes) is longer than two escorts`);
  assert.strictEqual(me(play(s, WALK_HOME_AND_BACK).state).money, me(s).money, "the walk is free");
  return stayed.state;
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  // additive: the start is the same without the bed, for both backgrounds (D-92)
  const without = structuredClone(worldData);
  delete without.actions.act_lodge_castle_town;
  delete without.texts.txt_lodge_castle_town;
  delete without.texts.txt_lodge_wound_stays;
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "lodging-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "lodging-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const rest = [LODGE, DAY, ...ESCORT, M("loc_castle_town"), LODGE];
  const end = play(spent, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_lodging", spent, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, spent);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state,
    [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...THREE_ESCORTS, ...rest]).state;
  assert.deepStrictEqual(again, end, "the same input, the same world");
}

testBed();
testWoundCloses();
testScoutStays();
testSaveAndDeterminism();
console.log("V2-Core-100 data-world-castle-lodging.test.js: all checks passed");
