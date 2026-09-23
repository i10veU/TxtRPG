const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js",
  "web/core/faction-world.js"
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
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core);

const state = RPG.Core.createDefaultState({});
assert.strictEqual(state.world.factionSimulationDay, -1);
assert.strictEqual(state.world.flags.factionConflict, false);

const first = RPG.Core.simulateFactionWorld(state, 360);
assert.strictEqual(first.length, 0);
assert.strictEqual(state.world.factionSimulationDay, 0);
assert.strictEqual(state.world.relations.rural, 1);
assert.strictEqual(state.world.relations.innkeepers, 1);

const ruralAfterFirst = state.world.relations.rural;
const innkeepersAfterFirst = state.world.relations.innkeepers;
const second = RPG.Core.simulateFactionWorld(state, 720);

assert.strictEqual(second.length, 0);
assert.strictEqual(state.world.relations.rural, ruralAfterFirst);
assert.strictEqual(state.world.relations.innkeepers, innkeepersAfterFirst);

const conflict = RPG.Core.createDefaultState({});
conflict.world.relations.merchants = -40;
conflict.world.relations.guard = -40;
conflict.world.tension = 55;

const events = RPG.Core.simulateFactionWorld(conflict, 360);

assert.strictEqual(conflict.world.factionSimulationDay, 0);
assert.strictEqual(conflict.world.flags.factionConflict, true);
assert.strictEqual(events.length, 1);
assert(events[0].includes("세력 간 긴장이 높아졌다."));

console.log("Phase 258 faction world integration regression: PASS");
console.log("Daily faction simulation gate regression: PASS");
console.log("Faction conflict pressure regression: PASS");
