// V2-Core-73 (#180, Fantasy World Vertical Slice 4, step 2 -- the mill hamlet): the region's second
// settlement, through the ordinary step() API and the real pack. No engine change; additive content
// only (D-92/D-94):
//   reached from the crossroads by a character who knows the way; the miller (a dialogue NPC) tells the
//   region's news, coloured by the leader's fate, and greets one the village honoured once (+5); he buys
//   purifying herbs (2 silver); the flour he sends to the elder opens trade between the settlements -- a
//   world edge (`org_mill_hamlet -> org_village`, `trading`) -- and the market sells the hamlet's bread
//   (+2 HP, +3 stamina) to everyone after, a successor too. +5 with the elder for the carrier.
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
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
// history-41: the dispersal (the leader lives) -- tests/v2/data-world-crossroads.test.js
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
// integrated-36, the scout: the fight (the leader falls)
const TO_HIS_FALL = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), P("act_rest_village"), P("act_rest_village")
];
const TO_HAMLET = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet")];

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
const offered = (state, optionId) => {
  const option = worldData.choices.choice_miller_dialogue.options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const trades = (state) => evaluateCondition({ op: "relation", from: "org_mill_hamlet", to: "org_village", tag: "trading" }, { state, data: worldData, contextKind: "world" });

const leaderLives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const leaderFell = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, TO_HIS_FALL).state;
const atHamlet = run(leaderLives, TO_HAMLET).state;

// 1. the way east: only for a character who knows it
function testWay() {
  assert.deepStrictEqual(validateData(worldData), []);
  const blind = run(leaderLives, [M("loc_crossroads")]).state;
  assert.strictEqual(rejected(blind, M("loc_mill_hamlet")), "requirements_not_met", "the way is not known");
  assert.strictEqual(atHamlet.actors.player_1.locationId, "loc_mill_hamlet");
  assert.strictEqual(rejected(leaderLives, P("act_talk_miller")), "requirements_not_met", "the miller is in the hamlet");
}

// 2. the region's news, coloured by the leader's fate
function testNews() {
  const lives = run(atHamlet, MILLER("opt_miller_news")).log[1];
  assert.deepStrictEqual(texts(lives), ["txt_miller_news", "txt_miller_news_scarred_man"]);
  const fellAt = run(leaderFell, TO_HAMLET).state;
  const fell = run(fellAt, MILLER("opt_miller_news")).log[1];
  assert.deepStrictEqual(texts(fell), ["txt_miller_news", "txt_miller_news_leader_fell"]);
  assert.strictEqual(run(atHamlet, MILLER("opt_miller_news")).state.relations?.["npc_miller:player_1"], undefined, "news earns nothing");
}

// 3. one the village honoured is greeted once
function testWelcome() {
  const honoured = structuredClone(atHamlet);
  honoured.relations["org_village:player_1"] = { score: 20, mode: "neutral", tags: ["trusted"] };
  const first = run(honoured, MILLER("opt_miller_news"));
  assert.deepStrictEqual(texts(first.log[1]), ["txt_miller_news", "txt_miller_news_scarred_man", "txt_miller_welcome"]);
  assert.deepStrictEqual([first.state.relations["npc_miller:player_1"].score, first.state.relations["npc_miller:player_1"].tags], [5, ["welcomed"]]);
  const again = run(first.state, MILLER("opt_miller_news"));
  assert.ok(!texts(again.log[1]).includes("txt_miller_welcome"));
  assert.strictEqual(again.state.relations["npc_miller:player_1"].score, 5, "once");
}

// 4. herbs for silver
function testHerbTrade() {
  assert.strictEqual(offered(atHamlet, "opt_miller_sell_herb"), false, "no herbs");
  const carrying = structuredClone(atHamlet);
  carrying.actors.player_1.inventory.item_purifying_herb = 2;
  const sold = run(carrying, [...MILLER("opt_miller_sell_herb"), ...MILLER("opt_miller_sell_herb")]);
  assert.strictEqual(me(sold.state).money - me(carrying).money, 4);
  assert.strictEqual(me(sold.state).inventory.item_purifying_herb ?? 0, 0);
  assert.deepStrictEqual(texts(sold.log[1]), ["txt_miller_buy_herb"]);
}

