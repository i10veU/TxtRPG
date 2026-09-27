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

// ============================================================
// V2-Core-11: perform/move/startCharacter wired into step() (D-46/D-47/
// D-48/D-49). `choose`/triggers/day.started remain out of scope (D-35,
// §2.5 stages 9-10) -- no tests for them here.
// ============================================================

function actionDataFixture(overrides) {
  return {
    formatVersion: 1,
    id: "test_pack",
    version: "0.1.0",
    world: { id: "test_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: {
      start_default: { kind: "player", locationId: "loc_start", hp: { max: 10 }, money: 5, inventory: {}, growth: {}, tags: [] },
      start_respawn: { kind: "player", locationId: "loc_start", hp: { max: 8 }, money: 0, inventory: {}, growth: {}, tags: [] }
    },
    locations: {
      loc_start: { links: [{ to: "loc_market", minutes: 30 }] },
      loc_market: { links: [{ to: "loc_start", minutes: 30 }] },
      loc_locked: {}
    },
    actions: {
      act_rest: { effects: [{ op: "money", add: 1 }, { op: "money", add: 2 }] },
      act_gated: { requires: { op: "never" }, effects: [{ op: "money", add: 1 }] },
      act_timed: { effects: [{ op: "money", add: 1 }], minutes: 15 },
      act_checked_success: {
        check: { difficulty: -100 },
        outcomes: { success: [{ op: "flag", key: "won", value: true }], fail: [{ op: "flag", key: "lost", value: true }] }
      },
      act_checked_fail: {
        check: { difficulty: 1000 },
        outcomes: { success: [{ op: "flag", key: "won", value: true }], fail: [{ op: "flag", key: "lost", value: true }] }
      },
      act_retry: { check: { difficulty: 1000, attemptKey: "try_x" }, outcomes: { success: [], fail: [] } },
      act_fatal: { effects: [{ op: "hp", add: -1000 }] }
    },
    ...overrides
  };
}

// 13. createInitialState bootstraps player_1 from data.characterTemplates
function testCreateInitialStateBootstrap() {
  const data = actionDataFixture();
  const { state, events } = createInitialState({ worldSeed: "bootstrap-check", data });

  assert.deepStrictEqual(events, []);
  assert.deepStrictEqual(state.player, { actorId: "player_1", characterCount: 1 });
  assert.strictEqual(state.pending, null);
  assert.deepStrictEqual(state.actors.player_1, {
    id: "player_1",
    kind: "player",
    alive: true,
    locationId: "loc_start",
    hp: { current: 10, max: 10 },
    money: 5,
    inventory: {},
    growth: {},
    tags: []
  });
  assert.strictEqual(state.dataRef.id, "test_pack");
  assert.strictEqual(typeof state.worldId, "string");
  assert.ok(state.worldId.startsWith("test_world_"));

  // deterministic: same worldSeed + data -> same worldId/state
  const again = createInitialState({ worldSeed: "bootstrap-check", data });
  assert.deepStrictEqual(again.state, state);

  // without data (or without a resolvable template), the ORIGINAL V2-Core-01
  // minimal state is produced -- no player, no actors, no pending (D-47).
  const bare = createInitialState({ worldSeed: "bootstrap-check" });
  assert.strictEqual(bare.state.player, undefined);
  assert.strictEqual(bare.state.actors, undefined);
  assert.strictEqual(bare.state.pending, undefined);
  assert.strictEqual(bare.state.worldId, undefined);

  const incompleteData = createInitialState({ worldSeed: "bootstrap-check", data: { world: {} } });
  assert.strictEqual(incompleteData.state.player, undefined, "missing startTemplateId -> no bootstrap");

  // malformed template content (missing required locationId) is a content bug -> throw
  const badData = actionDataFixture({
    characterTemplates: { start_default: { kind: "player", hp: { max: 10 } } }
  });
  assert.throws(() => createInitialState({ worldSeed: "x", data: badData }), TypeError);
}

// 14. perform action
function testPerformAction() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "perform-check", data });

  // normal: sequential effects visible to each other, action.resolved last
  const r1 = step(state, { type: "perform", actionId: "act_rest" }, data);
  assert.strictEqual(r1.state.actors.player_1.money, 5 + 1 + 2, "the second money Effect must see the first Effect's result");
  assert.deepStrictEqual(
    r1.events.map((e) => e.type),
    ["money.changed", "money.changed", "action.resolved"]
  );

  // unknown_action
  const r2 = step(state, { type: "perform", actionId: "does_not_exist" }, data);
  assert.deepStrictEqual(r2.state, state);
  assert.deepStrictEqual(r2.events[0].data, { code: "unknown_action" });

  // requirements_not_met
  const r3 = step(state, { type: "perform", actionId: "act_gated" }, data);
  assert.deepStrictEqual(r3.state, state);
  assert.deepStrictEqual(r3.events[0].data, { code: "requirements_not_met" });

  // minutes auto-appends a time Effect after the plain effects (§2.3)
  const r4 = step(state, { type: "perform", actionId: "act_timed" }, data);
  assert.strictEqual(r4.state.time.minute, 15);
  assert.deepStrictEqual(
    r4.events.map((e) => e.type),
    ["money.changed", "time.advanced", "action.resolved"]
  );

  // malformed shape (missing actionId) -> invalid_action
  const r5 = step(state, { type: "perform" }, data);
  assert.deepStrictEqual(r5.events[0].data, { code: "invalid_action" });
}

