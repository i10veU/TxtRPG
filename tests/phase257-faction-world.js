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
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
state.world.minutes = 360;
state.world.npcSimulationMinute = 360;
state.world.factionSimulationDay = -1;
state.world.tension = 60;
state.world.security = 35;
state.world.grainSupply = 35;
state.world.relations.merchants = -50;
state.world.relations.guard = -50;

state.world.minutes = 390;
const events = RPG.Core.simulateNPCs(state);
RPG.Data.ensureCases(state);

assert.strictEqual(state.world.factionSimulationDay, 0);
assert.strictEqual(state.world.flags.factionConflict, true);
assert(state.world.relations.merchants < -50);
assert(state.world.relations.guard < -50);
assert(events.some(event => event.includes("세력 간 긴장이 높아졌다")));
assert(state.world.cases.some(entry => entry.id === "faction-conflict"));

const before = state.world.relations.merchants;
state.world.minutes = 420;
RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.relations.merchants, before);

state.world.day = 1;
state.world.minutes = 360;
RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.day, 1);
assert.strictEqual(state.world.factionSimulationDay, 1);
assert(state.world.relations.rural <= -1);

console.log("Phase 257 faction world pressure: PASS");
console.log("Daily faction drift and conflict case trigger: PASS");
