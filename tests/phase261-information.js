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

for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
assert.deepStrictEqual(state.world.rumors, []);

state.world.minutes = 810;
const events = RPG.Core.simulateNPCs(state);

assert(state.world.rumors.length >= 2);
assert(state.world.rumors.some((rumor) => rumor.id === "warehouseSuspicion"));
assert(state.world.rumors.some((rumor) => rumor.id === "recordInconsistency"));
assert(state.world.rumors.every((rumor) => rumor.confidence > 0 && rumor.confidence <= 1));
assert(state.world.rumors.every((rumor) => rumor.sources.length >= 1));

const firstWarehouse = state.world.rumors.find((rumor) => rumor.id === "warehouseSuspicion");
const firstConfidence = firstWarehouse.confidence;
RPG.Core.recordEventSignal(
  state,
  "warehouseSuspicion",
  "추가 목격자",
  RPG.Core.getAbsoluteMinute(state),
  "창고 장부 불일치 정황을 다른 경로에서도 확인했다."
);

const confirmedWarehouse = state.world.rumors.find((rumor) => rumor.id === "warehouseSuspicion");
assert(confirmedWarehouse.sources.includes("추가 목격자"));
assert(confirmedWarehouse.confidence > firstConfidence);
assert(confirmedWarehouse.confirmations >= 2);

const rumorResult = RPG.Core.resolveAction(state, "소문");
assert(rumorResult.changed === false);
assert(rumorResult.narrative.includes("확신"));

const normalized = RPG.Core.normalizeState(state);
assert(Array.isArray(normalized.world.rumors));
assert(normalized.world.rumors.length >= 2);
assert(normalized.world.rumors.some((rumor) => rumor.sources.includes("추가 목격자")));

console.log("Phase 261 rumor discovery: PASS");
console.log("Rumor source/confidence tracking: PASS");
console.log("Rumor persistence normalization: PASS");
