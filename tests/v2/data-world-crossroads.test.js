// V2-Core-72 (#180, Fantasy World Vertical Slice 4, step 1 -- the old crossroads): the world beyond the
// village begins, through the ordinary step() API and the real pack. No engine change; additive content
// only (D-92/D-94):
//   the road opens once the bandits' case is resolved (they held it); the first walker is narrated once
//   for the world; the milestone (INT + investigation) records the region's roads (the world's truth)
//   and the character reads them -- the mill hamlet east, the river ford north, the royal road beyond the
//   ford; the elder tells the same (told, not seen); searching the crossroads (PER) reads the bandit
//   leader's fate in the land -- his trail toward the ford if he lives, the abandoned toll post if he fell.
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
// history-41 (tests/v2/data-world-stats.test.js): the confrontation and the dispersal -- the leader lives
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
// integrated-36, the scout (tests/v2/data-world-integrated-combat.test.js): the fight -- the leader falls
const TO_HIS_FALL = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), P("act_rest_village"), P("act_rest_village")
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
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const tier = (result) => result.events.find((e) => e.type === "check.resolved")?.data.tier;
const knowledge = (state) => state.knowledge?.[state.player.actorId] ?? {};
const offered = (state, optionId) => {
  const option = worldData.choices.choice_elder_dialogue.options.find((o) => o.id === optionId);
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
// the first roll of `action` with the given tier (rerolling the stream only)
function rollTo(state, action, wanted, label) {
  for (let i = 0; i < 300; i += 1) {
    const r = step({ ...state, rng: createInitialState({ worldSeed: `${label}-${i}`, data: worldData }).state.rng }, action, worldData);
    if (tier(r) === wanted) return r;
  }
  assert.fail(`no ${wanted} roll for ${JSON.stringify(action)}`);
}

const leaderLives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const leaderFell = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, TO_HIS_FALL).state;

// 1. the road: closed while the bandits hold it, open once their case is resolved; the first walker narrated once
function testRoad() {
  assert.deepStrictEqual(validateData(worldData), []);
  const early = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL.slice(0, 11)).state;
  assert.strictEqual(early.cases?.case_ruins_mystery, undefined);
  assert.strictEqual(rejected(early, M("loc_crossroads")), "requirements_not_met", "the bandits hold the road");
  assert.strictEqual(leaderLives.cases.case_ruins_mystery.stage, "resolved");
  assert.strictEqual(leaderLives.actors.npc_bandit_leader.alive, true);
  const { state, log } = run(leaderLives, [M("loc_crossroads")]);
  assert.strictEqual(state.actors.player_1.locationId, "loc_crossroads");
  assert.deepStrictEqual(texts(log[0]), ["txt_crossroads_first"]);
  assert.strictEqual(state.time.minute - leaderLives.time.minute, 45);
  const again = run(state, [M("loc_village"), M("loc_crossroads")]).log[1];
  assert.deepStrictEqual(texts(again), [], "once for the world");
  return state;
}

// 2. the milestone: the region's roads, first-hand; a failure only practises
function testMilestone(atCrossroads) {
  const read = rollTo(atCrossroads, P("act_read_milestone"), "success", "milestone-ok");
  assert.deepStrictEqual(texts(read), ["txt_read_milestone_success"]);
  assert.deepStrictEqual(
    ["fact_road_hamlet", "fact_road_ford", "fact_road_royal"].map((f) => read.state.facts[f].value),
    ["east", "north", "beyond_ford"]
  );
  for (const r of ["rum_road_hamlet", "rum_road_ford", "rum_road_royal"]) assert.deepStrictEqual(knowledge(read.state)[r].sources, ["obs_loc_crossroads"], r);
  assert.strictEqual(read.state.actors.player_1.growth.growth_wanderer.proficiency.investigation - atCrossroads.actors.player_1.growth.growth_wanderer.proficiency.investigation, 10);
  assert.deepStrictEqual(read.events.find((e) => e.type === "check.resolved").data.modifiers.find((m) => m.source === "stat:int"), { source: "stat:int", value: -1 });
  const missed = rollTo(atCrossroads, P("act_read_milestone"), "fail", "milestone-miss");
  assert.deepStrictEqual(texts(missed), ["txt_read_milestone_fail"]);
  assert.strictEqual(missed.state.facts?.fact_road_hamlet, undefined);
  assert.strictEqual(knowledge(missed.state).rum_road_hamlet, undefined);
  assert.strictEqual(missed.state.actors.player_1.growth.growth_wanderer.proficiency.investigation - atCrossroads.actors.player_1.growth.growth_wanderer.proficiency.investigation, 5);
  assert.strictEqual(rejected(leaderLives, P("act_read_milestone")), "requirements_not_met", "at the crossroads");
}

