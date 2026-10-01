// V2-Core-40 browser golden (Issue #111, D-75): the golden fixture of tests/v2/golden.test.js
// (tests/v2/fixtures/golden-path.json, CORE_CONTRACTS §13.2) run by the real engine modules in real
// Chromium. §2.7 states the engine's goal as the same result for server and client: the fingerprint of
// every step's {state, events} computed in the browser must equal the one Node computes now (the Node
// golden test's own `--print`, run as a child process) and the recorded one. Chromium == Node but !=
// recorded means the golden needs an intended update; Chromium != Node means the runtimes diverge.
// A run cut in the middle, saved to real IndexedDB, reloaded with the page and continued must reach the
// recorded final state.
//
// Nothing here changes when the golden is updated on purpose: the recorded fingerprints live in the
// fixture only. Every older spec is untouched.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const repoRoot = path.join(__dirname, "..");
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "v2", "fixtures", "golden-path.json"), "utf8"));

// what Node computes for the fixture right now, through the Node golden test itself
const nodeNow = () => JSON.parse(execFileSync(process.execPath, ["tests/v2/golden.test.js", "--print"], { cwd: repoRoot, encoding: "utf8" }));

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

// runs inside the page: the same canonical form as tests/v2/golden.test.js (JSON with sorted object
// keys) hashed with the engine's own hashString, as loaded by the browser
const BROWSER_FINGERPRINT = `
  const canonicalJson = (value) => {
    if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
    if (value !== null && typeof value === "object") {
      return "{" + Object.keys(value).sort().filter((key) => value[key] !== undefined)
        .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key])).join(",") + "}";
    }
    return JSON.stringify(value);
  };
  return (value) => hashString(canonicalJson(value)).toString(16).padStart(8, "0");
`;

test.describe("V2 golden (Node and real Chromium give the same result)", () => {
  test("every step's fingerprint in Chromium equals Node's and the recorded one", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const inNode = nodeNow();

    const inBrowser = await page.evaluate(async ({ fixture, source }) => {
      const { createInitialState, step } = await import("/v2/core/engine.js");
      const { hashString } = await import("/v2/core/rng.js");
      const fingerprint = new Function("hashString", source)(hashString);
      const results = [createInitialState({ worldSeed: fixture.worldSeed, data: fixture.data })];
      for (const action of fixture.actions) results.push(step(results.at(-1).state, action, fixture.data));
      return { stepHashes: results.map(fingerprint), finalStateHash: fingerprint(results.at(-1).state) };
    }, { fixture, source: BROWSER_FINGERPRINT });

    expect(inBrowser.stepHashes).toHaveLength(fixture.actions.length + 1);
    inBrowser.stepHashes.forEach((hash, i) => {
      expect(hash, `step ${i}: Chromium vs Node`).toBe(inNode.stepHashes[i]);
    });
    expect(inBrowser.finalStateHash).toBe(inNode.finalStateHash);
    expect(inBrowser.stepHashes).toEqual(fixture.stepHashes);
    expect(inBrowser.finalStateHash).toBe(fixture.finalStateHash);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a run saved to real IndexedDB, reloaded with the page and continued reaches the recorded final state", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    for (const cut of [20, 34]) {
      const slot = `slot_golden_${cut}`;
      // the head of the run, saved through the real storage adapter
      await page.evaluate(async ({ fixture, cut, slot }) => {
        const { createInitialState, step } = await import("/v2/core/engine.js");
        const idb = await import("/v2/storage/idb.js");
        let state = createInitialState({ worldSeed: fixture.worldSeed, data: fixture.data }).state;
        for (const action of fixture.actions.slice(0, cut)) state = step(state, action, fixture.data).state;
        await idb.save(slot, state, { savedAt: cut });
      }, { fixture, cut, slot });

      // a real page reload, then the rest of the run from the loaded record
      await page.reload({ waitUntil: "networkidle" });
      await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
      const finalStateHash = await page.evaluate(async ({ fixture, cut, slot, source }) => {
        const { step } = await import("/v2/core/engine.js");
        const { hashString } = await import("/v2/core/rng.js");
        const idb = await import("/v2/storage/idb.js");
        const fingerprint = new Function("hashString", source)(hashString);
        let state = await idb.load(slot);
        for (const action of fixture.actions.slice(cut)) state = step(state, action, fixture.data).state;
        await idb.remove(slot);
        return fingerprint(state);
      }, { fixture, cut, slot, source: BROWSER_FINGERPRINT });

      expect(finalStateHash, `cut after ${cut} actions`).toBe(fixture.finalStateHash);
    }

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
