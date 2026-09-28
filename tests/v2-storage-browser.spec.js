// V2-Core-21 browser smoke: real IndexedDB via web/v2/storage/idb.js,
// served through the test-only harness at web/v2/storage/smoke.html
// (docs/v2/architecture/CORE_CONTRACTS.md §10, D-63/D-64, Issue #72).
// Node tests (tests/v2/storage.test.js) already cover the pure
// buildSaveRecord/parseLoadedRecord logic without touching IndexedDB; this
// spec is the one place that exercises the real browser IndexedDB CRUD
// path end to end.
const { test, expect } = require("@playwright/test");

const HARNESS_URL = "http://127.0.0.1:4173/v2/storage/smoke.html";

test.describe("V2 storage adapter (IndexedDB)", () => {
  test("DB/store creation, save, load, list, overwrite, slot isolation, remove, round-trip", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(HARNESS_URL, { waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2Smoke))).toBe(true);

    // 1. DB creation + 2. saves store creation (opening triggers
    // onupgradeneeded, which creates the store)
    const dbNames = await page.evaluate(async () => {
      const { createInitialState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-init", data: window.__v2Smoke.fixtureData });
      await window.__v2Smoke.storage.save("slot_a", state, { savedAt: 1000 });
      const names = await indexedDB.databases();
      return names.map((entry) => entry.name);
    });
    expect(dbNames).toContain("txtrpg_v2");

    // 3. save + 4. load + 5. state deep equality
    const { originalState, loadedState } = await page.evaluate(async () => {
      const { createInitialState, step } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-a", data: window.__v2Smoke.fixtureData });
      const afterRest = step(state, { type: "perform", actionId: "act_rest" }, window.__v2Smoke.fixtureData).state;
      await window.__v2Smoke.storage.save("slot_a", afterRest, { savedAt: 2000 });
      const loaded = await window.__v2Smoke.storage.load("slot_a");
      return { originalState: afterRest, loadedState: loaded };
    });
    expect(loadedState).toEqual(originalState);

    // 6. list -- metadata only, no full state, sorted deterministically
    const listing1 = await page.evaluate(async () => {
      const { createInitialState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-b", data: window.__v2Smoke.fixtureData });
      await window.__v2Smoke.storage.save("slot_b", state, { savedAt: 3000 });
      return window.__v2Smoke.storage.list();
    });
    expect(listing1.map((entry) => entry.slot)).toEqual(["slot_a", "slot_b"]);
    listing1.forEach((entry) => {
      expect(entry.state).toBeUndefined();
      expect(typeof entry.schemaVersion).toBe("number");
    });
    expect(listing1.find((e) => e.slot === "slot_a").savedAt).toBe(2000);
    expect(listing1.find((e) => e.slot === "slot_b").savedAt).toBe(3000);

    // 7. overwrite -- saving the same slot again replaces it, list count
    // stays the same
    const overwriteResult = await page.evaluate(async () => {
      const { createInitialState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-a-v2", data: window.__v2Smoke.fixtureData });
      await window.__v2Smoke.storage.save("slot_a", state, { savedAt: 9999 });
      const listing = await window.__v2Smoke.storage.list();
      const reloaded = await window.__v2Smoke.storage.load("slot_a");
      return { listing, reloaded, expected: state };
    });
    expect(overwriteResult.listing.map((e) => e.slot)).toEqual(["slot_a", "slot_b"]);
    expect(overwriteResult.listing.find((e) => e.slot === "slot_a").savedAt).toBe(9999);
    expect(overwriteResult.reloaded).toEqual(overwriteResult.expected);

    // 8. slot A/B isolation -- writing/loading slot_b never touches slot_a
    const isolation = await page.evaluate(async () => {
      const a = await window.__v2Smoke.storage.load("slot_a");
      const b = await window.__v2Smoke.storage.load("slot_b");
      return { aWorldSeedMatches: a.worldSeed, bWorldSeedMatches: b.worldSeed };
    });
    expect(isolation.aWorldSeedMatches).not.toBe(isolation.bWorldSeedMatches);

    // 9. remove -- deletes only the given slot
    await page.evaluate(() => window.__v2Smoke.storage.remove("slot_a"));
    const afterRemove = await page.evaluate(() => window.__v2Smoke.storage.list());
    expect(afterRemove.map((e) => e.slot)).toEqual(["slot_b"]);

    // 10. missing slot -> load rejects clearly (never a silent null success)
    await expect(page.evaluate(() => window.__v2Smoke.storage.load("slot_a"))).rejects.toThrow(/no save found/);

    // removing an already-absent slot is a no-op success (native IndexedDB
    // delete semantics, no invented policy)
    await expect(page.evaluate(() => window.__v2Smoke.storage.remove("slot_a"))).resolves.toBeUndefined();

    // 11. malformed record -- written directly to IndexedDB (bypassing the
    // adapter's own validation on purpose) to prove load() rejects it too
    await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("txtrpg_v2", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("saves", "readwrite");
          tx.objectStore("saves").put({ slot: "slot_malformed", schemaVersion: 1, state: "not-an-object" });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });
    await expect(page.evaluate(() => window.__v2Smoke.storage.load("slot_malformed"))).rejects.toThrow();

    // 12. future/unsupported schemaVersion -> load rejects
    await page.evaluate(async () => {
      const { createInitialState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-future", data: window.__v2Smoke.fixtureData });
      return new Promise((resolve, reject) => {
        const request = indexedDB.open("txtrpg_v2", 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("saves", "readwrite");
          tx.objectStore("saves").put({
            slot: "slot_future",
            schemaVersion: 99,
            state: { ...state, schemaVersion: 99 }
          });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });
    await expect(page.evaluate(() => window.__v2Smoke.storage.load("slot_future")))
      .rejects.toThrow(/unsupported schemaVersion/);

    // 13. invalid state -> save() itself rejects before ever touching IDB
    await expect(page.evaluate(async () => {
      const { createInitialState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-invalid", data: window.__v2Smoke.fixtureData });
      const broken = { ...state, time: { minute: 1.5 } };
      return window.__v2Smoke.storage.save("slot_invalid", broken, { savedAt: 1 });
    })).rejects.toThrow(/validateState/);
    const afterInvalidAttempt = await page.evaluate(() => window.__v2Smoke.storage.list());
    expect(afterInvalidAttempt.map((e) => e.slot)).not.toContain("slot_invalid");

    // 14. save -> reload -> validate (validateState clean after a real
    // round-trip through IndexedDB, not just through JS objects)
    const validateAfterRoundTrip = await page.evaluate(async () => {
      const { createInitialState, validateState } = window.__v2Smoke.engine;
      const { state } = createInitialState({ worldSeed: "smoke-validate", data: window.__v2Smoke.fixtureData });
      await window.__v2Smoke.storage.save("slot_validate", state, { savedAt: 5 });
      const reloaded = await window.__v2Smoke.storage.load("slot_validate");
      return validateState(reloaded);
    });
    expect(validateAfterRoundTrip).toEqual([]);

    // 15. repeated save/load cycles stay consistent
    const repeatedResult = await page.evaluate(async () => {
      const { createInitialState, step } = window.__v2Smoke.engine;
      let { state } = createInitialState({ worldSeed: "smoke-repeat", data: window.__v2Smoke.fixtureData });
      const snapshots = [];
      for (let i = 0; i < 5; i += 1) {
        state = window.__v2Smoke.engine.step(state, { type: "wait", minutes: 10 }, window.__v2Smoke.fixtureData).state;
        await window.__v2Smoke.storage.save("slot_repeat", state, { savedAt: 100 + i });
        const loaded = await window.__v2Smoke.storage.load("slot_repeat");
        snapshots.push(JSON.stringify(loaded) === JSON.stringify(state));
      }
      return snapshots;
    });
    expect(repeatedResult).toEqual([true, true, true, true, true]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("long-run persistence: step -> save -> load -> same action -> step matches an unsaved control run", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(HARNESS_URL, { waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2Smoke))).toBe(true);

    const result = await page.evaluate(async () => {
      const { createInitialState, step } = window.__v2Smoke.engine;
      const data = window.__v2Smoke.fixtureData;

      // control: no save/load anywhere in the chain
      let control = createInitialState({ worldSeed: "persist-check", data }).state;
      control = step(control, { type: "perform", actionId: "act_rest" }, data).state;
      control = step(control, { type: "move", to: "loc_market" }, data).state;
      control = step(control, { type: "wait", minutes: 45 }, data).state;

      // experiment: save/load between every step
      let experiment = createInitialState({ worldSeed: "persist-check", data }).state;
      experiment = step(experiment, { type: "perform", actionId: "act_rest" }, data).state;
      await window.__v2Smoke.storage.save("slot_persist", experiment, { savedAt: 1 });
      experiment = await window.__v2Smoke.storage.load("slot_persist");

      experiment = step(experiment, { type: "move", to: "loc_market" }, data).state;
      await window.__v2Smoke.storage.save("slot_persist", experiment, { savedAt: 2 });
      experiment = await window.__v2Smoke.storage.load("slot_persist");

      experiment = step(experiment, { type: "wait", minutes: 45 }, data).state;
      await window.__v2Smoke.storage.save("slot_persist", experiment, { savedAt: 3 });
      experiment = await window.__v2Smoke.storage.load("slot_persist");

      return { control, experiment };
    });

    expect(result.experiment).toEqual(result.control);
    // spell out the specific fields the issue calls out, not just a blanket
    // deep-equal, so a partial-field regression is easy to diagnose
    expect(result.experiment.rng).toEqual(result.control.rng);
    expect(result.experiment.time.minute).toBe(result.control.time.minute);
    expect(result.experiment.actors).toEqual(result.control.actors);
    expect(result.experiment.facts).toEqual(result.control.facts);
    expect(result.experiment.knowledge).toEqual(result.control.knowledge);
    expect(result.experiment.relations).toEqual(result.control.relations);
    expect(result.experiment.cases).toEqual(result.control.cases);
    expect(result.experiment.fired).toEqual(result.control.fired);
    expect(result.experiment.attempts).toEqual(result.control.attempts);
    expect(result.experiment.pending).toEqual(result.control.pending);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
