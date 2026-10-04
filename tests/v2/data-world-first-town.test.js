// V2-Core-79 (#189, Fantasy World Vertical Slice 5, step 4 -- integrated: the frontier and its first town):
// the frontier's stories and the castle town played through in one world, through the ordinary step() API
// and the real pack. No new rule. A small deterministic play policy (below) goes from any state to the
// castle town -- learning the way north, crossing the river (by the elder's letter, or by fare), taking the
// road -- then reads the lord's notices, sells what the town values more, takes the caravan guard's work if
// a caravan wants a guard, and comes back to the town. It plays:
//   1. the dispersed world (the leader lives): the decree at its source; the frontier's tale reaches the
//      town only as a legend and only once it is old enough; one guard per caravan;
//   2. a successor in that world: nothing inherited; the world's hiring count stays (world signals);
//      the successor walks the road on their own, by fare;
//   3. the scout's world of Slice 3 (both stories resolved, the village honoured her): the town hears the
//      legends -- not the village's corrected truth -- and knows her only by an epithet; her herbs fetch
//      the town's price;
//   4. save/load in the middle, and determinism.
// Tales are in-world belief: through all of it the world's facts about the frontier never change.
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
const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
const CLERK = (optionId) => [P("act_talk_guild_clerk"), C(optionId)];
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };

// the walkable map south of the river (the far bank is reached only by the ferry; north of it, the road)
const ROADS = {
  loc_village: ["loc_market", "loc_ruins", "loc_forest_spring", "loc_crossroads"],
  loc_market: ["loc_village"],
  loc_ruins: ["loc_village"],
  loc_forest_spring: ["loc_village"],
  loc_crossroads: ["loc_village", "loc_mill_hamlet", "loc_river_ford"],
  loc_mill_hamlet: ["loc_crossroads"],
  loc_river_ford: ["loc_crossroads"],
  loc_far_bank: ["loc_river_ford", "loc_castle_town"],
  loc_castle_town: ["loc_far_bank"]
};
function nextHop(from, to) {
  const seen = new Map([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift();
    if (at === to) break;
    for (const next of ROADS[at]) if (!seen.has(next)) { seen.set(next, at); queue.push(next); }
  }
  let hop = to;
  while (seen.get(hop) !== from) hop = seen.get(hop);
  return hop;
}
const NORTH = new Set(["loc_far_bank", "loc_castle_town"]);
const readHere = (s, id) => (s.knowledge?.[id]?.rum_realm_levy?.sources ?? []).includes("obs_loc_castle_town");
const guardWanted = (s) => (s.signals?.guards_hired ?? 0) < (s.signals?.caravan_visits ?? 0);
// what the game itself offers (not the policy's own reading)
const escortOffered = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });

// the next actions towards the town's work, from any state (null: done -- in the town, read, guarded or no work)
function nextForTown(s, { guard }) {
  if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
  const id = s.player.actorId;
  const me = s.actors[id];
  const loc = me.locationId;
  const knows = s.knowledge?.[id] ?? {};
  const inventory = me.inventory ?? {};
  const stamina = me.growth.growth_wanderer.resources.stamina.current;
  const go = (to) => (loc === to ? null : [M(nextHop(loc, to))]);
  if (!NORTH.has(loc)) {
    if (!knows.rum_road_ford) return go("loc_village") ?? E("opt_ask_region");
    if (!inventory.item_passage_letter && me.money < 3) return go("loc_village") ?? E("opt_elder_letter");
    return go("loc_river_ford") ?? FERRY(inventory.item_passage_letter ? "opt_ferryman_cross_letter" : "opt_ferryman_cross");
  }
  if (loc !== "loc_castle_town") return [M("loc_castle_town")];
  if (!readHere(s, id)) return [P("act_read_castle_notices")];
  if ((inventory.item_purifying_herb ?? 0) > 0) return MERCHANT("opt_town_merchant_sell_herb");
  if (guard && guardWanted(s) && stamina >= 2 && (s.signals?.guards_hired ?? 0) < guard) return CLERK("opt_guild_clerk_escort");
  return null;
}
function apply(state, action, log) {
  const result = step(state, action, worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
  log.push({ action, result });
  return result.state;
}
function walkToTown(state, options = { guard: 1 }, limit = 80) {
  const log = [];
  for (let i = 0; i < limit; i += 1) {
    const next = nextForTown(state, options);
    if (next === null) return { state, log };
    for (const action of next) state = apply(state, action, log);
  }
  assert.fail("the town's work was not reached within the limit");
}
const run = (state, actions) => actions.reduce((s, a) => apply(s, a, []), state);
const said = (log) => log.flatMap(({ result }) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const frontierFacts = (s) => Object.fromEntries(["fact_bandits_fate", "fact_well_fate", "fact_spring_fouler", "fact_ruins_secret"].map((f) => [f, s.facts?.[f]?.value]));
const deathAtTheRuins = (state) => {
  let s = state;
  // back across the river and down to the village (the far bank's way back is free)
  while (s.actors[s.player.actorId].locationId !== "loc_village") {
    const loc = s.actors[s.player.actorId].locationId;
    s = run(s, [M(loc === "loc_castle_town" ? "loc_far_bank" : nextHop(loc, "loc_village"))]);
  }
  s = run(s, [M("loc_ruins")]);
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]);
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  return s;
};

