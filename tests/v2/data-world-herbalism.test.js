// V2-Core-65 (#160, Fantasy World Vertical Slice 2, step 2 -- herbalism): the remedy the spring needs,
// through the ordinary step() API and the real pack. No engine change; additive content only (D-92):
//   gathering purifying herbs at the spring -- WIS with the new `herbalism` skill, 2 stamina whatever
//   comes of it (great 2 herbs, success 1, a failure only practises); the herbalist teaches the basics
//   once, for 2 silver, to a character she has talked with (+20 practice: herbalism rank 1); two herbs
//   make one remedy at her stall.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const HERBALIST = (optionId) => [P("act_talk_herbalist"), C(optionId)];
// herb-30: the well is missed (the herbalist tells the way); the search succeeds; three gatherings --
// success, success, fail -- with the miasma between them; then the remedy
const SEED = "herb-30";
const TO_SPRING = [P("act_inspect_well"), M("loc_market"), ...HERBALIST("opt_herbalist_ask_sickness"), ...HERBALIST("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring")];
const GATHER3 = [P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs")];
const TO_REMEDY = [M("loc_village"), M("loc_market"), ...HERBALIST("opt_herbalist_brew")];
const CANONICAL = [...TO_SPRING, ...GATHER3, ...TO_REMEDY];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const start = (seed = SEED) => createInitialState({ worldSeed: seed, data: worldData }).state;
const me = (state) => state.actors.player_1;
const g = (state) => me(state).growth.growth_wanderer;
const stamina = (state) => g(state).resources.stamina.current;
const herbs = (state) => me(state).inventory.item_purifying_herb ?? 0;
const gatherCheck = (result) => result.events.find((e) => e.type === "check.resolved").data; // the gathering's own check comes first
const spent = (result) => result.events.filter((e) => e.type === "resource.changed" && e.actorId === "player_1").map((e) => e.data.delta);
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);

// 1. the shape
function testShape() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  const system = worldData.growthSystems.growth_wanderer;
  assert.deepStrictEqual(system.skills.find((s) => s.id === "herbalism"), { id: "herbalism", maxRank: 5, checkBonusPerRank: 1 });
  assert.deepStrictEqual(worldData.actions.act_gather_herbs.check, { stat: "wis", skill: "herbalism", tags: ["herbalism"], difficulty: "normal" });
  // a new game writes nothing of it (lazy practice, rank 0, no items)
  assert.ok(!/herbalism|item_purifying_herb|item_spring_remedy/.test(JSON.stringify(start())));
}

// 2. the lesson: only after talking with her; 2 silver; +20 = rank 1; once
function testLesson() {
  const atMarket = run(start(), [M("loc_market"), P("act_talk_herbalist")]).state;
  assert.strictEqual(rejected(atMarket, C("opt_herbalist_teach")), "requirements_not_met", "a stranger is not taught");
  const { state, log } = run(start(), [M("loc_market"), ...HERBALIST("opt_herbalist_ask_sickness"), ...HERBALIST("opt_herbalist_teach")]);
  assert.strictEqual(me(state).money, 6, "8 - 2");
  assert.strictEqual(g(state).proficiency.herbalism, 20);
  assert.strictEqual(g(state).skills.herbalism, 1);
  assert.strictEqual(state.relations["npc_herbalist:player_1"].score, 5, "the lesson is bought, not trust");
  assert.deepStrictEqual(state.relations["npc_herbalist:player_1"].tags, ["consulted", "taught"]);
  assert.ok(texts(log.at(-1)).includes("txt_herbalist_teach"));
  const again = run(state, [P("act_talk_herbalist")]).state;
  assert.strictEqual(rejected(again, C("opt_herbalist_teach")), "requirements_not_met", "once");
  const poor = structuredClone(run(start(), [M("loc_market"), ...HERBALIST("opt_herbalist_ask_sickness"), P("act_talk_herbalist")]).state);
  poor.actors.player_1.money = 1;
  assert.strictEqual(rejected(poor, C("opt_herbalist_teach")), "requirements_not_met", "2 silver");
}

