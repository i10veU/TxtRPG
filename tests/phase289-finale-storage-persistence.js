const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "web/core/game-state.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "web/core/action-resolver.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "web/storage/idb-storage.js"), "utf8");

function createHarness({ indexedAvailable = true, writeFails = false } = {}) {
  const stores = new Map();
  let legacyRaw = null;
  const localStorage = {
    getItem: () => legacyRaw,
    setItem: (_, value) => { legacyRaw = value; }
  };
  const db = {
    objectStoreNames: { contains: (name) => stores.has(name) },
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
            put(record) {
              if (writeFails) {
                setTimeout(() => { tx.error = new Error("write failed"); tx.onerror(); }, 0);
                return;
              }
              stores.get(name).set(record.id, record);
            }
          };
        }
      };
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 10);
      return tx;
    },
    close() {}
  };
  const context = {
    console, Date, JSON, Math, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, localStorage,
    window: { indexedDB: indexedAvailable ? {} : undefined }, AnonymousRPG: { Data: { ensureCases: () => {} } }
  };
  if (indexedAvailable) {
    context.window.indexedDB.open = () => {
      const request = {};
      setTimeout(() => {
        request.result = db;
        request.onupgradeneeded && request.onupgradeneeded();
        request.onsuccess();
      }, 0);
      return request;
    };
    context.indexedDB = context.window.indexedDB;
  }
  vm.createContext(context);
  vm.runInContext(coreSource, context, { filename: "web/core/game-state.js" });
  vm.runInContext(actionSource, context, { filename: "web/core/action-resolver.js" });
  vm.runInContext(storageSource, context, { filename: "web/storage/idb-storage.js" });
  return {
    core: context.AnonymousRPG.Core,
    storage: context.AnonymousRPG.Storage,
    stores,
    readLegacy: () => legacyRaw
  };
}

function createCampaignState(core, phase) {
  const state = core.createDefaultState();
  state.world.day = 12;
  state.world.minutes = 915;
  state.world.campaignPhase = phase;
  state.world.finaleReady = true;
  state.world.ending = phase === "complete" ? "canonical" : null;
  state.world.gameStatus = phase === "complete" ? "won" : "active";
  return state;
}

async function assertRoundTrip(options, phase, expectedSource, expectedLoadSource) {
  const harness = createHarness(options);
  const state = createCampaignState(harness.core, phase);
  const before = JSON.stringify(state);
  assert.strictEqual(await harness.storage.saveState(state), expectedSource);
  assert.strictEqual(JSON.stringify(state), before, "save mutated caller state");
  const loaded = await harness.storage.loadState();
  if (expectedLoadSource) assert.strictEqual(loaded.source, expectedLoadSource);
  assert.strictEqual(loaded.state.world.campaignPhase, phase);
  assert.strictEqual(loaded.state.world.finaleReady, true);
  assert.strictEqual(loaded.state.world.ending, phase === "complete" ? "canonical" : null);
  assert.strictEqual(loaded.state.world.gameStatus, phase === "complete" ? "won" : "active");
  const time = harness.core.getAbsoluteMinute(loaded.state);
  assert.strictEqual(harness.core.resolveAction(loaded.state, "휴식").changed, phase === "complete" ? false : true);
  if (phase === "complete") {
    assert.strictEqual(harness.core.getAbsoluteMinute(loaded.state), time);
    assert.strictEqual(harness.core.resolveAction(loaded.state, "결말").changed, false);
  } else {
    assert.ok(harness.core.getAbsoluteMinute(loaded.state) > time, "active finale-ready state should continue time");
  }
}

(async () => {
  for (const phase of ["finale-ready", "complete"]) {
    await assertRoundTrip({}, phase, "indexeddb");
    await assertRoundTrip({ indexedAvailable: false }, phase, "localstorage-fallback", "localstorage-fallback");
    await assertRoundTrip({ writeFails: true }, phase, "localstorage-fallback", "localstorage-fallback");
  }
  console.log("Phase 289 finale storage persistence: PASS");
  console.log("Finale-ready and canonical terminal states survive IndexedDB and both localStorage fallback paths: PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
