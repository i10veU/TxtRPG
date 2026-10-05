// V2-Core-95 (#226, RPG Depth 1, step 4 -- integrated: a name on the road): a guard's career in natural play,
// through the ordinary step() API and the real pack -- no stats edited. No new rule.
//   1. the honoured scout of Slice 3 (integrated-36) guards the caravans: two good escorts make the guild know her,
//      and teach her (V2-Core-99: the escort's practice is `combat`'s, which ranks swordsmanship -- D-81). The third
//      escort succeeds on that rank alone: a known guard's pay, no wound. Against the counterfactual -- the same
//      third escort for a guard the road had not taught (her practice as it stood before the first escort; the
//      only edited state here) -- the same roll fails: no bonus, a road wound. Home, the village that honoured her
//      sells the salve cheap; rest does not close the wound, the salve does;
//   2. with the silver earned she buys the jerkin and wears it before the third escort: the same roll one point
//      steadier (the practice already decided it). For the untaught guard the jerkin is what turns the failure;
//   3. a weak wanderer (history-41): every escort fails; the first wounds, the second kills. The successor carries
//      no wound and no standing, but the world remembers its hired guards;
//   4. save/load in the middle of the career, and determinism.
// Standing, wounds, practice and gear are the character's; counts of hired guards are the world's. All values are gameplay
// values; no Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BACK_AND_WAIT = [M("loc_castle_town"), DAY, DAY, DAY];
const BUY_JERKIN = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin")];
const HOME_FROM_BANK = [M("loc_river_ford"), M("loc_crossroads"), M("loc_village")];
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
const WANDERER_TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];

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
const traits = (s) => me(s).growth?.growth_wanderer?.traits ?? {};
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const growthOf = (s) => me(s).growth.growth_wanderer;
// the counterfactual: the road teaches nothing -- her combat practice and swordsmanship rank as before the first escort
const untaught = (s, before) => { const c = structuredClone(s); growthOf(c).proficiency.combat = growthOf(before).proficiency.combat; growthOf(c).skills.swordsmanship = growthOf(before).skills.swordsmanship; return c; };
const skillMod = (c) => c.modifiers.find((m) => m.source === "skill:swordsmanship")?.value ?? 0;
const lastCheck = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;

