// V2-Core-77 (#189, Fantasy World Vertical Slice 5, step 2 -- the castle-town market): through the
// ordinary step() API and the real pack. No engine change; additive content only (D-92/D-95):
//   the castle town's merchant (a dialogue NPC, no actor) values the same goods differently from the
//   frontier -- he pays more for the purifying herb than the miller does and sells the iron sword for less
//   than the frontier market (World Bible W-04/W-05, Draft working assumptions; delegated decision WB-0020
//   only that the town has merchants). His reasons are his claim, not truth: talking sets no fact. The
//   prices are gameplay values.
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
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
// history-41: the dispersal, the crossing, the road north -- data-world-castle-town
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
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
const offered = (state, optionId) => {
  const option = worldData.choices.choice_town_merchant_dialogue.options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const optionOf = (choiceId, optionId) => worldData.choices[choiceId].options.find((o) => o.id === optionId);
const gain = (choiceId, optionId) => optionOf(choiceId, optionId).effects.find((e) => e.op === "money").add;

const town = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;

// 1. the merchant: only in the castle town; a dialogue NPC, no actor
function testMerchant() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(town.actors.player_1.locationId, "loc_castle_town");
  assert.strictEqual(worldData.npcs.npc_town_merchant.actor, undefined, "dialogue only (D-92)");
  assert.strictEqual(town.actors.npc_town_merchant, undefined);
  const farBank = run(town, [M("loc_far_bank")]).state;
  assert.strictEqual(rejected(farBank, P("act_talk_town_merchant")), "requirements_not_met", "in the castle town");
  const asked = run(town, MERCHANT("opt_town_merchant_ask"));
  assert.deepStrictEqual(texts(asked.log[1]), ["txt_town_merchant_south_goods"]);
  assert.deepStrictEqual(asked.state.facts, town.facts, "his reasons are his claim: no fact changes");
  assert.deepStrictEqual(asked.state.knowledge, town.knowledge, "and no knowledge recorded as truth");
}

// 2. the same goods, valued differently: the herb is worth more here, the sword costs less
function testPriceGradient() {
  assert.ok(gain("choice_town_merchant_dialogue", "opt_town_merchant_sell_herb") > gain("choice_miller_dialogue", "opt_miller_sell_herb"), "the herb fetches more in the town");
  const frontierSword = -worldData.actions.act_buy_iron_sword.effects.find((e) => e.op === "money").add;
  assert.ok(-gain("choice_town_merchant_dialogue", "opt_town_merchant_buy_sword") < frontierSword, "iron is cheaper in the town");

  assert.strictEqual(offered(town, "opt_town_merchant_sell_herb"), false, "no herb, nothing to sell");
  const withHerbs = structuredClone(town);
  withHerbs.actors.player_1.inventory.item_purifying_herb = 2;
  const sold = run(withHerbs, MERCHANT("opt_town_merchant_sell_herb"));
  assert.deepStrictEqual(texts(sold.log[1]), ["txt_town_merchant_buy_herb"]);
  assert.strictEqual(me(sold.state).inventory.item_purifying_herb, 1);
  assert.strictEqual(me(sold.state).money, me(withHerbs).money + 4);

  const poor = structuredClone(town);
  poor.actors.player_1.money = 1;
  assert.strictEqual(offered(poor, "opt_town_merchant_buy_sword"), false, "2 silver");
  const rich = structuredClone(town);
  rich.actors.player_1.money = 2;
  const bought = run(rich, MERCHANT("opt_town_merchant_buy_sword"));
  assert.deepStrictEqual(texts(bought.log[1]), ["txt_town_merchant_sell_sword"]);
  assert.strictEqual(me(bought.state).money, 0);
  assert.strictEqual(me(bought.state).inventory.item_iron_sword, 1);
  // the sword is the same sword: equipped as before
  const armed = run(bought.state, [P("act_equip_iron_sword")]).state;
  assert.strictEqual(me(armed).loadout?.hand, "item_iron_sword");
}

// 3. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/town_merchant/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const withHerbs = structuredClone(town);
  withHerbs.actors.player_1.inventory.item_purifying_herb = 1;
  const path = [...MERCHANT("opt_town_merchant_ask"), ...MERCHANT("opt_town_merchant_sell_herb"), ...MERCHANT("opt_town_merchant_buy_sword")];
  const end = run(withHerbs, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_market", withHerbs, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, withHerbs);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(withHerbs, path).state, end, "the same input, the same world");
}

testMerchant();
testPriceGradient();
testSaveAndDeterminism();
console.log("V2-Core-77 data-world-town-market.test.js: all checks passed");
