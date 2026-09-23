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

assert.strictEqual(state.schemaVersion, 5);
assert.strictEqual(Object.keys(state.world.organizations).length, 6);
assert(Object.values(state.world.organizations).every((org) => org.lastDecisionDay === -1));

state.world.grainSupply = 35;
state.world.security = 35;
state.world.tension = 75;
state.world.minutes = 390;

const events = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(events.length, 6);
assert.strictEqual(state.world.organizations.merchants.lastDecisionDay, 0);
assert.strictEqual(state.world.organizations.guard.lastDecisionDay, 0);
assert(state.world.security >= 37);
assert(state.world.economy.stock.grain >= 24);
assert(state.world.rumorPressure >= 1);

const securityAfterFirst = state.world.security;
const stockAfterFirst = state.world.economy.stock.grain;
const eventsSecond = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.deepStrictEqual(eventsSecond, []);
assert.strictEqual(state.world.security, securityAfterFirst);
assert.strictEqual(state.world.economy.stock.grain, stockAfterFirst);

state.world.day = 1;
state.world.minutes = 360;
const eventsNextDay = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(eventsNextDay.length, 6);
assert.strictEqual(state.world.organizations.guard.lastDecisionDay, 1);
assert.strictEqual(state.world.organizations.guard.decisionCount, 2);

const normalized = RPG.Core.normalizeState(state);
assert.strictEqual(normalized.schemaVersion, 5);
assert(normalized.world.organizations);
assert.strictEqual(Object.keys(normalized.world.organizations).length, 6);

console.log("Phase 263 organization decisions: PASS");
console.log("Daily organization cadence: PASS");
console.log("Organization state persistence: PASS");
