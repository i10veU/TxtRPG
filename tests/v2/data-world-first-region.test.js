// V2-Core-141 (roadmap M2, the first region completed; docs/v2/first-region-baseline.md section 6), through the ordinary
// step() API and the real pack. Each place's trace on the world, and who reads it:
//   1. the ford: the ferryman, paid, watches the river -- the band strikes a day later; the elder says who warned him
//   2. the far bank: a call for hands on the waystation board (one the elder warned; 15 silver) -- preparedness +1, once
//   3. the royal city: the frontier's plight told at court by one who knows who leads the band -- a writ (preparedness +1
//      when the band crosses), or the clerk's door closed for good
//   4. the band's camp: its stores burnt -- the band one smaller; caught, beaten; once either way
//   5. smaller traces: the village talks of what the ruins hid; the herbalist hears the spring's herbs are back (once);
//      the miller hears who buys flour across the river; the chief looks away from the spring's arrows; brewing takes
//      its time; the herbalist confirms the well's fate; the hamlet's carts show the east road
//   6. first arrivals change the world: the castle town, the far bank, the royal city note the frontier traveller -- read
//      by the notices, the board, and the town's talk of the royal city
//   7. save/load and determinism
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
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
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region")
];
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];

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
const said = (r) => r.log.flatMap((x) => x.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const tier = (r) => r.log.flatMap((x) => x.events).find((e) => e.type === "check.resolved")?.data.tier;
const mine = (s) => s.knowledge?.[s.player.actorId] ?? {};
const cond = (s, condition) => evaluateCondition(condition, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const offered = (s, choice, id) => {
  const o = worldData.choices[choice].options.find((x) => x.id === id);
  return o.requires === undefined || cond(s, o.requires);
};
const available = (s, actionId) => cond(s, worldData.actions[actionId].requires);
const sig = (s, key) => s.signals?.[key] ?? 0;
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
const me = (s) => s.actors[s.player.actorId];
const minutes = (s) => s.time.minute;
const crossed = (s) => s.flags?.band_crossed === true;
// staged: the character set down at a place, or given money, flags or signals (the world otherwise as played)
const at = (s, loc, patch = {}) => {
  const t = structuredClone(s);
  t.actors[t.player.actorId].locationId = loc;
  if (patch.money !== undefined) t.actors[t.player.actorId].money = patch.money;
  t.flags = { ...t.flags, ...(patch.flags ?? {}) };
  t.signals = { ...t.signals, ...(patch.signals ?? {}) };
  return t;
};
function until(s, done, limit = 60) {
  for (let i = 0; i < limit && !done(s); i += 1) s = run(s, [DAY]).state;
  assert.ok(done(s), "reached");
  return s;
}
function rollTo(state, actions, wanted, label) {
  for (let i = 0; i < 300; i += 1) {
    const r = run({ ...state, rng: createInitialState({ worldSeed: `${label}-${i}`, data: worldData }).state.rng }, actions);
    if (tier(r) === wanted || (wanted === "success" && tier(r) === "great")) return r;
  }
  assert.fail(`no ${wanted} for ${JSON.stringify(actions)}`);
}

const lives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD]).state;
const gathered = until(lives, (s) => sig(s, "band_gathering") >= 1);
// the ferryman's word of the band: the band's recruiting known, its way known
const told = run(at(gathered, "loc_river_ford", { money: 60 }), [P("act_talk_ferryman"), C("opt_ferryman_band")]).state;

