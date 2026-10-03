// V2-Core-26 browser scenarios (Issue #82, D-67): what the real UI renders
// from view() and what it does not. No new semantics are pinned -- these
// check the current local-client model (docs: DEVELOPMENT_RULES §13,
// CORE_CONTRACTS §1.1/§8.1): everything view() carries is rendered
// consistently, locked actions expose no reason (D-06/D-15), requirement-
// gated move links follow the existing Condition evaluator, and view() is the
// same after a real IndexedDB reload+load. What view() does NOT carry (time,
// move links, choice options) is deliberately not asserted here: that is the
// open part of D-67 (C).
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

const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();

// Everything view() carries must be what the screen shows.
async function expectScreenMatchesView(page) {
  const v = await page.evaluate(() => window.__v2App.getView());
  await expect(page.locator("#status")).toContainText(`HP ${v.actor.hp.current}/${v.actor.hp.max}`);
  await expect(page.locator("#status")).toContainText(`소지금 ${v.actor.money}`);
  if (v.pending) {
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#actions button")).toHaveCount(0);
    await expect(page.locator("#moves button")).toHaveCount(0);
  } else {
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#actions button")).toHaveCount(v.actions.length);
    await expect(page.locator("#actions button:disabled")).toHaveCount(v.actions.filter((a) => !a.available).length);
  }
  return v;
}

test.describe("V2 UI / view() boundary (D-67, current local-client model)", () => {
  test("HP, money, pending and action list on screen always match view(): start, hazard, death, respawn", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();

    let v = await expectScreenMatchesView(page);
    expect(v.actor.hp).toEqual({ current: 10, max: 10 });
    expect(v.pending).toBeNull();

    await move(page, "시장");
    await act(page, "등불 구입");
    await expectScreenMatchesView(page);
    await move(page, "변경 마을");
    await move(page, "폐허");
    v = await expectScreenMatchesView(page);
    expect(v.actor.hp.current).toBe(6);

    await page.locator("#waitBtn").click();
    v = await expectScreenMatchesView(page);
    expect(v.actor.hp.current).toBe(2);

    await page.locator("#waitBtn").click();
    v = await expectScreenMatchesView(page);
    expect(v.pending).toEqual({ kind: "newCharacter" });
    expect(v.actor.alive).toBe(false);

    await page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (start_wanderer)" }).click();
    v = await expectScreenMatchesView(page);
    expect(v.pending).toBeNull();
    expect(v.actor.id).toBe("player_2");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("locked actions and requirement-gated move links reveal no reason", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();

    // the ruins link requires the lantern: without it the link is simply absent
    await expect(page.locator("#moves button")).toHaveCount(1);
    await expect(page.locator("#moves button", { hasText: "시장" })).toHaveCount(1);
    await expect(page.locator("#moves button", { hasText: "폐허" })).toHaveCount(0);
    await expect(page.locator("#moves")).not.toContainText("등불");

    // a locked action entry is exactly a disabled button with the fixed suffix
    const locked = page.locator("#actions button", { hasText: "도적 두목과 대면" });
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveText("도적 두목과 대면 (잠김)");
    await expect(locked).not.toHaveAttribute("title", /.+/);

    // satisfy the requirement: the link appears, nothing else changes
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await expect(page.locator("#moves button")).toHaveCount(2);
    await expect(page.locator("#moves button", { hasText: "폐허" })).toBeEnabled();
    await expect(page.locator("#error")).toBeHidden();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("view() is identical after a real reload + load, for a mid-game and a pending-newCharacter save", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();

    await page.evaluate(() => {
      const d = window.__v2App.dispatch;
      d({ type: "move", to: "loc_market" });
      d({ type: "perform", actionId: "act_buy_lantern" });
      d({ type: "move", to: "loc_village" });
      d({ type: "move", to: "loc_ruins" });
    });
    const midView = await page.evaluate(() => window.__v2App.getView());
    expect(midView.actor.hp.current).toBe(6);
    await page.locator("#saveSlotInput").fill("slot_mid");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    await page.evaluate(() => {
      const d = window.__v2App.dispatch;
      d({ type: "wait", minutes: 30 });
      d({ type: "wait", minutes: 30 });
    });
    const deadView = await page.evaluate(() => window.__v2App.getView());
    expect(deadView.pending).toEqual({ kind: "newCharacter" });
    await page.locator("#saveSlotInput").fill("slot_dead");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);

    await page.locator("#slotList li", { hasText: "slot_mid" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await page.evaluate(() => window.__v2App.getView())).toEqual(midView);
    await expectScreenMatchesView(page);

    await page.locator("#backToMenuBtn").click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.locator("#slotList li", { hasText: "slot_dead" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await page.evaluate(() => window.__v2App.getView())).toEqual(deadView);
    await expectScreenMatchesView(page);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
