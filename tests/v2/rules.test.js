// V2-Core-02 tests for the Condition evaluator
// (docs/v2/architecture/CORE_CONTRACTS.md §3, §3.2a).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
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

function ctxWith(overrides) {
  return {
    state: {},
    data: {},
    actorId: "player_1",
    targetId: "npc_1",
    contextKind: "player",
    ...overrides
  };
}

// a Condition-like object whose `op` getter counts how many times it is read,
// used to prove and/or actually short-circuit (never even look at `.op`).
function countingLeaf(result) {
  const counter = { reads: 0 };
  const node = {};
  Object.defineProperty(node, "op", {
    enumerable: true,
    get() {
      counter.reads += 1;
      return result ? "always" : "never";
    }
  });
  return { node, counter };
}

// 1. always / never
function testAlwaysNever() {
  const ctx = ctxWith({});
  assert.strictEqual(evaluateCondition({ op: "always" }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "never" }, ctx), false);
  // extra keys are ignored, not an error
  assert.strictEqual(evaluateCondition({ op: "always", extra: 1 }, ctx), true);
}

// 2. not
function testNot() {
  const ctx = ctxWith({});
  assert.strictEqual(evaluateCondition({ op: "not", of: { op: "always" } }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "not", of: { op: "never" } }, ctx), true);
  // "정확히 하나의 Condition만 받는다": an array `of` is malformed -> false
  assert.strictEqual(evaluateCondition({ op: "not", of: [{ op: "always" }] }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "not" }, ctx), false);
}

// 3 & 6. and / or, including empty-array semantics and nesting
function testAndOr() {
  const ctx = ctxWith({});
  const T = { op: "always" };
  const F = { op: "never" };

  assert.strictEqual(evaluateCondition({ op: "and", of: [] }, ctx), true, "and([]) must be true");
  assert.strictEqual(evaluateCondition({ op: "or", of: [] }, ctx), false, "or([]) must be false");

  assert.strictEqual(evaluateCondition({ op: "and", of: [T, T, T] }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "and", of: [T, F, T] }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "or", of: [F, F, F] }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "or", of: [F, T, F] }, ctx), true);

  // malformed `of` (not an array) -> false
  assert.strictEqual(evaluateCondition({ op: "and", of: T }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "or" }, ctx), false);

  // nested Condition trees
  const nested = {
    op: "and",
    of: [
      { op: "or", of: [F, { op: "not", of: F }] },
      { op: "eq", left: 1, right: 1 }
    ]
  };
  assert.strictEqual(evaluateCondition(nested, ctx), true);
}

// short-circuit: the untaken branch's `op` must never be read
function testShortCircuit() {
  const ctx = ctxWith({});

  const andSpy = countingLeaf(true);
  evaluateCondition({ op: "and", of: [{ op: "never" }, andSpy.node] }, ctx);
  assert.strictEqual(andSpy.counter.reads, 0, "and must not evaluate branches after a false");

  const orSpy = countingLeaf(false);
  evaluateCondition({ op: "or", of: [{ op: "always" }, orSpy.node] }, ctx);
  assert.strictEqual(orSpy.counter.reads, 0, "or must not evaluate branches after a true");

  // sanity: when short-circuiting does NOT apply, the branch is read exactly once
  const reachedSpy = countingLeaf(true);
  evaluateCondition({ op: "and", of: [{ op: "always" }, reachedSpy.node] }, ctx);
  assert.strictEqual(reachedSpy.counter.reads, 1, "a reachable branch must still be evaluated exactly once");
}

// 4 & 5. numeric and string comparisons
function testComparisons() {
  const ctx = ctxWith({});

  assert.strictEqual(evaluateCondition({ op: "eq", left: 5, right: 5 }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "neq", left: 5, right: 6 }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "gt", left: 5, right: 3 }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "gt", left: 3, right: 5 }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "gte", left: 5, right: 5 }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "lt", left: 3, right: 5 }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "lte", left: 5, right: 5 }, ctx), true);

  // eq/neq allow strings (strict equality)
  assert.strictEqual(evaluateCondition({ op: "eq", left: "abc", right: "abc" }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "neq", left: "abc", right: "abd" }, ctx), true);

  // gt/gte/lt/lte must NOT compare strings, even when lexicographically ordered
  assert.strictEqual(evaluateCondition({ op: "gt", left: "abc", right: "abb" }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "lt", left: "abb", right: "abc" }, ctx), false);

  // type mismatch -> false for ordering ops
  assert.strictEqual(evaluateCondition({ op: "gt", left: 5, right: "3" }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "gte", left: true, right: 1 }, ctx), false);

  // eq/neq use strict equality: no cross-type coercion (5 !== "5")
  assert.strictEqual(evaluateCondition({ op: "eq", left: 5, right: "5" }, ctx), false);
  assert.strictEqual(evaluateCondition({ op: "neq", left: 5, right: "5" }, ctx), true);

  // booleans and null compare via strict equality too
  assert.strictEqual(evaluateCondition({ op: "eq", left: true, right: true }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "eq", left: null, right: null }, ctx), true);
}

