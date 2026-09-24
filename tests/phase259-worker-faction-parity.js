const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const context = {
  console,
  Math,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date,
  setTimeout,
  clearTimeout
};

context.self = context;
context.window = context;

const messages = [];
context.postMessage = function (message) {
  messages.push(message);
};

context.importScripts = function () {
  for (const relative of arguments) {
    const source = fs.readFileSync(path.resolve(root, "web/worker", relative), "utf8");
    vm.runInContext(source, context, { filename: path.resolve(root, "web/worker", relative) });
  }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "web/worker/game-worker.js"), "utf8"),
  context,
  { filename: "web/worker/game-worker.js" }
);

function send(type, payload) {
  messages.length = 0;
  context.onmessage({ data: Object.assign({ type: type }, payload || {}) });
  return messages[0];
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data && RPG.Core.simulateFactionWorld);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
state.world.relations.merchants = -40;
state.world.relations.guard = -40;
state.world.tension = 55;
state.world.factionSimulationDay = -1;

const ready = send("INIT", { state });
assert.strictEqual(ready.type, "READY");
assert.strictEqual(ready.payload.state.world.factionSimulationDay, -1);

const update = send("ACTION", { text: "휴식" });
assert.strictEqual(update.type, "UPDATE");
assert.strictEqual(update.payload.state.world.minutes, 420);
assert.strictEqual(update.payload.state.world.npcSimulationMinute, 420);
assert.strictEqual(update.payload.state.world.factionSimulationDay, 0);
assert.strictEqual(update.payload.state.world.flags.factionConflict, true);
assert(update.payload.state.log.some(function (entry) {
  return entry.system && entry.narrative.includes("세력 간 긴장이 높아졌다");
}));

console.log("Phase 259 Worker faction parity: PASS");
console.log("Faction simulation executes inside Worker action loop: PASS");
