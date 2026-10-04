// V2-Core-85 (#207, Fantasy World Vertical Slice 7, step 2 -- the town's demand has an end): through the
// ordinary step() API and the real pack. No engine change; additive content only (D-92/D-97):
//   the castle town takes only so much flour: two sacks, and once that want is met it comes back a caravan's
//   cadence (three days) after it last came (`evt_town_flour_demand`, `town_flour_wanted`). The mill has two
//   sacks to spare a day (`evt_mill_flour_stock`, `mill_flour_stock`). The merchant and the miller say so.
//   Both are world counts -- the world's market, not a character's -- and begin only once the settlements
//   trade (World Bible W-05, Draft). Amounts and cadences are gameplay values.
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
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal; the miller's flour to the elder (trade opens); the elder's letter -- data-world-flour-north
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
const canBuy = (s) => offered(s, "choice_miller_dialogue", "opt_miller_buy_flour");
// V2-Core-86: at the fair's price the same want is met by its own option
const SELL_OPTIONS = ["opt_town_merchant_sell_flour", "opt_town_merchant_sell_flour_fair"];
const canSell = (s) => SELL_OPTIONS.some((o) => offered(s, "choice_town_merchant_dialogue", o));
const SELL = (s) => MERCHANT(SELL_OPTIONS.find((o) => offered(s, "choice_town_merchant_dialogue", o)));

const atMill = (() => {
  const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TRADE).state;
  s.actors.player_1.money = 20;
  return s;
})();

// 1. nothing before the settlements trade; once they do, the town wants two sacks and the mill has two
function testBegins() {
  assert.deepStrictEqual(validateData(worldData), []);
  const before = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TRADE.slice(0, -10)).state;
  assert.strictEqual(before.signals.town_flour_wanted, undefined, "no trade, no market for it");
  assert.strictEqual(before.signals.mill_flour_stock, undefined);
  assert.strictEqual(atMill.signals.town_flour_wanted, 2);
  assert.strictEqual(atMill.signals.mill_flour_stock, 2);
  assert.strictEqual(me(atMill).money, 20);
}

// 2. the mill: two sacks a day
function testMill() {
  const two = run(atMill, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour")]);
  assert.strictEqual(me(two.state).inventory.item_flour_sack, 2);
  assert.strictEqual(two.state.signals.mill_flour_stock, 0);
  assert.strictEqual(canBuy(two.state), false, "the day's flour is gone");
  assert.ok(texts(run(two.state, MILLER("opt_miller_news")).log[1]).includes("txt_miller_flour_gone"));
  assert.ok(!texts(run(atMill, MILLER("opt_miller_news")).log[1]).includes("txt_miller_flour_gone"), "while there is flour, nothing said");
  const nextDay = run(two.state, [DAY]).state;
  assert.strictEqual(nextDay.signals.mill_flour_stock, 2, "a day on, two more");
  assert.ok(canBuy(nextDay));
  const later = run(nextDay, [DAY, DAY]).state;
  assert.strictEqual(later.signals.mill_flour_stock, 2, "unsold flour does not pile up");
  return run(nextDay, MILLER("opt_miller_buy_flour")).state; // three sacks in hand
}

// 3. the town: two sacks, then enough -- until a caravan's cadence after its want last came
function testTown(threeSacks) {
  const town = run(threeSacks, TO_TOWN).state;
  assert.strictEqual(me(town).inventory.item_flour_sack, 3);
  assert.strictEqual(town.signals.town_flour_wanted, 2);
  assert.ok(texts(run(town, MERCHANT("opt_town_merchant_ask")).log[1]).includes("txt_town_merchant_flour_wanted"));
  assert.strictEqual(run(town, [DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state.signals.town_flour_wanted, 2, "an unmet want does not pile up");
  const sold = run(town, [...MERCHANT("opt_town_merchant_sell_flour"), ...MERCHANT("opt_town_merchant_sell_flour")]);
  assert.strictEqual(me(sold.state).money, me(town).money + 8);
  assert.strictEqual(sold.state.signals.town_flour_wanted, 0);
  assert.strictEqual(canSell(sold.state), false, "the town has enough");
  const asked = texts(run(sold.state, MERCHANT("opt_town_merchant_ask")).log[1]);
  assert.ok(asked.includes("txt_town_merchant_flour_enough") && !asked.includes("txt_town_merchant_flour_wanted"));
  // the want comes back a caravan's cadence after it last came -- not three days after it was met
  let s = sold.state;
  let days = 0;
  while (!canSell(s)) { s = run(s, [DAY]).state; days += 1; assert.ok(days <= 3, "back within three days"); }
  assert.strictEqual(s.signals.town_flour_wanted, 2);
  assert.ok(s.time.minute - town.time.minute < 4320 + 1440, "measured from when it last came");
  const third = run(s, SELL(s)).state;
  assert.strictEqual(me(third).inventory.item_flour_sack ?? 0, 0);
  assert.strictEqual(third.signals.town_flour_wanted, 1);
  // the merchant says nothing of flour before the settlements trade
  const noTrade = structuredClone(town);
  delete noTrade.relations["org_mill_hamlet:org_village"];
  const plain = texts(run(noTrade, MERCHANT("opt_town_merchant_ask")).log[1]);
  assert.deepStrictEqual(plain, ["txt_town_merchant_south_goods"]);
  return sold.state;
}

// 4. world counts: a successor finds the market as the predecessor left it
function testWorldCounts(sold) {
  let s = sold;
  for (const to of ["loc_far_bank", "loc_river_ford", "loc_crossroads", "loc_village", "loc_ruins"]) s = run(s, [M(to)]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.signals.mill_flour_stock, s.signals.mill_flour_stock, "the world's, not the character's");
  assert.strictEqual(next.signals.town_flour_wanted, s.signals.town_flour_wanted);
}

// 5. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/flour/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), DAY, ...MILLER("opt_miller_buy_flour"), ...TO_TOWN,
    ...MERCHANT("opt_town_merchant_sell_flour"), ...MERCHANT("opt_town_merchant_sell_flour"), DAY, DAY, DAY, ...MERCHANT("opt_town_merchant_sell_flour_fair")];
  const end = run(atMill, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_flour_demand", atMill, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, atMill);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(atMill, path).state, end, "the same input, the same world");
}

testBegins();
const threeSacks = testMill();
const sold = testTown(threeSacks);
testWorldCounts(sold);
testSaveAndDeterminism();
console.log("V2-Core-85 data-world-flour-demand.test.js: all checks passed");
