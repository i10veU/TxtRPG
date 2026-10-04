// V2-Core-91 (#217, Fantasy World Vertical Slice 8, step 4 -- integrated: the frontier comes to the centre): the
// royal city met by a frontier-born player in one world, through the ordinary step() API and the real pack. No
// new rule. In the dispersed world (history-41):
//   1. a traveller who waited at the ford for the fair's news: five days north, the first arrival -- and the fair
//      is over (one who went north at once sees it at its source); the written word that has nothing of the frontier; days later the
//      border's unrest written many ways; then home again, where the frontier's own story is as it was;
//   2. one who corrected the frontier's story and carried it to the castle town: the town tells it rightly, the
//      royal city's written word still has nothing of it -- the information gradient end to end;
//   3. a successor: nothing inherited -- the way must be read again; the first-arrival tale is not repeated;
//   4. save/load on the road north, and determinism.
// Only WB-0011 (the seat of royal power, the greatest market, five days north) and WB-0024 DC-07 are Canon here;
// the royal city's name, powers, size, history and structure stay the owner's (WB-0023).
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
const DAY = { type: "wait", minutes: 1440 };
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
const TO_FORD = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")];
const ACROSS_AND_NORTH = [P("act_talk_ferryman"), C("opt_ferryman_cross"), P("act_read_waystation_board"), M("loc_royal_city")];
const MARKET = P("act_walk_royal_market");
const RECORDS = P("act_read_royal_records");
const HOME = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")];

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
const kn = (s, rumor) => s.knowledge?.[s.player.actorId]?.[rumor];
const frontierFacts = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate", "fact_ruins_secret"].map((f) => [f, s.facts?.[f]?.value]));
const rejected = (state, action) => step(state, action, worldData).events.some((e) => e.type === "action.rejected");

const dispersed = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const FACTS = frontierFacts(dispersed);

// 1. a traveller: heard at the ford, seen at the source; the written word; home again
function testTraveller() {
  // wait at the ford for the second caravan: the ferryman tells of the fair
  let ford = play(dispersed, TO_FORD).state;
  while ((ford.signals.caravan_visits ?? 0) < 2) ford = play(ford, [DAY]).state;
  const heard = play(ford, [P("act_talk_ferryman"), C("opt_ferryman_news")]);
  assert.ok(heard.said.includes("txt_ferryman_fair"));
  assert.deepStrictEqual(kn(heard.state, "rum_realm_fair").sources, ["npc_ferryman"]);
  // the journey: five days; the world moves on -- the third caravan may already have brought the unrest
  const north = play(heard.state, ACROSS_AND_NORTH);
  assert.strictEqual(north.log.at(-1).state.time.minute - north.log.at(-2).state.time.minute, 7200, "five days on the wide road");
  assert.ok(north.said.includes("txt_royal_city_first"), "the first arrival");
  const at = north.state;
  // waiting at the ford for the fair's news costs the fair: five days on the road and the third caravan's news is in
  assert.strictEqual(at.signals.caravan_visits, 3);
  const market = play(at, [MARKET]);
  assert.ok(market.said.includes("txt_royal_market_after_fair"), "the fair is over");
  assert.deepStrictEqual(kn(market.state, "rum_realm_fair").sources, ["npc_ferryman"], "only heard: too late to see it");
  // one who went north without waiting arrives in the fair's window and sees it
  const arrivedEarly = play(dispersed, [...TO_FORD, ...ACROSS_AND_NORTH]).state;
  const early = play(arrivedEarly, [MARKET, RECORDS]);
  assert.ok(early.said.includes("txt_royal_market_fair") && !early.said.includes("txt_royal_market_after_fair"), "the fair, seen at its source");
  assert.deepStrictEqual(kn(early.state, "rum_realm_fair").sources, ["obs_loc_royal_city"]);
  assert.strictEqual(kn(early.state, "rum_realm_fair").confidence, 90, "first-hand");
  assert.ok(!early.said.includes("txt_royal_records_unrest"), "the unrest is not yet news");
  assert.strictEqual(kn(early.state, "rum_realm_unrest"), undefined);
  assert.deepStrictEqual(early.state.facts, arrivedEarly.facts, "walking the market and reading the records change no fact");
  // the written word: the unrest written many ways once it is news; the frontier nowhere
  let s = market.state;
  while (s.facts.fact_realm_unrest?.value !== "known") s = play(s, [DAY]).state;
  const read = play(s, [RECORDS]);
  assert.ok(read.said.includes("txt_royal_records_unrest") && read.said.includes("txt_royal_records_no_frontier"));
  assert.strictEqual(kn(read.state, "rum_realm_unrest").confidence, 50);
  assert.ok(!Object.values(read.state.knowledge.player_1).some((k) => k.sources.includes("src_royal_records") && k.factId !== "fact_realm_unrest"), "nothing of the frontier from the records");
  // home again: the frontier's story as it was
  const home = play(read.state, [...HOME, ...E("opt_ask_bandit_news")]);
  assert.ok(home.said.includes("txt_bandit_legend"), "the village tells its legend, untouched by the journey");
  assert.deepStrictEqual(frontierFacts(home.state), FACTS, "the frontier's facts never change");
  return home.state;
}

// 2. the corrected word reaches the castle town, never the royal city's written word
function testGradient() {
  const seen = play(dispersed, [DAY, DAY, ...E("opt_ask_bandit_news"), P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village")]).state;
  const carried = play(seen, [...TO_FORD, P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town"), P("act_tell_town_ruins"), P("act_read_castle_notices")]);
  assert.strictEqual(carried.state.flags.bandits_truth_north, true);
  assert.ok(carried.said.includes("txt_castle_bandits_truth"), "the castle town tells it rightly");
  const royal = play(carried.state, [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), RECORDS]);
  assert.ok(royal.said.includes("txt_royal_records_no_frontier"), "the royal city's written word has nothing of it");
  assert.deepStrictEqual(frontierFacts(royal.state), FACTS);
}

// 3. a successor: the way is knowledge, the first arrival the world's
function testSuccessor(world) {
  let s = play(world, [M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = play(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = play(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  const bank = play(next, [...TO_FORD, P("act_talk_ferryman"), C("opt_ferryman_cross")]).state;
  assert.ok(rejected(bank, M("loc_royal_city")), "the way must be read again");
  const there = play(bank, [P("act_read_waystation_board"), M("loc_royal_city"), MARKET, RECORDS]);
  assert.ok(!there.said.includes("txt_royal_city_first"), "told once, for the world");
  assert.ok(there.said.includes("txt_royal_market") && there.said.includes("txt_royal_records_no_frontier"));
}

// 4. save/load on the road north, and determinism
function testSaveAndDeterminism() {
  const bank = play(dispersed, [...TO_FORD, P("act_talk_ferryman"), C("opt_ferryman_cross"), P("act_read_waystation_board")]).state;
  const rest = [M("loc_royal_city"), MARKET, RECORDS, DAY, RECORDS, M("loc_far_bank")];
  const end = play(bank, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_royal_journey", bank, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, bank);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD, P("act_talk_ferryman"), C("opt_ferryman_cross"), P("act_read_waystation_board"), ...rest]).state;
  assert.deepStrictEqual(again, end, "the same input, the same world");
}

const world = testTraveller();
testGradient();
testSuccessor(world);
testSaveAndDeterminism();
console.log("V2-Core-91 data-world-royal-journey.test.js: all checks passed");
