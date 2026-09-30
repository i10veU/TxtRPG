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

// The canonical playthrough (V2-Core-29: each step runs where it belongs):
// observe x2 in the village (crosses the 50-point investigation threshold
// together with the later +30), walk to the market and buy the lantern, walk
// back and on to the ruins, investigate (a real check(); the ruins hazard
// costs HP), return to the village and rest (the recovery action), talk to
// the elder and pick the rumor option, then confront the bandit leader (a
// second real check()). worldSeed
// "frontier-canonical-4" was picked empirically (see PR description) to
// make both checks land on a non-"fail" tier, so the full path -- including
// the `case` Effect in act_confront_leader's success outcome -- is
// exercised by an ordinary deterministic replay, not a forced difficulty.
const CANONICAL_SEED = "frontier-canonical-4";
const CANONICAL_ACTIONS = [
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_observe_village" },
  { type: "move", to: "loc_market" },
  { type: "perform", actionId: "act_buy_lantern" },
  { type: "move", to: "loc_village" },
  { type: "move", to: "loc_ruins" },
  { type: "perform", actionId: "act_investigate_ruins" },
  { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_rest_village" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  { type: "perform", actionId: "act_confront_leader" }
];

// Index of the canonical step that performs `actionId` (the path repeats
// some actions, so callers pick the first match).
function stepOf(actionId) {
  return CANONICAL_ACTIONS.findIndex((a) => a.actionId === actionId);
}

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

  const at = (actionId) => stepsLog[stepOf(actionId)];
  const observe1 = stepsLog[0];
  const observe2 = stepsLog[1];
  const buyLantern = at("act_buy_lantern");
  const investigate = at("act_investigate_ruins");
  const rest = at("act_rest_village");
  const talkElder = at("act_talk_elder");
  const chooseAsk = stepsLog[stepOf("act_talk_elder") + 1];
  const confront = at("act_confront_leader");

  assert.deepStrictEqual(
    observe1.events.map((e) => e.type),
    ["proficiency.changed", "narration", "action.resolved"]
  );
  assert.deepStrictEqual(observe2.events[0].data, { id: "investigation", delta: 15 });

  assert.deepStrictEqual(buyLantern.events.map((e) => e.type), ["money.changed", "item.changed", "narration", "action.resolved"]);

  // hazard at the ruins (existing data.events trigger + hp Effect) then the
  // recovery action heals through the same hp Effect
  assert.ok(investigate.events.some((e) => e.type === "hp.changed" && e.data.delta === -4), "ruins hazard costs HP during the investigation");
  assert.ok(rest.events.some((e) => e.type === "hp.changed" && e.data.delta === 4), "rest heals through the hp Effect");

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
  // 10 -> arrival hazard (-4) -> investigation-time hazard (-4) -> rest (+4)
  assert.strictEqual(actor.hp.current, 6);
  assert.strictEqual(actor.alive !== false, true);
  assert.strictEqual(finalState.time.minute, 270);
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

  // act_buy_lantern has no showWhenLocked -- at the market, once money drops
  // below its requirement it must be excluded from the list entirely, not
  // shown locked
  const atMarket = step(fresh, { type: "move", to: "loc_market" }, worldData).state;
  assert.strictEqual(view(atMarket, worldData).actions.some((a) => a.actionId === "act_buy_lantern"), true);
  const poor = structuredClone(atMarket);
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
  // everything up to (not including) the check-bearing investigate step
  const investigateIndex = stepOf("act_investigate_ruins");
  for (const action of CANONICAL_ACTIONS.slice(0, investigateIndex)) {
    state = step(state, action, worldData).state;
  }

  const record = buildSaveRecord("slot_canonical", state, { savedAt: 123456 });
  assert.strictEqual(record.slot, "slot_canonical");
  assert.strictEqual(record.worldId, state.worldId);
  assert.deepStrictEqual(record.dataRef, state.dataRef);

  const reloaded = parseLoadedRecord(record);
  assert.deepStrictEqual(reloaded, state);
  assert.deepStrictEqual(validateState(reloaded), []);

  // same next action (the check-bearing one) from both the original and the
  // reloaded state must produce identical results
  const nextAction = CANONICAL_ACTIONS[investigateIndex]; // act_investigate_ruins
  const fromOriginal = step(state, nextAction, worldData);
  const fromReloaded = step(reloaded, nextAction, worldData);
  assert.deepStrictEqual(fromOriginal, fromReloaded);

  // round-tripping through JSON (simulating the actual IndexedDB structured
  // clone / a saved-to-disk record) must not change any of the above
  const jsonRoundTrippedRecord = JSON.parse(JSON.stringify(record));
  assert.deepStrictEqual(parseLoadedRecord(jsonRoundTrippedRecord), state);
}

