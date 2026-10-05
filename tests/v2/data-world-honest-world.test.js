// V2-Core-117 (#282 World Simulation 3 -- an honest clock, step 3, integrated): one world, two lives, through the ordinary
// step() API and the real pack. No new rule. The clock is honest when the world's numbers depend on how much time has
// passed and not on how the days were spent (D-107):
//   1. a known guard falls (staged) and the successor, in the town, has the world as it stands: the fall counted, the
//      word of it beginning to travel south with the caravans;
//   2. the same stretch of time spent three ways -- the royal journey (long moves, a market, a board), waiting at home
//      by the day (with a remainder), and waiting by the hour -- leaves the SAME world numbers: the caravans that passed,
//      the shares owed and the ones gone, the word's age and whether it reached the village, the tales' ages, and every
//      catching-up event's count and cadence. (On the old clock the journey counted fewer: that is what this pins.)
//   3. the journey's price to the guard who took it is the one the cap prices: the successor back from the royal city
//      finds three convoys waiting and one gone, and the clerk says so; the village's word of the fallen guard reached
//      the village the same as if they had stayed;
//   4. save/load between the lives and determinism.
// Staged where it must be (a strong, rested guard in 1; the fall). Everything else is the ordinary game. No Canon.
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
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const LEFT = "txt_guild_clerk_left_without";
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
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
const guard = (s) => play(play(strong(waitForConvoy(s)), ESCORT).state, [M("loc_castle_town")]).state;

// the world's numbers: everything that depends on time and not on what the player does with it
const CATCHING_UP = ["evt_caravan", "evt_fallen_word_south", "evt_bandits_word_north", "evt_well_word_north", "evt_bandits_tale", "evt_well_tale"];
const numbers = (s) => ({
  signals: Object.fromEntries(["caravan_visits", "guards_owed", "caravans_unguarded", "guards_fallen", "fallen_word_age", "bandits_word_age", "well_word_age", "bandits_tale_age", "well_tale_age"].map((k) => [k, sig(s, k)])),
  flags: Object.fromEntries(["guard_fall_word_south"].map((k) => [k, s.flags?.[k] ?? false])),
  fired: Object.fromEntries(CATCHING_UP.map((id) => [id, s.fired?.[id] ?? null])),
  minute: s.time.minute
});

// the fall, staged: the last point of hp, no strength, and a bad roll
function doomed(s) {
  const c = structuredClone(waitForConvoy(s));
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.state.pending?.kind === "newCharacter") return r;
  }
  throw new Error("no bad roll within 60 rolls");
}

// 1. a known guard falls; the successor is in the town
function testFall() {
  let s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
  for (let i = 0; i < 4; i += 1) s = guard(s);
  const fell = doomed(s);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(fell.state, "guards_fallen"), 1, "the fall is counted");
  const inTown = play(fell.state, [NEW_LIFE, ...SUCCESSOR_WALK]).state;
  assert.strictEqual(me(inTown).locationId, "loc_castle_town");
  assert.strictEqual(inTown.fired.evt_fallen_word_south.count >= 1, true, "the word has begun to travel");
  return { fell: fell.state, inTown };
}

// 2. the same stretch of time, spent three ways, leaves the same world numbers
function testHonest({ inTown }) {
  const journey = play(inTown, JOURNEY);
  const delta = journey.state.time.minute - inTown.time.minute;
  assert.ok(delta / 1440 > 10.5 && delta / 1440 < 11.5, `eleven days (${delta / 1440})`);
  const days = Math.floor(delta / 1440);
  const byDays = play(inTown, [...Array(days).fill(DAY), { type: "wait", minutes: delta - days * 1440 }]).state;
  const byHours = play(inTown, [...Array(Math.floor(delta / 60)).fill(HOUR), { type: "wait", minutes: delta % 60 }]).state;
  assert.strictEqual(byDays.time.minute, journey.state.time.minute, "the same minute");
  assert.strictEqual(byHours.time.minute, journey.state.time.minute, "the same minute");
  const a = numbers(journey.state);
  assert.deepStrictEqual(numbers(byDays), a, "the journey and the days at home leave the same world");
  assert.deepStrictEqual(numbers(byHours), a, "and so do the hours");
  assert.ok(a.signals.caravan_visits - sig(inTown, "caravan_visits") >= 3, "several caravans passed in the eleven days");
  return { journey, a };
}

// 3. what the journey costs the one who took it, and what reached the village meanwhile
function testPrice({ inTown }, { journey }) {
  const back = journey.state;
  assert.strictEqual(me(back).locationId, "loc_castle_town");
  assert.ok(wanted(back), "convoys are waiting");
  assert.ok(sig(back, "guards_owed") <= 3, "never above the cap");
  assert.strictEqual(sig(back, "guards_owed"), 3, "three shares kept");
  assert.ok(sig(back, "caravans_unguarded") >= 1, "and the rest left");
  assert.ok(play(back, ASK).said.includes(LEFT), "the clerk tells why");
  // what the village heard of the fallen guard while the successor was away: the same as if they had stayed home
  const home = play(inTown, [...Array(11).fill(DAY), { type: "wait", minutes: back.time.minute - inTown.time.minute - 11 * 1440 }]).state;
  assert.strictEqual(back.flags?.guard_fall_word_south ?? false, home.flags?.guard_fall_word_south ?? false);
  assert.strictEqual(sig(back, "fallen_word_age"), sig(home, "fallen_word_age"));
}

// 4. save/load between the lives, determinism
function testSaveAndDeterminism({ fell }) {
  assert.deepStrictEqual(validateState(fell), []);
  assert.deepStrictEqual(validateData(worldData), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_clock_fell", fell, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fell);
  const rest = [NEW_LIFE, ...SUCCESSOR_WALK, ...JOURNEY];
  const end = play(fell, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(fell, rest).state, end, "the same input, the same world");
}

const stage = testFall();
const honest = testHonest(stage);
testPrice(stage, honest);
testSaveAndDeterminism(stage);
console.log("V2-Core-117 data-world-honest-world.test.js: all checks passed");
