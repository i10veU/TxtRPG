// V2-Core-57 (Issue #148, #147 Phase A: T1 = A, T2 = R2, D-86): a talent is a trait whose
// definition carries `practice: { <proficiency id>: <integer bonus> }`. Wherever practice is gained
// (the `proficiency` Effect, the one place it grows), each trait the subject holds in that growth
// system adds its listed bonus to the gain: +5 with a +2 talent is +7. Only on a gain (add > 0);
// only for the proficiency ids it lists; never a multiplier; thresholds see the total (practice ->
// threshold -> skill rank is unchanged). `modifiers` (check bonus) and `practice` (growth bonus) are
// separate: a talent is no check modifier.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1). Abstract fixtures, not world content.

import assert from "node:assert/strict";
import { applyEffects, check, validateData } from "../../web/v2/core/rules.js";

const DATA = {
  world: { growthSystemId: "growth_a" },
  growthSystems: {
    growth_a: {
      id: "growth_a",
      proficiencies: [
        { id: "prof_a", max: 30, thresholds: [{ at: 20, effects: [{ op: "skill", skill: "skill_a", add: 1 }] }] },
        { id: "prof_b", max: 100 }
      ],
      skills: [{ id: "skill_a", maxRank: 5, checkBonusPerRank: 1 }],
      traits: [
        { id: "talent_a", practice: { prof_a: 2 } },
        { id: "talent_b", practice: { prof_a: 1, prof_b: 3 } },
        { id: "trait_c", modifiers: [{ tags: ["tag_x"], value: 1 }] }
      ]
    },
    growth_b: { id: "growth_b", proficiencies: [{ id: "prof_a", max: 100 }], traits: [{ id: "talent_x", practice: { prof_a: 5 } }] }
  }
};
const actor = (id, growth = {}) => ({ id, hp: { current: 5, max: 5 }, money: 0, inventory: {}, growth });
const stateOf = (actors) => ({
  schemaVersion: 1, worldSeed: "talent", rng: { seed: 7, cursor: 0 }, time: { minute: 3 },
  player: { actorId: "player_1" }, actors: Object.fromEntries(actors.map((a) => [a.id, a]))
});
const withTraits = (traits, proficiency = {}) => ({ growth_a: { traits, proficiency } });
const practise = (state, effect) => applyEffects([{ op: "proficiency", ...effect }], { state, data: DATA, actorId: "player_1" });
const points = (result, id = "prof_a", system = "growth_a", who = "player_1") => result.state.actors[who].growth[system].proficiency[id];

// 1. the bonus: held talents add their listed integer to a gain
function testBonus() {
  assert.strictEqual(points(practise(stateOf([actor("player_1")]), { id: "prof_a", add: 5 })), 5, "no talent: +5");
  const one = practise(stateOf([actor("player_1", withTraits({ talent_a: true }))]), { id: "prof_a", add: 5 });
  assert.strictEqual(points(one), 7, "+5 with a +2 talent is +7");
  assert.deepStrictEqual(one.events, [{ minute: 3, type: "proficiency.changed", visibility: "player", actorId: "player_1", data: { id: "prof_a", delta: 7 } }]);
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: true, talent_b: true }))]), { id: "prof_a", add: 5 })), 8, "talents add up");
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: false }))]), { id: "prof_a", add: 5 })), 5, "a trait not held adds nothing");
  // only the listed ids
  const listed = stateOf([actor("player_1", withTraits({ talent_a: true, talent_b: true }))]);
  assert.strictEqual(points(practise(listed, { id: "prof_b", add: 5 }), "prof_b"), 8, "talent_b lists prof_b (+3); talent_a does not");
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: true }))]), { id: "prof_b", add: 5 }), "prof_b"), 5);
  // a trait without `practice` (a check modifier) changes no practice
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ trait_c: true }))]), { id: "prof_a", add: 5 })), 5);
  // integer, never a multiplier: the same +2 on a small and a large gain
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: true }))]), { id: "prof_b", add: 1 }), "prof_b"), 1, "talent_a: prof_b not listed");
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: true }))]), { id: "prof_a", add: 1 })), 3);
  assert.strictEqual(points(practise(stateOf([actor("player_1", withTraits({ talent_a: true }))]), { id: "prof_a", add: 20 })), 22);
}

