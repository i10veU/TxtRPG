const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

async function gotoApp(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  return pageErrors;
}

async function saveSeed(page, slot, seed) {
  await page.evaluate(({ slot, seed }) => {
    window.__v2App.newGame(seed);
    return window.__v2App.saveGame(slot);
  }, { slot, seed });
}

// A real readwrite transaction keeps later IndexedDB reads/writes queued.
// Queue a fresh request from each success callback so the transaction remains
// active until the test explicitly releases it.
async function holdSaveStore(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("txtrpg_v2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("saves", "readwrite");
    const store = tx.objectStore("saves");
    let released = false;
    let started = false;
    let start;
    const ready = new Promise((resolve) => { start = resolve; });
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    const pump = () => {
      const request = store.get("__test_gate__");
      request.onsuccess = () => {
        if (!started) { started = true; start(); }
        if (!released) pump();
      };
    };
    pump();
    window.__releaseSaveStore = () => {
      released = true;
      return done;
    };
    await ready;
  });
}

async function releaseSaveStore(page) {
  await page.evaluate(() => window.__releaseSaveStore());
}

test.describe("V2 asynchronous storage UI (Chromium + IndexedDB)", () => {
  test("a delayed load cannot replace a new game or reopen the menu", async ({ page }) => {
    const pageErrors = await gotoApp(page);
    await saveSeed(page, "slot_a", "saved-seed");
    await holdSaveStore(page);
    await page.evaluate(() => {
      window.__pendingStorage = window.__v2App.loadGame("slot_a");
      window.__v2App.newGame("fresh-seed");
    });
    await releaseSaveStore(page);
    await page.evaluate(() => window.__pendingStorage);
    expect(await page.evaluate(() => ({
      seed: window.__v2App.getState().worldSeed,
      loadedLog: window.__v2App.getLog().some((line) => line.includes("slot_a") && line.includes("불러왔다"))
    }))).toEqual({ seed: "fresh-seed", loadedLog: false });

    await holdSaveStore(page);
    await page.evaluate(() => {
      window.__pendingStorage = window.__v2App.loadGame("slot_a");
      window.__v2App.backToMenu();
    });
    await releaseSaveStore(page);
    await page.evaluate(() => window.__pendingStorage);
    expect(await page.evaluate(() => window.__v2App.getState())).toBeNull();
    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();
    expect(pageErrors).toEqual([]);
  });

  test("a delayed missing-slot error cannot leak into a newer game", async ({ page }) => {
    const pageErrors = await gotoApp(page);
    await saveSeed(page, "known", "saved-seed");
    await holdSaveStore(page);
    await page.evaluate(() => {
      window.__pendingStorage = window.__v2App.loadGame("missing");
      window.__v2App.newGame("fresh-seed");
    });
    await releaseSaveStore(page);
    await page.evaluate(() => window.__pendingStorage);
    await expect(page.locator("#error")).toBeHidden();
    expect(await page.evaluate(() => window.__v2App.getState().worldSeed)).toBe("fresh-seed");

    await page.evaluate(() => window.__v2App.loadGame("missing"));
    await expect(page.locator("#error")).toContainText("불러오기 실패");
    expect(pageErrors).toEqual([]);
  });

  test("the latest load wins even when an earlier real IndexedDB read callback arrives last", async ({ page }) => {
    const pageErrors = await gotoApp(page);
    await saveSeed(page, "slot_a", "seed-a");
    await saveSeed(page, "slot_b", "seed-b");
    await page.evaluate(() => {
      const originalGet = IDBObjectStore.prototype.get;
      window.__heldReadReady = false;
      IDBObjectStore.prototype.get = function (key) {
        const request = originalGet.call(this, key);
        if (key !== "slot_a") return request;
        let callback;
        Object.defineProperty(request, "onsuccess", {
          configurable: true,
          get: () => callback,
          set: (fn) => { callback = fn; }
        });
        request.addEventListener("success", () => {
          window.__heldReadReady = true;
          window.__releaseHeldRead = () => callback();
        });
        IDBObjectStore.prototype.get = originalGet;
        return request;
      };
      window.__oldLoad = window.__v2App.loadGame("slot_a");
    });
    await expect.poll(() => page.evaluate(() => window.__heldReadReady)).toBe(true);
    await page.evaluate(() => window.__v2App.loadGame("slot_b"));
    await page.evaluate(() => window.__releaseHeldRead());
    await page.evaluate(() => window.__oldLoad);
    expect(await page.evaluate(() => ({
      seed: window.__v2App.getState().worldSeed,
      log: window.__v2App.getLog()
    }))).toMatchObject({ seed: "seed-b", log: ['"slot_b"에서 불러왔다.'] });
    expect(pageErrors).toEqual([]);
  });

  test("a delayed save commits to IndexedDB without changing a newer session", async ({ page }) => {
    const pageErrors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("old-seed"));
    await holdSaveStore(page);
    await page.evaluate(() => {
      window.__pendingStorage = window.__v2App.saveGame("late_save");
      window.__v2App.newGame("new-seed");
    });
    await releaseSaveStore(page);
    await page.evaluate(() => window.__pendingStorage);
    expect(await page.evaluate(() => ({
      seed: window.__v2App.getState().worldSeed,
      savedLog: window.__v2App.getLog().some((line) => line.includes("late_save") && line.includes("저장했다"))
    }))).toEqual({ seed: "new-seed", savedLog: false });
    expect(await page.evaluate(async () => {
      const storage = await import("/v2/storage/idb.js");
      return (await storage.load("late_save")).worldSeed;
    })).toBe("old-seed");
    expect(pageErrors).toEqual([]);
  });
});
