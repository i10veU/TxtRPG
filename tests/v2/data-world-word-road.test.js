// V2-Core-83 (#198, Fantasy World Vertical Slice 6, step 4 -- integrated: the road of the word): the
// information gradient played through in one world, through the ordinary step() API and the real pack.
// No new rule. In the dispersed world (history-41) the frontier's truth reaches the castle town -- or does
// not -- three ways:
//   1. the caravans carry it: the village corrects its legend, the correction travels north at the
//      caravans' pace; the town tells the legend, then the corrected account; the elder meanwhile says
//      the north still tells the legend; the ferryman later relays the corrected account back south;
//   2. a character carries it: one who saw the truth tells it at the town's board, ahead of any caravan,
//      though the village never heard it -- the town tells it rightly while the village still tells the
//      legend; the ferryman relays the town's corrected account back south;
//   3. nobody corrects it: the legend goes north, comes back south with the ferryman, and stays -- a
//      successor, knowing nothing, hears the same legend in the town;
//   4. save/load on the road, and determinism.
// Who carried the word is player-dependent history; tales are in-world belief; the delays are gameplay
// values. Through all of it the world's facts never change.
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
const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
const READ = P("act_read_castle_notices");
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal -- the leader lives; two days on, the legend
const TO_LEGEND = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), DAY, DAY, ...E("opt_ask_bandit_news")
];
// ... and the truth seen at the ruins (the character's legend corrected); the village not yet told
const SEE_TRUTH = [P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village")];
const NORTH = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), ...FERRY("opt_ferryman_cross"), M("loc_castle_town")];
const BACK_TO_FORD = [M("loc_far_bank"), M("loc_river_ford")];

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
const frontierFacts = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate"].map((f) => [f, s.facts?.[f]?.value]));
const kn = (s, rumor) => s.knowledge?.[s.player.actorId]?.[rumor];

const legend = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_LEGEND).state;
const seen = play(legend, SEE_TRUTH).state;
const FACTS = frontierFacts(seen);

// 1. the caravans carry it
function testCaravansCarry() {
  assert.strictEqual(kn(seen, "rum_bandits_legend").claim, "dispersed", "the truth seen");
  const corrected = play(seen, E("opt_correct_legend")).state;
  assert.strictEqual(corrected.flags.bandits_tale_corrected, true);
  const asked = play(corrected, E("opt_ask_bandit_news"));
  assert.ok(!asked.said.includes("txt_elder_north_legend"), "no caravan has come back: nothing to say of the north");
  // the road north: the town still tells the legend -- the correction is on the road behind
  const town = play(corrected, [...NORTH, READ]);
  assert.ok(town.said.includes("txt_castle_bandits_tale"), "the legend, the word still on the road");
  assert.strictEqual(town.state.flags.bandits_truth_north, undefined);
  // two days: still on the road; the third: the caravans brought it
  const twoDays = play(town.state, [DAY, DAY, READ]);
  assert.ok(twoDays.said.includes("txt_castle_bandits_tale"), "two days on: still the legend");
  const later = play(twoDays.state, [DAY, READ]);
  assert.strictEqual(later.state.flags.bandits_truth_north, true, "the caravans carried it");
  assert.ok(later.said.includes("txt_castle_bandits_truth"), "the town tells the corrected account");
  assert.ok(!later.said.includes("txt_castle_bandits_tale"));
  assert.ok(kn(later.state, "rum_bandits_fate").sources.includes("src_castle_town_talk"));
  assert.ok(step(later.state, P("act_tell_town_ruins"), worldData).events.some((e) => e.type === "action.rejected"), "nothing left to carry");
  // back south: the ferryman relays the town's corrected account; the elder no longer speaks of a lag
  const ford = play(later.state, [...BACK_TO_FORD, ...FERRY("opt_ferryman_news")]);
  assert.ok(ford.said.includes("txt_ferryman_north_bandits_truth"));
  assert.ok(kn(ford.state, "rum_bandits_fate").sources.includes("npc_ferryman"));
  const home = play(ford.state, [M("loc_crossroads"), M("loc_village"), ...E("opt_ask_bandit_news")]);
  assert.ok(home.said.includes("txt_bandit_news_corrected") && !home.said.includes("txt_elder_north_legend"));
  assert.deepStrictEqual(frontierFacts(home.state), FACTS, "the facts never change");
  // corrected only once the road was busy (a caravan's round trip made): while the word is on the road,
  // the elder says the north still tells the legend -- and stops once the caravans have carried it
  const busy = play(seen, [M("loc_crossroads"), DAY, DAY, DAY, DAY, M("loc_village")]).state;
  assert.ok(busy.signals.caravan_visits >= 2);
  const lag = play(busy, [...E("opt_correct_legend"), ...E("opt_ask_bandit_news")]);
  assert.strictEqual(lag.state.flags.bandits_truth_north, undefined);
  assert.ok(lag.said.includes("txt_elder_north_legend"), "up north they still tell the legend");
  const caught = play(lag.state, [DAY, DAY, DAY, ...E("opt_ask_bandit_news")]);
  assert.strictEqual(caught.state.flags.bandits_truth_north, true);
  assert.ok(!caught.said.includes("txt_elder_north_legend"));
  assert.deepStrictEqual(frontierFacts(caught.state), FACTS);
  return later.state;
}

