const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "web/storage/idb-storage.js"), "utf8");

function createHarness({ indexedAvailable = true, writeFails = false }) {
  let storedRecord = null;
  let legacyRaw = null;
  const localStorage = {
    getItem: () => legacyRaw,
    setItem: (_, value) => { legacyRaw = value; }
  };
  const context = {
    console,
    Date,
    JSON,
    setTimeout,
    clearTimeout,
    localStorage,
    AnonymousRPG: {
      Core: {
        normalizeState: (state) => {
          state.world = state.world || {};
          state.world.playerQuests = state.world.playerQuests || {};
          state.world.playerQuests.chains = {};
          state.schemaVersion = 5;
          state.normalized = true;
          return state;
        }
      }
    },
    window: { indexedDB: indexedAvailable ? {} : undefined }
  };

  if (indexedAvailable) {
    context.window.indexedDB.open = () => {
      const request = {};
      setTimeout(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction: () => {
            const tx = {};
            tx.objectStore = () => ({
              put: (record) => {
                storedRecord = record;
                setTimeout(() => {
                  if (writeFails) {
                    tx.error = new Error("write failed");
                    if (tx.onerror) tx.onerror();
                  } else if (tx.oncomplete) {
                    tx.oncomplete();
                  }
                }, 0);
              }
            });
            return tx;
          },
          close: () => {}
        };
        request.onsuccess();
      }, 0);
      return request;
    };
    context.indexedDB = context.window.indexedDB;
  }

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "web/storage/idb-storage.js" });
  return {
    storage: context.AnonymousRPG.Storage,
    read: () => ({ storedRecord, legacyRaw })
  };
}

(async () => {
  const original = { schemaVersion: 2, player: { hp: 7 }, world: { day: 3 } };
  const indexed = createHarness({});
  assert.strictEqual(await indexed.storage.saveState(original), "indexeddb");
  assert.deepStrictEqual(original, { schemaVersion: 2, player: { hp: 7 }, world: { day: 3 } });
  assert.strictEqual(indexed.read().storedRecord.schemaVersion, 5);
  assert.strictEqual(indexed.read().storedRecord.state.schemaVersion, 5);
  assert.strictEqual(indexed.read().storedRecord.state.normalized, true);

  const unavailable = createHarness({ indexedAvailable: false });
  assert.strictEqual(await unavailable.storage.saveState(original), "localstorage-fallback");
  assert.strictEqual(JSON.parse(unavailable.read().legacyRaw).schemaVersion, 5);
  assert.strictEqual(JSON.parse(unavailable.read().legacyRaw).normalized, true);

  const failed = createHarness({ writeFails: true });
  assert.strictEqual(await failed.storage.saveState(original), "localstorage-fallback");
  assert.strictEqual(JSON.parse(failed.read().legacyRaw).schemaVersion, 5);
  assert.strictEqual(JSON.parse(failed.read().legacyRaw).normalized, true);

  console.log("Phase 283 storage save normalization: PASS");
  console.log("IndexedDB metadata/state and both localStorage fallback paths persist normalized state without mutating input: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
