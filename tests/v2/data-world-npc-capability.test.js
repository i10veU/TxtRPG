// V2-Core-59 (Issue #152, #147 Phase D, D-88): an NPC uses the same capability language -- the bandit
// leader has the growth system's stamina (6/6, declared by his actor template) and a technique that
// costs it: on a `fail` exchange (he hits cleanly), with at least 3 stamina he puts his weight behind
// the blow -- 1 more damage, 3 of his stamina. Below 3, the plain hit. At most twice in a fight; he
// never recovers it. Data only: the existing `resource` Condition/Effect and `hp` Effect, with
// `subject`. A save whose leader has no entry reads as full (D-85) and behaves the same.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const CHOOSE = (optionId) => ({ type: "choose", optionId });
const FIGHT_OPTIONS = worldData.choices.choice_fight_leader.options;
const option = (id) => FIGHT_OPTIONS.find((o) => o.id === id);
const leaderStamina = (state) => state.actors.npc_bandit_leader.growth.growth_wanderer.resources?.stamina;
const tierOf = (result) => result.events.find((e) => e.type === "check.resolved")?.data.tier;
const narrations = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);

// a character in the fight, both made hard to fell; `rngSeed` picks the roll
function inFight({ leaderStaminaCurrent, rngSeed = "npc-1", dropEntry = false } = {}) {
  const s = createInitialState({ worldSeed: "npc-capability", data: worldData }).state;
  s.actors.player_1.locationId = "loc_village"; // the planted fight away from the ruins' hazard (only the exchange hurts)
  s.actors.player_1.hp = { current: 99, max: 99 };
  s.actors.npc_bandit_leader.hp = { current: 99, max: 99 };
  s.actors.player_1.growth.growth_wanderer.unlocks = { unl_keen_eye: true }; // the counter is offered
  if (leaderStaminaCurrent !== undefined) s.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current = leaderStaminaCurrent;
  if (dropEntry) delete s.actors.npc_bandit_leader.growth.growth_wanderer.resources;
  s.pending = { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" };
  s.rng = createInitialState({ worldSeed: rngSeed, data: worldData }).state.rng;
  return s;
}
// a seed on which `optionId` lands on `tier`
function seedFor(optionId, tier) {
  for (let i = 0; i < 300; i += 1) {
    if (tierOf(step(inFight({ rngSeed: `npc-seed-${i}` }), CHOOSE(optionId), worldData)) === tier) return `npc-seed-${i}`;
  }
  throw new Error(`no seed for ${optionId} ${tier}`);
}
const playerLoss = (before, after) => before.actors.player_1.hp.current - after.actors.player_1.hp.current;

// 1. the data: his stamina is declared; the blow is in every option's `fail` outcome
function testData() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  assert.deepStrictEqual(worldData.npcs.npc_bandit_leader.actor.growth.growth_wanderer.resources, { stamina: { current: 6, max: 6 } });
  assert.deepStrictEqual(leaderStamina(createInitialState({ worldSeed: "npc-x", data: worldData }).state), { current: 6, max: 6 });
  for (const id of ["opt_fight_strike", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_counter"]) {
    const fail = JSON.stringify(option(id).outcomes.fail);
    assert.ok(fail.includes('"subject":"npc_bandit_leader","resource":"stamina","min":3'), `${id}: the blow is his choice while he can pay`);
    assert.ok(fail.includes('"op":"resource","subject":"npc_bandit_leader","resource":"stamina","add":-3'), `${id}: he pays 3`);
    for (const tier of ["great", "success", "partial"]) {
      assert.ok(!JSON.stringify(option(id).outcomes[tier]).includes('"subject":"npc_bandit_leader","resource"'), `${id}.${tier}: no blow`);
    }
  }
}

// 2. the blow: 1 more damage and 3 of his stamina while he has 3; the plain hit below
function testBlow() {
  for (const [id, plain] of [["opt_fight_strike", 3], ["opt_fight_counter", 4]]) {
    const seed = seedFor(id, "fail");
    const full = inFight({ rngSeed: seed });
    const blow = step(full, CHOOSE(id), worldData);
    assert.strictEqual(tierOf(blow), "fail");
    assert.strictEqual(playerLoss(full, blow.state), plain + 1, `${id}: the heavy blow`);
    assert.deepStrictEqual(leaderStamina(blow.state), { current: 3, max: 6 });
    const spent = blow.events.find((e) => e.type === "resource.changed" && e.actorId === "npc_bandit_leader");
    assert.deepStrictEqual([spent.actorId, spent.visibility, spent.data], ["npc_bandit_leader", "internal", { resource: "stamina", delta: -3 }]);
    assert.ok(narrations(blow).includes("txt_fight_leader_heavy_blow"));
    assert.strictEqual(typeof worldData.texts.txt_fight_leader_heavy_blow, "string");

    const tired = inFight({ rngSeed: seed, leaderStaminaCurrent: 2 });
    const hit = step(tired, CHOOSE(id), worldData);
    assert.strictEqual(playerLoss(tired, hit.state), plain, `${id}: below 3, the plain hit`);
    assert.deepStrictEqual(leaderStamina(hit.state), { current: 2, max: 6 }, "nothing paid");
    assert.ok(!hit.events.some((e) => e.type === "resource.changed" && e.actorId === "npc_bandit_leader"));
    assert.ok(!narrations(hit).includes("txt_fight_leader_heavy_blow"));

    const exactly = inFight({ rngSeed: seed, leaderStaminaCurrent: 3 });
    assert.strictEqual(playerLoss(exactly, step(exactly, CHOOSE(id), worldData).state), plain + 1, "3 is enough");
  }
  // the player's stamina is the player's: the counter costs the player 3, the blow costs him 3
  const seed = seedFor("opt_fight_counter", "fail");
  const both = step(inFight({ rngSeed: seed }), CHOOSE("opt_fight_counter"), worldData);
  assert.deepStrictEqual(both.state.actors.player_1.growth.growth_wanderer.resources.stamina, { current: 3, max: 6 });
  assert.deepStrictEqual(leaderStamina(both.state), { current: 3, max: 6 });
}

// 3. a hit that is not a clean one (partial) never draws the blow
function testPartial() {
  const seed = seedFor("opt_fight_strike", "partial");
  const s = inFight({ rngSeed: seed });
  const r = step(s, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(playerLoss(s, r.state), 2);
  assert.deepStrictEqual(leaderStamina(r.state), { current: 6, max: 6 });
}

// 4. twice in a fight, then the plain hit: 6 -> 3 -> 0, he never recovers
function testTwice() {
  const seed = seedFor("opt_fight_strike", "fail");
  let s = inFight({ rngSeed: seed });
  const losses = [];
  for (let i = 0; i < 3; i += 1) {
    const rolled = { ...s, rng: inFight({ rngSeed: seed }).rng }; // the same failing roll each time
    const r = step(rolled, CHOOSE("opt_fight_strike"), worldData);
    losses.push(playerLoss(rolled, r.state));
    s = r.state;
  }
  assert.deepStrictEqual(losses, [4, 4, 3]);
  assert.deepStrictEqual(leaderStamina(s), { current: 0, max: 6 });
  // fleeing, waiting, resting in the village: his stamina stays spent (no NPC recovery)
  let after = step(s, CHOOSE("opt_fight_flee"), worldData).state;
  after = step(after, { type: "perform", actionId: "act_rest_village" }, worldData).state;
  after = step(after, { type: "wait", minutes: 1440 }, worldData).state;
  assert.deepStrictEqual(leaderStamina(after), { current: 0, max: 6 });
}

// 5. a save whose leader has no entry: full, the same blow; saved and loaded as it is
function testOldSave() {
  const seed = seedFor("opt_fight_strike", "fail");
  const old = inFight({ rngSeed: seed, dropEntry: true });
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old_leader", old, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, old, "not repaired");
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);
  assert.deepStrictEqual(validateState(loaded), []);
  const r = step(loaded, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(playerLoss(loaded, r.state), 4, "full: the blow");
  assert.deepStrictEqual(leaderStamina(r.state), { current: 3, max: 6 }, "written the first time it changes");
  const fresh = step(inFight({ rngSeed: seed }), CHOOSE("opt_fight_strike"), worldData);
  assert.deepStrictEqual(r.events, fresh.events, "the same as a new game");
}

// 6. determinism
function testDeterminism() {
  const s = inFight({ rngSeed: seedFor("opt_fight_counter", "fail") });
  assert.deepStrictEqual(step(s, CHOOSE("opt_fight_counter"), worldData), step(s, CHOOSE("opt_fight_counter"), worldData));
}

testData();
testBlow();
testPartial();
testTwice();
testOldSave();
testDeterminism();

console.log("V2-Core-59 data-world-npc-capability.test.js: all checks passed");
