// V2-Core-84 (#207, Fantasy World Vertical Slice 7, step 1 -- flour north): through the ordinary step() API
// and the real pack. No engine change; additive content only (D-92/D-97):
//   once the two settlements trade (`HAMLET_TRADES`, opened by delivering the miller's flour to the elder),
//   the mill has flour to spare: the miller sells a sack, and the castle town's merchant buys it for more
//   (World Bible W-04/W-05, Draft; delegated decision WB-0022 DC-06 only that frontier flour sells in the
//   town). An errand's sack for the elder cannot be sold north -- it exists only before the settlements
//   trade. Who carried the flour is player-dependent history; prices are gameplay values.
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
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
// history-41: the dispersal; the miller's flour to the elder (trade opens); the elder's letter
const TO_TRADE = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")
];
const TO_TOWN = [M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];

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
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (state) => state.actors[state.player.actorId];
const offered = (state, choiceId, optionId) => {
  const option = worldData.choices[choiceId].options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const gain = (choiceId, optionId) => worldData.choices[choiceId].options.find((o) => o.id === optionId).effects.find((e) => e.op === "money").add;
const trades = (s) => Boolean(s.relations?.["org_mill_hamlet:org_village"]?.tags?.includes("trading"));

const atMill = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TRADE).state;

// 1. the miller: flour for the road, once the settlements trade
function testMiller() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.ok(trades(atMill), "the settlements trade");
  assert.strictEqual(me(atMill).inventory.item_flour_sack ?? 0, 0);
  assert.ok(offered(atMill, "choice_miller_dialogue", "opt_miller_buy_flour"));
  const bought = run(atMill, MILLER("opt_miller_buy_flour"));
  assert.deepStrictEqual(texts(bought.log[1]), ["txt_miller_sell_flour"]);
  assert.strictEqual(me(bought.state).money, me(atMill).money - 2);
  assert.strictEqual(me(bought.state).inventory.item_flour_sack, 1);
  assert.deepStrictEqual(bought.state.facts, atMill.facts, "his words are his claim: no fact changes");
  const poor = structuredClone(atMill);
  poor.actors.player_1.money = 1;
  assert.strictEqual(offered(poor, "choice_miller_dialogue", "opt_miller_buy_flour"), false, "2 silver");
  // before the settlements trade: the errand, not a sale
  const before = structuredClone(atMill);
  delete before.relations["org_mill_hamlet:org_village"];
  assert.strictEqual(offered(before, "choice_miller_dialogue", "opt_miller_buy_flour"), false, "no trade, no flour to spare");
  assert.ok(offered(before, "choice_miller_dialogue", "opt_miller_flour"), "the errand instead");
  assert.strictEqual(offered(atMill, "choice_miller_dialogue", "opt_miller_flour"), false, "and no errand once they trade");
  return bought.state;
}

// 2. the town's merchant buys it for more; an errand's sack never goes north
function testTown(carrying) {
  const town = run(carrying, TO_TOWN).state;
  assert.strictEqual(me(town).locationId, "loc_castle_town");
  assert.ok(gain("choice_town_merchant_dialogue", "opt_town_merchant_sell_flour") > -gain("choice_miller_dialogue", "opt_miller_buy_flour"), "worth more in the town");
  const sold = run(town, MERCHANT("opt_town_merchant_sell_flour"));
  assert.deepStrictEqual(texts(sold.log[1]), ["txt_town_merchant_buy_flour"]);
  assert.strictEqual(me(sold.state).money, me(town).money + 4);
  assert.strictEqual(me(sold.state).inventory.item_flour_sack ?? 0, 0);
  assert.deepStrictEqual(sold.state.facts, town.facts);
  assert.strictEqual(offered(sold.state, "choice_town_merchant_dialogue", "opt_town_merchant_sell_flour"), false, "nothing left to sell");
  const errand = structuredClone(town);
  delete errand.relations["org_mill_hamlet:org_village"];
  assert.strictEqual(offered(errand, "choice_town_merchant_dialogue", "opt_town_merchant_sell_flour"), false, "the elder's sack is not for sale");
  // only in the castle town
  const farBank = run(town, [M("loc_far_bank")]).state;
  assert.ok(step(farBank, P("act_talk_town_merchant"), worldData).events.some((e) => e.type === "action.rejected"));
  return town;
}

// 3. save compatibility and determinism
function testSaveAndDeterminism(town) {
  assert.ok(!/flour/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), ...TO_TOWN, ...MERCHANT("opt_town_merchant_sell_flour")];
  const rich = structuredClone(atMill);
  rich.actors.player_1.money = 10;
  const end = run(rich, path).state;
  assert.strictEqual(me(end).inventory.item_flour_sack, 1);
  assert.strictEqual(me(end).money, 10 - 4 + 4);
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_flour", rich, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, rich);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(rich, path).state, end, "the same input, the same world");
  assert.ok(town);
}

const carrying = testMiller();
const town = testTown(carrying);
testSaveAndDeterminism(town);
console.log("V2-Core-84 data-world-flour-north.test.js: all checks passed");
