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
  "web/core/economy-world.js",
  "web/core/regional-economy.js",
  "web/core/faction-world.js",
  "web/core/organization-world.js",
  "web/core/npc-goals.js",
  "web/core/organization-relations.js",
  "web/core/npc-relations.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js",
  "web/core/case-causality.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureCaseCausality(state);
state.world.flags.warehouseSuspicion = true;
RPG.Data.ensureCases(state);
assert(state.world.cases.some(entry => entry.id === "grain-warehouse"));

const result = RPG.Data.resolveCase(state, "grain-warehouse", "audit");
assert(result);
assert(state.world.caseHistory.length === 1);
assert.strictEqual(state.world.caseHistory[0].caseId, "grain-warehouse");
assert.strictEqual(state.world.caseHistory[0].choiceId, "audit");
assert.strictEqual(state.world.caseHistory[0].status, "resolved");

state.world.day = 1;
state.world.minutes = 360;
RPG.Data.ensureCases(state);
assert(state.world.cases.some(entry => entry.id === "grain-aftershock"));

const chain = RPG.Core.resolveAction(state, "연쇄사건");
assert(chain && chain.narrative.includes("grain-warehouse"));

const second = RPG.Data.resolveCase(state, "grain-aftershock", "publish");
assert(second);
assert(state.world.caseHistory.some(entry => entry.caseId === "grain-aftershock"));

state.world.day = 2;
state.world.minutes = 360;
const event = RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state));
assert(event === null || event.includes("후속 사건"));

console.log("Phase 271 case causality: PASS");
console.log("Resolved case history and delayed follow-up case: PASS");
console.log("Causality command and chained resolution: PASS");
