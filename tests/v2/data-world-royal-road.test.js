// V2-Core-88 (#217, Fantasy World Vertical Slice 8, step 1 -- the road to the royal city): through the ordinary
// step() API and the real pack. No engine change; additive content only (D-92/D-98):
//   from the far bank, five days north along the wide road (World Bible WB-0011/C-20) lies the royal city --
//   for one who has read the way on the waystation board (`rum_royal_city`). The first to arrive is told what
//   everyone there says: the seat of royal power, the realm's greatest market (once for the world). Its name,
//   dynasty, powers, size, history and inner structure are not decided (owner, WB-0023). The world does not
//   wait for the traveller: five days of caravans pass on the road behind. Travel time is a gameplay value
//   taken from the Canon distance.
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
// history-41: the dispersal, the crossing -- data-world-castle-town (stops at the far bank)
const TO_FAR_BANK = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross")
];
const READ_BOARD = P("act_read_waystation_board");
const NORTH = M("loc_royal_city");

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
const me = (state) => state.actors[state.player.actorId];

const farBank = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_FAR_BANK).state;
const knowsTheWay = run(farBank, [READ_BOARD]).state;

// 1. the way: only for one who has read it; five days; the first arrival told what everyone says
function testTheRoad() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(me(farBank).locationId, "loc_far_bank");
  assert.strictEqual(farBank.knowledge.player_1.rum_royal_city, undefined);
  assert.ok(rejected(farBank, NORTH), "the way unknown, no road north to it");
  assert.strictEqual(knowsTheWay.knowledge.player_1.rum_royal_city.claim, "five_days_north");
  const arrived = run(knowsTheWay, [NORTH]);
  assert.strictEqual(me(arrived.state).locationId, "loc_royal_city");
  assert.strictEqual(arrived.state.time.minute - knowsTheWay.time.minute, 7200, "five days on foot (WB-0011)");
  assert.ok(texts(arrived.log[0]).includes("txt_royal_city_first"), "the first arrival");
  assert.strictEqual(worldData.locations.loc_royal_city.name, "왕도", "a descriptive name only (WB-0023)");
  return arrived.state;
}

// 2. the world does not wait: five days of caravans behind the traveller
function testTheWorldMoves(arrived) {
  assert.ok((arrived.signals.caravan_visits ?? 0) > (knowsTheWay.signals.caravan_visits ?? 0), "caravans came while on the road");
  assert.strictEqual(arrived.facts.fact_realm_fair?.value, "known", "the realm's news went on");
  assert.deepStrictEqual(arrived.facts.fact_bandits_fate, knowsTheWay.facts.fact_bandits_fate, "the frontier's facts are as they were");
}

// 3. the way back: five days, and nothing asked; once for the world
function testBackAndAgain(arrived) {
  const back = run(arrived, [M("loc_far_bank")]);
  assert.strictEqual(me(back.state).locationId, "loc_far_bank");
  assert.strictEqual(back.state.time.minute - arrived.time.minute, 7200);
  const again = run(back.state, [NORTH]);
  assert.ok(!texts(again.log[0]).includes("txt_royal_city_first"), "told once, for the world");
  // a successor who knows nothing must read the way again; the first-arrival tale is not repeated
  let s = again.state;
  for (const to of ["loc_far_bank", "loc_river_ford", "loc_crossroads", "loc_village", "loc_ruins"]) s = run(s, [M(to)]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  const atBank = run(next, [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross")]).state;
  assert.ok(rejected(atBank, NORTH), "the way is knowledge, not inherited");
  const there = run(atBank, [READ_BOARD, NORTH]);
  assert.strictEqual(me(there.state).locationId, "loc_royal_city");
  assert.ok(!there.log.some((r) => texts(r).includes("txt_royal_city_first")));
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/royal_city/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [READ_BOARD, NORTH, M("loc_far_bank")];
  const end = run(farBank, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_royal_road", farBank, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, farBank);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_FAR_BANK).state, path).state, end, "the same input, the same world");
}

const arrived = testTheRoad();
testTheWorldMoves(arrived);
testBackAndAgain(arrived);
testSaveAndDeterminism();
console.log("V2-Core-88 data-world-royal-road.test.js: all checks passed");
