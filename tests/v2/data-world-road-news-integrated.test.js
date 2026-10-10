// V2-Core-128 (#313, #306 Road News step 3 -- integration and regression): Road News with the systems it lives among, through the
// ordinary step() API and the real pack. The road is never staged here: every condition is the one the world's own course
// gives (history-41, the leader alive: quiet at first, dangerous for the first time on day 57). No new rule. Pinned:
//   1. the road keeps the world's clock (Honest Clock, D-107): one long journey, hourly waits and a guard's working days
//      that end on the same minute end on the same road -- count = 1 + floor((now - the first turn) / 4320), the same place on
//      the course, the same condition and fact. What the player does never moves the road (World Simulation);
//   2. stale news on the real road: a known guard's word is dated and stays as it was while the road moves on, so what the
//      guard believes and what the road is part; asking again gives the road as it is now, the old word kept;
//   3. information -> choice -> consequence on the first dangerous road, with Death & Injury (D-109) and World Memory
//      (D-102): a hurt lead who takes the danger job blind dies of the road's 7; the same guard, on the same roll, who asks
//      first, hears "dangerous" and leads the ordinary convoy instead lives. The fall is the guild's to remember (fallen,
//      the steel, a share of the purse), the next life knows nothing of the road and is not known -- the yard's talk only --
//      and the road the fall happened on is the road a guard who only waited would have had;
//   4. a real save from before Road News (fixtures/save-before-road-news.json, written by the pack at feature/v2-core
//      12caed1 -- history-41 to the castle town, one failed escort, back in town at 3 hp): it loads, the road turns once from
//      the first place at the next step and then keeps the clock; the clerk tells it the yard's talk; save/load and
//      determinism.
// Values and words are Provisional (R-29). No Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const DAY = { type: "wait", minutes: 1440 };
const CADENCE = 4320;
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ASK = CLERK("opt_guild_clerk_ask");
const ESCORT = CLERK("opt_guild_clerk_escort");
const LEAD = CLERK("opt_guild_clerk_escort_lead");
const DANGER = CLERK("opt_guild_clerk_escort_danger");
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const CONDITIONS = ["quiet", "uneasy", "dangerous"];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const JOURNEY = [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town")];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const day = (s) => Math.floor(s.time.minute / 1440);
const known = (s) => s.knowledge?.[s.player.actorId] ?? {};
const roadWords = (s) => Object.keys(known(s)).filter((id) => worldData.rumors[id]?.factId === "fact_road_north").sort();
const latest = (s) => roadWords(s).map((id) => known(s)[id]).sort((a, b) => b.lastSeenDay - a.lastSeenDay)[0];
const check = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1);
const open = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const edit = (s, f) => { const c = structuredClone(s); f(c); return c; };
const withStanding = (s, score) => edit(s, (c) => { c.relations = { ...c.relations, [`npc_guild_clerk:${c.player.actorId}`]: { score } }; });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = play(s, [HOUR]).state; assert.ok(open(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };
// wait to a minute, a day at most at a time
const waitTo = (s, minute) => { while (s.time.minute < minute) s = play(s, [{ type: "wait", minutes: Math.min(1440, minute - s.time.minute) }]).state; assert.strictEqual(s.time.minute, minute); return s; };
const waitHoursTo = (s, minute) => { while (s.time.minute < minute) s = play(s, [{ type: "wait", minutes: Math.min(60, minute - s.time.minute) }]).state; return s; };
// the road, as the world holds it
const road = (s) => ({ trouble: sig(s, "road_trouble"), phase: sig(s, "road_phase"), started: sig(s, "road_started"), fact: s.facts.fact_road_north?.value, turns: s.fired.evt_road_north?.count });
// the first rng cursor at which the job lands in the wanted tier(s) -- found on the same state
function landing(s, job, tiers) {
  for (let k = 0; k < 200; k += 1) {
    const t = edit(s, (c) => { c.rng.cursor += k; });
    const r = play(t, job);
    if (tiers.includes(check(r).data.tier)) return { before: t, r };
  }
  throw new Error(`no cursor lands ${JSON.stringify(tiers)}`);
}

const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
const firstTurn = town.fired.evt_road_north.lastMinute;
const turnsAt = (minute) => 1 + Math.floor((minute - firstTurn) / CADENCE);

// 1. the road keeps the world's clock, and the player does not move it
function testClock() {
  assert.strictEqual(town.fired.evt_road_north.count, 1, "the road turned once, when it was first walked");
  // one long journey (five days a leg, one step each) and hourly waits to the same minute: the same road
  const journeyed = play(play(withStanding(town, 10), ASK).state, JOURNEY);
  const legs = journeyed.log.filter((r) => r.events.filter((e) => e.type === "trigger.fired" && e.data.eventId === "evt_road_north").length > 1);
  assert.ok(legs.length >= 1, "a leg of the journey owes the road two turns, made in the one step");
  const end = journeyed.state.time.minute;
  const waited = waitHoursTo(town, end);
  assert.deepStrictEqual(road(journeyed.state), road(waited), "one long step, or hours: the same road");
  assert.strictEqual(road(waited).turns, turnsAt(end), "a turn for every cycle that passed");
  // a guard's working days -- convoys, the clerk, rest -- against days of waiting: the same road, cycle by cycle
  let worker = withStanding(edit(town, (c) => { growth(c).stats.str = 14; }), 10);
  let idler = town;
  for (let cycle = 0; cycle < 12; cycle += 1) {
    worker = waitForConvoy(worker);
    worker = edit(worker, (c) => { growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; });
    worker = play(worker, [...ASK, ...ESCORT, M("loc_castle_town")]).state;
    idler = waitTo(idler, worker.time.minute);
    assert.deepStrictEqual(road(worker), road(idler), `cycle ${cycle}: what the guard did does not move the road`);
    assert.strictEqual(road(worker).turns, turnsAt(worker.time.minute));
    assert.strictEqual(road(worker).fact, CONDITIONS[road(worker).trouble], "the fact names the road");
  }
  assert.ok(roadWords(worker).length > 0, "and the guard heard and saw the road on the way");
}

// 2. stale news on the real road
function testStale() {
  const guard = withStanding(town, 10);
  const first = play(guard, ASK).state;
  const heard = latest(first);
  assert.strictEqual(heard.claim, first.facts.fact_road_north.value, "asked today: the road as it is");
  // the road moves on; the word does not
  let s = first;
  for (let d = 0; d < 60 && s.facts.fact_road_north.value === heard.claim; d += 1) s = play(s, [DAY]).state;
  assert.notStrictEqual(s.facts.fact_road_north.value, heard.claim, "the road moved on");
  assert.deepStrictEqual(latest(s), heard, "the word is as it was: dated, not corrected");
  assert.ok(day(s) > heard.lastSeenDay, "and older now");
  // asked again: the road as it is now; the old word kept with its day
  const again = play(s, ASK).state;
  assert.strictEqual(latest(again).claim, again.facts.fact_road_north.value);
  assert.strictEqual(latest(again).lastSeenDay, day(again));
  const old = Object.values(known(again)).find((k) => k.rumorId === heard.rumorId);
  assert.deepStrictEqual([old.claim, old.firstSeenDay], [heard.claim, heard.firstSeenDay], "the old word stays");
  assert.deepStrictEqual([again.signals, again.facts, again.rng], [s.signals, s.facts, s.rng], "asking changed nothing in the world");
}

// a lead-holder in steel the guild knows, hurt (7 hp), a convoy waiting on the first dangerous road of the course
const hurtLead = (() => {
  const base = edit(town, (c) => {
    me(c).money = 100;
    growth(c).stats.str = 14;
    growth(c).unlocks = { ...(growth(c).unlocks ?? {}), unl_road_lead: true };
  });
  let s = withStanding(play(base, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword"), P("act_equip_steel_sword")]).state, 30);
  for (let h = 0; h < 24 * 90 && !(sig(s, "road_trouble") === 2 && open(s, "opt_guild_clerk_escort")); h += 1) s = play(s, [HOUR]).state;
  return edit(s, (c) => { growth(c).resources.stamina.current = 6; me(c).hp.current = 7; });
})();

// 3. information -> choice -> consequence, with Death & Injury and World Memory
function testChoiceAndFall() {
  assert.strictEqual(hurtLead.facts.fact_road_north.value, "dangerous", "the course's own dangerous road");
  assert.ok(open(hurtLead, "opt_guild_clerk_escort_danger") && open(hurtLead, "opt_guild_clerk_escort_lead"));
  // blind: the danger job, failed -- the road's 7 kills a guard at 7
  const blind = landing(hurtLead, DANGER, ["partial", "fail"]);
  const fell = blind.r.state;
  assert.deepStrictEqual(fell.pending, { kind: "newCharacter" }, "dead of the dangerous road");
  assert.deepStrictEqual(roadWords(fell).map((id) => known(fell)[id]), roadWords(blind.before).map((id) => known(blind.before)[id]), "and saw nothing of it");
  assert.strictEqual(sig(fell, "guards_fallen"), sig(hurtLead, "guards_fallen") + 1, "the guild remembers a guard it knew");
  assert.strictEqual(sig(fell, "kit_steel"), sig(hurtLead, "kit_steel") + 1, "and keeps the steel");
  assert.ok(sig(fell, "estate_held") > sig(hurtLead, "estate_held"), "and a share of the purse");
  // informed, on the same roll: ask, read the latest word, and take the ordinary lead on a dangerous road
  const asked = play(blind.before, ASK);
  assert.strictEqual(latest(asked.state).claim, "dangerous");
  assert.ok(asked.said.includes("txt_guild_clerk_road_dangerous"));
  const led = play(asked.state, LEAD);
  assert.strictEqual(led.state.pending?.kind === "newCharacter", false, "the guard who listened lives");
  assert.ok(me(led.state).hp.current >= 7 - 3, "the lead costs at most 3 on any road");
  // the fall does not move the road: the road a guard who only waited would have had
  assert.deepStrictEqual(road(fell), road(waitHoursTo(blind.before, fell.time.minute)));
  // the next life knows nothing of the road and is not known: the yard's talk, and what the guild remembers
  const next = play(fell, [NEW_LIFE, ...WALK]).state;
  assert.deepStrictEqual(roadWords(next), [], "the successor has heard nothing");
  const told = play(waitForConvoy(next), ASK);
  assert.ok(told.said.includes("txt_guild_clerk_road_for_known"), "the clerk does not know the successor");
  assert.ok(told.said.includes("txt_guild_clerk_fallen") && told.said.includes("txt_guild_clerk_careful_offer"), "the guild remembers the fall");
  assert.ok(told.said.includes("txt_guild_clerk_kit_offer") && told.said.includes("txt_guild_clerk_estate_offer"), "and what was left");
  const talk = sig(told.state, "road_trouble") === 0 ? "rum_road_talk_quiet" : "rum_road_talk_unsettled";
  assert.deepStrictEqual(roadWords(told.state), [talk], "the yard's talk, by the road as it is");
  assert.deepStrictEqual(road(told.state).turns, turnsAt(told.state.time.minute), "and the road kept the clock through the death");
  // the village hears of the fall a caravan's cadence later, on the same clock the road turns on
  const village = waitTo(told.state, told.state.time.minute + 2 * CADENCE);
  assert.strictEqual(village.flags?.guard_fall_word_south, true, "the word of the fall went south");
  assert.strictEqual(road(village).turns, turnsAt(village.time.minute));
}

// 4. a real save from before Road News
function testOldSave() {
  const record = JSON.parse(readFileSync(new URL("./fixtures/save-before-road-news.json", import.meta.url), "utf8"));
  const old = parseLoadedRecord(record);
  assert.deepStrictEqual(validateState(old), []);
  assert.deepStrictEqual(checkDataCompatibility(old, worldData), []);
  assert.deepStrictEqual([old.facts.fact_road_course, old.facts.fact_road_north, old.fired.evt_road_north, sig(old, "road_trouble")], [undefined, undefined, undefined, 0], "no road in it");
  assert.strictEqual(me(old).locationId, "loc_castle_town");
  // the next step: one turn from the first place, nothing made for the days before
  const hour = play(old, [HOUR]).state;
  assert.deepStrictEqual(road(hour), { trouble: sig(hour, "road_trouble"), phase: 1, started: 1, fact: CONDITIONS[sig(hour, "road_trouble")], turns: 1 });
  // then the clock: a turn a cycle from that first turn
  const first = hour.fired.evt_road_north.lastMinute;
  const later = waitTo(hour, hour.time.minute + 3 * CADENCE);
  assert.strictEqual(road(later).turns, 1 + Math.floor((later.time.minute - first) / CADENCE));
  // the guild does not know this guard (the escort failed): the yard's talk, and the old life goes on
  const asked = play(waitForConvoy(later), ASK);
  assert.ok(asked.said.includes("txt_guild_clerk_road_for_known"));
  assert.strictEqual(roadWords(asked.state).length, 1);
  assert.strictEqual(me(asked.state).hp.current >= me(old).hp.current, true, "rest and time did what they did");
  // save/load and determinism
  const path = [...ASK, DAY, DAY, DAY, ...ASK];
  const end = play(asked.state, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old_road", asked.state, { savedAt: 1 }))));
  assert.deepStrictEqual(play(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(parseLoadedRecord(record), [HOUR]).state, hour, "the same save, the same world");
}

testClock();
testStale();
testChoiceAndFall();
testOldSave();
console.log("V2-Core-128 data-world-road-news-integrated.test.js: all checks passed");