// 5. the flour: trade between the settlements, for the world; the market's bread
function testTrade() {
  assert.ok(offered(atHamlet, "opt_miller_flour"));
  const carrying = run(atHamlet, MILLER("opt_miller_flour"));
  assert.deepStrictEqual(texts(carrying.log[1]), ["txt_miller_flour"]);
  assert.strictEqual(me(carrying.state).inventory.item_flour_sack, 1);
  assert.strictEqual(offered(carrying.state, "opt_miller_flour"), false, "one sack in hand at a time");
  // the market sells nothing of the hamlet yet
  const before = run(carrying.state, [M("loc_crossroads"), M("loc_village"), M("loc_market")]);
  assert.ok(!before.log.some((r) => texts(r).includes("txt_hamlet_carts")));
  assert.strictEqual(rejected(before.state, P("act_buy_mill_bread")), "requirements_not_met");
  // delivered
  const elderBefore = before.state.relations["npc_elder:player_1"].score;
  const delivered = run(before.state, [M("loc_village"), ...E("opt_deliver_flour")]);
  assert.deepStrictEqual(texts(delivered.log[2]), ["txt_deliver_flour"]);
  assert.ok(trades(delivered.state));
  assert.strictEqual(delivered.state.relations["npc_elder:player_1"].score, elderBefore + 5);
  assert.strictEqual(me(delivered.state).inventory.item_flour_sack ?? 0, 0);
  const secondSack = structuredClone(run(delivered.state, [P("act_talk_elder")]).state);
  secondSack.actors.player_1.inventory.item_flour_sack = 1;
  assert.strictEqual(rejected(secondSack, C("opt_deliver_flour")), "requirements_not_met", "trade opens once: no second +5");
  // the carts at the market (once for the world) and the bread
  const market = run(delivered.state, [M("loc_market")]);
  assert.deepStrictEqual(texts(market.log[0]), ["txt_hamlet_carts"]);
  const hurt = structuredClone(market.state);
  hurt.actors.player_1.hp.current = 3;
  hurt.actors.player_1.growth.growth_wanderer.resources.stamina.current = 1;
  const fed = run(hurt, [P("act_buy_mill_bread"), P("act_eat_mill_bread")]);
  assert.strictEqual(me(fed.state).money, me(hurt).money - 1);
  assert.deepStrictEqual([me(fed.state).hp.current, me(fed.state).growth.growth_wanderer.resources.stamina.current], [5, 4]);
  assert.deepStrictEqual(texts(fed.log[1]), ["txt_eat_mill_bread"]);
  assert.strictEqual(me(fed.state).inventory.item_mill_bread ?? 0, 0);
  assert.ok(!run(market.state, [M("loc_village"), M("loc_market")]).log.some((r) => texts(r).includes("txt_hamlet_carts")), "once");
  // the miller knows, and asks for no more flour
  const back = run(delivered.state, [M("loc_crossroads"), M("loc_mill_hamlet")]).state;
  assert.strictEqual(offered(back, "opt_miller_flour"), false);
  assert.ok(texts(run(back, MILLER("opt_miller_news")).log[1]).includes("txt_miller_trade_running"));
  const poor = structuredClone(market.state);
  poor.actors.player_1.money = 0;
  assert.strictEqual(rejected(poor, P("act_buy_mill_bread")), "requirements_not_met", "1 silver");
  return delivered.state;
}

// 6. a successor: the trade stays (the world's); the miller's greeting does not
function testSuccessor(traded) {
  let s = run(traded, [M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.ok(trades(next), "the world's edge");
  const bread = run(next, [M("loc_market"), P("act_buy_mill_bread")]).state;
  assert.strictEqual(bread.actors.player_2.inventory.item_mill_bread, 1);
  assert.strictEqual(rejected(next, M("loc_crossroads")), undefined, "the road stays open");
  assert.strictEqual(rejected(run(next, [M("loc_crossroads")]).state, M("loc_mill_hamlet")), "requirements_not_met", "the way east is the successor's to learn");
}

// 7. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/mill|flour/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [...MILLER("opt_miller_flour"), M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour")];
  const end = run(atHamlet, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_hamlet", atHamlet, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, atHamlet);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
}

testWay();
testNews();
testWelcome();
testHerbTrade();
const traded = testTrade();
testSuccessor(traded);
testSaveAndDeterminism();

console.log("V2-Core-73 data-world-mill-hamlet.test.js: all checks passed");
