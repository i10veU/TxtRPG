// V2-Core-56 (Issue #145, Gate 4 = C, D-85): resources belong to a growth system.
//   data:  growthSystems[X].resources = [{ id, max }]       (any id -- nothing is stamina-specific)
//   state: actors[id].growth[X].resources[rid] = { current, max }
//   a missing entry is full: { current: definition.max, max: definition.max } (old saves, D-68)
//   Condition {op:"resource", resource, min?/max?/eq?, subject?, system?} reads `current`
//     (bare = at least 1, like `skill`); never throws; no definition and no entry -> false
//   Effect {op:"resource", resource, add, subject?, system?} clamps `current` to [0, max] and
//     emits `resource.changed` {resource, delta} (visibility by subject, D-31); delta 0 changes
//     nothing (D-30: no event, and a missing entry stays missing); no definition and no entry ->
//     skip (D-29); malformed -> throw (D-28)
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1). Abstract fixtures, not world content.

import assert from "node:assert/strict";
import { actorResource, applyEffects, evaluateCondition, validateData } from "../../web/v2/core/rules.js";

const DATA = {
  world: { growthSystemId: "growth_a" },
  growthSystems: {
    growth_a: { id: "growth_a", resources: [{ id: "res_a", max: 6 }, { id: "res_b", max: 3 }] },
    growth_b: { id: "growth_b", resources: [{ id: "res_a", max: 10 }] }
  }
};
const actor = (id, resources, extra = {}) => ({
  id, hp: { current: 5, max: 5 }, money: 0, inventory: {},
  growth: resources === undefined ? {} : { growth_a: { resources } }, ...extra
});
const stateOf = (actors) => ({
  schemaVersion: 1, worldSeed: "resource", rng: { seed: 1, cursor: 0 }, time: { minute: 7 },
  player: { actorId: "player_1" }, actors: Object.fromEntries(actors.map((a) => [a.id, a]))
});
const ctx = (state, data = DATA) => ({ state, data, actorId: "player_1", contextKind: "player" });
const cond = (state, condition, data) => evaluateCondition({ op: "resource", ...condition }, ctx(state, data));
const apply = (state, effect, data = DATA) => applyEffects([{ op: "resource", ...effect }], ctx(state, data));

// 1. the resolver: the entry, or the definition's max when the entry is missing
function testResolver() {
  assert.deepStrictEqual(actorResource(actor("player_1", { res_a: { current: 2, max: 6 } }), DATA, "res_a"), { current: 2, max: 6 });
  assert.deepStrictEqual(actorResource(actor("player_1", undefined), DATA, "res_a"), { current: 6, max: 6 }, "missing = full");
  assert.deepStrictEqual(actorResource(actor("player_1", {}), DATA, "res_b"), { current: 3, max: 3 });
  assert.deepStrictEqual(actorResource(actor("player_1", undefined), DATA, "res_a", "growth_b"), { current: 10, max: 10 }, "per system");
  assert.strictEqual(actorResource(actor("player_1", undefined), DATA, "res_none"), undefined, "no definition, no entry");
  assert.deepStrictEqual(actorResource(actor("player_1", { res_none: { current: 1, max: 2 } }), DATA, "res_none"), { current: 1, max: 2 }, "an entry stands on its own");
  assert.strictEqual(actorResource(undefined, DATA, "res_a"), undefined);
  assert.strictEqual(actorResource(actor("player_1", { res_a: { current: "x", max: 6 } }), DATA, "res_a"), undefined, "a broken entry is not read");
  assert.strictEqual(actorResource(actor("player_1", { res_a: 4 }), DATA, "res_a"), undefined);
}

// 2. the Condition
function testCondition() {
  const s = stateOf([actor("player_1", { res_a: { current: 2, max: 6 } }), actor("npc_1", undefined)]);
  assert.strictEqual(cond(s, { resource: "res_a", min: 2 }), true);
  assert.strictEqual(cond(s, { resource: "res_a", min: 3 }), false);
  assert.strictEqual(cond(s, { resource: "res_a", max: 2 }), true);
  assert.strictEqual(cond(s, { resource: "res_a", eq: 2 }), true);
  assert.strictEqual(cond(s, { resource: "res_a" }), true, "bare: at least 1");
  assert.strictEqual(cond(stateOf([actor("player_1", { res_a: { current: 0, max: 6 } })]), { resource: "res_a" }), false);
  assert.strictEqual(cond(s, { resource: "res_b", min: 3 }), true, "missing = full (3)");
  assert.strictEqual(cond(s, { resource: "res_a", min: 6, subject: "npc_1" }), true, "subject; missing = full");
  assert.strictEqual(cond(s, { resource: "res_a", min: 10, system: "growth_b" }), true, "system");
  assert.strictEqual(cond(s, { resource: "res_none", max: 100 }), false, "no definition, no entry");
  assert.strictEqual(cond(s, { resource: "res_a", subject: "npc_nobody" }), false, "no actor");
  assert.strictEqual(cond(s, { resource: 7 }), false, "malformed: false, never a throw");
  assert.strictEqual(cond(s, { resource: "res_a", min: "2" }), false);
  // allowed in world context too (actor state, not a Fact)
  assert.strictEqual(evaluateCondition({ op: "resource", resource: "res_a", min: 2 }, { ...ctx(s), contextKind: "world" }), true);
}

