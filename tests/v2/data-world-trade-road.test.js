// V2-Core-87 (#207, Fantasy World Vertical Slice 7, step 4 -- integrated: the road of trade): goods along the
// road in one world, through the ordinary step() API and the real pack. No new rule. In the dispersed world
// (history-41):
//   1. a trader: the settlements' trade opened by the errand, flour bought day by day at the mill, sold in
//      the town -- the plain price while only the levy is news, the town's want met, its return in the fair's
//      window at the fair's price (heard first from the ferryman), the plain price again once the unrest is
//      the news;
//   2. a world where nobody opened the trade: the errand's sack only, and no flour market north or south;
//   3. a successor: nothing inherited, but the world's trade edge and market counts stay -- the successor
//      buys at the mill and sells in the town with their own silver;
//   4. save/load on the road, and determinism.
// Who carried the flour is player-dependent history; prices, stock and cadences are gameplay values; the
// world's facts about the frontier never change.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
const OPEN_TRADE = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")];
const MILL_TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];
const ACROSS = [P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
const BACK_TO_MILL = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_mill_hamlet")];
const PLAIN = "opt_town_merchant_sell_flour";
const FAIR = "opt_town_merchant_sell_flour_fair";

function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
  log.push(result);
  return result.state;
}
function play(state, actions) {
  const log = [];
  for (const action of actions) state = apply(state, action, log);
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const offered = (s, choiceId, optionId) => {
  const option = worldData.choices[choiceId].options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
};
const sellable = (s) => [PLAIN, FAIR].filter((o) => offered(s, "choice_town_merchant_dialogue", o));
const frontierFacts = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate"].map((f) => [f, s.facts?.[f]?.value]));
// sell every sack the town wants now, at whatever price it offers; returns the state and the prices paid
function sellAll(state) {
  let s = state;
  const paid = [];
  while ((me(s).inventory.item_flour_sack ?? 0) > 0 && sellable(s).length > 0) {
    const [option] = sellable(s);
    const before = me(s).money;
    s = play(s, MERCHANT(option)).state;
    paid.push(me(s).money - before);
  }
  return { state: s, paid };
}

const dispersed = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const FACTS = frontierFacts(dispersed);
const trading = (() => {
  const s = play(dispersed, OPEN_TRADE).state;
  s.actors.player_1.money = 20; // a trader with silver to spend (data-world-flour-demand)
  return s;
})();

// 1. a trader through the levy, the fair and the unrest
function testTrader() {
  // the levy's time: two sacks, the plain price; the town's want met
  const twoSacks = play(trading, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour")]).state;
  assert.strictEqual(offered(twoSacks, "choice_miller_dialogue", "opt_miller_buy_flour"), false, "the mill's day is done");
  const first = play(twoSacks, [DAY, ...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD, ...ACROSS]).state;
  assert.strictEqual(first.signals.caravan_visits, 1);
  const askedLevy = play(first, MERCHANT("opt_town_merchant_ask")).said;
  assert.ok(askedLevy.includes("txt_town_merchant_flour_wanted") && !askedLevy.includes("txt_town_merchant_flour_fair"));
  const levy = sellAll(first);
  assert.deepStrictEqual(levy.paid, [4, 4], "the plain price, two sacks");
  assert.strictEqual(me(levy.state).inventory.item_flour_sack, 1, "the third sack has no buyer yet");
  // back to the mill for more; at the ford the ferryman tells of the fair
  let s = play(levy.state, BACK_TO_MILL).state;
  assert.strictEqual(s.signals.mill_flour_stock, 1, "the day's last sack still there -- unsold flour does not pile up");
  s = play(s, [...MILLER("opt_miller_buy_flour"), DAY, ...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD]).state;
  assert.strictEqual(me(s).inventory.item_flour_sack, 3);
  while ((s.signals.caravan_visits ?? 0) < 2) s = play(s, [DAY]).state;
  const news = play(s, [P("act_talk_ferryman"), C("opt_ferryman_news")]);
  assert.ok(news.said.includes("txt_ferryman_fair"), "heard at the ford");
  const town = play(news.state, ACROSS).state;
  assert.strictEqual(town.signals.caravan_visits, 2);
  assert.strictEqual(town.signals.town_flour_wanted, 2, "the want returned, and did not pile up");
  const askedFair = play(town, MERCHANT("opt_town_merchant_ask")).said;
  assert.ok(askedFair.includes("txt_town_merchant_flour_fair") && askedFair.includes("txt_town_merchant_flour_wanted"));
  const fair = sellAll(town);
  assert.deepStrictEqual(fair.paid, [6, 6], "two sacks at the fair's price");
  assert.strictEqual(me(fair.state).inventory.item_flour_sack, 1, "the town's want, not the trader's sacks, sets the limit");
  // the unrest: the plain price again
  let later = play(fair.state, BACK_TO_MILL).state;
  later = play(later, [...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD]).state;
  while ((later.signals.caravan_visits ?? 0) < 3) later = play(later, [DAY]).state;
  later = play(later, ACROSS).state;
  while (sellable(later).length === 0) later = play(later, [DAY]).state;
  const unrest = sellAll(later);
  assert.deepStrictEqual(unrest.paid.slice(0, 1), [4], "the fair is past");
  assert.deepStrictEqual(frontierFacts(unrest.state), FACTS, "trade changes no fact of the frontier");
  return unrest.state;
}

// 2. nobody opened the trade: the errand only, no flour market
function testNoTrade() {
  const s = play(dispersed, [...E("opt_ask_region"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")]).state;
  assert.strictEqual(s.signals.mill_flour_stock, undefined);
  assert.strictEqual(offered(s, "choice_miller_dialogue", "opt_miller_buy_flour"), false);
  let errand = play(s, [...MILLER("opt_miller_flour"), ...MILL_TO_FORD, ...ACROSS]).state;
  while ((errand.signals.caravan_visits ?? 0) < 2) errand = play(errand, [DAY]).state;
  assert.strictEqual(errand.signals.caravan_visits, 2, "the fair's time");
  assert.strictEqual(me(errand).inventory.item_flour_sack, 1, "the elder's sack, carried north");
  assert.deepStrictEqual(sellable(errand), [], "not for sale, not even at the fair's price");
  assert.strictEqual(errand.signals.town_flour_wanted, undefined, "the town has no trade flour to want");
}

// 3. a successor: the world's trade and market stay, the knowledge does not
function testSuccessor(world) {
  let s = play(world, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = play(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = play(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.player.actorId, "player_2");
  assert.deepStrictEqual(next.knowledge?.player_2 ?? {}, {}, "no knowledge inherited");
  assert.ok(next.relations["org_mill_hamlet:org_village"].tags.includes("trading"), "the world's trade stays");
  const money = me(next).money;
  assert.ok(money >= 5, "a sack and the fare");
  let t = play(next, [...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet")]).state;
  while (!offered(t, "choice_miller_dialogue", "opt_miller_buy_flour")) t = play(t, [DAY]).state;
  t = play(t, [...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD, P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")]).state;
  while (sellable(t).length === 0) t = play(t, [DAY]).state;
  const sold = sellAll(t);
  assert.strictEqual(sold.paid.length, 1);
  assert.strictEqual(me(sold.state).money, money - 2 - 3 + sold.paid[0], "the successor's own silver");
}

// 4. save/load on the road, and determinism
function testSaveAndDeterminism() {
  const half = play(trading, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD]).state;
  const rest = [DAY, DAY, DAY, ...ACROSS, ...MERCHANT("opt_town_merchant_ask"), ...MERCHANT(FAIR), ...MERCHANT(FAIR)];
  const end = play(half, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_trade_road", half, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, half);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(play(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...OPEN_TRADE]).state, []).state;
  again.actors.player_1.money = 20;
  assert.deepStrictEqual(play(play(again, [...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), ...MILL_TO_FORD]).state, rest).state, end, "the same input, the same world");
}

const world = testTrader();
testNoTrade();
testSuccessor(world);
testSaveAndDeterminism();
console.log("V2-Core-87 data-world-trade-road.test.js: all checks passed");
