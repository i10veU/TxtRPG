// V2-Core-115 (#282 honest clock, step 1 -- events catch up on long steps, opt-in): the engine, through the ordinary
// step() API on a tiny pack. Until now the trigger stage runs once per step (CORE_CONTRACTS §2.5 step 10), so a cooldown
// event fires at most once however many periods a long step spans, and `lastMinute` becomes *now*, losing the remainder
// too. The new optional field `catchUp: true` (honoured only with an integer `cooldown`, and not with `once`):
//   1. fires the event k = floor(elapsed / cooldown) times in the one step (sequentially: each firing sees the state
//      the one before left, and each after the first is made only while the trigger is still true there), counts k, and emits one `trigger.fired` per firing;
//   2. keeps the cadence's phase: `lastMinute += k * cooldown`, not = now, so the remainder is not lost;
//   3. is bounded: at most 64 firings in a step; what is left is caught up on the following steps;
//   4. changes nothing without the field (an event with a cooldown fires once and lastMinute becomes now, as before),
//      nothing for `once`, nothing for the first firing (it fires once, and its minute starts the cadence);
//   5. `validateData` rejects a `catchUp` that is not a boolean or has no cooldown to count;
//   6. it is deterministic and survives save/load (no new state: `fired[id]` is the same shape).
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";

