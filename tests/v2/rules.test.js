// V2-Core-02 tests for the Condition evaluator
// (docs/v2/architecture/CORE_CONTRACTS.md §3, §3.2a).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCondition } from "../../web/v2/core/rules.js";
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

console.log("V2-Core-02 rules.test.js: all checks passed");
