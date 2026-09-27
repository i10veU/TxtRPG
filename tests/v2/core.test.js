// V2-Core-01 tests (docs/v2/architecture/CORE_CONTRACTS.md §2.0, §13).
// Named `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`
// (reserved for browser/Playwright specs), so `.spec.js` here would be
// silently collected as zero tests instead of actually running.
// Uses node:assert/strict only, no test framework, per §13.1.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashString, deriveSeed, nextUint32, rollDie } from "../../web/v2/core/rng.js";
import { createInitialState, step } from "../../web/v2/core/engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

// 1 & 2. RNG determinism and same-seed reproducibility
function testRngDeterminismAndReproducibility() {
  let cursorA = { seed: hashString("world-1"), cursor: 0 };
  let cursorB = { seed: hashString("world-1"), cursor: 0 };
  const seqA = [];
  const seqB = [];
  for (let i = 0; i < 20; i += 1) {
    const drawA = nextUint32(cursorA);
    const drawB = nextUint32(cursorB);
    seqA.push(drawA.value);
    seqB.push(drawB.value);
    cursorA = drawA.rng;
    cursorB = drawB.rng;
  }
  assert.deepStrictEqual(seqA, seqB, "same seed must reproduce the same draw sequence");

  // determinism: nextUint32 is a pure function of its input rng value.
  const probe = { seed: 12345, cursor: 7 };
  assert.deepStrictEqual(nextUint32(probe), nextUint32(probe),
    "nextUint32 must return the same result for the same input");

  const other = nextUint32({ seed: hashString("world-2"), cursor: 0 });
  assert.notStrictEqual(other.value, seqA[0], "different seeds should not collide on the first draw");

  let dieRng = { seed: hashString("dice"), cursor: 0 };
  for (let i = 0; i < 50; i += 1) {
    const roll = rollDie(dieRng, 6);
    assert.ok(roll.value >= 1 && roll.value <= 6, "rollDie must stay within [1, sides]");
    dieRng = roll.rng;
  }
}

// 3. gameplay vs world-generation stream isolation
function testStreamIsolation() {
  const rootSeed = hashString("world-3");
  const factSeed = deriveSeed(rootSeed, "fact:fact_a");
  const beforeGameplay = nextUint32({ seed: factSeed, cursor: 0 }).value;

  let gameplayRng = { seed: rootSeed, cursor: 0 };
  for (let i = 0; i < 10; i += 1) {
    gameplayRng = nextUint32(gameplayRng).rng;
  }

  const afterGameplay = nextUint32({ seed: deriveSeed(rootSeed, "fact:fact_a"), cursor: 0 }).value;
  assert.strictEqual(beforeGameplay, afterGameplay,
    "consuming the gameplay stream must not change a world-generation draw for the same label");

  const npcSeed = deriveSeed(rootSeed, "npc:npc_a");
  assert.notStrictEqual(factSeed, npcSeed, "different labels must derive different seeds");
  assert.notStrictEqual(factSeed, rootSeed, "a derived seed must differ from the root seed");
}

// 4 & 5. state/action input immutability
function testInputImmutability() {
  const { state: initial } = createInitialState({ worldSeed: "immutability-check" });
  const frozenState = deepFreeze(snapshot(initial));
  const stateBefore = snapshot(frozenState);

  const action = deepFreeze({ type: "wait", minutes: 30 });
  const actionBefore = snapshot(action);

  const result = step(frozenState, action, {});

  assert.deepStrictEqual(snapshot(frozenState), stateBefore, "step() must not mutate its input state");
  assert.deepStrictEqual(snapshot(action), actionBefore, "step() must not mutate its input action");
  assert.strictEqual(result.state.time.minute, 30, "sanity: the wait itself must still have applied");
}

// 6. JSON round-trip safety
function testJsonRoundTrip() {
  const { state } = createInitialState({ worldSeed: "json-check" });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), state, "state must be JSON round-trip safe");

  const { state: afterWait, events } = step(state, { type: "wait", minutes: 90 }, {});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(afterWait)), afterWait,
    "post-step state must remain JSON round-trip safe");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(events)), events, "events must be JSON round-trip safe");
}

// 7. wait behavior
function testWait() {
  const { state } = createInitialState({ worldSeed: "wait-check" });
  const { state: next, events } = step(state, { type: "wait", minutes: 60 }, {});

  assert.strictEqual(next.time.minute, 60, "wait must advance state.time.minute by exactly `minutes`");
  assert.deepStrictEqual(next.rng, state.rng, "wait must not consume the RNG stream");
  assert.strictEqual(events.length, 1, "a successful wait must produce exactly one event");
  assert.strictEqual(events[0].type, "time.advanced");
  assert.strictEqual(events[0].visibility, "player");
  assert.strictEqual(events[0].minute, 60);
  assert.deepStrictEqual(events[0].data, { minutes: 60 });

  [1, 1440].forEach((minutes) => {
    const { state: s0 } = createInitialState({ worldSeed: "wait-boundary-" + minutes });
    const { events: evs } = step(s0, { type: "wait", minutes }, {});
    assert.strictEqual(evs[0].type, "time.advanced", "boundary minutes " + minutes + " must be accepted");
  });
}

