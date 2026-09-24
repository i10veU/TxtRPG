const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "web/core/game-state.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "web/storage/idb-storage.js"), "utf8");

function createHarness() {
  const stores = new Map();
  const names = { contains: (name) => stores.has(name) };
  const db = {
    objectStoreNames: names,
    createObjectStore(name) { stores.set(name, new Map()); return {}; },
    transaction(requested, mode) {
      const list = Array.isArray(requested) ? requested : [requested];
      const tx = { objectStore(name) { return {
        get(key) { const request = {}; setTimeout(() => { request.result = stores.get(name).get(key) || null; request.onsuccess(); }, 0); return request; },
        put(record) { stores.get(name).set(record.id, record); }
      }; } };
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 10);
      return tx;
    },
    close() {}
  };
  const indexedDB = { open() {
    const request = {};
    setTimeout(() => {
      request.result = db;
      request.onupgradeneeded && request.onupgradeneeded();
      request.onsuccess();
    }, 0);
    return request;
  } };
  const localStorage = { getItem: () => null, setItem: () => {} };
  const context = { console, Date, JSON, Math, Object, Array, String, Number, Boolean, setTimeout, clearTimeout, localStorage, indexedDB, window: { indexedDB }, AnonymousRPG: {} };
  vm.createContext(context);
  vm.runInContext(coreSource, context);
  vm.runInContext(storageSource, context);
  return { core: context.AnonymousRPG.Core, storage: context.AnonymousRPG.Storage, stores };
}

(async () => {
  const harness = createHarness();
  const legacy = harness.core.createDefaultState({ legacy: { name: "구 세이브" } });
  await harness.storage.saveState(legacy);
  harness.stores.get("saves").set("main", { id: "main", state: legacy });
  harness.stores.get("meta").delete("main");
  harness.stores.get("world").delete("main");
  harness.stores.get("simulation").delete("main");
  const migrated = await harness.storage.loadState();
  assert.strictEqual(migrated.source, "indexeddb");
  assert.strictEqual(migrated.state.npcs.legacy.name, "구 세이브");
  assert.strictEqual(harness.stores.get("meta").has("main"), true);
  assert.strictEqual(harness.stores.get("world").has("main"), true);
  assert.strictEqual(harness.stores.get("simulation").has("main"), true);

  const state = harness.core.createDefaultState({ serin: { name: "세린" } });
  state.world.day = 12;
  state.world.playerQuests.chains.grain = { status: "active" };
  state.world.rumors.push({ id: "route", text: "교역로가 흔들린다", sources: ["guard"], confidence: 0.8, firstSeenDay: 12, lastSeenDay: 12, confirmations: 1 });
  const before = JSON.stringify(state);
  assert.strictEqual(await harness.storage.saveState(state), "indexeddb");
  assert.deepStrictEqual([...harness.stores.keys()].sort(), ["meta", "saves", "simulation", "world"]);
  assert.strictEqual(harness.stores.get("meta").get("main").state.world.day, 12);
  assert.strictEqual(harness.stores.get("simulation").get("main").state.npcs.serin.name, "세린");
  const loaded = await harness.storage.loadState();
  assert.strictEqual(loaded.source, "indexeddb");
  assert.strictEqual(loaded.state.world.day, 12);
  assert.strictEqual(loaded.state.world.playerQuests.chains.grain.status, "active");
  assert.strictEqual(loaded.state.npcs.serin.name, "세린");
  assert.strictEqual(JSON.stringify(state), before);

  harness.stores.get("world").delete("main");
  const recovered = await harness.storage.loadState();
  assert.strictEqual(recovered.state.world.day, 12);
  assert.strictEqual(recovered.state.npcs.serin.name, "세린");
  console.log("Phase 287 storage entities: PASS");
  console.log("Versioned meta/world/simulation stores round-trip, preserve caller state, and recover missing optional world data: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
