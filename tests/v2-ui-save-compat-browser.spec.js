// V2-Core-27 browser scenarios (Issue #84, D-68): the real UI loading saves
// from a real IndexedDB, some compatible with the current data pack and some
// not. A save made with a different pack must be rejected with a visible
// message, must not be loaded, and must not be deleted or repaired; a
// compatible save (including one made with another worldSeed) loads as before.
// The Node tests (tests/v2/save-compat-policy.test.js) cover the policy in
// depth; this spec proves it is wired into the real load path.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

async function gotoApp(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  return { pageErrors, consoleErrors };
}

const loadButton = (page, slot) => page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" });

async function reload(page) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
}

test.describe("V2 save compatibility in the real load path (D-68)", () => {
  test("compatible saves load: normal save -> reload -> load, and a save made with another worldSeed", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    await page.evaluate(() => window.__v2App.newGame("compat-seed-one"));
    const first = await page.evaluate(() => window.__v2App.getState());
    await page.locator("#saveSlotInput").fill("slot_one");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    // same pack, different seed: still compatible (the state carries its own seed)
    await page.evaluate(() => window.__v2App.newGame("compat-seed-two"));
    const second = await page.evaluate(() => window.__v2App.getState());
    expect(second.worldId).not.toBe(first.worldId);
    expect(second.dataRef).toEqual(first.dataRef);
    await page.locator("#saveSlotInput").fill("slot_two");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await reload(page);
    await expect(page.locator("#menu")).toBeVisible();

    await loadButton(page, "slot_one").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();
    expect(await page.evaluate(() => window.__v2App.getState())).toEqual(first);

    await page.locator("#backToMenuBtn").click();
    await loadButton(page, "slot_two").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();
    expect(await page.evaluate(() => window.__v2App.getState())).toEqual(second);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("saves from another pack / world, or with missing or malformed provenance, are rejected visibly and left untouched", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("compat-seed-bad"));

    // Plant saves through the app's own storage module. Each is a valid state
    // (it passes validateState) whose provenance does not fit the current pack.
    await page.evaluate(async () => {
      const storage = await import("/v2/storage/idb.js");
      const base = window.__v2App.getState();
      const variants = {
        slot_good: (s) => s,
        slot_ver: (s) => { s.dataRef.version = "9.9.9"; },
        slot_id: (s) => { s.dataRef.id = "other_pack"; },
        slot_world: (s) => { s.worldId = "other_world_1"; },
        slot_missing: (s) => { delete s.dataRef; delete s.worldId; },
        slot_garbage: (s) => { s.dataRef = "garbage"; s.worldId = 12345; }
      };
      for (const [slot, mutate] of Object.entries(variants)) {
        const copy = structuredClone(base);
        mutate(copy);
        await storage.save(slot, copy, {});
      }
    });

    await reload(page);
    await expect(page.locator("#menu")).toBeVisible();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(6);

    for (const slot of ["slot_ver", "slot_id", "slot_world", "slot_missing", "slot_garbage"]) {
      await loadButton(page, slot).click();
      await expect(page.locator("#error")).toBeVisible();
      await expect(page.locator("#error")).toContainText("호환되지 않아 불러오지 않았다");
      // nothing was loaded: still on the menu, no game state
      await expect(page.locator("#menu")).toBeVisible();
      await expect(page.locator("#game")).toBeHidden();
      expect(await page.evaluate(() => window.__v2App.getState())).toBeNull();
      // the save was neither deleted nor repaired
      await expect(page.locator("#slotList li")).toHaveCount(6);
    }

    // the message names what did not match
    await loadButton(page, "slot_ver").click();
    await expect(page.locator("#error")).toContainText("dataRef mismatch");
    await loadButton(page, "slot_world").click();
    await expect(page.locator("#error")).toContainText("worldId mismatch");

    // a compatible save still loads afterwards and clears the message
    await loadButton(page, "slot_good").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();

    // and the rejected saves are still there, unchanged, after a real reload
    await reload(page);
    await expect(page.locator("#slotList li")).toHaveCount(6);
    const stored = await page.evaluate(async () => {
      const storage = await import("/v2/storage/idb.js");
      return (await storage.load("slot_ver")).dataRef;
    });
    expect(stored.version).toBe("9.9.9");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the state is authoritative: a lying record header neither blocks a compatible save nor rescues an incompatible one", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("compat-seed-header"));

    await page.evaluate(async () => {
      const storage = await import("/v2/storage/idb.js");
      const base = window.__v2App.getState();
      await storage.save("slot_fine", structuredClone(base), {});
      const bad = structuredClone(base);
      bad.dataRef.version = "9.9.9";
      await storage.save("slot_stale", bad, {});

      // rewrite only the record HEADERS through raw IndexedDB: the fine save
      // claims another pack, the stale save claims the current one
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("txtrpg_v2");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("saves", "readwrite");
        const store = tx.objectStore("saves");
        const fineRequest = store.get("slot_fine");
        fineRequest.onsuccess = () => {
          const record = fineRequest.result;
          record.dataRef = { id: "other_pack", version: "9.9.9" };
          record.worldId = "other_world_1";
          store.put(record);
        };
        const staleRequest = store.get("slot_stale");
        staleRequest.onsuccess = () => {
          const record = staleRequest.result;
          record.dataRef = base.dataRef;
          record.worldId = base.worldId;
          store.put(record);
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });

    await reload(page);
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await loadButton(page, "slot_stale").click();
    await expect(page.locator("#error")).toContainText("호환되지 않아 불러오지 않았다");
    await expect(page.locator("#game")).toBeHidden();

    await loadButton(page, "slot_fine").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#error")).toBeHidden();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
