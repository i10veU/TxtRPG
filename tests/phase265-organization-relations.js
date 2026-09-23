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
RPG.Core.ensureNPCGoals(state);

assert.strictEqual(Object.keys(state.world.organizationRelations).length, 3);
assert(Object.values(state.world.organizationRelations).every((entry) => entry.lastDay === -1));

state.world.grainSupply = 40;
state.world.rumorPressure = 20;
state.world.security = 45;
state.world.tension = 65;
state.world.minutes = 360;

const first = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
const relationEvents = RPG.Core.simulateOrganizationRelations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(first.length, 6);
assert(relationEvents.length >= 1);
assert.strictEqual(state.world.organizationRelationDay, 0);
assert.strictEqual(state.world.organizationRelations["merchants:rural"].mode, "cooperation");

const second = RPG.Core.simulateOrganizationRelations(state, RPG.Core.getAbsoluteMinute(state));
assert.deepStrictEqual(second, []);

state.world.day = 1;
state.world.minutes = 360;
state.world.grainSupply = 90;
state.world.rumorPressure = 80;
state.world.security = 90;
state.world.tension = 80;
const conflictEvents = RPG.Core.simulateOrganizationRelations(state, RPG.Core.getAbsoluteMinute(state));
assert(conflictEvents.length >= 1);
assert(Object.values(state.world.organizationRelations).some((entry) => entry.mode === "conflict"));
assert(state.world.tension >= 81);

const inspect = RPG.Core.resolveAction(state, "조직관계");
assert.strictEqual(inspect.changed, false);
assert(inspect.narrative.includes("↔"));

const normalized = RPG.Core.normalizeState(state);
RPG.Core.ensureOrganizationRelations(normalized);
assert.strictEqual(Object.keys(normalized.world.organizationRelations).length, 3);
assert.strictEqual(normalized.world.organizationRelationDay, state.world.organizationRelationDay);

for (let day = 2; day < 365; day += 1) {
  state.world.day = day;
  state.world.minutes = 360;
  RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
  RPG.Core.simulateOrganizationRelations(state, RPG.Core.getAbsoluteMinute(state));
  for (const relation of Object.values(state.world.organizationRelations)) {
    assert(relation.score >= -100 && relation.score <= 100);
    assert(["cooperation", "conflict", "neutral"].includes(relation.mode));
  }
}

console.log("Phase 265 organization relations: PASS");
console.log("Cooperation / conflict feedback loop: PASS");
console.log("Relationship persistence and inspection: PASS");
console.log("365-day relationship stability: PASS");
