// V2-Core-107 (#258, RPG Depth 3, step 3 -- integrated: beyond the last rank): one world, two lives, through the ordinary
// step() API and the real pack. No new rule. The road teaches to the last rank (V2-Core-99/105); the practice being
// full opens the lead job (V2-Core-105); a known guard falls (V2-Core-102); the memory reaches the next life as a
// choice (V2-Core-106):
//   1. the honoured scout's long career: eight escorts to rank 5 and practice 100, a night in the town, then -- the unlock
//      held, 3 stamina, a convoy -- the clerk offers the lead; the careful way is not offered (no fall yet); she leads and
//      the guild's regard grows by 10;
//   2. she is known to the guild and falls on the road (staged: the last hp, no strength, a bad roll); the world counts it;
//   3. the successor starts with nothing -- no unlock, no standing, no practice -- and is offered the careful way (the world's
//      memory) and not the lead (the character's unlock); the clerk says so; they take it: a day on the road, no hp lost;
//   4. the two are different layers: with the same fall remembered, a guard who holds the unlock is offered BOTH (staged:
//      the world's count set on a living lead-holder);
//   5. save/load between the lives, and determinism.
// Staged: the fall in 2 and the count in 4 (a known guard does not die by chance). Everything else is the ordinary game.
// Practice, unlock and standing are the character's; the count is the world's (D-71). No Canon.
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
const REST = P("act_rest_village");
const LODGE = P("act_lodge_castle_town");
const DAY = { type: "wait", minutes: 1440 };
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BUY_JERKIN = [P("act_talk_town_merchant"), C("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin")];
// from the town (or the far bank, where an escort ends) to the village for a rest, and back by the letter -- data-world-long-road
const REST_TRIP = [M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), REST, M("loc_crossroads"), M("loc_river_ford"),
  P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
// integrated-36, the scout of Slice 3: both stories, the arrows told, the village's honour (data-world-first-town)
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
const SCOUT_TO_TOWN = [REST, ...E("opt_ask_region"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];

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
const stamina = (s) => growth(s).resources.stamina.current;
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const lastCheck = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1).data;
const skillMod = (c) => c.modifiers.find((m) => m.source === "skill:swordsmanship")?.value ?? 0;
const DAYS = (s, t0) => Math.floor((s.time.minute - t0) / 1440);

// the policy: back to the town, the jerkin before the third, rest when spent (a night in the town, or the walk home),
// wait for the next caravan, take its escort
function career(start, count, rest) {
  let s = start;
  const record = [];
  let nights = 0;
  for (let i = 1; i <= count; i += 1) {
    if (me(s).locationId === "loc_far_bank") s = play(s, [M("loc_castle_town")]).state;
    if (record.length === 2 && !me(s).inventory.item_leather_jerkin) s = play(s, BUY_JERKIN).state;
    if (stamina(s) < 2) {
      s = play(s, rest === "lodge" ? [LODGE] : [M("loc_far_bank"), ...REST_TRIP]).state;
      if (rest === "lodge") nights += 1;
    }
    for (let h = 0; h < 96 && !wanted(s); h += 1) s = play(s, [HOUR]).state; // waits by the hour: the day the caravan comes
    assert.ok(wanted(s), "a caravan wants a guard");
    const r = play(s, ESCORT);
    const c = lastCheck(r);
    record.push({ tier: c.tier, skill: skillMod(c), day: DAYS(r.state, start.time.minute), pay: me(r.state).money - me(s).money });
    s = r.state;
  }
  return { state: s, record, nights };
}

const scoutInTown = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
const LEAD = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_lead")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const LEAD_TEXT = "txt_guild_clerk_lead_offer";
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const unlocked = (s) => growth(s).unlocks?.unl_road_lead === true;
const offered = (s, optionId) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === optionId).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
// the first rng cursor at which the lead job's check lands in a tier -- found deterministically on the same state
function withTier(state, tier) {
  for (let k = 0; k < 80; k += 1) {
    const t = structuredClone(state);
    t.rng.cursor += k;
    const r = play(t, LEAD);
    if (lastCheck(r).tier === tier || (tier === "fail" && lastCheck(r).tier === "partial")) return { before: t, ...r };
  }
  throw new Error(`no ${tier} within 80 rolls`);
}

const crossing = (() => {
  // the scout's career, escort by escort: the unlock appears with the eighth
  let s = play(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]).state;
  const marks = [];
  for (let i = 1; i <= 8; i += 1) {
    s = career(s, 1, "lodge").state;
    marks.push({ combat: growth(s).proficiency.combat, unlocked: unlocked(s) });
    if (i === 7) var sevenEscorts = s;
  }
  return { marks, ready: s, sevenEscorts };
})();
const ready = crossing.ready;

