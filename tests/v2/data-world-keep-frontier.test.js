// V2-Core-139 (roadmap M5, chapter 3 "변경을 지키는 일", docs/v2/main-story-design.md §2), through the ordinary step() API
// and the real pack.
//   1. the band grows a step every nine days (V2-Core-143, D-121) from its gathering (1) to six, its size a world fact
//      (few/many/host); half as fast once the guild keeps its guards
//   2. the guild: a guard it knows, who knows who leads them, can tell it -- once; the guild keeps its guards
//   3. watching the band: the way is the ferryman's word; at the woods a watch shows how many they are (the world's fact,
//      dated), and near the end that they mean to cross; a watch that fails is spotted and hurts
//   4. helping the village prepare, once warned: silver (three times at most), an iron sword not in hand, two salves
//   5. the lord's offer (MC-02): posted once the band is many and only until the frontier answers; the elder, given it,
//      takes it (the lord's patrol: preparedness +2) or refuses it (the frontier stands alone; the elder +5) -- once
//   6. save/load and determinism
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const FERRY = (o) => [P("act_talk_ferryman"), C(o)];
const CLERK = (o) => [P("act_talk_guild_clerk"), C(o)];
const DAY = { type: "wait", minutes: 1440 };
// the band's growth step, nine days (V2-Core-143, D-121; a wait is at most a day)
const STEP = Array.from({ length: 9 }, () => DAY);
// history-41: the confrontation and the dispersal -- the leader lives (as data-world-band-across)
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region")
];
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];
const FORD_TO_VILLAGE = [M("loc_crossroads"), M("loc_village")];

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
const said = (r) => r.log.flatMap((x) => x.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const tier = (r) => r.log.flatMap((x) => x.events).find((e) => e.type === "check.resolved")?.data.tier;
const mine = (s) => s.knowledge?.[s.player.actorId] ?? {};
const offered = (s, choice, id) => {
  const o = worldData.choices[choice].options.find((x) => x.id === id);
  return evaluateCondition(o.requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
};
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
const factOf = (s, id) => s.facts?.[id]?.value;
const sig = (s, key) => s.signals?.[key] ?? 0;
const me = (s) => s.actors[s.player.actorId];
function untilGathering(s) {
  for (let i = 0; i < 20 && sig(s, "band_gathering") < 1; i += 1) s = run(s, [DAY]).state;
  assert.equal(sig(s, "band_gathering"), 1);
  return s;
}
// the first attempt of `actions` whose check comes out `wanted`, rerolling the RNG stream only
function rollTo(state, actions, wanted, label) {
  for (let i = 0; i < 300; i += 1) {
    const r = run({ ...state, rng: createInitialState({ worldSeed: `${label}-${i}`, data: worldData }).state.rng }, actions);
    if (tier(r) === wanted || (wanted === "success" && tier(r) === "great")) return r;
  }
  assert.fail(`no ${wanted} for ${JSON.stringify(actions)}`);
}

const atFord = (() => {
  const s = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD]).state;
  s.actors[s.player.actorId].money = 60; // staged: fares back and forth
  return s;
})();
const gathered = untilGathering(atFord); // at the ford, the step the band gathered

// 1. the clock
function testTheBandGrows() {
  assert.equal(sig(gathered, "band_strength"), 1, "the gathering's own step");
  assert.equal(factOf(gathered, "fact_band_size"), "few");
  const sizes = [];
  let s = gathered;
  for (let i = 0; i < 7; i += 1) {
    s = run(s, STEP).state;
    sizes.push([sig(s, "band_strength"), factOf(s, "fact_band_size")]);
  }
  assert.deepEqual(sizes, [[2, "few"], [3, "many"], [4, "many"], [5, "host"], [6, "host"], [6, "host"], [6, "host"]], "a step each growth step, to six");
  // the guild keeps its guards: every other step
  const kept = structuredClone(gathered);
  kept.flags = { ...kept.flags, guild_keeps_guards: true };
  const slow = [];
  let t = kept;
  for (let i = 0; i < 6; i += 1) {
    t = run(t, STEP).state;
    slow.push(sig(t, "band_strength"));
  }
  assert.deepEqual(slow, [2, 2, 3, 3, 4, 4], "half as fast");
  // the same days walked an hour at a time give the same band (the honest clock)
  let h = gathered;
  for (let i = 0; i < 24 * 9 * 3; i += 1) h = run(h, [{ type: "wait", minutes: 60 }]).state;
  assert.equal(sig(h, "band_strength"), 4);
}

