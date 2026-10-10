// V2-Core-53 browser scenario (Issue #139, D-82): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium, against the real world data pack. After a death the successor's
// background is chosen from the real buttons (one per background); the scout's trait shows in the
// status, and with night vision the scout walks into the dark ruins and searches them without a
// lantern -- real buttons for all of it. The first fall comes from the hazard while waiting there.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const WANDERER = "새 캐릭터로 시작 (떠돌이)";
const SCOUT = "새 캐릭터로 시작 (정찰자)";

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
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 starting background (the scout and night vision)", () => {
  test("a successor chooses the scout; night vision opens the dark ruins without a lantern", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("background-ui"));
    await expect(page.locator("#game")).toBeVisible();

    // the wanderer, with a lantern, falls to the ruins' hazard
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    for (let i = 0; i < 8 && (await page.locator("#choice").isHidden()); i += 1) await page.locator("#waitBtn").click();

    // one button per background
    await expect(choiceButton(page, WANDERER)).toHaveCount(1);
    await expect(choiceButton(page, SCOUT)).toHaveCount(1);
    await choiceButton(page, SCOUT).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#status")).toContainText("특성: 조사의 재능, 밤눈");
    await expect(page.locator("#status")).toContainText("소지금 6");
    await expect(page.locator("#status")).not.toContainText("낡은 등불");

    // no lantern: the rumor, then straight into the dark ruins, and the search
    await act(page, "원로와 대화");
    await choiceButton(page, "폐허에 대해 묻기").click();
    await move(page, "폐허");
    await expect(page.locator("#location")).toContainText("폐허");
    await act(page, "폐허 조사");
    await expect(page.locator("#log")).toContainText("판정:");
    const state = await getState(page);
    expect(state.player.actorId).toBe("player_2");
    expect(state.actors.player_2.inventory.item_lantern).toBeUndefined();
    expect(state.actors.player_2.growth.growth_wanderer.traits).toEqual({ night_vision: true, investigation_talent: true });
    expect(state.actors.player_2.growth.growth_wanderer.proficiency.investigation).toBeGreaterThan(0); // the search happened

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
