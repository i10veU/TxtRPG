// V2-Core-56 (Issue #145, Gate 4 = C, D-85): the first resource in the real pack -- stamina.
//   - `growth_wanderer.resources = [{ id: "stamina", max: 6 }]`; both backgrounds start at 6/6
//     (their templates), and so does a successor (a new character)
//   - costs, with the existing requires + Effect: the frontal strike 0, the old wound 2, the counter
//     3, fleeing 0. Too little stamina refuses the option (requirements_not_met); the cost is paid by
//     every outcome of the exchange (the check decides the result, not whether it was attempted)
//   - the village rest refills it; nothing else does (no regeneration over time)
//   - a save without the entry (made before resources) is full -- not migrated, not repaired
//   - no NPC resources; no version bump
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const ASK = (optionId) => [P("act_talk_elder"), CHOOSE(optionId)];
const SEED = "frontier-canonical-4"; // the investigation succeeds: the relic and the keen eye
// the old wound known (V2-Core-55), back at the ruins, in the fight
const IN_FIGHT = [
  P("act_observe_village"), P("act_observe_village"), ...ASK("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), MOVE("loc_ruins"), P("act_fight_leader")
];
const SPEND = (n) => ({ op: "resource", resource: "stamina", add: -n });
const FIGHT_OPTIONS = worldData.choices.choice_fight_leader.options;
const option = (id) => FIGHT_OPTIONS.find((o) => o.id === id);

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (extra = {}) => createInitialState({ worldSeed: SEED, data: worldData, ...extra }).state;
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const me = (state) => state.actors[state.player.actorId];
const stamina = (state) => me(state).growth.growth_wanderer.resources?.stamina;
const resourceEvents = (result) => result.events.filter((e) => e.type === "resource.changed").map((e) => e.data);
// the fight, with the leader made hard to fell (so a sequence of exchanges stays a fight)
function inFight({ current } = {}) {
  const { state, log } = run(start(), IN_FIGHT);
  log.forEach((r, i) => assert.strictEqual(rejectedCode(r), undefined, `setup step ${i}`));
  assert.deepStrictEqual(state.pending, { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" });
  const s = structuredClone(state);
  s.actors.npc_bandit_leader.hp = { current: 99, max: 99 };
  s.actors.player_1.hp = { current: 99, max: 99 };
  if (current !== undefined) s.actors.player_1.growth.growth_wanderer.resources.stamina.current = current;
  return s;
}

// 1. the data
function testData() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  assert.deepStrictEqual(worldData.growthSystems.growth_wanderer.resources, [{ id: "stamina", max: 6 }]);
  for (const id of ["start_wanderer", "start_scout"]) {
    assert.deepStrictEqual(worldData.characterTemplates[id].growth.growth_wanderer.resources, { stamina: { current: 6, max: 6 } }, id);
  }
  assert.strictEqual(worldData.npcs.npc_bandit_leader.actor.growth.growth_wanderer.resources, undefined, "no NPC resources");
  // the costs: the counter and the old wound pay in every outcome, the strike and fleeing nothing
  assert.deepStrictEqual(option("opt_fight_counter").requires, { op: "and", of: [{ op: "unlock", id: "unl_keen_eye" }, { op: "resource", resource: "stamina", min: 3 }] });
  assert.deepStrictEqual(option("opt_fight_weak_spot").requires, { op: "and", of: [{ op: "rumor", rumor: "rum_leader_old_wound" }, { op: "resource", resource: "stamina", min: 2 }] });
  for (const [id, cost] of [["opt_fight_counter", 3], ["opt_fight_weak_spot", 2]]) {
    for (const tier of ["great", "success", "partial", "fail"]) {
      const effects = option(id).outcomes[tier];
      assert.deepStrictEqual(effects[0], SPEND(cost), `${id}.${tier} pays first`);
      assert.strictEqual(effects.filter((e) => e.op === "resource").length, 1, `${id}.${tier} pays once`);
    }
  }
  const strike = option("opt_fight_strike");
  assert.ok(!JSON.stringify(strike).includes('"resource"'), "the strike is free");
  assert.ok(!JSON.stringify(option("opt_fight_flee")).includes('"resource"'), "fleeing is free");
  // the old wound is still the strike's blow: the same outcomes after its cost
  for (const tier of ["great", "success", "partial", "fail"]) {
    assert.deepStrictEqual(option("opt_fight_weak_spot").outcomes[tier].slice(1), strike.outcomes[tier], tier);
  }
  assert.ok(worldData.actions.act_rest_village.effects.some((e) => e.op === "resource" && e.resource === "stamina" && e.add >= 6), "the rest refills");
}

// 2. who has it: both backgrounds and a successor start full; the leader has none
function testNewCharacters() {
  assert.deepStrictEqual(stamina(start()), { current: 6, max: 6 });
  assert.deepStrictEqual(stamina(start({ templateId: "start_scout" })), { current: 6, max: 6 });
  assert.deepStrictEqual(validateState(start()), []);
  assert.strictEqual(start().actors.npc_bandit_leader.growth.growth_wanderer.resources, undefined);

  // a character who spent it all and fell: the successor starts at 6, the predecessor keeps 0
  let s = inFight({ current: 0 });
  s.actors.player_1.hp.current = 1;
  for (let i = 0; i < 20 && s.pending?.kind !== "newCharacter"; i += 1) {
    s = step(s, s.pending?.kind === "choice" ? CHOOSE("opt_fight_strike") : { type: "wait", minutes: 30 }, worldData).state;
  }
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const heir = step(s, { type: "startCharacter", templateId: "start_wanderer" }, worldData).state;
  assert.strictEqual(heir.player.actorId, "player_2");
  assert.deepStrictEqual(stamina(heir), { current: 6, max: 6 });
  assert.strictEqual(heir.actors.player_1.growth.growth_wanderer.resources.stamina.current, 0, "the predecessor's stays theirs");
}

// 3. the costs in play: the counter 3, the old wound 2, the strike and fleeing 0
function testCosts() {
  const s = inFight();
  const counter = step(s, CHOOSE("opt_fight_counter"), worldData);
  assert.strictEqual(rejectedCode(counter), undefined);
  const types = counter.events.map((e) => e.type);
  assert.ok(types.indexOf("check.resolved") < types.indexOf("resource.changed"), "the check, then its outcome pays");
  assert.deepStrictEqual(resourceEvents(counter), [{ resource: "stamina", delta: -3 }]);
  assert.deepStrictEqual(stamina(counter.state), { current: 3, max: 6 });
  assert.strictEqual(counter.events.find((e) => e.type === "resource.changed").visibility, "player");

  const weak = step(s, CHOOSE("opt_fight_weak_spot"), worldData);
  assert.deepStrictEqual(resourceEvents(weak), [{ resource: "stamina", delta: -2 }]);
  assert.deepStrictEqual(stamina(weak.state), { current: 4, max: 6 });
  for (const free of ["opt_fight_strike", "opt_fight_flee"]) {
    const r = step(s, CHOOSE(free), worldData);
    assert.strictEqual(rejectedCode(r), undefined, free);
    assert.deepStrictEqual(resourceEvents(r), [], free);
    assert.deepStrictEqual(stamina(r.state), { current: 6, max: 6 }, free);
  }
  assert.strictEqual(counter.state.actors.npc_bandit_leader.growth.growth_wanderer.resources, undefined, "the leader pays nothing");

  // every tier pays: across seeds, each outcome of the counter cost exactly 3
  const seen = new Set();
  for (let i = 0; i < 120 && seen.size < 4; i += 1) {
    const trial = { ...s, rng: createInitialState({ worldSeed: `resource-trial-${i}`, data: worldData }).state.rng };
    const r = step(trial, CHOOSE("opt_fight_counter"), worldData);
    seen.add(r.events.find((e) => e.type === "check.resolved").data.tier);
    assert.deepStrictEqual(resourceEvents(r), [{ resource: "stamina", delta: -3 }]);
  }
  assert.strictEqual(seen.size, 4, `all four tiers seen (${[...seen]})`);
}

// 4. too little: refused, nothing changes; exactly enough is enough
function testTooLittle() {
  for (const [id, cost] of [["opt_fight_counter", 3], ["opt_fight_weak_spot", 2]]) {
    const short = inFight({ current: cost - 1 });
    const refused = step(short, CHOOSE(id), worldData);
    assert.strictEqual(rejectedCode(refused), "requirements_not_met", id);
    assert.deepStrictEqual(refused.state, short, `${id}: state, RNG and time unchanged; the fight still waits`);
    const exact = step(inFight({ current: cost }), CHOOSE(id), worldData);
    assert.strictEqual(rejectedCode(exact), undefined, id);
    assert.strictEqual(stamina(exact.state).current, 0, id);
  }
  // a sequence: two counters spend it all; the third is refused; the strike still answers
  let s = inFight();
  s = step(s, CHOOSE("opt_fight_counter"), worldData).state;
  s = step(s, CHOOSE("opt_fight_counter"), worldData).state;
  assert.deepStrictEqual(stamina(s), { current: 0, max: 6 });
  assert.strictEqual(rejectedCode(step(s, CHOOSE("opt_fight_counter"), worldData)), "requirements_not_met");
  assert.strictEqual(rejectedCode(step(s, CHOOSE("opt_fight_weak_spot"), worldData)), "requirements_not_met");
  assert.strictEqual(rejectedCode(step(s, CHOOSE("opt_fight_strike"), worldData)), undefined);
}

// 5. the rest refills it; time alone does not
function testRest() {
  let s = inFight({ current: 1 });
  s = step(s, CHOOSE("opt_fight_flee"), worldData).state; // back to the village, free
  assert.strictEqual(me(s).locationId, "loc_village");
  assert.strictEqual(stamina(s).current, 1);
  const waited = run(s, [{ type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }]).state;
  assert.strictEqual(stamina(waited).current, 1, "no regeneration over time");
  const rested = step(waited, P("act_rest_village"), worldData);
  assert.deepStrictEqual(resourceEvents(rested), [{ resource: "stamina", delta: 5 }]);
  assert.deepStrictEqual(stamina(rested.state), { current: 6, max: 6 });
  const again = step(rested.state, P("act_rest_village"), worldData);
  assert.deepStrictEqual(resourceEvents(again), [], "already full: no event");
  assert.deepStrictEqual(stamina(again.state), { current: 6, max: 6 });
}

// 6. a save from before resources: no entry = full; not migrated, not repaired
function testOldSave() {
  const old = inFight();
  delete old.actors.player_1.growth.growth_wanderer.resources;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old", old, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, old, "loaded as it was");
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);
  assert.deepStrictEqual(validateState(loaded), []);
  const counter = step(loaded, CHOOSE("opt_fight_counter"), worldData);
  assert.strictEqual(rejectedCode(counter), undefined, "full: the counter is affordable");
  assert.deepStrictEqual(stamina(counter.state), { current: 3, max: 6 }, "written the first time it changes");
  const strike = step(loaded, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(stamina(strike.state), undefined, "a free exchange leaves the entry missing");
  // and resting while full writes nothing either
  const village = structuredClone(loaded);
  village.pending = null;
  village.actors.player_1.locationId = "loc_village";
  assert.strictEqual(stamina(step(village, P("act_rest_village"), worldData).state), undefined);
}

testData();
testNewCharacters();
testCosts();
testTooLittle();
testRest();
testOldSave();

console.log("V2-Core-56 data-world-resource.test.js: all checks passed");
