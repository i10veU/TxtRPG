// V2-Core-37 (Issue #104, D-72): what the contract and the runtime say -- and do not say --
// about `data.cases[*].stages[*].completeWhen`, `data.rules.relation.*.when` and
// `data.facts[*].initial`. Investigation only: every assertion below pins CURRENT behaviour
// (a validated shape, a field nothing reads, what the existing `data.events` pipeline already
// does). None of them implements or chooses a semantics for the three fields. When a future
// D-decision activates one of them, the pins for that field are replaced together with it.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1). The synthetic fixture below uses abstract IDs;
// the real pack is imported only to show that it does not use the three fields (DEVELOPMENT_RULES
// §17 allows the one real-pack import in data-world.test.js -- here it is read-only evidence).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData, evaluateCondition } from "../../web/v2/core/rules.js";
import { deriveSeed, hashString, nextUint32 } from "../../web/v2/core/rng.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData as realPack } from "../../web/v2/data/world.js";

function fixture(extra = {}) {
  return {
    formatVersion: 1,
    id: "probe_pack",
    version: "0.1.0",
    world: { id: "probe_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: {
      start_default: { kind: "player", locationId: "loc_start", hp: { max: 10 }, money: 5, inventory: {}, growth: {}, tags: [] }
    },
    locations: { loc_start: { links: [] } },
    actions: {
      act_noop: { effects: [{ op: "money", add: 1 }] },
      act_ready: { effects: [{ op: "flag", key: "ready", value: true }] }
    },
    ...extra
  };
}

const WAIT = { type: "wait", minutes: 10 };
const DAY = { type: "wait", minutes: 1440 };
const PERFORM = (actionId) => ({ type: "perform", actionId });
const start = (data, worldSeed = "probe-seed") => createInitialState({ worldSeed, data }).state;
const drive = (data, state, actions) => actions.reduce((st, a) => step(st, a, data).state, state);
const types = (result) => result.events.map((e) => e.type);

// the state -> save record -> load -> same next step round trip the rest of the suite uses
function assertSurvivesSaveAndReplay(data, state, nextAction) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(state)), state);
  assert.deepStrictEqual(validateState(state), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_gap", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);
  assert.deepStrictEqual(step(loaded, nextAction, data), step(state, nextAction, data));
  assert.deepStrictEqual(step(state, nextAction, data), step(state, nextAction, data));
}

