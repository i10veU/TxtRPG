// V2-Core-57 browser scenario (Issue #148, #147 Phase A, D-86): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The scout chosen at New Game has the investigation talent beside night vision; each real
// "마을 살피기" gives the scout 17 investigation practice (the wanderer 15), so the third observation
// reaches the keen eye (51) where the wanderer's does not (45). The talent and the practice survive
// save -> reload -> load; a scout saved before the talent (planted) has none and practises 15.
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
const status = (page) => page.locator("#status");
const observe = (page) => page.locator("#actions button", { hasText: "마을 살피기" }).click();
const getState = (page) => page.evaluate(() => window.__v2App.getState());
async function newGameAs(page, templateId) {
  await page.locator("#backgroundSelect").selectOption(templateId);
  await page.locator("#newGameBtn").click();
  await expect(page.locator("#game")).toBeVisible();
}
async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 talent (the scout's investigation talent grows practice faster)", () => {
  test("the scout practises 17 per observation, reaches the keen eye on the third, and keeps it through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameAs(page, "start_scout");
    await expect(status(page)).toContainText("특성: investigation_talent, night_vision");

    await observe(page);
    await expect(status(page)).toContainText("숙련도: investigation 17");
    await observe(page);
    await expect(status(page)).toContainText("숙련도: investigation 34");
    await expect(status(page)).toContainText("기술: investigation 1 (Novice)");

    await page.locator("#saveSlotInput").fill("slot_talent");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await reloadAndLoad(page, "slot_talent");
    expect(await getState(page)).toEqual(saved);

    await observe(page);
    await expect(status(page)).toContainText("숙련도: investigation 51");
    await expect(status(page)).toContainText("해금: unl_keen_eye");

    // a scout saved before the talent: no talent, the plain 15
    await page.evaluate(async () => {
      const storage = await import("/v2/storage/idb.js");
      const copy = structuredClone(window.__v2App.getState());
      delete copy.actors.player_1.growth.growth_wanderer.traits.investigation_talent;
      copy.actors.player_1.growth.growth_wanderer.proficiency.investigation = 0;
      delete copy.actors.player_1.growth.growth_wanderer.skills;
      delete copy.actors.player_1.growth.growth_wanderer.unlocks;
      await storage.save("slot_old_scout", copy, {});
    });
    await reloadAndLoad(page, "slot_old_scout");
    await expect(status(page)).toContainText("특성: night_vision");
    await expect(status(page)).not.toContainText("investigation_talent");
    await observe(page);
    await expect(status(page)).toContainText("숙련도: investigation 15");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the wanderer is unchanged: 15 per observation, no keen eye on the third", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(status(page)).not.toContainText("특성:");
    for (let i = 0; i < 3; i += 1) await observe(page);
    await expect(status(page)).toContainText("숙련도: investigation 45");
    await expect(status(page)).not.toContainText("해금:");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
