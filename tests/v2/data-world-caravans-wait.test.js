// V2-Core-108/109 (#265, World Simulation 2 -- the caravans do not wait): through the ordinary step() API and the real
// pack. No engine change; additive content only (D-92):
//   owed shares are capped at ONE (V2-Core-109 tightened the first step's three, on measurement: a steady career loses
//   none under any cap from 1 to 3 -- staying in town or walking home to rest -- but only a cap of one makes a long
//   absence cost anything): a caravan not guarded by the time the next arrives has left with another guard -- counted
//   in the world's `caravans_unguarded` -- and the clerk says so. The first three caravans' rule (`FIRST_CARAVANS_WANT`)
//   is untouched. A save already over the cap is brought down at its next caravan (by up to 12; one holding more comes
//   down over the next ones). Provisional gameplay values (R-29).
//   1. the world's timeline with nobody hiring: owed = min(visits - 3, 1), unguarded = max(0, visits - 4), every day;
//   2. what a long absence costs: a traveller back after 24 days finds the three first-caravan jobs and the one share
//      -- four escorts at once, not the nine caravans' worth -- and the clerk tells why;
//   3. a steady career is untouched: a guard who takes every caravan loses none;
//   4. a save over the cap (staged): 9 -> 1, 10 -> 1, 12 -> 1, and 20 -> 9 -> 1 over the next caravans;
//   5. save compatibility (the start is the same without it), save/load and determinism.
// Staged where it must be (a strong, rested guard in 2/3; the owed counts in 4). The words are Provisional. No Canon.
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
const DAY = { type: "wait", minutes: 1440 };
const HOUR = { type: "wait", minutes: 60 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const LEFT = "txt_guild_clerk_left_without";
// history-41: the dispersal, the crossing, the road open -- standing at the ford (data-world-river-ford)
const TO_FORD = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
];
const TO_TOWN = [P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

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
const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
// a strong, rested guard (staged): the escort's outcome is not what these tests are about
const rested = (s) => { const c = structuredClone(s); growth(c).stats.str = 30; growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; return c; };

const atFord = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_FORD).state;

// 1. the timeline with nobody hiring
function testTimeline() {
  let s = atFord;
  const seen = [];
  for (let day = 1; day <= 24; day += 1) {
    s = play(s, [DAY]).state;
    const v = sig(s, "caravan_visits");
    assert.strictEqual(sig(s, "guards_owed"), Math.min(Math.max(0, v - 3), 1), `day ${day}: owed = min(visits - 3, 1)`);
    assert.strictEqual(sig(s, "caravans_unguarded"), Math.max(0, v - 4), `day ${day}: the ones beyond the cap left`);
    assert.strictEqual(sig(s, "guards_hired"), 0);
    seen.push(v);
  }
  assert.ok(Math.max(...seen) >= 9, "the road went on past the cap");
  return s;
}

// 2. what a long absence costs
function testLongAbsence(away) {
  assert.strictEqual(sig(away, "caravan_visits"), 9);
  assert.strictEqual(sig(away, "guards_owed"), 1);
  assert.strictEqual(sig(away, "caravans_unguarded"), 5);
  let s = play(away, TO_TOWN).state;
  assert.ok(play(s, ASK).said.includes(LEFT), "the clerk tells why");
  let jobs = 0;
  while (wanted(s) && jobs < 20) {
    s = play(rested(s), ESCORT).state;
    jobs += 1;
    s = play(s, [M("loc_castle_town")]).state;
  }
  // the first three caravans' shortfall (3) and the one share the cap kept are four jobs at once; the five caravans
  // that left while she was away are gone for good -- and one more while she was on the road (a caravan came, found
  // the share taken, and the next one left)
  assert.strictEqual(jobs, 4);
  assert.strictEqual(sig(s, "caravan_visits"), 10);
  assert.strictEqual(sig(s, "guards_owed"), 0);
  assert.strictEqual(sig(s, "caravans_unguarded"), 6, "five left while she was away, one while she was on the road");
  // lost shares and no convoy to guard: the clerk has no job to speak of
  assert.strictEqual(wanted(s), false);
  assert.ok(!play(s, ASK).said.includes(LEFT), "no work, so no word about the work that was lost");
  assert.strictEqual(sig(s, "guards_hired") - 0, jobs);
}

// 3. a steady career is untouched
function testSteady() {
  let s = play(atFord, TO_TOWN).state;
  for (let i = 0; i < 8; i += 1) {
    for (let h = 0; h < 96 && !wanted(s); h += 1) s = play(s, [HOUR]).state;
    assert.ok(wanted(s));
    s = play(rested(s), ESCORT).state;
    s = play(s, [M("loc_castle_town")]).state;
  }
  assert.strictEqual(sig(s, "caravans_unguarded"), 0, "a guard who takes every caravan loses none");
  assert.ok(sig(s, "guards_owed") <= 1);
  for (let h = 0; h < 96 && !wanted(s); h += 1) s = play(s, [HOUR]).state;
  assert.ok(wanted(s), "a convoy wants a guard");
  assert.ok(!play(s, ASK).said.includes(LEFT), "and the clerk has nothing of the kind to say");
}

// 4. a save over the cap
function testOldSave(away) {
  for (const [owed, after, lost] of [[9, 1, 9], [10, 1, 10], [12, 1, 12], [1, 1, 1], [0, 1, 0]]) {
    const old = structuredClone(away);
    old.signals = { ...old.signals, guards_owed: owed, caravans_unguarded: 0 };
    let s = old;
    const visits = sig(old, "caravan_visits");
    while (sig(s, "caravan_visits") === visits) s = play(s, [DAY]).state;
    assert.strictEqual(sig(s, "guards_owed"), after, `${owed} owed -> ${after}`);
    assert.strictEqual(sig(s, "caravans_unguarded"), lost, `${owed} owed: ${lost} left`);
  }
  // more than 12 comes down over the next caravans, never below the cap
  const huge = structuredClone(away);
  huge.signals = { ...huge.signals, guards_owed: 20 };
  let s = huge;
  const counts = [];
  for (let c = 0; c < 3; c += 1) {
    const visits = sig(s, "caravan_visits");
    while (sig(s, "caravan_visits") === visits) s = play(s, [DAY]).state;
    counts.push(sig(s, "guards_owed"));
  }
  assert.deepStrictEqual(counts, [9, 1, 1], "up to 12 at each caravan, and no further than the cap");
}

// 5. save compatibility, save/load, determinism
function testSaveAndDeterminism(away) {
  assert.deepStrictEqual(validateData(worldData), []);
  const without = structuredClone(worldData);
  without.events.evt_caravan.effects = without.events.evt_caravan.effects.slice(0, 5);
  delete without.texts[LEFT];
  for (const templateId of [undefined, "start_scout"]) {
    assert.deepStrictEqual(createInitialState({ worldSeed: "wait-1", data: worldData, templateId }).state,
      createInitialState({ worldSeed: "wait-1", data: without, templateId }).state, `the same start (${templateId ?? "wanderer"})`);
  }
  const rest = [...TO_TOWN, ...ASK, DAY, DAY, DAY];
  const end = play(away, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_wait", away, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, away);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(away, rest).state, end, "the same input, the same world");
}

const away = testTimeline();
testLongAbsence(away);
testSteady();
testOldSave(away);
testSaveAndDeterminism(away);
console.log("V2-Core-108 data-world-caravans-wait.test.js: all checks passed");