// selectors: flag, signal, relation, day (the ones that resolve without
// Growth/Item/Fact/Rumor state existing yet), plus deferred selectors
// resolving to undefined per §3.2a.
function testSelectors() {
  // flag: missing key -> null; present key -> its value
  const ctxNoFlags = ctxWith({ state: {} });
  assert.strictEqual(evaluateCondition({ op: "eq", left: { flag: "gate_open" }, right: null }, ctxNoFlags), true);
  const ctxWithFlag = ctxWith({ state: { flags: { gate_open: true } } });
  assert.strictEqual(evaluateCondition({ op: "eq", left: { flag: "gate_open" }, right: true }, ctxWithFlag), true);

  // signal: missing key -> 0; present key -> its count
  const ctxNoSignals = ctxWith({ state: {} });
  assert.strictEqual(evaluateCondition({ op: "eq", left: { signal: "sig_x" }, right: 0 }, ctxNoSignals), true);
  const ctxWithSignal = ctxWith({ state: { signals: { sig_x: 3 } } });
  assert.strictEqual(evaluateCondition({ op: "gte", left: { signal: "sig_x" }, right: 3 }, ctxWithSignal), true);

  // relation: no `relations` state at all -> default score 0
  const ctxNoRelations = ctxWith({ state: {} });
  assert.strictEqual(
    evaluateCondition(
      { op: "eq", left: { relation: { from: "npc_1", to: "self" } }, right: 0 },
      ctxNoRelations
    ),
    true
  );
  // relation: existing edge score
  const ctxWithRelation = ctxWith({ state: { relations: { "npc_1:player_1": { score: 20 } } } });
  assert.strictEqual(
    evaluateCondition(
      { op: "gt", left: { relation: { from: "npc_1", to: "self" } }, right: 10 },
      ctxWithRelation
    ),
    true
  );

  // day: real engine state, integration with engine.js (no engine.js changes needed)
  const { state: s0 } = createInitialState({ worldSeed: "rules-day-check" });
  const { state: s1 } = step(s0, { type: "wait", minutes: 1440 }, {}); // exactly one day (§2.2 max)
  const worldCtx = ctxWith({ state: s1, contextKind: "world" });
  assert.strictEqual(evaluateCondition({ op: "eq", left: { day: true }, right: 1 }, worldCtx), true);

  // deferred selectors (Growth/Item/Fact/Rumor state does not exist yet):
  // they resolve to `undefined`, which is a type mismatch for ordering ops
  // and never throws.
  const bareCtx = ctxWith({ state: {} });
  ["stat", "skill", "proficiency", "item", "money"].forEach((key) => {
    const selector = key === "money" ? { money: true } : { [key]: "id_a" };
    assert.strictEqual(evaluateCondition({ op: "gt", left: selector, right: 0 }, bareCtx), false,
      key + " selector must not throw and must compare as false when its backing state is absent");
  });

  // fact: world context resolves the value; player context always sees undefined (D-06 extension)
  const factState = { facts: { fact_a: { value: "truth", since: 0 } } };
  const worldFactCtx = ctxWith({ state: factState, contextKind: "world" });
  const playerFactCtx = ctxWith({ state: factState, contextKind: "player" });
  assert.strictEqual(evaluateCondition({ op: "eq", left: { fact: "fact_a" }, right: "truth" }, worldFactCtx), true);
  assert.strictEqual(evaluateCondition({ op: "eq", left: { fact: "fact_a" }, right: "truth" }, playerFactCtx), false,
    "fact selector must not leak the truth into player-context conditions");

  // rumor: no knowledge state -> undefined, never throws
  assert.strictEqual(evaluateCondition({ op: "gte", left: { rumor: "rum_a" }, right: 50 }, bareCtx), false);

  // rumor selector (D-24 resolved, V2-Core-15): resolves to the entry's
  // `claim` -- the substantive content, mirroring `fact`'s own `.value`
  const rumorSelectorState = { knowledge: { player_1: { rum_a: { rumorId: "rum_a", factId: "fact_a", claim: "truth", confidence: 60 } } } };
  assert.strictEqual(evaluateCondition({ op: "eq", left: { rumor: "rum_a" }, right: "truth" }, ctxWith({ state: rumorSelectorState })), true);
  assert.strictEqual(evaluateCondition({ op: "eq", left: { rumor: "rum_a" }, right: "lie" }, ctxWith({ state: rumorSelectorState })), false);
  assert.strictEqual(evaluateCondition({ op: "eq", left: { rumor: "missing" }, right: "truth" }, ctxWith({ state: rumorSelectorState })), false, "unknown rumor id -> undefined, unresolved -> false (D-25)");
}

// D-25: an unresolved (undefined) operand makes every comparison op false,
// with no exception for eq/neq's own strict-equality special case.
function testUnresolvedComparisonsAreFalse() {
  const ctx = ctxWith({ state: {} });
  const unresolved = { item: "missing_item" }; // no `actors` in state -> always undefined
  const value = 5;

  assert.strictEqual(evaluateCondition({ op: "eq", left: unresolved, right: unresolved }, ctx), false,
    "undefined === undefined must be false");
  assert.strictEqual(evaluateCondition({ op: "eq", left: unresolved, right: value }, ctx), false,
    "undefined === value must be false");
  assert.strictEqual(evaluateCondition({ op: "eq", left: value, right: unresolved }, ctx), false,
    "value === undefined must be false");
  assert.strictEqual(evaluateCondition({ op: "neq", left: unresolved, right: unresolved }, ctx), false,
    "undefined !== undefined must be false");
  assert.strictEqual(evaluateCondition({ op: "gt", left: unresolved, right: value }, ctx), false,
    "undefined > value must be false");
  assert.strictEqual(evaluateCondition({ op: "lt", left: unresolved, right: value }, ctx), false,
    "undefined < value must be false");
}

