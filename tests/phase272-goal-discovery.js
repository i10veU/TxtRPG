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
  "web/core/action-resolver.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
const defaultAdvice = RPG.Core.resolveAction(state, "목표추천");
assert.strictEqual(defaultAdvice.changed, false);
assert(defaultAdvice.narrative.includes("단서"));

state.world.flags.recordInconsistency = true;
RPG.Data.ensureCases(state);

const absolute = RPG.Core.getAbsoluteMinute(state);
RPG.Core.recordRumor(state, "tradeRouteCrisis:hills:market", "상인회", absolute, "구릉 교역로가 크게 흔들리고 있다.");
RPG.Core.recordRumor(state, "tradeRouteCrisis:hills:market", "경비대", absolute, "구릉 교역로가 크게 흔들리고 있다.");

const guidedAdvice = RPG.Core.resolveAction(state, "단서");
assert.strictEqual(guidedAdvice.changed, false);
assert(guidedAdvice.narrative.includes("사건분기 land-record"));
assert(guidedAdvice.narrative.includes("지역자원"));

const aliasAdvice = RPG.Core.resolveAction(state, "퀘스트");
assert.strictEqual(aliasAdvice.changed, false);
assert(aliasAdvice.narrative.length > 0);

console.log("Phase 272 player goal discovery: PASS");
console.log("Goal hints map open cases and high-confidence rumors into actionable commands: PASS");
