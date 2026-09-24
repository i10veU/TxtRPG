const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "web/core/game-state.js"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "web/core/action-resolver.js"), "utf8");
const storageSource = fs.readFileSync(path.join(root, "web/storage/idb-storage.js"), "utf8");

function createHarness({ indexedAvailable = true, writeFails = false } = {}) {
  let storedState = null;
  let legacyRaw = null;
  const localStorage = {
    getItem: () => legacyRaw,
    setItem: (_, value) => { legacyRaw = value; }
  };
  const context = {
    console, Date, JSON, Math, Object, Array, String, Number, Boolean,
    setTimeout, clearTimeout, localStorage,
    window: { indexedDB: indexedAvailable ? {} : undefined },
    AnonymousRPG: {}
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
              get: () => {
                const read = {};
                setTimeout(() => {
                  read.result = storedState ? { state: storedState } : null;
                  read.onsuccess();
                }, 0);
                return read;
              },
              put: (record) => {
                storedState = record.state;
                setTimeout(() => {
                  if (writeFails) {
                    tx.error = new Error("write failed");
                    tx.onerror();
                  } else {
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
  vm.runInContext(coreSource, context, { filename: "web/core/game-state.js" });
  vm.runInContext(actionSource, context, { filename: "web/core/action-resolver.js" });
  vm.runInContext(storageSource, context, { filename: "web/storage/idb-storage.js" });
  return {
    core: context.AnonymousRPG.Core,
    storage: context.AnonymousRPG.Storage,
    read: () => ({ storedState, legacyRaw })
  };
}

function terminalState(core, status) {
  const state = core.createDefaultState();
  state.world.day = 7;
  state.world.minutes = 840;
  state.world.gameStatus = status;
  state.world.tutorial = { step: 4, completed: true };
  state.world.playerQuests.chains.example = { status: "complete" };
  return state;
}

async function assertRoundTrip(harness, status, source, loadSource = source) {
  const state = terminalState(harness.core, status);
  const before = JSON.stringify(state);
  assert.strictEqual(await harness.storage.saveState(state), source === "indexeddb" ? "indexeddb" : "localstorage-fallback");
  const loaded = await harness.storage.loadState();
  assert.strictEqual(loaded.source, loadSource);
  assert.strictEqual(loaded.state.world.gameStatus, status);
  assert.strictEqual(loaded.state.world.tutorial.step, 4);
  assert.strictEqual(loaded.state.world.tutorial.completed, true);
  assert.strictEqual(loaded.state.world.playerQuests.chains.example.status, "complete");
  assert.strictEqual(JSON.stringify(state), before);
  const time = harness.core.getAbsoluteMinute(loaded.state);
  const result = harness.core.resolveAction(loaded.state, "휴식");
  assert.strictEqual(result.changed, false);
  assert.strictEqual(harness.core.getAbsoluteMinute(loaded.state), time);
}

(async () => {
  for (const status of ["won", "lost"]) {
    await assertRoundTrip(createHarness(), status, "indexeddb");
    await assertRoundTrip(createHarness({ indexedAvailable: false }), status, "localstorage-fallback");
    await assertRoundTrip(createHarness({ writeFails: true }), status, "localstorage-fallback", "indexeddb");
  }
  console.log("Phase 285 terminal persistence: PASS");
  console.log("Won/lost campaign states survive IndexedDB, unavailable-IDB, and write-failure fallback loads and remain action-blocked: PASS");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
