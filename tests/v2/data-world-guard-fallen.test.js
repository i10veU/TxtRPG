// V2-Core-102 (#251, World Memory 1, step 1 -- the guild remembers): a guard the guild knew who does not come back,
// through the ordinary step() API and the real pack. No engine change; additive content only (D-92):
//   `evt_known_guard_fell` fires in the very step that kills the player (the trigger pass runs before the game asks for
//   a new character) when the guild clerk knew them (standing >= 10): it counts a WORLD number, `guards_fallen` -- no
//   name, no fate, nothing a successor inherits (D-71). The clerk tells any guard that one did not come back.
//   1. a known guard falls: the count is 1, the very step; the successor starts with no standing, no wound, no
//      knowledge -- and hears it from the clerk (before it, the clerk says nothing of the kind);
//   2. a guard the guild did not know (standing under 10) falls: the world remembers no one;
//   3. the count is a count: a second known guard falling makes it 2, and the clerk tells it the same way;
//   4. save compatibility (the start is the same without it), save/load and determinism.
// The fall itself is staged where it must be (the scout's hp set to its last point and her strength to nothing: a
// known guard does not die by chance); everything after is the ordinary game. The words are Provisional (no name, no
// fate); the count is world state. No Canon.
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
const FALLEN = "txt_guild_clerk_fallen";

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

// 1. a known guard falls
function testKnownFalls() {
  assert.strictEqual(standing(known), 10, "known to the guild");
  assert.strictEqual(known.signals.guards_fallen, undefined);
  assert.ok(!play(known, ASK).said.includes(FALLEN), "before it, the clerk says nothing of the kind");
  const fell = doomed(known);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" }, "the road ended her");
  assert.strictEqual(fell.state.signals.guards_fallen, 1, "remembered in the very step that killed her");
  const last = fell.log.at(-1);
  assert.ok(last.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_known_guard_fell"));
  // the next life: the world's number stays; nothing personal does
  const next = play(fell.state, [NEW_LIFE]);
  assert.strictEqual(next.state.signals.guards_fallen, 1, "a new life does not add or lose it");
  assert.strictEqual(standing(next.state), undefined, "no standing");
  assert.ok(!growth(next.state).traits?.road_wound, "no wound");
  assert.deepStrictEqual(next.state.knowledge?.[next.state.player.actorId] ?? {}, {}, "no knowledge");
  return next.state;
}

// 1b. the successor hears it from the clerk, in the town
function testSuccessorHears(next) {
  const walk = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
  const inTown = play(next, walk);
  const asked = play(inTown.state, ASK);
  assert.ok(asked.said.includes(FALLEN), "the successor hears that a guard did not come back");
  assert.ok(!asked.said.includes("txt_guild_clerk_knows_you"), "and is not the one the guild knew");
  assert.strictEqual(standing(inTown.state), undefined);
}

// 2. a guard the guild did not know: the world remembers no one
function testUnknownFalls() {
  assert.strictEqual(standing(oneEscort), 5, "one escort: not yet known");
  const fell = doomed(oneEscort);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" });
  assert.strictEqual(fell.state.signals.guards_fallen, undefined, "a guard the guild did not know leaves no trace");
  const next = play(fell.state, [NEW_LIFE]).state;
  assert.ok(!play(next, [M("loc_crossroads")]).said.includes(FALLEN));
}

// 3. the count is a count
function testCounts(next) {
  // a second life earns the guild's standing and falls too (staged: standing set where escorts would have put it)
  const second = structuredClone(next);
  second.relations = { ...second.relations, [`npc_guild_clerk:${second.player.actorId}`]: { ...(second.relations?.[`npc_guild_clerk:${next.player.actorId}`] ?? {}), score: 10 } };
  me(second).locationId = "loc_castle_town";
  const fell = doomed(second);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" });
  assert.strictEqual(fell.state.signals.guards_fallen, 2, "counted again");
  assert.strictEqual(play(fell.state, [NEW_LIFE]).state.signals.guards_fallen, 2);
}

// 4. save compatibility, save/load, determinism
function testSaveAndDeterminism() {
  assert.deepStrictEqual(validateData(worldData), []);
  const without = structuredClone(worldData);
  delete without.events.evt_known_guard_fell;
  delete without.texts[FALLEN];
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "fallen-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "fallen-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const rest = [DAY, DAY, DAY, ...ESCORT];
  const start = staged(known);
  const end = play(start, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_fallen", start, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, start);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(start, rest).state, end, "the same input, the same world");
  assert.strictEqual(end.signals.guards_fallen, 1, "and the fall is in it");
  // a save from before it: the world did not remember, and does not retroactively
  assert.strictEqual(known.signals.guards_fallen, undefined);
}

const next = testKnownFalls();
testSuccessorHears(next);
testUnknownFalls();
testCounts(next);
testSaveAndDeterminism();
console.log("V2-Core-102 data-world-guard-fallen.test.js: all checks passed");