// 1. completeWhen: the schema is fixed (D-61), the execution is not. Nothing reads it.
function testCompleteWhen() {
  const withStages = (stages) => fixture({ cases: { case_a: { stages } } });
  const withCompleteWhen = (completeWhen) => withStages([{ id: "s1", completeWhen }, { id: "s2" }]);

  // schema (A): exactly one Condition, optional, world context (a `fact` is allowed -- no D-06 ban)
  assert.deepStrictEqual(validateData(withCompleteWhen({ op: "fact", fact: "f1" })), []);
  assert.deepStrictEqual(validateData(withCompleteWhen({ op: "and", of: [{ op: "flag", key: "k" }, { op: "not", of: { op: "flag", key: "j" } }] })), []);
  assert.deepStrictEqual(validateData(withCompleteWhen(undefined)), []);
  assert.deepStrictEqual(validateData(withCompleteWhen(null)), ["Condition at cases.case_a.stages[0].completeWhen must be a plain object"]);
  assert.deepStrictEqual(validateData(withCompleteWhen({ op: "zzz" })), ['unknown Condition op at cases.case_a.stages[0].completeWhen: "zzz"']);

  // ...and nothing else about a stage is checked: no id, no uniqueness, no transition target, no
  // effects, no unknown fields, `stages` as an object is skipped without a report
  assert.deepStrictEqual(validateData(withStages([{ completeWhen: { op: "always" } }, { id: "s1" }, { id: "s1" }])), []);
  assert.deepStrictEqual(validateData(withStages([{ id: "s1", completeWhen: { op: "always" }, next: "s2", effects: [{ op: "zzz" }], bogus: 1 }])), []);
  assert.deepStrictEqual(validateData(fixture({ cases: { case_a: { stages: { s1: { completeWhen: null } } } } })), []);
  assert.deepStrictEqual(validateData(fixture({ cases: { case_a: "not-an-object" } })), []);

  // runtime consumer (none): an always-true completeWhen changes nothing, whatever runs
  const always = withStages([{ id: "s1", completeWhen: { op: "always" } }, { id: "s2", completeWhen: { op: "always" } }]);
  const initial = start(always);
  assert.strictEqual(initial.cases, undefined, "createInitialState does not read data.cases");
  let state = initial;
  for (const action of [WAIT, PERFORM("act_noop"), DAY, WAIT]) {
    const result = step(state, action, always);
    assert.ok(types(result).every((t) => ["time.advanced", "day.started", "money.changed", "action.resolved"].includes(t)), "no case.updated from any step type");
    assert.strictEqual(result.state.cases, undefined);
    state = result.state;
  }

  // the real pack declares no data.cases and no completeWhen; its case moves only through `case` Effects
  assert.strictEqual(realPack.cases, undefined);
  assert.ok(!JSON.stringify(realPack).includes("completeWhen"));
  assert.strictEqual(start(realPack, "frontier-canonical-4").cases, undefined);

  // the `case` Effect is the whole lifecycle today: not cross-checked against data.cases, no order
  // enforced between stages, re-setting the same stage is silent (D-30: no change, no event)
  const effects = fixture({
    cases: { case_a: { stages: [{ id: "s1" }, { id: "s2" }] } },
    actions: {
      to_s2: { effects: [{ op: "case", case: "case_a", stage: "s2" }] },
      to_s1: { effects: [{ op: "case", case: "case_a", stage: "s1" }] },
      to_unknown: { effects: [{ op: "case", case: "case_zzz", stage: "no_such_stage" }] }
    }
  });
  const moved = step(start(effects), PERFORM("to_s2"), effects);
  assert.deepStrictEqual(moved.events.find((e) => e.type === "case.updated").data, { case: "case_a", stage: "s2" });
  assert.deepStrictEqual(moved.state.cases, { case_a: { stage: "s2", since: 0 } });
  assert.deepStrictEqual(types(step(moved.state, PERFORM("to_s2"), effects)), ["action.resolved"]);
  assert.strictEqual(step(moved.state, PERFORM("to_s1"), effects).state.cases.case_a.stage, "s1", "a stage can move backwards");
  assert.deepStrictEqual(step(start(effects), PERFORM("to_unknown"), effects).state.cases, { case_zzz: { stage: "no_such_stage", since: 0 } });

  // what the existing pipeline already expresses (B): "when a condition holds, move the case" is a
  // data.events trigger + `case` Effect. Stage 10 runs once per step in id order; an earlier event's
  // effect is visible to a later id in the same pass, so a chain s1 -> s2 -> s3 and a second case
  // complete in ONE step; against id order the chain needs the NEXT step (§2.5: one-step chain limit)
  const expressed = fixture({
    cases: { case_a: { stages: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] } },
    events: {
      a_to_s2: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s2" }] },
      b_to_s3: { trigger: { op: "case", case: "case_a", stage: "s2" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] },
      c_other: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_b", stage: "done" }] }
    }
  });
  assert.deepStrictEqual(validateData(expressed), []);
  const chained = step(start(expressed), PERFORM("act_ready"), expressed);
  assert.deepStrictEqual(
    chained.events.filter((e) => e.type === "case.updated").map((e) => `${e.data.case}:${e.data.stage}`),
    ["case_a:s2", "case_a:s3", "case_b:done"],
    "events in id order; every transition is an ordinary case.updated"
  );
  assert.deepStrictEqual(chained.state.cases, { case_a: { stage: "s3", since: 0 }, case_b: { stage: "done", since: 0 } });
  assert.deepStrictEqual(types(step(chained.state, WAIT, expressed)), ["time.advanced"], "`once`: nothing more on the next step");
  const reversed = fixture({
    cases: { case_a: { stages: [{ id: "s1" }, { id: "s2" }, { id: "s3" }] } },
    events: {
      a_to_s3: { trigger: { op: "case", case: "case_a", stage: "s2" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] },
      b_to_s2: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s2" }] }
    }
  });
  const first = step(start(reversed), PERFORM("act_ready"), reversed);
  assert.strictEqual(first.state.cases.case_a.stage, "s2", "the earlier id does not see the later id's effect in the same pass");
  const second = step(first.state, WAIT, reversed);
  assert.deepStrictEqual(second.state.cases.case_a, { stage: "s3", since: 10 });
  assertSurvivesSaveAndReplay(expressed, chained.state, WAIT);
  assertSurvivesSaveAndReplay(reversed, first.state, WAIT);
}

testCompleteWhen();

