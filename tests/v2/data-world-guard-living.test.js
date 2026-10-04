// V2-Core-101 (#244, RPG Depth 2, step 3 -- integrated: a guard's living): a long guard career in natural play (no
// stats edited), through the ordinary step() API and the real pack. No new rule. The road teaches (V2-Core-99) and the
// town has a bed (V2-Core-100):
//   1. the honoured scout guards eight caravans, buying the jerkin before the third and lodging in the town when spent:
//      every check carries the rank the road has taught (swordsmanship 1 -> 5, the skill's last rank); silver flows both
//      ways (escorts in; the jerkin and the nights out). At the last rank the practice is full: the road teaches no more;
//   2. walking home to rest instead: the same caravans, the same days -- the caravans come every three days, and the walk
//      fits inside the wait. The bed buys no caravan in a steady career; the walker keeps the nights' silver;
//   3. with a backlog -- nine days away, three shares paid back to back, the guard spent with one still owed -- the bed
//      takes the next caravan in 20 hours, the walk in 41;
//   4. save/load and determinism.
// Practice, ranks and silver are the character's; values are gameplay values. No Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const LODGE = P("act_lodge_castle_town");
const DAY = { type: "wait", minutes: 1440 };
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BUY_JERKIN = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin")];
// from the town (or the far bank, where an escort ends) to the village for a rest, and back by the letter -- data-world-long-road
const REST_TRIP = [M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), REST, M("loc_crossroads"), M("loc_river_ford"),
  P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