// 3. the Effect
function testEffect() {
  const fresh = stateOf([actor("player_1", undefined), actor("npc_1", undefined)]);
  const spent = apply(fresh, { resource: "res_a", add: -2 });
  assert.deepStrictEqual(spent.state.actors.player_1.growth.growth_a.resources, { res_a: { current: 4, max: 6 } }, "materialized from full");
  assert.deepStrictEqual(spent.events, [{ minute: 7, type: "resource.changed", visibility: "player", actorId: "player_1", data: { resource: "res_a", delta: -2 } }]);
  assert.strictEqual(fresh.actors.player_1.growth.growth_a, undefined, "input untouched");

  const floor = apply(spent.state, { resource: "res_a", add: -9 });
  assert.deepStrictEqual(floor.state.actors.player_1.growth.growth_a.resources.res_a, { current: 0, max: 6 });
  assert.strictEqual(floor.events[0].data.delta, -4, "the actual change");
  const refill = apply(floor.state, { resource: "res_a", add: 6 });
  assert.deepStrictEqual(refill.state.actors.player_1.growth.growth_a.resources.res_a, { current: 6, max: 6 });
  const over = apply(spent.state, { resource: "res_a", add: 100 });
  assert.deepStrictEqual(over.state.actors.player_1.growth.growth_a.resources.res_a, { current: 6, max: 6 }, "clamped to max");

  // delta 0: no event, no change -- a missing (full) entry stays missing
  const noop = apply(fresh, { resource: "res_a", add: 3 });
  assert.deepStrictEqual(noop.state, fresh);
  assert.deepStrictEqual(noop.events, []);
  const zero = apply(fresh, { resource: "res_a", add: 0 });
  assert.deepStrictEqual([zero.state, zero.events], [fresh, []]);

  // the entry's own max governs (it is the actor's), the definition only fills a missing one
  const own = stateOf([actor("player_1", { res_a: { current: 1, max: 2 } })]);
  assert.deepStrictEqual(apply(own, { resource: "res_a", add: 5 }).state.actors.player_1.growth.growth_a.resources.res_a, { current: 2, max: 2 });

  // subject: the visibility follows it (D-31); system
  const npc = apply(fresh, { resource: "res_a", add: -1, subject: "npc_1" });
  assert.deepStrictEqual(npc.events.map((e) => [e.actorId, e.visibility]), [["npc_1", "internal"]]);
  const other = apply(fresh, { resource: "res_a", add: -1, system: "growth_b" });
  assert.deepStrictEqual(other.state.actors.player_1.growth.growth_b.resources.res_a, { current: 9, max: 10 });

  // D-29: skip what cannot be resolved
  for (const effect of [{ resource: "res_none", add: -1 }, { resource: "res_a", add: -1, subject: "npc_nobody" }, { resource: "res_a", add: -1, system: "growth_none" }]) {
    const r = apply(fresh, effect);
    assert.deepStrictEqual([r.state, r.events], [fresh, []], JSON.stringify(effect));
  }
  // D-28: malformed throws
  for (const effect of [{ add: -1 }, { resource: "res_a" }, { resource: "res_a", add: 1.5 }, { resource: "res_a", add: -1, subject: 3 }, { resource: "res_a", add: -1, system: 3 }]) {
    assert.throws(() => apply(fresh, effect), TypeError, JSON.stringify(effect));
  }
  // a broken entry in state throws (like a broken hp record), it is not silently replaced
  assert.throws(() => apply(stateOf([actor("player_1", { res_a: { current: "x", max: 6 } })]), { resource: "res_a", add: -1 }), TypeError);
}

// 4. the validator
function testValidator() {
  const pack = (extra) => ({
    formatVersion: 1, id: "pack_a", version: "1.0.0",
    world: { id: "world_a", growthSystemId: "growth_a", startTemplateId: "tmpl_a" },
    growthSystems: { growth_a: { id: "growth_a", resources: [{ id: "res_a", max: 6 }] } },
    characterTemplates: { tmpl_a: { kind: "player", locationId: "loc_a", hp: { max: 5 }, growth: {} } },
    locations: { loc_a: { links: [] } },
    ...extra
  });
  const withAction = (requires, effects) => pack({ actions: { act_a: { requires, effects } } });
  assert.deepStrictEqual(validateData(pack()), []);
  assert.deepStrictEqual(validateData(withAction({ op: "resource", resource: "res_a", min: 1 }, [{ op: "resource", resource: "res_a", add: -1 }])), []);
  assert.ok(validateData(withAction({ op: "resource", min: 1 }, [])).some((e) => /resource Condition .* requires a string `resource`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "resource", add: -1 }])).some((e) => /resource Effect .* requires a string `resource`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "resource", resource: "res_a" }])).some((e) => /resource Effect .* requires an integer `add`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "resource", resource: "res_a", add: -1, subject: 1 }])).some((e) => /`subject`/.test(e)));
  assert.ok(validateData(withAction(undefined, [{ op: "resource", resource: "res_a", add: -1, system: 1 }])).some((e) => /`system`/.test(e)));
  const badDef = (def) => validateData(pack({ growthSystems: { growth_a: { id: "growth_a", resources: [def] } } }));
  assert.ok(badDef({ id: "Res_A", max: 6 }).some((e) => /invalid id format at growthSystems\.growth_a\.resources\[0\]\.id/.test(e)));
  for (const max of [0, -1, 1.5, "6", undefined]) {
    assert.ok(badDef({ id: "res_a", max }).some((e) => /growthSystems\.growth_a\.resources\[0\]\.max must be a positive integer/.test(e)), String(max));
  }
}

testResolver();
testCondition();
testEffect();
testValidator();

console.log("V2-Core-56 resource.test.js: all checks passed");
