// V2-Core-105 (#258, RPG Depth 3, step 1 -- the last rank opens the lead job): through the ordinary step() API and the
// real pack. No engine change; additive content only (D-92): the `unl_keen_eye` pattern -- a threshold, an unlock, an
// option that asks for it.
//   the `combat` practice's last threshold (100) unlocks `unl_road_lead`; the clerk then offers the lead of the convoy:
//   "상단 호위를 이끈다" -- the same check and road as the ordinary escort, 3 stamina instead of 2, more pay (8 / 6 / 2),
//   and the guild's regard grows twice as fast (+10, not +5; a failure adds none, as before). It fails as the ordinary
//   escort does (3 hp and a road wound). The practice is full: leading teaches nothing more.
//   1. the schema, and the moment: the unlock appears with the eighth escort of the scout's career, not before;
//   2. who is offered it: the unlock, a caravan wanting a guard and 3 stamina -- and the clerk says so;
//   3. what it pays by tier, what it costs, what it earns the guild;
//   4. it is the character's (a successor has none); a save already past 100 has none -- a threshold fires only on
//      crossing -- and one a step short of it gets it;
//   5. save compatibility (the start is the same without it), save/load and determinism.
// Pay, costs and the rate of regard are gameplay values; standing and the unlock are the character's. No Canon.
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
const LEAD = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_lead")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const LEAD_TEXT = "txt_guild_clerk_lead_offer";
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const unlocked = (s) => growth(s).unlocks?.unl_road_lead === true;
const offered = (s, optionId) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === optionId).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
// the first rng cursor at which the lead job's check lands in a tier -- found deterministically on the same state
function withTier(state, tier) {
  for (let k = 0; k < 80; k += 1) {
    const t = structuredClone(state);
    t.rng.cursor += k;
    const r = play(t, LEAD);
    if (lastCheck(r).tier === tier || (tier === "fail" && lastCheck(r).tier === "partial")) return { before: t, ...r };
  }
  throw new Error(`no ${tier} within 80 rolls`);
}

const crossing = (() => {
  // the scout's career, escort by escort: the unlock appears with the eighth
  let s = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
  const marks = [];
  for (let i = 1; i <= 8; i += 1) {
    s = career(s, 1, "lodge").state;
    marks.push({ combat: growth(s).proficiency.combat, unlocked: unlocked(s) });
    if (i === 7) var sevenEscorts = s;
  }
  return { marks, ready: s, sevenEscorts };
})();
const ready = crossing.ready;