// malformed Condition handling: false, never throw (§3.1)
function testMalformedCondition() {
  const ctx = ctxWith({});
  [null, undefined, "always", 42, [], { op: "does_not_exist" }, {}].forEach((bad) => {
    assert.doesNotThrow(() => evaluateCondition(bad, ctx));
  });
  assert.strictEqual(evaluateCondition(null, ctx), false);
  assert.strictEqual(evaluateCondition(undefined, ctx), false);
  assert.strictEqual(evaluateCondition("always", ctx), false, "op must be inside an object, not a bare string");
  assert.strictEqual(evaluateCondition(42, ctx), false);
  assert.strictEqual(evaluateCondition([], ctx), false, "an array is not a Condition");
  assert.strictEqual(evaluateCondition({}, ctx), false, "missing op");
  assert.strictEqual(evaluateCondition({ op: "does_not_exist" }, ctx), false, "unknown op");
  // a selector with more than one recognized key is malformed -> unresolved
  assert.strictEqual(
    evaluateCondition({ op: "eq", left: { flag: "a", signal: "b" }, right: null }, ctxWith({ state: {} })),
    false
  );
}

// state / data / condition input immutability
function testInputImmutability() {
  const condition = deepFreeze({
    op: "and",
    of: [
      { op: "eq", left: { flag: "gate_open" }, right: true },
      { op: "gte", left: { signal: "sig_x" }, right: 1 }
    ]
  });
  const conditionBefore = snapshot(condition);

  const ctx = deepFreeze(ctxWith({ state: { flags: { gate_open: true }, signals: { sig_x: 2 } } }));
  const stateBefore = snapshot(ctx.state);
  const dataBefore = snapshot(ctx.data);

  const result = evaluateCondition(condition, ctx);

  assert.strictEqual(result, true, "sanity: evaluation must still have succeeded");
  assert.deepStrictEqual(snapshot(condition), conditionBefore, "evaluateCondition must not mutate the condition tree");
  assert.deepStrictEqual(snapshot(ctx.state), stateBefore, "evaluateCondition must not mutate ctx.state");
  assert.deepStrictEqual(snapshot(ctx.data), dataBefore, "evaluateCondition must not mutate ctx.data");
}

// determinism: same condition + same ctx -> same result, every time
function testDeterminism() {
  const condition = {
    op: "or",
    of: [
      { op: "eq", left: { relation: { from: "npc_1", to: "self" } }, right: 0 },
      { op: "lt", left: { day: true }, right: 1 }
    ]
  };
  const ctx = ctxWith({ state: {}, contextKind: "world" });

  const results = new Set();
  for (let i = 0; i < 10; i += 1) {
    results.add(evaluateCondition(condition, ctx));
  }
  assert.strictEqual(results.size, 1, "the same (condition, ctx) must always evaluate to the same result");
}

// JSON round-trip safety of the Condition DSL itself
function testJsonRoundTrip() {
  const condition = {
    op: "and",
    of: [
      { op: "not", of: { op: "never" } },
      { op: "gte", left: { signal: "sig_x" }, right: 1 },
      { op: "eq", left: "abc", right: "abc" }
    ]
  };
  const roundTripped = JSON.parse(JSON.stringify(condition));
  assert.deepStrictEqual(roundTripped, condition, "a Condition must be JSON round-trip safe");

  const ctx = ctxWith({ state: { signals: { sig_x: 4 } } });
  assert.strictEqual(evaluateCondition(condition, ctx), evaluateCondition(roundTripped, ctx),
    "evaluating the original and the round-tripped Condition must agree");
}

// static scan for forbidden host APIs
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

  const code = stripComments(fs.readFileSync(path.join(repoRoot, "web/v2/core/rules.js"), "utf8"));
  forbiddenPatterns.forEach((pattern) => {
    assert.ok(!pattern.test(code), "rules.js must not use forbidden host API matching " + pattern);
  });
}

// V2-Core-14 (D-54): §3.2 shorthand Condition ops. `sysCtx` supplies
// data.world.growthSystemId so the growth-backed ops (stat/skill/trait/
// unlock) resolve without an explicit `system` argument, same default the
// selectors already use (§3.2a).
function sysCtx(state, overrides) {
  return ctxWith({ state, data: { world: { growthSystemId: "sysA" } }, contextKind: "world", ...overrides });
}

