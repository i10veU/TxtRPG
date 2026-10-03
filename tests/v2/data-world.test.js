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
import { validateData, evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

// The canonical playthrough (V2-Core-29/30: each step runs where it belongs):
// observe x2 in the village (crosses the 50-point investigation threshold
// together with the later +30), talk to the elder and pick the rumor option
// (the investigation needs that rumor), walk to the market and buy the
// lantern, walk back and on to the ruins, investigate (a real check(); the
// ruins hazard costs HP; a success confirms the rumor first-hand), return to
// the village and rest (the recovery action), then confront the bandit
// leader (a second real check()). worldSeed
// "frontier-canonical-4" was picked empirically (see PR description) to
// make both checks land on a non-"fail" tier, so the full path -- including
// the `case` Effect in act_confront_leader's success outcome -- is
// exercised by an ordinary deterministic replay, not a forced difficulty.
const CANONICAL_SEED = "frontier-canonical-4";
const CANONICAL_ACTIONS = [
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" },
  { type: "perform", actionId: "act_buy_lantern" },
  { type: "move", to: "loc_village" },
  { type: "move", to: "loc_ruins" },
  { type: "perform", actionId: "act_investigate_ruins" },
  { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_rest_village" },
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
    stepsLog.push({ action, events: result.events, stateAfter: result.state });
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
  // V2-Core-51 (D-80): the six common stats replace `wit`, 8 each
  assert.deepStrictEqual(actor.growth.growth_wanderer.stats, { str: 8, dex: 8, con: 8, int: 8, wis: 8, per: 8 });
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

  // V2-Core-30: the elder's rumor was learned before the ruins (one source, one
  // confirmation), and the successful investigation confirmed it first-hand --
  // same claim, a second source, no confidence gain (the pack sets none)
  const afterAsk = chooseAsk.stateAfter.knowledge.player_1.rum_ruins_secret;
  assert.deepStrictEqual(afterAsk, {
    rumorId: "rum_ruins_secret",
    factId: "fact_ruins_secret",
    claim: "bandit_hideout",
    source: "npc_elder",
    sources: ["npc_elder"],
    confidence: 60,
    confirmations: 1,
    firstSeenDay: 0,
    lastSeenDay: 0
  });
  assert.deepStrictEqual(chooseAsk.stateAfter.facts, { fact_ruins_secret: { value: "unknown", since: 0 } }, "asking the elder sets no fact (the seeded starting value stays, D-76)");
  const confirmed = finalState.knowledge.player_1.rum_ruins_secret;
  assert.deepStrictEqual(confirmed, { ...afterAsk, sources: ["npc_elder", "obs_loc_ruins"], confirmations: 2 });
  assert.ok(investigate.events.some((e) => e.type === "rumor.updated" && e.data.rumor === "rum_ruins_secret" && e.data.delta === 0));

  // §8.4: the hidden fact must never leak into view()
  const playerView = view(finalState, worldData);
  assert.deepStrictEqual(playerView.knowledge.rum_ruins_secret, confirmed, "view() shows the player's own knowledge entry as stored");
  assert.strictEqual(playerView.actor.growth.growth_wanderer.stats.int, 8); // V2-Core-51: the investigation's stat (was `wit`)
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

// Talk to the elder and ask about the ruins: teaches `rum_ruins_secret`.
function askElder(state) {
  const talked = step(state, { type: "perform", actionId: "act_talk_elder" }, worldData).state;
  return step(talked, { type: "choose", optionId: "opt_ask_ruins" }, worldData).state;
}

// 8. V2-Core-29: location-gated buy/investigate (existing `location`
// Condition only). Wrong place -> requirements_not_met and no state change;
// view() lists them only at the right place and never with a reason (D-06/D-15).
function testLocationGatedActions() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const buy = { type: "perform", actionId: "act_buy_lantern" };
  const investigate = { type: "perform", actionId: "act_investigate_ruins" };
  const move = (state, to) => step(state, { type: "move", to }, worldData).state;
  const listed = (state, actionId) => view(state, worldData).actions.find((a) => a.actionId === actionId);

  // the investigation also needs the elder's rumor (V2-Core-30); learn it up
  // front so this test isolates the location gate
  const village = askElder(createInitialState({ worldSeed: "gate-check", data: worldData }).state);

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

// 12. V2-Core-30: information -> judgment -> action -> result -> new
// information. The elder's rumor is what makes the investigation available;
// the investigation's outcome decides whether the rumor is confirmed.
function testInformationFlow() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const investigate = { type: "perform", actionId: "act_investigate_ruins" };
  const listed = (state, actionId) => view(state, worldData).actions.find((a) => a.actionId === actionId);
  const drive = (state, actions) => actions.reduce((s2, a) => step(s2, a, worldData).state, state);
  const toRuins = [
    { type: "move", to: "loc_market" },
    { type: "perform", actionId: "act_buy_lantern" },
    { type: "move", to: "loc_village" },
    { type: "move", to: "loc_ruins" }
  ];
  const fresh = createInitialState({ worldSeed: "info-flow", data: worldData }).state;

  // the elder's two options: asking teaches the rumor, small talk does not
  const talked = step(fresh, { type: "perform", actionId: "act_talk_elder" }, worldData).state;
  const asked = step(talked, { type: "choose", optionId: "opt_ask_ruins" }, worldData);
  assert.deepStrictEqual(asked.events.map((e) => e.type), ["relation.changed", "rumor.learned", "narration", "action.resolved"]);
  assert.deepStrictEqual(asked.events[0].data, { from: "npc_elder", to: "player_1", delta: 5 });
  assert.deepStrictEqual(asked.events[1].data, {
    rumor: "rum_ruins_secret", factId: "fact_ruins_secret", claim: "bandit_hideout", confidence: 60, delta: 60
  });
  assert.strictEqual(asked.state.relations["npc_elder:player_1"].score, 5);
  const small = step(talked, { type: "choose", optionId: "opt_small_talk" }, worldData);
  assert.deepStrictEqual(small.events.map((e) => e.type), ["relation.changed", "narration", "action.resolved"]);
  assert.strictEqual(small.state.relations["npc_elder:player_1"].score, 1);
  assert.strictEqual(small.state.knowledge, undefined, "small talk teaches nothing");
  // learning a rumor never sets the fact it is about (the fact stays hidden)
  assert.deepStrictEqual(asked.state.facts, { fact_ruins_secret: { value: "unknown", since: 0 } }); // only the starting value seeded at creation (D-76)

  // without the rumor the investigation is unavailable at the ruins -- with the
  // lantern in hand -- and hidden (no showWhenLocked), with no reason (D-06/D-15)
  for (const [label, state] of [["never talked", fresh], ["small talk only", small.state]]) {
    const atRuins = drive(state, toRuins);
    assert.strictEqual(atRuins.actors.player_1.locationId, "loc_ruins");
    assert.strictEqual(atRuins.actors.player_1.inventory.item_lantern, 1);
    const result = step(atRuins, investigate, worldData);
    assert.strictEqual(rejectedCode(result), "requirements_not_met", label);
    assert.deepStrictEqual(result.state, atRuins, label);
    assert.strictEqual(listed(atRuins, "act_investigate_ruins"), undefined, label);
  }

  // ...but that is not a dead end: the elder can be asked later (talking is repeatable)
  const late = drive(drive(small.state, toRuins), [
    { type: "move", to: "loc_village" },
    { type: "perform", actionId: "act_talk_elder" },
    { type: "choose", optionId: "opt_ask_ruins" },
    { type: "move", to: "loc_ruins" }
  ]);
  assert.deepStrictEqual(listed(late, "act_investigate_ruins"), { actionId: "act_investigate_ruins", available: true });

  // the rumor alone is not enough: location and lantern are still required
  assert.strictEqual(rejectedCode(step(asked.state, investigate, worldData)), "requirements_not_met", "rumor at the village");
  const ruinsNoLantern = structuredClone(drive(asked.state, toRuins));
  delete ruinsNoLantern.actors.player_1.inventory.item_lantern;
  assert.strictEqual(rejectedCode(step(ruinsNoLantern, investigate, worldData)), "requirements_not_met", "rumor at the ruins, no lantern");

  // outcome: a success confirms the rumor first-hand; a failure sets nothing
  const before = drive(asked.state, toRuins);
  const rumorEntry = (state) => state.knowledge.player_1.rum_ruins_secret;
  let success;
  let failure;
  for (let i = 0; i < 200 && !(success && failure); i++) {
    const trial = { ...before, rng: createInitialState({ worldSeed: `info-trial-${i}`, data: worldData }).state.rng };
    const result = step(trial, investigate, worldData);
    const tier = result.events.find((e) => e.type === "check.resolved").data.tier;
    if (tier === "fail") failure ??= result;
    else success ??= result;
  }
  assert.ok(success && failure, "found both a success and a failure among the trial seeds");

  assert.deepStrictEqual(rumorEntry(success.state).sources, ["npc_elder", "obs_loc_ruins"]);
  assert.strictEqual(rumorEntry(success.state).confirmations, 2);
  assert.strictEqual(rumorEntry(success.state).claim, "bandit_hideout");
  assert.strictEqual(success.state.facts.fact_ruins_secret.value, "bandit_hideout");
  assert.strictEqual(success.state.flags.ruins_secret_confirmed, true);

  assert.deepStrictEqual(rumorEntry(failure.state), rumorEntry(before), "a failed investigation leaves the rumor as it was");
  assert.deepStrictEqual(failure.state.facts, { fact_ruins_secret: { value: "unknown", since: 0 } }, "a failed investigation sets no fact (the seeded starting value stays, D-76)");
  assert.strictEqual(failure.state.flags?.ruins_secret_confirmed, undefined);
  assert.ok(!failure.events.some((e) => e.type.startsWith("rumor.")));
  // ...and the investigation can simply be retried
  assert.deepStrictEqual(listed(failure.state, "act_investigate_ruins"), { actionId: "act_investigate_ruins", available: true });

  // only the player's own knowledge is exposed: no accuracy/truth field, no facts
  for (const state of [asked.state, success.state]) {
    const playerView = view(state, worldData);
    assert.deepStrictEqual(
      Object.keys(playerView.knowledge.rum_ruins_secret).sort(),
      ["claim", "confidence", "confirmations", "factId", "firstSeenDay", "lastSeenDay", "rumorId", "source", "sources"]
    );
    assert.ok(!("facts" in playerView));
  }

  // confrontation keeps its own gating (flag + unlock), unchanged by the rumor
  assert.deepStrictEqual(listed(success.state, "act_confront_leader"), { actionId: "act_confront_leader", available: false }, "unlock still missing after one success");
}

testInformationFlow();

// 13. V2-Core-30: the information state survives save -> load at the points
// where it matters (rumor learned, rumor confirmed) and gives the same next
// action result.
function testInformationSaveLoad() {
  const { stepsLog } = runCanonicalPlaythrough(CANONICAL_SEED);
  for (const [label, index] of [["after asking the elder", stepOf("act_talk_elder") + 1], ["after the investigation", stepOf("act_investigate_ruins")]]) {
    const state = stepsLog[index].stateAfter;
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_info", state, { savedAt: 1 }))));
    assert.deepStrictEqual(reloaded, state, label);
    assert.deepStrictEqual(reloaded.knowledge, state.knowledge, label);
    assert.deepStrictEqual(view(reloaded, worldData), view(state, worldData), label);
    const next = CANONICAL_ACTIONS[index + 1];
    assert.deepStrictEqual(step(reloaded, next, worldData), step(state, next, worldData), `${label}: next action`);
  }
}

testInformationSaveLoad();

// 14. V2-Core-31: information -> relationship -> consequence. Once the
// investigation is confirmed the elder offers a third option; reporting writes
// the elder's relation edge, and a confrontation that succeeds reads that edge.
// The existing canonical path (never reporting) keeps its results.
const REPORT_ACTIONS = [
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_report_findings" }
];
// canonical path with the (optional) report between the rest and the confrontation
const REPORTED_ACTIONS = [...CANONICAL_ACTIONS.slice(0, -1), ...REPORT_ACTIONS, CANONICAL_ACTIONS.at(-1)];

function runActions(actions, worldSeed = CANONICAL_SEED) {
  let state = createInitialState({ worldSeed, data: worldData }).state;
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push({ action, ...result });
    state = result.state;
  }
  return { state, log };
}

function testRelationConsequence() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const confront = CANONICAL_ACTIONS.at(-1);
  const edge = (state, key) => state.relations?.[key];
  const talk = { type: "perform", actionId: "act_talk_elder" };

  // the report option is not available before the investigation is confirmed: the
  // engine rejects it, nothing changes (the choice stays pending and answerable)
  const fresh = createInitialState({ worldSeed: "consequence-gate", data: worldData }).state;
  const pending = step(fresh, talk, worldData).state;
  const early = step(pending, REPORT_ACTIONS[1], worldData);
  assert.strictEqual(rejectedCode(early), "requirements_not_met");
  assert.deepStrictEqual(early.state, pending);
  assert.deepStrictEqual(early.state.pending, { kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });
  assert.strictEqual(edge(early.state, "npc_elder:player_1"), undefined, "a rejected report writes no relation");
  assert.strictEqual(rejectedCode(step(early.state, { type: "choose", optionId: "opt_ask_ruins" }, worldData)), undefined);

  // knowing the rumor is not enough either: it is the confirmed investigation that
  // opens the option (rumor known, investigation not done yet -> still rejected)
  const knowsRumor = step(step(fresh, talk, worldData).state, { type: "choose", optionId: "opt_ask_ruins" }, worldData).state;
  assert.ok(knowsRumor.knowledge.player_1.rum_ruins_secret, "the rumor is known");
  assert.strictEqual(knowsRumor.flags?.ruins_secret_confirmed, undefined, "the investigation is not confirmed");
  const knowsRumorTalk = step(knowsRumor, talk, worldData).state;
  const rumorOnly = step(knowsRumorTalk, REPORT_ACTIONS[1], worldData);
  assert.strictEqual(rejectedCode(rumorOnly), "requirements_not_met");
  assert.deepStrictEqual(rumorOnly.state, knowsRumorTalk);

  // canonical path up to (not including) the confrontation
  const reported = runActions(REPORTED_ACTIONS.slice(0, -1));
  const [talkResult, reportResult] = reported.log.slice(-2);
  assert.strictEqual(rejectedCode(talkResult), undefined);
  assert.deepStrictEqual(
    reportResult.events.map((e) => e.type),
    ["relation.changed", "narration", "action.resolved"]
  );
  assert.deepStrictEqual(reportResult.events[0].data, { from: "npc_elder", to: "player_1", delta: 10, mode: "cooperation", tagAdded: "confidant" });
  // asked once (+5), reported once (+10)
  assert.deepStrictEqual(edge(reported.state, "npc_elder:player_1"), {
    score: 15, mode: "cooperation", lastDay: 0, cooperationCount: 1, conflictCount: 0, tags: ["confidant"]
  });
  assert.deepStrictEqual(validateState(reported.state), []);

  // the same confrontation, with and without the elder's tag: same check, same
  // case result, same time -- only the consequence differs
  const backed = step(reported.state, confront, worldData);
  const untagged = structuredClone(reported.state);
  untagged.relations["npc_elder:player_1"].tags = [];
  const unbacked = step(untagged, confront, worldData);
  const tierOf = (r) => r.events.find((e) => e.type === "check.resolved").data.tier;
  assert.strictEqual(tierOf(backed), "success");
  assert.strictEqual(tierOf(backed), tierOf(unbacked));
  assert.strictEqual(backed.state.cases.case_ruins_mystery.stage, "resolved");
  assert.deepStrictEqual(backed.state.cases, unbacked.state.cases);
  assert.strictEqual(backed.state.time.minute, unbacked.state.time.minute);
  assert.strictEqual(backed.state.time.minute, 270);
  assert.strictEqual(edge(backed.state, "npc_bandit_leader:player_1").score, -20);
  assert.strictEqual(edge(unbacked.state, "npc_bandit_leader:player_1").score, -10);
  const narrations = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
  assert.deepStrictEqual(narrations(backed), ["txt_confront_success", "txt_confront_backed"]);
  assert.deepStrictEqual(narrations(unbacked), ["txt_confront_success"]);

  // the path that never reports (the pre-existing canonical path) is unchanged
  const plain = runActions(CANONICAL_ACTIONS);
  assert.strictEqual(edge(plain.state, "npc_bandit_leader:player_1").score, -10);
  assert.deepStrictEqual(narrations(plain.log.at(-1)), ["txt_confront_success"]);
  assert.strictEqual(plain.state.time.minute, 270);

  // farming the score cannot stand in for the information: asking the elder over and
  // over (free, repeatable) raises the score but never writes the tag
  const farmedPath = [
    ...CANONICAL_ACTIONS.slice(0, 2),
    ...Array(4).fill([talk, { type: "choose", optionId: "opt_ask_ruins" }]).flat(),
    ...CANONICAL_ACTIONS.slice(4)
  ];
  const farmed = runActions(farmedPath);
  assert.ok(edge(farmed.state, "npc_elder:player_1").score >= 20);
  assert.deepStrictEqual(edge(farmed.state, "npc_elder:player_1").tags, []);
  assert.strictEqual(edge(farmed.state, "npc_bandit_leader:player_1").score, -10);

  // a failed confrontation has no backed consequence, tag or not
  let failed;
  for (let i = 0; i < 200 && !failed; i++) {
    const trial = { ...reported.state, rng: createInitialState({ worldSeed: `consequence-trial-${i}`, data: worldData }).state.rng };
    const result = step(trial, confront, worldData);
    if (tierOf(result) === "fail") failed = result;
  }
  assert.ok(failed, "found a failing trial seed");
  assert.deepStrictEqual(narrations(failed), ["txt_confront_fail"]);
  assert.strictEqual(edge(failed.state, "npc_bandit_leader:player_1").score, -20, "the fail outcome's own -20, no extra backed -10");
  assert.strictEqual(failed.state.cases, undefined, "a failure does not resolve the case");

  // the player sees the relation edges they are an end of, and never the truth
  const playerView = view(backed.state, worldData);
  assert.deepStrictEqual(playerView.relations["npc_elder:player_1"].tags, ["confidant"]);
  assert.strictEqual(playerView.relations["npc_bandit_leader:player_1"].score, -20);
  assert.ok(!("facts" in playerView));
}

