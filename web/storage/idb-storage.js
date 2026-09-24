window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Storage = AnonymousRPG.Storage || {};

(function (Storage) {
  const DB_NAME = "AnonymousChroniclesDB";
  const DB_VERSION = 2;
  const STORE_NAME = "saves";
  const META_STORE = "meta";
  const WORLD_STORE = "world";
  const SIMULATION_STORE = "simulation";
  const SLOT = "main";
  const LEGACY_KEY = "anonymous_chronicles_save_v2";

  function open() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB unavailable"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        // Test doubles and older implementations may expose only the legacy store.
        if (typeof db.createObjectStore !== "function") return;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(WORLD_STORE)) db.createObjectStore(WORLD_STORE, { keyPath: "id" });
        if (!db.objectStoreNames.contains(SIMULATION_STORE)) db.createObjectStore(SIMULATION_STORE, { keyPath: "id" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB open failed")); };
    });
  }

  function hasEntityStores(db) {
    return typeof db.createObjectStore === "function" && db.objectStoreNames &&
      db.objectStoreNames.contains(META_STORE) && db.objectStoreNames.contains(WORLD_STORE) &&
      db.objectStoreNames.contains(SIMULATION_STORE);
  }

  function getLegacy(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(SLOT);
      request.onsuccess = function () { resolve(request.result ? request.result.state : null); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB read failed")); };
    });
  }

  function getEntities(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction([META_STORE, WORLD_STORE, SIMULATION_STORE], "readonly");
      const values = {};
      [META_STORE, WORLD_STORE, SIMULATION_STORE].forEach(function (storeName) {
        const request = tx.objectStore(storeName).get(SLOT);
        request.onsuccess = function () { values[storeName] = request.result && request.result.state; };
        request.onerror = function () { reject(request.error || new Error("IndexedDB entity read failed")); };
      });
      tx.oncomplete = function () {
        if (!values[META_STORE] && !values[WORLD_STORE] && !values[SIMULATION_STORE]) { resolve(null); return; }
        const meta = values[META_STORE] || {};
        const world = values[WORLD_STORE] || {};
        const simulation = values[SIMULATION_STORE] || {};
        resolve(Object.assign({}, meta, { world: Object.assign({}, meta.world || {}, world.world || {}), npcs: simulation.npcs || {}, log: simulation.log || [] }));
      };
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB entity read failed")); };
    });
  }

  function putLegacy(db, state) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ id: SLOT, schemaVersion: state.schemaVersion || 1, updatedAt: Date.now(), state: state });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB write failed")); };
      tx.onabort = function () { reject(tx.error || new Error("IndexedDB write aborted")); };
    });
  }

  function putEntities(db, state) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction([META_STORE, WORLD_STORE, SIMULATION_STORE], "readwrite");
      tx.objectStore(META_STORE).put({ id: SLOT, state: { schemaVersion: state.schemaVersion, player: state.player, world: { day: state.world.day, minutes: state.world.minutes, npcSimulationMinute: state.world.npcSimulationMinute, tutorial: state.world.tutorial, campaignPhase: state.world.campaignPhase, finaleReady: state.world.finaleReady, ending: state.world.ending, gameStatus: state.world.gameStatus } } });
      tx.objectStore(WORLD_STORE).put({ id: SLOT, state: { world: state.world } });
      tx.objectStore(SIMULATION_STORE).put({ id: SLOT, state: { npcs: state.npcs, log: state.log } });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB entity write failed")); };
      tx.onabort = function () { reject(tx.error || new Error("IndexedDB entity write aborted")); };
    });
  }

  function cloneForNormalization(state) {
    if (!state || typeof state !== "object") return state;
    return JSON.parse(JSON.stringify(state));
  }

  function normalize(state) {
    const input = cloneForNormalization(state);
    if (AnonymousRPG.Core && typeof AnonymousRPG.Core.normalizeState === "function") {
      return AnonymousRPG.Core.normalizeState(input);
    }
    return input;
  }

  function wasChanged(original, normalized) {
    return JSON.stringify(original) !== JSON.stringify(normalized);
  }

  async function loadState() {
    try {
      const db = await open();
      const entityMode = hasEntityStores(db);
      let migratedLegacy = false;
      let savedState = entityMode ? await getEntities(db) : await getLegacy(db);
      if (!savedState && entityMode) { savedState = await getLegacy(db); migratedLegacy = Boolean(savedState); }
      db.close();
      if (savedState) {
        const state = normalize(savedState);
        if (wasChanged(savedState, state) || migratedLegacy) {
          const db2 = await open();
          if (hasEntityStores(db2)) await putEntities(db2, state); else await putLegacy(db2, state);
          db2.close();
        }
        return { state: state, source: "indexeddb" };
      }

      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const state = normalize(JSON.parse(legacyRaw));
        const db2 = await open();
        if (hasEntityStores(db2)) await putEntities(db2, state); else await putLegacy(db2, state);
        db2.close();
        return { state: state, source: "migrated-localstorage" };
      }

      return { state: null, source: "empty" };
    } catch (error) {
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const state = normalize(JSON.parse(legacyRaw));
        localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
        return { state: state, source: "localstorage-fallback" };
      }
      throw error;
    }
  }

  async function saveState(state) {
    const normalizedState = normalize(state);
    try {
      const db = await open();
      if (hasEntityStores(db)) await putEntities(db, normalizedState); else await putLegacy(db, normalizedState);
      db.close();
      return "indexeddb";
    } catch (error) {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(normalizedState));
      return "localstorage-fallback";
    }
  }

  Storage.loadState = loadState;
  Storage.saveState = saveState;
  Storage.databaseName = DB_NAME;
})(AnonymousRPG.Storage);