function testShorthandStatSkillTraitUnlock() {
  const growthState = {
    actors: { player_1: { growth: { sysA: { stats: { str: 5 }, skills: { skill_a: 2 }, traits: { brave: true }, unlocks: { unl_a: true } } } } }
  };
  const emptyState = { actors: { player_1: { growth: { sysA: { stats: {}, skills: {}, traits: {}, unlocks: {} } } } } };

  // normal
  assert.strictEqual(evaluateCondition({ op: "stat", stat: "str", min: 5 }, sysCtx(growthState)), true);
  assert.strictEqual(evaluateCondition({ op: "stat", stat: "str", eq: 5 }, sysCtx(growthState)), true);
  assert.strictEqual(evaluateCondition({ op: "stat", stat: "str", min: 6 }, sysCtx(growthState)), false);
  // skill: bare op defaults min to 1 (§3.2 table)
  assert.strictEqual(evaluateCondition({ op: "skill", skill: "skill_a" }, sysCtx(growthState)), true);
  assert.strictEqual(evaluateCondition({ op: "skill", skill: "missing" }, sysCtx(emptyState)), false);
  assert.strictEqual(evaluateCondition({ op: "skill", skill: "skill_a", min: 3 }, sysCtx(growthState)), false);
  // trait: presence only, no comparator args
  assert.strictEqual(evaluateCondition({ op: "trait", trait: "brave" }, sysCtx(growthState)), true);
  assert.strictEqual(evaluateCondition({ op: "trait", trait: "missing" }, sysCtx(emptyState)), false);
  // unlock: presence only
  assert.strictEqual(evaluateCondition({ op: "unlock", id: "unl_a" }, sysCtx(growthState)), true);
  assert.strictEqual(evaluateCondition({ op: "unlock", id: "missing" }, sysCtx(emptyState)), false);

  // unknown reference / no growth state at all -> false, never throws
  const bareCtx = sysCtx({});
  assert.doesNotThrow(() => evaluateCondition({ op: "stat", stat: "str", min: 1 }, bareCtx));
  assert.strictEqual(evaluateCondition({ op: "stat", stat: "str", min: 1 }, bareCtx), false);
  assert.strictEqual(evaluateCondition({ op: "trait", trait: "brave" }, bareCtx), false);

  // malformed: wrong-typed id field -> false, not throw
  assert.strictEqual(evaluateCondition({ op: "stat", stat: 5, min: 1 }, sysCtx(growthState)), false);
  assert.strictEqual(evaluateCondition({ op: "skill" }, sysCtx(growthState)), false);

  // determinism / no mutation
  const frozenCondition = deepFreeze({ op: "stat", stat: "str", min: 5 });
  const frozenCtx = deepFreeze(sysCtx(growthState));
  const before = snapshot(frozenCtx.state);
  assert.strictEqual(evaluateCondition(frozenCondition, frozenCtx), true);
  assert.deepStrictEqual(snapshot(frozenCtx.state), before);
}

function testShorthandFlagSignalItemMoney() {
  // flag: eq form and bare truthy form
  assert.strictEqual(evaluateCondition({ op: "flag", key: "gate_open", eq: true }, ctxWith({ state: { flags: { gate_open: true } } })), true);
  assert.strictEqual(evaluateCondition({ op: "flag", key: "gate_open" }, ctxWith({ state: { flags: { gate_open: true } } })), true);
  assert.strictEqual(evaluateCondition({ op: "flag", key: "missing" }, ctxWith({ state: {} })), false, "missing flag is falsy, never throws");
  assert.strictEqual(evaluateCondition({ op: "flag", key: 5 }, ctxWith({ state: {} })), false, "malformed key -> false");

  // signal: missing key defaults to 0, min comparator
  assert.strictEqual(evaluateCondition({ op: "signal", key: "sig_x", min: 3 }, ctxWith({ state: { signals: { sig_x: 3 } } })), true);
  assert.strictEqual(evaluateCondition({ op: "signal", key: "missing", min: 1 }, ctxWith({ state: {} })), false);
  assert.strictEqual(evaluateCondition({ op: "signal", key: "sig_x" }, ctxWith({ state: { signals: { sig_x: 0 } } })), false, "0 is falsy under the bare truthy check");

  // item: bare op defaults min to 1 (§3.2 table), same pattern as skill
  const itemState = { actors: { player_1: { inventory: { sword: 1 } } } };
  assert.strictEqual(evaluateCondition({ op: "item", item: "sword" }, ctxWith({ state: itemState })), true);
  assert.strictEqual(evaluateCondition({ op: "item", item: "shield" }, ctxWith({ state: itemState })), false);
  assert.strictEqual(evaluateCondition({ op: "item", item: "sword", min: 2 }, ctxWith({ state: itemState })), false);

  // money: no selector marker needed, subject default self
  assert.strictEqual(evaluateCondition({ op: "money", min: 10 }, ctxWith({ state: { actors: { player_1: { money: 15 } } } })), true);
  assert.strictEqual(evaluateCondition({ op: "money", min: 20 }, ctxWith({ state: { actors: { player_1: { money: 15 } } } })), false);
  assert.strictEqual(evaluateCondition({ op: "money", min: 1 }, ctxWith({ state: {} })), false, "no actor -> undefined -> false, never throws");

  // sequential visibility: shorthand ops compose inside and/or with existing ops
  const combined = { op: "and", of: [{ op: "flag", key: "gate_open" }, { op: "money", min: 10 }] };
  assert.strictEqual(evaluateCondition(combined, ctxWith({ state: { flags: { gate_open: true }, actors: { player_1: { money: 15 } } } })), true);
}

function testShorthandRelation() {
  const edgeState = { relations: { "npc_1:player_1": { score: 20, mode: "cooperation", tags: ["debt"] } } };
  // normal: all given constraints satisfied
  assert.strictEqual(
    evaluateCondition({ op: "relation", from: "npc_1", to: "self", min: 10, mode: "cooperation", tag: "debt" }, ctxWith({ state: edgeState })),
    true
  );
  // one constraint fails -> whole thing false (AND)
  assert.strictEqual(
    evaluateCondition({ op: "relation", from: "npc_1", to: "self", tag: "missing" }, ctxWith({ state: edgeState })),
    false
  );
  assert.strictEqual(
    evaluateCondition({ op: "relation", from: "npc_1", to: "self", mode: "conflict" }, ctxWith({ state: edgeState })),
    false
  );
  // no edge -> default {score:0, mode:"neutral", tags:[]}
  assert.strictEqual(evaluateCondition({ op: "relation", from: "npc_1", to: "self", eq: 0 }, ctxWith({ state: {} })), true);
  // D-54: no constraint at all -> vacuously true when a valid edge endpoint resolves
  assert.strictEqual(evaluateCondition({ op: "relation", from: "npc_1", to: "self" }, ctxWith({ state: {} })), true);
  // default subject: from=target, to=self (D-43/§7.3 convention reused)
  assert.strictEqual(evaluateCondition({ op: "relation", eq: 20 }, ctxWith({ state: edgeState })), true);
}

