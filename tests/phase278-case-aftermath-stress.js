const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/action-resolver.js", "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

function createFallbackRuntime() {
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.1;
  const context = { window: {}, console, Math: deterministicMath, JSON, Object, Array, String, Number, Boolean, Date };
  context.window = context;
  vm.createContext(context);
  files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));
  return context.AnonymousRPG;
}

function runFallback(actions) {
  const RPG = createFallbackRuntime();
  const state = RPG.Core.createDefaultState(RPG.Data.npcs);
  state.world.flags.warehouseSuspicion = true;
  RPG.Core.ensureEconomy(state);
  RPG.Core.ensureRegionalEconomy(state);
  RPG.Core.ensureOrganizations(state);
  RPG.Core.ensureOrganizationRelations(state);
  RPG.Core.ensureNPCRelations(state);
  RPG.Core.ensureNPCGoals(state);
  RPG.Core.ensureCaseCausality(state);
  RPG.Data.ensureCases(state);
  actions.forEach((text) => {
    const before = RPG.Core.getAbsoluteMinute(state);
    RPG.Core.resolveAction(state, text);
    const after = RPG.Core.getAbsoluteMinute(state);
    RPG.Core.simulateNPCs(state, Math.max(0, after - before));
    RPG.Core.simulateOrganizations(state, after);
    RPG.Core.simulateOrganizationRelations(state, after);
    RPG.Core.simulateNPCRelations(state, after);
    RPG.Core.simulateEconomy(state, after);
    RPG.Core.simulateRegionalEconomy(state, after);
    RPG.Core.simulateCaseCausality(state, after);
  });
  return { RPG, state };
}

function createWorkerRuntime() {
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.1;
  const context = { console, Math: deterministicMath, JSON, Object, Array, String, Number, Boolean, Date };
  context.self = context;
  context.window = context;
  const messages = [];
  context.postMessage = (message) => messages.push(message);
  context.importScripts = function () {
    for (const relative of arguments) {
      const file = path.resolve(root, "web/worker", relative);
      vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "web/worker/game-worker.js"), "utf8"), context, { filename: "web/worker/game-worker.js" });
  return { context, messages };
}

function runWorker(actions, initialState) {
  const runtime = createWorkerRuntime();
  function send(type, payload) {
    runtime.messages.length = 0;
    runtime.context.onmessage({ data: Object.assign({ type }, payload || {}) });
    const message = runtime.messages[0];
    assert(message, "Worker did not reply to " + type);
    assert.notStrictEqual(message.type, "ERROR", message.payload && message.payload.message);
    return message;
  }
  const ready = send("INIT", { state: initialState });
  assert.strictEqual(ready.type, "READY");
  let state = ready.payload.state;
  actions.forEach((text) => {
    const update = send("ACTION", { text });
    assert.strictEqual(update.type, "UPDATE");
    state = update.payload.state;
  });
  return state;
}

function snapshot(state) {
  const causalCases = state.world.cases
    .filter((entry) => entry.id === "grain-warehouse" || entry.id === "grain-aftershock")
    .map((entry) => [entry.id, entry.status, entry.branch]);
  return {
    day: state.world.day,
    cases: causalCases,
    caseHistory: state.world.caseHistory.map((entry) => [entry.caseId, entry.choiceId, entry.status, entry.resolutionDay]),
    trust: state.world.trustInAdministration,
    relations: { archive: state.world.relations.archive, merchants: state.world.relations.merchants },
    rumorPressure: state.world.rumorPressure,
    bounded: [state.world.caseHistory.length, state.log.length, state.world.eventHistory.length, state.world.rumors.length]
  };
}

const actions = ["사건 grain-warehouse audit", "잔다", "잔다", "잔다", "사건 grain-aftershock publish"];
for (let i = 0; i < 120; i += 1) actions.push("잔다", "잔다", "잔다");

const fallback = runFallback(actions);
assert(fallback.state.world.cases.some((entry) => entry.id === "grain-aftershock" && entry.status === "resolved"));
assert(fallback.state.world.caseHistory.some((entry) => entry.caseId === "grain-aftershock"));
assert(fallback.state.world.caseHistory.filter((entry) => entry.caseId === "grain-aftershock").length === 1);
assert(fallback.state.world.caseHistory.length <= 40);
assert(fallback.state.log.length <= 60);
assert(fallback.state.world.eventHistory.length <= 80);
assert(fallback.state.world.rumors.length <= 30);

// Replay from an equivalent fresh seed so the two runtime paths exercise the same commands.
const workerSeed = fallback.RPG.Core.createDefaultState(fallback.RPG.Data.npcs);
workerSeed.world.flags.warehouseSuspicion = true;
const worker = runWorker(actions, workerSeed);
assert.deepStrictEqual(snapshot(worker).day, snapshot(fallback.state).day);
assert(snapshot(worker).bounded[0] <= 40);
assert(snapshot(worker).bounded[1] <= 60);
assert(snapshot(worker).bounded[2] <= 80);
assert(snapshot(worker).bounded[3] <= 30);
assert.strictEqual(JSON.stringify(snapshot(worker).cases), JSON.stringify(snapshot(fallback.state).cases));
assert.strictEqual(JSON.stringify(snapshot(worker).caseHistory), JSON.stringify(snapshot(fallback.state).caseHistory));
assert.deepStrictEqual(snapshot(worker).trust, snapshot(fallback.state).trust);
assert.strictEqual(JSON.stringify(snapshot(worker).relations), JSON.stringify(snapshot(fallback.state).relations));
assert.deepStrictEqual(snapshot(worker).rumorPressure, snapshot(fallback.state).rumorPressure);

console.log("Phase 278 delayed case aftermath: PASS");
console.log("Normal action loop opens and resolves one next-day aftershock without duplicates: PASS");
console.log("120-day fallback/Worker replay remains bounded and parity-safe: PASS");
