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
  "web/data/cases.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);
for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });

const RPG = context.AnonymousRPG;
const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);

state.world.day = 3;
state.world.minutes = 360;
state.world.grainSupply = 20;
state.world.tension = 85;
state.world.security = 30;
state.world.economy.stock.grain = 4;
state.world.economy.simulationDay = 2;
const merchantsBefore = state.world.relations.merchants;
const ruralBefore = state.world.relations.rural;
const first = RPG.Core.simulateEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert(first.includes("압박"));
assert.strictEqual(state.world.flags.marketCrisis, true);
assert(state.world.relations.merchants > merchantsBefore);
assert(state.world.relations.rural < ruralBefore);
assert(state.world.eventSignals.marketCrisis >= 1);

const pressureDay = state.world.economy.pressureDay;
const merchantAfter = state.world.relations.merchants;
RPG.Core.simulateEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(state.world.economy.pressureDay, pressureDay);
assert.strictEqual(state.world.relations.merchants, merchantAfter);

RPG.Data.ensureCases(state);
const crisis = state.world.cases.find((entry) => entry.id === "market-crisis");
assert(crisis && crisis.status === "open");
const result = RPG.Data.resolveCase(state, "market-crisis", "ration");
assert(result.changed);
assert(state.world.discovered.includes("grainRationing") || crisis.status === "failed");

const stable = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(stable);
stable.world.day = 1;
stable.world.minutes = 360;
stable.world.grainSupply = 80;
stable.world.tension = 10;
stable.world.security = 80;
stable.world.economy.stock.grain = 40;
stable.world.economy.simulationDay = 0;
RPG.Core.simulateEconomy(stable, RPG.Core.getAbsoluteMinute(stable));
assert.strictEqual(stable.world.flags.marketCrisis, false);

console.log("Phase 268 economic pressure and faction bridge: PASS");
console.log("Market crisis trigger and once-per-day pressure: PASS");
console.log("Economy-driven case generation and consequence: PASS");