// 1. the ford
function testTheFerrymanWatches() {
  assert.ok(!offered(at(gathered, "loc_river_ford", { money: 60 }), "choice_ferryman_dialogue", "opt_ferryman_watch"), "only one who has heard of the band");
  assert.ok(!offered(at(told, "loc_river_ford", { money: 4 }), "choice_ferryman_dialogue", "opt_ferryman_watch"), "five silver");
  assert.ok(offered(told, "choice_ferryman_dialogue", "opt_ferryman_watch"));
  const asked = run(told, [P("act_talk_ferryman"), C("opt_ferryman_watch")]);
  assert.ok(said(asked).includes("txt_ferryman_watch"));
  assert.equal(me(asked.state).money, me(told).money - 5);
  assert.equal(asked.state.flags.ferryman_watches, true);
  assert.equal(rel(asked.state, "npc_ferryman"), rel(told, "npc_ferryman") + 3);
  assert.ok(mine(asked.state).rum_ferryman_watches);
  assert.ok(!offered(asked.state, "choice_ferryman_dialogue", "opt_ferryman_watch"), "once");
  // the band strikes a day later: four days on it has not, five days on it has
  const crossing = until(asked.state, crossed);
  const four = run(crossing, [DAY, DAY, DAY]).state;
  assert.equal(sig(four, "raid_days"), 4);
  assert.equal(sig(four, "frontier_fate"), 0, "a day won");
  const five = run(four, [DAY]).state;
  assert.ok(sig(five, "frontier_fate") >= 1);
  // without him, the fourth day
  assert.ok(sig(run(until(told, crossed), [DAY, DAY, DAY]).state, "frontier_fate") >= 1);
  // the elder says who warned him
  const village = run(at(crossing, "loc_village"), E("opt_elder_band_crossed"));
  assert.ok(said(village).includes("txt_elder_ferryman_word"));
  assert.ok(!said(run(at(until(told, crossed), "loc_village"), E("opt_elder_band_crossed"))).includes("txt_elder_ferryman_word"));
  assert.ok(!offered(at(crossing, "loc_river_ford", { money: 60 }), "choice_ferryman_dialogue", "opt_ferryman_watch"), "not once it has crossed");
}

// 2. the far bank
function testTheCallForHands() {
  const farBank = at(gathered, "loc_far_bank", { money: 30, flags: { frontier_warned: true } });
  assert.ok(available(farBank, "act_post_frontier_notice"));
  assert.ok(!available(at(gathered, "loc_far_bank", { money: 30 }), "act_post_frontier_notice"), "one the elder has warned");
  assert.ok(!available(at(gathered, "loc_far_bank", { money: 14, flags: { frontier_warned: true } }), "act_post_frontier_notice"), "fifteen silver");
  assert.ok(!available(at(lives, "loc_far_bank", { money: 30, flags: { frontier_warned: true } }), "act_post_frontier_notice"), "no band, no call");
  const posted = run(farBank, [P("act_post_frontier_notice")]);
  assert.ok(said(posted).includes("txt_post_frontier_notice"));
  assert.equal(me(posted.state).money, 15);
  assert.equal(sig(posted.state, "frontier_defense"), 1);
  assert.equal(minutes(posted.state) - minutes(farBank), 60);
  assert.deepEqual(mine(posted.state).rum_frontier_prepared.sources, ["obs_loc_far_bank"]);
  assert.ok(!available(posted.state, "act_post_frontier_notice"), "once");
}

// 3. the royal city
function testTheCrown() {
  const court = at(told, "loc_royal_city");
  assert.ok(mine(told).rum_band_led_by_scarred, "the ferryman told who leads them");
  assert.ok(available(court, "act_petition_crown"));
  const ignorant = structuredClone(court);
  delete ignorant.knowledge[ignorant.player.actorId].rum_band_led_by_scarred;
  assert.ok(!available(ignorant, "act_petition_crown"), "only one who knows who leads them");
  const writ = rollTo(court, [P("act_petition_crown")], "success", "crown-yes");
  assert.ok(said(writ).includes("txt_crown_writ"));
  assert.equal(writ.state.flags.crown_writ, true);
  assert.ok(mine(writ.state).rum_crown_writ);
  assert.equal(minutes(writ.state) - minutes(court), 120);
  assert.ok(!available(writ.state, "act_petition_crown"), "once granted");
  assert.equal(sig(writ.state, "frontier_defense"), 0, "the militia rises when the band comes");
  const crossing = until(writ.state, crossed);
  assert.equal(sig(crossing, "frontier_defense"), 1);
  assert.ok(said(run(at(crossing, "loc_village"), E("opt_elder_band_crossed"))).includes("txt_elder_crown_writ"));
  assert.equal(sig(until(told, crossed), "frontier_defense"), 0, "no writ, no militia");
  const refused = rollTo(court, [P("act_petition_crown")], "fail", "crown-no");
  assert.ok(said(refused).includes("txt_crown_refused"));
  assert.equal(refused.state.flags.crown_refused, true);
  assert.ok(!available(refused.state, "act_petition_crown"), "the door closed for good");
}