const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
// two good escorts: the guild knows her
const known = (() => {
  const first = play(scoutInTown, ESCORT);
  assert.strictEqual(lastCheck(first).tier, "success");
  const asked1 = play(play(first.state, [M("loc_castle_town")]).state, [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")]);
  assert.ok(!asked1.said.includes("txt_guild_clerk_knows_you"), "one escort: not yet known");
  const second = play(play(first.state, BACK_AND_WAIT).state, ESCORT);
  assert.strictEqual(lastCheck(second).tier, "success");
  assert.ok(!first.said.includes("txt_escort_known_bonus") && !second.said.includes("txt_escort_known_bonus"), "no bonus before she is known");
  const asked2 = play(play(second.state, [M("loc_castle_town")]).state, [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")]);
  assert.ok(asked2.said.includes("txt_guild_clerk_knows_you"), "two: known");
  return play(second.state, BACK_AND_WAIT).state;
})();

// 1. the road taught her: the third escort succeeds; untaught, the same roll fails -- a wound; home, a cheap salve closes it
function testTaught() {
  assert.strictEqual(standing(known), 10, "known to the guild after two good escorts");
  assert.strictEqual(growthOf(scoutInTown).skills.swordsmanship, 1, "the leader fight's rank");
  assert.strictEqual(growthOf(known).proficiency.combat - growthOf(scoutInTown).proficiency.combat, 20, "two good escorts: 10 each");
  assert.strictEqual(growthOf(known).skills.swordsmanship, 2, "the road taught her a rank");
  const before = me(known).money;
  const third = play(known, ESCORT);
  const c = lastCheck(third);
  assert.strictEqual(skillMod(c), 2);
  assert.strictEqual(c.tier, "success", "the rank the road taught decides it");
  assert.strictEqual(c.margin, 0);
  assert.ok(third.said.includes("txt_escort_known_bonus"), "a known guard's pay");
  assert.strictEqual(me(third.state).money - before, 5, "4 and the bonus");
  assert.ok(!traits(third.state).road_wound, "no wound");
  assert.strictEqual(standing(third.state), 15);
  return third.state;
}

// 1b. the counterfactual: untaught, the third escort fails; rest does not close the wound, the village's cheap salve does
function testUntaughtWounded() {
  const raw = untaught(known, scoutInTown);
  const before = me(raw).money;
  const third = play(raw, ESCORT);
  const c = lastCheck(third);
  assert.strictEqual(skillMod(c), 1);
  assert.strictEqual(c.total, lastCheck(play(known, ESCORT)).total - 1, "the same roll, one rank less");
  assert.strictEqual(c.tier, "partial", "untaught, the third escort fails (no partial outcome: the failure's)");
  assert.ok(!third.said.includes("txt_escort_known_bonus"), "no bonus for a failure");
  assert.strictEqual(me(third.state).money - before, 1, "the failure's pay");
  assert.ok(traits(third.state).road_wound, "a road wound");
  assert.strictEqual(standing(third.state), 10, "a failure adds no standing");
  // home: a night's rest closes a mild wound (V2-Core-121, the owner's change; it used to stay until the salve) -- and the village
  // that honoured her sells the salve for one silver to one who would rather not wait
  assert.ok(!traits(play(third.state, [...HOME_FROM_BANK, REST]).state).road_wound, "rest closes a mild wound");
  const home = play(third.state, HOME_FROM_BANK);
  assert.ok(traits(home.state).road_wound, "not yet rested: still wounded");
  const treated = play(home.state, [M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_buy_salve_trusted"), P("act_treat_road_wound")]);
  assert.ok(treated.said.includes("txt_treat_road_wound"));
  assert.ok(!traits(treated.state).road_wound, "closed");
  assert.strictEqual(me(treated.state).inventory.item_herbal_salve ?? 0, 0, "the salve is used up");
}

// 2. the jerkin bought from her earnings: the same roll one point steadier; for the untaught guard it turns the failure
function testGear() {
  assert.ok(me(known).money >= 3, "two escorts paid for it");
  const geared = play(known, BUY_JERKIN).state;
  assert.strictEqual(me(known).money - me(geared).money, 3);
  assert.deepStrictEqual(me(geared).loadout, { hand: "item_iron_sword", body: "item_leather_jerkin" }, "the sword still in hand");
  const before = me(geared).money;
  const third = play(geared, ESCORT);
  const c = lastCheck(third);
  assert.deepStrictEqual(c.modifiers.find((m) => m.source === "item:item_leather_jerkin"), { source: "item:item_leather_jerkin", value: 1 });
  assert.strictEqual(c.tier, "success");
  assert.strictEqual(c.margin, 1, "one point steadier than without it");
  assert.ok(third.said.includes("txt_escort_known_bonus"), "a known guard's pay");
  assert.strictEqual(me(third.state).money - before, 5, "4 and the bonus");
  assert.ok(!traits(third.state).road_wound, "no wound");
  assert.strictEqual(standing(third.state), 15);
  // untaught, the jerkin is what turns the failure
  const rawGeared = play(untaught(known, scoutInTown), BUY_JERKIN).state;
  const rawThird = play(rawGeared, ESCORT);
  assert.strictEqual(lastCheck(rawThird).tier, "success", "untaught, the jerkin turns the failure");
  assert.strictEqual(lastCheck(rawThird).margin, 0);
  assert.ok(!traits(rawThird.state).road_wound);
}

// 3. a weak wanderer: the road wounds, then kills; the successor carries nothing personal
function testWanderer() {
  const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, WANDERER_TO_TOWN).state;
  const first = play(town, ESCORT);
  assert.strictEqual(lastCheck(first).tier, "partial");
  assert.ok(traits(first.state).road_wound);
  assert.strictEqual(me(first.state).hp.current, me(town).hp.current - 3);
  const second = play(play(first.state, BACK_AND_WAIT).state, ESCORT);
  assert.deepStrictEqual(lastCheck(second).modifiers.find((m) => m.source === "trait:road_wound"), { source: "trait:road_wound", value: -2 }, "the wound weighs on the second escort");
  assert.ok(!second.said.includes("txt_escort_wound"), "already wounded: nothing more");
  assert.deepStrictEqual(second.state.pending, { kind: "newCharacter" }, "the road kills the weak");
  assert.strictEqual(second.state.signals.guards_hired, 2, "the world remembers its guards");
  const next = play(second.state, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.ok(!traits(next).road_wound, "a new life, no old wound");
  assert.strictEqual(standing(next), undefined, "and no standing");
  assert.strictEqual(next.signals.guards_hired, 2);
}

// 4. save/load in the middle of the career, and determinism
function testSaveAndDeterminism() {
  const rest = [...BUY_JERKIN, ...ESCORT, ...HOME_FROM_BANK];
  const end = play(known, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_career", known, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, known);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state,
    [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...ESCORT, ...BACK_AND_WAIT, ...ESCORT, ...BACK_AND_WAIT, ...rest]).state;
  assert.deepStrictEqual(again, end, "the same input, the same world");
}

testTaught();
testUntaughtWounded();
testGear();
testWanderer();
testSaveAndDeterminism();
console.log("V2-Core-95 data-world-guard-career.test.js: all checks passed");
