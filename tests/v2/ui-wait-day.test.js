// V2-Core-144 (roadmap M8, D-122, Issue #361): web/v2/ui/wait.js, through the ordinary step() API and the real pack.
//   1. a day is the wait button's half hour 48 times over: the same state and the same events as 48 clicks
//   2. it stops after the half hour in which the character was hurt (the ruins: HP -4 every half hour, no catch-up --
//      one 1440-minute wait would strike once), in which a new character became pending (death there), in which the
//      world told the player something (the spring's miasma resisted), or when the wait itself was refused
//   3. the input is not changed; the same input gives the same day; the result is a valid state
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";
import { waitDay, WAIT_MINUTES, WAITS_IN_A_DAY } from "../../web/v2/ui/wait.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const HALF_HOUR = { type: "wait", minutes: WAIT_MINUTES };
const me = (s) => s.actors[s.player.actorId];
const fresh = (seed = "history-41") => createInitialState({ worldSeed: seed, data: worldData }).state;

function run(state, actions) {
  const events = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    events.push(...result.events);
    state = result.state;
  }
  return { state, events };
}
const clicks = (state, n) => run(state, Array.from({ length: n }, () => HALF_HOUR));

// the ruins, reached with a lantern (history-41's opening, as data-world-keep-frontier)
const atRuins = run(fresh(), [P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")]).state;

function testADayIsTheButtonsHalfHours() {
  assert.equal(WAIT_MINUTES * WAITS_IN_A_DAY, 1440);
  const start = fresh();
  const before = JSON.stringify(start);
  const day = waitDay(start, worldData);
  assert.equal(JSON.stringify(start), before, "the input is not changed");
  assert.equal(day.stop, null);
  assert.equal(day.minutes, 1440);
  const byHand = clicks(start, WAITS_IN_A_DAY);
  assert.deepEqual(day.state, byHand.state, "the same world as 48 clicks");
  assert.deepEqual(day.events, byHand.events, "the same events as 48 clicks");
  assert.equal(day.state.time.minute - start.time.minute, 1440);
  assert.deepEqual(waitDay(start, worldData), day, "the same input, the same day");
  assert.deepEqual(validateState(day.state), []);
}

function testItStopsWhenHurt() {
  const hp = me(atRuins).hp.current;
  assert.ok(hp > 4, "staged: alive through one strike");
  const r = waitDay(atRuins, worldData);
  assert.equal(r.stop, "hurt");
  assert.equal(r.minutes, 30);
  assert.equal(me(r.state).hp.current, hp - 4);
  assert.deepEqual(r.state, clicks(atRuins, 1).state, "one click's world");
  assert.ok(r.events.some((e) => e.type === "narration" && e.data.textId === "txt_ruins_hazard"));
  // a single 1440-minute wait would have struck once for the whole day -- why the day is made of half hours
  assert.equal(me(step(atRuins, { type: "wait", minutes: 1440 }, worldData).state).hp.current, hp - 4);
  assert.ok(me(clicks(atRuins, 2).state).hp.current < hp - 4);
}

function testItStopsAtDeath() {
  const frail = structuredClone(atRuins);
  me(frail).hp.current = 3; // staged: one strike kills
  const r = waitDay(frail, worldData);
  assert.equal(r.stop, "pending");
  assert.equal(r.state.pending?.kind, "newCharacter");
  assert.equal(r.minutes, 30);
  assert.deepEqual(r.state, step(frail, HALF_HOUR, worldData).state);
}

function testItStopsAtNews() {
  // the spring's miasma, resisted: narrated, no HP lost -- the first seed whose half hour there resists it
  for (let i = 0; i < 200; i += 1) {
    const s = fresh(`wait-day-${i}`);
    const inspected = step(s, P("act_inspect_well"), worldData);
    if (!inspected.state.knowledge?.[inspected.state.player.actorId]?.rum_well_source) continue;
    const there = step(inspected.state, M("loc_forest_spring"), worldData);
    if (there.events.some((e) => e.type === "action.rejected") || there.state.pending) continue;
    const r = waitDay(there.state, worldData);
    if (r.stop !== "news") continue;
    assert.equal(r.minutes, 30);
    assert.equal(me(r.state).hp.current, me(there.state).hp.current);
    assert.ok(r.events.some((e) => e.type === "narration" && e.data.textId === "txt_spring_miasma_resisted"));
    assert.deepEqual(r.state, step(there.state, HALF_HOUR, worldData).state);
    return;
  }
  assert.fail("no seed resisted the miasma");
}

function testItStopsWhenRefused() {
  const talking = run(fresh(), [P("act_talk_elder")]).state;
  assert.equal(talking.pending?.kind, "choice");
  const r = waitDay(talking, worldData);
  assert.equal(r.stop, "rejected");
  assert.equal(r.minutes, 0);
  assert.equal(r.state, talking, "nothing changed");
  assert.equal(r.events.find((e) => e.type === "action.rejected")?.data.code, "pending_choice");
}

testADayIsTheButtonsHalfHours();
testItStopsWhenHurt();
testItStopsAtDeath();
testItStopsAtNews();
testItStopsWhenRefused();
console.log("V2-Core-144 ui-wait-day.test.js: all checks passed");