// 3. the elder tells of the region once the road is open -- told, not seen
function testElder() {
  const early = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL.slice(0, 11)).state;
  assert.strictEqual(offered(early, "opt_ask_region"), false);
  assert.ok(offered(leaderLives, "opt_ask_region"));
  const { state, log } = run(leaderLives, E("opt_ask_region"));
  assert.deepStrictEqual(texts(log[1]), ["txt_elder_region"]);
  assert.deepStrictEqual([knowledge(state).rum_road_hamlet.sources, knowledge(state).rum_road_ford.sources], [["npc_elder"], ["npc_elder"]]);
  assert.strictEqual(knowledge(state).rum_road_royal, undefined, "the royal road is only on the milestone");
  assert.strictEqual(state.facts?.fact_road_hamlet, undefined, "told, not seen: the world's fact is not set");
  assert.deepStrictEqual(state.relations["npc_elder:player_1"], leaderLives.relations["npc_elder:player_1"], "information only");
}

// 4. the leader's fate in the land: his trail if he lives, the toll post if he fell
function testLeaderInTheLand(atCrossroads) {
  const trail = rollTo(atCrossroads, P("act_search_crossroads"), "success", "search-ok");
  assert.deepStrictEqual(texts(trail), ["txt_crossroads_leader_trail"]);
  assert.strictEqual(trail.state.facts.fact_leader_trail.value, "toward_ford");
  assert.deepStrictEqual(knowledge(trail.state).rum_leader_trail.sources, ["obs_loc_crossroads"]);
  assert.strictEqual(trail.state.facts?.fact_bandit_toll, undefined);
  assert.strictEqual(leaderFell.actors.npc_bandit_leader.alive, false);
  const fellAt = run(leaderFell, [M("loc_crossroads")]).state;
  const toll = rollTo(fellAt, P("act_search_crossroads"), "success", "search-ok");
  assert.deepStrictEqual(texts(toll), ["txt_crossroads_toll_post"]);
  assert.strictEqual(toll.state.facts.fact_bandit_toll.value, "abandoned");
  assert.deepStrictEqual(knowledge(toll.state).rum_bandit_toll.sources, ["obs_loc_crossroads"]);
  assert.strictEqual(toll.state.facts?.fact_leader_trail, undefined);
  const gain = (after, before) => after.actors.player_1.growth.growth_wanderer.proficiency.investigation - before.actors.player_1.growth.growth_wanderer.proficiency.investigation;
  assert.strictEqual(gain(trail.state, atCrossroads), 10);
  assert.strictEqual(gain(toll.state, fellAt), 12, "10, and the scout's investigation talent's +2 (D-86)");
  const missed = rollTo(atCrossroads, P("act_search_crossroads"), "fail", "search-miss");
  assert.deepStrictEqual(texts(missed), ["txt_search_crossroads_fail"]);
  assert.strictEqual(missed.state.facts?.fact_leader_trail, undefined);
}

// 5. save compatibility and determinism
function testSaveAndDeterminism(atCrossroads) {
  // (V2-Core-125: but the road's course, drawn at creation for every world and read only once the road is walked)
  const fresh = createInitialState({ worldSeed: "x", data: worldData }).state;
  assert.ok(Number.isInteger(fresh.facts.fact_road_course.value));
  delete fresh.facts.fact_road_course;
  assert.ok(!/road_|leader_trail|bandit_toll|crossroads/.test(JSON.stringify(fresh)), "a new game writes nothing of it");
  const path = [P("act_read_milestone"), P("act_search_crossroads")];
  const end = run(atCrossroads, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_crossroads", atCrossroads, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, atCrossroads);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
}

const atCrossroads = testRoad();
testMilestone(atCrossroads);
testElder();
testLeaderInTheLand(atCrossroads);
testSaveAndDeterminism(atCrossroads);

console.log("V2-Core-72 data-world-crossroads.test.js: all checks passed");
