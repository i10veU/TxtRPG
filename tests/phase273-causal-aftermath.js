const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/action-resolver.js", "web/core/case-causality.js"
];
const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
RPG.Core.ensureRegionalEconomy(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureNPCGoals(state);
RPG.Core.ensureCaseCausality(state);
state.world.eventSignals["tradeRouteCrisis:hills:market"] = 1;
RPG.Data.ensureCases(state);
assert(state.world.cases.some((entry) => entry.id === "trade-route"));

state.world.regionalEconomy.routes["hills:market"].reliability = 40;
const reliabilityBefore = state.world.regionalEconomy.routes["hills:market"].reliability;
const pressureBefore = state.world.organizations.guard.goalPressure;
const result = RPG.Data.resolveCase(state, "trade-route", "guard");
assert(result.text.includes("교역로"));
const history = state.world.caseHistory[0];
assert.strictEqual(history.status, "resolved");
assert.strictEqual(history.causalImpact.goalPressure.guard, 1);
assert.strictEqual(history.causalAppliedDay, null);
assert.strictEqual(state.world.regionalEconomy.routes["hills:market"].reliability, reliabilityBefore + 18);

state.world.day = 1;
state.world.minutes = 360;
const event = RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state));
assert(event.includes("후속 사건"));
assert.strictEqual(history.causalAppliedDay, 1);
assert.strictEqual(state.world.organizations.guard.goalPressure, pressureBefore + 1);
assert.strictEqual(state.world.regionalEconomy.routes["hills:market"].reliability, reliabilityBefore + 22);
assert(state.npcs.ibrahim.goalState.priority >= 1);
const routeAfter = state.world.regionalEconomy.routes["hills:market"].reliability;
assert.strictEqual(RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state)), null);
assert.strictEqual(state.world.regionalEconomy.routes["hills:market"].reliability, routeAfter);

const legacy = RPG.Core.createDefaultState(RPG.Data.npcs);
legacy.world.caseHistory = [{ caseId: "grain-warehouse", choiceId: "audit", status: "resolved", resolutionDay: 0 }];
RPG.Core.ensureCaseCausality(legacy);
assert.strictEqual(legacy.world.caseHistory[0].causalImpact, undefined);
assert.doesNotThrow(() => RPG.Core.simulateCaseCausality(legacy, 1440));

console.log("Phase 273 causal aftermath: PASS");
console.log("Delayed regional impact, goal pressure review and idempotence: PASS");
