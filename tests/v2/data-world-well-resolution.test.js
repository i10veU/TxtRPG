// V2-Core-66 (#160, Fantasy World Vertical Slice 2, step 3 -- resolution and its world): purifying the
// spring, through the ordinary step() API and the real pack. No engine change; additive content (D-92):
//   at the spring, the character's own finding (their knowledge of the cause) and a remedy resolve
//   `case_fouled_well` (the world's); the miasma stops; the herbalist's edge towards that character is
//   tagged `purifier`. The village sees its well clear (once, narration only); the well and the herbalist
//   tell the changed world to whoever asks, a successor too; only the purifier can tell her, once (+10).
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
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
// herb-30 (tests/v2/data-world-herbalism.test.js): the way, the cause, two herbs, the remedy
const SEED = "herb-30";
const TO_REMEDY = [
  P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
  P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), M("loc_forest_spring")
];
const AFTER = [M("loc_village"), P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_report_spring")];

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
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const checks = (result) => result.events.filter((e) => e.type === "check.resolved");
const fired = (result, id) => result.events.some((e) => e.type === "trigger.fired" && e.data.eventId === id);
const edge = (state) => state.relations?.[`npc_herbalist:${state.player.actorId}`];
const ready = run(start(), TO_REMEDY).state;

// 1. purifying: the character's own finding and a remedy, while the case is open
function testPurify() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(ready.actors.player_1.locationId, "loc_forest_spring");
  assert.strictEqual(ready.cases?.case_fouled_well, undefined, "open");
  const r = step(ready, P("act_purify_spring"), worldData);
  assert.deepStrictEqual(texts(r), ["txt_purify_spring"]);
  assert.deepStrictEqual(r.state.cases.case_fouled_well, { stage: "resolved", since: r.state.time.minute - 30 });
  assert.strictEqual(r.state.actors.player_1.inventory.item_spring_remedy ?? 0, 0, "the remedy is used");
  assert.deepStrictEqual(edge(r.state).tags, ["consulted", "purifier", "taught"]);
  assert.strictEqual(edge(r.state).score, 5, "the deed is not yet told");
  assert.strictEqual(r.state.actors.player_1.growth.growth_wanderer.proficiency.herbalism, 55, "45 + 10");
  assert.deepStrictEqual(checks(r), [], "the miasma has stopped (30 minutes at the spring, no roll)");
  assert.strictEqual(rejected(r.state, P("act_purify_spring")), "requirements_not_met", "once");
  const secondRemedy = structuredClone(r.state);
  secondRemedy.actors.player_1.inventory.item_spring_remedy = 1;
  assert.strictEqual(rejected(secondRemedy, P("act_purify_spring")), "requirements_not_met", "a resolved case is not purified again, remedy or not");
  // each requirement on its own
  const noRemedy = structuredClone(ready);
  delete noRemedy.actors.player_1.inventory.item_spring_remedy;
  assert.strictEqual(rejected(noRemedy, P("act_purify_spring")), "requirements_not_met", "a remedy");
  const notSeen = structuredClone(ready);
  delete notSeen.knowledge.player_1.rum_spring_cause;
  assert.strictEqual(rejected(notSeen, P("act_purify_spring")), "requirements_not_met", "the character's own finding, not the world's fact");
  assert.strictEqual(notSeen.facts.fact_spring_cause.value, "rotting_carcass");
  const elsewhere = run(ready, [M("loc_village")]).state;
  assert.strictEqual(rejected(elsewhere, P("act_purify_spring")), "requirements_not_met", "at the spring");
  // the spring stays calm: a long wait there rolls nothing
  assert.deepStrictEqual(checks(step(r.state, { type: "wait", minutes: 120 }, worldData)), []);
  return r.state;
}

// 2. the world afterwards: the village sees its well clear (once); the well and the herbalist tell it;
// only the purifier can tell her, once
function testAfterwards(purified) {
  const { state, log } = run(purified, AFTER);
  const [toVillage, inspect, , , asked, , reported] = log;
  assert.ok(fired(toVillage, "evt_well_clears"));
  assert.deepStrictEqual(texts(toVillage), ["txt_well_clears"]);
  assert.ok(texts(inspect).includes("txt_inspect_well_clear"), "the same water runs clear");
  assert.ok(!texts(inspect).includes("txt_inspect_well_success"));
  assert.deepStrictEqual(texts(asked), ["txt_herbalist_sickness_passed"]);
  assert.deepStrictEqual(texts(reported), ["txt_herbalist_thanks"]);
  assert.strictEqual(edge(state).score, 15, "5 + 10");
  assert.deepStrictEqual(edge(state).tags, ["consulted", "purifier", "taught", "thanked"]);
  const again = run(state, [P("act_talk_herbalist")]).state;
  assert.strictEqual(rejected(again, C("opt_herbalist_report_spring")), "requirements_not_met", "once");
  // the village event does not repeat
  const back = run(state, [M("loc_village")]).log[0];
  assert.ok(!fired(back, "evt_well_clears"));
  // before the purification none of it: the report is not offered, the well event does not fire
  const before = run(ready, [M("loc_village"), M("loc_market"), P("act_talk_herbalist")]);
  assert.ok(!before.log.some((r) => fired(r, "evt_well_clears")));
  assert.strictEqual(rejected(before.state, C("opt_herbalist_report_spring")), "requirements_not_met");
  return state;
}

// 3. a successor: the changed world is told to them, but the deed is not theirs (the ruins' hazard
// ends the first character, with a lantern bought for the dark)
function deathOf(state) {
  let s = run(state, [M("loc_village"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 5 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  return run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
}
function testSuccessorWorld(after) {
  const next = deathOf(after);
  assert.strictEqual(next.player.actorId, "player_2");
  assert.strictEqual(next.cases.case_fouled_well.stage, "resolved", "the world's");
  assert.strictEqual(edge(next), undefined, "her trust and the purifier tag were the first character's");
  const { state, log } = run(next, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]);
  assert.deepStrictEqual(texts(log[2]), ["txt_herbalist_sickness_passed"], "told the changed world");
  assert.strictEqual(rejected(run(state, [P("act_talk_herbalist")]).state, C("opt_herbalist_report_spring")), "requirements_not_met", "not their deed");
  const atSpring = run(state, [M("loc_village"), M("loc_forest_spring")]);
  assert.deepStrictEqual(atSpring.log.flatMap(checks), [], "the spring is calm for them too");
  assert.ok(!atSpring.log.some((r) => fired(r, "evt_well_clears")), "the village saw it once");
}

// 4. save compatibility and determinism
function testSaveAndDeterminism() {
  const all = [...TO_REMEDY, P("act_purify_spring"), ...AFTER];
  const end = run(start(), all).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(checkDataCompatibility(end, worldData), []);
  const mid = run(start(), [...TO_REMEDY, P("act_purify_spring")]).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_purified", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(run(loaded, AFTER).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start(), all).state, end, "the same input, the same result");
}

const purified = testPurify();
const after = testAfterwards(purified);
testSuccessorWorld(after);
testSaveAndDeterminism();

console.log("V2-Core-66 data-world-well-resolution.test.js: all checks passed");
