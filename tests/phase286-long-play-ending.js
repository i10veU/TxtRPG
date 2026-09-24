const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = ["web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js", "web/core/player-quests.js", "web/core/action-resolver.js"];
const context = { console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
files.forEach((file) => vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file }));
const { Core, Data } = context.AnonymousRPG;

const state = Core.createDefaultState(Data.npcs);
assert.deepStrictEqual([state.world.campaignPhase, state.world.finaleReady], ["tutorial", false]);
Core.resolveAction(state, "결말");
assert.strictEqual(state.world.gameStatus, "active");
assert.strictEqual(state.world.finaleReady, false);

Core.resolveAction(state, "시장 조사");
Core.resolveAction(state, "기록관으로 이동");
Core.resolveAction(state, "목표추천");
Core.applyCampaignProgress(state, Data.caseDefinitions);
assert.deepStrictEqual([state.world.tutorial.completed, state.world.campaignPhase], [true, "long-play"]);
state.world.playerQuests.chains["land-record"].status = "complete";
Core.applyCampaignProgress(state, Data.caseDefinitions);
assert.strictEqual(state.world.gameStatus, "active");

state.world.caseHistory = [{ caseId: "grain-warehouse", status: "resolved" }, { caseId: "grain-aftershock", status: "resolved" }];
const readyEvents = Core.applyCampaignProgress(state, Data.caseDefinitions);
assert.strictEqual(state.world.finaleReady, true);
assert.strictEqual(state.world.campaignPhase, "finale-ready");
assert.strictEqual(readyEvents.length, 1);
const finale = Core.resolveAction(state, "결말");
assert.strictEqual(finale.changed, true);
assert.deepStrictEqual([state.world.gameStatus, state.world.campaignPhase, state.world.ending], ["won", "complete", "canonical"]);
const wonTime = Core.getAbsoluteMinute(state);
assert.strictEqual(Core.resolveAction(state, "휴식").changed, false);
assert.strictEqual(Core.getAbsoluteMinute(state), wonTime);

const restored = Core.normalizeState(JSON.parse(JSON.stringify(state)));
assert.deepStrictEqual([restored.world.gameStatus, restored.world.campaignPhase, restored.world.finaleReady, restored.world.ending], ["won", "complete", true, "canonical"]);
console.log("Phase 286 long-play ending: PASS");
console.log("Side quests remain active, canonical aftermath unlocks an explicit finale, and restored terminal state stays blocked: PASS");
