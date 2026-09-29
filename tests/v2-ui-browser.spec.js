// V2-Core-23 browser smoke: the real minimal browser entry point
// (web/v2/index.html + web/v2/ui/app.js) driven through an actual
// Chromium page -- new game, the full canonical Condition/Check/Effect/
// choice/growth-gate path from the V2-Core-22 world data pack, pending
// choice UI, save/reload/load via real IndexedDB, slot isolation, locked/
// invalid action handling, and a small-viewport layout check
// (docs/v2/architecture/CORE_CONTRACTS.md, Issue #76).
//
// Node tests (tests/v2/data-world.test.js) already cover the underlying
// engine/data contract in depth; this spec is the one place that exercises
// the real UI surface end to end in a real browser.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const CANONICAL_SEED = "frontier-canonical-4";

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

test.describe("V2 minimal browser UI (real entry point)", () => {
  test("entry point loads, world data imports, new game creates a valid initial state", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    await expect(page.locator("#menu")).toBeVisible();
    await expect(page.locator("#game")).toBeHidden();

    await page.locator("#newGameBtn").click();

    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#menu")).toBeHidden();
    await expect(page.locator("#location")).toContainText("변경 마을");

    const check = await page.evaluate(() => {
      const state = window.__v2App.getState();
      const v = window.__v2App.getView();
      return {
        hasPlayer: Boolean(state.player),
        actorId: state.player.actorId,
        wit: state.actors.player_1.growth.growth_wanderer.stats.wit,
        viewHasFacts: "facts" in v
      };
    });
    expect(check.hasPlayer).toBe(true);
    expect(check.actorId).toBe("player_1");
    expect(check.wit).toBe(8);
    expect(check.viewHasFacts).toBe(false);

    // action buttons rendered from view().actions
    await expect(page.locator("#actions button")).not.toHaveCount(0);
    // act_confront_leader is showWhenLocked -- visible but disabled, no reason shown
    const confrontBtn = page.locator("#actions button", { hasText: "도적 두목과 대면" });
    await expect(confrontBtn).toBeVisible();
    await expect(confrontBtn).toBeDisabled();
    await expect(confrontBtn).toHaveText(/\(잠김\)/);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("full canonical path: observe -> buy lantern -> investigate (check) -> talk (choice) -> confront (check, growth-gated)", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);
    await expect(page.locator("#game")).toBeVisible();

    const clickAction = async (label) => {
      await page.locator("#actions button", { hasText: label }).click();
    };

    await clickAction("마을 살피기");
    await clickAction("마을 살피기");
    await clickAction("등불 구입");

    // investigate: a real check() decides the outcome; canonical seed lands
    // on a non-fail tier (verified in tests/v2/data-world.test.js)
    await clickAction("폐허 조사");
    const afterInvestigate = await page.evaluate(() => window.__v2App.getLog());
    expect(afterInvestigate.some((line) => line.includes("판정:"))).toBe(true);

    // talk to the elder -> real pending choice UI
    await clickAction("원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#actions")).toBeEmpty();
    await expect(page.locator("#moves")).toBeEmpty();
    await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" }).click();
    await expect(page.locator("#choice")).toBeHidden();

    // growth-gate: investigation proficiency (15+15+30=60) crossed the 50
    // threshold during the investigate action, unlocking unl_keen_eye; the
    // investigate success also set the ruins_secret_confirmed flag -- so
    // act_confront_leader should now be enabled
    const confrontBtn = page.locator("#actions button", { hasText: "도적 두목과 대면" });
    await expect(confrontBtn).toBeEnabled();

    await confrontBtn.click();

    const final = await page.evaluate(() => {
      const state = window.__v2App.getState();
      const v = window.__v2App.getView();
      return {
        investigation: state.actors.player_1.growth.growth_wanderer.proficiency.investigation,
        unlocks: state.actors.player_1.growth.growth_wanderer.unlocks,
        factValue: state.facts.fact_ruins_secret.value,
        caseStage: state.cases?.case_ruins_mystery?.stage,
        knowledgeClaim: v.knowledge.rum_ruins_secret.claim,
        viewHasFacts: "facts" in v
      };
    });
    expect(final.investigation).toBe(60);
    expect(final.unlocks).toEqual({ unl_keen_eye: true });
    expect(final.factValue).toBe("bandit_hideout");
    expect(final.caseStage).toBe("resolved");
    expect(final.knowledgeClaim).toBe("bandit_hideout");
    expect(final.viewHasFacts).toBe(false); // hidden fact never leaks into view(), even after being set

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload page -> load -> identical state/view; new game vs loaded game slot isolation", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);
    await page.locator("#actions button", { hasText: "마을 살피기" }).click();

    const beforeSave = await page.evaluate(() => window.__v2App.getState());

    await page.locator("#saveSlotInput").fill("slot_a");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBeGreaterThan(0);

    // a second, independent slot from a fresh game
    await page.evaluate((seed) => window.__v2App.newGame(seed), "a-different-seed");
    await page.locator("#saveSlotInput").fill("slot_b");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await expect(page.locator("#menu")).toBeVisible();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await page.locator("#slotList li", { hasText: "slot_a" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();

    const afterLoad = await page.evaluate(() => window.__v2App.getState());
    expect(afterLoad).toEqual(beforeSave);

    // slot isolation: loading slot_a must not carry over slot_b's different worldSeed
    expect(afterLoad.worldSeed).toBe(CANONICAL_SEED);
    expect(afterLoad.worldSeed).not.toBe("a-different-seed");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("invalid/locked action handling does not crash the page", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);

    // locked action: UI never even sends a dispatch for a disabled button,
    // but the underlying engine path must still reject cleanly if attempted
    // directly (defence in depth, same call the button would have made)
    const lockedResult = await page.evaluate(() => {
      const before = window.__v2App.getState();
      window.__v2App.dispatch({ type: "perform", actionId: "act_confront_leader" });
      const after = window.__v2App.getState();
      return { unchanged: JSON.stringify(before) === JSON.stringify(after) };
    });
    expect(lockedResult.unchanged).toBe(true);

    // unknown action id
    const unknownResult = await page.evaluate(() => {
      const before = window.__v2App.getState();
      window.__v2App.dispatch({ type: "perform", actionId: "act_does_not_exist" });
      const after = window.__v2App.getState();
      return { unchanged: JSON.stringify(before) === JSON.stringify(after) };
    });
    expect(unknownResult.unchanged).toBe(true);

    // page must still be responsive after both rejected attempts
    await expect(page.locator("#actions button").first()).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("small viewport: no horizontal overflow, key controls remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1); // allow 1px rounding

    await expect(page.locator("#actions button").first()).toBeVisible();
    await expect(page.locator("#waitBtn")).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