// 3. gathering: WIS + the herbalism rank; 2 stamina whatever comes of it; success 1 herb, failure practice
function testGathering() {
  const atSpring = run(start(), TO_SPRING).state;
  assert.strictEqual(stamina(atSpring), 6);
  const { state, log } = run(atSpring, GATHER3);
  const tiers = log.map((r) => gatherCheck(r).tier);
  assert.deepStrictEqual(tiers, ["success", "success", "partial"]);
  assert.deepStrictEqual(gatherCheck(log[0]).modifiers, [{ source: "stat:wis", value: -1 }, { source: "skill:herbalism", value: 1 }]);
  assert.deepStrictEqual(log.map(spent), [[-2], [-2], [-2]], "every outcome pays");
  assert.deepStrictEqual(log.map((r) => texts(r).find((t) => t.startsWith("txt_gather"))), ["txt_gather_herbs_success", "txt_gather_herbs_success", "txt_gather_herbs_fail"]);
  assert.strictEqual(herbs(state), 2);
  assert.strictEqual(g(state).proficiency.herbalism, 45, "20 + 10 + 10 + 5");
  assert.strictEqual(g(state).skills.herbalism, 2);
  assert.strictEqual(stamina(state), 0);
  assert.strictEqual(rejected(state, P("act_gather_herbs")), "requirements_not_met", "no stamina left");
  // the miasma goes on meanwhile (each gathering is 30 minutes)
  assert.ok(log.every((r) => r.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_spring_miasma")));
  // 1 stamina is not enough; the knowledge and the place are needed too
  const tired = structuredClone(atSpring);
  tired.actors.player_1.growth.growth_wanderer.resources.stamina.current = 1;
  assert.strictEqual(rejected(tired, P("act_gather_herbs")), "requirements_not_met");
  const knowsInVillage = run(start(), [M("loc_market"), ...HERBALIST("opt_herbalist_ask_sickness"), M("loc_village")]).state;
  assert.strictEqual(rejected(knowsInVillage, P("act_gather_herbs")), "requirements_not_met", "knowing the way is not being at the spring");
  // a great gathering: 2 herbs (find a great roll)
  for (let i = 0; i < 200; i += 1) {
    const rolled = { ...atSpring, rng: start(`herb-roll-${i}`).rng };
    const r = step(rolled, P("act_gather_herbs"), worldData);
    if (gatherCheck(r).tier !== "great") continue;
    assert.strictEqual(herbs(r.state), 2);
    assert.strictEqual(g(r.state).proficiency.herbalism, 30);
    assert.deepStrictEqual(spent(r), [-2]);
    assert.ok(texts(r).includes("txt_gather_herbs_great"));
    return;
  }
  assert.fail("no great roll found");
}

// 4. the remedy: two herbs, one remedy, at her stall
function testRemedy() {
  const { state, log } = run(start(), CANONICAL);
  assert.strictEqual(herbs(state), 0);
  assert.strictEqual(me(state).inventory.item_spring_remedy, 1);
  assert.ok(texts(log.at(-1)).includes("txt_herbalist_brew"));
  const talking = run(state, [P("act_talk_herbalist")]).state;
  assert.strictEqual(rejected(talking, C("opt_herbalist_brew")), "requirements_not_met", "no herbs left");
  const oneHerb = structuredClone(talking);
  oneHerb.actors.player_1.inventory.item_purifying_herb = 1;
  assert.strictEqual(rejected(oneHerb, C("opt_herbalist_brew")), "requirements_not_met", "one herb is not enough");
  // the village rest refills stamina for another gathering (the existing recovery)
  const rested = run(state, [M("loc_village"), P("act_rest_village")]).state;
  assert.strictEqual(stamina(rested), 6);
}

// 5. save compatibility and determinism
function testSaveAndDeterminism() {
  const end = run(start(), CANONICAL).state;
  assert.deepStrictEqual(checkDataCompatibility(end, worldData), []);
  assert.deepStrictEqual(validateState(end), []);
  const mid = run(start(), [...TO_SPRING, GATHER3[0]]).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_herbs", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(run(loaded, [GATHER3[1], GATHER3[2], ...TO_REMEDY]).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start(), CANONICAL).state, end, "the same input, the same result");
  // a save from before herbalism existed (no practice, no rank) gathers at rank 0
  const before = structuredClone(run(start(), TO_SPRING).state);
  delete before.actors.player_1.growth.growth_wanderer.proficiency.herbalism;
  delete before.actors.player_1.growth.growth_wanderer.skills.herbalism;
  const r = step(before, P("act_gather_herbs"), worldData);
  assert.deepStrictEqual(gatherCheck(r).modifiers, [{ source: "stat:wis", value: -1 }]);
}

testShape();
testLesson();
testGathering();
testRemedy();
testSaveAndDeterminism();

console.log("V2-Core-65 data-world-herbalism.test.js: all checks passed");
