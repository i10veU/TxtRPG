// V2-Core-106 (#258, RPG Depth 3, step 2 -- the memory reaches a choice): through the ordinary step() API and the real
// pack. No engine change; additive content only (D-92):
//   where a guild-known guard has fallen (`guards_fallen`, V2-Core-102) the clerk offers the careful way: "길을 조심스레
//   간다" -- an easier check (8, not 11), a failure that costs nothing (no hp, no wound), and in exchange a whole day on the
//   road (1440 minutes, not 720) and a smaller purse (4 / 3 / 1, not 6 / 4 / 1). It is the world's memory, not the
//   character's: anyone is offered it, a successor too; in a world where no known guard has fallen it is never offered.
//   1. not offered before a fall; after one, the successor is offered it and the clerk says so;
//   2. what it pays, costs and risks by tier;
//   3. the same roll, two ways: where the ordinary escort wounds the successor the careful way leaves them untouched;
//   4. it asks for no standing and does not run out: the next life is offered it too;
//   5. save compatibility (the start is the same without it), save/load and determinism.
// The first fall is staged as in data-world-guard-fallen. Pay, time and difficulty are gameplay values; the words are
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
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BACK_AND_WAIT = [M("loc_castle_town"), DAY, DAY, DAY];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
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
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const WORD = "txt_small_talk_fallen_guard";
const SMALL_TALK = [P("act_talk_elder"), C("opt_small_talk")];
// the frontier's facts (the realm's news advances with the caravans, as it always did)
const facts = (s) => Object.fromEntries(Object.entries(s.facts ?? {}).filter(([k]) => !k.startsWith("fact_realm_")).map(([k, v]) => [k, v?.value]));

const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
// two good escorts: the guild knows her (standing 10); one: standing 5
const oneEscort = play(play(scoutInTown, ESCORT).state, [M("loc_castle_town")]).state;
const known = play(play(oneEscort, [DAY, DAY, DAY, ...ESCORT]).state, [M("loc_castle_town")]).state;
// the fall, staged: the last point of hp, no strength, and a bad roll (the first rng cursor at which the escort's
// check fails -- found deterministically on the staged state): the next escort ends her
function staged(s) {
  const c = structuredClone(s);
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(play(t, [DAY, DAY, DAY]).state, ESCORT);
    if (r.state.pending?.kind === "newCharacter") return t;
  }
  throw new Error("no bad roll within 60 rolls");
}
const doomed = (s) => play(play(staged(s), [DAY, DAY, DAY]).state, ESCORT);



const FALLEN = "txt_guild_clerk_fallen";
const NEXT_LIFE_TO_TOWN = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const HOME = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")];

const CAREFUL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")];
const OFFER = "txt_guild_clerk_careful_offer";
const HOUR = { type: "wait", minutes: 60 };
const optionRequires = (id) => worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires;
const holds = (s, id) => evaluateCondition(optionRequires(id), { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !holds(t, "opt_guild_clerk_escort"); h += 1) t = play(t, [HOUR]).state; assert.ok(holds(t, "opt_guild_clerk_escort"), "a convoy wants a guard"); return t; };
const lastCheckOf = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;
// the first rng cursor at which `option` lands in `tier` on this state
function withTier(state, option, tier) {
  for (let k = 0; k < 120; k += 1) {
    const t = structuredClone(state);
    t.rng.cursor += k;
    const r = play(t, option);
    const got = lastCheckOf(r).tier;
    if (got === tier || (tier === "fail" && got === "partial")) return { before: t, ...r };
  }
  throw new Error(`no ${tier} within 120 rolls`);
}

// the world after the fall, and the successor in the castle town with a convoy to guard
const fell = doomed(known);
const successorInTown = (() => { let s = play(play(fell.state, [NEW_LIFE]).state, NEXT_LIFE_TO_TOWN).state; return waitForConvoy(s); })();

// 1. a remembering world offers it
function testOffered() {
  const before = waitForConvoy(known);
  assert.strictEqual(before.signals.guards_fallen, undefined);
  assert.strictEqual(holds(before, "opt_guild_clerk_escort_careful"), false, "no fall, no careful way");
  assert.ok(!play(before, ASK).said.includes(OFFER));
  assert.strictEqual(successorInTown.signals.guards_fallen, 1);
  assert.strictEqual(holds(successorInTown, "opt_guild_clerk_escort_careful"), true, "after a fall, the successor is offered it");
  assert.ok(play(successorInTown, ASK).said.includes(OFFER), "and the clerk says so");
  // stamina: 2, as the ordinary escort
  const spent = structuredClone(successorInTown);
  growth(spent).resources.stamina.current = 1;
  assert.strictEqual(holds(spent, "opt_guild_clerk_escort_careful"), false);
  growth(spent).resources.stamina.current = 2;
  assert.strictEqual(holds(spent, "opt_guild_clerk_escort_careful"), true, "exactly 2 is enough");
  // and only while a convoy wants a guard
  const idle = play(play(successorInTown, ESCORT).state, [M("loc_castle_town")]).state;
  assert.strictEqual(holds(idle, "opt_guild_clerk_escort_careful"), false, "no convoy, no job");
  assert.ok(!play(idle, ASK).said.includes(OFFER));
}

