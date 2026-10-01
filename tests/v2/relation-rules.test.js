// V2-Core-39 (Issue #108, D-74): relation rules. Decision: `data.rules.relation.*.when` stays a
// validated, reserved field with NO runtime meaning; relation dynamics are written with the existing
// `data.events` (§2.5 stage 10, D-51) + `relation` Effect/Condition. Nothing in the engine is added or
// changed -- these tests pin the facts the decision relies on that tests/v2/core-semantics-gap.test.js
// does not already pin: a declared rule changes no result, how a relation Effect resolves its
// endpoints inside an event, and the authoring patterns that express the V1 rule shape (per named
// edge, once per calendar day, world-state branches) and a delayed change with existing ops only.
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
      act_ready: { effects: [{ op: "flag", key: "ready", value: true }] },
      act_raise: { effects: [{ op: "signal", key: "tension", add: 80 }] },
      act_long: { minutes: 3000, effects: [] }, // a step that crosses two day boundaries (a `wait` is at most 1440)
      act_hurt: { effects: [{ op: "hp", add: -99 }] }
    },
    ...extra
  };
}

const WAIT = (minutes) => ({ type: "wait", minutes });
const PERFORM = (actionId) => ({ type: "perform", actionId });
const start = (data, worldSeed = "relation-seed") => createInitialState({ worldSeed, data }).state;
const run = (data, state, actions) => actions.reduce((st, a) => step(st, a, data).state, state);
const fired = (result) => result.events.filter((e) => e.type === "trigger.fired").map((e) => e.data.eventId);

function assertSurvivesSaveAndReplay(data, state, nextAction) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepStrictEqual(validateState(state), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_relation", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);
  assert.deepStrictEqual(step(loaded, nextAction, data), step(state, nextAction, data));
  assert.deepStrictEqual(step(state, nextAction, data), step(state, nextAction, data));
}

// 1. a declared rule has no runtime meaning: next to an equivalent event it changes no result, and on
// its own it writes nothing -- whatever fields it carries
function testRelationRuleIsReserved() {
  const change = { op: "relation", from: "npc_a", to: "npc_b", add: 5, mode: "cooperation" };
  const rule = { when: { op: "flag", key: "ready" }, effects: [change], every: "day" };
  const withRule = (data) => ({ ...data, rules: { ...data.rules, relation: { rule_coop: rule } } });
  const evented = fixture({ events: { e_coop: { trigger: { op: "flag", key: "ready" }, cooldown: 1440, effects: [change] } } });
  const steps = [PERFORM("act_ready"), WAIT(30), WAIT(1440), WAIT(30)];

  assert.deepStrictEqual(validateData(withRule(evented)), []);
  assert.deepStrictEqual(run(withRule(evented), start(evented), steps), run(evented, start(evented), steps));
  assert.strictEqual(run(evented, start(evented), steps).relations["npc_a:npc_b"].score, 10, "the event applied twice (cooldown 1440)");

  const ruleOnly = withRule(fixture());
  assert.strictEqual(run(ruleOnly, start(ruleOnly), steps).relations, undefined, "the rule alone writes no edge");
}

// 2. endpoints inside an event: the Condition context is the world, `self` is the current player, and
// there is no `target` -- so the §7.3 default `from: target` resolves to nothing and the Effect is
// skipped (D-29) without an error, an event or a validator report. A relation Effect in an event names
// `from` explicitly; literal ids reach world edges (NPC <-> NPC, NPC <-> organisation)
function testEventEndpoints() {
  const data = fixture({
    events: {
      e_ctx: {
        trigger: { op: "flag", key: "ready" },
        once: true,
        effects: [
          { op: "relation", add: 3 },
          { op: "relation", from: "target", to: "npc_b", add: 3 },
          { op: "relation", from: "npc_c", add: 4 },
          { op: "relation", from: "npc_c", to: "npc_d", add: -2 },
          { op: "relation", from: "npc_c", to: "org_x", tag: "member" }
        ]
      }
    }
  });
  assert.deepStrictEqual(validateData(data), [], "the skipped forms are not a validation error");
  const result = step(start(data), PERFORM("act_ready"), data);
  assert.deepStrictEqual(fired(result), ["e_ctx"]);
  assert.deepStrictEqual(Object.keys(result.state.relations).sort(), ["npc_c:npc_d", "npc_c:org_x", "npc_c:player_1"]);
  assert.strictEqual(result.events.filter((e) => e.type === "relation.changed").length, 3);
  assert.deepStrictEqual(result.state.relations["npc_c:org_x"].tags, ["member"]);
}

