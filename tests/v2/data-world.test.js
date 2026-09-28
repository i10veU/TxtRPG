// V2-Core-22 tests for the first real V2 world data pack
// (docs/v2/architecture/CORE_CONTRACTS.md §11, D-65, Issue #74).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.
//
// Per DEVELOPMENT_RULES.md §17 ("실제 세계관 데이터를 테스트 fixture로 만들지
// 않는다"), this is the one place that imports the real content pack
// (web/v2/data/world.js) -- the other tests/v2/*.test.js files keep using
// their own abstract-ID synthetic fixtures and never import this file's data.

import assert from "node:assert/strict";
import { createInitialState, step, view, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

// The canonical playthrough: observe x2 (crosses the 50-point investigation
// threshold together with the later +30), buy the lantern, investigate the
// ruins (a real check()), talk to the elder and pick the rumor option,
// then confront the bandit leader (a second real check()). worldSeed
// "frontier-canonical-4" was picked empirically (see PR description) to
// make both checks land on a non-"fail" tier, so the full path -- including
// the `case` Effect in act_confront_leader's success outcome -- is
// exercised by an ordinary deterministic replay, not a forced difficulty.
const CANONICAL_SEED = "frontier-canonical-4";
const CANONICAL_ACTIONS = [
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_buy_lantern" },
  { type: "perform", actionId: "act_investigate_ruins" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  { type: "perform", actionId: "act_confront_leader" }
];

function runCanonicalPlaythrough(worldSeed) {
  let state = createInitialState({ worldSeed, data: worldData }).state;
  const stepsLog = [];
  for (const action of CANONICAL_ACTIONS) {
    const result = step(state, action, worldData);
    stepsLog.push({ action, events: result.events });
    state = result.state;
  }
  return { finalState: state, stepsLog };
}

// 1. data import/load + validateData(data) === []
function testDataImportAndValidate() {
  assert.strictEqual(typeof worldData, "object");
  assert.ok(worldData !== null && !Array.isArray(worldData));
  assert.deepStrictEqual(validateData(worldData), []);
}

testDataImportAndValidate();

// 2. createInitialState(data) produces a valid, correctly-bootstrapped state
function testCreateInitialStateFromWorldData() {
  const { state, events } = createInitialState({ worldSeed: "smoke-seed", data: worldData });
  assert.deepStrictEqual(events, []);
  assert.deepStrictEqual(validateState(state), []);
  assert.strictEqual(state.player.actorId, "player_1");
  const actor = state.actors.player_1;
  assert.strictEqual(actor.locationId, "loc_village");
  assert.strictEqual(actor.hp.current, 10);
  assert.strictEqual(actor.hp.max, 10);
  assert.strictEqual(actor.money, 8);
  assert.strictEqual(actor.growth.growth_wanderer.stats.wit, 8);
}

testCreateInitialStateFromWorldData();

// 3. the full minimal playable path, exercising Condition/Check/Effect/
// Event/growth-gates-content end to end with real content
function testCanonicalPlaythrough() {
  const { finalState, stepsLog } = runCanonicalPlaythrough(CANONICAL_SEED);

  const [observe1, observe2, buyLantern, investigate, talkElder, chooseAsk, confront] = stepsLog;

  assert.deepStrictEqual(
    observe1.events.map((e) => e.type),
    ["proficiency.changed", "narration", "action.resolved"]
  );
  assert.deepStrictEqual(observe2.events[0].data, { id: "investigation", delta: 15 });

  assert.deepStrictEqual(buyLantern.events.map((e) => e.type), ["money.changed", "item.changed", "narration", "action.resolved"]);

  const investigateCheck = investigate.events.find((e) => e.type === "check.resolved");
  assert.notStrictEqual(investigateCheck, undefined);
  assert.notStrictEqual(investigateCheck.data.tier, "fail", "canonical seed must not fail the investigate check");
  assert.ok(investigate.events.some((e) => e.type === "fact.changed" && e.data.fact === "fact_ruins_secret"));
  assert.ok(investigate.events.some((e) => e.type === "flag.changed" && e.data.key === "ruins_secret_confirmed"));
  assert.ok(investigate.events.some((e) => e.type === "unlock.granted" && e.data.id === "unl_keen_eye"));
  assert.ok(investigate.events.some((e) => e.type === "item.changed" && e.data.item === "item_relic"));

  assert.deepStrictEqual(talkElder.events.map((e) => e.type), ["choice.offered", "action.resolved"]);

  assert.ok(chooseAsk.events.some((e) => e.type === "relation.changed" && e.data.from === "npc_elder"));
  assert.ok(chooseAsk.events.some((e) => e.type === "rumor.learned" && e.data.claim === "bandit_hideout"));

  const confrontCheck = confront.events.find((e) => e.type === "check.resolved");
  assert.notStrictEqual(confrontCheck, undefined);
  assert.notStrictEqual(confrontCheck.data.tier, "fail", "canonical seed must not fail the confront check");
  assert.ok(confront.events.some((e) => e.type === "relation.changed" && e.data.from === "npc_bandit_leader"));

  // final accumulated state: growth gated a real new action, a hidden fact
  // was set (never in the player-visible view), the player's own rumor
  // knowledge tracks the same claim, and the world-mutating `case` Effect
  // fired from the success outcome
  const actor = finalState.actors.player_1;
  assert.strictEqual(actor.growth.growth_wanderer.proficiency.investigation, 60);
  assert.deepStrictEqual(actor.growth.growth_wanderer.unlocks, { unl_keen_eye: true });
  assert.strictEqual(finalState.facts.fact_ruins_secret.value, "bandit_hideout");
  assert.strictEqual(finalState.knowledge.player_1.rum_ruins_secret.claim, "bandit_hideout");
  assert.deepStrictEqual(finalState.cases, { case_ruins_mystery: { stage: "resolved", since: finalState.cases.case_ruins_mystery.since } });
  assert.deepStrictEqual(validateState(finalState), []);

  // §8.4: the hidden fact must never leak into view()
  const playerView = view(finalState, worldData);
  assert.strictEqual(playerView.actor.growth.growth_wanderer.stats.wit, 8);
  assert.ok(!("facts" in playerView));
}

testCanonicalPlaythrough();

// 4. invalid action / locked action handling (§2.6, D-15)
function testInvalidAndLockedActions() {
  const { state: fresh } = createInitialState({ worldSeed: "locked-check", data: worldData });

  // unknown action id -> unknown_action
  const unknown = step(fresh, { type: "perform", actionId: "act_does_not_exist" }, worldData);
  assert.deepStrictEqual(unknown.state, fresh);
  assert.strictEqual(unknown.events[0].data.code, "unknown_action");

  // act_confront_leader before its requirements are met -> requirements_not_met
  const locked = step(fresh, { type: "perform", actionId: "act_confront_leader" }, worldData);
  assert.deepStrictEqual(locked.state, fresh);
  assert.strictEqual(locked.events[0].data.code, "requirements_not_met");

  // view(): a locked showWhenLocked:true action is listed as unavailable
  // (D-15), never with a reason
  const freshView = view(fresh, worldData);
  const confrontEntry = freshView.actions.find((a) => a.actionId === "act_confront_leader");
  assert.deepStrictEqual(confrontEntry, { actionId: "act_confront_leader", available: false });

  // act_buy_lantern has no showWhenLocked -- once money drops below its
  // requirement it must be excluded from the list entirely, not shown locked
  const poor = structuredClone(fresh);
  poor.actors.player_1.money = 0;
  const poorView = view(poor, worldData);
  assert.strictEqual(poorView.actions.some((a) => a.actionId === "act_buy_lantern"), false);
}

testInvalidAndLockedActions();

// 5. deterministic replay: same worldSeed + same initial state + same
// action sequence -> byte-identical state/events, for a path that
// genuinely exercises check()/RNG (D-19/§2.6)
function testDeterministicReplay() {
  const runA = runCanonicalPlaythrough(CANONICAL_SEED);
  const runB = runCanonicalPlaythrough(CANONICAL_SEED);
  assert.deepStrictEqual(runA.finalState, runB.finalState);
  assert.deepStrictEqual(runA.stepsLog, runB.stepsLog);

  // a different seed must be able to diverge at the check (sanity: this
  // pack's determinism isn't accidental because the check never actually
  // runs real RNG-sensitive logic)
  const runC = runCanonicalPlaythrough("a-completely-different-seed");
  assert.notDeepStrictEqual(runA.finalState.rng, runC.finalState.rng);
}

testDeterministicReplay();

// 6. JSON round-trip of a real, fully-populated state produced by this pack
function testJsonRoundTrip() {
  const { finalState } = runCanonicalPlaythrough(CANONICAL_SEED);
  const roundTripped = JSON.parse(JSON.stringify(finalState));
  assert.deepStrictEqual(roundTripped, finalState);
  assert.deepStrictEqual(validateState(roundTripped), []);
}

testJsonRoundTrip();

// 7. save/load round-trip using the real storage adapter's pure functions
// (buildSaveRecord/parseLoadedRecord, web/v2/storage/idb.js) -- real
// IndexedDB CRUD itself is covered by the browser spec; this proves the
// save/load boundary preserves this pack's actual state exactly, then
// verifies the SAME next action produces identical results whether it's
// applied to the original state or the round-tripped one (Issue #74 "save
// → reload → validate → 동일 action 결과 일치").
function testSaveLoadRoundTrip() {
  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  state = step(state, CANONICAL_ACTIONS[0], worldData).state; // act_observe_village
  state = step(state, CANONICAL_ACTIONS[1], worldData).state; // act_observe_village
  state = step(state, CANONICAL_ACTIONS[2], worldData).state; // act_buy_lantern

  const record = buildSaveRecord("slot_canonical", state, { savedAt: 123456 });
  assert.strictEqual(record.slot, "slot_canonical");
  assert.strictEqual(record.worldId, state.worldId);
  assert.deepStrictEqual(record.dataRef, state.dataRef);

  const reloaded = parseLoadedRecord(record);
  assert.deepStrictEqual(reloaded, state);
  assert.deepStrictEqual(validateState(reloaded), []);

  // same next action (the check-bearing one) from both the original and the
  // reloaded state must produce identical results
  const nextAction = CANONICAL_ACTIONS[3]; // act_investigate_ruins
  const fromOriginal = step(state, nextAction, worldData);
  const fromReloaded = step(reloaded, nextAction, worldData);
  assert.deepStrictEqual(fromOriginal, fromReloaded);

  // round-tripping through JSON (simulating the actual IndexedDB structured
  // clone / a saved-to-disk record) must not change any of the above
  const jsonRoundTrippedRecord = JSON.parse(JSON.stringify(record));
  assert.deepStrictEqual(parseLoadedRecord(jsonRoundTrippedRecord), state);
}

testSaveLoadRoundTrip();

console.log("V2-Core-22 data-world.test.js: all checks passed");