// 2. relation rule `when`: the schema is fixed (D-62), the rule's effect, cadence, priority and
// repetition are not. Nothing reads `data.rules.relation`.
function testRelationRule() {
  const withRule = (rule) => fixture({ rules: { check: {}, succession: [], relation: { rule_a: rule } } });

  // schema (A): one Condition, optional, world context
  assert.deepStrictEqual(validateData(withRule({ when: { op: "fact", fact: "f1" } })), []);
  assert.deepStrictEqual(validateData(withRule({})), []);
  assert.deepStrictEqual(validateData(withRule({ when: null })), ["Condition at rules.relation.rule_a.when must be a plain object"]);
  assert.deepStrictEqual(validateData(withRule({ when: { op: "zzz" } })), ['unknown Condition op at rules.relation.rule_a.when: "zzz"']);
  // ...and nothing else: unknown fields (effects/cadence/priority) are ignored, a non-object
  // `rules.relation` or rule entry is skipped, a personal Condition in a world context is allowed
  assert.deepStrictEqual(validateData(withRule({ when: { op: "always" }, effects: [{ op: "zzz" }], every: "day", priority: 9 })), []);
  assert.deepStrictEqual(validateData(fixture({ rules: { relation: [{ when: { op: "zzz" } }] } })), []);
  assert.deepStrictEqual(validateData(withRule("not-an-object")), []);
  assert.deepStrictEqual(validateData(withRule({ when: { op: "relation", from: "npc_a", to: "self", min: 1 } })), []);

  // runtime consumer (none): an always-true rule that even carries an `effects` list changes nothing
  const rule = fixture({
    rules: { check: {}, succession: [], relation: { rule_a: { when: { op: "always" }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 5 }] } } }
  });
  let state = start(rule);
  const seen = new Set();
  for (const action of [WAIT, PERFORM("act_noop"), DAY, WAIT]) {
    const result = step(state, action, rule);
    result.events.forEach((e) => seen.add(e.type));
    state = result.state;
  }
  assert.strictEqual(state.relations, undefined, "no relation edge is ever written by a rule");
  assert.ok(!seen.has("relation.changed"));
  assert.ok(seen.has("day.started"), "a day boundary passed and still no rule ran");
  assert.strictEqual(realPack.rules.relation, undefined, "the real pack declares no rules.relation");
  // `rules.relationModifier` is a different thing (a check() modifier step, §5.4), not this field
  assert.strictEqual(realPack.rules.relationModifier, undefined);

  // what the existing pipeline already expresses (B): a "rule" is a data.events trigger + relation
  // Effects. Cadence: every step's stage 10 (no once/cooldown => every step); priority: id ascending,
  // later ids see earlier effects; repetition: `once`/`cooldown` (minutes); the Condition context is
  // the world but `self` is the current player character
  const expressed = fixture({
    events: {
      a_rule: { trigger: { op: "flag", key: "ready" }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 5 }] },
      b_rule: { trigger: { op: "relation", from: "npc_a", to: "self", min: 5 }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 10, mode: "cooperation" }] },
      c_once: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "relation", from: "npc_a", to: "self", tag: "friend" }] },
      d_cool: { trigger: { op: "flag", key: "ready" }, cooldown: 1440, effects: [{ op: "relation", from: "npc_b", to: "self", add: 1 }] }
    }
  });
  assert.deepStrictEqual(validateData(expressed), []);
  const one = step(start(expressed), PERFORM("act_ready"), expressed);
  assert.deepStrictEqual(one.state.relations["npc_a:player_1"].score, 15, "b saw a's +5 in the same pass");
  assert.deepStrictEqual(one.state.relations["npc_a:player_1"].tags, ["friend"]);
  assert.strictEqual(one.state.relations["npc_b:player_1"].score, 1);
  const later = drive(expressed, one.state, [WAIT, WAIT, WAIT]);
  const edge = later.relations["npc_a:player_1"];
  assert.strictEqual(edge.score, 60, "an event without once/cooldown applies on every step");
  assert.strictEqual(edge.cooperationCount, 4, "every application of `mode` counts (§7.3), so a per-step cadence inflates the counter");
  assert.strictEqual(later.relations["npc_b:player_1"].score, 1, "cooldown holds it back");
  assert.strictEqual(later.fired.c_once.count, 1);
  assert.strictEqual(later.fired.a_rule.count, 4);
  assert.deepStrictEqual(Object.keys(later.relations).filter((k) => !k.startsWith("npc_")), [], "self resolved to the current player only");

  // a relation Condition that needs a character has none in a bare world context: false, no throw
  const world = start(expressed);
  assert.strictEqual(evaluateCondition({ op: "relation", from: "npc_a", to: "self", min: 0 }, { state: world, data: expressed, contextKind: "world" }), false);
  assertSurvivesSaveAndReplay(expressed, later, WAIT);
}

