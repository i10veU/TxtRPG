// V2-Core-43 (Issue #118, D-76): `data.facts[*].initial` seeding (§8.1) with the world-generation
// stream of §2.7. The human decision (#117): the seed input is C1, the stored `state.worldSeed`
// string -- `deriveSeed(state.worldSeed, "fact:" + id)` -- with a documented way to C2
// (`state.rng.seed`). What the contract already fixed: seeded in createInitialState, label
// `fact:<id>`, local cursor 0, `since` = creation minute, facts never in view. What D-76 adds: the
// pick is `nextUint32({ seed, cursor: 0 }).value % pickFrom.length` (rollDie's pattern), a fixed
// `initial` is copied as is, no creation events (createInitialState emits none), sorted keys, and
// the validator reports a `pickFrom` that cannot be used.
//
// The C1 tests below fail if the seed input is switched to C2: that switch is an intended change
// (D-76 "C2로 가는 경로") and must update them together with the golden fixture.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1); abstract-ID synthetic fixture (DEVELOPMENT_RULES §17).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { deriveSeed, hashString, nextUint32 } from "../../web/v2/core/rng.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const OPTIONS = ["opt_a", "opt_b", "opt_c", "opt_d", "opt_e"];

function fixture(facts) {
  return {
    formatVersion: 1,
    id: "facts_pack",
    version: "1.0.0",
    world: { id: "facts_world", growthSystemId: "growth_a", startTemplateId: "tmpl_start" },
    rules: { check: {}, succession: [] },
    characterTemplates: { tmpl_start: { kind: "player", locationId: "loc_a", hp: { max: 5 }, money: 0, inventory: {}, growth: {}, tags: [] } },
    locations: { loc_a: { links: [] } },
    actions: {
      act_try: { check: { difficulty: 10 }, outcomes: { success: [{ op: "flag", key: "won", value: true }], fail: [] } },
      act_wait: { effects: [] }
    },
    facts
  };
}
const start = (data, worldSeed) => createInitialState({ worldSeed, data });
// the pick a seed input gives, computed from the §2.7 primitives directly
const pickWith = (seedInput, factId, options = OPTIONS) => options[nextUint32({ seed: deriveSeed(seedInput, "fact:" + factId), cursor: 0 }).value % options.length];

// 1. fixed and pickFrom values are seeded once at creation: `since` 0, no events, sorted keys, the
// gameplay rng untouched; facts without `initial` stay lazy
function testSeeding() {
  const data = fixture({
    f_pick: { initial: { pickFrom: OPTIONS } },
    f_fixed: { initial: "x" },
    f_object: { initial: { note: 1 } }, // an object without `pickFrom` is a fixed value
    f_null: { initial: null },
    f_lazy: {},
    f_undefined: { initial: undefined }
  });
  assert.deepStrictEqual(validateData(data), []);
  const { state, events } = start(data, "seed-1");
  assert.deepStrictEqual(events, []);
  assert.deepStrictEqual(state.facts, {
    f_fixed: { value: "x", since: 0 },
    f_null: { value: null, since: 0 },
    f_object: { value: { note: 1 }, since: 0 },
    f_pick: { value: pickWith("seed-1", "f_pick"), since: 0 }
  });
  assert.deepStrictEqual(Object.keys(state.facts), ["f_fixed", "f_null", "f_object", "f_pick"]);
  assert.deepStrictEqual(state.rng, { seed: hashString("seed-1"), cursor: 0 }, "world generation never touches the gameplay stream");
  assert.deepStrictEqual(validateState(state), []);
  assert.deepStrictEqual(start(data, "seed-1"), { state, events }, "deterministic");

  // world context reads it; a player-context view never shows facts (§8.4)
  const ctx = { state, data, contextKind: "world" };
  assert.strictEqual(evaluateCondition({ op: "fact", fact: "f_fixed", eq: "x" }, ctx), true);
  assert.strictEqual(evaluateCondition({ op: "fact", fact: "f_pick", eq: pickWith("seed-1", "f_pick") }, ctx), true);
  assert.ok(!JSON.stringify(view(state, data)).includes("f_pick"));

  // the seeded value is the world's from then on: a fact Effect replaces it; a save keeps it
  const set = { ...data, actions: { ...data.actions, act_set: { effects: [{ op: "fact", fact: "f_fixed", set: "y" }] } } };
  const changed = step(state, { type: "perform", actionId: "act_set" }, set);
  assert.deepStrictEqual(changed.state.facts.f_fixed, { value: "y", since: 0 });
  assert.deepStrictEqual(changed.events.find((e) => e.type === "fact.changed")?.visibility, "internal");
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_facts", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);

  // no `facts`, or none with an `initial`: no `facts` key at all (states are as before)
  assert.strictEqual(start(fixture({ f_lazy: {} }), "seed-1").state.facts, undefined);
  assert.strictEqual(start(fixture(undefined), "seed-1").state.facts, undefined);
  assert.strictEqual(createInitialState({ worldSeed: "seed-1" }).state.facts, undefined);
}

