// J3 RC1: exercise the actual elder -> guess -> investigation route in Chromium.
// This is not a claim that the player's subjective J3 assessment passed.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";

test("J3 hypothesis: rumor unlocks guess, no instant oracle, actual action and Save compatibility", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ENTRY, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => window.__v2App.newGame("j3-ledger-browser"));
  const ledger = page.locator("#hypothesisLedger");
  await expect(ledger).toBeHidden();

  // The actual engine's elder dialogue grants this life its first rumor.
  await page.evaluate(() => window.__v2App.dispatch({ type: "perform", actionId: "act_talk_elder" }));
  await page.evaluate(() => window.__v2App.dispatch({ type: "choose", optionId: "opt_ask_ruins" }));
  await expect(ledger).toBeVisible();
  await expect(page.locator("#hypothesisEvidence")).toContainText("원로");
  await expect(page.locator("#hypothesisEvidence")).toContainText("오늘의 소식");
  await expect(page.locator("#hypothesisEvidence")).toContainText(/뜬소문|그럴듯함|믿을 만함|직접 확인함/);
  await expect(page.locator("#hypothesisVerdict")).toContainText("알 수 없다");
  const guess = ledger.getByRole("button", { name: "폐허에는 아무도 없을 것이다." });
  await guess.focus();
  await page.keyboard.press("Enter");
  await expect(guess).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#hypothesisVerdict")).toContainText("아직은 짐작");
  await expect(page.locator("#hypothesisNext")).toContainText("폐허");

  // Hypothesis selection is UI-only, not a new Save field. Load resets it.
  await page.locator("#saveSlotInput").fill("j3-ledger-slot");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("j3-ledger-slot");
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: "j3-ledger-slot" })
    .getByRole("button", { name: "불러오기" }).click();
  await expect(ledger).toBeVisible();
  await expect(ledger.locator('[aria-pressed="true"]')).toHaveCount(0);
  await guess.click();

  // Use the existing, canonical travel/shop/investigation actions.
  await page.evaluate(() => {
    const api = window.__v2App;
    api.dispatch({ type: "move", to: "loc_market" });
    api.dispatch({ type: "perform", actionId: "act_buy_lantern" });
    api.dispatch({ type: "move", to: "loc_village" });
    api.dispatch({ type: "move", to: "loc_ruins" });
  });
  const verify = ledger.getByRole("button", { name: "이 짐작을 현장에서 검증한다" });
  await expect(verify).toBeVisible();
  const before = await page.evaluate(() => window.__v2App.getState().time.minute);
  await verify.click();
  const after = await page.evaluate(() => window.__v2App.getState().time.minute);
  expect(after).toBeGreaterThan(before); // actual engine action, not UI quiz
  const observed = await page.evaluate(() => {
    const state = window.__v2App.getState();
    return state.knowledge?.[state.player.actorId]?.rum_ruins_secret?.sources?.includes("obs_loc_ruins") === true;
  });
  if (observed) {
    await expect(page.locator("#hypothesisVerdict")).toContainText("현장에서 반증되었다");
  } else {
    await expect(page.locator("#hypothesisVerdict")).toContainText("아직은 짐작");
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