testRelationConsequence();

// 15. V2-Core-31: the reported path replays deterministically, round-trips through
// JSON, and gives the same next result after a save -> load at every step.
function testConsequenceReplayAndSaveLoad() {
  const runA = runActions(REPORTED_ACTIONS);
  const runB = runActions(REPORTED_ACTIONS);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.notDeepStrictEqual(runA.state.rng, runActions(REPORTED_ACTIONS, "a-completely-different-seed").state.rng);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);

  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  REPORTED_ACTIONS.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_c${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testConsequenceReplayAndSaveLoad();

// 16. V2-Core-32: relationship -> organisation -> choice. A confrontation the village
// stood behind also cows the bandit organisation (its own edge towards the player); an
// elder option reads that edge and the leader's membership. The pre-existing
// (unbacked) confrontation is untouched.
const DISPERSE_ACTIONS = [
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_bandits_disperse" }
];

function testOrganisationConsequence() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const relationEvents = (result) => result.events.filter((e) => e.type === "relation.changed").map((e) => e.data);
  const talk = { type: "perform", actionId: "act_talk_elder" };
  const disperse = DISPERSE_ACTIONS[1];
  const orgEdge = (state) => state.relations?.["org_bandits:player_1"];
  const membership = (state) => state.relations?.["npc_bandit_leader:org_bandits"];
  // the option is "offered" when choosing it is accepted: the engine and the UI read the same `requires`
  const offered = (state) => rejectedCode(step(step(state, talk, worldData).state, disperse, worldData)) === undefined;

  const backed = runActions(REPORTED_ACTIONS);
  const plain = runActions(CANONICAL_ACTIONS);
  const confrontBacked = backed.log.at(-1);
  const confrontPlain = plain.log.at(-1);

  // the investigation is what wrote the leader's membership (the organisation's data is
  // only a reference id; organisations are ordinary relation edge ends, §7.1)
  assert.deepStrictEqual(membership(plain.state).tags, ["member"]);
  assert.strictEqual(plain.state.actors.org_bandits, undefined, "no actor record for the organisation");

  // A: the confrontation without the village's backing is exactly what it was
  assert.strictEqual(orgEdge(plain.state), undefined);
  assert.deepStrictEqual(confrontPlain.events.map((e) => e.type), ["check.resolved", "case.updated", "relation.changed", "narration", "time.advanced", "action.resolved"]);
  assert.deepStrictEqual(Object.keys(plain.state.relations).sort(), ["npc_bandit_leader:org_bandits", "npc_bandit_leader:player_1", "npc_elder:player_1"]);

  // B: backed, the organisation has its own attitude towards the player, and the player sees it
  assert.deepStrictEqual(relationEvents(confrontBacked).at(-1), { from: "org_bandits", to: "player_1", delta: -10, tagAdded: "cowed" });
  assert.deepStrictEqual(orgEdge(backed.state), { score: -10, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: ["cowed"] });
  const playerView = view(backed.state, worldData);
  assert.deepStrictEqual(playerView.relations["org_bandits:player_1"].tags, ["cowed"]);
  assert.strictEqual(playerView.relations["npc_bandit_leader:org_bandits"], undefined, "the player is not an end of the leader's membership edge");
  assert.deepStrictEqual(membership(backed.state).tags, ["member"], "the confrontation itself does not touch the membership");
  // same check, same case, same time: only the consequence differs
  assert.strictEqual(backed.state.time.minute, plain.state.time.minute);
  assert.deepStrictEqual(backed.state.cases, plain.state.cases);

  // the option follows the organisation state, not the report or the rumor alone
  assert.strictEqual(offered(plain.state), false, "not backed: never offered");
  assert.strictEqual(offered(runActions(REPORTED_ACTIONS.slice(0, -1)).state), false, "reported but not yet confronted: not offered");
  assert.strictEqual(offered(backed.state), true, "backed and confronted: offered");

  // a rejected choice changes nothing, leaves the choice pending, and adds no hidden relation
  const pendingPlain = step(plain.state, talk, worldData).state;
  const early = step(pendingPlain, disperse, worldData);
  assert.strictEqual(rejectedCode(early), "requirements_not_met");
  assert.deepStrictEqual(early.state, pendingPlain);
  assert.deepStrictEqual(early.state.pending, { kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });
  assert.strictEqual(rejectedCode(step(early.state, { type: "choose", optionId: "opt_small_talk" }, worldData)), undefined, "still answerable");

  // using it: the leader leaves the organisation, the elder is pleased, and the option closes itself
  const used = runActions([...REPORTED_ACTIONS, ...DISPERSE_ACTIONS]);
  const useResult = used.log.at(-1);
  // since V2-Core-45 the dispersal also starts its history (evt_bandits_tale: the fact and the day count, internal)
  assert.deepStrictEqual(useResult.events.map((e) => e.type), ["relation.changed", "relation.changed", "narration", "fact.changed", "signal.raised", "trigger.fired", "action.resolved"]);
  assert.deepStrictEqual(relationEvents(useResult), [
    { from: "npc_bandit_leader", to: "org_bandits", tagRemoved: "member" },
    { from: "npc_elder", to: "player_1", delta: 5 }
  ]);
  assert.deepStrictEqual(membership(used.state).tags, []);
  assert.strictEqual(used.state.relations["npc_elder:player_1"].score, backed.state.relations["npc_elder:player_1"].score + 5);
  assert.deepStrictEqual(orgEdge(used.state), orgEdge(backed.state), "the organisation's attitude is unchanged");
  assert.strictEqual(offered(used.state), false, "the membership is gone, so the option is gone");
  assert.strictEqual(rejectedCode(step(step(used.state, talk, worldData).state, disperse, worldData)), "requirements_not_met");
  assert.deepStrictEqual(validateState(used.state), []);

  // a failed confrontation writes no organisation edge and opens nothing
  const reported = runActions(REPORTED_ACTIONS.slice(0, -1));
  const confront = CANONICAL_ACTIONS.at(-1);
  let failed;
  for (let i = 0; i < 200 && !failed; i++) {
    const trial = { ...reported.state, rng: createInitialState({ worldSeed: `organisation-trial-${i}`, data: worldData }).state.rng };
    const result = step(trial, confront, worldData);
    if (result.events.find((e) => e.type === "check.resolved").data.tier === "fail") failed = result;
  }
  assert.ok(failed, "found a failing trial seed");
  assert.strictEqual(orgEdge(failed.state), undefined);
  assert.strictEqual(offered(failed.state), false);
}

