// V2-Core-109/116 (#265/#282, what a long absence costs): through the ordinary step() API and the real pack. No new
// rule; the cap on owed shares is THREE on the honest clock (D-104/D-107; one on the old clock -- see the pins of
// data-world-caravans-wait). Measured, a guard who is up to date:
//   1. a steady career loses nothing under the cap -- staying in town, or walking home to rest (the walk fits inside the
//      wait: the next caravan is three days away);
//   2. the royal journey (far bank -> five days -> the royal city's market -> five days back: 11 days): four caravans
//      passed (the honest clock, D-107), three are still owed and one left -- and the clerk says so;
//   3. against staying home for the same days (four convoys guarded, 28 silver) the journey brings three jobs on return
//      (21 silver): the journey's price is one job, not a penalty;
//   4. save/load on the road and determinism.
// A long move is one step, and the caravans catch up on it (`catchUp`, D-107): a five-day walk counts the caravans that
// passed. The guard is staged strong and rested (the escort's outcome is not what this is about). The words are
// Provisional. No Canon.
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
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const LEFT = "txt_guild_clerk_left_without";
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const JOURNEY = [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town")];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const strong = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = play(t, [HOUR]).state; assert.ok(wanted(t), "a convoy wants a guard"); return t; };
// one convoy guarded, back in town
const guard = (s) => play(play(strong(waitForConvoy(s)), ESCORT).state, [M("loc_castle_town")]).state;

// the guard, up to date: six convoys taken (the first three settled, three later ones), none owed, none lost
const start = (() => { let s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; for (let i = 0; i < 6; i += 1) s = guard(s); return s; })();

// 1. staying, with a rest trip home now and then: nothing lost
function testSteady() {
  assert.strictEqual(sig(start, "guards_hired"), 6);
  assert.strictEqual(sig(start, "guards_owed"), 0);
  assert.strictEqual(sig(start, "caravans_unguarded"), 0);
  const REST_TRIP = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), P("act_rest_village"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
  let s = start;
  for (let i = 0; i < 6; i += 1) { s = guard(s); if (i % 2 === 1) s = play(s, REST_TRIP).state; }
  assert.strictEqual(sig(s, "caravans_unguarded"), 0, "a steady career, with rest trips home, loses none");
}

// 2. the royal journey
function testJourney() {
  const back = play(start, JOURNEY);
  const days = (back.state.time.minute - start.time.minute) / 1440;
  assert.ok(days > 10.5 && days < 11.5, `eleven days away (${days})`);
  assert.strictEqual(sig(back.state, "caravan_visits") - sig(start, "caravan_visits"), 4, "four caravans came: the clock is honest (D-107)");
  assert.strictEqual(sig(back.state, "guards_owed"), 3, "three are still owed a guard (the cap)");
  assert.strictEqual(sig(back.state, "caravans_unguarded"), 1, "and one left with another guard");
  assert.ok(play(back.state, ASK).said.includes(LEFT), "the clerk tells why");
  return back.state;
}

// 3. against staying home for the same days
function testPrice(back) {
  const span = back.time.minute - start.time.minute;
  let stay = start;
  let jobs = 0;
  const money0 = me(stay).money;
  while (stay.time.minute - start.time.minute < span) { stay = guard(stay); jobs += 1; }
  assert.strictEqual(jobs, 4, "four convoys guarded in the same days");
  assert.strictEqual(sig(stay, "caravans_unguarded"), 0);
  assert.strictEqual(me(stay).money - money0, 28, "28 silver");
  // the journey: the three shares the cap kept are three jobs on return (the fourth caravan left): the journey's price is
  // one job, 7 silver -- the jobs, not a penalty
  let s = back;
  const m0 = me(s).money;
  for (let n = 0; n < 3; n += 1) s = play(play(strong(s), ESCORT).state, [M("loc_castle_town")]).state;
  assert.strictEqual(me(s).money - m0, 21, "three jobs, 21 silver, against the four convoys' 28");
  assert.strictEqual(sig(s, "guards_owed") <= 1, true, "the shares are taken (a caravan that came meanwhile may wait)");
}

// 4. save/load on the road, determinism
function testSaveAndDeterminism() {
  const onRoad = play(start, JOURNEY.slice(0, 3)).state;
  const rest = JOURNEY.slice(3);
  const end = play(onRoad, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_journey", onRoad, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, onRoad);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded on the road, the same end");
  assert.deepStrictEqual(play(start, JOURNEY).state, end, "the same input, the same world");
  assert.deepStrictEqual(validateData(worldData), []);
}

testSteady();
const back = testJourney();
testPrice(back);
testSaveAndDeterminism();
console.log("V2-Core-109 data-world-journey-cost.test.js: all checks passed");