// 2. C1: the input is the stored `worldSeed` string, not `rng.seed` (C2) -- pinned on seeds where
// the two give different picks, so switching the input fails here on purpose
function testSeedInputIsC1() {
  const data = fixture({ f_pick: { initial: { pickFrom: OPTIONS } } });
  let differing = 0;
  for (let i = 0; i < 40; i += 1) {
    const { state } = start(data, `c1-${i}`);
    const c1 = pickWith(state.worldSeed, "f_pick");
    const c2 = pickWith(state.rng.seed, "f_pick");
    assert.strictEqual(state.facts.f_pick.value, c1, `c1-${i}`);
    if (c1 !== c2) differing += 1;
  }
  assert.ok(differing >= 10, "the seeds tell C1 and C2 apart");
  // numbers are stored as strings (createInitialState) -- the input is that string
  assert.strictEqual(start(data, 7).state.facts.f_pick.value, pickWith("7", "f_pick"));
}

// 3. §13.2 "seed 차이": a different seed gives a different pickFrom result (pinned by fixture)
function testSeedDifference() {
  const data = fixture({ f_pick: { initial: { pickFrom: OPTIONS } } });
  const values = new Set(Array.from({ length: 20 }, (_, i) => start(data, `diff-${i}`).state.facts.f_pick.value));
  assert.ok(values.size >= 3, "the pick follows the seed: " + [...values].join(","));
  const [a, b] = ["diff-0", "diff-1"].map((seed) => start(data, seed).state.facts.f_pick.value);
  assert.deepStrictEqual([a, b], [pickWith("diff-0", "f_pick"), pickWith("diff-1", "f_pick")]);
  assert.notStrictEqual(a, b, "two fixed seeds with different picks");
}

// 4. §13.2 "파생 스트림 격리": adding a fact changes neither an existing fact's initial value nor the
// first check result (each label is its own stream; world generation never consumes `state.rng`)
function testStreamIsolation() {
  const base = fixture({ f_pick: { initial: { pickFrom: OPTIONS } } });
  const more = fixture({ f_pick: { initial: { pickFrom: OPTIONS } }, f_aaa: { initial: { pickFrom: OPTIONS } }, f_zzz: { initial: { pickFrom: ["z1", "z2"] } } });
  for (let i = 0; i < 10; i += 1) {
    const seed = `iso-${i}`;
    const [s1, s2] = [start(base, seed).state, start(more, seed).state];
    assert.strictEqual(s2.facts.f_pick.value, s1.facts.f_pick.value, seed);
    assert.deepStrictEqual(s2.rng, s1.rng, seed);
    const firstCheck = (state, data) => step(state, { type: "perform", actionId: "act_try" }, data).events.find((e) => e.type === "check.resolved").data;
    assert.deepStrictEqual(firstCheck(s2, more), firstCheck(s1, base), seed);
  }
}

// 5. the validator reports a pickFrom that cannot be used; any other value is a fixed value
function testValidator() {
  const errorsFor = (initial) => validateData(fixture({ f_bad: { initial } }));
  assert.deepStrictEqual(errorsFor({ pickFrom: [] }), ["facts.f_bad.initial.pickFrom must be a non-empty array (§8.1)"]);
  assert.deepStrictEqual(errorsFor({ pickFrom: "ab" }), ["facts.f_bad.initial.pickFrom must be a non-empty array (§8.1)"]);
  assert.deepStrictEqual(errorsFor({ pickFrom: ["a"], note: 1 }), ["facts.f_bad.initial must have no other key next to pickFrom (§8.1)"]);
  for (const initial of ["x", 0, null, true, ["a"], { note: 1 }, { pickFrom: ["a"] }, undefined]) {
    assert.deepStrictEqual(errorsFor(initial), [], JSON.stringify(initial));
  }
  assert.deepStrictEqual(validateData(fixture({ f_bad: "x" })), [], "a non-object fact definition seeds nothing and is not reported (as before)");
  assert.strictEqual(start(fixture({ f_bad: { initial: { pickFrom: [] } } }), "seed-1").state.facts, undefined, "an unusable pickFrom seeds nothing");
}

// 6. the real pack: its documented `initial` is now the world's starting value. No Condition reads
// it and the investigation sets the fact as before, so play is unchanged -- and a save made before
// D-76 (no `facts`) still loads (same pack id/version, D-68) and plays the same
function testRealPack() {
  assert.deepStrictEqual(validateData(worldData), []);
  const { state } = start(worldData, "frontier-canonical-4");
  assert.deepStrictEqual(state.facts, { fact_ruins_secret: { value: "unknown", since: 0 } });

  const oldSave = structuredClone(state);
  delete oldSave.facts;
  assert.deepStrictEqual(checkDataCompatibility(oldSave, worldData), []);
  assert.deepStrictEqual(validateState(oldSave), []);
  const withoutSeeded = (s) => {
    const copy = structuredClone(s);
    if (copy.facts?.fact_ruins_secret?.value === "unknown") delete copy.facts.fact_ruins_secret;
    if (copy.facts && Object.keys(copy.facts).length === 0) delete copy.facts;
    return copy;
  };
  for (const actionId of Object.keys(worldData.actions)) {
    const [seeded, old] = [state, oldSave].map((s) => step(s, { type: "perform", actionId }, worldData));
    assert.deepStrictEqual(old.events, seeded.events, actionId);
    assert.deepStrictEqual(old.state, withoutSeeded(seeded.state), actionId);
  }
}

testSeeding();
testSeedInputIsC1();
testSeedDifference();
testStreamIsolation();
testValidator();
testRealPack();

console.log("V2-Core-43 facts-initial.test.js: all checks passed");