// integrated-36, the scout of Slice 3: both stories, the arrows told, the village's honour (data-world-first-town)
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
const SCOUT_TO_TOWN = [REST, ...E("opt_ask_region"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];

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
const stamina = (s) => growth(s).resources.stamina.current;
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const lastCheck = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;
const skillMod = (c) => c.modifiers.find((m) => m.source === "skill:swordsmanship")?.value ?? 0;
const DAYS = (s, t0) => Math.floor((s.time.minute - t0) / 1440);

// the policy: back to the town, the jerkin before the third, rest when spent (a night in the town, or the walk home),
// wait for the next caravan, take its escort
function career(start, count, rest) {
  let s = start;
  const record = [];
  let nights = 0;
  for (let i = 1; i <= count; i += 1) {
    if (me(s).locationId === "loc_far_bank") s = play(s, [M("loc_castle_town")]).state;
    if (record.length === 2 && !me(s).inventory.item_leather_jerkin) s = play(s, BUY_JERKIN).state;
    if (stamina(s) < 2) {
      s = play(s, rest === "lodge" ? [LODGE] : [M("loc_far_bank"), ...REST_TRIP]).state;
      if (rest === "lodge") nights += 1;
    }
    for (let h = 0; h < 96 && !wanted(s); h += 1) s = play(s, [HOUR]).state; // waits by the hour: the day the caravan comes
    assert.ok(wanted(s), "a caravan wants a guard");
    const r = play(s, ESCORT);
    const c = lastCheck(r);
    record.push({ tier: c.tier, skill: skillMod(c), day: DAYS(r.state, start.time.minute), pay: me(r.state).money - me(s).money });
    s = r.state;
  }
  return { state: s, record, nights };
}

const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
const lodger = career(scoutInTown, 8, "lodge");

// 1. eight caravans: the road teaches to the last rank; silver both ways
function testLiving() {
  assert.strictEqual(growth(scoutInTown).skills.swordsmanship, 1, "the leader fight's rank");
  assert.deepStrictEqual(lodger.record.map((r) => r.skill), [1, 1, 2, 2, 3, 3, 4, 4], "every check carries the rank the road has taught so far");
  assert.deepStrictEqual(lodger.record.map((r) => r.tier), ["success", "success", "success", "great", "success", "great", "success", "success"]);
  const end = lodger.state;
  assert.strictEqual(growth(end).skills.swordsmanship, 5, "the last rank");
  assert.strictEqual(growth(end).proficiency.combat, 100, "the practice is full");
  assert.strictEqual(worldData.growthSystems.growth_wanderer.skills.find((k) => k.id === "swordsmanship").maxRank, 5);
  // the road teaches no more
  let s = play(end, [M("loc_castle_town")]).state;
  if (stamina(s) < 2) s = play(s, [LODGE]).state;
  for (let d = 0; d < 4 && !wanted(s); d += 1) s = play(s, [DAY]).state;
  const ninth = play(s, ESCORT);
  assert.strictEqual(skillMod(lastCheck(ninth)), 5);
  assert.strictEqual(growth(ninth.state).proficiency.combat, 100, "nothing more to learn on this road");
  assert.strictEqual(growth(ninth.state).skills.swordsmanship, 5);
  // silver both ways: escorts in (pay and the known guard's bonus); the jerkin and two nights out
  assert.deepStrictEqual(lodger.record.map((r) => r.pay), [4, 4, 5, 7, 5, 7, 5, 5], "pay by tier, a silver more once the guild knows her");
  assert.strictEqual(lodger.nights, 2, "two nights in the town");
  assert.strictEqual(me(end).money - me(scoutInTown).money, 42 - 3 - 2 * 2, "earned on the road, less the jerkin and the nights");
  assert.ok(!growth(end).traits?.road_wound, "no wound: the road taught her before it could hurt her");
}

// 2. walking home to rest: the same caravans, the same days; the walker keeps the nights' silver
function testWalkOrLodge() {
  const walker = career(scoutInTown, 8, "walk");
  assert.deepStrictEqual(walker.record.map((r) => r.tier), lodger.record.map((r) => r.tier), "the same rolls");
  assert.deepStrictEqual(walker.record.map((r) => r.day), lodger.record.map((r) => r.day), "the same caravans, the same days: the walk fits inside the wait");
  assert.strictEqual(walker.state.signals.guards_hired, lodger.state.signals.guards_hired);
  assert.strictEqual(me(walker.state).money - me(lodger.state).money, 4, "two nights' silver kept");
}

// 3. a backlog: the bed takes the next caravan in 20 hours, the walk in 41
function testBacklog() {
  let s = play(scoutInTown, ESCORT).state;
  for (let i = 0; i < 2; i += 1) {
    s = play(s, [M("loc_castle_town")]).state;
    while (!wanted(s)) s = play(s, [DAY]).state;
    s = play(s, ESCORT).state;
  }
  s = play(s, [M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), REST, ...Array(9).fill(DAY), REST,
    M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")]).state;
  assert.strictEqual(s.signals.guards_owed, 3, "three shares waited for her");
  for (let i = 0; i < 3; i += 1) s = play(s, [...ESCORT, M("loc_castle_town")]).state;
  assert.strictEqual(stamina(s), 0, "three back to back spend her");
  assert.strictEqual(s.signals.guards_owed, 1, "and a caravan came meanwhile");
  assert.strictEqual(wanted(s), false, "too spent for it");
  const lodged = play(s, [LODGE, ...ESCORT]).state;
  const walked = play(s, [M("loc_far_bank"), ...REST_TRIP, ...ESCORT]).state;
  assert.strictEqual(lodged.signals.guards_owed ?? 0, 0);
  assert.strictEqual(walked.signals.guards_owed ?? 0, 0, "the share waits for the walker too");
  assert.strictEqual((lodged.time.minute - s.time.minute) / 60, 20, "a night and the road");
  assert.ok((walked.time.minute - s.time.minute) / 60 > 40, "the walk home and back, and the road");
}

// 4. save/load and determinism
function testSaveAndDeterminism() {
  const mid = career(scoutInTown, 4, "lodge").state;
  const rest = (s) => career(s, 3, "lodge");
  const end = rest(mid);
  assert.deepStrictEqual(validateState(end.state), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_living", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(rest(loaded).state, end.state, "loaded, the same end");
  assert.deepStrictEqual(career(play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state,
    [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state, 4, "lodge").state, mid, "the same input, the same world");
}

testLiving();
testWalkOrLodge();
testBacklog();
testSaveAndDeterminism();
console.log("V2-Core-101 data-world-guard-living.test.js: all checks passed");