testSaveLoadRoundTrip();

// 8. V2-Core-29: location-gated buy/investigate (existing `location`
// Condition only). Wrong place -> requirements_not_met and no state change;
// view() lists them only at the right place and never with a reason (D-06/D-15).
function testLocationGatedActions() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const buy = { type: "perform", actionId: "act_buy_lantern" };
  const investigate = { type: "perform", actionId: "act_investigate_ruins" };
  const move = (state, to) => step(state, { type: "move", to }, worldData).state;
  const listed = (state, actionId) => view(state, worldData).actions.find((a) => a.actionId === actionId);

  const { state: village } = createInitialState({ worldSeed: "gate-check", data: worldData });

  // lantern: only at the market (money is sufficient everywhere, so the
  // rejection below is the location gate and nothing else)
  assert.ok(village.actors.player_1.money >= 5);
  const buyAtVillage = step(village, buy, worldData);
  assert.strictEqual(rejectedCode(buyAtVillage), "requirements_not_met");
  assert.deepStrictEqual(buyAtVillage.state, village);
  assert.strictEqual(listed(village, "act_buy_lantern"), undefined);

  const market = move(village, "loc_market");
  assert.deepStrictEqual(listed(market, "act_buy_lantern"), { actionId: "act_buy_lantern", available: true });
  const bought = step(market, buy, worldData);
  assert.strictEqual(rejectedCode(bought), undefined);
  assert.strictEqual(bought.state.actors.player_1.money, 3);
  assert.strictEqual(bought.state.actors.player_1.inventory.item_lantern, 1);

  // investigate: only at the ruins, even while holding the lantern
  const withLantern = bought.state;
  for (const [place, to] of [["market", null], ["village", "loc_village"]]) {
    const here = to === null ? withLantern : move(withLantern, to);
    const result = step(here, investigate, worldData);
    assert.strictEqual(rejectedCode(result), "requirements_not_met", `investigate at ${place}`);
    assert.deepStrictEqual(result.state, here);
    assert.strictEqual(listed(here, "act_investigate_ruins"), undefined);
  }
  const ruins = move(move(withLantern, "loc_village"), "loc_ruins");
  assert.strictEqual(ruins.actors.player_1.locationId, "loc_ruins");
  assert.deepStrictEqual(listed(ruins, "act_investigate_ruins"), { actionId: "act_investigate_ruins", available: true });
  assert.strictEqual(rejectedCode(step(ruins, investigate, worldData)), undefined);

  // at the ruins without the lantern the item half of the requirement still
  // holds the action back (the move link itself needs the lantern, so build
  // this state directly)
  const noLantern = structuredClone(ruins);
  delete noLantern.actors.player_1.inventory.item_lantern;
  assert.strictEqual(rejectedCode(step(noLantern, investigate, worldData)), "requirements_not_met");

  // no reason field anywhere in view() (D-06/D-15)
  for (const state of [village, market, ruins]) {
    for (const entry of view(state, worldData).actions) {
      assert.deepStrictEqual(Object.keys(entry).sort(), ["actionId", "available"]);
    }
  }
}

testLocationGatedActions();

