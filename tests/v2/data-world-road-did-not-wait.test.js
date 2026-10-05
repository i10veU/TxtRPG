// V2-Core-110 (#265, World Simulation 2, step 3 -- integrated: the road that did not wait): one world, two lives, through
// the ordinary step() API and the real pack. No new rule. The caravans do not wait (V2-Core-108/109); the guild remembers
// its guards and a known guard's fall is counted (V2-Core-102); the memory reaches the next life as a choice (V2-Core-106):
//   1. a guard the guild knows, up to date (four convoys guarded), goes on the royal journey (eleven days): one caravan
//      left with another guard, one is still owed; the clerk tells him why -- knowing him does not change the world's count;
//   2. back, he takes the owed convoy and falls (staged: the last hp, no strength, a bad roll); the guild knew him, so the
//      world counts it, in the very step that killed him;
//   3. the successor starts with nothing of his -- no standing, no wound, no practice -- and the world's numbers stay as the
//      first life left them: what left, what fell. The walk to the town takes most of a day, and the shares the world kept
//      are never above the cap; the clerk speaks of the convoy that left only when there is work to speak of (the next
//      convoy), and then tells the successor both things (the convoy that left and the guard who did not come back);
//   4. the careful way is offered to the successor (the world's memory) and not the lead (the character's unlock); taking
//      it costs a day and no hp;
//   5. save/load between the lives, and determinism.
// Staged where it must be (a strong, rested guard in 1; the fall in 2 -- a known guard does not die by chance). Everything
// else is the ordinary game. The numbers are the world's, the standing is the character's (D-71). No Canon.
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
const HOUR = { type: "wait", minutes: 60 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const LEFT = "txt_guild_clerk_left_without";
const FALLEN = "txt_guild_clerk_fallen";
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const JOURNEY = [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town")];
// the successor's walk, from the village to the town (data-world-guard-fallen)
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

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
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const offered = (s, optionId) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === optionId).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const wanted = (s) => offered(s, "opt_guild_clerk_escort");
const strong = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !wanted(t); h += 1) t = play(t, [HOUR]).state; assert.ok(wanted(t), "a convoy wants a guard"); return t; };
const guard = (s) => play(play(strong(waitForConvoy(s)), ESCORT).state, [M("loc_castle_town")]).state;

// the fall, staged: the last point of hp, no strength, and a bad roll (the first rng cursor at which the escort's check
// fails -- found deterministically on the staged state)
function doomed(s) {
  const c = structuredClone(s);
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.state.pending?.kind === "newCharacter") return r;
  }
  throw new Error("no bad roll within 60 rolls");
}

// a guard the guild knows, up to date: four convoys taken
const start = (() => { let s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; for (let i = 0; i < 4; i += 1) s = guard(s); return s; })();

// the guild's standing builds by five a convoy: one guarded is not yet known, two are
const townStart = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
const oneGuarded = guard(townStart);
const twoGuarded = guard(oneGuarded);

// 1. the journey
function testJourney() {
  assert.ok(standing(start) >= 10, "the guild knows the guard");
  assert.strictEqual(sig(start, "guards_owed"), 0);
  assert.strictEqual(sig(start, "caravans_unguarded"), 0);
  const back = play(start, JOURNEY);
  assert.strictEqual(sig(back.state, "guards_owed"), 1, "one convoy is still owed a guard");
  assert.strictEqual(sig(back.state, "caravans_unguarded"), 1, "one left with another guard");
  assert.ok(play(back.state, ASK).said.includes(LEFT), "the clerk tells the guard he knows");
  assert.ok(standing(back.state) >= 10, "the guild still knows him: the world's loss is not his standing");
  return back.state;
}