function testShorthandFactDayLocationCase() {
  // fact: world-context only (D-06 extended)
  const factState = { facts: { fact_a: { value: "truth", since: 0 } } };
  assert.strictEqual(evaluateCondition({ op: "fact", fact: "fact_a", eq: "truth" }, ctxWith({ state: factState, contextKind: "world" })), true);
  assert.strictEqual(evaluateCondition({ op: "fact", fact: "fact_a", eq: "truth" }, ctxWith({ state: factState, contextKind: "player" })), false);

  // day: day-number comparator and hour wraparound, independently AND'd
  const dayState = { time: { minute: 1440 * 3 + 23 * 60 + 30 } }; // day 3, hour 23
  assert.strictEqual(evaluateCondition({ op: "day", min: 2 }, ctxWith({ state: dayState })), true);
  assert.strictEqual(evaluateCondition({ op: "day", min: 4 }, ctxWith({ state: dayState })), false);
  assert.strictEqual(evaluateCondition({ op: "day", hourFrom: 20, hourTo: 4 }, ctxWith({ state: dayState })), true, "23:30 is inside the midnight-wrapping 20..4 range");
  const dayHour10 = { time: { minute: 1440 * 3 + 10 * 60 } };
  assert.strictEqual(evaluateCondition({ op: "day", hourFrom: 20, hourTo: 4 }, ctxWith({ state: dayHour10 })), false);
  assert.strictEqual(evaluateCondition({ op: "day", hourFrom: 20 }, ctxWith({ state: dayState })), false, "hourFrom without hourTo is malformed -> false");
  assert.strictEqual(evaluateCondition({ op: "day", min: 2, hourFrom: 20, hourTo: 4 }, ctxWith({ state: dayState })), true, "day and hour constraints combine with AND");

  // location: at (equality) and in (membership)
  const locState = { actors: { player_1: { locationId: "loc_b" } } };
  assert.strictEqual(evaluateCondition({ op: "location", at: "loc_b" }, ctxWith({ state: locState })), true);
  assert.strictEqual(evaluateCondition({ op: "location", at: "loc_a" }, ctxWith({ state: locState })), false);
  assert.strictEqual(evaluateCondition({ op: "location", in: ["loc_a", "loc_b"] }, ctxWith({ state: locState })), true);
  assert.strictEqual(evaluateCondition({ op: "location" }, ctxWith({ state: locState })), false, "neither at nor in given -> false");

  // case: stage (equality) and in (membership)
  const caseState = { cases: { case_a: { stage: "s2", since: 0 } } };
  assert.strictEqual(evaluateCondition({ op: "case", case: "case_a", stage: "s2" }, ctxWith({ state: caseState })), true);
  assert.strictEqual(evaluateCondition({ op: "case", case: "case_a", stage: "s1" }, ctxWith({ state: caseState })), false);
  assert.strictEqual(evaluateCondition({ op: "case", case: "case_a", in: ["s1", "s2"] }, ctxWith({ state: caseState })), true);
  assert.strictEqual(evaluateCondition({ op: "case", case: "missing", stage: "s2" }, ctxWith({ state: caseState })), false);

  // rumor shorthand op (D-24 resolved, V2-Core-15): direct-rumor and
  // fact-reverse-lookup forms, both mechanical reads of RumorEntry (§8.2)
  const rumorState = {
    knowledge: { player_1: { rum_a: { rumorId: "rum_a", factId: "fact_a", claim: "truth", confidence: 60 } } }
  };
  assert.strictEqual(evaluateCondition({ op: "rumor", rumor: "rum_a" }, ctxWith({ state: rumorState })), true);
  assert.strictEqual(evaluateCondition({ op: "rumor", rumor: "rum_a", minConfidence: 50 }, ctxWith({ state: rumorState })), true);
  assert.strictEqual(evaluateCondition({ op: "rumor", rumor: "rum_a", minConfidence: 80 }, ctxWith({ state: rumorState })), false);
  assert.strictEqual(evaluateCondition({ op: "rumor", fact: "fact_a" }, ctxWith({ state: rumorState })), true, "fact reverse-lookup must find any entry with a matching factId");
  assert.strictEqual(evaluateCondition({ op: "rumor", fact: "fact_z" }, ctxWith({ state: rumorState })), false);
  // no knowledge state at all, or the rumor genuinely unknown -> false, never throws
  assert.strictEqual(evaluateCondition({ op: "rumor", rumor: "rum_a", minConfidence: 10 }, ctxWith({ state: {} })), false);
  assert.strictEqual(evaluateCondition({ op: "rumor", fact: "fact_a" }, ctxWith({ state: {} })), false);
  assert.strictEqual(evaluateCondition({ op: "rumor", rumor: "missing" }, ctxWith({ state: rumorState })), false);
  assert.strictEqual(evaluateCondition({ op: "rumor" }, ctxWith({ state: rumorState })), false, "neither rumor nor fact given -> false");
}

