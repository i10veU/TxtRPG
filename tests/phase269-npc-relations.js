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
  "web/core/faction-world.js",
  "web/core/economy-world.js",
  "web/core/organization-world.js",
  "web/core/npc-goals.js",
  "web/core/organization-relations.js",
  "web/core/npc-relations.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);

for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
RPG.Core.ensureOrganizations(state);
RPG.Core.ensureOrganizationRelations(state);
RPG.Core.ensureNPCRelations(state);
RPG.Core.ensureNPCGoals(state);

assert.strictEqual(Object.keys(state.world.npcRelations).length, 5);
assert(Object.values(state.world.npcRelations).every((entry) => entry.lastDay === -1));

state.world.day = 0;
state.world.minutes = 360;
state.world.grainSupply = 40;
state.world.security = 45;
state.world.tension = 70;
state.world.rumorPressure = 12;
state.world.trustInAdministration = 60;

const firstEvents = RPG.Core.simulateNPCRelations(state, RPG.Core.getAbsoluteMinute(state));
assert(firstEvents.length >= 2);
assert.strictEqual(state.world.npcRelationDay, 0);
assert(Object.values(state.world.npcRelations).some((entry) => entry.mode === "cooperation"));

const secondEvents = RPG.Core.simulateNPCRelations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(secondEvents.length, 0);

state.world.day = 1;
state.world.minutes = 360;
state.world.grainSupply = 90;
state.world.security = 90;
state.world.tension = 80;
state.world.rumorPressure = 80;
state.world.trustInAdministration = 40;

const conflictEvents = RPG.Core.simulateNPCRelations(state, RPG.Core.getAbsoluteMinute(state));
assert(conflictEvents.some((event) => event.includes("충돌") || event.includes("대립") || event.includes("마찰")));
assert(Object.keys(state.world.eventSignals).some((key) => key.indexOf("npcConflict:") === 0));
assert(state.world.rumors.some((rumor) => rumor.id.indexOf("npcConflict:") === 0));
const initialConflictSignalCount = Object.entries(state.world.eventSignals).filter(([key]) => key.indexOf("npcConflict:") === 0).reduce((sum, [, value]) => sum + Number(value), 0);

RPG.Data.ensureCases(state);
const dispute = state.world.cases.find((entry) => entry.id === "npc-dispute");
assert(dispute && dispute.status === "open");

const relationSummary = RPG.Core.resolveAction(state, "인물관계");
assert.strictEqual(relationSummary.changed, false);
assert(relationSummary.narrative.includes("↔"));

const scoreBefore = state.world.npcRelations["serin:marta"].score;
const choice = RPG.Data.caseDefinitions["npc-dispute"].choices.find((item) => item.id === "mediate");
choice.run(state);
assert(state.world.npcRelations["serin:marta"].score > scoreBefore);

const normalized = RPG.Core.normalizeState(state);
RPG.Core.ensureNPCRelations(normalized);
assert.strictEqual(Object.keys(normalized.world.npcRelations).length, 5);
assert.strictEqual(normalized.world.npcRelationDay, state.world.npcRelationDay);

for (let day = 2; day < 365; day += 1) {
  state.world.day = day;
  state.world.minutes = 360;
  RPG.Core.simulateNPCRelations(state, RPG.Core.getAbsoluteMinute(state));
  for (const relation of Object.values(state.world.npcRelations)) {
    assert(relation.score >= -100 && relation.score <= 100);
    assert(["cooperation", "conflict", "neutral"].includes(relation.mode));
  }
  assert(state.world.tension >= 0 && state.world.tension <= 100);
  assert(state.world.rumorPressure >= 0 && state.world.rumorPressure <= 100);
}
const finalConflictSignalCount = Object.entries(state.world.eventSignals).filter(([key]) => key.indexOf("npcConflict:") === 0).reduce((sum, [, value]) => sum + Number(value), 0);
assert(finalConflictSignalCount - initialConflictSignalCount <= 130);

console.log("Phase 269 NPC relations: PASS");
console.log("NPC cooperation / conflict bridge: PASS");
console.log("NPC dispute case generation: PASS");
console.log("NPC relation persistence and 365-day stability: PASS");
