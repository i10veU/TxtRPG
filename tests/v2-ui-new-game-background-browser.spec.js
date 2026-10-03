// V2-Core-54 browser scenario (Issue #141, D-83): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The menu offers
// the backgrounds (the existing characterTemplates); choosing the scout and pressing New Game starts
// the first character as a scout -- night vision in the status, the dark ruins open without a
// lantern -- and the choice survives save -> reload -> load. Not touching the choice starts the
// wanderer, as before.
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
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 new game background (the first character chooses too)", () => {
  test("the menu's scout: night vision from the first step, kept through save -> reload -> load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const select = page.locator("#backgroundSelect");
    await expect(select.locator("option")).toHaveText(["start_scout", "start_wanderer"]);
    await expect(select).toHaveValue("start_wanderer");

    await select.selectOption("start_scout");
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#status")).toContainText("특성: investigation_talent, night_vision");
    await expect(page.locator("#status")).toContainText("소지금 3");
    const started = await getState(page);
    expect(started.player).toEqual({ actorId: "player_1", characterCount: 1 });
    expect(started.actors.npc_bandit_leader.kind).toBe("npc");

    // no lantern: the rumor, then straight into the dark ruins
    await page.locator("#actions button", { hasText: "원로와 대화" }).click();
    await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" }).click();
    await page.locator("#moves button", { hasText: "폐허" }).click();
    await expect(page.locator("#location")).toContainText("폐허");

    await page.locator("#saveSlotInput").fill("slot_scout");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_scout" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);
    await expect(page.locator("#status")).toContainText("특성: investigation_talent, night_vision");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("not touching the choice starts the wanderer, as before", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#status")).toContainText("소지금 8");
    await expect(page.locator("#status")).not.toContainText("특성:");
    const state = await getState(page);
    expect(state.actors.player_1.growth.growth_wanderer.traits).toBeUndefined();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