// 2. the guild
function testTheGuild() {
  const town = run(gathered, [...FERRY("opt_ferryman_band"), ...FERRY("opt_ferryman_cross"), M("loc_castle_town")]).state;
  assert.ok(mine(town).rum_band_led_by_scarred, "the ferryman told who leads them");
  assert.ok(!offered(town, "choice_guild_clerk_dialogue", "opt_guild_clerk_warn"), "not a guard the guild knows");
  const known = structuredClone(town);
  known.relations = { ...known.relations, [`npc_guild_clerk:${known.player.actorId}`]: { score: 10 } };
  assert.ok(offered(known, "choice_guild_clerk_dialogue", "opt_guild_clerk_warn"));
  const ignorant = structuredClone(known);
  delete ignorant.knowledge[ignorant.player.actorId].rum_band_led_by_scarred;
  assert.ok(!offered(ignorant, "choice_guild_clerk_dialogue", "opt_guild_clerk_warn"), "only one who knows who leads them");
  const told = run(known, CLERK("opt_guild_clerk_warn"));
  assert.ok(said(told).includes("txt_guild_clerk_warned"));
  assert.equal(told.state.flags.guild_keeps_guards, true);
  assert.equal(rel(told.state, "npc_guild_clerk"), 15);
  assert.ok(mine(told.state).rum_guild_keeps_guards);
  assert.ok(!offered(told.state, "choice_guild_clerk_dialogue", "opt_guild_clerk_warn"), "once");
}

// 3. watching the band
function testTheWatch() {
  const farBank = run(gathered, FERRY("opt_ferryman_cross")).state;
  assert.equal(rejected(farBank, M("loc_band_camp")), "requirements_not_met", "no way without the word");
  const told = run(gathered, [...FERRY("opt_ferryman_band"), ...FERRY("opt_ferryman_cross")]).state;
  assert.ok(mine(told).rum_band_camp_way);
  const woods = run(told, [M("loc_band_camp")]).state;
  const seen = rollTo(woods, [P("act_watch_band_camp")], "success", "watch");
  assert.equal(mine(seen.state).rum_band_size.claim, factOf(woods, "fact_band_size"), "what is there, the day it is seen");
  assert.equal(mine(seen.state).rum_band_size.aboutDay, Math.floor(seen.state.time.minute / 1440));
  assert.ok(said(seen).includes("txt_band_camp_few"));
  assert.equal(mine(seen.state).rum_band_crossing_soon, undefined, "not yet");
  const spotted = rollTo(woods, [P("act_watch_band_camp")], "fail", "watch");
  assert.equal(me(spotted.state).hp.current, me(woods).hp.current - 3);
  assert.equal(mine(spotted.state).rum_band_size, undefined);
  // near the end: they mean to cross
  const late = run(woods, [...STEP, ...STEP, ...STEP, ...STEP]).state;
  assert.equal(sig(late, "band_strength"), 5);
  const seenLate = rollTo(late, [P("act_watch_band_camp")], "success", "watch-late");
  assert.equal(mine(seenLate.state).rum_band_size.claim, "host");
  assert.ok(mine(seenLate.state).rum_band_crossing_soon);
  assert.equal(factOf(seenLate.state, "fact_band_crossing"), "soon");
}

