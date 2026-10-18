// V2-Core-152 browser scenario (the owner's second look: the bands blur, it is hard to read, learning something gives no
// pleasure): the reading screen through the real entry point in real Chromium with the real pack.
//   1. a word heard is shown as learned, with who said it; the goal that moved is marked new; the notebook counts it and
//      marks the word; the dialogue has its own heading
//   2. what is bought is shown as gained, the silver as given; a quiet step shows nothing new
//   3. the number keys press the numbered choices, the enabled ones in the order shown
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
  return errors;
}
const text = (page, id) => page.evaluate((k) => window.__v2App.worldData.texts[k], id);
const news = (page) => page.locator("#news li");

test.describe("V2 discovery and the reading bands (V2-Core-152)", () => {
  test("a word learned, a goal moved, the notebook's count, the dialogue's heading", async ({ page }) => {
    const errors = await gotoApp(page);
    await expect(page.locator("#news")).toBeHidden();
    await expect(page.locator("#goal")).toHaveAttribute("data-changed", "false");
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await expect(page.locator("#choiceTitle")).toHaveText(await text(page, "lbl_choice_choice_elder_dialogue"));
    await expect(page.locator("#doingLabel")).toBeHidden();
    await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻는다" }).click();
    await expect(news(page)).toHaveCount(1);
    await expect(news(page).first()).toHaveAttribute("data-kind", "learned");
    await expect(news(page).first()).toContainText("새로 안 것");
    await expect(news(page).first()).toContainText(await text(page, "lbl_rumor_rum_ruins_secret"));
    await expect(news(page).first()).toContainText("에게 들음");
    await expect(page.locator("#goal")).toHaveAttribute("data-changed", "true");
    await expect(page.locator("#notebookBtn")).toHaveAttribute("data-count", "아는 것 1 · 새로 1");
    await page.locator("#notebookBtn").click();
    await expect(page.locator("#knowledge li[data-new]")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("what is bought and what it cost; a quiet step shows nothing new", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.locator("#moves button", { hasText: "시장으로 간다" }).click();
    await expect(page.locator("#news")).toBeHidden();
    await expect(page.locator("#goal")).toHaveAttribute("data-changed", "false");
    const before = await page.evaluate(() => { const s = window.__v2App.getState(); return s.actors[s.player.actorId].money; });
    await page.locator("#actions button", { hasText: /^등불을 산다$/ }).click();
    const after = await page.evaluate(() => { const s = window.__v2App.getState(); return s.actors[s.player.actorId].money; });
    await expect(news(page).filter({ hasText: "얻었다" })).toContainText("등불");
    await expect(news(page).filter({ hasText: "내주었다" })).toContainText(`은화 ${before - after}`);
    expect(errors).toEqual([]);
  });

  test("the number keys press the numbered choices", async ({ page }) => {
    const errors = await gotoApp(page);
    const enabled = page.locator("#actions button:not(:disabled)");
    const fourth = await enabled.nth(3).innerText();
    expect(fourth).toBe("원로를 찾아간다");
    await page.keyboard.press("4");
    await expect(page.locator("#choice")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.locator("#choice")).toBeHidden();
    await expect(news(page).first()).toContainText(await text(page, "lbl_rumor_rum_ruins_secret"));
    // typing in the save name does not press anything
    await page.locator("#saveSlotInput").fill("");
    await page.locator("#saveSlotInput").press("2");
    await expect(page.locator("#saveSlotInput")).toHaveValue("2");
    expect(errors).toEqual([]);
  });
});
