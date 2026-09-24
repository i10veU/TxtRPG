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
RPG.Core.ensureNPCRelations(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureNPCGoals(state);
RPG.Core.ensureCaseCausality(state);
state.world.eventSignals["npcConflict:serin:marta"] = 1;
RPG.Data.ensureCases(state);
assert(state.world.cases.some((entry) => entry.id === "npc-dispute"));

const dispute = RPG.Data.resolveCase(state, "npc-dispute", "mediate");
assert(dispute.changed);
assert.strictEqual(state.world.caseHistory.length, 1);
assert.strictEqual(state.world.caseHistory[0].caseId, "npc-dispute");
assert.strictEqual(state.world.caseHistory[0].status, "resolved");
RPG.Data.ensureCases(state);
assert(!state.world.cases.some((entry) => entry.id === "npc-dispute-aftershock"));

state.world.day = 1;
state.world.minutes = 360;
RPG.Data.ensureCases(state);
RPG.Data.ensureCases(state);
const aftershock = state.world.cases.find((entry) => entry.id === "npc-dispute-aftershock");
assert(aftershock && aftershock.status === "open");
assert.strictEqual(state.world.caseHistory.length, 1);

state.world.day = 3;
state.world.minutes = 360;
state.world.organizations.archive.goalPressure = 2;
const followup = RPG.Data.resolveCase(state, "npc-dispute-aftershock", "record");
assert(followup.changed);
assert.strictEqual(aftershock.status, "resolved");
assert.strictEqual(state.world.organizations.archive.goalPressure, 2);
assert.strictEqual(state.npcs.serin.goalState.priority, 3);
assert(state.npcs.serin.goalState.lastReviewMinute != null);
assert.strictEqual(state.world.caseHistory.filter((entry) => entry.caseId === "npc-dispute-aftershock").length, 1);
assert.strictEqual(RPG.Data.resolveCase(state, "npc-dispute-aftershock", "record").changed, false);
assert.strictEqual(state.world.caseHistory.length, 2);

console.log("Phase 275 NPC causality: PASS");
console.log("Next-day npc-dispute aftershock trigger and resolution: PASS");
console.log("Goal pressure clamp/review and duplicate history guard: PASS");
