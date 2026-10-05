// V2-Core-98 (#237, World Simulation 1, step 3 -- integrated: the road keeps living): a long guard career in natural
// play (no stats edited), through the ordinary step() API and the real pack. No new rule.
//   1. the honoured scout guards caravan after caravan -- past the old limit of three -- resting in the village when her
//      stamina runs out; the clerk tells her to wear leather until she does; standing grows with every good escort;
//   2. the world does not wait: while she stays away nine days, the caravans keep coming and their guards are owed --
//      back in the town she can take them one after another, never more than caravans have come;
//   3. in a world where nobody guards, the road lives on and owes its guards; a successor inherits nothing personal but
//      finds the owed caravans still wanting guards;
//   4. save/load in the middle, and determinism.
// Counts of caravans and guards are the world's; standing, wounds and gear the character's. All values are gameplay
// values; no Canon.
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
const DAY = { type: "wait", minutes: 1440 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BUY_JERKIN = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin")];
// history-41: the dispersal and the road walked to the ford (data-world-river-ford)
const WANDERER_TO_FORD = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
];
// from the town (or the far bank, where an escort ends) to the village for a rest, and back by the letter
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

function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
  log.push(result);
  return result.state;
}
function play(state, actions) {
  const log = [];
  for (const action of actions) state = apply(state, action, log);
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const stamina = (s) => me(s).growth.growth_wanderer.resources.stamina.current;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const lastCheck = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;
// the policy: rest when tired, wait in the town for the next caravan, take its escort, come back to the town
function nextEscort(state) {
  let s = state;
  if (me(s).locationId === "loc_far_bank") s = play(s, [M("loc_castle_town")]).state;
  if (stamina(s) < 2) s = play(s, [M("loc_far_bank"), ...REST_TRIP]).state;
  for (let i = 0; i < 4 && !wanted(s); i += 1) s = play(s, [DAY]).state;
  assert.ok(wanted(s), "a caravan wants a guard");
  return play(s, ESCORT);
}

const inTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;

// 1. caravan after caravan, past the old three
function testLongCareer() {
  assert.ok(play(inTown, ASK).said.includes("txt_guild_clerk_no_leather"), "the clerk: wear leather");
  let s = inTown;
  const tiers = [];
  for (let n = 1; n <= 6; n += 1) {
    if (n === 3) {
      s = play(play(s, [M("loc_castle_town")]).state, BUY_JERKIN).state;
      assert.ok(!play(s, ASK).said.includes("txt_guild_clerk_no_leather"), "worn: nothing to say");
    }
    const r = nextEscort(s);
    tiers.push(lastCheck(r).tier);
    s = r.state;
    assert.strictEqual(s.signals.guards_hired, n);
    assert.ok(s.signals.guards_hired <= s.signals.caravan_visits, "never more guards than caravans");
    // the first three all guarded: what is owed is exactly the later caravans still unguarded (a steady career loses none: V2-Core-109)
    assert.strictEqual(s.signals.guards_owed ?? 0, Math.max(0, s.signals.caravan_visits - 3) - Math.max(0, s.signals.guards_hired - 3));
    assert.strictEqual(s.signals.caravans_unguarded, undefined, "none left without a guard");
  }
  assert.deepStrictEqual(["fact_realm_levy", "fact_realm_fair", "fact_realm_unrest"].map((f) => s.facts[f]?.value), ["known", "known", "known"], "the realm's news, as the first three caravans left it");
  assert.deepStrictEqual(tiers, ["success", "success", "success", "great", "success", "great"]);
  assert.strictEqual(standing(s), 30, "a name on the road");
  assert.ok(!me(s).growth.growth_wanderer.traits.road_wound, "unwounded");
  assert.strictEqual(me(s).money, 30);
  return s;
}

// 2. the world does not wait: nine days away, three caravans still owed a guard (the cap) and none gone yet; taken in turn
function testOwed(career) {
  const away = play(career, [M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), REST, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state;
  const owed = away.signals.guards_owed;
  const unguarded = Math.max(0, away.signals.caravan_visits - 3) - Math.max(0, away.signals.guards_hired - 3);
  // V2-Core-109/116: the cap holds three shares; every earlier unguarded caravan beyond them has left
  assert.strictEqual(owed, 3, "three caravans are still owed a guard");
  assert.strictEqual(unguarded, 3, "and no more than three were unguarded: nine days away costs the cap's worth, none gone yet");
  assert.strictEqual(away.signals.caravans_unguarded, undefined);
  assert.strictEqual(away.signals.caravan_visits, 9, "the caravans kept coming");
  let s = play(away, [M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")]).state;
  const before = s.signals.guards_hired;
  for (let i = 0; i < 3; i += 1) s = nextEscort(s).state;
  assert.strictEqual(s.signals.guards_hired, before + 3);
  assert.ok(s.signals.guards_hired <= s.signals.caravan_visits);
  return s;
}

// 3. a successor: nothing personal, the world's road as it is (history-41, where the ruins kill: the leader lives)
function testSuccessor() {
  const walked = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, WANDERER_TO_FORD).state;
  let s = play(walked, [M("loc_crossroads"), M("loc_village"), DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state;
  assert.ok(s.signals.caravan_visits >= 5, "the road lived on without anyone on it");
  const owed = s.signals.guards_owed;
  // nobody guarded: the cap's three shares are still owed, every one before them left (V2-Core-109/116)
  const visits = s.signals.caravan_visits;
  assert.strictEqual(owed, Math.min(visits - 3, 3), "the later caravans are owed, up to the cap's three");
  assert.strictEqual(s.signals.caravans_unguarded ?? 0, Math.max(0, visits - 6), "and those beyond them left without a guard");
  s = play(s, [M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = play(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = play(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(standing(next), undefined, "nothing personal");
  assert.strictEqual(next.signals.guards_owed, owed, "the world's count stays");
  assert.ok(wanted({ ...next, actors: next.actors }), "the caravan still owed wants a guard");
}

// 4. save/load in the middle, and determinism
function testSaveAndDeterminism() {
  const mid = nextEscort(nextEscort(inTown).state).state;
  const rest = (s) => { let t = play(play(s, [M("loc_castle_town")]).state, BUY_JERKIN).state; for (let i = 0; i < 2; i += 1) t = nextEscort(t).state; return t; };
  const end = rest(mid);
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_long_career", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(rest(loaded), end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
  assert.deepStrictEqual(rest(nextEscort(nextEscort(again).state).state), end, "the same input, the same world");
}

const career = testLongCareer();
const world = testOwed(career);
testSuccessor();
assert.ok(world);
testSaveAndDeterminism();
console.log("V2-Core-98 data-world-long-road.test.js: all checks passed");