function pack(events) {
  return {
    formatVersion: 1,
    id: "catch_up_pack",
    version: "0.1.0",
    world: { id: "catch_up_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: { start_default: { kind: "player", locationId: "loc_start", hp: { max: 10 }, money: 5, inventory: {}, growth: {}, tags: [] } },
    locations: { loc_start: { links: [] } },
    actions: {},
    choices: {},
    events
  };
}
const TICK = { op: "signal", key: "ticks", add: 1 };
const ALWAYS = { op: "always" };
const wait = (state, data, minutes) => step(state, { type: "wait", minutes }, data);
const sig = (s, k) => s.signals?.[k] ?? 0;
const fired = (result) => result.events.filter((e) => e.type === "trigger.fired" && e.data.eventId === "evt_tick").length;

// 1-2. k firings, the phase kept
function testCatchUp() {
  const data = pack({ evt_tick: { trigger: ALWAYS, cooldown: 100, catchUp: true, effects: [TICK] } });
  let s = createInitialState({ worldSeed: "cu-1", data }).state;
  const first = wait(s, data, 1);
  assert.strictEqual(sig(first.state, "ticks"), 1, "the first firing is one");
  assert.strictEqual(first.state.fired.evt_tick.lastMinute, 1, "and starts the cadence");
  assert.strictEqual(fired(first), 1);
  // 450 minutes later: 4 whole periods have passed since minute 1 (451 - 1 = 450 = 4 * 100 + 50)
  const long = wait(first.state, data, 450);
  assert.strictEqual(sig(long.state, "ticks"), 1 + 4, "four more firings in the one step");
  assert.strictEqual(long.state.fired.evt_tick.count, 5);
  assert.strictEqual(long.state.fired.evt_tick.lastMinute, 1 + 400, "the cadence keeps its phase: lastMinute += 4 * 100");
  assert.strictEqual(fired(long), 4, "one trigger.fired per firing");
  // the remainder (50) is not lost: 50 more minutes complete the next period
  const next = wait(long.state, data, 50);
  assert.strictEqual(sig(next.state, "ticks"), 6, "the remainder counted: one more");
  assert.strictEqual(next.state.fired.evt_tick.lastMinute, 1 + 500);
  // and a short step in between fires nothing
  const short = wait(next.state, data, 99);
  assert.strictEqual(sig(short.state, "ticks"), 6, "inside a period: nothing");
  assert.strictEqual(short.state.fired.evt_tick.lastMinute, 1 + 500);
  return { data, long: long.state };
}

// sequential: each firing sees what the one before left
function testSequential() {
  const data = pack({
    evt_tick: {
      trigger: ALWAYS,
      cooldown: 100,
      catchUp: true,
      effects: [TICK, { op: "if", when: { op: "signal", key: "ticks", eq: 3 }, then: [{ op: "flag", key: "third_seen", value: true }] },
        { op: "if", when: { op: "signal", key: "ticks", min: 3 }, then: [{ op: "signal", key: "late", add: 1 }] }]
    }
  });
  let s = createInitialState({ worldSeed: "cu-2", data }).state;
  s = wait(s, data, 1).state;
  const long = wait(s, data, 300);
  assert.strictEqual(sig(long.state, "ticks"), 4);
  assert.strictEqual(long.state.flags.third_seen, true, "the third firing saw ticks == 3");
  assert.strictEqual(sig(long.state, "late"), 2, "and the third and fourth saw ticks >= 3");
}

// an event that limits itself stops where a step-by-step wait would: each firing after the first re-checks the trigger
function testSelfLimiting() {
  const data = pack({ evt_tick: { trigger: { op: "signal", key: "ticks", max: 1 }, cooldown: 100, catchUp: true, effects: [TICK] } });
  let s = createInitialState({ worldSeed: "cu-9", data }).state;
  s = wait(s, data, 1).state; // ticks 0 -> 1 (the trigger held at 0)
  const long = wait(s, data, 1000); // ten periods due; the trigger holds at 1, then is false at 2
  assert.strictEqual(sig(long.state, "ticks"), 2, "one more firing, then the trigger is false: it stops");
  assert.strictEqual(long.state.fired.evt_tick.count, 2);
  assert.strictEqual(long.state.fired.evt_tick.lastMinute, 1 + 100, "and only what was fired moves the cadence");
  // the step-by-step wait ends in the same place
  let t = createInitialState({ worldSeed: "cu-9", data }).state;
  t = wait(t, data, 1).state;
  for (let i = 0; i < 10; i += 1) t = wait(t, data, 100).state;
  assert.strictEqual(sig(t, "ticks"), 2);
  assert.strictEqual(t.fired.evt_tick.count, 2);
}

// 3. the cap
function testCap() {
  const data = pack({ evt_tick: { trigger: ALWAYS, cooldown: 1, catchUp: true, effects: [TICK] } });
  let s = createInitialState({ worldSeed: "cu-3", data }).state;
  s = wait(s, data, 1).state; // first firing at minute 1
  const long = wait(s, data, 1000); // 1000 whole periods are due
  assert.strictEqual(sig(long.state, "ticks"), 1 + 64, "at most 64 firings in a step");
  assert.strictEqual(long.state.fired.evt_tick.lastMinute, 1 + 64, "lastMinute advances by exactly what was fired");
  const more = wait(long.state, data, 1);
  assert.strictEqual(sig(more.state, "ticks"), 1 + 64 + 64, "the rest is caught up on the following steps");
}

// 4. nothing changes without the field, for once, or for the first firing
function testUnchanged() {
  const plain = pack({ evt_tick: { trigger: ALWAYS, cooldown: 100, effects: [TICK] } });
  let s = createInitialState({ worldSeed: "cu-4", data: plain }).state;
  s = wait(s, plain, 1).state;
  const long = wait(s, plain, 450);
  assert.strictEqual(sig(long.state, "ticks"), 2, "without catchUp: once, as before");
  assert.strictEqual(long.state.fired.evt_tick.lastMinute, 451, "and lastMinute = now, as before");
  assert.strictEqual(long.state.fired.evt_tick.count, 2);

  const once = pack({ evt_once: { trigger: ALWAYS, once: true, cooldown: 100, catchUp: true, effects: [{ op: "signal", key: "once", add: 1 }] } });
  let o = createInitialState({ worldSeed: "cu-5", data: once }).state;
  o = wait(o, once, 1).state;
  o = wait(o, once, 1000).state;
  assert.strictEqual(sig(o, "once"), 1, "once is once");

  const gated = pack({ evt_tick: { trigger: { op: "flag", key: "go" }, cooldown: 100, catchUp: true, effects: [TICK] } });
  let g = createInitialState({ worldSeed: "cu-6", data: gated }).state;
  g = wait(g, gated, 1000).state;
  assert.strictEqual(sig(g, "ticks"), 0, "a false trigger fires nothing, however long the step");
  g = structuredClone(g);
  g.flags = { ...g.flags, go: true };
  const first = wait(g, gated, 1000);
  assert.strictEqual(sig(first.state, "ticks"), 1, "the first firing is one, however long the wait before it");
  assert.strictEqual(first.state.fired.evt_tick.lastMinute, 2000, "and its minute starts the cadence");

  // only the boolean true opts in (the validator rejects the rest; the engine does not guess)
  const truthy = pack({ evt_tick: { trigger: ALWAYS, cooldown: 100, catchUp: "yes", effects: [TICK] } });
  let t = createInitialState({ worldSeed: "cu-8", data: truthy }).state;
  t = wait(t, truthy, 1).state;
  assert.strictEqual(sig(wait(t, truthy, 450).state, "ticks"), 2, "catchUp: \"yes\" is not true");

  // a catchUp event without a cooldown is just an event that fires every step
  const nocd = pack({ evt_tick: { trigger: ALWAYS, catchUp: true, effects: [TICK] } });
  let n = createInitialState({ worldSeed: "cu-7", data: nocd }).state;
  n = wait(n, nocd, 500).state;
  n = wait(n, nocd, 500).state;
  assert.strictEqual(sig(n, "ticks"), 2);
}

// 5. validation
function testValidation() {
  assert.deepStrictEqual(validateData(pack({ evt_tick: { trigger: ALWAYS, cooldown: 100, catchUp: true, effects: [TICK] } })), []);
  assert.deepStrictEqual(validateData(pack({ evt_tick: { trigger: ALWAYS, cooldown: 100, catchUp: false, effects: [TICK] } })), []);
  const bad = (event) => validateData(pack({ evt_tick: event })).filter((e) => /catchUp/.test(e));
  assert.strictEqual(bad({ trigger: ALWAYS, cooldown: 100, catchUp: "yes", effects: [TICK] }).length, 1, "not a boolean");
  assert.strictEqual(bad({ trigger: ALWAYS, catchUp: true, effects: [TICK] }).length, 1, "no cooldown to count");
  assert.strictEqual(bad({ trigger: ALWAYS, cooldown: 100, once: true, catchUp: true, effects: [TICK] }).length, 1, "once cannot catch up");
  assert.strictEqual(bad({ trigger: ALWAYS, cooldown: 0, catchUp: true, effects: [TICK] }).length, 1, "a zero cooldown has no period to count");
  assert.strictEqual(bad({ trigger: ALWAYS, cooldown: 100, effects: [TICK] }).length, 0, "absent is fine");
}

// 6. determinism and save/load
function testSaveAndDeterminism({ data, long }) {
  assert.deepStrictEqual(validateState(long), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_cu", long, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, long);
  const a = wait(wait(long, data, 77).state, data, 700).state;
  const b = wait(wait(loaded, data, 77).state, data, 700).state;
  assert.deepStrictEqual(b, a, "loaded, the same end");
  assert.deepStrictEqual(wait(wait(long, data, 77).state, data, 700).state, a, "the same input, the same world");
}

const run = testCatchUp();
testSequential();
testSelfLimiting();
testCap();
testUnchanged();
testValidation();
testSaveAndDeterminism(run);
console.log("V2-Core-115 trigger-catch-up.test.js: all checks passed");