// 9. V2-Core-29: recovery. Only the existing `hp` Effect: a positive add,
// clamped at max HP; the wrong place is rejected; a dead actor cannot use it.
function testRecovery() {
  const rest = { type: "perform", actionId: "act_rest_village" };
  const hpOf = (state) => state.actors.player_1.hp.current;
  const { state: fresh } = createInitialState({ worldSeed: "rest-check", data: worldData });

  // heals
  const hurt = structuredClone(fresh);
  hurt.actors.player_1.hp.current = 3;
  const healed = step(hurt, rest, worldData);
  assert.strictEqual(hpOf(healed.state), 7);
  assert.deepStrictEqual(healed.events.find((e) => e.type === "hp.changed").data.delta, 4);
  assert.strictEqual(healed.state.time.minute, hurt.time.minute + 60);
  assert.deepStrictEqual(validateState(healed.state), []);

  // clamp at max HP: 7 -> 10 (delta 3), then at full HP no hp change at all
  const again = step(healed.state, rest, worldData);
  assert.strictEqual(hpOf(again.state), 10);
  assert.strictEqual(again.state.actors.player_1.hp.max, 10);
  const full = step(again.state, rest, worldData);
  assert.strictEqual(hpOf(full.state), 10);
  assert.strictEqual(full.events.some((e) => e.type === "hp.changed"), false);

  // wrong place: rejected, state untouched
  const atMarket = step(hurt, { type: "move", to: "loc_market" }, worldData).state;
  const elsewhere = step(atMarket, rest, worldData);
  assert.strictEqual(elsewhere.events[0].data.code, "requirements_not_met");
  assert.deepStrictEqual(elsewhere.state, atMarket);
  assert.strictEqual(view(atMarket, worldData).actions.some((a) => a.actionId === "act_rest_village"), false);
}

testRecovery();

// 10. V2-Core-29: a dead actor is never healed or revived, and the existing
// death -> newCharacter -> succession path is intact next to the new content.
function testDeathIsNotRevivedByRecovery() {
  const drive = (state, actions) => actions.reduce((s, a) => step(s, a, worldData).state, state);
  let state = createInitialState({ worldSeed: "death-check", data: worldData }).state;
  // lantern, ruins, wait there until the hazard (3 hits x 4 HP) kills the 10-HP wanderer
  state = drive(state, [
    { type: "move", to: "loc_market" },
    { type: "perform", actionId: "act_buy_lantern" },
    { type: "move", to: "loc_village" },
    { type: "move", to: "loc_ruins" },
    { type: "wait", minutes: 30 },
    { type: "wait", minutes: 30 }
  ]);
  const dead = state.actors.player_1;
  assert.strictEqual(dead.hp.current, 0);
  assert.strictEqual(dead.alive, false);
  assert.deepStrictEqual(state.pending, { kind: "newCharacter" });

  // recovery on a dead player: rejected by the existing engine gate, state unchanged
  const rest = step(state, { type: "perform", actionId: "act_rest_village" }, worldData);
  assert.strictEqual(rest.events[0].type, "action.rejected");
  assert.strictEqual(rest.events[0].data.code, "pending_new_character");
  assert.deepStrictEqual(rest.state, state);
  assert.strictEqual(rest.state.actors.player_1.hp.current, 0);
  assert.strictEqual(rest.state.actors.player_1.alive, false);

  // succession still works: a new character starts (with the succession bonus)
  const next = step(state, { type: "startCharacter", templateId: "start_wanderer" }, worldData);
  assert.strictEqual(next.events.some((e) => e.type === "action.rejected"), false);
  assert.strictEqual(next.state.pending, null);
  const newId = next.state.player.actorId;
  assert.notStrictEqual(newId, "player_1");
  assert.strictEqual(next.state.actors[newId].hp.current, 10);
  assert.strictEqual(next.state.actors[newId].alive, true);
  assert.strictEqual(next.state.actors[newId].money, 8 + 3);
  // the previous character stays dead (never revived by the new start)
  assert.strictEqual(next.state.actors.player_1.alive, false);
  assert.strictEqual(next.state.actors.player_1.hp.current, 0);
  assert.deepStrictEqual(validateState(next.state), []);
}

testDeathIsNotRevivedByRecovery();

// 11. V2-Core-29: the canonical path also survives save -> load at every
// step (same next-step result), and its per-step JSON round-trip is lossless.
function testCanonicalSaveLoadAtEveryStep() {
  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  CANONICAL_ACTIONS.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
}

testCanonicalSaveLoadAtEveryStep();

console.log("V2-Core-22 data-world.test.js: all checks passed");
