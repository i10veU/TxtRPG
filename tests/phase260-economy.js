const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js",
  "web/core/economy-world.js",
  "web/data/places.js",
  "web/data/npcs.js",
  "web/data/cases.js",
  "web/core/faction-world.js",
  "web/core/action-resolver.js",
  "web/core/npc-simulation.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
assert.strictEqual(state.schemaVersion, 4);
assert.strictEqual(RPG.Core.getGrainPrice(state), 10);

state.world.grainSupply = 20;
state.world.tension = 80;
state.world.security = 30;
state.world.day = 1;
state.world.minutes = 360;
const first = RPG.Core.simulateEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert(first.includes("곡물 시세"));
assert(RPG.Core.getGrainPrice(state) > 10);
const priceAfterFirstTick = RPG.Core.getGrainPrice(state);
assert.strictEqual(RPG.Core.simulateEconomy(state, RPG.Core.getAbsoluteMinute(state)), null);
assert.strictEqual(RPG.Core.getGrainPrice(state), priceAfterFirstTick);

state.player.place = "market";
state.player.money = 100;
state.world.economy.stock.grain = 10;
const bought = RPG.Core.tradeGrain(state, "buy", 2);
assert.strictEqual(bought.changed, true);
assert.strictEqual(state.player.inventory.grain, 2);
assert.strictEqual(state.world.economy.stock.grain, 8);
assert.strictEqual(state.world.economy.tradeVolume, 2);

const moneyAfterBuy = state.player.money;
const sold = RPG.Core.tradeGrain(state, "sell", 1);
assert.strictEqual(sold.changed, true);
assert.strictEqual(state.player.inventory.grain, 1);
assert(state.player.money > moneyAfterBuy);
assert.strictEqual(state.world.economy.tradeVolume, 3);

const blocked = RPG.Core.tradeGrain(state, "sell", 99);
assert.strictEqual(blocked.changed, false);

const legacy = RPG.Core.normalizeState({ player: { money: 18 }, world: { grainSupply: 72 } });
assert(legacy.world.economy);
assert.strictEqual(legacy.schemaVersion, 4);

const longRun = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(longRun);
for (let day = 0; day < 365; day += 1) {
  longRun.world.day = day;
  longRun.world.minutes = 360;
  longRun.world.grainSupply = Math.max(0, Math.min(100, 72 - Math.floor(day / 9)));
  longRun.world.tension = (day * 7) % 101;
  longRun.world.security = 30 + ((day * 11) % 61);
  longRun.world.economy.simulationDay = day - 1;
  RPG.Core.simulateEconomy(longRun, RPG.Core.getAbsoluteMinute(longRun));
  assert(longRun.world.economy.prices.grain >= 4 && longRun.world.economy.prices.grain <= 30);
  assert(longRun.world.economy.stock.grain >= 0 && longRun.world.economy.stock.grain <= 100);
}
assert.strictEqual(longRun.world.day, 364);

console.log("Phase 260 dynamic economy: PASS");
console.log("Daily price simulation and legacy save normalization: PASS");
console.log("Market buy/sell state transitions: PASS");
console.log("365-day economy stability simulation: PASS");