// 4. the band's camp
function testTheStores() {
  const two = until(told, (s) => sig(s, "band_strength") >= 2);
  const camp = at(two, "loc_band_camp");
  assert.ok(available(camp, "act_burn_band_stores"));
  assert.ok(!available(at(gathered, "loc_band_camp"), "act_burn_band_stores"), "not while the band is one");
  const burnt = rollTo(camp, [P("act_burn_band_stores")], "success", "burn-yes");
  assert.ok(said(burnt).includes("txt_band_stores_burnt"));
  assert.equal(sig(burnt.state, "band_strength"), sig(camp, "band_strength") - 1);
  assert.equal(burnt.state.facts.fact_band_size.value, "few");
  assert.ok(mine(burnt.state).rum_band_stores_burnt);
  assert.ok(!available(burnt.state, "act_burn_band_stores"), "once");
  const caught = rollTo(camp, [P("act_burn_band_stores")], "fail", "burn-no");
  assert.ok(said(caught).includes("txt_band_stores_caught"));
  assert.equal(me(caught.state).hp.current, me(camp).hp.current - 5);
  assert.equal(sig(caught.state, "band_strength"), sig(camp, "band_strength"));
  assert.ok(!available(caught.state, "act_burn_band_stores"), "guarded after");
  // smaller, the band takes a cadence longer to reach six
  let a = camp;
  let b = burnt.state;
  let daysA = 0;
  let daysB = 0;
  while (!crossed(a)) { a = run(a, [DAY]).state; daysA += 1; }
  while (!crossed(b)) { b = run(b, [DAY]).state; daysB += 1; }
  assert.ok(daysB > daysA, `later: ${daysB} > ${daysA}`);
  assert.ok(!available(at(a, "loc_band_camp"), "act_burn_band_stores"), "not once it has crossed");
}

