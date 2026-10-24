// J3 post-RC1 browser QA: the ledger must complete the *real* evidence -> dialogue
// -> consequence path. Unit tests of linkedCaseElderAction alone cannot catch a
// missing button, wrong dispatch, or an elder dialogue that never receives the clue.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const SEED = "herb-30"; // Deterministic arrows-at-spring scenario, also used by spring-arrows regression.
const REPORT = "샘의 짐승에 박힌 도적단의 화살을 전한다";

test("J3 ledger shortcut opens real elder dialogue and changes village relation exactly once", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ENTRY, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);

  // Earn both rumors through the actual actions, not by injecting knowledge.
  await page.evaluate(() => {
    const app = window.__v2App;
    app.dispatch({ type: "perform", actionId: "act_talk_elder" });
    app.dispatch({ type: "choose", optionId: "opt_ask_ruins" });
    app.dispatch({ type: "perform", actionId: "act_inspect_well" });
    app.dispatch({ type: "move", to: "loc_market" });
    app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
    app.dispatch({ type: "choose", optionId: "opt_herbalist_ask_sickness" });
    app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
    app.dispatch({ type: "choose", optionId: "opt_herbalist_teach" });
    app.dispatch({ type: "move", to: "loc_village" });
    app.dispatch({ type: "move", to: "loc_forest_spring" });
  });
  const ledger = page.locator("#linkedCaseLedger");
  const next = page.locator("#linkedCaseNext");
  await expect(ledger).toBeVisible();
  await expect(next.getByRole("button", { name: "확인한 단서를 원로에게 이야기한다" })).toHaveCount(0);

  // Canonical field investigation: the world itself supplies first-hand arrows.
  await page.locator("#actions button", { hasText: "샘 주변을 뒤져 본다" }).click();
  await expect(page.locator("#log")).toContainText("도적단의 화살이다.");
  await expect(next.getByRole("button", { name: "확인한 단서를 원로에게 이야기한다" })).toHaveCount(0);
  await expect(next).toContainText("마을");

  await page.locator("#moves button", { hasText: "변경 마을" }).click();
  const shortcut = next.getByRole("button", { name: "확인한 단서를 원로에게 이야기한다" });
  await expect(shortcut).toBeVisible();
  const before = await page.evaluate(() => window.__v2App.getState().relations["npc_elder:player_1"].score);
  await shortcut.click();

  // The shortcut must not silently report evidence: it opens the existing choice.
  await expect(page.locator("#choiceOptions")).toContainText(REPORT);
  const afterTalk = await page.evaluate(() => window.__v2App.getState().relations["npc_elder:player_1"].score);
  expect(afterTalk).toBe(before);
  await page.locator("#choiceOptions button:not([disabled])", { hasText: REPORT }).click();
  await expect(page.locator("#log")).toContainText("샘을 흐린 것도 도적들이었다는 말이 곧 마을에 퍼질 것이다.");
  const afterReport = await page.evaluate(() => window.__v2App.getState().relations["npc_elder:player_1"].score);
  expect(afterReport).toBe(before + 5);
  await expect(shortcut).toHaveCount(0);
  await expect(next).toContainText("이 단서는 이미 원로에게 전했다");
  const reportTag = await page.evaluate(() => window.__v2App.getState().relations["npc_elder:player_1"].tags);
  expect(reportTag).toContain("spring_arrows_reported");

  // Reopening the elder must not offer the already-consumed consequence.
  await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
  await expect(page.locator("#choiceOptions button", { hasText: REPORT })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