// 3. the V1 rule shape (web/core/npc-relations.js: one named edge, once per calendar day, a world-state
// branch) with existing ops only: the `day` selector against a per-edge `signal` counter. Exactly one
// branch per calendar day, on the first accepted step of that day; a step that crosses two boundaries
// catches up on the next accepted step (V1 does not catch up). `cooldown: 1440` is the simpler
// approximation: at most once per 1440 minutes, anchored at the time of day of its first firing
function testDailyRulePerEdge() {
  const daily = (condition, add, mode) => ({
    trigger: { op: "and", of: [condition, { op: "gt", left: { day: true }, right: { signal: "rel_day_ab" } }] },
    effects: [{ op: "relation", from: "npc_a", to: "npc_b", add, mode }, { op: "signal", key: "rel_day_ab", add: 1 }]
  });
  const data = fixture({
    events: {
      e_ab_1_coop: daily({ op: "signal", key: "tension", max: 30 }, 5, "cooperation"),
      e_ab_2_conflict: daily({ op: "signal", key: "tension", min: 65 }, -7, "conflict")
    }
  });
  assert.deepStrictEqual(validateData(data), []);
  const edgeOf = (state) => state.relations?.["npc_a:npc_b"];
  let state = start(data);
  const trace = [];
  for (const action of [WAIT(1440), WAIT(60), PERFORM("act_raise"), WAIT(1440), PERFORM("act_long"), WAIT(1), WAIT(1)]) {
    const result = step(state, action, data);
    state = result.state;
    trace.push([state.time.minute, fired(result), edgeOf(state)?.score]);
  }
  assert.deepStrictEqual(trace, [
    [1440, ["e_ab_1_coop"], 5], // day 1, low tension: cooperation
    [1500, [], 5], // same day: nothing
    [1500, [], 5], // tension rises the same day: still nothing (the day is processed)
    [2940, ["e_ab_2_conflict"], -2], // day 2: conflict
    [5940, ["e_ab_2_conflict"], -9], // day 4 reached in one step: fires once...
    [5941, ["e_ab_2_conflict"], -16], // ...and catches up on the next accepted step
    [5942, [], -16]
  ]);
  assert.deepStrictEqual([edgeOf(state).cooperationCount, edgeOf(state).conflictCount, edgeOf(state).lastDay], [1, 3, 4]);
  assertSurvivesSaveAndReplay(data, state, WAIT(1440));

  const cooled = fixture({ events: { e_daily: { trigger: { op: "flag", key: "ready" }, cooldown: 1440, effects: [{ op: "relation", from: "npc_a", to: "npc_b", add: 1 }] } } });
  let cooledState = run(cooled, start(cooled), [WAIT(1400), PERFORM("act_ready")]);
  const minutes = [cooledState.fired.e_daily.lastMinute];
  for (let i = 0; i < 150; i += 1) {
    const result = step(cooledState, WAIT(30), cooled);
    if (fired(result).length > 0) minutes.push(result.state.time.minute);
    cooledState = result.state;
  }
  assert.deepStrictEqual(minutes, [1400, 2840, 4280, 5720], "23:20 every day, never at the day boundary");
}

// 4. a delayed change ("N minutes after the cause") with existing ops: the follow-up event's first
// firing only starts its own cooldown clock; its next firing applies the change and closes it
function testDelayedChange() {
  const data = fixture({
    events: {
      e_cause: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "relation", from: "npc_a", to: "self", add: -20, tag: "wronged" }] },
      e_forgive: {
        trigger: { op: "and", of: [{ op: "relation", from: "npc_a", to: "self", tag: "wronged" }, { op: "lt", left: { signal: "forgive_clock" }, right: 2 }] },
        cooldown: 2880,
        effects: [
          { op: "if", when: { op: "signal", key: "forgive_clock", min: 1 }, then: [{ op: "relation", from: "npc_a", to: "self", add: 10, untag: "wronged" }] },
          { op: "signal", key: "forgive_clock", add: 1 }
        ]
      }
    }
  });
  assert.deepStrictEqual(validateData(data), []);
  let state = step(start(data), PERFORM("act_ready"), data).state;
  const trace = [[state.time.minute, state.relations["npc_a:player_1"].score]];
  for (const minutes of [600, 1440, 600, 600, 1440]) {
    state = step(state, WAIT(minutes), data).state;
    trace.push([state.time.minute, state.relations["npc_a:player_1"].score]);
  }
  assert.deepStrictEqual(trace, [[0, -20], [600, -20], [2040, -20], [2640, -20], [3240, -10], [4680, -10]], "forgiven once, 2880 minutes after the cause");
  assert.deepStrictEqual(state.relations["npc_a:player_1"].tags, []);
  const midway = run(data, start(data), [PERFORM("act_ready"), WAIT(600), WAIT(1440)]);
  assertSurvivesSaveAndReplay(data, midway, WAIT(1440));
}

// 5. after a succession, `self` in an event is the new character; the predecessor's edge is left as it was
function testSuccessorSelf() {
  const data = fixture({ events: { e_like: { trigger: { op: "flag", key: "ready" }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 1 }] } } });
  let state = run(data, start(data), [PERFORM("act_ready"), WAIT(30)]);
  state = step(state, PERFORM("act_hurt"), data).state;
  assert.deepStrictEqual(state.pending, { kind: "newCharacter" });
  state = run(data, state, [{ type: "startCharacter", templateId: "start_default" }, WAIT(30)]);
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(state.relations).map(([key, value]) => [key, value.score])),
    { "npc_a:player_1": 3, "npc_a:player_2": 2 }
  );
}

testRelationRuleIsReserved();
testEventEndpoints();
testDailyRulePerEdge();
testDelayedChange();
testSuccessorSelf();

console.log("V2-Core-39 relation-rules.test.js: all checks passed");
