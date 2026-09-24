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
  "web/core/npc-relations.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;

function makeState() {
  const state = RPG.Core.createDefaultState(RPG.Data.npcs);
  RPG.Core.ensureRegionalEconomy(state);
  RPG.Core.ensureOrganizations(state);
  RPG.Core.ensureNPCGoals(state);
  RPG.Core.ensureCaseCausality(state);
  state.world.caseHistory.push({ caseId: "trade-route", choiceId: "guard", status: "resolved", resolutionDay: 0 });
  state.world.day = 1;
  RPG.Data.ensureCases(state);
  assert(state.world.cases.some(entry => entry.id === "trade-route-aftershock"));
  return state;
}

const auditState = makeState();
auditState.world.organizations.merchants.goalPressure = -1;
const audit = RPG.Data.resolveCase(auditState, "trade-route-aftershock", "audit");
assert.strictEqual(audit.changed, true);
assert.strictEqual(auditState.world.organizations.archive.goalPressure, 1);
assert.strictEqual(auditState.world.organizations.merchants.goalPressure, -2);
assert.strictEqual(auditState.npcs.mara.goalState.status, "blocked");

const renewState = makeState();
const renewChoice = RPG.Data.caseDefinitions["trade-route-aftershock"].choices.find(choice => choice.id === "renew");
renewChoice.run(renewState);
assert.strictEqual(renewState.world.organizations.merchants.goalPressure, 1);
assert.strictEqual(renewState.world.organizations.workers.goalPressure, 1);
assert.strictEqual(renewState.npcs.mara.goalState.priority, 2);
assert.strictEqual(renewState.npcs.jonas.goalState.priority, 2);

const localState = makeState();
const localChoice = RPG.Data.caseDefinitions["trade-route-aftershock"].choices.find(choice => choice.id === "local");
localChoice.run(localState);
assert.strictEqual(localState.world.organizations.rural.goalPressure, 1);
assert.strictEqual(localState.world.organizations.workers.goalPressure, 1);
assert.strictEqual(localState.npcs.darma.goalState.priority, 2);
assert.strictEqual(localState.npcs.jonas.goalState.priority, 2);

console.log("Phase 273 case causality goal impact: PASS");
console.log("Trade-route aftershock consequences propagate to organization pressure and NPC goals: PASS");