// 4-5. the village prepares; the lord's offer
function testTheVillageAndTheLord() {
  const home = run(gathered, [...FERRY("opt_ferryman_band"), ...FORD_TO_VILLAGE]).state;
  assert.ok(!offered(home, "choice_elder_dialogue", "opt_elder_give_silver"), "not before the elder is warned");
  const warned = run(home, E("opt_elder_band_word")).state;
  assert.equal(warned.flags.frontier_warned, true);
  const rich = structuredClone(warned);
  me(rich).money = 40;
  me(rich).inventory = { ...me(rich).inventory, item_iron_sword: 1, item_herbal_salve: 2 };
  let s = rich;
  for (let i = 0; i < 3; i += 1) s = run(s, E("opt_elder_give_silver")).state;
  assert.equal(me(s).money, 10);
  assert.equal(sig(s, "frontier_defense"), 3);
  assert.ok(!offered(s, "choice_elder_dialogue", "opt_elder_give_silver"), "three times at most");
  s = run(s, [...E("opt_elder_give_sword"), ...E("opt_elder_give_salve")]).state;
  assert.equal(sig(s, "frontier_defense"), 5);
  assert.equal(me(s).inventory.item_iron_sword ?? 0, 0);
  assert.equal(me(s).inventory.item_herbal_salve ?? 0, 0);
  assert.ok(mine(s).rum_frontier_prepared);
  assert.equal(factOf(s, "fact_frontier_prepared"), "helped");
  // a sword in hand is not given away
  const armed = structuredClone(rich);
  armed.actors[armed.player.actorId].inventory.item_iron_sword = 1;
  const wielding = run(armed, [P("act_equip_iron_sword")]).state;
  assert.ok(!offered(wielding, "choice_elder_dialogue", "opt_elder_give_sword"));

  // the lord's offer: not while the band is few; posted once it is many
  const town = (st) => run(st, [...TO_FORD, ...FERRY("opt_ferryman_cross"), M("loc_castle_town"), P("act_read_castle_notices")]);
  const early = town(warned);
  assert.ok(!said(early).includes("txt_castle_lord_offer"));
  const two = run(warned, STEP).state;
  assert.equal(sig(two, "band_strength"), 2);
  assert.ok(!said(town(two)).includes("txt_castle_lord_offer"), "not while the band is few");
  const many = run(warned, [...STEP, ...STEP]).state;
  assert.ok(sig(many, "band_strength") >= 3);
  const posted = town(many);
  assert.ok(said(posted).includes("txt_castle_lord_offer"));
  assert.ok(mine(posted.state).rum_lord_offer);
  const back = run(posted.state, [M("loc_far_bank"), M("loc_river_ford"), ...FORD_TO_VILLAGE]).state; // south is a plain walk
  const before = sig(back, "frontier_defense");
  const accepted = run(back, E("opt_elder_lord_accept"));
  assert.equal(sig(accepted.state, "lord_pact"), 1);
  assert.equal(factOf(accepted.state, "fact_lord_pact"), "accepted");
  assert.equal(sig(accepted.state, "frontier_defense"), before + 2, "the lord's patrol");
  assert.ok(!offered(accepted.state, "choice_elder_dialogue", "opt_elder_lord_refuse"), "once");
  const elderBefore = rel(back, "npc_elder");
  const refused = run(back, E("opt_elder_lord_refuse"));
  assert.equal(sig(refused.state, "lord_pact"), 2);
  assert.equal(factOf(refused.state, "fact_lord_pact"), "refused");
  assert.equal(sig(refused.state, "frontier_defense"), before);
  assert.equal(rel(refused.state, "npc_elder"), elderBefore + 5);
  // answered: the notices no longer offer
  const again = run(refused.state, [...TO_FORD, ...FERRY("opt_ferryman_cross"), M("loc_castle_town"), P("act_read_castle_notices")]);
  assert.ok(!said(again).includes("txt_castle_lord_offer"));
  return refused.state;
}

function testStoryAndData() {
  assert.deepEqual(validateData(worldData), []);
  for (const id of ["rum_band_camp_way", "rum_band_size", "rum_band_crossing_soon", "rum_guild_keeps_guards", "rum_frontier_prepared", "rum_lord_offer", "rum_lord_pact_accepted", "rum_lord_pact_refused"]) {
    assert.equal(worldData.rumors[id].story?.chapter, 3, id);
  }
  assert.ok(worldData.texts.lbl_story_chapter_3);
}

function testSaveAndDeterminism(end) {
  assert.deepEqual(validateState(end), []);
  const path = [...STEP, ...E("opt_elder_band_word")];
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_keep", end, { savedAt: 1 }))));
  assert.deepEqual(run(loaded, path).state, run(end, path).state, "loaded, the same end");
}

testTheBandGrows();
testTheGuild();
testTheWatch();
const end = testTheVillageAndTheLord();
testStoryAndData();
testSaveAndDeterminism(end);
console.log("V2-Core-139 data-world-keep-frontier.test.js: all checks passed");