const NEXT_LIFE_TO_TOWN = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const CAREFUL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")];
const CAREFUL_OFFER = "txt_guild_clerk_careful_offer";
const stamina_ = (s) => growth(s).resources.stamina.current;
const toTown = (s) => (me(s).locationId === "loc_far_bank" ? play(s, [M("loc_castle_town")]).state : s);
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = play(t, [HOUR]).state; assert.ok(wanted(t), "a convoy wants a guard"); return t; };
// the first rng cursor at which the ordinary escort ends the staged guard
function staged(state) {
  const c = structuredClone(state);
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 80; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    if (play(waitForConvoy(t), ESCORT).state.pending?.kind === "newCharacter") return t;
  }
  throw new Error("no bad roll within 80 rolls");
}

// 1. the career, the unlock, the lead
function testCareerAndLead() {
  assert.strictEqual(growth(ready).skills.swordsmanship, 5);
  assert.strictEqual(growth(ready).proficiency.combat, 100);
  assert.strictEqual(unlocked(ready), true);
  assert.strictEqual(ready.signals.guards_fallen, undefined, "no fall yet");
  let s = play(toTown(ready), [LODGE]).state;
  s = waitForConvoy(s);
  assert.ok(stamina_(s) >= 3);
  assert.strictEqual(offered(s, "opt_guild_clerk_escort_lead"), true);
  assert.strictEqual(offered(s, "opt_guild_clerk_escort_careful"), false, "the careful way is a fall's memory: none yet");
  const asked = play(s, ASK);
  assert.ok(asked.said.includes(LEAD_TEXT) && !asked.said.includes(CAREFUL_OFFER));
  const led = play(s, LEAD);
  assert.strictEqual(standing(led.state) - standing(s), lastCheck(led).tier === "success" || lastCheck(led).tier === "great" ? 10 : 0, "the guild's regard, twice as fast");
  return s;
}

// 2. she is known to the guild and falls
function testFall(inTown) {
  assert.ok(standing(inTown) >= 10, "known to the guild");
  const fell = play(staged(inTown), [DAY, DAY, DAY]);
  const end = play(waitForConvoy(fell.state), ESCORT);
  assert.deepStrictEqual(end.state.pending, { kind: "newCharacter" }, "the road ended her");
  assert.strictEqual(end.state.signals.guards_fallen, 1, "the world counts it");
  return end.state;
}

// 3. the successor
function testSuccessor(fallen) {
  const born = play(fallen, [NEW_LIFE]);
  assert.strictEqual(unlocked(born.state), false, "no unlock: it was hers");
  assert.strictEqual(standing(born.state), undefined, "no standing");
  assert.strictEqual(growth(born.state).proficiency?.combat, undefined, "no practice");
  const inTown = waitForConvoy(play(born.state, NEXT_LIFE_TO_TOWN).state);
  assert.strictEqual(offered(inTown, "opt_guild_clerk_escort_careful"), true, "the world's memory: offered");
  assert.strictEqual(offered(inTown, "opt_guild_clerk_escort_lead"), false, "the character's unlock: not offered");
  const asked = play(inTown, ASK);
  assert.ok(asked.said.includes(CAREFUL_OFFER) && !asked.said.includes(LEAD_TEXT), "the clerk offers the one, not the other");
  const took = play(inTown, CAREFUL);
  assert.strictEqual(me(took.state).hp.current, me(inTown).hp.current, "no hp lost");
  assert.ok(!growth(took.state).traits?.road_wound, "no wound");
  assert.ok(took.state.time.minute - inTown.time.minute >= 1440, "a day on the road");
  assert.strictEqual(took.state.signals.guards_hired, inTown.signals.guards_hired + 1);
  return { born: born.state, inTown };
}

// 4. two layers: the same memory, a guard who holds the unlock: offered both
function testTwoLayers() {
  let s = waitForConvoy(play(toTown(ready), [LODGE]).state);
  s.signals = { ...s.signals, guards_fallen: 1 };
  assert.strictEqual(offered(s, "opt_guild_clerk_escort_lead"), true);
  assert.strictEqual(offered(s, "opt_guild_clerk_escort_careful"), true, "the world's memory is offered to the unlocked guard too");
  const asked = play(s, ASK);
  assert.ok(asked.said.includes(LEAD_TEXT) && asked.said.includes(CAREFUL_OFFER), "and the clerk offers both");
}

// 5. save/load between the lives, determinism
function testSaveAndDeterminism(fallen) {
  const rest = [NEW_LIFE, ...NEXT_LIFE_TO_TOWN];
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_beyond", fallen, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fallen);
  const end = waitForConvoy(play(fallen, rest).state);
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(waitForConvoy(play(loaded, rest).state), end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(end, CAREFUL).state, play(waitForConvoy(play(loaded, rest).state), CAREFUL).state);
}

const inTown = testCareerAndLead();
const fallen = testFall(inTown);
testSuccessor(fallen);
testTwoLayers();
testSaveAndDeterminism(fallen);
console.log("V2-Core-107 data-world-beyond-last-rank.test.js: all checks passed");
