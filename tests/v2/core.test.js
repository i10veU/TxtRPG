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
import { createInitialState, step, view } from "../../web/v2/core/engine.js";

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
      act_fatal: { effects: [{ op: "hp", add: -1000 }] },
      act_offer_choice: { effects: [{ op: "choice", choice: "choice_a", sourceId: "act_offer_choice" }] }
    },
    choices: {
      choice_a: {
        options: [
          { id: "opt_accept", effects: [{ op: "flag", key: "accepted", value: true }] },
          { id: "opt_decline", requires: { op: "never" }, effects: [{ op: "flag", key: "declined", value: true }] },
          {
            id: "opt_checked",
            check: { difficulty: -100 },
            outcomes: { success: [{ op: "money", add: 10 }], fail: [{ op: "money", add: -10 }] },
            minutes: 5
          }
        ]
      }
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

// ============================================================
// V2-Core-12: choice/pending (D-35), day.started (D-50), trigger (D-51).
// ============================================================

// 20. choice/pending full flow: offer -> gate blocks everything else ->
// unknown_option / requirements_not_met -> successful choose consumes
// pending and runs the same Resolvable interpreter as perform (incl. check)
function testChooseFlow() {
  const data = actionDataFixture();
  const { state: initial } = createInitialState({ worldSeed: "choose-check", data });

  const offered = step(initial, { type: "perform", actionId: "act_offer_choice" }, data);
  assert.deepStrictEqual(offered.state.pending, { kind: "choice", choiceId: "choice_a", sourceId: "act_offer_choice" });
  assert.ok(offered.events.some((e) => e.type === "choice.offered"));

  // pending 중에는 choose 외 모든 action이 pending_choice로 막힌다
  const blockedActions = [
    { type: "wait", minutes: 5 },
    { type: "perform", actionId: "act_rest" },
    { type: "move", to: "loc_market" },
    { type: "startCharacter", templateId: "start_respawn" }
  ];
  blockedActions.forEach((action) => {
    const r = step(offered.state, action, data);
    assert.deepStrictEqual(r.events[0].data, { code: "pending_choice" }, action.type + " must be rejected while a choice is pending");
  });

  // 존재하지 않는 optionId -> unknown_option
  const badOption = step(offered.state, { type: "choose", optionId: "does_not_exist" }, data);
  assert.deepStrictEqual(badOption.events[0].data, { code: "unknown_option" });
  assert.deepStrictEqual(badOption.state, offered.state, "rejected choose must leave state unchanged");

  // requires가 거짓인 옵션 -> requirements_not_met, pending은 소비되지 않고 유지된다
  const gatedOption = step(offered.state, { type: "choose", optionId: "opt_decline" }, data);
  assert.deepStrictEqual(gatedOption.events[0].data, { code: "requirements_not_met" });
  assert.deepStrictEqual(gatedOption.state.pending, offered.state.pending, "a rejected choose must not consume pending");

  // 정상 선택: pending 소비, effects 적용, action.resolved
  const accepted = step(offered.state, { type: "choose", optionId: "opt_accept" }, data);
  assert.strictEqual(accepted.state.pending, null);
  assert.strictEqual(accepted.state.flags.accepted, true);
  assert.deepStrictEqual(
    accepted.events.map((e) => e.type),
    ["flag.changed", "action.resolved"]
  );

  // check가 있는 옵션: check.resolved + outcome + minutes까지 perform과 동일한 해석기로 처리된다
  const checkedChoice = step(offered.state, { type: "choose", optionId: "opt_checked" }, data);
  assert.strictEqual(checkedChoice.state.pending, null);
  assert.strictEqual(checkedChoice.state.actors.player_1.money, 5 + 10, "difficulty -100 always succeeds");
  assert.strictEqual(checkedChoice.state.time.minute, 5, "the option's own minutes must apply");
  assert.deepStrictEqual(
    checkedChoice.events.map((e) => e.type),
    ["check.resolved", "money.changed", "time.advanced", "action.resolved"]
  );

  // pending이 아예 없을 때 choose -> no_pending_choice
  const noPending = step(initial, { type: "choose", optionId: "opt_accept" }, data);
  assert.deepStrictEqual(noPending.events[0].data, { code: "no_pending_choice" });

  // pending 소비 후 다른 action이 정상적으로 재개된다
  const afterChoice = step(accepted.state, { type: "wait", minutes: 10 }, data);
  assert.strictEqual(afterChoice.events[0].type, "time.advanced");
}

// 21. day.started (D-50): one event per day boundary crossed, action-agnostic
function testDayStartedEvents() {
  const data = actionDataFixture();
  const { state: initial } = createInitialState({ worldSeed: "day-check", data });

  const r1 = step(initial, { type: "wait", minutes: 60 }, data);
  assert.ok(!r1.events.some((e) => e.type === "day.started"), "no boundary crossed -> no day.started");

  const r2 = step(initial, { type: "wait", minutes: 1440 }, data);
  const dayEvents2 = r2.events.filter((e) => e.type === "day.started");
  assert.strictEqual(dayEvents2.length, 1);
  assert.deepStrictEqual(dayEvents2[0].data, { day: 1 });
  assert.strictEqual(dayEvents2[0].visibility, "internal");

  // `wait` itself is capped at 1440 minutes (§2.2); a Resolvable's own
  // `minutes` (perform) has no such cap, so use that to cross several days
  // in a single action and confirm day.started fires once per crossed day.
  const longActionData = actionDataFixture({ actions: { act_long: { effects: [], minutes: 1440 * 3 } } });
  const { state: initial2 } = createInitialState({ worldSeed: "day-check-2", data: longActionData });
  const r3 = step(initial2, { type: "perform", actionId: "act_long" }, longActionData);
  assert.deepStrictEqual(
    r3.events.filter((e) => e.type === "day.started").map((e) => e.data.day),
    [1, 2, 3],
    "crossing 3 boundaries at once must emit 3 events, one per day"
  );
}

// 22. trigger (D-51): condition gating, once, cooldown, id-ascending
// single-pass visibility (the "1-step chain limit")
function testTriggerStage() {
  const data = actionDataFixture({
    actions: { act_spend: { effects: [{ op: "money", add: -3 }] } }, // 5 -> 2, crosses below 3
    events: {
      event_low_money: { trigger: { op: "lt", left: { money: true }, right: 3 }, effects: [{ op: "flag", key: "poor", value: true }] },
      event_once: { trigger: { op: "always" }, once: true, effects: [{ op: "signal", key: "once_fired", add: 1 }] },
      event_cooldown: { trigger: { op: "always" }, cooldown: 100, effects: [{ op: "signal", key: "cooldown_fired", add: 1 }] }
    }
  });
  const { state: initial } = createInitialState({ worldSeed: "trigger-check", data });

  // 조건이 거짓이면 발동하지 않는다 (money=5, not < 3); always-true 트리거는 발동한다
  const r1 = step(initial, { type: "wait", minutes: 1 }, data);
  assert.strictEqual(r1.state.flags?.poor, undefined, "event_low_money must not fire while money >= 3");
  assert.strictEqual(r1.state.signals.once_fired, 1);
  assert.strictEqual(r1.state.signals.cooldown_fired, 1);
  assert.strictEqual(r1.state.fired.event_once.count, 1);
  const fired1 = r1.events.find((e) => e.type === "trigger.fired");
  assert.strictEqual(fired1.visibility, "internal");

  // once: 다시 실행해도 재발동하지 않는다
  const r2 = step(r1.state, { type: "wait", minutes: 1 }, data);
  assert.strictEqual(r2.state.signals.once_fired, 1, "once must not increment again");
  assert.strictEqual(r2.state.fired.event_once.count, 1);
  assert.strictEqual(r2.state.signals.cooldown_fired, 1, "within cooldown -> no re-fire");

  // cooldown 경과 후 재발동
  const r3 = step(r2.state, { type: "wait", minutes: 200 }, data);
  assert.strictEqual(r3.state.signals.cooldown_fired, 2, "past cooldown -> fires again");

  // 조건이 실제로 참이 되면 발동한다
  const spent = step(initial, { type: "perform", actionId: "act_spend" }, data).state;
  assert.strictEqual(spent.actors.player_1.money, 2);
  const r4 = step(spent, { type: "wait", minutes: 1 }, data);
  assert.strictEqual(r4.state.flags.poor, true);

  // id 오름차순 한 바퀴: 알파벳순으로 앞선 id의 효과는 같은 패스 안에서 뒤쪽 id가 즉시 본다
  const orderData = actionDataFixture({
    actions: {},
    events: {
      a_sets_flag: { trigger: { op: "always" }, once: true, effects: [{ op: "flag", key: "a_ran", value: true }] },
      b_depends_on_a: { trigger: { op: "eq", left: { flag: "a_ran" }, right: true }, once: true, effects: [{ op: "flag", key: "b_ran", value: true }] }
    }
  });
  const { state: orderInitial } = createInitialState({ worldSeed: "trigger-order", data: orderData });
  const rOrder = step(orderInitial, { type: "wait", minutes: 1 }, orderData);
  assert.strictEqual(rOrder.state.flags.a_ran, true);
  assert.strictEqual(rOrder.state.flags.b_ran, true, "b (alphabetically after a) must see a's effect within the SAME pass");

  // 반대 순서(더 앞선 id가 더 뒤 id에 의존)면 같은 패스 안에서는 보이지 않는다 (1단계 연쇄 제한)
  const reverseData = actionDataFixture({
    actions: {},
    events: {
      a_depends_on_b: { trigger: { op: "eq", left: { flag: "b_ran" }, right: true }, once: true, effects: [{ op: "flag", key: "a_ran2", value: true }] },
      b_sets_flag: { trigger: { op: "always" }, once: true, effects: [{ op: "flag", key: "b_ran", value: true }] }
    }
  });
  const { state: reverseInitial } = createInitialState({ worldSeed: "trigger-reverse", data: reverseData });
  const rReverse1 = step(reverseInitial, { type: "wait", minutes: 1 }, reverseData);
  assert.strictEqual(rReverse1.state.flags.b_ran, true);
  assert.strictEqual(rReverse1.state.flags.a_ran2, undefined, "a (earlier id) must NOT see b's same-pass effect (1-step chain limit)");
  const rReverse2 = step(rReverse1.state, { type: "wait", minutes: 1 }, reverseData);
  assert.strictEqual(rReverse2.state.flags.a_ran2, true, "the NEXT step() call must evaluate the now-true trigger");
}

// 23. immutability, determinism, JSON round-trip for choose/trigger
function testChoiceAndTriggerComposition() {
  const data = actionDataFixture({
    events: { event_once: { trigger: { op: "always" }, once: true, effects: [{ op: "signal", key: "seen", add: 1 }] } }
  });
  const { state } = createInitialState({ worldSeed: "choice-composition", data });
  const offered = step(state, { type: "perform", actionId: "act_offer_choice" }, data).state;

  const frozenState = deepFreeze(snapshot(offered));
  const stateBefore = snapshot(frozenState);
  const frozenData = deepFreeze(snapshot(data));
  const dataBefore = snapshot(frozenData);
  const action = deepFreeze({ type: "choose", optionId: "opt_accept" });

  const result = step(frozenState, action, frozenData);
  assert.deepStrictEqual(snapshot(frozenState), stateBefore, "step() must not mutate its input state");
  assert.deepStrictEqual(snapshot(frozenData), dataBefore, "step() must not mutate its input data");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.state)), result.state, "result state must be JSON round-trip safe");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.events)), result.events, "events must be JSON round-trip safe");

  function replay() {
    let s = createInitialState({ worldSeed: "choice-composition-2", data }).state;
    const allEvents = [];
    [{ type: "perform", actionId: "act_offer_choice" }, { type: "choose", optionId: "opt_checked" }, { type: "wait", minutes: 1440 }].forEach((a) => {
      const r = step(s, a, data);
      s = r.state;
      allEvents.push(r.events);
    });
    return { state: s, allEvents };
  }
  const first = replay();
  const second = replay();
  assert.deepStrictEqual(second.state, first.state, "replaying the same action sequence must yield the same final state");
  assert.deepStrictEqual(second.allEvents, first.allEvents, "replaying the same action sequence must yield the same events");
}

