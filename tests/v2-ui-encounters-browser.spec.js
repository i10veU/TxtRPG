// V2-Core-155 browser scenario (D-133): something happening here, through the real entry point in real Chromium with the
// real pack. tests/v2/data-world-encounters.test.js checks the pack.
//   1. by day in the fouled village a card heads what I can do: the scene, then its ways, numbered first; a way I lack the
//      means for (the bread) is shown under it, disabled, with what it needs; carrying the child takes me to the market,
//      teaches the well's source (the discovery card says from whom) and the card is gone
//   2. the same encounter, saved and loaded, is still there; taken, it stays gone across a reload
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

async function gotoApp(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => window.__v2App.newGame("history-41"));
  await expect(page.locator("#game")).toBeVisible();
  await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 8 * 60 }));
  return errors;
}
const text = (page, id) => page.evaluate((k) => window.__v2App.worldData.texts[k], id);
const card = (page) => page.locator('#actions .encounter[data-encounter="enc_well_child_intro"]');

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 things that happen on the way (V2-Core-155)", () => {
  test("the well's child: the scene, its ways, the bread I lack, carried to the herbalist", async ({ page }) => {
    const errors = await gotoApp(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page).locator("p")).toHaveText(await text(page, "enc_well_child_intro"));
    // the encounter's ways come first among what I can do
    const firstWay = await card(page).locator("button:not([disabled])").first().innerText();
    await expect(page.locator("#actions button:not([disabled])").first()).toHaveText(firstWay);
    const bread = card(page).locator("button", { hasText: "가진 빵을 쪼개 나눠 준다" });
    await expect(bread).toBeDisabled();
    await expect(bread).toHaveAttribute("data-note", /^필요: /);
    await card(page).locator("button", { hasText: "아이를 업고 장터의 약초꾼에게 간다" }).click();
    await expect(page.locator("#location")).toContainText("시장");
    await expect(page.locator("#scene")).toContainText("약초꾼은 아이의 배를 짚어 보고");
    await expect(page.locator("#news li", { hasText: "새로 안 것" })).toContainText(await text(page, "lbl_rumor_rum_well_source"));
    await page.locator("#moves button", { hasText: "변경 마을로 간다" }).click();
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("an encounter survives a save; once taken it stays gone", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.locator("#saveSlotInput").fill("slot_enc");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_enc");
    await loadSlot(page, "slot_enc");
    await expect(card(page)).toBeVisible();
    await card(page).locator("button", { hasText: "곁의 어른에게 무슨 일인지 묻는다" }).click();
    await expect(card(page)).toHaveCount(0);
    await page.locator("#saveSlotInput").fill("slot_enc_done");
    await page.locator("#saveBtn").click();
    // the save is written before the page is reloaded
    await expect(page.locator("#log")).toContainText("slot_enc_done");
    await loadSlot(page, "slot_enc_done");
    await expect(card(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
