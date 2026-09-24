window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Storage = AnonymousRPG.Storage || {};

(function (Storage) {
  const DB_NAME = "AnonymousChroniclesDB";
  const DB_VERSION = 1;
  const STORE_NAME = "saves";
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
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB open failed")); };
    });
  }

  function get(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(SLOT);
      request.onsuccess = function () { resolve(request.result ? request.result.state : null); };
      request.onerror = function () { reject(request.error || new Error("IndexedDB read failed")); };
    });
  }

  function put(db, state) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({
        id: SLOT,
        schemaVersion: state.schemaVersion || 1,
        updatedAt: Date.now(),
        state: state
      });
      tx.oncomplete = resolve;
      tx.onerror = function () { reject(tx.error || new Error("IndexedDB write failed")); };
      tx.onabort = function () { reject(tx.error || new Error("IndexedDB write aborted")); };
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
      const savedState = await get(db);
      db.close();
      if (savedState) {
        const state = normalize(savedState);
        if (wasChanged(savedState, state)) {
          const db2 = await open();
          await put(db2, state);
          db2.close();
        }
        return { state: state, source: "indexeddb" };
      }

      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw) {
        const state = normalize(JSON.parse(legacyRaw));
        const db2 = await open();
        await put(db2, state);
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
      await put(db, normalizedState);
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
