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
  const source = fs.readFileSync(path.join(root, file), "utf8");
  vm.runInContext(source, context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);
assert(RPG.Data.places.foundry && RPG.Data.places.clinic && RPG.Data.places.watchtower);
assert(RPG.Data.npcs.lina && RPG.Data.npcs.kael);
assert(Object.values(RPG.Data.npcs).every(npc => Array.isArray(npc.schedule) && npc.schedule.length > 0));

let state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Data.ensureCases(state);
RPG.Core.appendLog(state, "초기 상태");
assert.strictEqual(state.world.cases.length, 0);

state.world.minutes = 420;
const events = RPG.Core.simulateNPCs(state, 30);
assert(Array.isArray(events));
assert.strictEqual(state.npcs.orel.place, "market");
assert(state.npcs.orel.lastAction === "시장 시설 수리");
assert(typeof state.npcs.orel.lastTick === "number");

let result = RPG.Core.resolveAction(state, "기록관으로 이동");
assert(state.player.place === "archive");
assert(result.changed === true);

result = RPG.Core.resolveAction(state, "조사");
assert(state.world.flags.recordInconsistency === true);
assert(state.world.cases.some(c => c.id === "land-record"));

result = RPG.Core.resolveAction(state, "사건목록");
assert(result.narrative.includes("land-record"));

result = RPG.Core.resolveAction(state, "사건분기 1");
assert(result.narrative.includes("1."));

const choice = RPG.Data.caseDefinitions["land-record"].choices[0].id;
const beforeDay = state.world.day;
result = RPG.Core.resolveAction(state, "사건분기 1 " + choice);
assert(result.narrative.includes("판정"));
assert(state.world.cases.some(c => c.id === "land-record"));

for (let i = 0; i < 300; i += 1) {
  const action = i % 2 === 0 ? "조사" : "휴식";
  const before = RPG.Core.getAbsoluteMinute(state);
  const turn = RPG.Core.resolveAction(state, action);
  const after = RPG.Core.getAbsoluteMinute(state);
  RPG.Core.simulateNPCs(state, Math.max(0, after - before));
  RPG.Core.appendLog(state, turn.narrative, turn.action);
}
assert(state.log.length === 60);
assert(state.log[state.log.length - 1].action);
assert(state.world.day >= beforeDay);
assert(Object.values(state.npcs).every(npc => typeof npc.place === "string"));

console.log("Phase 251 core regression: PASS");
console.log("Phase 252 NPC autonomy regression: PASS");
console.log("300-action stability run: PASS");