// 1. the schema and the moment
function testMoment() {
  assert.deepStrictEqual(validateData(worldData), []);
  const combat = worldData.growthSystems.growth_wanderer.proficiencies.find((p) => p.id === "combat");
  assert.ok(combat.thresholds.some((t) => t.at === 100 && t.effects.some((e) => e.op === "unlock" && e.id === "unl_road_lead")));
  assert.ok(combat.thresholds.some((t) => t.at === 100 && t.effects.some((e) => e.op === "skill" && e.skill === "swordsmanship")), "the last rank is still there");
  assert.ok(worldData.growthSystems.growth_wanderer.unlocks.some((u) => u.id === "unl_road_lead"));
  assert.deepStrictEqual(crossing.marks.map((m) => m.combat), [30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepStrictEqual(crossing.marks.map((m) => m.unlocked), [false, false, false, false, false, false, false, true], "the eighth escort fills the practice");
  assert.strictEqual(growth(ready).skills.swordsmanship, 5, "and the last rank is the same moment");
}

// 2. who is offered it
function testOffered() {
  const inTown = (s) => { let t = me(s).locationId === "loc_far_bank" ? play(s, [M("loc_castle_town")]).state : s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = play(t, [HOUR]).state; return t; };
  const t = inTown(ready);
  assert.ok(stamina(t) < 3, "the eighth escort leaves her spent: the lead job asks for 3");
  assert.strictEqual(offered(t, "opt_guild_clerk_escort_lead"), false);
  const full = structuredClone(t);
  growth(full).resources.stamina.current = 6;
  assert.strictEqual(offered(full, "opt_guild_clerk_escort_lead"), true);
  const three = structuredClone(full);
  growth(three).resources.stamina.current = 3;
  assert.strictEqual(offered(three, "opt_guild_clerk_escort_lead"), true, "exactly 3 is enough");
  const two = structuredClone(full);
  growth(two).resources.stamina.current = 2;
  assert.strictEqual(offered(two, "opt_guild_clerk_escort_lead"), false, "3 stamina");
  assert.strictEqual(offered(two, "opt_guild_clerk_escort"), true, "the ordinary escort asks for 2");
  const sevenReady = inTown(play(crossing.sevenEscorts, [M("loc_castle_town")]).state);
  growth(sevenReady).resources.stamina.current = 6;
  assert.strictEqual(offered(sevenReady, "opt_guild_clerk_escort_lead"), false, "not before the practice is full");
  assert.ok(!play(sevenReady, ASK).said.includes(LEAD_TEXT));
  // the clerk offers it, and only when there is a convoy to lead
  assert.ok(play(full, ASK).said.includes(LEAD_TEXT), "the clerk offers the lead");
  const none = play(full, LEAD).state;
  const idle = play(none, [M("loc_castle_town")]).state;
  assert.strictEqual(wanted(idle), false);
  assert.ok(!play(idle, ASK).said.includes(LEAD_TEXT), "no convoy, no offer");
  assert.strictEqual(rejected(idle, LEAD[0]) ?? rejected(play(idle, [LEAD[0]]).state, LEAD[1]), "requirements_not_met", "and no job");
  return full;
}

// 3. pay by tier, cost, regard
function testLead(full) {
  const seen = new Set();
  for (const tier of ["great", "success", "fail"]) {
    const r = withTier(full, tier);
    seen.add(tier);
    const after = r.state;
    const pay = { great: 8, success: 6, fail: 2 }[tier] + (tier !== "fail" && standing(r.before) >= 10 ? 1 : 0);
    assert.strictEqual(me(after).money - me(r.before).money, pay, `pay on ${tier}`);
    assert.strictEqual(growth(r.before).resources.stamina.current - growth(after).resources.stamina.current, 3, "3 stamina, whatever comes of it");
    assert.strictEqual(me(after).locationId, "loc_far_bank", "ends at the far bank");
    assert.strictEqual(after.signals.guards_hired, r.before.signals.guards_hired + 1, "one share paid");
    assert.strictEqual(after.time.minute - r.before.time.minute >= 720, true);
    assert.strictEqual(growth(after).proficiency.combat, 100, "nothing more to learn");
    assert.ok(r.said.includes({ great: "txt_lead_great", success: "txt_lead_success", fail: "txt_lead_fail" }[tier]));
    if (tier === "fail") {
      assert.strictEqual(me(r.before).hp.current - me(after).hp.current, 3, "a failure costs 3 hp");
      assert.strictEqual(growth(after).traits.road_wound, true, "and a wound");
      assert.strictEqual(standing(after), standing(r.before), "a failure adds no regard");
      assert.ok(!r.said.includes("txt_escort_known_bonus"));
    } else {
      assert.strictEqual(standing(after) - standing(r.before), 10, "the guild's regard twice as fast");
      assert.ok(r.said.includes("txt_escort_known_bonus"), "a known guard's bonus");
      assert.strictEqual(me(after).hp.current, me(r.before).hp.current);
    }
  }
  assert.deepStrictEqual([...seen].sort(), ["fail", "great", "success"]);
  // against the ordinary escort on the same roll: the same tier, more pay, one more stamina
  const same = structuredClone(full);
  const ord = play(same, ESCORT);
  const led = play(same, LEAD);
  assert.strictEqual(lastCheck(ord).tier, lastCheck(led).tier, "the same check on the same roll");
}

// 4. the character's: a successor has none; a save past 100 has none; a save a step short gets it
function testWhose(full) {
  // staged: the last point of hp and a failed lead -- the road ends her (the only edited state here)
  const fell = structuredClone(full);
  me(fell).hp.current = 1;
  const dead = withTier(fell, "fail");
  assert.deepStrictEqual(dead.state.pending, { kind: "newCharacter" });
  const next = play(dead.state, [NEW_LIFE]).state;
  assert.strictEqual(unlocked(next), false, "a successor has none");
  assert.strictEqual(growth(next).proficiency?.combat, undefined);
  // a save made before it, with the practice already past the threshold: no retroactive unlock
  const old = structuredClone(full);
  delete growth(old).unlocks.unl_road_lead;
  assert.strictEqual(offered(old, "opt_guild_clerk_escort_lead"), false);
  const again = play(old, ESCORT).state;
  assert.strictEqual(unlocked(again), false, "a threshold fires only on crossing");
  // a save a step short: the next escort crosses it
  const short = structuredClone(full);
  delete growth(short).unlocks.unl_road_lead;
  growth(short).proficiency.combat = 95;
  assert.strictEqual(unlocked(play(short, ESCORT).state), true, "95 + 10 crosses 100");
}

// 5. save compatibility, save/load, determinism
function testSaveAndDeterminism(full) {
  const without = structuredClone(worldData);
  const clerk = without.choices.choice_guild_clerk_dialogue.options;
  clerk.splice(clerk.findIndex((o) => o.id === "opt_guild_clerk_escort_lead"), 1);
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "lead-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "lead-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const rest = [...LEAD, M("loc_castle_town"), LODGE, ...ASK];
  const end = play(full, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_lead", full, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, full);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(full, rest).state, end, "the same input, the same world");
}

testMoment();
const full = testOffered();
testLead(full);
testWhose(full);
testSaveAndDeterminism(full);
console.log("V2-Core-105 data-world-road-lead.test.js: all checks passed");