// 2. a character carries it -- ahead of the caravans, though the village never heard it
function testCharacterCarries() {
  const town = play(seen, [...NORTH, READ]);
  assert.ok(town.said.includes("txt_castle_bandits_tale"));
  const told = play(town.state, [P("act_tell_town_ruins"), READ]);
  assert.strictEqual(told.state.flags.bandits_truth_north, true, "in the town at once");
  assert.strictEqual(told.state.flags.bandits_tale_corrected, undefined, "the village never heard it");
  assert.ok(told.said.includes("txt_castle_bandits_truth"));
  // the town tells it rightly; the ferryman relays that back; the village still tells its legend
  const ford = play(told.state, [...BACK_TO_FORD, DAY, DAY, DAY, ...FERRY("opt_ferryman_news")]);
  assert.ok(ford.state.signals.caravan_visits >= 2);
  assert.ok(ford.said.includes("txt_ferryman_north_bandits_truth"), "the town's corrected account, back south");
  const home = play(ford.state, [M("loc_crossroads"), M("loc_village"), ...E("opt_ask_bandit_news")]);
  assert.ok(home.said.includes("txt_bandit_legend"), "the village's own record still holds the legend");
  assert.ok(!home.said.includes("txt_elder_north_legend"), "nothing corrected here for the north to lag behind");
  // and the village's correction is still there to be made
  const corrected = play(home.state, E("opt_correct_legend"));
  assert.strictEqual(corrected.state.flags.bandits_tale_corrected, true);
  assert.deepStrictEqual(frontierFacts(corrected.state), FACTS, "the facts never change");
}

// 3. nobody corrects it: the legend goes north, comes back, and stays -- for the next life too
function testNobodyCorrects() {
  // at the ford, with only the first caravan come down: nothing has gone up and back yet
  const atFord = play(legend, [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")]).state;
  assert.strictEqual(atFord.signals.caravan_visits, 1);
  assert.ok(!play(atFord, FERRY("opt_ferryman_news")).said.some((t) => t.startsWith("txt_ferryman_north_")));
  const town = play(legend, [...NORTH, READ]);
  assert.ok(town.said.includes("txt_castle_bandits_tale"));
  assert.ok(step(town.state, P("act_tell_town_ruins"), worldData).events.some((e) => e.type === "action.rejected"), "one who only heard the legend has nothing to carry");
  assert.strictEqual(kn(town.state, "rum_bandits_legend").claim, "slain", "the legend, believed");
  const ford = play(town.state, [...BACK_TO_FORD, DAY, DAY, DAY, DAY, DAY, DAY, ...FERRY("opt_ferryman_news")]);
  assert.ok(ford.said.includes("txt_ferryman_north_bandits_tale"), "the legend comes back south");
  assert.ok(kn(ford.state, "rum_bandits_legend").sources.includes("npc_ferryman"));
  assert.strictEqual(ford.state.flags.bandits_truth_north, undefined, "and nothing ever corrects it");
  // a successor: knowing nothing, hears the same legend in the town
  let s = play(ford.state, [M("loc_crossroads"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = play(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = play(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.deepStrictEqual(next.knowledge?.player_2 ?? {}, {}, "no knowledge inherited");
  const there = play(next, [...NORTH, READ]);
  assert.ok(there.said.includes("txt_castle_bandits_tale"), "the successor hears the legend");
  assert.strictEqual(kn(there.state, "rum_bandits_legend").claim, "slain");
  assert.deepStrictEqual(frontierFacts(there.state), FACTS, "the facts never change");
}

// 4. save/load on the road, and determinism
function testSaveAndDeterminism() {
  const corrected = play(seen, E("opt_correct_legend")).state;
  const half = play(corrected, NORTH).state; // in the town, the word still on the road
  const rest = [READ, DAY, DAY, DAY, READ, ...BACK_TO_FORD, ...FERRY("opt_ferryman_news")];
  const end = play(half, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_word_road", half, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, half);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  const again = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_LEGEND, ...SEE_TRUTH, ...E("opt_correct_legend"), ...NORTH, ...rest]).state;
  assert.deepStrictEqual(again, end, "the same input, the same world");
}

testCaravansCarry();
testCharacterCarries();
testNobodyCorrects();
testSaveAndDeterminism();
console.log("V2-Core-83 data-world-word-road.test.js: all checks passed");
