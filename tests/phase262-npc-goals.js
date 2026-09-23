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
RPG.Core.ensureNPCGoals(state);

assert(Object.values(state.npcs).every((npc) => npc.goalState));
assert(Object.values(state.npcs).every((npc) => npc.goalState.progress === 0));
assert(Object.values(state.npcs).every((npc) => npc.goalState.status === "active"));

state.world.minutes = 420;
RPG.Core.simulateNPCs(state);

assert(state.npcs.orel.goalState.progress >= 1);
assert(state.npcs.orel.goalState.lastProgressMinute === 420);

const firstProgress = state.npcs.orel.goalState.progress;
state.world.minutes = 810;
const events = RPG.Core.simulateNPCs(state);
assert(state.npcs.orel.goalState.progress >= firstProgress);
assert(events.some((event) => event.includes("개인 목표")));

const goalResult = RPG.Core.resolveAction(state, "인물목표");
assert(goalResult.changed === false);
assert(goalResult.narrative.includes("오렐 다브"));

const normalized = RPG.Core.normalizeState(state);
assert(normalized.npcs.orel.goalState);
assert.strictEqual(normalized.npcs.orel.goalState.progress, state.npcs.orel.goalState.progress);

for (let i = 0; i < 40; i += 1) {
  state.world.minutes = 420 + i * 30;
  RPG.Core.simulateNPCs(state);
}

const completed = Object.values(state.npcs).filter((npc) => npc.goalState.status === "complete");
assert(completed.length >= 1);
assert(completed.every((npc) => npc.goalState.progress === npc.goalState.target));

console.log("Phase 262 structured NPC goals: PASS");
console.log("Goal progress and completion state: PASS");
console.log("Goal persistence and player inspection: PASS");
