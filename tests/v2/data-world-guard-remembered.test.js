// V2-Core-104 (#251, World Memory 1, step 3 -- integrated: what the world remembers): a long life, a fall and the lives
// after it in one world, through the ordinary step() API and the real pack. No new rule. The guild remembers
// (V2-Core-102) and the village hears late (V2-Core-103):
//   1. the honoured scout is known to the guild and falls on the road. The next life starts in the village with nothing:
//      no standing, no knowledge -- the elder has heard nothing yet. They walk to the castle town (a few hours): the clerk
//      tells them at once; the village has not heard when they set out and has by the time three days have passed;
//   2. the information gradient, end to end: the guild at once, the village after the caravans' cadence, in that order;
//   3. that life too ends on the road, as no one the guild knew: the world's count does not move and the memory stays --
//      the third life finds the clerk and the elder telling the same, the village's word unchanged;
//   4. save/load in the middle, and determinism.
// The first fall is staged as in data-world-guard-fallen (a known guard does not die by chance); the second life's end
// is staged the same way. Standing, knowledge and wounds are the character's; the count and the village's word are the
// world's (D-71). The words are Provisional (no name, no fate). No Canon.
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

// 1 + 2. the next life: the guild at once, the village late
function testGradient() {
  const fell = doomed(known);
  assert.strictEqual(fell.state.signals.guards_fallen, 1);
  const born = play(fell.state, [NEW_LIFE]);
  assert.strictEqual(standing(born.state), undefined, "no standing");
  assert.deepStrictEqual(born.state.knowledge?.[born.state.player.actorId] ?? {}, {}, "no knowledge");
  assert.ok(!play(born.state, SMALL_TALK).said.includes(WORD), "the elder has heard nothing yet");
  // the road to the town: a few hours
  const inTown = play(born.state, NEXT_LIFE_TO_TOWN);
  assert.ok(inTown.state.time.minute - born.state.time.minute < 4320, "the walk is shorter than the caravans' cadence");
  assert.strictEqual(inTown.state.flags.guard_fall_word_south, undefined, "the village has not heard when they set out");
  const clerk = play(inTown.state, ASK);
  assert.ok(clerk.said.includes(FALLEN), "the clerk tells them at once");
  // home, and the village has heard by the time three days have passed
  const home = play(clerk.state, HOME);
  let s = home.state;
  for (let h = 0; s.flags.guard_fall_word_south !== true; h += 1) {
    assert.ok(h <= 100, "the village hears within about three days");
    s = play(s, [{ type: "wait", minutes: 60 }]).state;
  }
  assert.ok(s.time.minute - born.state.time.minute >= 4320, "the cadence has passed");
  assert.ok(play(s, SMALL_TALK).said.includes(WORD), "the elder tells it now");
  assert.strictEqual(standing(s), undefined, "and the walker is no one the guild knew");
  return s;
}

// 3. that life ends too, as no one the guild knew: the count does not move, the memory stays
function testStays(home) {
  assert.strictEqual(home.signals.guards_fallen, 1);
  const ends = (() => {
    const t = structuredClone(home);
    me(t).locationId = "loc_castle_town";
    return doomed(t);
  })();
  assert.deepStrictEqual(ends.state.pending, { kind: "newCharacter" });
  assert.strictEqual(ends.state.signals.guards_fallen, 1, "no one the guild knew: the count does not move");
  const third = play(ends.state, [NEW_LIFE]).state;
  assert.strictEqual(third.signals.guards_fallen, 1);
  assert.strictEqual(third.flags.guard_fall_word_south, true, "the village's word stays");
  assert.ok(play(third, SMALL_TALK).said.includes(WORD), "the village still tells it");
  const town = play(third, NEXT_LIFE_TO_TOWN).state;
  assert.ok(play(town, ASK).said.includes(FALLEN), "and so does the clerk");
}

// 4. save/load in the middle, and determinism
function testSaveAndDeterminism() {
  const start = staged(known);
  const rest = [DAY, DAY, DAY, ...ESCORT, NEW_LIFE, ...NEXT_LIFE_TO_TOWN, ...ASK];
  const end = play(start, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const midway = play(start, [DAY, DAY, DAY, ...ESCORT, NEW_LIFE]).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_remembered", midway, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, midway);
  assert.deepStrictEqual(play(loaded, [...NEXT_LIFE_TO_TOWN, ...ASK]).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(start, rest).state, end, "the same input, the same world");
}

const home = testGradient();
testStays(home);
testSaveAndDeterminism();
console.log("V2-Core-104 data-world-guard-remembered.test.js: all checks passed");