// JSON round-trip for the new shorthand ops together in one composite tree
function testShorthandJsonRoundTrip() {
  const condition = {
    op: "and",
    of: [
      { op: "flag", key: "gate_open" },
      { op: "money", min: 10 },
      { op: "relation", from: "npc_1", to: "self", min: 0 },
      { op: "day", hourFrom: 20, hourTo: 4 }
    ]
  };
  const roundTripped = JSON.parse(JSON.stringify(condition));
  assert.deepStrictEqual(roundTripped, condition);

  const ctx = ctxWith({
    state: {
      flags: { gate_open: true },
      actors: { player_1: { money: 20 } },
      relations: { "npc_1:player_1": { score: 5 } },
      time: { minute: 1440 * 2 + 23 * 60 }
    }
  });
  assert.strictEqual(evaluateCondition(condition, ctx), evaluateCondition(roundTripped, ctx));
}

// V2-Core-15 (D-24 resolved): rumor composition, immutability, determinism,
// JSON round-trip -- reuses the same rumorState fixture shape as above.
function testRumorCompositionAndInvariants() {
  const rumorState = {
    knowledge: { player_1: { rum_a: { rumorId: "rum_a", factId: "fact_a", claim: "truth", confidence: 60 } } }
  };

  // composition: rumor selector and rumor shorthand op both inside and/or
  const composed = {
    op: "and",
    of: [
      { op: "rumor", rumor: "rum_a", minConfidence: 50 },
      { op: "eq", left: { rumor: "rum_a" }, right: "truth" }
    ]
  };
  assert.strictEqual(evaluateCondition(composed, ctxWith({ state: rumorState })), true);

  // JSON round-trip
  const roundTripped = JSON.parse(JSON.stringify(composed));
  assert.deepStrictEqual(roundTripped, composed);
  const ctx = ctxWith({ state: rumorState });
  assert.strictEqual(evaluateCondition(composed, ctx), evaluateCondition(roundTripped, ctx));

  // immutability: neither the condition tree nor ctx.state is mutated
  const frozenCondition = deepFreeze(structuredClone(composed));
  const frozenCtx = deepFreeze(ctxWith({ state: structuredClone(rumorState) }));
  const before = snapshot(frozenCtx.state);
  evaluateCondition(frozenCondition, frozenCtx);
  assert.deepStrictEqual(snapshot(frozenCtx.state), before);

  // determinism
  const results = new Set();
  for (let i = 0; i < 5; i += 1) results.add(evaluateCondition(composed, ctx));
  assert.strictEqual(results.size, 1);
}

// V2-Core-16 (D-56): validateData(data) -> string[]
//
// A comprehensive, well-formed fixture (abstract IDs only, §17 of
// DEVELOPMENT_RULES) exercising every position D-56 actually walks:
// actions/choices/locations/events requires+effects+outcomes, rules.succession,
// and growthSystems' skills/traits.requires, levelRewards, and proficiency
// thresholds.effects.
function validDataFixture() {
  return {
    id: "test_pack",
    world: { id: "test_world", growthSystemId: "growth_a", startTemplateId: "tmpl_a" },
    rules: { succession: [{ op: "relation", from: "target", to: "self", add: 1 }] },
    growthSystems: {
      growth_a: {
        stats: [{ id: "stat_a" }],
        skills: [{ id: "skill_a", requires: { op: "always" } }],
        traits: [{ id: "trait_a", requires: { op: "not", of: { op: "never" } } }],
        unlocks: [{ id: "unlock_a" }],
        proficiencies: [{ id: "prof_a", thresholds: [{ at: 10, effects: [{ op: "signal", key: "sig_a", add: 1 }] }] }],
        levelRewards: { 2: [{ op: "signal", key: "sig_b", add: 1 }] }
      }
    },
    characterTemplates: {
      tmpl_a: { kind: "player", locationId: "loc_a", hp: { max: 10 }, money: 0, inventory: {}, growth: {}, tags: [] }
    },
    locations: {
      loc_a: { requires: { op: "always" }, links: [{ to: "loc_b", requires: { op: "always" }, minutes: 10 }] },
      loc_b: {}
    },
    actions: {
      act_a: {
        requires: { op: "and", of: [{ op: "always" }, { op: "not", of: { op: "never" } }] },
        effects: [{ op: "money", add: 1 }, { op: "if", when: { op: "always" }, then: [{ op: "signal", key: "sig_c", add: 1 }] }]
      },
      act_checked: { check: { difficulty: 1 }, outcomes: { success: [{ op: "flag", key: "won", value: true }], fail: [{ op: "flag", key: "lost", value: true }] } }
    },
    choices: {
      choice_a: { options: [{ id: "opt_a", requires: { op: "always" }, effects: [{ op: "flag", key: "picked", value: true }] }] }
    },
    events: {
      event_a: { trigger: { op: "eq", left: { signal: "sig_a" }, right: 1 }, effects: [{ op: "signal", key: "sig_d", add: 1 }] }
    }
  };
}

// 1. normal: a comprehensive well-formed fixture has zero errors
function testValidateDataValid() {
  assert.deepStrictEqual(validateData(validDataFixture()), []);
  // minimal fixture (only the truly required top-level shape) also passes
  assert.deepStrictEqual(validateData({}), []);
  assert.deepStrictEqual(validateData({ id: "pack_a", world: { id: "world_a" } }), []);
}