// 15. move action
function testMoveAction() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "move-check", data });

  // normal: link exists -> move Effect + its minutes as a time Effect
  const r1 = step(state, { type: "move", to: "loc_market" }, data);
  assert.strictEqual(r1.state.actors.player_1.locationId, "loc_market");
  assert.strictEqual(r1.state.time.minute, 30);
  assert.deepStrictEqual(
    r1.events.map((e) => e.type),
    ["actor.moved", "time.advanced", "action.resolved"]
  );

  // unknown_location
  const r2 = step(state, { type: "move", to: "loc_nowhere" }, data);
  assert.deepStrictEqual(r2.state, state);
  assert.deepStrictEqual(r2.events[0].data, { code: "unknown_location" });

  // requirements_not_met: loc_locked exists but has no incoming link from loc_start
  const r3 = step(state, { type: "move", to: "loc_locked" }, data);
  assert.deepStrictEqual(r3.state, state);
  assert.deepStrictEqual(r3.events[0].data, { code: "requirements_not_met" });

  // malformed shape
  const r4 = step(state, { type: "move" }, data);
  assert.deepStrictEqual(r4.events[0].data, { code: "invalid_action" });
}

// 16. check() integration via perform: check.resolved event, outcome branching, attempts
function testCheckIntegration() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "check-integration", data });

  const rSuccess = step(state, { type: "perform", actionId: "act_checked_success" }, data);
  assert.strictEqual(rSuccess.events[0].type, "check.resolved");
  assert.strictEqual(rSuccess.events[0].data.tier, "great", "difficulty -100 must always roll great");
  assert.deepStrictEqual(
    rSuccess.events.map((e) => e.type),
    ["check.resolved", "flag.changed", "action.resolved"]
  );
  assert.strictEqual(rSuccess.state.flags.won, true, "great falls back to success's outcome (§2.3)");
  assert.notStrictEqual(rSuccess.state.rng.cursor, state.rng.cursor, "a check must advance the rng cursor");

  const rFail = step(state, { type: "perform", actionId: "act_checked_fail" }, data);
  assert.strictEqual(rFail.events[0].data.tier, "fail", "difficulty 1000 must always fail");
  assert.strictEqual(rFail.state.flags.lost, true);

  // attempts: increments across repeated perform calls, threading the returned state
  const r1 = step(state, { type: "perform", actionId: "act_retry" }, data);
  assert.strictEqual(r1.state.attempts.try_x, 1);
  const r2 = step(r1.state, { type: "perform", actionId: "act_retry" }, data);
  assert.strictEqual(r2.state.attempts.try_x, 2);
}

