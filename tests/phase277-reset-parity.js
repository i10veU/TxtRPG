const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const coreFiles = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/player-quests.js", "web/core/action-resolver.js", "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

function loadCore(context) {
  vm.createContext(context);
  coreFiles.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));
  return context.AnonymousRPG;
}

function initializeFallback(RPG) {
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

const fallbackContext = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
fallbackContext.window = fallbackContext;
const fallbackRPG = loadCore(fallbackContext);
const fallbackState = initializeFallback(fallbackRPG);

const messages = [];
const workerContext = {
  console, Math, JSON, Object, Array, String, Number, Boolean, Date,
  setTimeout, clearTimeout,
  postMessage(message) { messages.push(message); }
};
workerContext.self = workerContext;
workerContext.importScripts = function (...relativeFiles) {
  relativeFiles.forEach((relative) => {
    const file = path.resolve(root, "web/worker", relative);
    vm.runInContext(fs.readFileSync(file, "utf8"), workerContext, { filename: file });
  });
};
vm.createContext(workerContext);
vm.runInContext(fs.readFileSync(path.join(root, "web/worker/game-worker.js"), "utf8"), workerContext, { filename: "game-worker.js" });
workerContext.onmessage({ data: { type: "RESET" } });
const resetMessage = messages[0];
assert.strictEqual(resetMessage.type, "READY");
const workerState = resetMessage.payload.state;

assert.deepStrictEqual(Object.keys(workerState.world.regionalEconomy.routes).sort(), Object.keys(fallbackState.world.regionalEconomy.routes).sort());
assert.deepStrictEqual(Object.keys(workerState.world.npcRelations).sort(), Object.keys(fallbackState.world.npcRelations).sort());
assert.strictEqual(workerState.world.regionalEconomy.simulationDay, fallbackState.world.regionalEconomy.simulationDay);
assert.strictEqual(workerState.world.npcRelations.simulationDay, fallbackState.world.npcRelations.simulationDay);
assert.deepStrictEqual(workerState.world.cases.map((entry) => entry.id), fallbackState.world.cases.map((entry) => entry.id));
assert.deepStrictEqual(Object.keys(workerState.world.playerQuests.chains).sort(), Object.keys(fallbackState.world.playerQuests.chains).sort());
assert.strictEqual(JSON.stringify(workerState.world.playerQuests.chains["grain-warehouse"].steps.map((step) => step.status)), JSON.stringify(fallbackState.world.playerQuests.chains["grain-warehouse"].steps.map((step) => step.status)));
assert.deepStrictEqual(Object.keys(workerState.npcs).sort(), Object.keys(fallbackState.npcs).sort());

console.log("Phase 277 reset parity: PASS");
console.log("Worker RESET initializes regional economy and NPC relations like fallback: PASS");