// 5. smaller traces
function testSmallerTraces() {
  // the village's talk of the ruins, while the case is open
  const found = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL.slice(0, 10));
  assert.equal(found.state.flags.ruins_secret_confirmed, true);
  assert.ok(said(run(at(found.state, "loc_village"), [P("act_observe_village")])).includes("txt_village_whispers_ruins"));
  assert.ok(!said(run(at(lives, "loc_village"), [P("act_observe_village")])).includes("txt_village_whispers_ruins"), "closed, forgotten");
  // the herbalist: three times picked, once
  const market = at(lives, "loc_market", { signals: { spring_herbs_picked: 3 } });
  const thanks = run(market, [P("act_talk_herbalist"), C("opt_herbalist_small_talk")]);
  assert.ok(said(thanks).includes("txt_herbalist_herbs_back"));
  assert.equal(rel(thanks.state, "npc_herbalist"), rel(market, "npc_herbalist") + 3);
  assert.ok(!said(run(thanks.state, [P("act_talk_herbalist"), C("opt_herbalist_small_talk")])).includes("txt_herbalist_herbs_back"), "once");
  assert.ok(!said(run(at(lives, "loc_market", { signals: { spring_herbs_picked: 2 } }), [P("act_talk_herbalist"), C("opt_herbalist_small_talk")])).includes("txt_herbalist_herbs_back"));
  // the miller hears who pays
  const mill = run(at(gathered, "loc_mill_hamlet"), [P("act_talk_miller"), C("opt_miller_news")]);
  assert.ok(said(mill).includes("txt_miller_band"));
  assert.ok(mine(mill.state).rum_band_recruits.sources.includes("npc_miller"));
  assert.ok(!said(run(at(lives, "loc_mill_hamlet"), [P("act_talk_miller"), C("opt_miller_news")])).includes("txt_miller_band"), "no band, nothing");
  // the chief looks away from the spring's arrows -- when they were told
  const confrontAt = TO_DISPERSAL.findIndex((a) => a.actionId === "act_confront_leader");
  const before = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL.slice(0, confrontAt)).state;
  const arrows = run(at(before, "loc_village", { flags: { spring_bandits_told: true } }), [P("act_confront_leader")]);
  assert.ok(said(arrows).includes("txt_confront_arrows"));
  assert.ok(!said(run(before, [P("act_confront_leader")])).includes("txt_confront_arrows"));
  // data: brewing takes half an hour; the herbalist confirms the well's fate; the hamlet's carts show the east road
  const herbalist = worldData.choices.choice_herbalist_dialogue.options;
  assert.equal(herbalist.find((o) => o.id === "opt_herbalist_brew").minutes, 30);
  assert.ok(herbalist.find((o) => o.id === "opt_herbalist_report_spring").effects.some((e) => e.op === "rumor" && e.rumor === "rum_well_fate" && e.source === "npc_herbalist"));
  assert.ok(worldData.events.evt_hamlet_carts.effects.some((e) => e.op === "rumor" && e.rumor === "rum_road_hamlet"));
}

// 6. first arrivals
function testFirstArrivals() {
  const atFord = at(lives, "loc_river_ford", { money: 60 });
  const far = run(atFord, [P("act_talk_ferryman"), C("opt_ferryman_cross")]);
  assert.equal(far.state.flags.frontier_seen_far_bank, true);
  assert.equal(far.state.facts.fact_frontier_seen_far_bank.value, "noticed");
  const board = run(far.state, [P("act_read_waystation_board")]);
  assert.ok(said(board).includes("txt_board_southerner"));
  assert.ok(mine(board.state).rum_frontier_seen_far_bank);
  const town = run(board.state, [M("loc_castle_town")]).state;
  assert.equal(town.flags.frontier_seen_town, true);
  const notices = run(town, [P("act_read_castle_notices")]);
  assert.ok(said(notices).includes("txt_castle_frontier_seen"));
  assert.ok(!said(notices).includes("txt_castle_royal_seen"), "not before anyone reached the royal city");
  const royal = run(board.state, [M("loc_royal_city")]).state; // five days north of the far bank, for one who read the way
  assert.equal(royal.facts.fact_frontier_seen_royal.value, "noticed");
  const back = run(royal, [M("loc_far_bank"), M("loc_castle_town"), P("act_read_castle_notices")]);
  assert.ok(said(back).includes("txt_castle_royal_seen"));
  assert.deepEqual(mine(back.state).rum_frontier_seen_royal.sources, ["src_castle_town_talk"]);
  // the royal records still name no frontier (N-06)
  assert.ok(!said(run(royal, [P("act_read_royal_records")])).some((t) => t.includes("frontier_seen")));
}

// 7. save/load and determinism
function testSaveLoadAndDeterminism() {
  const actions = [P("act_talk_ferryman"), C("opt_ferryman_watch"), DAY, DAY, DAY];
  const a = run(told, actions).state;
  const b = run(told, actions).state;
  assert.deepEqual(a, b);
  assert.deepEqual(validateState(a), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_region", a, { savedAt: 1 }))));
  assert.deepEqual(loaded, a);
  assert.deepEqual(run(loaded, [DAY]).state, run(a, [DAY]).state);
}

testTheFerrymanWatches();
testTheCallForHands();
testTheCrown();
testTheStores();
testSmallerTraces();
testFirstArrivals();
testSaveLoadAndDeterminism();
console.log("V2-Core-141 data-world-first-region.test.js: all checks passed");
