// V2-Core-96 (#237, World Simulation 1, step 1 -- the caravans keep coming): through the ordinary step() API and the
// real pack. No engine change; additive content only (D-92/D-100):
//   once the road is in use a caravan still comes every three days after the third -- the world moves without the
//   player. The realm's news stands as it was (the levy, the fair, the unrest are the first three caravans'); each
//   later caravan is owed a guard (`guards_owed`, a world count). Guard demand over the first three is exactly the old
//   rule (hires <= visits), so a save from before keeps its meaning; an escort settles the first three's shortfall
//   first, then the later caravans'. One guard per caravan, for as long as the road lives. The cadence is a
//   Provisional gameplay value (R-29), not Canon.
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
const DAY = { type: "wait", minutes: 1440 };
const CARAVAN = [DAY, DAY, DAY];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
// history-41: the dispersal, the crossing, the road north -- data-world-caravan-guard
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
const me = (s) => s.actors[s.player.actorId];
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
// a strong, rested guard in the town (the escort's outcome is not this step's subject)
const ready = (s) => { const c = structuredClone(s); me(c).locationId = "loc_castle_town"; const g = me(c).growth.growth_wanderer; g.stats.str = 30; g.resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
const escort = (s) => run(ready(s), ESCORT).state;
// wait, by the hour, for the next caravan (the escort takes half a day and the cadence is exact, V2-Core-116: a fixed
// wait would let a caravan slip in now and then)
const HOUR = { type: "wait", minutes: 60 };
const nextCaravan = (s) => { const v = s.signals.caravan_visits; let t = s; for (let h = 0; h < 96 && t.signals.caravan_visits === v; h += 1) t = run(t, [HOUR]).state; return t; };
const realmNews = (s) => ["fact_realm_levy", "fact_realm_fair", "fact_realm_unrest"].map((f) => s.facts[f]?.value);

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;

// 1. the caravans keep coming; the news stands; later caravans are owed guards
function testCaravans() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(town.signals.caravan_visits, 1);
  const three = run(town, [...CARAVAN, ...CARAVAN]).state;
  assert.strictEqual(three.signals.caravan_visits, 3);
  assert.strictEqual(three.signals.guards_owed, undefined, "the first three are counted the old way");
  const news = realmNews(three);
  assert.deepStrictEqual(news, ["known", "known", "known"]);
  const six = run(three, [...CARAVAN, ...CARAVAN, ...CARAVAN]).state;
  assert.strictEqual(six.signals.caravan_visits, 6, "every three days, for as long as the road lives");
  // V2-Core-109/116: the caravans do not wait -- the cap holds three shares, so the three later caravans are all owed
  // a guard and none has left yet; the ones beyond them leave (counted in the world's `caravans_unguarded`)
  assert.strictEqual(six.signals.guards_owed, 3, "the three later caravans are owed a guard");
  assert.strictEqual(six.signals.caravans_unguarded, undefined, "and none has left");
  const nine = run(six, [...CARAVAN, ...CARAVAN, ...CARAVAN]).state;
  assert.strictEqual(nine.signals.caravan_visits, 9);
  assert.strictEqual(nine.signals.guards_owed, 3, "the cap holds");
  assert.strictEqual(nine.signals.caravans_unguarded, 3, "and the three before them have left");
  assert.deepStrictEqual(realmNews(six), news, "the realm's news stands");
  const twoDays = run(six, [DAY, DAY]).state;
  assert.strictEqual(twoDays.signals.caravan_visits, 6, "not before the cadence");
}

// 2. one guard per caravan, beyond three
function testGuards() {
  let s = town;
  for (let n = 1; n <= 5; n += 1) {
    assert.ok(wanted(s), `caravan ${n} wants a guard`);
    s = escort(s);
    assert.strictEqual(s.signals.guards_hired, n);
    assert.ok(!wanted(ready(s)), `caravan ${n} has its guard`);
    s = nextCaravan(ready(s));
  }
  assert.strictEqual(s.signals.caravan_visits, 6);
  assert.strictEqual(s.signals.guards_owed, 1, "the sixth caravan waits for its guard");
  assert.ok(wanted(ready(s)));
}

// 3. a caravan missed is gone (V2-Core-109/116): hires never exceed caravans, the first three settled first, then the shares
// the cap kept
function testCatchUp() {
  const nine = run(town, Array.from({ length: 8 }, () => CARAVAN).flat()).state;
  assert.strictEqual(nine.signals.caravan_visits, 9);
  assert.strictEqual(nine.signals.guards_owed, 3, "the cap's three shares still wait");
  assert.strictEqual(nine.signals.caravans_unguarded, 3, "the three before them left");
  let s = nine;
  const owed = [];
  for (let i = 0; i < 6; i += 1) { assert.ok(wanted(ready(s))); s = escort(s); owed.push(s.signals.guards_owed); }
  // six escorts take three days, so one more caravan comes while they are done (the cadence is exact): the shares go
  // 3, 3, 3 (the first three's shortfall), 2, then the new one arrives: 2, 1
  assert.deepStrictEqual(owed, [3, 3, 3, 2, 2, 1], "the first three's shortfall first, then the shares the cap kept");
  assert.strictEqual(s.signals.guards_hired, 6);
  assert.strictEqual(s.signals.caravan_visits, 10, "one came while she worked");
  assert.strictEqual(s.signals.caravan_visits, s.signals.guards_hired + s.signals.caravans_unguarded + s.signals.guards_owed + 0, "every caravan is a guard hired, one that left, or one still owed");
  assert.ok(wanted(ready(s)), "the caravan that came meanwhile wants its guard");
}

// 4. a save from before keeps its meaning
function testOldSaves() {
  // three caravans, all guarded, written before the counter existed
  const allGuarded = structuredClone(town);
  Object.assign(allGuarded.signals, { caravan_visits: 3, guards_hired: 3 });
  assert.ok(!wanted(ready(allGuarded)), "as before: no guard wanted");
  const next = run(ready(allGuarded), CARAVAN).state;
  assert.strictEqual(next.signals.caravan_visits, 4);
  assert.strictEqual(next.signals.guards_owed, 1);
  assert.ok(wanted(ready(next)), "the new caravan wants a guard");
  // three caravans, one guarded: the old rule still owes two
  const oneGuarded = structuredClone(town);
  Object.assign(oneGuarded.signals, { caravan_visits: 3, guards_hired: 1 });
  let s = oneGuarded;
  for (let i = 0; i < 2; i += 1) { assert.ok(wanted(ready(s))); s = escort(s); }
  assert.ok(!wanted(ready(s)), "as the old rule said");
  assert.strictEqual(s.signals.guards_owed, undefined, "nothing written for the old caravans");
}

// 5. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/guards_owed/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const start = run(town, [...CARAVAN, ...CARAVAN, ...CARAVAN]).state;
  const path = [...CARAVAN, ...CARAVAN];
  const end = run(start, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_road_lives", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start, path).state, end, "the same input, the same world");
}

testCaravans();
testGuards();
testCatchUp();
testOldSaves();
testSaveAndDeterminism();
console.log("V2-Core-96 data-world-road-lives.test.js: all checks passed");
