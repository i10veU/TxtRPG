// V2 storage adapter (D-64, docs/v2/architecture/CORE_CONTRACTS.md §10).
// This is the ONLY V2 file allowed to touch IndexedDB or Date.now --
// web/v2/core/* never imports this file, and this file only imports what
// core already exports as its public API (validateState/migrateState/
// SCHEMA_VERSION). Load pipeline stays exactly §10's:
//   raw record -> migrateState(record.state) -> validateState -> reject on
//   error (no auto-repair).
//
// Ponytail: one file, no repository/DAO/interface abstraction -- just the
// 4 operations an actual save/load flow needs (save/load/list/remove).
//
// DB: "txtrpg_v2", store "saves", keyPath "slot". Never touches V1's
// "AnonymousChroniclesDB" or "anonymous_chronicles_*" (§10 -- unrelated
// project, unrelated "v2" meaning).

import { validateState, migrateState, SCHEMA_VERSION } from "../core/engine.js";

export const DB_NAME = "txtrpg_v2";
export const STORE_NAME = "saves";
const DB_VERSION = 1;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Pure, Node-testable: builds the exact §10 save record shape without
// touching IndexedDB. `metadata.savedAt`, when given, overrides the actual
// wall-clock timestamp -- Node tests can't fake real time, but can supply
// this to test record shape/validation deterministically. The engine never
// sees or produces `savedAt` (§10 -- it is the adapter's concern, not
// state.time.minute).
export function buildSaveRecord(slot, state, metadata) {
  if (typeof slot !== "string" || slot.length === 0) {
    throw new Error("save: slot must be a non-empty string");
  }
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`save: state failed validateState: ${errors.join("; ")}`);
  }
  const savedAt = metadata && metadata.savedAt !== undefined ? metadata.savedAt : Date.now();
  return {
    slot,
    schemaVersion: SCHEMA_VERSION,
    worldId: state.worldId ?? null,
    dataRef: isPlainObject(state.dataRef) ? structuredClone(state.dataRef) : null,
    savedAt,
    state: structuredClone(state)
  };
}

// Pure, Node-testable: the load-side counterpart of buildSaveRecord. Reuses
// migrateState/validateState exactly as §10 specifies -- never a separate
// validator, never auto-repairs, always throws (never returns a partial or
// best-effort state) on anything wrong.
export function parseLoadedRecord(record) {
  if (!isPlainObject(record)) {
    throw new Error("load: malformed save record (not a plain object)");
  }
  if (typeof record.slot !== "string") {
    throw new Error("load: malformed save record (missing `slot`)");
  }
  const state = migrateState(record.state); // throws on missing/non-object/unsupported schemaVersion (D-63)
  const errors = validateState(state);
  if (errors.length > 0) {
    throw new Error(`load: invalid state: ${errors.join("; ")}`);
  }
  return state;
}

function requireSlot(slot, caller) {
  if (typeof slot !== "string" || slot.length === 0) {
    throw new Error(`${caller}: slot must be a non-empty string`);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable in this environment"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "slot" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });
}

// save(slot, state, metadata) -> Promise<void>. Validates and builds the
// record (buildSaveRecord), then writes it. Never silently swallows a
// failure -- a rejected write is a rejected promise, not a resolved no-op.
export async function save(slot, state, metadata) {
  const record = buildSaveRecord(slot, state, metadata);
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("save: IndexedDB write failed"));
      tx.onabort = () => reject(tx.error || new Error("save: IndexedDB write aborted"));
    });
  } finally {
    db.close();
  }
}

// load(slot) -> Promise<state>. Missing slot, malformed record, unsupported
// schemaVersion, and validateState errors are all rejected loads (thrown),
// per §10's "오류가 있으면 로드를 거부한다" -- one error-handling policy for
// all of them, not a mix of null-return and throw.
export async function load(slot) {
  requireSlot(slot, "load");
  const db = await openDb();
  let record;
  try {
    record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(slot);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("load: IndexedDB read failed"));
    });
  } finally {
    db.close();
  }
  if (record === undefined) {
    throw new Error(`load: no save found for slot ${JSON.stringify(slot)}`);
  }
  return parseLoadedRecord(record);
}

// list() -> Promise<Array<{slot, schemaVersion, worldId, dataRef, savedAt}>>.
// Metadata only -- never the full `state` (§10's "state 전체를 불필요하게
// 반환하지 않는다"). Sorted by slot so the result never depends on IDB
// cursor/insertion order (deterministic, per the issue's requirement).
export async function list() {
  const db = await openDb();
  let records;
  try {
    records = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error("list: IndexedDB read failed"));
    });
  } finally {
    db.close();
  }
  return records
    .filter(isPlainObject)
    .map((record) => ({
      slot: record.slot,
      schemaVersion: record.schemaVersion,
      worldId: record.worldId,
      dataRef: record.dataRef,
      savedAt: record.savedAt
    }))
    .sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0));
}

// remove(slot) -> Promise<void>. No existing V1/V2 convention decides what
// deleting an absent slot should do, so this deliberately does NOT invent a
// new policy on top of the platform: IndexedDB's own `delete(key)` is
// already a no-op success when the key doesn't exist, and that native
// behavior is left as-is. Never touches any other slot.
export async function remove(slot) {
  requireSlot(slot, "remove");
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("remove: IndexedDB delete failed"));
      tx.onabort = () => reject(tx.error || new Error("remove: IndexedDB delete aborted"));
    });
  } finally {
    db.close();
  }
}
