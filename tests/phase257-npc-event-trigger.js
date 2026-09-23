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
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
assert.deepStrictEqual(state.world.eventSignals, {});
assert.deepStrictEqual(state.world.eventHistory, []);

state.world.minutes = 810;
const firstEvents = RPG.Core.simulateNPCs(state);

assert.strictEqual(state.world.eventSignals.warehouseSuspicion, 1);
assert.strictEqual(state.world.eventSignals.recordInconsistency, 1);
assert.strictEqual(state.world.eventHistory.length, 2);
assert.strictEqual(state.world.cases.filter(entry => entry.status === "open").length, 2);
assert(state.world.cases.some(entry => entry.id === "grain-warehouse"));
assert(state.world.cases.some(entry => entry.id === "land-record"));
assert(firstEvents.some(event => event.includes("창고 장부")));
assert(firstEvents.some(event => event.includes("토지 번호")));

const historyCount = state.world.eventHistory.length;
const signalCount = state.world.eventSignals.warehouseSuspicion;
state.world.minutes = 840;
RPG.Core.simulateNPCs(state);

assert.strictEqual(state.world.eventSignals.warehouseSuspicion, signalCount);
assert.strictEqual(state.world.eventHistory.length, historyCount);

state.world.minutes = 1110;
const nightEvents = RPG.Core.simulateNPCs(state);
assert.strictEqual(state.world.eventSignals.nightCargo, 1);
assert(state.world.cases.some(entry => entry.id === "night-cargo"));
assert(nightEvents.some(event => event.includes("예정표에 없는 선박")));

console.log("Phase 257 NPC event trigger regression: PASS");
console.log("NPC routine -> event signal -> case trigger regression: PASS");