// 2. malformed type: data itself, and nested fields, of the wrong type
function testValidateDataMalformedType() {
  [null, undefined, "data", 42, []].forEach((bad) => {
    assert.doesNotThrow(() => validateData(bad));
    assert.deepStrictEqual(validateData(bad), ["data must be a plain object"]);
  });
  // wrong-typed id -> format error, not a crash
  assert.doesNotThrow(() => validateData({ id: 5 }));
  assert.ok(validateData({ id: 5 }).some((e) => e.includes("data.id")));
}

// 3. ID format violations across every checked position
function testValidateDataIdFormat() {
  const data = validDataFixture();
  data.actions["Bad-Action"] = { effects: [] };
  data.locations["1loc"] = {};
  data.growthSystems.growth_a.skills.push({ id: "Bad:Skill" });
  const errors = validateData(data);
  assert.ok(errors.some((e) => e.includes("actions key") && e.includes("Bad-Action")));
  assert.ok(errors.some((e) => e.includes("locations key") && e.includes("1loc")));
  assert.ok(errors.some((e) => e.includes("skills[1].id") && e.includes("Bad:Skill")));
}

// 4. referential integrity: only the concretely-anchored cross-references (D-56 (2))
function testValidateDataReferentialIntegrity() {
  const badWorldRef = validDataFixture();
  badWorldRef.world.growthSystemId = "missing_system";
  assert.ok(validateData(badWorldRef).some((e) => e.includes("growthSystemId references unknown")));

  const badTemplateRef = validDataFixture();
  badTemplateRef.world.startTemplateId = "missing_template";
  assert.ok(validateData(badTemplateRef).some((e) => e.includes("startTemplateId references unknown")));

  const badLocationRef = validDataFixture();
  badLocationRef.characterTemplates.tmpl_a.locationId = "missing_loc";
  assert.ok(validateData(badLocationRef).some((e) => e.includes("locationId references unknown location")));

  const badLinkRef = validDataFixture();
  badLinkRef.locations.loc_a.links[0].to = "missing_loc";
  assert.ok(validateData(badLinkRef).some((e) => e.includes("links[0].to references unknown location")));

  // unknown reference: growthSystemId given but data.growthSystems absent entirely
  // -> not checked (nothing to cross-reference against), never throws
  const noGrowthCollection = validDataFixture();
  delete noGrowthCollection.growthSystems;
  assert.doesNotThrow(() => validateData(noGrowthCollection));
  assert.deepStrictEqual(
    validateData(noGrowthCollection).filter((e) => e.includes("growthSystemId")),
    []
  );
}

// 5. unknown Condition/Effect op names, and and/or/not/if's own fixed argument shape
function testValidateDataUnknownOpsAndStructure() {
  const unknownEffect = validDataFixture();
  unknownEffect.actions.act_a.effects.push({ op: "does_not_exist" });
  assert.ok(validateData(unknownEffect).some((e) => e.includes("unknown Effect op") && e.includes("does_not_exist")));

  const unknownCondition = validDataFixture();
  unknownCondition.actions.act_a.requires = { op: "does_not_exist" };
  assert.ok(validateData(unknownCondition).some((e) => e.includes("unknown Condition op") && e.includes("does_not_exist")));

  const badIfThen = validDataFixture();
  badIfThen.actions.act_a.effects.push({ op: "if", when: { op: "always" }, then: "not-an-array" });
  assert.ok(validateData(badIfThen).some((e) => e.includes("if Effect") && e.includes("then must be an array")));

  const badAndOf = validDataFixture();
  badAndOf.actions.act_a.requires = { op: "and", of: "not-an-array" };
  assert.ok(validateData(badAndOf).some((e) => e.includes("and Condition") && e.includes("must be an array")));

  const badNotOf = validDataFixture();
  badNotOf.actions.act_a.requires = { op: "not", of: [{ op: "always" }] };
  assert.ok(validateData(badNotOf).some((e) => e.includes("not Condition") && e.includes("single Condition")));

  // nested if.then is still walked recursively
  const nestedUnknown = validDataFixture();
  nestedUnknown.actions.act_a.effects.push({ op: "if", when: { op: "always" }, then: [{ op: "still_bogus" }] });
  assert.ok(validateData(nestedUnknown).some((e) => e.includes("unknown Effect op") && e.includes("still_bogus")));
}

// 6. handler: missing reason, and always-unregistered (no handlers.js registry, D-04)
function testValidateDataHandler() {
  const data = validDataFixture();
  data.actions.act_a.effects.push({ op: "handler", name: "x.y", params: {} });
  const errors = validateData(data);
  assert.ok(errors.some((e) => e.includes("missing a string \"reason\"")));
  assert.ok(errors.some((e) => e.includes("unregistered name") && e.includes("x.y")));

  const withReason = validDataFixture();
  withReason.actions.act_a.effects.push({ op: "handler", name: "x.y", params: {}, reason: "no declarative op covers this" });
  const errorsWithReason = validateData(withReason);
  assert.ok(!errorsWithReason.some((e) => e.includes("missing a string")), "a present reason must not be flagged");
  assert.ok(errorsWithReason.some((e) => e.includes("unregistered name")), "still unregistered -- no handlers.js exists");

  // handler op inside a Condition position follows the same two checks
  const conditionHandler = validDataFixture();
  conditionHandler.actions.act_a.requires = { op: "handler", name: "x.y", params: {} };
  assert.ok(validateData(conditionHandler).some((e) => e.includes("missing a string \"reason\"")));
}

