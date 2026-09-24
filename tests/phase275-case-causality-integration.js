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
const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const RPG = context.AnonymousRPG;

function prepareState() {
  const state = RPG.Core.createDefaultState(RPG.Data.npcs);
  RPG.Core.ensureRegionalEconomy(state);
  RPG.Core.ensureOrganizations(state);
  RPG.Core.ensureOrganizationRelations(state);
  RPG.Core.ensureNPCGoals(state);
  RPG.Core.ensureCaseCausality(state);
  state.world.caseHistory.push({ caseId: "grain-warehouse", choiceId: "audit", status: "resolved", resolutionDay: 0 });
  state.world.day = 1;
  RPG.Data.ensureCases(state);
  assert(state.world.cases.some((entry) => entry.id === "grain-aftershock"));
  return state;
}

const state = prepareState();
const result = RPG.Data.resolveCase(state, "grain-aftershock", "publish");
assert.strictEqual(result.changed, true);
assert.strictEqual(state.world.caseHistory.length, 2);
const resolution = state.world.caseHistory[1];
assert.strictEqual(resolution.caseId, "grain-aftershock");
assert.strictEqual(resolution.choiceId, "publish");
assert.strictEqual(resolution.status, "resolved");
assert.strictEqual(typeof resolution.outcome, "string");
assert.strictEqual(state.world.organizations.archive.goalPressure, 1);
assert.strictEqual(state.npcs.serin.goalState.priority, 2);

const firstNotice = RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state));
const historyLength = state.world.caseHistory.length;
const secondNotice = RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(firstNotice, null);
assert.strictEqual(secondNotice, null);
assert.strictEqual(state.world.caseHistory.length, historyLength);

const normalized = RPG.Core.normalizeState({
  world: {
    day: 3,
    minutes: 120,
    caseHistory: [
      { caseId: "trade-route", choiceId: "renew", status: "resolved", resolutionDay: 2, outcome: "ok" },
      { caseId: "bad", status: "unknown", resolutionDay: "nope" }
    ],
    caseCausalityDay: "2"
  }
});
assert.strictEqual(normalized.world.caseHistory.length, 1);
assert.strictEqual(normalized.world.caseHistory[0].caseId, "trade-route");
assert.strictEqual(normalized.world.caseCausalityDay, 2);

console.log("Phase 275 case causality integration: PASS");
console.log("Production case resolution, idempotent daily simulation, and save normalization: PASS");
