const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "web/storage/idb-storage.js"), "utf8");

function createHarness({ indexedState = null, indexedAvailable = true, legacyState = null }) {
  let storedState = indexedState;
  let legacyRaw = legacyState ? JSON.stringify(legacyState) : null;
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
    AnonymousRPG: { Core: { normalizeState: (state) => ({ ...state, schemaVersion: 5, normalized: true }) } },
    window: { indexedDB: indexedAvailable ? {} : undefined }
  };
  if (indexedAvailable) {
    context.window.indexedDB.open = () => {
      const request = {};
      setTimeout(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction: (_, mode) => {
            const tx = {};
            tx.objectStore = () => ({
              get: () => {
                const read = {};
                setTimeout(() => { read.result = storedState ? { state: storedState } : null; read.onsuccess(); }, 0);
                return read;
              },
              put: (record) => {
                storedState = record.state;
                setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
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
  return { storage: context.AnonymousRPG.Storage, read: () => ({ storedState, legacyRaw }) };
}

(async () => {
  const indexed = createHarness({ indexedState: { legacy: true } });
  const indexedResult = await indexed.storage.loadState();
  assert.strictEqual(indexedResult.source, "indexeddb");
  assert.strictEqual(indexedResult.state.schemaVersion, 5);
  assert.strictEqual(indexedResult.state.normalized, true);
  assert.strictEqual(indexed.read().storedState.normalized, true);

  const migrated = createHarness({ legacyState: { old: true } });
  const migratedResult = await migrated.storage.loadState();
  assert.strictEqual(migratedResult.source, "migrated-localstorage");
  assert.strictEqual(migratedResult.state.schemaVersion, 5);
  assert.strictEqual(migrated.read().storedState.normalized, true);

  const fallback = createHarness({ indexedAvailable: false, legacyState: { old: true } });
  const fallbackResult = await fallback.storage.loadState();
  assert.strictEqual(fallbackResult.source, "localstorage-fallback");
  assert.strictEqual(fallbackResult.state.schemaVersion, 5);
  assert.strictEqual(JSON.parse(fallback.read().legacyRaw).normalized, true);

  const emptyFallback = createHarness({ indexedAvailable: false });
  const emptyFallbackResult = await emptyFallback.storage.loadState();
  assert.strictEqual(emptyFallbackResult.source, "empty");
  assert.strictEqual(emptyFallbackResult.state, null);

  console.log("Phase 282 storage normalization: PASS");
  console.log("IndexedDB, migrated localStorage, and fallback loads normalize and persist current state: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
