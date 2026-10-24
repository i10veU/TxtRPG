// Follow-up to frozen J3 RC1: a second, earned two-clue deduction.
// Uses actual elder/herbalist dialogue and the canonical spring investigation.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";

test("J3 two-clue case: hidden until both rumors, guess survives only in UI, spring action verifies", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ENTRY, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => window.__v2App.newGame("j3-linked-case-browser"));
  const ledger = page.locator("#linkedCaseLedger");
  await expect(ledger).toBeHidden();

  await page.evaluate(() => {
    const app = window.__v2App;
    app.dispatch({ type: "perform", actionId: "act_talk_elder" });
    app.dispatch({ type: "choose", optionId: "opt_ask_ruins" });
  });
  await expect(ledger).toBeHidden(); // One rumor must never unlock the answer.
  await page.evaluate(() => {
    const app = window.__v2App;
    app.dispatch({ type: "move", to: "loc_market" });
    app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
    app.dispatch({ type: "choose", optionId: "opt_herbalist_ask_sickness" });
  });
  await expect(ledger).toBeVisible();
  await expect(page.locator("#linkedCaseEvidence")).toContainText("폐허");
  await expect(page.locator("#linkedCaseEvidence")).toContainText("우물");
  await expect(page.locator("#linkedCaseVerdict")).not.toContainText("화살");

  const guess = ledger.getByRole("button", { name: "폐허와 샘은 별개의 사건일 것이다." });
  await guess.focus();
  await page.keyboard.press("Enter");
  await expect(guess).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#linkedCaseVerdict")).toContainText("짐작");

  // UI-only choice: save/load must preserve world knowledge, not the guess.
  await page.locator("#saveSlotInput").fill("j3-linked-case-slot");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("j3-linked-case-slot");
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: "j3-linked-case-slot" })
    .getByRole("button", { name: "불러오기" }).click();
  await expect(ledger).toBeVisible();
  await expect(ledger.locator('[aria-pressed="true"]')).toHaveCount(0);
  await guess.click();

  await page.evaluate(() => {
    const app = window.__v2App;
    app.dispatch({ type: "move", to: "loc_village" });
    app.dispatch({ type: "move", to: "loc_forest_spring" });
  });
  const verify = ledger.getByRole("button", { name: "이 짐작을 샘에서 검증한다" });
  await expect(verify).toBeVisible();
  const before = await page.evaluate(() => window.__v2App.getState().time.minute);
  await verify.click();
  const after = await page.evaluate(() => window.__v2App.getState().time.minute);
  expect(after).toBeGreaterThan(before);
  const foundArrows = await page.evaluate(() => {
    const state = window.__v2App.getState();
    return state.knowledge?.[state.player.actorId]?.rum_spring_bandits?.sources?.includes("obs_loc_forest_spring") === true;
  });
  if (foundArrows) {
    await expect(page.locator("#linkedCaseVerdict")).toContainText("현장에서 반증되었다");
    await expect(page.locator("#linkedCaseNext")).toContainText("원로");
  } else {
    await expect(page.locator("#linkedCaseVerdict")).not.toContainText("반증되었다");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
