const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of [
  "web/core/game-state.js",
  "web/data/places.js",
  "web/data/npcs.js",
  "web/data/cases.js",
  "web/core/action-resolver.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
const state = RPG.Core.createDefaultState(RPG.Data.npcs);
const before = RPG.Core.getAbsoluteMinute(state);
const result = RPG.Core.resolveAction(state, "휴식");

assert.strictEqual(result.changed, true);
assert.strictEqual(result.narrative, "잠시 쉬었다.");
assert.strictEqual(before, 360);
assert.strictEqual(RPG.Core.getAbsoluteMinute(state), 420);
assert.strictEqual(state.world.minutes, 420);

console.log("Phase 272 rest action regression: PASS");