// 7. player-context fact ban (§3.3/D-06) -- exactly the 4 player positions,
// and NOT the world positions (trigger, if.when, skill/trait.requires)
function testValidateDataPlayerContextFact() {
  const positions = [
    (d) => { d.actions.act_a.requires = { op: "fact", fact: "secret", eq: "x" }; },
    (d) => { d.choices.choice_a.options[0].requires = { op: "fact", fact: "secret", eq: "x" }; },
    (d) => { d.locations.loc_a.requires = { op: "fact", fact: "secret", eq: "x" }; },
    (d) => { d.locations.loc_a.links[0].requires = { op: "fact", fact: "secret", eq: "x" }; }
  ];
  positions.forEach((mutate) => {
    const data = validDataFixture();
    mutate(data);
    assert.ok(validateData(data).some((e) => e.includes("fact") && e.includes("player")), "player-context fact must be flagged");
  });

  // the selector form (`{fact:...}` inside eq/neq/etc.) is caught too
  const selectorLeak = validDataFixture();
  selectorLeak.actions.act_a.requires = { op: "eq", left: { fact: "secret" }, right: "x" };
  assert.ok(validateData(selectorLeak).some((e) => e.includes("fact selector") && e.includes("player")));

  // world-context positions must NOT be flagged: trigger, if.when, skill/trait.requires
  const worldOk = validDataFixture();
  worldOk.events.event_a.trigger = { op: "fact", fact: "secret", eq: "x" };
  assert.deepStrictEqual(validateData(worldOk).filter((e) => e.includes("fact")), []);

  const ifWhenOk = validDataFixture();
  ifWhenOk.actions.act_a.effects.push({ op: "if", when: { op: "fact", fact: "secret", eq: "x" }, then: [] });
  assert.deepStrictEqual(validateData(ifWhenOk).filter((e) => e.includes("fact")), [], "if.when is always world context, even inside a player-triggered action");

  const skillRequiresOk = validDataFixture();
  skillRequiresOk.growthSystems.growth_a.skills[0].requires = { op: "fact", fact: "secret", eq: "x" };
  assert.deepStrictEqual(validateData(skillRequiresOk).filter((e) => e.includes("fact")), []);
}

// 8. Resolvable success/fail requirement (§2.3) -- only when `check` is present
function testValidateDataResolvableSuccessFail() {
  const missingFail = validDataFixture();
  delete missingFail.actions.act_checked.outcomes.fail;
  assert.ok(validateData(missingFail).some((e) => e.includes("outcomes.success/outcomes.fail")));

  const missingOutcomesEntirely = validDataFixture();
  delete missingOutcomesEntirely.actions.act_checked.outcomes;
  assert.ok(validateData(missingOutcomesEntirely).some((e) => e.includes("outcomes.success/outcomes.fail")));

  // missing great/partial is NOT an error -- §2.3's own fallback covers those
  const missingGreatPartial = validDataFixture();
  assert.deepStrictEqual(validateData(missingGreatPartial), [], "sanity: fixture has no great/partial and is still valid");

  // no `check` at all -> outcomes is irrelevant, never required
  const noCheck = validDataFixture();
  delete noCheck.actions.act_checked.check;
  assert.doesNotThrow(() => validateData(noCheck));
}

// 9. immutability: validateData never mutates its input, even a broken one
function testValidateDataImmutability() {
  const data = deepFreeze(validDataFixture());
  const before = snapshot(data);
  validateData(data);
  assert.deepStrictEqual(snapshot(data), before);
}

// 10. determinism and JSON round-trip
function testValidateDataDeterminismAndRoundTrip() {
  const data = validDataFixture();
  const results = new Set();
  for (let i = 0; i < 5; i += 1) results.add(JSON.stringify(validateData(data)));
  assert.strictEqual(results.size, 1);

  const roundTripped = JSON.parse(JSON.stringify(data));
  assert.deepStrictEqual(validateData(roundTripped), validateData(data));

  // the returned error list itself is plain strings -> trivially JSON-safe
  const withError = validDataFixture();
  withError.actions["Bad-Id"] = { effects: [] };
  const errors = validateData(withError);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(errors)), errors);
}

testAlwaysNever();
testNot();
testAndOr();
testShortCircuit();
testComparisons();
testSelectors();
testUnresolvedComparisonsAreFalse();
testMalformedCondition();
testInputImmutability();
testDeterminism();
testJsonRoundTrip();
testNoForbiddenHostApis();
testShorthandStatSkillTraitUnlock();
testShorthandFlagSignalItemMoney();
testShorthandRelation();
testShorthandFactDayLocationCase();
testShorthandJsonRoundTrip();
testRumorCompositionAndInvariants();
testValidateDataValid();
testValidateDataMalformedType();
testValidateDataIdFormat();
testValidateDataReferentialIntegrity();
testValidateDataUnknownOpsAndStructure();
testValidateDataHandler();
testValidateDataPlayerContextFact();
testValidateDataResolvableSuccessFail();
testValidateDataImmutability();
testValidateDataDeterminismAndRoundTrip();

console.log("V2-Core-02 rules.test.js: all checks passed");
