const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js",
  "web/data/places.js",
  "web/data/npcs.js",
  "web/data/cases.js",
  "web/core/economy-world.js",
  "web/core/regional-economy.js",
  "web/core/faction-world.js",
  "web/core/organization-world.js",
  "web/core/npc-goals.js",
  "web/core/organization-relations.js",
  "web/core/npc-relations.js",
  "web/core/player-quests.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

function createRuntime(workerMode) {
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.1;
  const context = { console, Math: deterministicMath, JSON, Object, Array, String, Number, Boolean, Date };
  context.window = context;
  if (workerMode) {
    context.self = context;
    context.postMessage = () => {};
    context.importScripts = function () {
      for (const relative of arguments) {
        const file = path.resolve(root, "web/worker", relative);
        vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
      }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, "web/worker/game-worker.js"), "utf8"), context, { filename: "web/worker/game-worker.js" });
    return context;
  }
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));
  return context;
}

function initialize(RPG) {
  const state = RPG.Core.createDefaultState(RPG.Data.npcs);
  RPG.Core.ensureEconomy(state);
  RPG.Core.ensureRegionalEconomy(state);
  RPG.Core.ensureOrganizations(state);
  RPG.Core.ensureOrganizationRelations(state);
  RPG.Core.ensureNPCRelations(state);
  RPG.Core.ensureNPCGoals(state);
  RPG.Core.ensureCaseCausality(state);
  RPG.Data.ensureCases(state);
  RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
  return state;
}

function loopAction(RPG, state, text) {
  const before = RPG.Core.getAbsoluteMinute(state);
  const result = RPG.Core.resolveAction(state, text);
  const after = RPG.Core.getAbsoluteMinute(state);
  RPG.Core.simulateNPCs(state, Math.max(0, after - before));
  RPG.Core.simulateOrganizations(state, after);
  RPG.Core.simulateOrganizationRelations(state, after);
  RPG.Core.simulateNPCRelations(state, after);
  RPG.Core.simulateEconomy(state, after);
  RPG.Core.simulateRegionalEconomy(state, after);
  RPG.Core.simulateCaseCausality(state, after);
  RPG.Core.applyCampaignProgress(state, RPG.Data.caseDefinitions);
  return result;
}

function resolveOpenCase(RPG, state, caseId, preferredChoiceId) {
  const def = RPG.Data.caseDefinitions[caseId];
  let choice = def.choices.find((entry) => entry.id === preferredChoiceId);
  if (!choice) choice = def.choices[0];
  let attempts = 0;
  while (RPG.Data.deterministicRoll(caseId, choice.id, state.world.day) < 3 + choice.risk && attempts < 30) {
    state.world.day += 1;
    state.world.minutes = 360;
    attempts += 1;
    RPG.Data.ensureCases(state);
  }
  const result = loopAction(RPG, state, "사건 " + caseId + " " + choice.id);
  assert(result.narrative.includes("판정"), caseId + " should resolve through deterministic roll");
  return choice.id;
}

