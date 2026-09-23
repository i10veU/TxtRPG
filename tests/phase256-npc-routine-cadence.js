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

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
const securityBefore = state.world.security;

state.world.minutes = 420;
const eventsAt420 = RPG.Core.simulateNPCs(state);

assert.strictEqual(state.world.npcSimulationMinute, 420);
assert(state.world.security > securityBefore);
assert(state.npcs.orel.activeRoutineKey);
assert(eventsAt420.filter(event => event.includes("오렐 다브")).length === 2);
assert(eventsAt420.some(event => event.includes("시장 시설 수리")));
assert(eventsAt420.some(event => event.includes("시장으로 이동")));

const securityAt420 = state.world.security;

state.world.minutes = 450;
const eventsAt450 = RPG.Core.simulateNPCs(state);

assert.strictEqual(state.world.npcSimulationMinute, 450);
assert(state.world.security > securityAt420);
assert.strictEqual(eventsAt450.filter(event => event.includes("오렐 다브")).length, 0);
assert.strictEqual(state.npcs.orel.lastAction, "시장 시설 수리");

console.log("Phase 256 NPC routine cadence: PASS");
console.log("Continuous effects continue without repeated routine announcements: PASS");
