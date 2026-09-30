// V2-Core-38 (Issue #106, D-73): case completion. Decision: `data.cases[*].stages[*].completeWhen`
// stays a validated, reserved field with NO runtime meaning; "when a condition becomes true, move
// the case" is written with the existing `data.events` (§2.5 stage 10, D-51) + `case` Effect.
// Nothing in the engine is added or changed -- these tests pin the semantics that decision relies
// on (all of them are existing contract) and the ways `data.events` is strictly more expressive
// than a Condition-only `completeWhen` could be.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1); abstract-ID synthetic fixture (DEVELOPMENT_RULES §17).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";

function fixture(extra = {}) {
  return {
    formatVersion: 1,
    id: "probe_pack",
    version: "0.1.0",
    world: { id: "probe_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: { start_default: { kind: "player", locationId: "loc_a", hp: { max: 3 }, money: 0, inventory: {}, growth: {}, tags: [] } },
    locations: { loc_a: { links: [] } },
    actions: {
      act_start: { effects: [{ op: "case", case: "case_a", stage: "s1" }] },
      act_ready: { effects: [{ op: "flag", key: "ready", value: true }] },
      act_second: { effects: [{ op: "flag", key: "second", value: true }] },
      act_hurt: { effects: [{ op: "hp", add: -99 }] }
    },
    texts: { txt_done: "done" },
    ...extra
  };
}

const WAIT = { type: "wait", minutes: 1 };
const PERFORM = (actionId) => ({ type: "perform", actionId });
const inStage = (stage) => ({ op: "case", case: "case_a", stage });
const start = (data, worldSeed = "case-seed") => createInitialState({ worldSeed, data }).state;
const run = (data, state, actions) => actions.reduce((st, a) => step(st, a, data).state, state);
const stageOf = (state) => state.cases?.case_a?.stage;

function assertSurvivesSaveAndReplay(data, state, nextAction) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepStrictEqual(validateState(state), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_case", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);
  assert.deepStrictEqual(step(loaded, nextAction, data), step(state, nextAction, data));
  assert.deepStrictEqual(step(state, nextAction, data), step(state, nextAction, data));
}

// 1. `completeWhen` has no runtime meaning: declaring it next to an equivalent event changes
// nothing -- only the event moves the case, and removing the declaration changes no result
function testCompleteWhenIsReserved() {
  const stages = (withCompleteWhen) => [
    { id: "s1", ...(withCompleteWhen ? { completeWhen: { op: "flag", key: "ready" } } : {}) },
    { id: "s2" }
  ];
  const pack = (withCompleteWhen, withEvent) =>
    fixture({
      cases: { case_a: { stages: stages(withCompleteWhen) } },
      events: withEvent
        ? { e_advance: { trigger: { op: "and", of: [inStage("s1"), { op: "flag", key: "ready" }] }, effects: [{ op: "case", case: "case_a", stage: "s2" }] } }
        : {}
    });

  // declared only: the condition becomes true and stays true, the case never moves by itself
  const declared = pack(true, false);
  assert.deepStrictEqual(validateData(declared), []);
  const afterDeclared = run(declared, start(declared), [PERFORM("act_start"), PERFORM("act_ready"), WAIT, WAIT]);
  assert.strictEqual(stageOf(afterDeclared), "s1");

  // the event path: the same condition, written as data.events
  const evented = pack(false, true);
  assert.deepStrictEqual(validateData(evented), []);
  const afterEvented = run(evented, start(evented), [PERFORM("act_start"), PERFORM("act_ready")]);
  assert.strictEqual(stageOf(afterEvented), "s2");

  // declaring completeWhen as well does not change the event path's result (no double run, no ordering)
  const both = pack(true, true);
  const bothSteps = [PERFORM("act_start"), PERFORM("act_ready"), WAIT];
  assert.deepStrictEqual(run(both, start(both), bothSteps), run(evented, start(evented), bothSteps));
}

// 2. cadence: the trigger pass (stage 10) runs after every ACCEPTED step of every type, once, in
// event-id order; a rejected action (pending gate) is not a step, `startCharacter` is
function testCadence() {
  const data = fixture({
    events: { e_done: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "done" }] } }
  });
  // perform, wait and move-less steps all pass stage 10 (move is covered by the real-pack specs)
  assert.strictEqual(stageOf(step(start(data), PERFORM("act_ready"), data).state), "done");
  const preset = { ...start(data), flags: { ready: true } };
  assert.strictEqual(stageOf(step(preset, WAIT, data).state), "done", "a wait step evaluates triggers too");
  assert.deepStrictEqual(step(preset, WAIT, data).events.map((e) => e.type), ["time.advanced", "case.updated", "trigger.fired"]);

  // a character who is dead and pending cannot take steps: nothing is evaluated for a rejected action...
  const dead = step({ ...start(data), flags: { ready: true } }, PERFORM("act_hurt"), { ...data, events: {} }).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const rejected = step(dead, WAIT, data);
  assert.deepStrictEqual(rejected.events.map((e) => e.type), ["action.rejected"]);
  assert.strictEqual(rejected.state.cases, undefined);
  // ...and the accepted `startCharacter` step runs the pass
  const resumed = step(dead, { type: "startCharacter", templateId: "start_default" }, data);
  assert.deepStrictEqual(resumed.events.map((e) => e.type), ["character.started", "case.updated", "trigger.fired", "action.resolved"]);
  assert.strictEqual(stageOf(resumed.state), "done");
}