(function () {
  const fallbackContext = createRuntime(false);
  const RPG = fallbackContext.AnonymousRPG;
  const state = initialize(RPG);

  state.world.eventSignals.waterLedgerGap = 1;
  RPG.Data.ensureCases(state);
  assert(state.world.cases.some((entry) => entry.id === "water-ledger" && entry.status === "open"));

  resolveOpenCase(RPG, state, "water-ledger");
  state.world.day += 1;
  state.world.minutes = 360;
  RPG.Data.ensureCases(state);
  assert(state.world.cases.some((entry) => entry.id === "water-ledger-aftershock" && entry.status === "open"));

  const selectedPolicy = resolveOpenCase(RPG, state, "water-ledger-aftershock", "enforce");
  assert(["council", "enforce", "decentralize"].includes(selectedPolicy));

  const policyInfo = loopAction(RPG, state, "급수상황");
  assert.strictEqual(policyInfo.changed, false);
  assert(policyInfo.narrative.includes("후속 영향 단계"));

  for (let i = 0; i < 12; i += 1) loopAction(RPG, state, "잔다");

  const track = state.world.waterAftermath;
  assert(track, "water aftermath state should exist");
  assert.strictEqual(track.policy, selectedPolicy);
  assert(track.stage >= 1 && track.stage <= 3, "water aftermath should advance over multiple days");
  assert(track.lastAdvanceDay >= track.startedDay + 1);

  const roundTrip = RPG.Core.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.strictEqual(roundTrip.world.waterAftermath.policy, selectedPolicy);
  assert.strictEqual(roundTrip.world.waterAftermath.stage, track.stage);
  assert(roundTrip.world.caseHistory.some((entry) => entry.caseId === "water-ledger-aftershock"));

  const malformed = RPG.Core.normalizeState({
    world: {
      waterAftermath: { active: true, policy: "bad", stage: "oops", lastAdvanceDay: "x" },
      caseHistory: [null, { caseId: "water-ledger-aftershock", choiceId: 10, status: "???" }]
    }
  });
  assert.strictEqual(malformed.world.waterAftermath.policy, null);
  assert.strictEqual(malformed.world.waterAftermath.active, false);
  assert.strictEqual(malformed.world.waterAftermath.stage, 0);
  assert.strictEqual(malformed.world.caseHistory.length, 1);
  assert.strictEqual(malformed.world.caseHistory[0].choiceId, null);

  function runLongScenario() {
    const runtime = createRuntime(false).AnonymousRPG;
    const longState = initialize(runtime);
    longState.world.caseHistory.push({ caseId: "water-ledger-aftershock", choiceId: "enforce", status: "resolved", resolutionDay: 0, resolutionMinute: 360 });
    longState.world.waterAftermath = { active: true, policy: "enforce", stage: 0, startedDay: 0, lastAdvanceDay: -1, lastNarratedDay: -1 };
    for (let day = 0; day < 160; day += 1) {
      runtime.Core.advanceTime(longState, 1440);
      const absolute = runtime.Core.getAbsoluteMinute(longState);
      runtime.Core.simulateNPCs(longState, 1440);
      runtime.Core.simulateOrganizations(longState, absolute);
      runtime.Core.simulateOrganizationRelations(longState, absolute);
      runtime.Core.simulateNPCRelations(longState, absolute);
      runtime.Core.simulateEconomy(longState, absolute);
      runtime.Core.simulateRegionalEconomy(longState, absolute);
      runtime.Core.simulateCaseCausality(longState, absolute);
      runtime.Core.applyCampaignProgress(longState, runtime.Data.caseDefinitions);
    }
    const places = new Set(Object.keys(runtime.Data.places));
    Object.values(longState.npcs).forEach((npc) => assert(places.has(npc.place), "NPC place must remain valid"));
    [longState.world.grainSupply, longState.world.tension, longState.world.security, longState.world.trustInAdministration, longState.world.rumorPressure].forEach((value) => {
      assert(value >= 0 && value <= 100, "world scalar should stay normalized");
    });
    assert(longState.world.caseHistory.length <= 40, "case history should stay bounded");
    const aftermathEntries = longState.world.caseHistory.filter((entry) => entry.caseId === "water-ledger-aftershock");
    const unique = new Set(aftermathEntries.map((entry) => entry.caseId + ":" + entry.choiceId + ":" + entry.resolutionDay));
    assert.strictEqual(unique.size, aftermathEntries.length, "aftershock consequence should not duplicate identical history entries");
    assert(longState.world.waterAftermath.stage <= 3);
    return {
      day: longState.world.day,
      minutes: longState.world.minutes,
      water: longState.world.waterAftermath,
      trust: longState.world.trustInAdministration,
      tension: longState.world.tension,
      security: longState.world.security,
      rumorPressure: longState.world.rumorPressure,
      organizations: Object.fromEntries(Object.entries(longState.world.organizations).map(([id, org]) => [id, org.goalPressure])),
      history: longState.world.caseHistory.map((entry) => [entry.caseId, entry.choiceId, entry.status, entry.resolutionDay])
    };
  }

  const deterministicA = runLongScenario();
  const deterministicB = runLongScenario();
  assert.strictEqual(JSON.stringify(deterministicA), JSON.stringify(deterministicB), "repeatable simulation should remain deterministic for fixed inputs");

  function runWorker(actions, seedState) {
    const runtime = createRuntime(true);
    const messages = [];
    runtime.postMessage = (message) => messages.push(message);
    function send(type, payload) {
      messages.length = 0;
      runtime.onmessage({ data: Object.assign({ type }, payload || {}) });
      const reply = messages[0];
      assert(reply, "worker did not reply");
      assert.notStrictEqual(reply.type, "ERROR", reply.payload && reply.payload.message);
      return reply;
    }
    const ready = send("INIT", { state: seedState });
    assert.strictEqual(ready.type, "READY");
    let workerState = ready.payload.state;
    actions.forEach((text) => {
      const update = send("ACTION", { text });
      assert.strictEqual(update.type, "UPDATE");
      workerState = update.payload.state;
    });
    return workerState;
  }

  function paritySnapshot(current) {
    return {
      day: current.world.day,
      minutes: current.world.minutes,
      water: current.world.waterAftermath,
      trust: current.world.trustInAdministration,
      tension: current.world.tension,
      security: current.world.security,
      rumorPressure: current.world.rumorPressure,
      caseHistory: current.world.caseHistory.map((entry) => [entry.caseId, entry.choiceId, entry.status, entry.resolutionDay])
    };
  }

  const paritySeed = initialize(RPG);
  paritySeed.world.caseHistory.push({ caseId: "water-ledger-aftershock", choiceId: "council", status: "resolved", resolutionDay: 0, resolutionMinute: 360 });
  paritySeed.world.waterAftermath = { active: true, policy: "council", stage: 0, startedDay: 0, lastAdvanceDay: -1, lastNarratedDay: -1 };
  const actionSequence = ["급수상황", "잔다", "잔다", "잔다", "급수상황"];

  const fallbackParityState = RPG.Core.normalizeState(JSON.parse(JSON.stringify(paritySeed)));
  actionSequence.forEach((text) => loopAction(RPG, fallbackParityState, text));
  const workerParityState = runWorker(actionSequence, RPG.Core.normalizeState(JSON.parse(JSON.stringify(paritySeed))));
  const fallbackSnapshot = paritySnapshot(fallbackParityState);
  const workerSnapshot = paritySnapshot(workerParityState);
  assert.strictEqual(fallbackSnapshot.day, workerSnapshot.day);
  assert.strictEqual(fallbackSnapshot.minutes, workerSnapshot.minutes);
  assert.strictEqual(JSON.stringify(fallbackSnapshot.water), JSON.stringify(workerSnapshot.water));
  assert.strictEqual(JSON.stringify(fallbackSnapshot.caseHistory), JSON.stringify(workerSnapshot.caseHistory));
  assert.strictEqual(fallbackSnapshot.trust, workerSnapshot.trust);
  assert.strictEqual(fallbackSnapshot.security, workerSnapshot.security);
  assert.strictEqual(fallbackSnapshot.rumorPressure, workerSnapshot.rumorPressure);
  assert(Math.abs(fallbackSnapshot.tension - workerSnapshot.tension) <= 1, "worker/fallback tension drift should stay within one tick");

  console.log("Phase 273 persistent world state and simulation integrity: PASS");
  console.log("Water-ledger aftermath remains persistent across normalization, advances over days, and stays worker/fallback parity-safe: PASS");
})();
