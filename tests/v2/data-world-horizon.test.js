// V2-Core-75 (#180, Fantasy World Vertical Slice 4, step 4 -- integrated horizon): the three layers --
// village -> region -> outside world -- played through in one world, through the ordinary step() API and
// the real pack. No new rule. A small deterministic play policy (below) walks the horizon from any state:
// it learns the region's roads, reads the land at the crossroads, carries the hamlet's flour to the elder
// (asking the miller's news on the way), hears the ferryman, crosses (by fare, or by the elder's letter)
// and reads the far bank's board. It plays:
//   1. the dispersed world (the leader lives): his trail, the scarred man at the ford and across the
//      river, his bounty on the board; trade opens between the settlements;
//   2. a successor in that world: nothing inherited (no knowledge, no letter), the world's trade and
//      caravans go on, the successor walks the horizon on their own, by fare;
//   3. the scout's world of Slice 3 (the leader fell, the village honoured the scout): the toll post, his
//      fall told by the miller and the ferryman, the miller's welcome, the elder's letter, the safe road
//      and the village's name on the board -- the earlier stories carried to the edge of the world;
//   4. save/load in the middle of the horizon, and determinism.
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
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
const REST = P("act_rest_village");

// the walkable map (the far bank is reached only by the ferry; its way back is free)
const ROADS = {
  loc_village: ["loc_market", "loc_ruins", "loc_forest_spring", "loc_crossroads"],
  loc_market: ["loc_village"],
  loc_ruins: ["loc_village"],
  loc_forest_spring: ["loc_village"],
  loc_crossroads: ["loc_village", "loc_mill_hamlet", "loc_river_ford"],
  loc_mill_hamlet: ["loc_crossroads"],
  loc_river_ford: ["loc_crossroads"],
  loc_far_bank: ["loc_river_ford"]
};
function nextHop(from, to) {
  const seen = new Map([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === to) break;
    for (const next of ROADS[at]) if (!seen.has(next)) { seen.set(next, at); queue.push(next); }
  }
  let hop = to;
  while (seen.get(hop) !== from) hop = seen.get(hop);
  return hop;
}

// the next actions towards the far bank's board, from any state (null: read)
function nextForHorizon(s) {
  if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
  const id = s.player.actorId;
  const me = s.actors[id];
  const loc = me.locationId;
  const knows = s.knowledge?.[id] ?? {};
  const inventory = me.inventory ?? {};
  const go = (to) => (loc === to ? null : [M(nextHop(loc, to))]);
  const trading = (s.relations?.["org_mill_hamlet:org_village"]?.tags ?? []).includes("trading");
  if (knows.rum_royal_city) return null;
  if (!knows.rum_road_hamlet || !knows.rum_road_ford) return go("loc_village") ?? E("opt_ask_region");
  if (!knows.rum_road_royal) return go("loc_crossroads") ?? [P("act_read_milestone")];
  if (s.facts?.fact_leader_trail === undefined && s.facts?.fact_bandit_toll === undefined) return go("loc_crossroads") ?? [P("act_search_crossroads")];
  if (!trading) {
    if (!inventory.item_flour_sack) return go("loc_mill_hamlet") ?? [...MILLER("opt_miller_news"), ...MILLER("opt_miller_flour")];
    return go("loc_village") ?? E("opt_deliver_flour");
  }
  if (!knows.rum_realm_levy && !knows.rum_realm_fair && !knows.rum_realm_unrest) return go("loc_river_ford") ?? FERRY("opt_ferryman_news");
  if (loc === "loc_far_bank") return [P("act_read_waystation_board")];
  if (!inventory.item_passage_letter && me.money < 3) return go("loc_village") ?? E("opt_elder_letter");
  return go("loc_river_ford") ?? FERRY(inventory.item_passage_letter ? "opt_ferryman_cross_letter" : "opt_ferryman_cross");
}
function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
  log.push({ action, result });
  return result.state;
}
function walkHorizon(state, limit = 120) {
  const log = [];
  for (let i = 0; i < limit; i += 1) {
    const next = nextForHorizon(state);
    if (next === null) return { state, log };
    for (const action of next) state = apply(state, action, log);
  }
  assert.fail("the horizon was not reached within the limit");
}
const run = (state, actions) => actions.reduce((s, a) => apply(s, a, []), state);
const said = (log) => log.flatMap(({ result }) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const deathAtTheRuins = (state) => {
  let s = run(state, [M(nextHop(state.actors[state.player.actorId].locationId, "loc_village"))]);
  while (s.actors[s.player.actorId].locationId !== "loc_village") s = run(s, [M(nextHop(s.actors[s.player.actorId].locationId, "loc_village"))]);
  s = run(s, [M("loc_ruins")]);
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]);
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  return s;
};