testChooseFlow();
testDayStartedEvents();
testTriggerStage();
testChoiceAndTriggerComposition();

// ============================================================
// V2-Core-13: view() (D-53/D-15 resolved -- §8.4/§1.4). `narrate` Effect is
// tested in tests/v2/effects.test.js. `handler` is deliberately not
// implemented (§4.4 callout) -- no tests for it here.
// ============================================================

function testView() {
  const base = actionDataFixture();
  const data = {
    ...base,
    actions: { ...base.actions, act_gated_visible: { requires: { op: "never" }, showWhenLocked: true, effects: [] } }
  };
  const { state: initial } = createInitialState({ worldSeed: "view-check", data });

  const state = structuredClone(initial);
  state.actors.npc_1 = {
    id: "npc_1",
    kind: "npc",
    alive: true,
    locationId: "loc_start",
    hp: { current: 5, max: 5 },
    money: 0,
    inventory: {},
    growth: {},
    tags: []
  };
  state.knowledge = {
    player_1: {
      rum_a: { rumorId: "rum_a", factId: "fact_a", claim: "npc_x", source: "npc_c", sources: ["npc_c"], confidence: 50, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 }
    },
    npc_1: {
      rum_b: { rumorId: "rum_b", factId: "fact_a", claim: "npc_y", source: "npc_d", sources: ["npc_d"], confidence: 80, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 }
    }
  };
  state.relations = {
    "npc_1:player_1": { score: 10, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: [] },
    "player_1:npc_1": { score: -5, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: [] },
    "npc_1:npc_2": { score: 20, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: [] }
  };
  state.facts = { fact_a: { value: "npc_x", since: 0 } };

  const result = view(state, data);

  // 1. 정확히 5개 필드만 (§8.4가 나열한 것 그대로, 새 카테고리 없음)
  assert.deepStrictEqual(Object.keys(result).sort(), ["actions", "actor", "knowledge", "pending", "relations"]);

  // 2. actor: 플레이어 자신의 전체 레코드
  assert.deepStrictEqual(result.actor, state.actors.player_1);

  // 3. knowledge: 플레이어 자신의 것만, 다른 actor의 knowledge는 절대 노출되지 않는다
  assert.deepStrictEqual(result.knowledge, state.knowledge.player_1);
  assert.strictEqual(result.knowledge.rum_b, undefined);

  // 4. relations: 플레이어가 한쪽 끝인 edge만(방향 무관), 무관한 edge는 제외
  assert.deepStrictEqual(Object.keys(result.relations).sort(), ["npc_1:player_1", "player_1:npc_1"]);
  assert.strictEqual(result.relations["npc_1:npc_2"], undefined);

  // 5. facts는 절대 노출되지 않는다 (§8.4)
  assert.ok(!("facts" in result));

  // 6. pending
  assert.strictEqual(result.pending, null);

  // 7. actions: requires 만족 + showWhenLocked인 잠긴 것만, reason 없음, id 오름차순
  const actionIds = result.actions.map((a) => a.actionId);
  assert.ok(actionIds.includes("act_rest"));
  assert.ok(!actionIds.includes("act_gated"), "gated without showWhenLocked must be excluded entirely");
  assert.ok(actionIds.includes("act_gated_visible"), "gated WITH showWhenLocked must still be listed");
  const gatedEntry = result.actions.find((a) => a.actionId === "act_gated_visible");
  assert.strictEqual(gatedEntry.available, false);
  assert.deepStrictEqual(Object.keys(gatedEntry).sort(), ["actionId", "available"], "no failure reason ever leaked (D-06/D-15)");
  const availableEntry = result.actions.find((a) => a.actionId === "act_rest");
  assert.strictEqual(availableEntry.available, true);
  assert.deepStrictEqual(actionIds, [...actionIds].sort(), "actions must be in id-ascending order (§2.6 determinism)");

  // 8. state mutation 없음, RNG 소비 없음
  const rngBefore = snapshot(state.rng);
  const stateBefore = snapshot(state);
  view(state, data);
  assert.deepStrictEqual(snapshot(state), stateBefore, "view() must not mutate state");
  assert.deepStrictEqual(state.rng, rngBefore, "view() must not consume rng");

  // 9. 결과를 mutate해도 원본 state에 영향이 없다 (원본 참조 아님)
  result.actor.money = 999999;
  result.knowledge.rum_a.confidence = 0;
  result.relations["npc_1:player_1"].score = 0;
  assert.strictEqual(state.actors.player_1.money, 5, "mutating the view result must not affect state");
  assert.strictEqual(state.knowledge.player_1.rum_a.confidence, 50);
  assert.strictEqual(state.relations["npc_1:player_1"].score, 10);

  // 10. determinism
  assert.deepStrictEqual(view(state, data), view(state, data), "same (state, data) must always produce the same result");

  // 11. JSON round-trip
  const fresh = view(state, data);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fresh)), fresh);

  // 12. player 없는 world -> null (D-53)
  const { state: bare } = createInitialState({ worldSeed: "view-no-player" });
  assert.strictEqual(view(bare, {}), null);
}

testView();

console.log("V2-Core-01/11/12/13 core.test.js: all checks passed");
