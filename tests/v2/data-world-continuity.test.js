// V2-Core-71 (#170, Fantasy World Vertical Slice 3, step 4 -- integrated continuity): the outcomes of
// both stories carried forward in one world, through the ordinary step() API and the real pack. No new
// rule; it checks that the steps of #170 compose:
//   1. one scout ends both stories, reads the arrows and tells the elder (the leader dead), is honoured
//      by the village, hears the spring's legend two days on, sees the truth and corrects it;
//   2. the scout falls; the successor inherits nothing but hears the changed world -- the arrows in the
//      elder's account and in the bandits' news (the leader dead), the herbalist's corrected tale and
//      her bandit rumor, the village's memory -- and, by a small deterministic play policy, earns the
//      elder's and the herbalist's trust anew and is honoured on their own; the memory then stops being
//      told to them;
//   3. save/load in the middle of the successor's way, and determinism end to end.
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
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
// tests/v2/data-world-village-trust.test.js: the scout of V2-Core-60 ends both stories
const BOTH_STORIES = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_report_spring"), M("loc_village")
];
// then: the arrows told, the honour, two days, the legend, the truth at the spring, the correction
const CONSEQUENCES = [
  ...E("opt_tell_spring_arrows"), ...E("opt_village_honor"),
  M("loc_market"), DAY, DAY, ...H("opt_herbalist_ask_sickness"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_correct_legend")
];

function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
  log.push({ action, result });
  return result.state;
}
const run = (state, actions) => {
  const log = [];
  for (const action of actions) state = apply(state, action, log);
  return { state, log };
};
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const rel = (state, from) => state.relations?.[`${from}:${state.player.actorId}`] ?? { score: 0, tags: [] };

// the next actions towards the village's honour, from any state (null: honoured). It rests to full in
// the village, and leaves the ruins or the spring when HP runs low
function nextForHonour(s) {
  if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
  const id = s.player.actorId;
  const me = s.actors[id];
  const loc = me.locationId;
  const hp = me.hp.current;
  const stamina = me.growth.growth_wanderer.resources?.stamina?.current ?? 6;
  const inventory = me.inventory ?? {};
  const knows = s.knowledge?.[id] ?? {};
  const go = (to) => (loc === to ? null : loc === "loc_village" ? [M(to)] : [M("loc_village")]);
  const recover = (needStamina) => {
    if (loc === "loc_village" && (hp < me.hp.max || needStamina)) return [REST];
    return hp <= 4 || needStamina ? go("loc_village") : null;
  };
  if ((rel(s, "org_village").tags ?? []).includes("trusted")) return null;
  const elder = rel(s, "npc_elder");
  const herbalist = rel(s, "npc_herbalist");
  if (elder.score < 15) {
    if (!knows.rum_ruins_secret) return go("loc_village") ?? E("opt_ask_ruins");
    if (!inventory.item_relic) {
      if (!inventory.item_lantern) return go("loc_market") ?? [P("act_buy_lantern")];
      return recover(false) ?? go("loc_ruins") ?? [P("act_investigate_ruins")];
    }
    if (!(elder.tags ?? []).includes("confidant")) return go("loc_village") ?? E("opt_report_findings");
  }
  if (herbalist.score < 15) {
    if (!(herbalist.tags ?? []).includes("consulted")) return go("loc_market") ?? H("opt_herbalist_ask_sickness");
    if ((inventory.item_purifying_herb ?? 0) >= 2) return go("loc_market") ?? H("opt_herbalist_give_herbs");
    return recover(stamina < 2) ?? go("loc_forest_spring") ?? [P("act_gather_herbs")];
  }
  return go("loc_village") ?? E("opt_village_honor");
}
function playForHonour(state, limit = 200) {
  const log = [];
  for (let i = 0; i < limit; i += 1) {
    const next = nextForHonour(state);
    if (next === null) return { state, log };
    for (const action of next) state = apply(state, action, log);
  }
  assert.fail("not honoured within the limit");
}

const scoutStart = () => createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state;

