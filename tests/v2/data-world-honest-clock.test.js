// V2-Core-116 (#282 World Simulation 3 -- an honest clock, step 2): through the ordinary step() API and the real pack.
// The engine's `catchUp` (V2-Core-115, D-107) is switched on where the world's cadence is a duration; the cap on owed
// shares is back at three, on the measurements made on this clock (#285). What is pinned here, apart from the caravan
// pins that moved (data-world-caravans-wait / -journey-cost / -road-lives / -long-road / -guard-living /
// -road-did-not-wait):
//   1. which events catch up: the caravans, the three words that travel with them, the two tales that age by the day;
//      not the flour's demand and stock (a replenishment capped by its own trigger, where catching up would stock
//      several sacks);
//   2. the clock is honest: however the days are spent -- one long move, short waits, escorts -- the caravans counted are
//      the caravans that passed: count = 1 + floor((now - the first caravan) / 4320), and the cadence keeps its phase;
//   3. a long step counts its caravans one by one, the cap clamping at each: four caravans in the royal journey from an
//      up-to-date guard leave three owed and one gone, the same as the four a stepwise wait leaves;
//   4. compatibility: a new game is the same start with the field off; an old save's `lastMinute` becomes the cadence's
//      origin and the world runs on deterministically; save/load and determinism.
// No new Canon; the cap is a Provisional gameplay value (R-29).
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
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const CADENCE = 4320;
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const JOURNEY = [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town")];

function play(state, actions) {
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    state = result.state;
  }
  return state;
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const strong = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
const guard = (s) => { let t = s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = play(t, [HOUR]); return play(play(strong(t), ESCORT), [M("loc_castle_town")]); };

const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN);
const firstMinute = town.fired.evt_caravan.lastMinute;

// 1. which events catch up
function testWhich() {
  assert.deepStrictEqual(validateData(worldData), []);
  const on = Object.keys(worldData.events).filter((id) => worldData.events[id].catchUp === true).sort();
  assert.deepStrictEqual(on, ["evt_bandits_tale", "evt_bandits_word_north", "evt_caravan", "evt_fallen_word_south", "evt_road_north", "evt_well_tale", "evt_well_word_north"]); // V2-Core-125: the road's condition, at the caravans' cadence
  for (const id of on) assert.ok(Number.isInteger(worldData.events[id].cooldown), `${id} has a cooldown to count`);
  for (const id of ["evt_town_flour_demand", "evt_mill_flour_stock", "evt_spring_miasma", "evt_ruins_hazard"]) {
    assert.strictEqual(worldData.events[id].catchUp, undefined, `${id} does not catch up`);
  }
}

// 2. the clock is honest: however the days are spent
function testHonest() {
  const honest = (s, label) => {
    const fired = s.fired.evt_caravan;
    assert.strictEqual(fired.count, 1 + Math.floor((s.time.minute - firstMinute) / CADENCE), `${label}: the caravans counted are the caravans that passed`);
    assert.strictEqual(fired.lastMinute, firstMinute + (fired.count - 1) * CADENCE, `${label}: the cadence keeps its phase`);
    assert.strictEqual(sig(s, "caravan_visits"), fired.count, `${label}: and the visits are the firings`);
  };
  const long = play(town, JOURNEY);
  honest(long, "one long move");
  assert.ok((long.time.minute - town.time.minute) / 1440 > 10.5, "eleven days away");
  honest(play(town, Array(11).fill(DAY)), "eleven daily waits");
  honest(play(town, Array(11 * 24).fill(HOUR)), "264 hourly waits");
  honest(play(guard(guard(town)), [...JOURNEY, DAY, ...JOURNEY]), "escorts, a journey, a wait, the journey again");
  // the same eleven days, spent away or at home, count the same caravans
  assert.strictEqual(sig(long, "caravan_visits") - sig(town, "caravan_visits"), Math.floor((long.time.minute - town.fired.evt_caravan.lastMinute) / CADENCE));
}

// 3. a long step counts its caravans one by one, the cap clamping at each
function testJourney() {
  let start = town;
  for (let i = 0; i < 4; i += 1) start = guard(start);
  assert.strictEqual(sig(start, "guards_owed"), 0, "up to date");
  const long = play(start, JOURNEY);
  const days = (long.time.minute - start.time.minute) / 1440;
  assert.ok(days > 10.5 && days < 11.5);
  const came = sig(long, "caravan_visits") - sig(start, "caravan_visits");
  assert.strictEqual(came, 4, "four caravans passed in the journey");
  assert.strictEqual(sig(long, "guards_owed"), 3, "three are owed (the cap)");
  assert.strictEqual(sig(long, "caravans_unguarded"), 1, "one left");
  // the same days at home (waited by the day) leave the count the same formula gives: the clock does not care how the
  // days are spent
  const due = (t) => Math.floor((t.time.minute - start.fired.evt_caravan.lastMinute) / CADENCE);
  assert.strictEqual(came, due(long), "the journey counts every caravan that passed");
  const home = play(start, Array(Math.round(days)).fill(DAY));
  assert.strictEqual(sig(home, "caravan_visits") - sig(start, "caravan_visits"), due(home), "and so does waiting the days at home");
}

// 4. compatibility
function testCompat() {
  const off = structuredClone(worldData);
  for (const id of Object.keys(off.events)) delete off.events[id].catchUp;
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "honest-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "honest-1", data: off, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  // an old save: the caravan cadence's origin is whatever minute it last fired -- the world runs on from there
  const old = structuredClone(town);
  old.fired.evt_caravan = { count: 3, lastMinute: old.time.minute - 1000 };
  old.signals = { ...old.signals, caravan_visits: 3 };
  const next = play(old, [DAY, DAY, DAY, DAY]);
  assert.strictEqual(sig(next, "caravan_visits"), 3 + Math.floor((next.time.minute - (old.time.minute - 1000)) / CADENCE), "counted from the save's last firing");
  assert.deepStrictEqual(validateState(next), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_clock", old, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, old);
  assert.deepStrictEqual(play(loaded, [DAY, DAY, DAY, DAY]), next, "loaded, the same end");
  assert.deepStrictEqual(play(old, [DAY, DAY, DAY, DAY]), next, "the same input, the same world");
}

testWhich();
testHonest();
testJourney();
testCompat();
console.log("V2-Core-116 data-world-honest-clock.test.js: all checks passed");
