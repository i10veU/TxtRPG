const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const files = [
  "web/core/game-state.js",
  "web/core/economy-world.js",
  "web/core/regional-economy.js",
  "web/data/places.js",
  "web/data/npcs.js",
  "web/data/cases.js",
  "web/core/action-resolver.js"
];

const context = { window: {}, console, Math, JSON, Object, Array, String, Number, Boolean, Date };
context.window = context;
vm.createContext(context);

for (const file of files) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}

const RPG = context.AnonymousRPG;
assert(RPG && RPG.Core && RPG.Data);

const state = RPG.Core.createDefaultState(RPG.Data.npcs);
RPG.Core.ensureEconomy(state);
RPG.Core.ensureRegionalEconomy(state);

assert.strictEqual(state.world.regionalEconomy.market.wood, 0);
assert.strictEqual(state.world.regionalEconomy.market.fish, 0);
assert.strictEqual(state.world.regionalEconomy.routes["hills:market"].reliability, 80);

state.world.day = 0;
state.world.minutes = 360;
state.world.security = 80;
state.world.tension = 20;

const first = RPG.Core.simulateRegionalEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert(first.includes("갱신"));
assert(state.world.regionalEconomy.market.wood > 0);
assert(state.world.regionalEconomy.market.fish > 0);
assert(state.world.regionalEconomy.prices.wood >= 3 && state.world.regionalEconomy.prices.wood <= 24);

const duplicate = RPG.Core.simulateRegionalEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert.strictEqual(duplicate, null);

const woodPrice = state.world.regionalEconomy.prices.wood;
state.player.inventory.wood = 1;
state.player.place = "market";
const sell = RPG.Core.tradeRegionalGood(state, "sell", "wood", 1);
assert(sell.changed);
assert(state.player.money > 18);

state.player.place = "hills";
const blocked = RPG.Core.resolveAction(state, "목재 구매 1");
assert.strictEqual(blocked.changed, false);

state.player.place = "market";
const info = RPG.Core.resolveAction(state, "지역자원");
assert.strictEqual(info.changed, false);
assert(info.narrative.includes("목재") && info.narrative.includes("어물"));

state.world.day = 1;
state.world.minutes = 360;
state.world.security = 30;
state.world.tension = 85;
state.world.regionalEconomy.routes["hills:market"].reliability = 35;
state.world.regionalEconomy.routes["riverside:market"].reliability = 35;
const crisisEvent = RPG.Core.simulateRegionalEconomy(state, RPG.Core.getAbsoluteMinute(state));
assert(crisisEvent.includes("공급이 불안정"));
assert(Object.keys(state.world.eventSignals).some((key) => key.indexOf("tradeRouteCrisis:") === 0));

RPG.Data.ensureCases(state);
assert(state.world.cases.some((entry) => entry.id === "trade-route" && entry.status === "open"));

const normalized = RPG.Core.normalizeState(state);
RPG.Core.ensureRegionalEconomy(normalized);
assert.strictEqual(normalized.world.regionalEconomy.routes["hills:market"].reliability, state.world.regionalEconomy.routes["hills:market"].reliability);

for (let day = 2; day < 365; day += 1) {
  state.world.day = day;
  state.world.minutes = 360;
  RPG.Core.simulateRegionalEconomy(state, RPG.Core.getAbsoluteMinute(state));
  for (const good of Object.values(state.world.regionalEconomy.market)) {
    assert(good >= 0 && good <= 100);
  }
  for (const route of Object.values(state.world.regionalEconomy.routes)) {
    assert(route.reliability >= 0 && route.reliability <= 100);
  }
}

console.log("Phase 270 regional economy: PASS");
console.log("Regional resource production and trade routes: PASS");
console.log("Trade route crisis and case generation: PASS");
console.log("365-day regional economy stability: PASS");
