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
const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureRegionalEconomy(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureOrganizationRelations(state);
RPG.Core.ensureNPCRelations(state);
RPG.Core.ensureNPCGoals(state);
RPG.Core.ensureCaseCausality(state);
state.world.caseHistory.push({ caseId: "trade-route", choiceId: "workers", status: "resolved", resolutionDay: 0 });
state.world.day = 1;
RPG.Data.ensureCases(state);
const followup = state.world.cases.find((entry) => entry.id === "trade-route-aftershock");
assert(followup && followup.status === "open");

const renew = RPG.Data.caseDefinitions["trade-route-aftershock"].choices.find((choice) => choice.id === "renew");
const result = renew.run(state);
assert(result.includes("장기 계약"));
assert.strictEqual(state.npcs.mara.goalState.progress, 1);
assert.strictEqual(state.npcs.orel.goalState.progress, 1);
assert.strictEqual(state.npcs.jonas.goalState.progress, 1);
assert.strictEqual(state.npcs.mara.goalState.lastProgressMinute, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(state.npcs.orel.goalState.lastProgressMinute, RPG.Core.getAbsoluteMinute(state));
assert(state.world.regionalEconomy.routes["hills:market"].reliability > 80);
assert(state.world.regionalEconomy.routes["riverside:market"].reliability > 80);

console.log("Phase 276 regional goal causality: PASS");
console.log("Resolved trade-route follow-up advances durable NPC goals: PASS");
console.log("Regional route recovery and goal consequences remain data-driven: PASS");
