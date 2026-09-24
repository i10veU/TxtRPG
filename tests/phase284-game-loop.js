const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/npc-relations.js",
  "web/core/organization-relations.js", "web/core/action-resolver.js", "web/core/player-quests.js"
];
const context = { console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
const { Core, Data } = context.AnonymousRPG;

const state = Core.createDefaultState(Data.npcs);
assert.strictEqual(state.world.tutorial.step, 0);
assert.strictEqual(state.world.tutorial.completed, false);
assert.strictEqual(state.world.gameStatus, "active");
Core.resolveAction(state, "시장 조사");
assert.strictEqual(state.world.tutorial.step, 1);
Core.resolveAction(state, "기록관으로 이동");
assert.strictEqual(state.world.tutorial.step, 2);
Core.resolveAction(state, "목표추천");
assert.strictEqual(state.world.tutorial.step, 3);
const tutorialEvents = Core.applyCampaignProgress(state, Data.caseDefinitions);
assert.strictEqual(state.world.tutorial.completed, true);
assert.strictEqual(state.world.tutorial.step, 4);
assert.strictEqual(tutorialEvents.length, 1);

const won = Core.createDefaultState(Data.npcs);
won.world.playerQuests.chains.example = { status: "complete" };
const winEvents = Core.applyCampaignProgress(won, Data.caseDefinitions);
assert.strictEqual(won.world.gameStatus, "won");
assert.strictEqual(winEvents.length, 1);
const wonTime = Core.getAbsoluteMinute(won);
const blockedWin = Core.resolveAction(won, "휴식");
assert.strictEqual(Core.getAbsoluteMinute(won), wonTime);
assert.strictEqual(blockedWin.changed, false);

const lost = Core.createDefaultState(Data.npcs);
lost.player.hp = 0;
const lossEvents = Core.applyCampaignProgress(lost, Data.caseDefinitions);
assert.strictEqual(lost.world.gameStatus, "lost");
assert.strictEqual(lossEvents.length, 1);
const normalized = Core.normalizeState({ world: { tutorial: { step: 99, completed: true }, gameStatus: "invalid" } });
assert.strictEqual(normalized.world.tutorial.step, 4);
assert.strictEqual(normalized.world.tutorial.completed, true);
assert.strictEqual(normalized.world.gameStatus, "active");
console.log("Phase 284 game loop: PASS");
console.log("Tutorial progression, deterministic win/loss states, terminal action guard, and save normalization: PASS");
