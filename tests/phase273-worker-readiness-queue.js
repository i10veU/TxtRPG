const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const coreFiles = [
  "web/core/game-state.js", "web/data/places.js", "web/data/npcs.js", "web/data/cases.js",
  "web/core/economy-world.js", "web/core/regional-economy.js", "web/core/faction-world.js",
  "web/core/organization-world.js", "web/core/npc-goals.js", "web/core/organization-relations.js",
  "web/core/npc-relations.js", "web/core/player-quests.js", "web/core/action-resolver.js",
  "web/core/npc-simulation.js", "web/core/case-causality.js"
];

class MockWorker {
  constructor() {
    this.messages = [];
    this.terminated = false;
    MockWorker.instance = this;
  }
  postMessage(message) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

(async function () {
  const ui = {
    dispatcher: null,
    render: () => {},
    bindInput(fn) { this.dispatcher = fn; },
    addTurn(state, text) { state.log.push({ time: "", narrative: text, action: null, system: false }); }
  };

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
    Promise,
    setTimeout,
    clearTimeout,
    Worker: MockWorker,
    document: { title: "", getElementById: () => ({ textContent: "" }) },
    window: null
  };
  context.window = context;
  context.window.addEventListener = () => {};

  vm.createContext(context);
  for (const file of coreFiles) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }

  context.AnonymousRPG.Storage = {
    databaseName: "test-db",
    loadState: () => Promise.resolve({ state: null }),
    saveState: () => Promise.resolve("indexeddb")
  };
  context.AnonymousRPG.UI = ui;

  vm.runInContext(fs.readFileSync(path.join(root, "web/game.js"), "utf8"), context, { filename: "web/game.js" });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const app = context.AnonymousRPGApp;
  assert(app, "app should initialize");
  assert(ui.dispatcher, "input dispatcher should bind");

  const worker = MockWorker.instance;
  assert(worker, "worker should be created");
  assert.strictEqual(worker.messages[0].type, "INIT", "worker should receive INIT first");

  ui.dispatcher("휴식");
  assert.strictEqual(worker.messages.filter((m) => m.type === "ACTION").length, 0, "action should queue until READY");

  const readyState = context.AnonymousRPG.Core.createDefaultState(context.AnonymousRPG.Data.npcs);
  worker.onmessage({ data: { type: "READY", payload: { state: readyState } } });
  assert.strictEqual(worker.messages.filter((m) => m.type === "ACTION").length, 1, "queued action should flush on READY");

  const updated = context.AnonymousRPG.Core.normalizeState(JSON.parse(JSON.stringify(readyState)));
  context.AnonymousRPG.Core.advanceTime(updated, 60);
  worker.onmessage({ data: { type: "UPDATE", payload: { state: updated, result: { narrative: "잠시 쉬었다.", action: "휴식", changed: true } } } });

  ui.dispatcher("조사");
  ui.dispatcher("휴식");
  assert.strictEqual(worker.messages.filter((m) => m.type === "ACTION").length, 2, "only one action should send while worker is busy");

  worker.onmessage({ data: { type: "UPDATE", payload: { state: updated, result: { narrative: "조사", action: "조사", changed: true } } } });
  assert.strictEqual(worker.messages.filter((m) => m.type === "ACTION").length, 3, "next queued action should send after UPDATE");

  console.log("Phase 273 worker readiness queue parity: PASS");
  console.log("Worker startup queues pre-ready actions and drains queued actions one-by-one after updates: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
