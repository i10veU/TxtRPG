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

function makeState(caseId) {
  const state = RPG.Core.createDefaultState(RPG.Data.npcs);
  RPG.Core.ensureRegionalEconomy(state);
  RPG.Core.ensureOrganizations(state);
  RPG.Core.ensureOrganizationRelations(state);
  RPG.Core.ensureNPCGoals(state);
  RPG.Core.ensureCaseCausality(state);
  state.world.caseHistory.push({ caseId, choiceId: "resolved", status: "resolved", resolutionDay: 0 });
  state.world.day = 1;
  RPG.Data.ensureCases(state);
  const followupId = caseId === "grain-warehouse" ? "grain-aftershock" : "faction-aftershock";
  assert(state.world.cases.some((entry) => entry.id === followupId));
  return state;
}

const grainPublish = makeState("grain-warehouse");
grainPublish.world.organizations.merchants.goalPressure = -1;
RPG.Data.caseDefinitions["grain-aftershock"].choices.find((choice) => choice.id === "publish").run(grainPublish);
assert.strictEqual(grainPublish.world.organizations.archive.goalPressure, 1);
assert.strictEqual(grainPublish.world.organizations.merchants.goalPressure, -2);
assert.strictEqual(grainPublish.npcs.mara.goalState.status, "blocked");
assert.strictEqual(grainPublish.npcs.serin.goalState.priority, 2);

const grainSettle = makeState("grain-warehouse");
RPG.Data.caseDefinitions["grain-aftershock"].choices.find((choice) => choice.id === "settle").run(grainSettle);
assert.strictEqual(grainSettle.world.organizations.merchants.goalPressure, 1);
assert.strictEqual(grainSettle.world.organizations.archive.goalPressure, -1);
assert.strictEqual(grainSettle.npcs.mara.goalState.priority, 2);

const factionEnforce = makeState("faction-conflict");
factionEnforce.world.organizations.workers.goalPressure = 2;
RPG.Data.caseDefinitions["faction-aftershock"].choices.find((choice) => choice.id === "enforce").run(factionEnforce);
assert.strictEqual(factionEnforce.world.organizations.guard.goalPressure, 1);
assert.strictEqual(factionEnforce.world.organizations.workers.goalPressure, 1);
assert.strictEqual(factionEnforce.npcs.ibrahim.goalState.priority, 2);
assert.strictEqual(factionEnforce.npcs.jonas.goalState.priority, 2);

const factionCouncil = makeState("faction-conflict");
RPG.Data.caseDefinitions["faction-aftershock"].choices.find((choice) => choice.id === "council").run(factionCouncil);
assert(Object.values(factionCouncil.world.organizations).every((organization) => organization.goalPressure === 1));
assert.strictEqual(factionCouncil.npcs.mara.goalState.priority, 2);
assert.strictEqual(factionCouncil.npcs.orel.goalState.priority, 2);

const factionWithdraw = makeState("faction-conflict");
factionWithdraw.world.organizations.merchants.goalPressure = -2;
RPG.Data.caseDefinitions["faction-aftershock"].choices.find((choice) => choice.id === "withdraw").run(factionWithdraw);
assert.strictEqual(factionWithdraw.world.organizations.merchants.goalPressure, -2);
assert.strictEqual(factionWithdraw.npcs.mara.goalState.status, "blocked");

console.log("Phase 274 case causality goal impact: PASS");
console.log("Grain and faction aftershock consequences re-evaluate affected NPC goals: PASS");
console.log("Organization goalPressure remains clamped to [-2, 2]: PASS");
