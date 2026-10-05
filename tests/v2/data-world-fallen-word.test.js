// V2-Core-103 (#251, World Memory 1, step 2 -- the village hears): through the ordinary step() API and the real pack.
// No engine change; additive content only (D-92):
//   the road's talk carries a fall south, late (World Bible N-06: news travels with the caravans) -- the same pattern as
//   the corrected tales going north (V2-Core-80): `evt_fallen_word_south`'s first firing counts it out, the next one a
//   caravan's cadence (three days) later sets `guard_fall_word_south`, only once the road is in use. From then on the
//   elder, asked "안부만 묻기", says a guard did not come back -- to anyone, a successor too (the village's word, not the
//   successor's knowledge: none is inherited, D-71). He says no more than the clerk did: nothing of who, nothing of how.
//   1. before it and just after the fall: nothing; three days later: the line;
//   2. a guard the guild did not know: the village never hears;
//   3. the world's facts do not move (a tale is not a fact), the word is the world's and survives another new life;
//   4. save compatibility (the start is the same without it), save/load and determinism.
// The fall itself is staged as in data-world-guard-fallen. The words are Provisional; the three days are a gameplay
// value. No Canon.
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


// 1. before, just after, and three days after the fall
function testLate() {
  assert.ok(!play(scoutInTown, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), ...SMALL_TALK]).said.includes(WORD), "before the fall: nothing");
  const fell = doomed(known);
  assert.strictEqual(fell.state.signals.guards_fallen, 1);
  assert.strictEqual(fell.state.flags.guard_fall_word_south, undefined, "the road has not carried it yet");
  const next = play(fell.state, [NEW_LIFE]);
  assert.strictEqual(me(next.state).locationId, "loc_village");
  // the first firing counts it out (in the step after the fall); the village has not heard
  assert.strictEqual(next.state.signals.fallen_word_age, 1);
  assert.ok(!play(next.state, SMALL_TALK).said.includes(WORD), "just after the fall: the village has not heard");
  // a caravan's cadence later it has
  let s = next.state;
  let waited = 0;
  while (s.flags.guard_fall_word_south !== true) { s = play(s, [{ type: "wait", minutes: 60 }]).state; waited += 1; assert.ok(waited <= 80, "within three days and a bit"); }
  assert.ok(waited >= 60 && waited <= 73, `about three days (${waited} hours): the cooldown`);
  const told = play(s, SMALL_TALK);
  assert.ok(told.said.includes(WORD), "the elder says a guard did not come back");
  assert.strictEqual(told.state.signals.guards_fallen, 1);
  assert.strictEqual(standing(told.state), undefined, "the successor is no one the guild knew");
  // it is carried once: the count stops at 2 however long the road goes on
  let later = told.state;
  for (let d = 0; d < 9; d += 1) later = play(later, [DAY]).state;
  assert.strictEqual(later.signals.fallen_word_age, 2, "carried once");
  // and only along a road in use (staged: a world that counts a fall but whose road was never walked)
  let unwalked = createInitialState({ worldSeed: "word-2", data: worldData }).state;
  unwalked.signals = { ...unwalked.signals, guards_fallen: 1 };
  for (let d = 0; d < 6; d += 1) unwalked = play(unwalked, [DAY]).state;
  assert.strictEqual(unwalked.signals.fallen_word_age, undefined, "no road in use: nothing carries it");
  return { next: next.state, told: told.state };
}

// 2. a guard the guild did not know: the village never hears
function testUnknown() {
  assert.strictEqual(standing(oneEscort), 5);
  const fell = doomed(oneEscort);
  let s = play(fell.state, [NEW_LIFE]).state;
  for (let d = 0; d < 6; d += 1) s = play(s, [DAY]).state;
  assert.strictEqual(s.signals.fallen_word_age, undefined);
  assert.strictEqual(s.flags.guard_fall_word_south, undefined);
  assert.ok(!play(s, SMALL_TALK).said.includes(WORD));
}

// 3. a tale is not a fact; the word is the world's
function testWorldsWord(told) {
  const before = facts(scoutInTown);
  assert.deepStrictEqual(facts(told), before, "the frontier's facts never change: a tale is not a fact");
  const doomedAgain = (() => {
    const second = structuredClone(told);
    second.relations = { ...second.relations, [`npc_guild_clerk:${second.player.actorId}`]: { score: 10 } };
    me(second).locationId = "loc_castle_town";
    return doomed(second);
  })();
  const third = play(doomedAgain.state, [NEW_LIFE]).state;
  assert.strictEqual(third.flags.guard_fall_word_south, true, "another new life: the village already knows");
  assert.ok(play(third, SMALL_TALK).said.includes(WORD));
}

// 4. save compatibility, save/load, determinism
function testSaveAndDeterminism() {
  assert.deepStrictEqual(validateData(worldData), []);
  const without = structuredClone(worldData);
  delete without.events.evt_fallen_word_south;
  delete without.texts[WORD];
  without.choices.choice_elder_dialogue.options.find((o) => o.id === "opt_small_talk").effects.pop();
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "word-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "word-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const start = staged(known);
  const rest = [...ESCORT, NEW_LIFE, ...Array(75).fill({ type: "wait", minutes: 60 }), ...SMALL_TALK];
  const withDays = [DAY, DAY, DAY, ...rest];
  const end = play(start, withDays).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.strictEqual(end.flags.guard_fall_word_south, true);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_word", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(play(loaded, withDays).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(start, withDays).state, end, "the same input, the same world");
}

const { told } = testLate();
testUnknown();
testWorldsWord(told);
testSaveAndDeterminism();
console.log("V2-Core-103 data-world-fallen-word.test.js: all checks passed");
