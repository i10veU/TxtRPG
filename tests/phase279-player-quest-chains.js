const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/player-quests.js", "web/core/action-resolver.js"
];
const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const RPG = context.AnonymousRPG;

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
state.world.flags.recordInconsistency = true;
RPG.Data.ensureCases(state);
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.strictEqual(state.world.playerQuests.chains["land-record"].status, "active");
assert.strictEqual(state.world.playerQuests.chains["grain-warehouse"].status, "locked");
const first = RPG.Core.resolveAction(state, "목표추천");
assert(first.narrative.includes("퀘스트: 서로 다른 토지 기록"));

const legacy = RPG.Core.normalizeState({ world: { cases: [] } });
assert(legacy.world.playerQuests && legacy.world.playerQuests.chains);
const result = RPG.Core.resolveAction(state, "사건분기 land-record archive");
assert.strictEqual(result.changed, true);
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.strictEqual(state.world.playerQuests.chains["land-record"].status, "complete");
assert.strictEqual(state.world.playerQuests.chains["land-record"].steps.filter(step => step.status === "complete").length, 2);
const snapshot = JSON.parse(JSON.stringify(state.world.playerQuests));
RPG.Core.updatePlayerQuests(state, RPG.Data.caseDefinitions);
assert.strictEqual(JSON.stringify(state.world.playerQuests), JSON.stringify(snapshot));

console.log("Phase 279 player quest chains: PASS");
console.log("Quest progress is normalized, actionable, idempotent, and legacy-save compatible: PASS");