// history-41: the dispersal -- the leader lives
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
// integrated-36, the scout of Slice 3: both stories, the arrows told, the village's honour
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

const dispersed = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL);

// 1. the dispersed world: the leader's fate at every layer; trade opens; the board
function testLeaderLives() {
  const { state, log } = walkHorizon(dispersed);
  const lines = said(log);
  for (const t of ["txt_crossroads_first", "txt_crossroads_leader_trail", "txt_miller_news_scarred_man", "txt_deliver_flour", "txt_ferryman_scarred_man", "txt_far_bank_first", "txt_board_bounty"]) {
    assert.ok(lines.includes(t), t);
  }
  for (const t of ["txt_crossroads_toll_post", "txt_miller_news_leader_fell", "txt_ferryman_leader_fell", "txt_board_road_safe", "txt_board_village_name"]) assert.ok(!lines.includes(t), t);
  assert.strictEqual(state.actors.player_1.locationId, "loc_far_bank");
  assert.deepStrictEqual(state.relations["org_mill_hamlet:org_village"].tags, ["trading"]);
  assert.deepStrictEqual(
    ["fact_road_royal", "fact_leader_trail", "fact_leader_crossed", "fact_leader_bounty", "fact_royal_city"].map((f) => state.facts[f].value),
    ["beyond_ford", "toward_ford", "far_bank", "posted", "five_days_north"]
  );
  assert.ok(state.signals.caravan_visits >= 1, "the caravans came while the character walked");
  assert.deepStrictEqual(validateState(state), []);
  return { state, log };
}

// 2. a successor in that world: nothing inherited; the world's trade and caravans go on; the horizon by fare
function testSuccessor(world) {
  const fallen = deathAtTheRuins(world);
  const { state, log } = walkHorizon(fallen);
  assert.strictEqual(state.player.actorId, "player_2");
  const successorLog = log.slice(1);
  const lines = said(successorLog);
  assert.ok(!successorLog.some(({ action }) => action.optionId === "opt_miller_flour" || action.optionId === "opt_deliver_flour"), "the trade is already open");
  assert.ok(successorLog.some(({ action }) => action.optionId === "opt_ferryman_cross"), "by fare: the letter was the predecessor's");
  assert.ok(!lines.includes("txt_crossroads_first") && !lines.includes("txt_far_bank_first"), "the firsts were the world's, once");
  assert.ok(lines.includes("txt_board_bounty"), "the bounty still hangs");
  assert.strictEqual(state.actors.player_2.inventory.item_passage_letter, undefined);
  assert.ok(state.signals.caravan_visits >= world.signals.caravan_visits, "the caravans went on");
  assert.deepStrictEqual(validateState(state), []);
}

// 3. the scout's world: the earlier stories carried to the edge of the world
function testHonouredScout() {
  const scout = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, SCOUT_HONOURED);
  assert.strictEqual(scout.actors.npc_bandit_leader.alive, false);
  assert.deepStrictEqual(scout.relations["org_village:player_1"].tags, ["trusted"]);
  const { state, log } = walkHorizon(scout);
  const lines = said(log);
  for (const t of ["txt_crossroads_toll_post", "txt_miller_news_leader_fell", "txt_miller_welcome", "txt_elder_letter", "txt_ferryman_cross_letter", "txt_ferryman_leader_fell", "txt_board_road_safe", "txt_board_village_name"]) {
    assert.ok(lines.includes(t), t);
  }
  for (const t of ["txt_crossroads_leader_trail", "txt_ferryman_scarred_man", "txt_board_bounty"]) assert.ok(!lines.includes(t), t);
  assert.strictEqual(state.facts?.fact_leader_bounty, undefined);
  assert.deepStrictEqual(state.relations["npc_miller:player_1"].tags, ["welcomed"]);
  const crossing = log.findIndex(({ action }) => action.optionId === "opt_ferryman_cross_letter");
  assert.strictEqual(log[crossing].result.state.actors.player_1.money, log[crossing - 1].result.state.actors.player_1.money, "the letter, not silver");
  assert.deepStrictEqual(validateState(state), []);
}

// 4. save/load in the middle of the horizon; determinism
function testSaveAndDeterminism({ state: end, log }) {
  const mid = log[Math.floor(log.length / 2)].result.state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_horizon", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(walkHorizon(loaded).state, end, "loaded, the same end");
  assert.deepStrictEqual(walkHorizon(dispersed).state, end, "the same input, the same horizon");
}

const lives = testLeaderLives();
testSuccessor(lives.state);
testHonouredScout();
testSaveAndDeterminism(lives);

console.log("V2-Core-75 data-world-horizon.test.js: all checks passed");
