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
    transaction(requested) {
      const list = Array.isArray(requested) ? requested : [requested];
      const tx = {
        objectStore(name) {
          assert(list.includes(name), "unexpected object store: " + name);
          return {
            get(key) {
              const request = {};
              setTimeout(() => {
                request.result = stores.get(name).get(key) || null;
                request.onsuccess();
              }, 0);
              return request;
            },
            put(record) { stores.get(name).set(record.id, record); }
          };
        }
      };
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
  const context = {
    console, Date, JSON, Math, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem: () => {} },
    indexedDB, window: { indexedDB }, AnonymousRPG: {}
  };
  vm.createContext(context);
  vm.runInContext(coreSource, context);
  vm.runInContext(storageSource, context);
  return { core: context.AnonymousRPG.Core, storage: context.AnonymousRPG.Storage, stores };
}

function createState(core, cycle) {
  const state = core.createDefaultState({});
  state.player.name = "순환 저장 " + cycle;
  state.world.day = cycle + 1;
  state.world.minutes = (cycle * 37) % 1440;
  state.world.cases = cycle % 2 === 0 ? [{ id: "case-" + cycle, status: "open", branch: null }] : [];
  state.world.rumors = cycle % 2 === 0
    ? [{ id: "rumor-" + cycle, text: "cycle " + cycle, sources: ["archive"], confidence: 0.75, confirmations: 1, firstSeenDay: cycle + 1, lastSeenDay: cycle + 1 }]
    : [];
  state.world.playerQuests.chains = cycle % 2 === 0
    ? { grain: { status: "active", caseId: "case-" + cycle } }
    : {};
  state.npcs = cycle % 2 === 0
    ? { serin: { name: "세린", location: "archive", activity: "cycle " + cycle } }
    : {};
  state.log = cycle % 2 === 0 ? ["log " + cycle] : [];
  return state;
}

function comparable(state) {
  return JSON.stringify({
    schemaVersion: state.schemaVersion,
    player: state.player,
    world: state.world,
    npcs: state.npcs,
    log: state.log
  });
}

(async () => {
  const harness = createHarness();
  const expected = new Map();

  for (let cycle = 0; cycle < 100; cycle += 1) {
    const state = createState(harness.core, cycle);
    const before = JSON.stringify(state);
    assert.strictEqual(await harness.storage.saveState(state), "indexeddb");
    assert.strictEqual(JSON.stringify(state), before, "save mutated caller at cycle " + cycle);
    const loaded = await harness.storage.loadState();
    const normalized = harness.core.normalizeState(JSON.parse(JSON.stringify(state)));
    expected.set(cycle, comparable(normalized));
    assert.strictEqual(comparable(loaded.state), expected.get(cycle), "round-trip mismatch at cycle " + cycle);
    assert.strictEqual(loaded.state.world.day, cycle + 1);
    assert.strictEqual(loaded.state.npcs.serin ? loaded.state.npcs.serin.activity : undefined, cycle % 2 === 0 ? "cycle " + cycle : undefined);
    assert.strictEqual(loaded.state.log.length, cycle % 2 === 0 ? 1 : 0);
  }

  async function loadWithStoreMissing(storeName) {
    const isolated = createHarness();
    const state = createState(isolated.core, 100);
    await isolated.storage.saveState(state);
    isolated.stores.get(storeName).delete("main");
    return isolated.storage.loadState();
  }

  const withoutMeta = await loadWithStoreMissing("meta");
  assert.strictEqual(withoutMeta.state.world.day, 101);
  assert.strictEqual(withoutMeta.state.npcs.serin.activity, "cycle 100");

  const withoutWorld = await loadWithStoreMissing("world");
  assert.strictEqual(withoutWorld.state.world.day, 101);
  assert.deepStrictEqual(withoutWorld.state.world.cases, []);
  assert.strictEqual(withoutWorld.state.npcs.serin.activity, "cycle 100");

  const withoutSimulation = await loadWithStoreMissing("simulation");
  assert.strictEqual(withoutSimulation.state.world.day, 101);
  assert.deepStrictEqual(withoutSimulation.state.npcs, {});
  assert.deepStrictEqual(withoutSimulation.state.log, []);

  console.log("Phase 288 storage entity stress: PASS");
  console.log("100 alternating entity-snapshot save/load cycles prevent stale data and preserve caller state: PASS");
  console.log("Independent meta/world/simulation loss recovers through normalized defaults without throwing: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
