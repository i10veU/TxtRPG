// V2-Core-57 (Issue #148, #147 Phase A: T3 = B, D-86): the first talent in the real pack. The scout
// background keeps night vision and gains `investigation_talent` (a trait with
// `practice: { investigation: 2 }`): every investigation practice gain is 2 more -- observing 15 -> 17,
// a successful search 30 -> 32, a failed one 10 -> 12. The wanderer is unchanged. Combat practice is
// not listed, so it is unchanged for both. No check modifier. A scout saved before the talent has
// none (no migration, no repair); no version bump; no new background.
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
const SYSTEM = worldData.growthSystems.growth_wanderer;
const TO_SEARCH = [P("act_talk_elder"), CHOOSE("opt_ask_ruins"), MOVE("loc_ruins"), P("act_investigate_ruins")]; // the scout needs no lantern

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (templateId, seed = "talent-1") => createInitialState({ worldSeed: seed, data: worldData, templateId }).state;
const growth = (state) => state.actors[state.player.actorId].growth.growth_wanderer;
const practiceEvents = (result) => result.events.filter((e) => e.type === "proficiency.changed").map((e) => e.data);
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;

// 1. the data
function testData() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  assert.deepStrictEqual(SYSTEM.traits, [
    { id: "night_vision" },
    { id: "investigation_talent", practice: { investigation: 2 } },
    { id: "road_wound", modifiers: [{ tags: ["combat"], value: -2 }] }, // V2-Core-93: a wound, never a starting trait
    { id: "road_wound_deep", modifiers: [{ tags: ["combat"], value: -1 }] } // V2-Core-121: the deep wound, likewise
  ]);
  assert.deepStrictEqual(worldData.characterTemplates.start_scout.growth.growth_wanderer.traits, { night_vision: true, investigation_talent: true });
  assert.strictEqual(worldData.characterTemplates.start_wanderer.growth.growth_wanderer.traits, undefined, "the wanderer is unchanged");
  assert.deepStrictEqual(Object.keys(worldData.characterTemplates).sort(), ["start_scout", "start_wanderer"], "no new background");
}

// 2. observing: 17 for the scout, 15 for the wanderer; two observations give both the first rank
function testObserve() {
  const scout = run(start("start_scout"), [P("act_observe_village"), P("act_observe_village")]);
  assert.deepStrictEqual(practiceEvents(scout.log[0]), [{ id: "investigation", delta: 17 }]);
  assert.strictEqual(growth(scout.state).proficiency.investigation, 34);
  assert.strictEqual(growth(scout.state).skills.investigation, 1);
  const wanderer = run(start("start_wanderer"), [P("act_observe_village"), P("act_observe_village")]);
  assert.deepStrictEqual(practiceEvents(wanderer.log[0]), [{ id: "investigation", delta: 15 }]);
  assert.strictEqual(growth(wanderer.state).proficiency.investigation, 30);
  // three observations: the scout's 51 reaches the keen eye (50); the wanderer's 45 does not
  const scout3 = run(scout.state, [P("act_observe_village")]).state;
  const wanderer3 = run(wanderer.state, [P("act_observe_village")]).state;
  assert.strictEqual(growth(scout3).proficiency.investigation, 51);
  assert.strictEqual(growth(scout3).unlocks?.unl_keen_eye, true, "the talent reaches the threshold sooner");
  assert.strictEqual(growth(wanderer3).unlocks?.unl_keen_eye, undefined);
}

// 3. searching: success +32 and failure +12 for the scout; no check modifier from the talent
function testSearch() {
  const seen = {};
  for (let i = 0; i < 60 && Object.keys(seen).length < 2; i += 1) {
    const { log } = run(start("start_scout", `talent-search-${i}`), TO_SEARCH);
    assert.ok(log.every((r) => rejectedCode(r) === undefined));
    const search = log.at(-1);
    const resolved = search.events.find((e) => e.type === "check.resolved").data;
    assert.ok(!resolved.modifiers.some((m) => m.source.startsWith("trait:")), "a talent is no check modifier");
    const gained = practiceEvents(search);
    assert.strictEqual(gained.length, 1, "one practice gain, so one bonus");
    seen[resolved.tier === "success" || resolved.tier === "great" ? "success" : "fail"] = gained[0].delta;
  }
  assert.deepStrictEqual(seen, { success: 32, fail: 12 });
}

// 4. combat practice is not listed: +5 for the scout too
function testCombatUnchanged() {
  const atRuins = start("start_scout");
  atRuins.actors.player_1.locationId = "loc_ruins";
  atRuins.pending = { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" };
  const exchange = step(atRuins, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(rejectedCode(exchange), undefined);
  assert.deepStrictEqual(practiceEvents(exchange), [{ id: "combat", delta: 5 }]);
}

// 5. a successor scout has the talent; a scout saved before it has none, and keeps loading
function testSuccessorAndOldSave() {
  const dead = run(start("start_wanderer"), [MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))]).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const heir = step(dead, { type: "startCharacter", templateId: "start_scout" }, worldData).state;
  assert.deepStrictEqual(growth(heir).traits, { night_vision: true, investigation_talent: true });
  assert.strictEqual(growth(run(heir, [MOVE("loc_village"), P("act_observe_village")]).state).proficiency.investigation, 17);

  const old = start("start_scout");
  delete old.actors.player_1.growth.growth_wanderer.traits.investigation_talent; // a scout from before V2-Core-57
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old_scout", old, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, old, "loaded as it was, not repaired");
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);
  assert.deepStrictEqual(validateState(loaded), []);
  const observed = run(loaded, [P("act_observe_village")]).state;
  assert.strictEqual(growth(observed).proficiency.investigation, 15, "no talent, no bonus");
  assert.deepStrictEqual(growth(observed).traits, { night_vision: true }, "night vision kept, the talent not added");
}

testData();
testObserve();
testSearch();
testCombatUnchanged();
testSuccessorAndOldSave();

console.log("V2-Core-57 data-world-talent.test.js: all checks passed");
