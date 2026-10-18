// V2-Core-156 (D-134): the chronicle -- the player's record across games of the lives played and the deeds done (Seoul
// 2033's endings and achievements, RPG.kr's 도감). It is the player's, not any character's: nothing in it returns to a
// world (D-71, K-14 -- a successor inherits no knowledge, belongings or relations), so it gives no advantage in play.
//
// Its own database, apart from the saves (storage/idb.js): "txtrpg_v2_chronicle", stores "lives" (keyPath "key": one
// record per life, the world and the character, kept up to date while the life goes on) and "deeds" (keyPath "id": the
// first time a deed was ever done). Like idb.js it is a storage adapter: web/v2/core/* never imports it. A browser that
// refuses IndexedDB plays on without a chronicle -- every call here rejects, and the UI says nothing rather than fail.

export const CHRONICLE_DB = "txtrpg_v2_chronicle";
const DB_VERSION = 1;
const LIVES = "lives";
const DEEDS = "deeds";

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isId = (v) => typeof v === "string" && /^[a-z][a-z0-9_]*$/.test(v);
const isIds = (v) => Array.isArray(v) && v.every(isId);

// Pure, Node-testable: one life as the chronicle keeps it.
//   key        the world and the character ("<worldId>:<actorId>")
//   templateId the background it began from (null when not known: a life first found on loading an older save)
//   startMinute when it began; baseline the deeds already true of the world then (a predecessor's are not this life's)
//   deeds      what this life has done; end null while it goes on, else an ending's id or "died"; days how long it lasted
export function buildLifeRecord({ key, templateId, startMinute, baseline, deeds, end, days, endedAt }) {
  if (typeof key !== "string" || key.length === 0) throw new Error("chronicle: a life needs its key");
  if (templateId !== null && !isId(templateId)) throw new Error("chronicle: a life's background is a template id, or null when not known");
  if (!Number.isInteger(startMinute) || startMinute < 0) throw new Error("chronicle: a life needs when it began");
  if (!isIds(baseline ?? [])) throw new Error("chronicle: the baseline must be deed ids");
  if (!isIds(deeds)) throw new Error("chronicle: deeds must be ids");
  if (end !== null && !isId(end)) throw new Error("chronicle: a life ends with an ending's id, or is still going on (null)");
  if (!Number.isInteger(days) || days < 1) throw new Error("chronicle: a life lasts at least a day");
  return {
    key,
    templateId,
    startMinute,
    baseline: [...new Set(baseline ?? [])],
    deeds: [...new Set(deeds)],
    end,
    days,
    endedAt: end === null ? null : Number.isFinite(endedAt) ? endedAt : Date.now()
  };
}

// Pure: of these deeds, the ones the chronicle has never seen
export function firstTimes(deedIds, knownIds) {
  const known = new Set(knownIds);
  return [...new Set(deedIds)].filter((id) => isId(id) && !known.has(id));
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable in this environment"));
      return;
    }
    const request = indexedDB.open(CHRONICLE_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LIVES)) db.createObjectStore(LIVES, { keyPath: "key" });
      if (!db.objectStoreNames.contains(DEEDS)) db.createObjectStore(DEEDS, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("chronicle: IndexedDB open failed"));
  });
}

const asPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function withStore(name, mode, work) {
  const db = await openDb();
  try {
    const tx = db.transaction(name, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("chronicle: IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("chronicle: IndexedDB transaction aborted"));
    });
    const result = await work(tx.objectStore(name));
    await done;
    return result;
  } finally {
    db.close();
  }
}

// putLife(life) -> Promise<void>: writes (or brings up to date) the record of a life
export function putLife(life) {
  const record = buildLifeRecord(life);
  return withStore(LIVES, "readwrite", (store) => {
    store.put(record);
  });
}

// getLife(key) -> Promise<life|null>
export function getLife(key) {
  return withStore(LIVES, "readonly", (store) => asPromise(store.get(key))).then((r) => r ?? null);
}

// listLives() -> Promise<life[]>: the lives that ended, the latest first
export function listLives() {
  return withStore(LIVES, "readonly", (store) => asPromise(store.getAll())).then((lives) =>
    (lives ?? []).filter((l) => isPlainObject(l) && l.end !== null).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
  );
}

// markDeeds(ids) -> Promise<string[]>: records the deeds done for the first time ever, and returns them
export function markDeeds(ids, at = Date.now()) {
  return withStore(DEEDS, "readwrite", async (store) => {
    const known = ((await asPromise(store.getAll())) ?? []).map((d) => d.id);
    const fresh = firstTimes(ids, known);
    fresh.forEach((id) => store.put({ id, firstAt: at }));
    return fresh;
  });
}

// listDeeds() -> Promise<{id, firstAt}[]>
export function listDeeds() {
  return withStore(DEEDS, "readonly", (store) => asPromise(store.getAll())).then((d) => d ?? []);
}