// 8 & 9. invalid action rejection, and RNG/time non-advancement
function testInvalidAction() {
  const { state } = createInitialState({ worldSeed: "invalid-check" });

  const invalidActions = [
    { type: "perform", actionId: "act_rest" },
    { type: "move", to: "loc_market" },
    { type: "wait", minutes: 0 },
    { type: "wait", minutes: 1441 },
    { type: "wait", minutes: 1.5 },
    { type: "wait" },
    { type: "wait", minutes: "60" },
    { type: "unknown_type" },
    null,
    "wait",
    42,
    []
  ];

  invalidActions.forEach((action) => {
    const before = snapshot(state);
    const { state: after, events } = step(state, action, {});

    assert.deepStrictEqual(snapshot(after), before,
      "invalid action must leave state unchanged: " + JSON.stringify(action));
    assert.strictEqual(after.rng.cursor, state.rng.cursor, "RNG cursor must not advance on reject");
    assert.strictEqual(after.time.minute, state.time.minute, "game time must not advance on reject");
    assert.strictEqual(events.length, 1, "a rejected action must produce exactly one event");
    assert.strictEqual(events[0].type, "action.rejected");
    assert.strictEqual(events[0].visibility, "player");
    assert.deepStrictEqual(events[0].data, { code: "invalid_action" });
  });
}

// 10. deterministic composition over an action sequence
function testCompositionDeterminism() {
  const sequence = [
    { type: "wait", minutes: 60 },
    { type: "wait", minutes: 5000 }, // rejected: out of range
    { type: "wait", minutes: 30 },
    { type: "unknown" },             // rejected
    { type: "wait", minutes: 1440 }
  ];

  function replay() {
    let { state } = createInitialState({ worldSeed: "composition-check" });
    const allEvents = [];
    sequence.forEach((action) => {
      const result = step(state, action, {});
      state = result.state;
      allEvents.push(result.events);
    });
    return { state, allEvents };
  }

  const first = replay();
  const second = replay();
  assert.deepStrictEqual(second.state, first.state,
    "replaying the same action sequence must yield the same final state");
  assert.deepStrictEqual(second.allEvents, first.allEvents,
    "replaying the same action sequence must yield the same events at every step");
  assert.strictEqual(first.state.time.minute, 60 + 30 + 1440, "only the valid waits should have advanced time");
}

// 11. static scan for forbidden host APIs in the engine sources
function testNoForbiddenHostApis() {
  const forbiddenPatterns = [
    /\bMath\.random\s*\(/,
    /\bDate\s*\(/,
    /\bDate\.now\s*\(/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bindexedDB\b/,
    /\blocalStorage\b/,
    /\bfetch\s*\(/,
    /\bperformance\b/,
    /\bcrypto\b/,
    /\bsetTimeout\s*\(/
  ];

  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  ["web/v2/core/rng.js", "web/v2/core/engine.js"].forEach((relPath) => {
    const code = stripComments(fs.readFileSync(path.join(repoRoot, relPath), "utf8"));
    forbiddenPatterns.forEach((pattern) => {
      assert.ok(!pattern.test(code), relPath + " must not use forbidden host API matching " + pattern);
    });
  });
}

// 12. event schema shape
function testEventSchema() {
  const { state } = createInitialState({ worldSeed: "event-schema-check" });
  const { events: waitEvents } = step(state, { type: "wait", minutes: 15 }, {});
  const { events: rejectEvents } = step(state, { type: "bogus" }, {});

  [waitEvents[0], rejectEvents[0]].forEach((event) => {
    assert.deepStrictEqual(Object.keys(event).sort(), ["data", "minute", "type", "visibility"],
      "event must only carry the §2.4 fields (no `seq`, actorId omitted when absent)");
    assert.ok(Number.isInteger(event.minute), "event.minute must be an integer");
    assert.ok(["player", "internal"].includes(event.visibility));
    assert.strictEqual(typeof event.type, "string");
    assert.ok(event.data && typeof event.data === "object" && !Array.isArray(event.data));
    assert.strictEqual(event.seq, undefined, "events must not carry a seq field (§2.4)");
  });
}

testRngDeterminismAndReproducibility();
testStreamIsolation();
testInputImmutability();
testJsonRoundTrip();
testWait();
testInvalidAction();
testCompositionDeterminism();
testNoForbiddenHostApis();
testEventSchema();

console.log("V2-Core-01 core.test.js: all checks passed");