testOrganisationConsequence();

// 17. V2-Core-32: the organisation path replays deterministically, round-trips through
// JSON, and gives the same next result after a save -> load at every step.
function testOrganisationReplayAndSaveLoad() {
  const path = [...REPORTED_ACTIONS, ...DISPERSE_ACTIONS];
  const runA = runActions(path);
  const runB = runActions(path);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);

  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  path.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_o${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testOrganisationReplayAndSaveLoad();

// 18. V2-Core-33: a result that outlives the moment it was made. The organisation
// state written by the confrontation and the elder's decision is read, in a later
// step and another place, by a `data.events` entry (once). Nothing decays it, and
// only a player who made the decisions is affected.
const MARKET = { type: "move", to: "loc_market" };
const VILLAGE = { type: "move", to: "loc_village" };
const MARKET_EVENT = "evt_market_reopens";
// the whole path up to and including the elder's decision (the market is not visited)
const DECIDED_ACTIONS = [...REPORTED_ACTIONS, ...DISPERSE_ACTIONS];

function testPersistentConsequence() {
  const fires = (result) => result.events.some((e) => e.type === "trigger.fired" && e.data.eventId === MARKET_EVENT);
  const moneyOf = (state) => state.actors[state.player.actorId].money;
  const drive = (state, actions) => actions.reduce((st, a) => step(st, a, worldData).state, state);
  const relationsJson = (state) => JSON.stringify(state.relations);

  const decided = runActions(DECIDED_ACTIONS).state;

  // the decision step itself does not fire it: the player is in the village, not the market
  assert.ok(!runActions(DECIDED_ACTIONS).log.some(fires), "nothing fires on the way to the decision");
  assert.strictEqual(decided.fired[MARKET_EVENT], undefined);

  // it persists: 2040 minutes of waiting and a round trip change none of the relation edges
  const aged = drive(decided, [{ type: "wait", minutes: 600 }, { type: "wait", minutes: 1440 }]);
  assert.strictEqual(relationsJson(aged), relationsJson(decided), "no relation edge decays with time");
  assert.strictEqual(aged.time.minute, decided.time.minute + 2040);

  // ...and a later step in another place reads it: the market pays once, and only then
  const visit = step(aged, MARKET, worldData);
  assert.deepStrictEqual(
    visit.events.map((e) => e.type),
    ["actor.moved", "time.advanced", "money.changed", "narration", "trigger.fired", "action.resolved"]
  );
  assert.deepStrictEqual(visit.events.find((e) => e.type === "money.changed").data, { delta: 3 });
  assert.strictEqual(visit.events.find((e) => e.type === "narration").data.textId, "txt_market_reopens");
  assert.strictEqual(visit.events.find((e) => e.type === "trigger.fired").visibility, "internal");
  assert.strictEqual(moneyOf(visit.state), moneyOf(aged) + 3);
  assert.deepStrictEqual(visit.state.fired[MARKET_EVENT], { count: 1, lastMinute: visit.state.time.minute });
  assert.strictEqual(relationsJson(visit.state), relationsJson(aged), "collecting it does not touch the relations");
  const revisit = drive(visit.state, [VILLAGE]);
  const second = step(revisit, MARKET, worldData);
  assert.ok(!fires(second), "once: the market does not pay twice");
  assert.strictEqual(moneyOf(second.state), moneyOf(visit.state));
  assert.deepStrictEqual(validateState(visit.state), []);

  // the same place and action, four different earlier histories
  const histories = {
    "no confrontation at all": CANONICAL_ACTIONS.slice(0, -1),
    "confronted without the village's backing": CANONICAL_ACTIONS,
    "backed, but the bandits' fate never decided": REPORTED_ACTIONS,
    "backed and decided": DECIDED_ACTIONS
  };
  const rewarded = Object.fromEntries(Object.entries(histories).map(([label, path]) => [label, fires(step(runActions(path).state, MARKET, worldData))]));
  assert.deepStrictEqual(rewarded, {
    "no confrontation at all": false,
    "confronted without the village's backing": false,
    "backed, but the bandits' fate never decided": false,
    "backed and decided": true
  });

  // a market visit before the decision pays nothing; the same visit afterwards does
  const early = runActions(REPORTED_ACTIONS).state; // backed, undecided
  const beforeVisit = step(early, MARKET, worldData);
  assert.ok(!fires(beforeVisit));
  assert.strictEqual(beforeVisit.state.fired[MARKET_EVENT], undefined, "a false trigger leaves no fired record");
  const decidedLater = drive(drive(beforeVisit.state, [VILLAGE]), DISPERSE_ACTIONS);
  assert.ok(fires(step(decidedLater, MARKET, worldData)));

  // a rejected decision leaves no hidden trace: no fired record, no reward later
  const rejected = step(step(runActions(CANONICAL_ACTIONS).state, { type: "perform", actionId: "act_talk_elder" }, worldData).state, DISPERSE_ACTIONS[1], worldData);
  assert.strictEqual(rejected.events[0].data.code, "requirements_not_met");
  assert.strictEqual(rejected.state.fired?.[MARKET_EVENT], undefined);

  // a failed confrontation leaves nothing to persist
  const reported = runActions(REPORTED_ACTIONS.slice(0, -1));
  let failed;
  for (let i = 0; i < 200 && !failed; i++) {
    const trial = { ...reported.state, rng: createInitialState({ worldSeed: `persistence-trial-${i}`, data: worldData }).state.rng };
    const result = step(trial, CANONICAL_ACTIONS.at(-1), worldData);
    if (result.events.find((e) => e.type === "check.resolved").data.tier === "fail") failed = result;
  }
  assert.ok(failed, "found a failing trial seed");
  assert.ok(!fires(step(failed.state, MARKET, worldData)));

  // death and succession: the `cowed` edge is the acting character's, so the successor
  // gets nothing -- and the character who made the decisions still does (control)
  const control = fires(step(decided, MARKET, worldData));
  assert.strictEqual(control, true);
  const dead = drive(decided, [
    { type: "move", to: "loc_ruins" },
    { type: "wait", minutes: 30 },
    { type: "wait", minutes: 30 },
    { type: "wait", minutes: 30 }
  ]);
  assert.strictEqual(dead.actors.player_1.alive, false);
  assert.strictEqual(dead.fired[MARKET_EVENT], undefined, "the market was never visited");
  const successor = step(dead, { type: "startCharacter", templateId: "start_wanderer" }, worldData).state;
  assert.strictEqual(successor.player.actorId, "player_2");
  assert.deepStrictEqual(Object.keys(successor.relations).filter((k) => k.startsWith("org_")), ["org_bandits:player_1"]);
  assert.deepStrictEqual(successor.relations["npc_bandit_leader:org_bandits"].tags, [], "the leader's departure is world state");
  const successorVisit = step(successor, MARKET, worldData);
  assert.ok(!fires(successorVisit));
  assert.strictEqual(moneyOf(successorVisit.state), moneyOf(successor));
  assert.deepStrictEqual(validateState(successorVisit.state), []);
}

testPersistentConsequence();

// 19. V2-Core-33: the same result after a save -> load, at every step of the path
// that reaches it, and with the `once` record surviving the load.
function testPersistentConsequenceSaveLoad() {
  const path = [...DECIDED_ACTIONS, MARKET, VILLAGE, MARKET];
  const runA = runActions(path);
  const runB = runActions(path);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);
  const paid = runA.log.filter((r) => r.events.some((e) => e.type === "trigger.fired" && e.data.eventId === MARKET_EVENT));
  assert.strictEqual(paid.length, 1, "paid exactly once over two market visits");

  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  path.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_p${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testPersistentConsequenceSaveLoad();

// 20. V2-Core-34: what belongs to a character and what belongs to the world (D-70).
// The classification is asserted here on real state, after a character has made a
// world-level change, died, and been succeeded.
const NEWS = "opt_ask_bandit_news";
const START_SUCCESSOR = { type: "startCharacter", templateId: "start_wanderer" };
const DIE_AT_RUINS = [
  { type: "move", to: "loc_ruins" },
  { type: "wait", minutes: 30 },
  { type: "wait", minutes: 30 },
  { type: "wait", minutes: 30 }
];

function testCharacterVersusWorldState() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const talk = { type: "perform", actionId: "act_talk_elder" };
  const drive = (state, actions) => actions.reduce((st, a) => step(st, a, worldData).state, state);
  const offered = (state, optionId) => rejectedCode(step(step(state, talk, worldData).state, { type: "choose", optionId }, worldData)) === undefined;
  const successorOf = (path) => {
    const dead = drive(runActions(path).state, DIE_AT_RUINS);
    assert.strictEqual(dead.actors.player_1.alive, false);
    assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
    const result = step(dead, START_SUCCESSOR, worldData);
    return { dead, result, state: result.state };
  };

  const { dead, result: started, state: successor } = successorOf(DECIDED_ACTIONS);

  // -- succession: it adds a character and applies the explicit rule, nothing else --
  assert.deepStrictEqual(successor.player, { actorId: "player_2", characterCount: 2 });
  for (const field of ["relations", "flags", "cases", "fired", "facts", "knowledge", "signals", "attempts", "time", "rng"]) {
    assert.deepStrictEqual(successor[field], dead[field], `startCharacter leaves ${field} alone`);
  }
  assert.deepStrictEqual(successor.actors.player_1, dead.actors.player_1, "the dead character's record is kept as it was");
  assert.deepStrictEqual(started.events.map((e) => e.type), ["character.started", "money.changed", "narration", "action.resolved"]);
  assert.deepStrictEqual(validateState(successor), []);

  // -- D: a character's own things start from the template, never from the predecessor --
  const fresh = successor.actors.player_2;
  assert.deepStrictEqual(fresh.inventory, {});
  assert.deepStrictEqual(fresh.growth.growth_wanderer.unlocks ?? {}, {});
  assert.strictEqual(fresh.locationId, "loc_village");
  assert.strictEqual(fresh.hp.current, 10);
  assert.strictEqual(fresh.money, 8 + 3, "template money plus the one thing rules.succession grants");
  assert.ok(dead.actors.player_1.inventory.item_lantern >= 1 && dead.actors.player_1.growth.growth_wanderer.unlocks.unl_keen_eye);

  // -- D: knowledge and the edges with a character at one end stay with that character --
  assert.deepStrictEqual(Object.keys(successor.knowledge), ["player_1"]);
  const anchored = Object.keys(successor.relations).filter((key) => key.split(":").some((id) => /^player_\d+$/.test(id)));
  assert.deepStrictEqual(anchored.sort(), ["npc_bandit_leader:player_1", "npc_elder:player_1", "org_bandits:player_1"]);
  const successorView = view(successor, worldData);
  assert.deepStrictEqual(successorView.knowledge, {});
  assert.deepStrictEqual(successorView.relations, {}, "the successor is an end of no edge, so the view shows none");
  assert.ok(!("facts" in successorView));

  // -- A: what has no character at an end is the world's, and the successor reads it as it stands --
  assert.deepStrictEqual(successor.flags, { ruins_secret_confirmed: true });
  assert.strictEqual(successor.cases.case_ruins_mystery.stage, "resolved");
  assert.deepStrictEqual(successor.relations["npc_bandit_leader:org_bandits"].tags, [], "the leader's departure is a world edge");
  assert.strictEqual(successor.time.minute, dead.time.minute, "time does not restart");
  const readsAsSuccessor = (condition) => evaluateCondition(condition, { state: successor, data: worldData, actorId: "player_2", contextKind: "player" });
  assert.strictEqual(readsAsSuccessor({ op: "flag", key: "ruins_secret_confirmed", eq: true }), true);
  assert.strictEqual(readsAsSuccessor({ op: "case", case: "case_ruins_mystery", stage: "resolved" }), true);
  assert.strictEqual(readsAsSuccessor({ op: "rumor", rumor: "rum_ruins_secret" }), false, "personal: the rumor was the predecessor's");
  assert.strictEqual(readsAsSuccessor({ op: "relation", from: "org_bandits", to: "self", tag: "cowed" }), false, "personal: the organisation's regard was for player_1");
  assert.strictEqual(readsAsSuccessor({ op: "unlock", id: "unl_keen_eye" }), false, "personal: growth");

  // -- B: an option that reads only world state is offered to the successor --
  assert.strictEqual(offered(successor, NEWS), true, "the successor is offered the news");
  assert.strictEqual(offered(runActions(DECIDED_ACTIONS).state, NEWS), true, "...exactly as the character who made it true is");
  const asked = step(step(successor, talk, worldData).state, { type: "choose", optionId: NEWS }, worldData);
  // since V2-Core-45 the elder's news is also a rumor the asker learns (their own knowledge, D-71 (1))
  assert.deepStrictEqual(asked.events.map((e) => e.type), ["relation.changed", "rumor.learned", "narration", "action.resolved"]);
  assert.strictEqual(asked.events[2].data.textId, "txt_bandit_news");
  assert.deepStrictEqual(asked.events[0].data, { from: "npc_elder", to: "player_2", delta: 1 }, "the effect lands on the asker's own edge");
  for (const field of ["flags", "cases", "fired", "facts"]) {
    assert.deepStrictEqual(asked.state[field], successor[field], `asking changes no world-level ${field}`);
  }
  assert.deepStrictEqual(Object.keys(asked.state.knowledge.player_2), ["rum_bandits_fate"], "the asker learns it for themselves");
  assert.deepStrictEqual(asked.state.knowledge.player_1, successor.knowledge.player_1, "the predecessor's knowledge is untouched");
  assert.deepStrictEqual(asked.state.relations["npc_elder:player_1"], successor.relations["npc_elder:player_1"], "the predecessor's edge is untouched");

  // -- ...but the predecessor's personal decision is not the successor's --
  assert.strictEqual(offered(successor, "opt_bandits_disperse"), false);
  const pendingTalk = step(successor, talk, worldData).state;
  const refused = step(pendingTalk, { type: "choose", optionId: "opt_bandits_disperse" }, worldData);
  assert.strictEqual(rejectedCode(refused), "requirements_not_met");
  assert.deepStrictEqual(refused.state, pendingTalk, "a refusal changes nothing and the choice stays pending");
  assert.deepStrictEqual(refused.state.pending, { kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });

  // -- the world state is the whole story: every other history offers the news to nobody --
  const otherHistories = {
    "nothing done": [],
    "investigated only": CANONICAL_ACTIONS.slice(0, 11),
    "confronted without the village's backing": CANONICAL_ACTIONS,
    "backed and confronted, fate never decided": REPORTED_ACTIONS
  };
  for (const [label, path] of Object.entries(otherHistories)) {
    assert.strictEqual(offered(runActions(path).state, NEWS), false, `${label}: not offered to the character`);
    if (path.length > 0) assert.strictEqual(offered(successorOf(path).state, NEWS), false, `${label}: not offered to the successor either`);
  }

  // -- the world-level trigger the news uses is true on exactly one history, in any context --
  const worldPair = worldData.choices.choice_elder_dialogue.options.find((o) => o.id === NEWS).requires;
  for (const [path, expected] of [[DECIDED_ACTIONS, true], [REPORTED_ACTIONS, false], [CANONICAL_ACTIONS, false], [[], false]]) {
    const state = runActions(path).state;
    for (const contextKind of ["player", "world"]) {
      assert.strictEqual(evaluateCondition(worldPair, { state, data: worldData, actorId: state.player.actorId, contextKind }), expected);
    }
  }
}

testCharacterVersusWorldState();

// 21. V2-Core-34: the successor's path is deterministic, survives JSON and save/load at
// every step, and gives the same result to the same input after loading.
function testSuccessorReplayAndSaveLoad() {
  const path = [...DECIDED_ACTIONS, ...DIE_AT_RUINS, START_SUCCESSOR, { type: "perform", actionId: "act_talk_elder" }, { type: "choose", optionId: NEWS }];
  const runA = runActions(path);
  const runB = runActions(path);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);
  assert.strictEqual(runA.state.player.actorId, "player_2");
  assert.strictEqual(runA.state.relations["npc_elder:player_2"].score, 1);

  let state = createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state;
  path.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_w${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testSuccessorReplayAndSaveLoad();

// 22. V2-Core-35: a world flag is not a character's own proof. `ruins_secret_confirmed` is
// world-unit (§4.1: a flag takes no subject), so the report option and the confrontation
// read the character's own relic instead -- the item only a successful investigation
// writes, into the investigating character's own inventory.
const INVESTIGATED_ACTIONS = CANONICAL_ACTIONS.slice(0, 11); // observe x2, elder, lantern, ruins, investigate, rest
const REPORT_OPTION = { type: "choose", optionId: "opt_report_findings" };
const OBSERVE = { type: "perform", actionId: "act_observe_village" };

// the successor's own way to the proof: ask the elder, observe twice, lantern, ruins, investigate, rest
const SUCCESSOR_OWN_ACTIONS = [
  START_SUCCESSOR,
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  OBSERVE,
  OBSERVE,
  MARKET,
  { type: "perform", actionId: "act_buy_lantern" },
  VILLAGE,
  { type: "move", to: "loc_ruins" },
  { type: "perform", actionId: "act_investigate_ruins" },
  VILLAGE,
  { type: "perform", actionId: "act_rest_village" }
];
const SUCCESSOR_PATH = [...INVESTIGATED_ACTIONS, ...DIE_AT_RUINS, ...SUCCESSOR_OWN_ACTIONS];

// a seed on which both characters' investigations succeed (partial/fail give no proof)
function seedWhereBothSucceed() {
  for (let i = 0; i < 60; i++) {
    const seed = `successor-gate-${i}`;
    const { log } = runActions(SUCCESSOR_PATH, seed);
    const tiers = log
      .filter((entry) => entry.action.actionId === "act_investigate_ruins")
      .map((entry) => entry.events.find((e) => e.type === "check.resolved").data.tier);
    if (tiers.length === 2 && tiers.every((tier) => tier === "success" || tier === "great")) return seed;
  }
  assert.fail("no trial seed where both investigations succeed");
}

function testPersonalConfirmationGate() {
  const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
  const talk = { type: "perform", actionId: "act_talk_elder" };
  const confront = CANONICAL_ACTIONS.at(-1);
  const drive = (state, actions) => actions.reduce((st, a) => step(st, a, worldData).state, state);
  const reportRejection = (state) => {
    const pending = step(state, talk, worldData).state;
    const result = step(pending, REPORT_OPTION, worldData);
    return { code: rejectedCode(result), unchanged: JSON.stringify(result.state) === JSON.stringify(pending), pending: result.state.pending };
  };
  const confrontEntry = (state) => view(state, worldData).actions.find((a) => a.actionId === "act_confront_leader");
  const seed = seedWhereBothSucceed();

  // -- what a flag is: world-unit, written by the success outcome, owned by nobody --
  const investigated = runActions(INVESTIGATED_ACTIONS, seed);
  assert.deepStrictEqual(investigated.state.flags, { ruins_secret_confirmed: true });
  const success = investigated.log[stepIndexOf(INVESTIGATED_ACTIONS, "act_investigate_ruins")];
  assert.ok(success.events.some((e) => e.type === "flag.changed" && e.data.key === "ruins_secret_confirmed"), "the flag is still the world's record");
  // ...and what marks THIS character's confirmation: the relic, in this character's inventory
  assert.strictEqual(investigated.state.actors.player_1.inventory.item_relic, 1);
  assert.deepStrictEqual(success.events.find((e) => e.type === "item.changed" && e.data.item === "item_relic").actorId, "player_1");
  // the rumor cannot tell an investigator from someone who only asked the elder: same confidence
  const onlyAsked = runActions(CANONICAL_ACTIONS.slice(0, 4), seed).state;
  assert.strictEqual(investigated.state.knowledge.player_1.rum_ruins_secret.confidence, onlyAsked.knowledge.player_1.rum_ruins_secret.confidence);
  assert.strictEqual(onlyAsked.actors.player_1.inventory.item_relic, undefined);

  // -- the character who investigated is unaffected: they can report and reach the confrontation --
  assert.strictEqual(reportRejection(investigated.state).code, undefined);
  assert.deepStrictEqual(confrontEntry(investigated.state), { actionId: "act_confront_leader", available: true });

  // -- History A: they die; a successor who never investigated cannot report or confront --
  const dead = drive(investigated.state, DIE_AT_RUINS);
  const successor = step(dead, START_SUCCESSOR, worldData).state;
  assert.deepStrictEqual(successor.flags, { ruins_secret_confirmed: true }, "the world's record is still there for the successor to read");
  assert.strictEqual(successor.actors.player_2.inventory.item_relic, undefined, "the proof is the predecessor's");
  const refused = reportRejection(successor);
  assert.strictEqual(refused.code, "requirements_not_met");
  assert.strictEqual(refused.unchanged, true, "a refusal changes nothing");
  assert.deepStrictEqual(refused.pending, { kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });
  assert.strictEqual(successor.relations["npc_elder:player_2"], undefined);
  assert.deepStrictEqual(confrontEntry(successor), { actionId: "act_confront_leader", available: false });
  // even with the keen-eye unlock the world flag alone does not open it
  const unlocked = drive(successor, [OBSERVE, OBSERVE, OBSERVE, OBSERVE]);
  assert.deepStrictEqual(unlocked.actors.player_2.growth.growth_wanderer.unlocks, { unl_keen_eye: true });
  assert.deepStrictEqual(confrontEntry(unlocked), { actionId: "act_confront_leader", available: false });
  const refusedConfront = step(unlocked, confront, worldData);
  assert.strictEqual(rejectedCode(refusedConfront), "requirements_not_met");
  assert.deepStrictEqual(refusedConfront.state, unlocked);
  assert.strictEqual(reportRejection(unlocked).code, "requirements_not_met");

  // -- the flag alone never opens a personal gate, on a character who has done nothing --
  const flagOnly = createInitialState({ worldSeed: "flag-only", data: worldData }).state;
  flagOnly.flags = { ruins_secret_confirmed: true };
  assert.strictEqual(reportRejection(flagOnly).code, "requirements_not_met");
  assert.strictEqual(reportRejection(drive(flagOnly, [{ type: "perform", actionId: "act_talk_elder" }, { type: "choose", optionId: "opt_ask_ruins" }])).code, "requirements_not_met", "knowing the rumor is not proof either");
  assert.deepStrictEqual(confrontEntry(drive(flagOnly, [OBSERVE, OBSERVE, OBSERVE, OBSERVE])), { actionId: "act_confront_leader", available: false });

  // -- a failed investigation writes no proof --
  const beforeInvestigation = runActions(INVESTIGATED_ACTIONS.slice(0, 8), seed).state;
  let failed;
  for (let i = 0; i < 200 && !failed; i++) {
    const trial = { ...beforeInvestigation, rng: createInitialState({ worldSeed: `proof-trial-${i}`, data: worldData }).state.rng };
    const result = step(trial, { type: "perform", actionId: "act_investigate_ruins" }, worldData);
    if (!["success", "great"].includes(result.events.find((e) => e.type === "check.resolved").data.tier)) failed = result;
  }
  assert.ok(failed, "found a failing trial seed");
  assert.strictEqual(failed.state.actors.player_1.inventory.item_relic, undefined, "no relic from a failed investigation");
  assert.strictEqual(failed.state.flags?.ruins_secret_confirmed, undefined);
  assert.strictEqual(reportRejection(drive(failed.state, [VILLAGE])).code, "requirements_not_met");

  // -- the successor earns their own proof, and then the gates open for them --
  const own = runActions(SUCCESSOR_PATH, seed);
  assert.strictEqual(own.state.actors.player_2.inventory.item_relic, 1);
  assert.strictEqual(own.state.actors.player_1.inventory.item_relic, 1, "the predecessor's record is unchanged");
  const owned = reportRejection(own.state);
  assert.strictEqual(owned.code, undefined, "their own proof opens the report");
  const reported = step(step(own.state, talk, worldData).state, REPORT_OPTION, worldData);
  assert.deepStrictEqual(reported.state.relations["npc_elder:player_2"].tags, ["confidant"]);
  assert.deepStrictEqual(reported.state.relations["npc_elder:player_1"].tags, [], "the predecessor never reported: their own edge has no confidant tag");
  assert.deepStrictEqual(confrontEntry(own.state), { actionId: "act_confront_leader", available: true });
  assert.strictEqual(rejectedCode(step(own.state, confront, worldData)), undefined);

  // -- world consequences are still readable by a successor with no proof (V2-Core-34) --
  const decidedDead = drive(runActions(DECIDED_ACTIONS).state, DIE_AT_RUINS);
  const decidedSuccessor = step(decidedDead, START_SUCCESSOR, worldData).state;
  const newsOffered = rejectedCode(step(step(decidedSuccessor, talk, worldData).state, { type: "choose", optionId: NEWS }, worldData)) === undefined;
  assert.strictEqual(newsOffered, true, "the world's history is offered");
  assert.strictEqual(reportRejection(decidedSuccessor).code, "requirements_not_met", "...but the predecessor's proof is not");
}

function stepIndexOf(actions, actionId) {
  return actions.findIndex((a) => a.actionId === actionId);
}

testPersonalConfirmationGate();

// 23. V2-Core-35: the successor's own path is deterministic, survives JSON, and gives the same
// result after a save -> load at every step.
function testSuccessorProofReplayAndSaveLoad() {
  const seed = seedWhereBothSucceed();
  const path = [...SUCCESSOR_PATH, { type: "perform", actionId: "act_talk_elder" }, REPORT_OPTION];
  const runA = runActions(path, seed);
  const runB = runActions(path, seed);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);
  assert.strictEqual(runA.state.actors.player_2.inventory.item_relic, 1);
  assert.deepStrictEqual(runA.state.relations["npc_elder:player_2"].tags, ["confidant"]);

  let state = createInitialState({ worldSeed: seed, data: worldData }).state;
  path.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_g${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    assert.deepStrictEqual(step(reloaded, action, worldData), step(state, action, worldData), `step ${index} result`);
    state = step(state, action, worldData).state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testSuccessorProofReplayAndSaveLoad();

// 24. V2-Core-36: what a succession passes on -- asserted on real state, per candidate
// (D-71). The classification comes from the existing contract (§9, D-47, D-70); nothing
// here decides a new inheritance rule. The pack's only succession effect is a fixed
// `money +3` that never reads the predecessor, so the successor is independent of
// whatever the predecessor did.
// the successor's own report and confrontation; since V2-Core-44 (D-71 (3) decided) the bandits stay
// dispersed after the successor's investigation, so there is no second decision about their fate
const B_DECIDE = [{ type: "perform", actionId: "act_talk_elder" }, REPORT_OPTION, CANONICAL_ACTIONS.at(-1)];

function testSuccessionAttribution() {
  const drive = (state, actions) => actions.reduce((st, a) => step(st, a, worldData).state, state);
  const dead = drive(runActions(DECIDED_ACTIONS).state, DIE_AT_RUINS);
  const started = step(dead, START_SUCCESSOR, worldData);
  const successor = started.state;
  const a = dead.actors.player_1;
  const b = successor.actors.player_2;
  assert.strictEqual(a.alive, false);
  assert.strictEqual(a.inventory.item_relic, 1);

  // the rule itself: a fixed grant and a narration, nothing read from the predecessor
  assert.deepStrictEqual(worldData.rules.succession, [{ op: "money", add: 3 }, { op: "narrate", textId: "txt_succession" }]);
  assert.deepStrictEqual(started.events.map((e) => e.type), ["character.started", "money.changed", "narration", "action.resolved"]);
  assert.strictEqual(started.events.find((e) => e.type === "money.changed").actorId, "player_2");

  // Personal, not inherited: the new actor comes from the template plus the fixed rule
  const template = worldData.characterTemplates.start_wanderer;
  assert.strictEqual(b.money, template.money + 3);
  assert.notStrictEqual(b.money, a.money);
  assert.deepStrictEqual(b.inventory, {});
  assert.deepStrictEqual(b.hp, { current: template.hp.max, max: template.hp.max });
  assert.strictEqual(b.alive, true);
  assert.strictEqual(b.locationId, template.locationId);
  assert.deepStrictEqual(b.tags, []);
  assert.strictEqual(b.growth.growth_wanderer.unlocks?.unl_keen_eye, undefined);
  assert.strictEqual(b.growth.growth_wanderer.proficiency?.investigation ?? 0, 0);
  assert.ok(a.growth.growth_wanderer.proficiency.investigation >= 50);
  assert.ok(a.growth.growth_wanderer.unlocks.unl_keen_eye);

  // ...including knowledge and every relation edge with the predecessor at one end
  assert.ok(Object.keys(successor.knowledge.player_1).length > 0);
  assert.strictEqual(successor.knowledge.player_2, undefined);
  const edgesOf = (state, id) => Object.keys(state.relations).filter((k) => k.endsWith(`:${id}`)).sort();
  assert.deepStrictEqual(edgesOf(successor, "player_1"), ["npc_bandit_leader:player_1", "npc_elder:player_1", "org_bandits:player_1"]);
  assert.deepStrictEqual(edgesOf(successor, "player_2"), []);
  const seen = view(successor, worldData);
  assert.strictEqual(seen.actor.id, "player_2");
  assert.deepStrictEqual(seen.knowledge ?? {}, {});
  assert.deepStrictEqual(seen.relations ?? {}, {});

  // World, kept exactly as it was at the moment of death
  for (const field of ["time", "rng", "flags", "signals", "facts", "cases", "fired", "attempts", "relations", "knowledge"]) {
    assert.deepStrictEqual(successor[field], dead[field], `${field} is untouched by the succession (money +3 is an actor field)`);
  }
  assert.strictEqual(successor.flags.ruins_secret_confirmed, true);
  assert.strictEqual(successor.cases.case_ruins_mystery.stage, "resolved");
  assert.ok(successor.fired.evt_ruins_hazard);
  assert.deepStrictEqual(successor.relations["npc_bandit_leader:org_bandits"].tags, []);
  assert.deepStrictEqual(successor.actors.player_1, dead.actors.player_1, "the dead actor's record is kept as it was");
  assert.strictEqual(successor.player.characterCount, 2);
  assert.deepStrictEqual(validateState(successor), []);

  // the successor is independent of the predecessor: a bare predecessor who died the same
  // way yields the identical new actor, and neither relics nor edges move anywhere
  // (a full-HP character needs a lantern to reach the ruins and a few more waits than the decided one)
  const bare = drive(createInitialState({ worldSeed: CANONICAL_SEED, data: worldData }).state, [MARKET, { type: "perform", actionId: "act_buy_lantern" }, VILLAGE, ...DIE_AT_RUINS, ...Array(8).fill({ type: "wait", minutes: 30 })]);
  assert.strictEqual(bare.actors.player_1.alive, false);
  assert.deepStrictEqual(step(bare, START_SUCCESSOR, worldData).state.actors.player_2, b, "nothing of the predecessor reaches the successor");

  // startCharacter is only accepted while a new character is pending
  assert.strictEqual(step(successor, START_SUCCESSOR, worldData).events[0].data.code, "invalid_action");
}

testSuccessionAttribution();

// a seed on which the predecessor's and the successor's own investigations and confrontations
// succeed and the predecessor decides the bandits' fate (used to put the same world condition in
// two characters' hands)
function seedForRewardMatrix() {
  const path = [...DECIDED_ACTIONS, ...DIE_AT_RUINS, ...SUCCESSOR_OWN_ACTIONS, ...B_DECIDE];
  const tiersOf = (log, actionId) => log.filter((entry) => entry.action.actionId === actionId).map((entry) => entry.events.find((e) => e.type === "check.resolved")?.data.tier);
  const good = (tier) => tier === "success" || tier === "great";
  for (let i = 0; i < 600; i++) {
    const seed = `reward-${i}`;
    const { log } = runActions(path, seed);
    const investigations = tiersOf(log, "act_investigate_ruins");
    const confrontations = tiersOf(log, "act_confront_leader");
    const decisions = log.filter((entry) => entry.action.optionId === "opt_bandits_disperse" && !entry.events.some((e) => e.type === "action.rejected"));
    if (investigations.length === 2 && investigations.every(good) && confrontations.length === 2 && confrontations.every(good) && decisions.length === 1) return seed;
  }
  assert.fail("no trial seed where both characters earn the bandits' fate");
}

// 25. V2-Core-36: who the world reward pays. `evt_market_reopens` is checked against the
// CURRENT player's own `cowed` edge and `once` is kept in the world-wide `state.fired`,
// so the reward goes to whoever stands in the market holding their own edge first --
// a predecessor's decision alone pays no successor, and a consumed `once` pays nobody
// again. These assertions record the current behaviour (D-71); they do not choose an
// owner for orphaned rewards.
function testRewardRecipient() {
  const seed = seedForRewardMatrix();
  const fires = (result) => result.events.some((e) => e.type === "trigger.fired" && e.data.eventId === MARKET_EVENT);
  const moneyOf = (state, id) => state.actors[id].money;
  const drive = (state, actions) => actions.reduce((st, a) => step(st, a, worldData).state, state);
  const offered = (state, optionId) => {
    const talked = step(state, { type: "perform", actionId: "act_talk_elder" }, worldData).state;
    return step(talked, { type: "choose", optionId }, worldData).events.every((e) => e.type !== "action.rejected");
  };
  const aDecided = runActions(DECIDED_ACTIONS, seed).state;
  const dieThenStart = (state) => step(drive(state, DIE_AT_RUINS), START_SUCCESSOR, worldData).state;

  // V1: A collects, then dies -- B standing in the market with no edge of their own gets nothing
  const aCollected = step(aDecided, MARKET, worldData);
  assert.ok(fires(aCollected));
  assert.strictEqual(moneyOf(aCollected.state, "player_1"), moneyOf(aDecided, "player_1") + 3);
  const bAfterCollect = dieThenStart(drive(aCollected.state, [VILLAGE]));
  const bVisit1 = step(bAfterCollect, MARKET, worldData);
  assert.ok(!fires(bVisit1));
  assert.strictEqual(moneyOf(bVisit1.state, "player_2"), moneyOf(bAfterCollect, "player_2"));
  assert.deepStrictEqual(bVisit1.state.fired[MARKET_EVENT], aCollected.state.fired[MARKET_EVENT], "A's consumed once is untouched");

  // V2: A dies before collecting -- the reward stays unclaimed: B's visit pays nothing, leaves no
  // fired record, and A (dead) can no longer collect it
  const bUncollected = dieThenStart(aDecided);
  assert.strictEqual(bUncollected.fired[MARKET_EVENT], undefined);
  assert.deepStrictEqual(bUncollected.relations["org_bandits:player_1"].tags, ["cowed"], "A's edge is still on the dead character's record");
  assert.strictEqual(step(drive(aDecided, DIE_AT_RUINS), MARKET, worldData).events[0].data.code, "pending_new_character");
  const bVisit2 = step(bUncollected, MARKET, worldData);
  assert.ok(!fires(bVisit2));
  assert.strictEqual(bVisit2.state.fired[MARKET_EVENT], undefined);
  assert.strictEqual(moneyOf(bVisit2.state, "player_2"), moneyOf(bUncollected, "player_2"));

  // V3: B makes the world condition true for their own character -- B's own proof leaves the
  // dispersal A decided as it is (V2-Core-44, D-71 (3) decided), B's own report and confrontation
  // give B an edge of their own, and only then does the market pay B
  const bProof = drive(bUncollected, SUCCESSOR_OWN_ACTIONS.slice(1));
  assert.deepStrictEqual(bProof.relations["npc_bandit_leader:org_bandits"].tags, [], "a later investigation does not undo the dispersal");
  assert.ok(offered(bProof, NEWS), "the bandit-news option stays open: the world's history holds");
  assert.ok(!fires(step(bProof, MARKET, worldData)), "no edge of B's own yet");
  const bDecided = drive(bProof, B_DECIDE);
  assert.deepStrictEqual(bDecided.relations["org_bandits:player_2"].tags, ["cowed"]);
  assert.deepStrictEqual(bDecided.relations["npc_bandit_leader:org_bandits"].tags, []);
  const bPaid = step(bDecided, MARKET, worldData);
  assert.ok(fires(bPaid));
  assert.strictEqual(moneyOf(bPaid.state, "player_2"), moneyOf(bDecided, "player_2") + 3);
  assert.strictEqual(moneyOf(bPaid.state, "player_1"), moneyOf(aDecided, "player_1"), "the dead A is never paid");
  assert.strictEqual(bPaid.state.fired[MARKET_EVENT].count, 1);

  // V3c: A collected first -- the same B path with the same own edge is never paid (`once` is world-wide)
  const bAfterCollectDecided = drive(drive(bAfterCollect, SUCCESSOR_OWN_ACTIONS.slice(1)), B_DECIDE);
  assert.deepStrictEqual(bAfterCollectDecided.relations["org_bandits:player_2"].tags, ["cowed"]);
  const bDenied = step(bAfterCollectDecided, MARKET, worldData);
  assert.ok(!fires(bDenied));
  assert.strictEqual(moneyOf(bDenied.state, "player_2"), moneyOf(bAfterCollectDecided, "player_2"));

  // save -> load before the visit, and a JSON round trip, change nothing about who is paid
  for (const state of [aDecided, bUncollected, bDecided]) {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_reward", state, { savedAt: 1 }))));
    assert.deepStrictEqual(reloaded, state);
    assert.deepStrictEqual(step(reloaded, MARKET, worldData), step(state, MARKET, worldData));
    assert.deepStrictEqual(validateState(step(state, MARKET, worldData).state), []);
  }

  // the same input, the same result
  assert.deepStrictEqual(step(bDecided, MARKET, worldData), step(bDecided, MARKET, worldData));
}

testRewardRecipient();

// 26. V2-Core-36: the predecessor -> death -> successor -> reward path replays
// deterministically, survives JSON, and gives the same result after a save -> load at
// every step; rejected actions leave the state untouched.
function testSuccessionReplayAndSaveLoad() {
  const seed = seedForRewardMatrix();
  const path = [...DECIDED_ACTIONS, ...DIE_AT_RUINS, ...SUCCESSOR_OWN_ACTIONS, ...B_DECIDE, MARKET];
  const runA = runActions(path, seed);
  const runB = runActions(path, seed);
  assert.deepStrictEqual(runA.state, runB.state);
  assert.deepStrictEqual(runA.log, runB.log);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(runA.state)), runA.state);
  assert.deepStrictEqual(validateState(runA.state), []);
  assert.strictEqual(runA.state.fired[MARKET_EVENT].count, 1);
  assert.strictEqual(runA.state.player.actorId, "player_2");

  let state = createInitialState({ worldSeed: seed, data: worldData }).state;
  path.forEach((action, index) => {
    const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(`slot_s${index}`, state, { savedAt: index }))));
    assert.deepStrictEqual(reloaded, state, `state before step ${index}`);
    const result = step(state, action, worldData);
    assert.deepStrictEqual(step(reloaded, action, worldData), result, `step ${index} result`);
    if (result.events[0]?.type === "action.rejected") assert.deepStrictEqual(result.state, state, `rejected step ${index} changes nothing`);
    state = result.state;
  });
  assert.deepStrictEqual(state, runA.state);
}

testSuccessionReplayAndSaveLoad();

console.log("V2-Core-22 data-world.test.js: all checks passed");
