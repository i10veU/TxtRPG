// V2-Core-22 browser smoke: the real V2 world data pack
// (web/v2/data/world.js) loaded as an actual ES module in a real browser,
// played through its minimal path, and round-tripped through real
// IndexedDB (docs/v2/architecture/CORE_CONTRACTS.md §11, D-65, Issue #74).
// Node tests (tests/v2/data-world.test.js) already cover validateData,
// the full playthrough, determinism, and save/load logic without touching
// IndexedDB; this spec is the one place that exercises the real data
// module loading + real browser IndexedDB path together.
const { test, expect } = require("@playwright/test");

const HARNESS_URL = "http://127.0.0.1:4173/v2/storage/smoke.html";

const CANONICAL_SEED = "frontier-canonical-4";
const CANONICAL_ACTIONS = [
  { type: "perform", actionId: "act_observe_village" },
  { type: "perform", actionId: "act_observe_village" },
  { type: "move", to: "loc_market" },
  { type: "perform", actionId: "act_buy_lantern" },
  { type: "move", to: "loc_village" },
  { type: "move", to: "loc_ruins" },
  { type: "perform", actionId: "act_investigate_ruins" },
  { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_rest_village" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  { type: "perform", actionId: "act_confront_leader" }
];

test.describe("V2 world data pack (real content, real IndexedDB)", () => {
  test("loads as a real module, validates, plays through, and view() hides facts", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(HARNESS_URL, { waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2Smoke?.worldData))).toBe(true);

    // real ES module data import + validateData(data) === []
    const validationErrors = await page.evaluate(() => window.__v2Smoke.engine.validateData(window.__v2Smoke.worldData));
    expect(validationErrors).toEqual([]);

    const result = await page.evaluate((actions) => {
      const { createInitialState, step, view, validateState } = window.__v2Smoke.engine;
      const data = window.__v2Smoke.worldData;
      let state = createInitialState({ worldSeed: "frontier-canonical-4", data }).state;
      const tiers = [];
      for (const action of actions) {
        const r = step(state, action, data);
        state = r.state;
        const checkEvent = r.events.find((e) => e.type === "check.resolved");
        if (checkEvent) tiers.push(checkEvent.data.tier);
      }
      return {
        tiers,
        stateErrors: validateState(state),
        investigation: state.actors.player_1.growth.growth_wanderer.proficiency.investigation,
        unlocks: state.actors.player_1.growth.growth_wanderer.unlocks,
        factValue: state.facts.fact_ruins_secret.value,
        cases: state.cases,
        view: view(state, data)
      };
    }, CANONICAL_ACTIONS);

    expect(result.tiers).not.toContain("fail");
    expect(result.stateErrors).toEqual([]);
    expect(result.investigation).toBe(60);
    expect(result.unlocks).toEqual({ unl_keen_eye: true });
    expect(result.factValue).toBe("bandit_hideout");
    expect(result.cases.case_ruins_mystery.stage).toBe("resolved");

    // §8.4: the hidden fact must never leak into view()
    expect(result.view.facts).toBeUndefined();
    expect(result.view.actor.growth.growth_wanderer.stats.wit).toBe(8);
    expect(result.view.actions.find((a) => a.actionId === "act_confront_leader").available).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("real IndexedDB save/load round-trip with the world data pack, mid-playthrough", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(HARNESS_URL, { waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2Smoke?.worldData))).toBe(true);

    const result = await page.evaluate(async (actions) => {
      const { createInitialState, step, validateState } = window.__v2Smoke.engine;
      const data = window.__v2Smoke.worldData;
      let state = createInitialState({ worldSeed: "frontier-canonical-4", data }).state;

      // play up to (but not including) the check-bearing investigate action
      const investigateIndex = actions.findIndex((a) => a.actionId === "act_investigate_ruins");
      for (const action of actions.slice(0, investigateIndex)) {
        state = step(state, action, data).state;
      }

      await window.__v2Smoke.storage.save("slot_village", state, { savedAt: 42 });
      const reloaded = await window.__v2Smoke.storage.load("slot_village");

      const nextAction = actions[investigateIndex]; // act_investigate_ruins
      const fromOriginal = step(state, nextAction, data);
      const fromReloaded = step(reloaded, nextAction, data);

      return {
        reloadedEqualsOriginal: JSON.stringify(reloaded) === JSON.stringify(state),
        reloadedErrors: validateState(reloaded),
        sameNextResult: JSON.stringify(fromOriginal) === JSON.stringify(fromReloaded)
      };
    }, CANONICAL_ACTIONS);

    expect(result.reloadedEqualsOriginal).toBe(true);
    expect(result.reloadedErrors).toEqual([]);
    expect(result.sameNextResult).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
