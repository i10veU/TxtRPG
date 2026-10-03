// V2-Core-70 (#170, Fantasy World Vertical Slice 3, step 3 -- the village's trust): the two stories add
// up, through the ordinary step() API and the real pack. No engine change; additive content (D-92/D-93):
//   a character both the elder and the herbalist trust (15+ on each edge towards them), once both cases
//   are resolved, is honoured in the village's name, once (`org_village -> self`, `trusted`, their own
//   edge, D-71 (2)); the world remembers that someone was (`village_honored`, narration only). The
//   standing changes what is offered: the lantern for 2 instead of 5, the herbalist's salve for 1
//   instead of 3. Two herbs given to the herbalist earn +10 once (`helped`).
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
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
// the scout of V2-Core-60 (seed integrated-36): the bandit leader's fight, then the well -- the route the
// play policy of tests/v2/data-world-two-stories.test.js takes on this seed
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
const me = (state) => state.actors[state.player.actorId];
const edge = (state, from) => state.relations?.[`${from}:${state.player.actorId}`];
const offered = (state, choiceId, optionId) => {
  const option = worldData.choices[choiceId].options.find((o) => o.id === optionId);
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const honorOffered = (state) => offered(state, "choice_elder_dialogue", "opt_village_honor");
const both = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, BOTH_STORIES).state;

// 1. the honour: both cases resolved, both trusted 15+, once
function testHonour() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(both.cases.case_ruins_mystery.stage, "resolved");
  assert.strictEqual(both.cases.case_fouled_well.stage, "resolved");
  assert.ok(edge(both, "npc_elder").score >= 15 && edge(both, "npc_herbalist").score >= 15);
  assert.ok(honorOffered(both));
  assert.deepStrictEqual(texts(run(both, E("opt_small_talk")).log[1]), ["txt_small_talk"], "nobody honoured yet: nothing to remember");
  // each requirement on its own
  const lowHerbalist = structuredClone(both);
  lowHerbalist.relations["npc_herbalist:player_1"].score = 14;
  assert.strictEqual(honorOffered(lowHerbalist), false, "the herbalist's trust");
  const lowElder = structuredClone(both);
  lowElder.relations["npc_elder:player_1"].score = 14;
  assert.strictEqual(honorOffered(lowElder), false, "the elder's trust");
  const wellOpen = structuredClone(both);
  delete wellOpen.cases.case_fouled_well;
  assert.strictEqual(honorOffered(wellOpen), false, "the well's story is not over");
  const banditsOpen = structuredClone(both);
  delete banditsOpen.cases.case_ruins_mystery;
  assert.strictEqual(honorOffered(banditsOpen), false, "the bandits' story is not over");
  // honoured
  const { state, log } = run(both, E("opt_village_honor"));
  assert.deepStrictEqual(texts(log[1]), ["txt_village_honor"]);
  assert.deepStrictEqual([edge(state, "org_village").score, edge(state, "org_village").tags], [20, ["trusted"]]);
  assert.strictEqual(state.flags.village_honored, true);
  assert.strictEqual(honorOffered(state), false, "once");
  // the honoured are greeted as such; the memory is told to others
  assert.deepStrictEqual(texts(run(state, E("opt_small_talk")).log[1]), ["txt_small_talk"]);
  return state;
}

// 2. what the standing changes: the merchants' lantern, the herbalist's salve
function testStanding(honoured) {
  // the lantern: 2 for the honoured, not offered to others
  const atMarket = structuredClone(run(honoured, [M("loc_market")]).state);
  atMarket.actors.player_1.money = 5;
  const bought = run(atMarket, [P("act_buy_lantern_trusted")]);
  assert.strictEqual(me(bought.state).money, 3);
  assert.strictEqual(me(bought.state).inventory.item_lantern, 1);
  assert.deepStrictEqual(texts(bought.log[0]), ["txt_buy_lantern_trusted"]);
  const stranger = structuredClone(run(both, [M("loc_market")]).state);
  stranger.actors.player_1.money = 5;
  assert.strictEqual(rejected(stranger, P("act_buy_lantern_trusted")), "requirements_not_met");
  const poor = structuredClone(atMarket);
  poor.actors.player_1.money = 1;
  assert.strictEqual(rejected(poor, P("act_buy_lantern_trusted")), "requirements_not_met", "2 silver");
  // the salve: 1 for the honoured (and only that offer), 3 for one she has talked with
  assert.ok(offered(atMarket, "choice_herbalist_dialogue", "opt_herbalist_buy_salve_trusted"));
  assert.strictEqual(offered(atMarket, "choice_herbalist_dialogue", "opt_herbalist_buy_salve"), false);
  assert.ok(offered(stranger, "choice_herbalist_dialogue", "opt_herbalist_buy_salve"));
  assert.strictEqual(offered(stranger, "choice_herbalist_dialogue", "opt_herbalist_buy_salve_trusted"), false);
  const cheap = run(atMarket, H("opt_herbalist_buy_salve_trusted")).state;
  assert.deepStrictEqual([me(cheap).money, me(cheap).inventory.item_herbal_salve], [4, 1]);
  const dear = run(stranger, H("opt_herbalist_buy_salve")).state;
  assert.deepStrictEqual([me(dear).money, me(dear).inventory.item_herbal_salve], [2, 1]);
  // the salve heals 5, only while hurt
  const full = structuredClone(cheap);
  full.actors.player_1.hp.current = full.actors.player_1.hp.max;
  assert.strictEqual(rejected(full, P("act_apply_salve")), "requirements_not_met", "not hurt");
  const hurt = structuredClone(cheap);
  hurt.actors.player_1.hp.current = 3;
  const healed = run(hurt, [P("act_apply_salve")]);
  assert.strictEqual(me(healed.state).hp.current, 8);
  assert.strictEqual(me(healed.state).inventory.item_herbal_salve ?? 0, 0);
  assert.deepStrictEqual(texts(healed.log[0]), ["txt_apply_salve"]);
}