// 1. one scout carries both stories to their consequences
function testOneCharacter() {
  const both = run(scoutStart(), BOTH_STORIES).state;
  assert.ok(both.knowledge.player_1.rum_spring_bandits, "the scout knew the hideout and read the arrows");
  const { state, log } = run(both, CONSEQUENCES);
  const said = (optionId) => texts(log.find(({ action }) => action.optionId === optionId).result);
  assert.deepStrictEqual(said("opt_tell_spring_arrows"), ["txt_tell_spring_arrows", "txt_spring_bandits_leader_dead"], "the leader fell in the fight");
  assert.deepStrictEqual(said("opt_village_honor"), ["txt_village_honor"]);
  assert.deepStrictEqual(said("opt_herbalist_ask_sickness"), ["txt_herbalist_well_legend", "txt_herbalist_bandit_rumor"], "two days on: the legend, and the arrows' rumor");
  assert.ok(log.some(({ action, result }) => action.actionId === "act_search_spring" && texts(result).includes("txt_search_spring_purified")));
  assert.deepStrictEqual(said("opt_herbalist_correct_legend"), ["txt_herbalist_correct_legend"]);
  // the world's record, and the scout's own standing
  assert.deepStrictEqual(
    [state.flags.spring_bandits_told, state.flags.well_tale_corrected, state.flags.village_honored],
    [true, true, true]
  );
  assert.deepStrictEqual([rel(state, "npc_elder").score, rel(state, "npc_herbalist").score], [20, 20], "15 each, the arrows (+5), the correction (+5)");
  assert.deepStrictEqual(rel(state, "org_village").tags, ["trusted"]);
  assert.deepStrictEqual(validateState(state), []);
  return state;
}

// 2. the successor: the changed world told, nothing inherited, the honour earned anew
function testSuccessor(world) {
  let s = run(world, [M("loc_village"), M("loc_ruins")]).state; // the scout's night vision, the ruins' stones
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.player.actorId, "player_2");
  for (const from of ["npc_elder", "npc_herbalist", "org_village"]) assert.strictEqual(next.relations[`${from}:player_2`], undefined, from);
  assert.deepStrictEqual(next.knowledge?.player_2 ?? {}, {});
  // what the village tells them
  const heard = run(next, [...E("opt_small_talk"), ...E("opt_ask_ruins"), ...E("opt_ask_bandit_news"), M("loc_market"), ...H("opt_herbalist_ask_sickness")]).log;
  assert.deepStrictEqual(texts(heard[1].result), ["txt_small_talk", "txt_small_talk_honored_memory"]);
  assert.deepStrictEqual(texts(heard[3].result), ["txt_ask_ruins", "txt_ask_ruins_spring"]);
  assert.strictEqual(texts(heard[5].result).at(-1), "txt_spring_bandits_leader_dead");
  assert.deepStrictEqual(texts(heard[8].result), ["txt_herbalist_well_corrected", "txt_herbalist_bandit_rumor"]);
  // and earns the honour on their own
  const { state, log } = playForHonour(next);
  assert.deepStrictEqual(rel(state, "org_village").tags, ["trusted"]);
  assert.ok(rel(state, "npc_elder").tags.includes("confidant"), "the successor's own report");
  assert.ok(rel(state, "npc_herbalist").tags.includes("helped"), "the successor's own herbs");
  assert.ok(!rel(state, "npc_herbalist").tags.includes("purifier"), "the spring was not theirs");
  assert.ok(log.some(({ action }) => action.actionId === "act_investigate_ruins"), "their own relic");
  assert.deepStrictEqual(texts(run(state, E("opt_small_talk")).log[1].result), ["txt_small_talk"], "honoured themselves: no memory told to them");
  assert.deepStrictEqual(validateState(state), []);
  return { next, end: state, log };
}

// 3. save/load in the middle of the successor's way; determinism end to end
function testSaveAndDeterminism(world, { next, end, log }) {
  const mid = log[Math.floor(log.length / 2)].result.state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_continuity", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(playForHonour(loaded).state, end, "loaded, the same end");
  assert.deepStrictEqual(playForHonour(next).state, end, "the same input, the same successor");
  assert.deepStrictEqual(run(run(scoutStart(), BOTH_STORIES).state, CONSEQUENCES).state, world, "the same input, the same world");
}

const world = testOneCharacter();
const successor = testSuccessor(world);
testSaveAndDeterminism(world, successor);

console.log("V2-Core-71 data-world-continuity.test.js: all checks passed");