// 17. death -> pending -> startCharacter -> succession
function testDeathAndSuccession() {
  const data = actionDataFixture({
    rules: { check: {}, succession: [{ op: "relation", from: "target", to: "self", add: 10 }] }
  });
  const { state: initial } = createInitialState({ worldSeed: "death-check", data });

  // establish some world state tied to the first character before they die
  const withKnowledge = step(initial, { type: "perform", actionId: "act_rest" }, data).state;

  // startCharacter before death (pending is null) -> invalid_action
  const beforeDeath = step(withKnowledge, { type: "startCharacter", templateId: "start_respawn" }, data);
  assert.deepStrictEqual(beforeDeath.events[0].data, { code: "invalid_action" });

  // die
  const afterDeath = step(withKnowledge, { type: "perform", actionId: "act_fatal" }, data);
  assert.strictEqual(afterDeath.state.actors.player_1.alive, false);
  assert.deepStrictEqual(afterDeath.state.pending, { kind: "newCharacter" });
  // the step that caused death still runs its full pipeline (D-34/D-47: no early exit)
  assert.ok(afterDeath.events.some((e) => e.type === "action.resolved"), "the fatal step() must still resolve normally");

  // once pending, every other action type (including wait) is blocked
  ["wait", "perform", "move"].forEach((type) => {
    const action = type === "wait" ? { type: "wait", minutes: 10 } : type === "perform" ? { type: "perform", actionId: "act_rest" } : { type: "move", to: "loc_market" };
    const rejected = step(afterDeath.state, action, data);
    assert.deepStrictEqual(rejected.events[0].data, { code: "pending_new_character" }, type + " must be rejected while pending newCharacter");
  });

  // startCharacter with an unknown template -> unknown_action
  const badTemplate = step(afterDeath.state, { type: "startCharacter", templateId: "does_not_exist" }, data);
  assert.deepStrictEqual(badTemplate.events[0].data, { code: "unknown_action" });

  // startCharacter succeeds: new actor, characterCount+1, pending cleared, succession applied
  const respawned = step(afterDeath.state, { type: "startCharacter", templateId: "start_respawn" }, data);
  assert.deepStrictEqual(respawned.state.player, { actorId: "player_2", characterCount: 2 });
  assert.strictEqual(respawned.state.pending, null);
  assert.strictEqual(respawned.state.actors.player_2.alive, true);
  assert.strictEqual(respawned.state.actors.player_2.hp.current, 8, "new template's hp.max, full health");
  assert.strictEqual(respawned.state.actors.player_1.alive, false, "the old actor's record is kept, not deleted (§9)");
  assert.deepStrictEqual(
    respawned.events.map((e) => e.type),
    ["character.started", "relation.changed", "action.resolved"]
  );
  // succession ctx = {actorId: new character, targetId: previous character} (§9)
  assert.ok(respawned.state.relations["player_1:player_2"], "succession Effect ctx must resolve target=old actor, self=new actor");

  // default (empty) succession truly does nothing beyond character creation
  const noSuccessionData = actionDataFixture(); // rules.succession: []
  const { state: initial2 } = createInitialState({ worldSeed: "death-check-2", data: noSuccessionData });
  const dead2 = step(initial2, { type: "perform", actionId: "act_fatal" }, noSuccessionData).state;
  const respawned2 = step(dead2, { type: "startCharacter", templateId: "start_respawn" }, noSuccessionData);
  assert.deepStrictEqual(
    respawned2.events.map((e) => e.type),
    ["character.started", "action.resolved"],
    "empty succession list must add no extra events"
  );
}

// 18. remaining gate reject codes (D-48): actor_dead without pending, no_pending_choice
function testRemainingGateCodes() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "gate-check", data });

  // choose with nothing pending -> no_pending_choice
  const r1 = step(state, { type: "choose", optionId: "opt_1" }, data);
  assert.deepStrictEqual(r1.events[0].data, { code: "no_pending_choice" });

  // actor_dead: alive===false but pending somehow not set (defensive path, not reachable via
  // the engine's own hp Effect, but the gate must still hold for a state built this way)
  const deadNoPendingState = structuredClone(state);
  deadNoPendingState.actors.player_1.alive = false;
  const r2 = step(deadNoPendingState, { type: "perform", actionId: "act_rest" }, data);
  assert.deepStrictEqual(r2.events[0].data, { code: "actor_dead" });
  const r3 = step(deadNoPendingState, { type: "move", to: "loc_market" }, data);
  assert.deepStrictEqual(r3.events[0].data, { code: "actor_dead" });
}

// 19. immutability, determinism, JSON round-trip across the new action types
function testActionEngineComposition() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "composition-v2", data });

  const frozenState = deepFreeze(snapshot(state));
  const stateBefore = snapshot(frozenState);
  const frozenData = deepFreeze(snapshot(data));
  const dataBefore = snapshot(frozenData);
  const action = deepFreeze({ type: "perform", actionId: "act_rest" });

  const result = step(frozenState, action, frozenData);
  assert.deepStrictEqual(snapshot(frozenState), stateBefore, "step() must not mutate its input state");
  assert.deepStrictEqual(snapshot(frozenData), dataBefore, "step() must not mutate its input data");
  assert.notStrictEqual(result.state, frozenState);

  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.state)), result.state, "result state must be JSON round-trip safe");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.events)), result.events, "events must be JSON round-trip safe");

  function replay() {
    let s = createInitialState({ worldSeed: "composition-v2", data }).state;
    const allEvents = [];
    [{ type: "move", to: "loc_market" }, { type: "perform", actionId: "act_checked_success" }, { type: "perform", actionId: "act_fatal" }].forEach(
      (a) => {
        const r = step(s, a, data);
        s = r.state;
        allEvents.push(r.events);
      }
    );
    return { state: s, allEvents };
  }
  const first = replay();
  const second = replay();
  assert.deepStrictEqual(second.state, first.state, "replaying the same action sequence must yield the same final state");
  assert.deepStrictEqual(second.allEvents, first.allEvents, "replaying the same action sequence must yield the same events");
}

testCreateInitialStateBootstrap();
testPerformAction();
testMoveAction();
testCheckIntegration();
testDeathAndSuccession();
testRemainingGateCodes();
testActionEngineComposition();

console.log("V2-Core-01/11 core.test.js: all checks passed");
