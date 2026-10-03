// V2-Core-49 (Issue #131, Gate 3 = C, D-78): HP and life are observable by Conditions.
//   - `hp` selector (§3.2a): {"hp": "current" | "max", "subject"?} -- the subject actor's hp field;
//     no actor or another field resolves to undefined, so a comparison is false (D-25)
//   - `alive` Condition (§3.2): {"op": "alive", "subject"?} -- true only for an existing actor
//     whose `alive` is true; death is `not alive`
// Both read actor state (not a Fact), so both are allowed in player and world context (§8.4 is about
// Facts), like the `stat`/`money` selectors.
// Also fixed here (the contract is unchanged): a selector may carry the optional arguments its own
// §3.2a row lists (`subject`, `system`) -- until now any second key made it resolve to undefined.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const SYSTEM = "g";
const state = {
  actors: {
    hero: { id: "hero", alive: true, hp: { current: 7, max: 10 }, money: 5, growth: { g: { stats: { wit: 9 } } } },
    foe: { id: "foe", alive: true, hp: { current: 3, max: 12 }, money: 2, growth: { g: { stats: { wit: 11 } } } },
    fallen: { id: "fallen", alive: false, hp: { current: 0, max: 8 }, money: 0 }
  },
  knowledge: { foe: { rum_x: { claim: "c", confidence: 50 } } }
};
const ctxOf = (contextKind) => ({ state, data: { world: { growthSystemId: SYSTEM } }, actorId: "hero", contextKind });
const holds = (condition, contextKind = "player") => evaluateCondition(condition, ctxOf(contextKind));
const eq = (left, right) => ({ op: "eq", left, right });

// 1. the hp selector
function testHpSelector() {
  for (const kind of ["player", "world"]) {
    assert.ok(holds(eq({ hp: "current" }, 7), kind), "self current");
    assert.ok(holds(eq({ hp: "max" }, 10), kind), "self max");
    assert.ok(holds(eq({ hp: "current", subject: "foe" }, 3), kind), "another actor's current");
    assert.ok(holds(eq({ hp: "max", subject: "foe" }, 12), kind));
    assert.ok(holds(eq({ hp: "current", subject: "fallen" }, 0), kind), "a dead actor's current is 0");
    assert.ok(holds({ op: "lte", left: { hp: "current", subject: "foe" }, right: 3 }, kind), "a threshold");
    assert.ok(!holds({ op: "lte", left: { hp: "current", subject: "foe" }, right: 2 }, kind));
    assert.ok(holds({ op: "lt", left: { hp: "current", subject: "foe" }, right: { hp: "current" } }, kind), "selector against selector");
  }
  // unresolvable -> undefined -> every comparison is false (D-25)
  assert.ok(!holds(eq({ hp: "current", subject: "nobody" }, 0)));
  assert.ok(!holds({ op: "neq", left: { hp: "current", subject: "nobody" }, right: 0 }));
  assert.ok(!holds(eq({ hp: "temp" }, 7)), "only current/max");
  assert.ok(!holds(eq({ hp: true }, 7)));
  assert.ok(!holds({ op: "neq", left: { hp: "constructor" }, right: 0 }), "not an inherited property either");
  assert.ok(!holds(eq({ hp: "current", subject: "foe", extra: 1 }, 3)), "an argument the selector does not take");
}

// 2. the alive Condition
function testAliveCondition() {
  for (const kind of ["player", "world"]) {
    assert.strictEqual(holds({ op: "alive" }, kind), true, "self");
    assert.strictEqual(holds({ op: "alive", subject: "foe" }, kind), true);
    assert.strictEqual(holds({ op: "alive", subject: "fallen" }, kind), false, "dead");
    assert.strictEqual(holds({ op: "alive", subject: "nobody" }, kind), false, "no such actor");
    assert.strictEqual(holds({ op: "not", of: { op: "alive", subject: "fallen" } }, kind), true, "death is not alive");
  }
  const noActors = { state: {}, data: {}, actorId: "hero", contextKind: "player" };
  assert.strictEqual(evaluateCondition({ op: "alive" }, noActors), false);
  assert.strictEqual(evaluateCondition({ op: "alive", subject: "target" }, ctxOf("player")), false, "no target");
  assert.strictEqual(evaluateCondition({ op: "alive", subject: "target" }, { ...ctxOf("player"), targetId: "foe" }), true);
}