// 2. only a gain: an add of 0 is no practice, so no bonus (no change, no event)
function testOnlyAGain() {
  const zero = practise(stateOf([actor("player_1", withTraits({ talent_a: true }, { prof_a: 4 }))]), { id: "prof_a", add: 0 });
  assert.strictEqual(points(zero), 4);
  assert.deepStrictEqual(zero.events, []);
}

// 3. the total meets the max and the thresholds: practice -> threshold -> rank, unchanged
function testThresholdsAndMax() {
  const crossing = practise(stateOf([actor("player_1", withTraits({ talent_a: true }, { prof_a: 13 }))]), { id: "prof_a", add: 5 });
  assert.strictEqual(points(crossing), 20, "13 + 5 + 2 reaches the threshold");
  assert.strictEqual(crossing.state.actors.player_1.growth.growth_a.skills.skill_a, 1);
  const without = practise(stateOf([actor("player_1", withTraits({}, { prof_a: 13 }))]), { id: "prof_a", add: 5 });
  assert.strictEqual(without.state.actors.player_1.growth.growth_a.skills, undefined, "18: not yet");
  const capped = practise(stateOf([actor("player_1", withTraits({ talent_a: true }, { prof_a: 27 }))]), { id: "prof_a", add: 5 });
  assert.strictEqual(points(capped), 30, "clamped at max");
  assert.strictEqual(capped.events[0].data.delta, 3);
}

// 4. the growth system: a talent counts in its own system only; the subject's own traits
function testSystemAndSubject() {
  const other = { growth_b: { traits: { talent_x: true } } };
  assert.strictEqual(points(practise(stateOf([actor("player_1", other)]), { id: "prof_a", add: 5 })), 5, "growth_b's talent: no bonus in growth_a");
  assert.strictEqual(points(practise(stateOf([actor("player_1", other)]), { id: "prof_a", add: 5, system: "growth_b" }), "prof_a", "growth_b"), 10);
  const npc = stateOf([actor("player_1", withTraits({ talent_a: true })), actor("npc_1")]);
  const npcGain = practise(npc, { id: "prof_a", add: 5, subject: "npc_1" });
  assert.strictEqual(points(npcGain, "prof_a", "growth_a", "npc_1"), 5, "the subject's traits, not the player's");
  assert.strictEqual(npcGain.state.actors.player_1.growth.growth_a.proficiency.prof_a, undefined);
}

// 5. a talent is no check modifier
function testNotACheckModifier() {
  const state = stateOf([actor("player_1", withTraits({ talent_a: true, talent_b: true }))]);
  const { result } = check({ tags: ["prof_a", "prof_b", "tag_x"], difficulty: 10 }, { state, data: DATA, actorId: "player_1" });
  assert.deepStrictEqual(result.modifiers, []);
}

// 6. the validator: `practice` maps proficiency ids to non-negative integers
function testValidator() {
  const pack = (trait) => ({
    formatVersion: 1, id: "pack_a", version: "1.0.0",
    world: { id: "world_a", growthSystemId: "growth_a", startTemplateId: "tmpl_a" },
    growthSystems: { growth_a: { id: "growth_a", traits: [trait] } },
    characterTemplates: { tmpl_a: { kind: "player", locationId: "loc_a", hp: { max: 5 }, growth: {} } },
    locations: { loc_a: { links: [] } }
  });
  assert.deepStrictEqual(validateData(pack({ id: "talent_a", practice: { prof_a: 2, prof_b: 0 } })), []);
  assert.deepStrictEqual(validateData(pack({ id: "trait_c" })), []);
  for (const practice of [[], "x", 2, { prof_a: -1 }, { prof_a: 1.5 }, { prof_a: "2" }]) {
    assert.ok(
      validateData(pack({ id: "talent_a", practice })).some((e) => /growthSystems\.growth_a\.traits\[0\]\.practice/.test(e)),
      JSON.stringify(practice)
    );
  }
  assert.ok(validateData(pack({ id: "talent_a", practice: { Prof_A: 1 } })).some((e) => /invalid id format at growthSystems\.growth_a\.traits\[0\]\.practice key/.test(e)));
}

testBonus();
testOnlyAGain();
testThresholdsAndMax();
testSystemAndSubject();
testNotACheckModifier();
testValidator();

console.log("V2-Core-57 talent.test.js: all checks passed");
