// V2-Core-86 (#207, Fantasy World Vertical Slice 7, step 3 -- the fair's news): through the ordinary step()
// API and the real pack. No engine change; additive content only (D-92/D-97):
//   while the royal fair is the realm's latest news -- the second caravan brings it, the third brings the
//   border's unrest -- flour fetches more in the castle town (6 silver instead of 4; the same want, the same
//   sack). The merchant says why. The player can learn it before going north the way anyone learns the
//   realm's news: from the ferryman. Information -> judgment -> profit. The window is a world count
//   (`caravan_visits`, as the guard's work reads it -- a fact Condition may not gate a player's option, D-06);
//   prices are gameplay values; the merchant's reason is his claim.
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
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];
const ACROSS = [P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
const FAIR = "opt_town_merchant_sell_flour_fair";
const PLAIN = "opt_town_merchant_sell_flour";

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
const offered = (state, optionId) => {
  const option = worldData.choices.choice_town_merchant_dialogue.options.find((o) => o.id === optionId);
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const visits = (s, n) => {
  const c = structuredClone(s);
  c.signals.caravan_visits = n;
  return c;
};

// two sacks bought at the mill, rich enough to wait
const loaded = (() => {
  const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TRADE).state;
  s.actors.player_1.money = 20;
  return run(s, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour")]).state;
})();

// 1. before the fair: the plain price, nothing said of a fair
function testBeforeTheFair() {
  assert.deepStrictEqual(validateData(worldData), []);
  const town = run(loaded, [...TO_FORD, ...ACROSS]).state;
  assert.strictEqual(town.signals.caravan_visits, 1, "only the levy's news so far");
  assert.ok(offered(town, PLAIN) && !offered(town, FAIR));
  const asked = texts(run(town, MERCHANT("opt_town_merchant_ask")).log[1]);
  assert.ok(!asked.includes("txt_town_merchant_flour_fair"));
  return town;
}

// 2. the fair: heard at the ford, worth more in the town
function testTheFair(town) {
  // waiting at the ford until the second caravan: the ferryman tells of the fair
  let ford = run(loaded, TO_FORD).state;
  while ((ford.signals.caravan_visits ?? 0) < 2) ford = run(ford, [DAY]).state;
  const told = run(ford, [P("act_talk_ferryman"), C("opt_ferryman_news")]);
  assert.ok(texts(told.log[1]).includes("txt_ferryman_fair"), "the news, at the ford");
  assert.strictEqual(told.state.knowledge.player_1.rum_realm_fair.claim, "known");
  const there = run(told.state, ACROSS).state;
  assert.strictEqual(there.signals.caravan_visits, 2);
  assert.ok(offered(there, FAIR) && !offered(there, PLAIN), "the fair's price instead");
  const asked = texts(run(there, MERCHANT("opt_town_merchant_ask")).log[1]);
  assert.ok(asked.includes("txt_town_merchant_flour_fair") && asked.includes("txt_town_merchant_flour_wanted"));
  const facts = there.facts;
  const sold = run(there, MERCHANT(FAIR));
  assert.deepStrictEqual(texts(sold.log[1]), ["txt_town_merchant_buy_flour_fair"]);
  assert.strictEqual(me(sold.state).money, me(there).money + 6);
  assert.strictEqual(me(sold.state).inventory.item_flour_sack, 1);
  assert.strictEqual(sold.state.signals.town_flour_wanted, there.signals.town_flour_wanted - 1, "the same want");
  assert.deepStrictEqual(sold.state.facts, facts, "the merchant's reason is his claim");
  // the fair's price meets the same want (step 2's rate: two sacks at most per caravan's cadence)
  assert.strictEqual(there.signals.town_flour_wanted, 2);
  assert.ok(town);
}

// 3. the fair passes: when the unrest is the news, the plain price again; never both offered
function testAfter() {
  const town = run(loaded, [...TO_FORD, ...ACROSS]).state;
  const after = visits(town, 3);
  assert.ok(offered(after, PLAIN) && !offered(after, FAIR));
  assert.ok(!texts(run(after, MERCHANT("opt_town_merchant_ask")).log[1]).includes("txt_town_merchant_flour_fair"));
  for (const n of [0, 1, 2, 3]) assert.ok(!(offered(visits(town, n), PLAIN) && offered(visits(town, n), FAIR)), `one price at a time (${n})`);
  // no want, no sale at either price
  const full = visits(town, 2);
  full.signals.town_flour_wanted = 0;
  assert.ok(!offered(full, FAIR) && !offered(full, PLAIN));
  // no trade between the settlements, no flour for the fair either
  const noTrade = visits(town, 2);
  delete noTrade.relations["org_mill_hamlet:org_village"];
  assert.ok(!offered(noTrade, FAIR));
  const noSack = visits(town, 2);
  delete noSack.actors.player_1.inventory.item_flour_sack;
  assert.ok(!offered(noSack, FAIR));
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const ford = run(loaded, TO_FORD).state;
  const path = [DAY, DAY, DAY, ...ACROSS, ...MERCHANT("opt_town_merchant_ask"), ...MERCHANT(FAIR), ...MERCHANT(FAIR)];
  const end = run(ford, path).state;
  assert.strictEqual(me(end).money, 20 - 4 + 12);
  assert.deepStrictEqual(validateState(end), []);
  const restored = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_flour_fair", ford, { savedAt: 1 }))));
  assert.deepStrictEqual(restored, ford);
  assert.deepStrictEqual(run(restored, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(ford, path).state, end, "the same input, the same world");
}

const town = testBeforeTheFair();
testTheFair(town);
testAfter();
testSaveAndDeterminism();
console.log("V2-Core-86 data-world-flour-fair.test.js: all checks passed");