testRelationRule();

// 3. facts[*].initial: decided by D-76 (V2-Core-43, Issue #118) and tested in
// tests/v2/facts-initial.test.js -- createInitialState seeds it, with C1 (`state.worldSeed`) as the
// seed input. What stays here is the evidence the decision rested on.
function testFactsInitial() {
  const withFacts = (facts) => fixture({ facts });

  // validator: the fact id and (D-76) a usable `pickFrom`; the unusable shapes are in facts-initial.test.js
  assert.deepStrictEqual(validateData(withFacts({ f1: { initial: "x" } })), []);
  assert.deepStrictEqual(validateData(withFacts({ f1: { initial: { pickFrom: ["a", "b"] } } })), []);
  for (const initial of [null, undefined]) {
    assert.deepStrictEqual(validateData(withFacts({ f1: { initial } })), [], JSON.stringify(initial));
  }
  assert.deepStrictEqual(validateData(withFacts({ f1: "x" })), []);
  assert.deepStrictEqual(validateData(withFacts({ Bad_Id: { initial: 1 } })), ['invalid id format at facts key: "Bad_Id"']);

  // runtime consumer (D-76): createInitialState seeds both forms, with no event
  const seeded = fixture({ facts: { f_fixed: { initial: "x" }, f_pick: { initial: { pickFrom: ["a", "b", "c"] } } } });
  const created = createInitialState({ worldSeed: "seed-1", data: seeded });
  const c1Pick = ["a", "b", "c"][nextUint32({ seed: deriveSeed("seed-1", "fact:f_pick"), cursor: 0 }).value % 3];
  assert.deepStrictEqual(created.state.facts, { f_fixed: { value: "x", since: 0 }, f_pick: { value: c1Pick, since: 0 } });
  assert.deepStrictEqual(created.events, []);
  assert.strictEqual(evaluateCondition({ op: "fact", fact: "f_fixed", eq: "x" }, { state: created.state, data: seeded, contextKind: "world" }), true);
  assert.deepStrictEqual(realPack.facts, { fact_ruins_secret: { initial: "unknown" }, fact_bandits_fate: {} }, "the real pack's `initial`, now its starting value (fact_bandits_fate, V2-Core-45, has none)");
  assert.deepStrictEqual(start(realPack, "frontier-canonical-4").facts, { fact_ruins_secret: { value: "unknown", since: 0 } });
  assert.deepStrictEqual(created.state, start(seeded, "seed-1"), "same seed, same state");
  // a state saved without a `facts` key (every state so far) is valid, and `state.facts` appears lazily
  assert.deepStrictEqual(validateState(created.state), []);
  const lazy = fixture({ facts: { f_fixed: { initial: "x" } }, actions: { set: { effects: [{ op: "fact", fact: "f_fixed", set: "y" }] } } });
  assert.deepStrictEqual(step(start(lazy), PERFORM("set"), lazy).state.facts, { f_fixed: { value: "y", since: 0 } });
  assertSurvivesSaveAndReplay(lazy, step(start(lazy), PERFORM("set"), lazy).state, WAIT);

  // why the seed input needed a decision (now C1, D-76): the contract formula (§2.7) assumes a NUMBER,
  // the state holds a string `worldSeed` and its hash `rng.seed` (uint32). Three inputs, three streams
  const label = "fact:f_pick";
  const pick = (derived) => nextUint32({ seed: derived, cursor: 0 }).value % 3;
  let stringVsHash = 0;
  for (let i = 0; i < 200; i += 1) {
    const state = start(seeded, `s${i}`);
    assert.strictEqual(state.rng.seed, hashString(state.worldSeed));
    assert.strictEqual(state.rng.cursor, 0);
    if (pick(deriveSeed(state.worldSeed, label)) !== pick(deriveSeed(state.rng.seed, label))) stringVsHash += 1;
  }
  assert.ok(stringVsHash > 50, `the two conventions choose differently for many seeds (${stringVsHash}/200)`);
  assert.notStrictEqual(deriveSeed("255", "x"), deriveSeed(255, "x"), "a numeric seed and its string form are different streams (radix is ignored for strings)");
  assert.notStrictEqual(deriveSeed("seed-1", "fact:a"), deriveSeed("seed-1", "fact:b"), "labels give independent streams");
  assert.strictEqual(deriveSeed("seed-1", label), deriveSeed("seed-1", label), "a stream is a pure function of (seed, label): no state is needed to replay it");
}

testFactsInitial();

console.log("V2-Core-37 core-semantics-gap.test.js: all checks passed");
