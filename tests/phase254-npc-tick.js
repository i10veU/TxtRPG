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
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js"
];

const context = {
  window: {},
  console,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date
};
context.window = context;
vm.createContext(context);

for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(source, context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);
assert(Object.keys(RPG.Data.places).length === 5);
assert(Object.keys(RPG.Data.npcs).length === 7);
assert(Object.values(RPG.Data.npcs).every(npc => Array.isArray(npc.schedule) && npc.schedule.length > 0));

let state = RPG.Core.createDefaultState(RPG.Data.npcs);
assert.strictEqual(state.schemaVersion, 3);
assert.strictEqual(state.world.npcSimulationMinute, 360);

const eventsAt630 = RPG.Core.simulateNPCs(state, 1);
assert.strictEqual(eventsAt630.length, 0);
assert.strictEqual(state.world.npcSimulationMinute, 360);

state.world.minutes = 390;
RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.npcSimulationMinute, 390);
assert.strictEqual(state.npcs.orel.place, "market");
assert.strictEqual(state.npcs.orel.lastTick, 390);
const securityAfterFirstTick = state.world.security;

RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.npcSimulationMinute, 390);
assert.strictEqual(state.world.security, securityAfterFirstTick);
assert.strictEqual(state.npcs.orel.lastTick, 390);

state.world.minutes = 405;
RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.npcSimulationMinute, 405);
assert.strictEqual(state.world.security, securityAfterFirstTick);
assert.strictEqual(state.npcs.orel.lastTick, 390);

state.world.minutes = 420;
RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.npcSimulationMinute, 420);
assert.strictEqual(state.world.security, securityAfterFirstTick + 1);
assert.strictEqual(state.npcs.orel.lastTick, 420);

const legacy = JSON.parse(JSON.stringify(state));
delete legacy.world.npcSimulationMinute;
legacy.schemaVersion = 2;
legacy.world.minutes = 450;
const normalized = RPG.Core.normalizeState(legacy);
assert.strictEqual(normalized.world.npcSimulationMinute, 450);

console.log("Phase 254 NPC cursor regression: PASS");
console.log("Duplicate 30-minute tick regression: PASS");
console.log("Legacy save normalization regression: PASS");
