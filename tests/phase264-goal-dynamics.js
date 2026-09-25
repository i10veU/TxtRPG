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
RPG.Core.ensureNPCGoals(state);

assert(Object.keys(state.npcs).length >= 9);
assert(Object.values(state.npcs).every((npc) => npc.goalState));
assert(Object.values(state.npcs).every((npc) => Array.isArray(npc.goalState.actions)));
assert(Object.values(state.npcs).every((npc) => npc.goalState.status === "active"));

state.world.grainSupply = 40;
state.world.security = 62;
state.world.minutes = 360;
const firstOrgEvents = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(firstOrgEvents.length, 6);
assert.strictEqual(state.world.organizations.merchants.goalPressure, 1);

state.world.minutes = 390;
const npcEvents = RPG.Core.simulateNPCs(state);
assert(state.npcs.mara.goalState.progress >= 1);
assert(npcEvents.some((event) => event.includes("마라 벨라스")) || state.npcs.mara.goalState.progress > 0);

const maraBefore = state.npcs.mara.goalState.progress;
state.world.grainSupply = 90;
state.world.tension = 80;
state.world.day = 1;
state.world.minutes = 360;
RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(state.world.organizations.merchants.goalPressure, -2);
assert.strictEqual(state.npcs.mara.goalState.status, "blocked");
assert(state.npcs.mara.goalState.blockedReason);

state.world.grainSupply = 40;
state.world.tension = 30;
state.world.day = 2;
state.world.minutes = 360;
RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(state.npcs.mara.goalState.status, "active");

state.npcs.mara.goalState.status = "blocked";
state.npcs.mara.goalState.blockedAt = RPG.Core.getAbsoluteMinute(state) - 1440;
state.world.grainSupply = 90;
state.world.tension = 80;
state.world.day = 3;
state.world.minutes = 360;
const replanEvents = RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
assert(replanEvents.some((event) => event.includes("목표를 재계획했다")));
assert.strictEqual(state.npcs.mara.goalState.replanCount, 1);
assert(state.npcs.mara.goalState.replanCooldownUntil > RPG.Core.getAbsoluteMinute(state));
assert.notStrictEqual(state.npcs.mara.goalState.goalText, "");

state.npcs.mara.goalState.status = "active";
state.npcs.mara.goalState.progress = state.npcs.mara.goalState.target - 1;
state.world.organizations.merchants.goalPressure = 2;
const completion = RPG.Core.progressNPCGoal(state, "mara", 1, RPG.Core.getAbsoluteMinute(state), "시장 거래");
assert(completion && completion.includes("개인 목표를 달성했다"));
assert.strictEqual(state.npcs.mara.goalState.status, "active");
assert.strictEqual(state.npcs.mara.goalState.progress, 0);
assert(state.npcs.mara.goalState.completedGoals.length >= 1);

const normalized = RPG.Core.normalizeState(state);
RPG.Core.ensureNPCGoals(normalized);
assert(normalized.npcs.mara.goalState);
assert.strictEqual(normalized.npcs.mara.goalState.replanCount, state.npcs.mara.goalState.replanCount);

for (let day = 4; day < 365; day += 1) {
  state.world.day = day;
  state.world.minutes = 360;
  RPG.Core.simulateOrganizations(state, RPG.Core.getAbsoluteMinute(state));
  RPG.Core.simulateNPCs(state);
  assert(Object.values(state.npcs).every((npc) => npc.goalState.progress >= 0));
  assert(Object.values(state.npcs).every((npc) => npc.goalState.target >= 1));
}
assert(state.npcs.mara.goalState.replanCount < 70);
assert(state.npcs.marta.goalState.replanCount < 70);

console.log("Phase 264 organization-linked NPC goals: PASS");
console.log("Goal blocking / resume / replanning: PASS");
console.log("Goal chain completion and persistence: PASS");
console.log("365-day goal simulation stability: PASS");