// history-41: the dispersal -- the leader lives
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
// integrated-36, the scout of Slice 3: both stories, the arrows told, the village's honour (data-world-horizon)
const SCOUT_HONOURED = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"), P("act_talk_herbalist"), C("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_report_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), ...E("opt_village_honor")
];

const dispersed = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL);

// 1. the dispersed world: the decree at its source, the legend only when old enough, one guard per caravan
function testDispersedWorld() {
  const facts = frontierFacts(dispersed);
  const { state: end, log } = walkToTown(dispersed);
  const lines = said(log);
  assert.strictEqual(end.actors.player_1.locationId, "loc_castle_town", "the escort ended at the far bank; the policy came back");
  assert.ok(lines.includes("txt_castle_town_first"), "the first arrival");
  assert.ok(lines.includes("txt_castle_levy_decree"), "the decree at its source");
  assert.ok(readHere(end, "player_1"));
  assert.ok(!lines.includes("txt_castle_epithet"), "nobody was honoured in this world");
  // the frontier's tale: told in the town only if it had become a legend when the notices were read
  const readAt = log.findIndex(({ action }) => action.actionId === "act_read_castle_notices");
  const ageThen = log[readAt].result.state.signals?.bandits_tale_age ?? 0;
  assert.strictEqual(said([log[readAt]]).includes("txt_castle_bandits_tale"), ageThen >= 3, `legend iff old enough (age ${ageThen})`);
  // natural play: crossing the crossroads brought the first caravan, so the town is never reached before it
  const arrivedAt = log.findIndex(({ action }) => action.type === "move" && action.to === "loc_castle_town");
  assert.ok((log[arrivedAt].result.state.signals?.caravan_visits ?? 0) >= 1);
  assert.strictEqual(end.signals.guards_hired, 1, "one guard for the waiting caravan");
  const escortAt = log.findIndex(({ action }) => action.optionId === "opt_guild_clerk_escort");
  assert.strictEqual(log[escortAt].result.state.actors.player_1.locationId, "loc_far_bank", "the escort ends at the far bank");
  assert.ok(lines.some((t) => t.startsWith("txt_escort_")));
  assert.strictEqual(escortOffered(end), false, "no second guard for the same caravan");
  // three days on: the next caravan wants a guard, and the legend has travelled north
  const later = run(end, [DAY, DAY, DAY]);
  assert.strictEqual(escortOffered(later), true);
  const reread = step(later, P("act_read_castle_notices"), worldData);
  assert.ok(reread.events.some((e) => e.type === "narration" && e.data.textId === "txt_castle_bandits_tale"));
  assert.deepStrictEqual(frontierFacts(reread.state), facts, "tales never change the truth");
  return later;
}

// 2. a successor: nothing inherited; the world's hiring count stays; the road walked again, by fare
function testSuccessor(world) {
  const s = deathAtTheRuins(world);
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]);
  const id = next.player.actorId;
  assert.strictEqual(id, "player_2");
  assert.deepStrictEqual(next.knowledge?.[id] ?? {}, {}, "no knowledge inherited");
  assert.strictEqual(next.signals.guards_hired, world.signals.guards_hired, "the world remembers its hiring");
  const { state: end, log } = walkToTown(next, { guard: world.signals.guards_hired + 1 });
  assert.strictEqual(end.actors[id].locationId, "loc_castle_town");
  assert.ok(readHere(end, id), "the successor reads the notices on their own");
  assert.ok(!said(log).includes("txt_castle_town_first"), "the first arrival was the world's, once");
  assert.ok(log.some(({ action }) => action.optionId === "opt_ferryman_cross"), "by fare: the letter was the predecessor's");
}

// 3. the honoured scout's world: legends, not the corrected truth; an epithet, not a name; the town's price
function testHonouredWorld() {
  const honoured = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, SCOUT_HONOURED);
  assert.strictEqual(honoured.flags.village_honored, true);
  const ripe = run(honoured, [DAY, DAY, DAY]); // the stories become legends while she rests
  const facts = frontierFacts(ripe);
  const herbs = ripe.actors.player_1.inventory.item_purifying_herb ?? 0;
  assert.ok(herbs > 0, "she carries herbs from the spring");
  const { state: end, log } = walkToTown(ripe, { guard: 0 });
  const lines = said(log);
  assert.ok(lines.includes("txt_castle_epithet"), "known only by an epithet");
  assert.ok(lines.includes("txt_castle_well_tale"), "the spring's legend reached the town");
  assert.strictEqual(end.knowledge.player_1.rum_well_legend.claim, "spirit_appeased", "the legend, not the corrected truth");
  assert.deepStrictEqual(frontierFacts(end), facts, "tales never change the truth");
  assert.strictEqual(lines.filter((t) => t === "txt_town_merchant_buy_herb").length, herbs, "every herb sold at the town's price");
  assert.strictEqual(end.actors.player_1.inventory.item_purifying_herb ?? 0, 0);
}

// 4. save/load in the middle of the road, and determinism
function testSaveAndDeterminism() {
  const half = walkToTown(dispersed, { guard: 0 }).state; // read the notices, no work taken
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_town", half, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, half);
  const end = walkToTown(loaded).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(walkToTown(half).state, end, "loaded, the same end");
  const again = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL);
  assert.deepStrictEqual(walkToTown(walkToTown(again, { guard: 0 }).state).state, end, "the same input, the same world");
}

const world = testDispersedWorld();
testSuccessor(world);
testHonouredWorld();
testSaveAndDeterminism();
console.log("V2-Core-79 data-world-first-town.test.js: all checks passed");
