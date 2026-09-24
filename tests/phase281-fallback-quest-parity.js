const fs = require("fs");
const path = require("path");
const assert = require("assert");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const coreFiles = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/player-quests.js", "web/core/action-resolver.js",
  "web/core/npc-simulation.js", "web/core/case-causality.js"
];

(async function () {
  const saves = [];
  const context = {
    console, Math, JSON, Object, Array, String, Number, Boolean, Date,
    Promise, setTimeout, clearTimeout,
    document: { title: "", getElementById: () => ({ textContent: "" }) },
    Worker: undefined,
    window: null
  };
  context.window = context;
  context.window.addEventListener = () => {};
  vm.createContext(context);
  for (const file of coreFiles) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  context.AnonymousRPG.Storage = {
    databaseName: "test",
    loadState: () => Promise.resolve({ state: null }),
    saveState: (state) => { saves.push(state); return Promise.resolve(); }
  };
  context.AnonymousRPG.UI = {
    render: () => {},
    bindInput: () => {},
    addTurn: (state, text) => context.AnonymousRPG.Core.appendLog(state, text)
  };
  vm.runInContext(fs.readFileSync(path.join(root, "web/game.js"), "utf8"), context, { filename: "web/game.js" });
  await Promise.resolve();
  await Promise.resolve();

  const app = context.AnonymousRPGApp;
  assert(app, "app should initialize in fallback mode");
  app.reset();
  const state = app.getState();
  assert(state.world.playerQuests, "fallback reset should initialize player quests");
  const chains = state.world.playerQuests.chains;
  assert(Object.keys(chains).length > 0, "fallback reset should create quest chains from cases");
  assert(chains["grain-warehouse"], "fallback reset should include the grain warehouse chain");
  assert.strictEqual(chains["grain-warehouse"].steps.length, 4);
  assert(saves.length > 0, "fallback reset should persist the initialized state");
  console.log("Phase 281 fallback reset quest parity: PASS");
  console.log("Fallback reset initializes and persists player quest chains before any action: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