// 2. pay, cost and risk by tier
function testTiers() {
  const seen = new Set();
  for (const tier of ["great", "success", "fail"]) {
    const r = withTier(successorInTown, CAREFUL, tier);
    seen.add(tier);
    const after = r.state;
    const check = lastCheckOf(r);
    assert.strictEqual(check.difficulty, 8, "the easy way");
    const known_ = standing(r.before) >= 10;
    assert.strictEqual(me(after).money - me(r.before).money, { great: 4, success: 3, fail: 1 }[tier] + (known_ && tier !== "fail" ? 1 : 0), `pay on ${tier}`);
    assert.strictEqual(growth(r.before).resources.stamina.current - growth(after).resources.stamina.current, 2, "2 stamina");
    assert.ok(after.time.minute - r.before.time.minute >= 1440, "a whole day on the road");
    assert.strictEqual(me(after).locationId, "loc_far_bank");
    assert.strictEqual(after.signals.guards_hired, r.before.signals.guards_hired + 1, "one share paid");
    assert.strictEqual((growth(after).proficiency?.combat ?? 0) - (growth(r.before).proficiency?.combat ?? 0), { great: 10, success: 10, fail: 5 }[tier], "it teaches as the ordinary escort does");
    assert.strictEqual(me(after).hp.current, me(r.before).hp.current, `no hp lost on ${tier}`);
    assert.ok(!growth(after).traits?.road_wound, `no wound on ${tier}`);
    assert.ok(r.said.includes({ great: "txt_careful_great", success: "txt_careful_success", fail: "txt_careful_fail" }[tier]));
  }
  assert.deepStrictEqual([...seen].sort(), ["fail", "great", "success"]);
}

// 3. the same roll, two ways
function testSameRoll() {
  for (let k = 0; k < 120; k += 1) {
    const t = structuredClone(successorInTown);
    t.rng.cursor += k;
    const ordinary = play(t, ESCORT);
    if (lastCheckOf(ordinary).tier !== "partial" && lastCheckOf(ordinary).tier !== "fail") continue;
    const careful = play(t, CAREFUL);
    assert.strictEqual(lastCheckOf(careful).total, lastCheckOf(ordinary).total, "the same roll");
    assert.strictEqual(lastCheckOf(ordinary).difficulty - lastCheckOf(careful).difficulty, 3);
    assert.ok(growth(ordinary.state).traits.road_wound, "the ordinary escort wounds on it");
    assert.strictEqual(me(t).hp.current - me(ordinary.state).hp.current, 3);
    assert.ok(!growth(careful.state).traits?.road_wound, "the careful way does not");
    assert.strictEqual(me(careful.state).hp.current, me(t).hp.current);
    assert.strictEqual((careful.state.time.minute - t.time.minute) - (ordinary.state.time.minute - t.time.minute), 720, "and takes a day against half a day");
    return;
  }
  throw new Error("no failing roll for the ordinary escort");
}

// 4. it asks for no standing, and the next life is offered it too
function testNotTheCharacters() {
  assert.strictEqual(standing(successorInTown), undefined, "a guard the guild does not know");
  const ends = (() => { const t = structuredClone(successorInTown); me(t).hp.current = 1; return withTier(t, ESCORT, "fail"); })();
  assert.deepStrictEqual(ends.state.pending, { kind: "newCharacter" });
  assert.strictEqual(ends.state.signals.guards_fallen, 1, "an unknown guard's end does not add to it");
  const third = waitForConvoy(play(play(ends.state, [NEW_LIFE]).state, NEXT_LIFE_TO_TOWN).state);
  assert.strictEqual(holds(third, "opt_guild_clerk_escort_careful"), true, "the next life is offered it too");
}

// 5. save compatibility, save/load, determinism
function testSaveAndDeterminism() {
  assert.deepStrictEqual(validateData(worldData), []);
  const without = structuredClone(worldData);
  const options = without.choices.choice_guild_clerk_dialogue.options;
  options.splice(options.findIndex((o) => o.id === "opt_guild_clerk_escort_careful"), 1);
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "careful-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "careful-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const rest = [...CAREFUL, M("loc_castle_town"), ...ASK];
  const end = play(successorInTown, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_careful", successorInTown, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, successorInTown);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(successorInTown, rest).state, end, "the same input, the same world");
}

testOffered();
testTiers();
testSameRoll();
testNotTheCharacters();
testSaveAndDeterminism();
console.log("V2-Core-106 data-world-escort-careful.test.js: all checks passed");
