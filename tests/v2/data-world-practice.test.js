// V2-Core-48 (Issue #129): practice becomes execution quality. The `investigation` proficiency the
// pack already grows (observing the village +15, investigating +30 / +10) and already declares a
// `checkStep` for (20) now takes part in the ruins investigation's check: +floor(points / 20), the
// existing §5.4 proficiency modifier. Data only: no engine, state, save or Condition/Effect change.
// V2-Core-52 (D-81, Skill Decision = A): the practice now grows the `investigation` skill at every 20
// points and the check reads the skill's rank instead -- the same number, from the skill (no
// double counting, tests/v2/data-world-skills.test.js). This test's claims stand as they were; the
// bonus's source is `skill:investigation`, and "a character with N practice points" is grown through
// the real `proficiency` Effect (its thresholds raise the rank) instead of written directly.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { applyEffects } from "../../web/v2/core/rules.js";
import { validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const INVESTIGATE = P("act_investigate_ruins");

const SEED = "history-41";
const OBSERVE_TWICE = [P("act_observe_village"), P("act_observe_village")];
// the rumor, a lantern, the ruins -- no check (and no RNG draw) on the way
const TO_RUINS = [
  P("act_talk_elder"), CHOOSE("opt_ask_ruins"), MOVE("loc_market"), P("act_buy_lantern"),
  MOVE("loc_village"), MOVE("loc_ruins")
];
const TO_DISPERSAL = [
  ...OBSERVE_TWICE, ...TO_RUINS, INVESTIGATE,
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings"),
  P("act_confront_leader"), P("act_talk_elder"), CHOOSE("opt_bandits_disperse")
];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (seed = SEED) => createInitialState({ worldSeed: seed, data: worldData }).state;
const rejected = (log) => log.some((r) => r.events.some((e) => e.type === "action.rejected"));
const checkOf = (result) => result.events.find((e) => e.type === "check.resolved").data;
const practiceModifier = (check) => check.modifiers.find((m) => m.source === "skill:investigation")?.value;
const growthOf = (state) => state.actors.player_1.growth.growth_wanderer;
function investigateWith(state, points) {
  const s = structuredClone(state);
  growthOf(s).proficiency = { ...growthOf(s).proficiency, investigation: 0 };
  delete growthOf(s).skills;
  const practised = points === 0 ? s : applyEffects([{ op: "proficiency", id: "investigation", add: points }], { state: s, data: worldData, actorId: "player_1" }).state;
  return checkOf(step(practised, INVESTIGATE, worldData));
}

// 1. the canonical first investigation: two observations (30 points) give +1
function testCanonicalPractice() {
  const { state, log } = run(start(), [...OBSERVE_TWICE, ...TO_RUINS]);
  assert.ok(!rejected(log));
  assert.strictEqual(growthOf(state).proficiency.investigation, 30);
  assert.strictEqual(practiceModifier(checkOf(step(state, INVESTIGATE, worldData))), 1);
}

// 2. the modifier follows the points (floor(points / 20)), and the margin moves with it on the
// same roll
function testFollowsThePoints() {
  const atRuins = run(start(), TO_RUINS).state; // no observation: 0 points
  assert.strictEqual(growthOf(atRuins).proficiency?.investigation ?? 0, 0);
  const at = (points) => investigateWith(atRuins, points);
  assert.strictEqual(practiceModifier(at(0)), undefined, "0 points: no modifier (§5.4 drops zeros)");
  assert.strictEqual(practiceModifier(at(19)), undefined);
  assert.strictEqual(practiceModifier(at(20)), 1);
  assert.strictEqual(practiceModifier(at(40)), 2);
  assert.strictEqual(practiceModifier(at(100)), 5);
  assert.deepStrictEqual(at(40).dice, at(0).dice, "the same roll");
  assert.strictEqual(at(40).margin - at(0).margin, 2);
}

// 3. practice changes outcomes: on some seeds an unpractised character falls short (fail or partial)
// where a fully practised one (100 points, +5, the same roll) succeeds
function testPracticeChangesOutcomes() {
  const better = { fail: 0, partial: 1, success: 2, great: 3 };
  let improved = 0;
  for (let i = 0; i < 100; i += 1) {
    const { state, log } = run(start(`practice-${i}`), TO_RUINS);
    assert.ok(!rejected(log));
    const raw = investigateWith(state, 0);
    const practised = investigateWith(state, 100);
    assert.strictEqual(practised.margin - raw.margin, 5);
    assert.ok(better[practised.tier] >= better[raw.tier]);
    if (better[raw.tier] < better.success && better[practised.tier] >= better.success) improved += 1;
  }
  assert.ok(improved >= 1, `practice turns a shortfall into a success on some seed (${improved})`);
}

// 4. what was there stays: the unlock at 50 and the canonical history on this seed
function testUnchangedPath() {
  const { state, log } = run(start(), TO_DISPERSAL);
  assert.ok(!rejected(log));
  assert.strictEqual(growthOf(state).unlocks.unl_keen_eye, true);
  assert.strictEqual(state.cases.case_ruins_mystery.stage, "resolved");
  assert.deepStrictEqual(state.relations["npc_bandit_leader:org_bandits"].tags, []);
  assert.deepStrictEqual(run(start(), TO_DISPERSAL).log, log, "deterministic");
}

assert.deepStrictEqual(validateData(worldData), []);
testCanonicalPractice();
testFollowsThePoints();
testPracticeChangesOutcomes();
testUnchangedPath();

console.log("V2-Core-48 data-world-practice.test.js: all checks passed");