// 3. two herbs for the herbalist: +10 once -- and before the purification, the remedy's own two
function testGivingHerbs() {
  const H2 = structuredClone(run(both, [M("loc_market")]).state);
  H2.actors.player_1.inventory.item_purifying_herb = 3;
  const before = edge(H2, "npc_herbalist").score;
  const given = run(H2, H("opt_herbalist_give_herbs"));
  assert.strictEqual(edge(given.state, "npc_herbalist").score, before + 10);
  assert.ok(edge(given.state, "npc_herbalist").tags.includes("helped"));
  assert.strictEqual(me(given.state).inventory.item_purifying_herb, 1);
  assert.deepStrictEqual(texts(given.log[1]), ["txt_herbalist_given_herbs"]);
  const again = structuredClone(given.state);
  again.actors.player_1.inventory.item_purifying_herb = 2;
  assert.strictEqual(offered(again, "choice_herbalist_dialogue", "opt_herbalist_give_herbs"), false, "once");
  const one = structuredClone(H2);
  one.actors.player_1.inventory.item_purifying_herb = 1;
  assert.strictEqual(offered(one, "choice_herbalist_dialogue", "opt_herbalist_give_herbs"), false, "two herbs");
  // the choice before the purification: give the two, or have them brewed
  const brewing = BOTH_STORIES.findIndex((a, i) => a.optionId === "opt_herbalist_brew" && i > 0) - 1;
  const atStall = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, BOTH_STORIES.slice(0, brewing)).state;
  assert.ok(offered(atStall, "choice_herbalist_dialogue", "opt_herbalist_give_herbs"));
  assert.ok(offered(atStall, "choice_herbalist_dialogue", "opt_herbalist_brew"));
  const gaveThem = run(atStall, H("opt_herbalist_give_herbs")).state;
  assert.strictEqual(offered(gaveThem, "choice_herbalist_dialogue", "opt_herbalist_brew"), false, "no herbs left for the remedy");
}

// 4. a successor: the world remembers, the honour is not inherited, and can be earned anew
function testSuccessor(honoured) {
  // the first character falls under the ruins' stones (a lantern at the village's price for the dark)
  let s = structuredClone(run(honoured, [M("loc_market")]).state);
  s.actors.player_1.money = 5;
  s = run(s, [P("act_buy_lantern_trusted"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 5 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(edge(next, "org_village"), undefined, "the honour was the first character's");
  assert.strictEqual(next.flags.village_honored, true);
  assert.deepStrictEqual(texts(run(next, E("opt_small_talk")).log[1]), ["txt_small_talk", "txt_small_talk_honored_memory"], "the world remembers");
  assert.strictEqual(rejected(run(next, [M("loc_market")]).state, P("act_buy_lantern_trusted")), "requirements_not_met");
  // the herbalist's trust earned anew: consulted (5), two herbs given (10)
  let earned = run(next, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]).state;
  earned = structuredClone(earned);
  earned.actors.player_2.inventory.item_purifying_herb = 2;
  earned = run(earned, H("opt_herbalist_give_herbs")).state;
  assert.strictEqual(edge(earned, "npc_herbalist").score, 15);
  // with the elder's trust too (the successor's own: here set to 15 as a stand-in for asking and reporting)
  earned = structuredClone(run(earned, [M("loc_village")]).state);
  earned.relations["npc_elder:player_2"] = { score: 15, mode: "neutral", tags: [] };
  assert.ok(honorOffered(earned), "honoured on their own");
}

// 5. save/load and determinism
function testSaveAndDeterminism(honoured) {
  assert.deepStrictEqual(validateState(honoured), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_honoured", both, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, both);
  assert.deepStrictEqual(run(loaded, E("opt_village_honor")).state, honoured, "loaded, the same honour");
  assert.ok(!/org_village|village_honored|item_herbal_salve/.test(JSON.stringify(createInitialState({ worldSeed: "integrated-36", data: worldData }).state)), "a new game writes nothing of it");
}

const honoured = testHonour();
testStanding(honoured);
testGivingHerbs();
testSuccessor(honoured);
testSaveAndDeterminism(honoured);

console.log("V2-Core-70 data-world-village-trust.test.js: all checks passed");