// 2. the fall
function testFall(back) {
  assert.ok(wanted(back));
  assert.strictEqual(sig(back, "guards_fallen"), 0);
  assert.strictEqual(offered(back, "opt_guild_clerk_escort_careful"), false, "before any fall, the careful way is not offered");
  // the guild counts only the guards it knew: one convoy guarded (standing 5) leaves no trace, two (10) are counted
  assert.strictEqual(standing(oneGuarded), 5);
  assert.strictEqual(sig(doomed(waitForConvoy(oneGuarded)).state, "guards_fallen"), 0, "a guard the guild did not know is not counted");
  assert.strictEqual(standing(twoGuarded), 10);
  assert.strictEqual(sig(doomed(waitForConvoy(twoGuarded)).state, "guards_fallen"), 1, "one it knew is");
  const fell = doomed(back);
  assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" }, "the road ended him");
  assert.strictEqual(sig(fell.state, "guards_fallen"), 1, "the guild knew him: counted in the very step that killed him");
  assert.ok(fell.log.at(-1).events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_known_guard_fell"));
  return fell.state;
}

// 3. the successor
function testSuccessor(fell) {
  const lived = play(fell, [NEW_LIFE]).state;
  for (const key of ["guards_fallen", "guards_owed", "caravans_unguarded", "caravan_visits", "guards_hired"]) {
    assert.strictEqual(sig(lived, key), sig(fell, key), `a new life does not add or lose ${key}`);
  }
  assert.strictEqual(standing(lived), undefined, "no standing");
  assert.ok(!growth(lived).traits?.road_wound, "no wound");
  assert.strictEqual(growth(lived).stats.str, growth(play(createInitialState({ worldSeed: "history-41", data: worldData }).state, []).state).stats.str, "no strength of his");

  const walked = play(lived, SUCCESSOR_WALK);
  const days = (walked.state.time.minute - lived.time.minute) / 1440;
  assert.ok(days > 0.5 && days < 1, `the walk takes most of a day (${days})`);
  assert.ok(sig(walked.state, "caravan_visits") >= sig(lived, "caravan_visits"), "the road does not run backwards");
  assert.ok(sig(walked.state, "caravans_unguarded") >= sig(lived, "caravans_unguarded"), "what left stays gone");
  assert.ok(sig(walked.state, "guards_owed") <= 1, "the shares kept never exceed the cap");
  assert.strictEqual(me(walked.state).locationId, "loc_castle_town");

  // the clerk speaks of lost convoys only when there is work to speak of (data-world-caravans-wait): she has none the
  // moment the successor arrives -- the shares the world kept went with the first life -- and the next convoy brings it
  assert.ok(!play(walked.state, ASK).said.includes(LEFT), "no convoy waiting, no word of the ones that left");
  assert.strictEqual(offered(walked.state, "opt_guild_clerk_escort_careful"), false, "the careful way is for a convoy that wants a guard");
  const ready = waitForConvoy(walked.state);
  const asked = play(ready, ASK);
  assert.ok(asked.said.includes(LEFT), "the clerk tells the successor a convoy left without a guard");
  assert.ok(asked.said.includes(FALLEN), "and that a guard did not come back");
  assert.ok(!asked.said.includes("txt_guild_clerk_knows_you"), "and does not know the successor");
  return ready;
}

// 4. the careful way
function testCareful(ready) {
  assert.ok(offered(ready, "opt_guild_clerk_escort_careful"), "the world's memory offers the careful way");
  assert.strictEqual(offered(ready, "opt_guild_clerk_escort_lead"), false, "not the lead: that is a character's unlock");
  const hp0 = me(ready).hp.current;
  const t0 = ready.time.minute;
  const r = play(ready, [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")]);
  assert.ok(me(r.state).hp.current >= hp0, "the careful way costs no hp");
  assert.strictEqual(r.state.time.minute - t0, 1440, "a day on the road");
  return ready;
}

// 5. save/load between the lives, determinism
function testSaveAndDeterminism(fell, inTown) {
  assert.deepStrictEqual(validateState(fell), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_fell", fell, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fell);
  const rest = [NEW_LIFE, ...SUCCESSOR_WALK, ...ASK];
  const end = play(fell, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(fell, rest).state, end, "the same input, the same world");
  assert.deepStrictEqual(validateData(worldData), []);
  assert.ok(inTown);
}

const back = testJourney();
const fell = testFall(back);
const inTown = testSuccessor(fell);
testCareful(inTown);
testSaveAndDeterminism(fell, inTown);
console.log("V2-Core-110 data-world-road-did-not-wait.test.js: all checks passed");
