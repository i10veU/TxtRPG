const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/player-quests.js", "web/core/action-resolver.js",
  "web/core/case-causality.js"
];
const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date, setTimeout, clearTimeout };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const RPG = context.AnonymousRPG;
const state = RPG.Core.createDefaultState(RPG.Data.npcs);
state.world.flags.warehouseSuspicion = true;
RPG.Data.ensureCases(state);
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
const rootQuest = state.world.playerQuests.chains["grain-warehouse"];
assert.strictEqual(rootQuest.steps.length, 4);
assert.strictEqual(rootQuest.status, "active");
assert.strictEqual(rootQuest.steps[2].status, "pending");
const rootCase = state.world.cases.find(entry => entry.id === "grain-warehouse");
while (rootCase.status === "open") RPG.Data.resolveCase(state, "grain-warehouse", "audit");
assert(state.world.caseHistory[0].outcome && state.world.caseHistory[0].outcome.includes("【닫힌 창고의 곡물】"));
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.notStrictEqual(rootQuest.status, "complete");
assert.strictEqual(rootQuest.steps[1].status, "complete");
state.world.day = rootCase.createdDay + 1;
RPG.Core.simulateCaseCausality(state, RPG.Core.getAbsoluteMinute(state));
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
const aftershock = state.world.cases.find(entry => entry.id === "grain-aftershock");
assert(aftershock && aftershock.status === "open");
assert.strictEqual(rootQuest.steps[2].status, "complete");
assert.strictEqual(rootQuest.currentStep, 3);
while (aftershock.status === "open") RPG.Data.resolveCase(state, "grain-aftershock", "publish");
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.strictEqual(rootQuest.status, "complete");
const snapshot = JSON.stringify(state.world.playerQuests);
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.strictEqual(JSON.stringify(state.world.playerQuests), snapshot);
const legacy = RPG.Core.normalizeState({ world: { cases: [], playerQuests: { chains: { "grain-warehouse": { id: "case:grain-warehouse", title: "닫힌 창고의 곡물", status: "complete", currentStep: 2, steps: [{ id: "investigate", status: "complete" }, { id: "resolve", status: "complete" }] } } } } });
RPG.Core.updatePlayerQuests(legacy, RPG.Data.caseDefinitions);
assert.strictEqual(legacy.world.playerQuests.chains["grain-warehouse"].steps.length, 4);
console.log("Phase 280 quest aftermath chains: PASS");
console.log("Aftershock progression, outcome provenance, migration, and idempotence: PASS");