// 3. the selector fix: the optional arguments of §3.2a's table are taken; anything else still
// makes the selector unresolvable
function testSelectorArguments() {
  assert.ok(holds(eq({ money: true, subject: "foe" }, 2)));
  assert.ok(holds(eq({ stat: "wit", subject: "foe" }, 11)));
  assert.ok(holds(eq({ stat: "wit", subject: "foe", system: SYSTEM }, 11)));
  assert.ok(holds(eq({ stat: "wit", system: SYSTEM }, 9)));
  assert.ok(holds(eq({ rumor: "rum_x", subject: "foe" }, "c")));
  assert.ok(!holds(eq({ money: true, system: SYSTEM }, 5)), "money takes no system");
  assert.ok(!holds(eq({ money: true, foo: 1 }, 5)));
  assert.ok(!holds({ op: "eq", left: { flag: "f", subject: "foe" }, right: null }), "flag takes no subject");
  assert.ok(!holds(eq({ money: true, stat: "wit" }, 5)), "two selector keys");
  assert.ok(holds(eq({ money: true }, 5)), "the one-key forms are unchanged");
}

// 4. in play (the real pack plus a probe action): an NPC's death is read in world context (`if`)
// and in player context (`requires`)
function testInPlay() {
  const probe = structuredClone(worldData);
  probe.actions.act_probe_strike = {
    name: "probe",
    requires: { op: "alive", subject: "npc_bandit_leader" },
    effects: [
      { op: "hp", subject: "npc_bandit_leader", add: -4 },
      { op: "if", when: { op: "lte", left: { hp: "current", subject: "npc_bandit_leader" }, right: 6 }, then: [{ op: "flag", key: "probe_wounded", value: true }] },
      { op: "if", when: { op: "not", of: { op: "alive", subject: "npc_bandit_leader" } }, then: [{ op: "flag", key: "probe_down", value: true }] }
    ]
  };
  assert.deepStrictEqual(validateData(probe), []);
  let s = createInitialState({ worldSeed: "hp-alive", data: probe }).state;
  const strike = () => {
    const result = step(s, { type: "perform", actionId: "act_probe_strike" }, probe);
    s = result.state;
    return result.events.find((e) => e.type === "action.rejected")?.data.code;
  };
  assert.strictEqual(strike(), undefined);
  assert.deepStrictEqual([s.actors.npc_bandit_leader.hp.current, s.flags.probe_wounded, s.flags.probe_down], [6, true, undefined]);
  assert.strictEqual(strike(), undefined);
  assert.strictEqual(strike(), undefined); // 10 - 12, clamped to 0: dead
  assert.deepStrictEqual([s.actors.npc_bandit_leader.alive, s.flags.probe_down], [false, true]);
  assert.strictEqual(strike(), "requirements_not_met", "a dead leader cannot be struck again");
}

// 5. the validator
function testValidator() {
  assert.deepStrictEqual(validateData(worldData), []);
  const withRequires = (requires) => {
    const pack = structuredClone(worldData);
    pack.actions.act_probe = { name: "probe", requires, effects: [] };
    return validateData(pack);
  };
  assert.deepStrictEqual(withRequires({ op: "alive" }), []);
  assert.deepStrictEqual(withRequires({ op: "alive", subject: "npc_bandit_leader" }), []);
  assert.deepStrictEqual(withRequires(eq({ hp: "current", subject: "npc_bandit_leader" }, 0)), []);
  assert.deepStrictEqual(withRequires({ op: "gte", left: 1, right: { hp: "max" } }), []);
  assert.strictEqual(withRequires(eq({ hp: "temp" }, 0)).length, 1);
  assert.strictEqual(withRequires({ op: "lt", left: { hp: "max" }, right: { hp: 3 } }).length, 1);
  // world context too (an `if.when`)
  const pack = structuredClone(worldData);
  pack.actions.act_probe = { name: "probe", effects: [{ op: "if", when: eq({ hp: "now" }, 0), then: [] }] };
  assert.strictEqual(validateData(pack).length, 1);
}

testHpSelector();
testAliveCondition();
testSelectorArguments();
testInPlay();
testValidator();

console.log("V2-Core-49 hp-alive.test.js: all checks passed");