// 3. same step: one id-ascending pass. A chain completes in ONE step only if each completion's id
// sorts after the id that entered the stage; otherwise it completes on the NEXT accepted step
// (the one-step chain limit, §2.5) -- never a fixpoint loop
function testSameStepChain() {
  const chained = (enterId, completeId) =>
    fixture({
      events: {
        [enterId]: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s2" }] },
        [completeId]: { trigger: inStage("s2"), once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] }
      }
    });
  const forward = chained("e_a_enter", "e_b_complete");
  assert.strictEqual(stageOf(step(start(forward), PERFORM("act_ready"), forward).state), "s3", "completion id after entry id: same step");
  const backward = chained("e_b_enter", "e_a_complete");
  const first = step(start(backward), PERFORM("act_ready"), backward).state;
  assert.strictEqual(stageOf(first), "s2", "completion id before entry id: waits");
  assert.strictEqual(stageOf(step(first, WAIT, backward).state), "s3", "...for the next step");
  assertSurvivesSaveAndReplay(backward, first, WAIT);

  // several cases in one step: each event moves its own case, in event-id order
  const two = fixture({
    events: {
      e_1: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_b", stage: "b_done" }] },
      e_2: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "a_done" }] }
    }
  });
  const both = step(start(two), PERFORM("act_ready"), two);
  assert.deepStrictEqual(
    both.events.filter((e) => e.type === "case.updated").map((e) => e.data.case),
    ["case_b", "case_a"],
    "event id order, not case id order"
  );
}

// 4. idempotence: a trigger that names the stage it leaves needs no `once` -- it cannot fire again
// unless the case re-enters that stage, and then it fires again (each entry completes once)
function testGuardAndReentry() {
  const data = fixture({
    events: {
      e_advance: { trigger: { op: "and", of: [inStage("s1"), { op: "flag", key: "ready" }] }, effects: [{ op: "case", case: "case_a", stage: "s2" }, { op: "money", add: 1 }] }
    }
  });
  let state = run(data, start(data), [PERFORM("act_ready"), PERFORM("act_start")]);
  assert.strictEqual(stageOf(state), "s2");
  assert.strictEqual(state.actors.player_1.money, 1);
  state = run(data, state, [WAIT, WAIT, WAIT]);
  assert.strictEqual(state.fired.e_advance.count, 1, "no re-fire while the case stays in s2");
  state = step(state, PERFORM("act_start"), data).state; // back into s1
  assert.strictEqual(stageOf(state), "s2");
  assert.deepStrictEqual([state.fired.e_advance.count, state.actors.player_1.money], [2, 2], "each entry into s1 completes once more");

  // an entry event that does not guard itself re-sets the stage on every step, undoing a later completion
  const unguarded = fixture({
    events: {
      e_a_complete: { trigger: inStage("s2"), once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] },
      e_b_enter: { trigger: { op: "flag", key: "ready" }, effects: [{ op: "case", case: "case_a", stage: "s2" }] }
    }
  });
  let loop = run(unguarded, start(unguarded), [PERFORM("act_ready")]);
  assert.strictEqual(stageOf(loop), "s2");
  loop = step(loop, WAIT, unguarded).state;
  assert.strictEqual(stageOf(loop), "s2", "completed to s3, then the unguarded entry event put it back");
  assert.strictEqual(loop.fired.e_b_enter.count, 2);
}

// 5. what an event carries that a Condition-only `completeWhen` could not: transition Effects of
// any kind, a `check` with outcomes (consumes the gameplay stream), `cooldown`, any target stage
function testEventIsMoreExpressive() {
  const data = fixture({
    relations: undefined,
    events: {
      e_reward: {
        trigger: { op: "and", of: [inStage("s1"), { op: "flag", key: "ready" }] },
        effects: [
          { op: "case", case: "case_a", stage: "s2" },
          { op: "money", add: 3 },
          { op: "relation", from: "npc_a", to: "self", add: 2 },
          { op: "narrate", textId: "txt_done" }
        ]
      },
      e_roll: {
        trigger: { op: "flag", key: "second" },
        once: true,
        check: { difficulty: -100 },
        outcomes: {
          success: [{ op: "case", case: "case_a", stage: "won" }],
          fail: [{ op: "case", case: "case_a", stage: "lost" }]
        }
      }
    }
  });
  assert.deepStrictEqual(validateData(data), []);
  const moved = run(data, start(data), [PERFORM("act_start"), PERFORM("act_ready")]);
  assert.strictEqual(stageOf(moved), "s2");
  assert.strictEqual(moved.actors.player_1.money, 3);
  assert.strictEqual(moved.relations["npc_a:player_1"].score, 2);
  const cursorBefore = moved.rng.cursor;
  const rolled = step(moved, PERFORM("act_second"), data);
  assert.ok(rolled.events.some((e) => e.type === "check.resolved"));
  assert.strictEqual(stageOf(rolled.state), "won", "the stage is chosen by the check's outcome");
  assert.ok(rolled.state.rng.cursor > cursorBefore, "the check consumed the gameplay stream");
  assertSurvivesSaveAndReplay(data, moved, PERFORM("act_second"));

  // a world-level case can be completed by a character-level Condition: the trigger reads the CURRENT
  // player (D-70) -- `completeWhen` was defined as a world-context Condition to avoid exactly this
  const personal = fixture({
    events: { e_liked: { trigger: { op: "relation", from: "npc_a", to: "self", min: 5 }, once: true, effects: [{ op: "case", case: "case_a", stage: "done" }] } },
    actions: { act_like: { effects: [{ op: "relation", from: "npc_a", to: "self", add: 5 }] } }
  });
  assert.strictEqual(stageOf(run(personal, start(personal), [PERFORM("act_like")])), "done");
}

testCompleteWhenIsReserved();
testCadence();
testSameStepChain();
testGuardAndReentry();
testEventIsMoreExpressive();

console.log("V2-Core-38 case-completion.test.js: all checks passed");
