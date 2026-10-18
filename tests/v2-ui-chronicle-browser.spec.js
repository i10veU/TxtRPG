// V2-Core-156 browser scenario (D-134): deeds, endings and the chronicle, through the real entry point in real Chromium with
// real IndexedDB and the real pack. tests/v2/chronicle.test.js checks the pure parts.
//   1. a deed done for the first time shows in the discovery card as such, with practice gained beside it; the book of
//      deeds on the menu has it, the rest blank
//   2. an ending learned (the elder tells the day the frontier held) opens the ending card -- its title, how long the
//      life lasted, what it did -- and the life is written into the chronicle; the life goes on when asked
//   3. a fall closes a life too: the card names it, a new life begins, and both lives are kept
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_RUINS = [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")];

async function gotoApp(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  return errors;
}
const text = (page, id) => page.evaluate((k) => window.__v2App.worldData.texts[k], id);
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 the chronicle (V2-Core-156)", () => {
  test("a deed done for the first time, the practice beside it, the book of deeds", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_RUINS);
    await page.locator("#actions button", { hasText: "폐허 안을 살핀다" }).click();
    const deed = page.locator('#news li[data-kind="deed"]');
    await expect(deed).toContainText(await text(page, "deed_ruins_found"));
    await expect(deed).toContainText("처음 이룬 일");
    await expect(page.locator('#news li[data-kind="grew"]').first()).toContainText("숙련 +");
    await page.locator("#backToMenuBtn").click();
    await expect(page.locator("#chronicleSection")).toBeVisible();
    await expect(page.locator('#deedBook li[data-done="true"]')).toHaveText([await text(page, "deed_ruins_found")]);
    await expect(page.locator('#deedBook li[data-done="false"]').first()).toHaveText("？？？");
    expect(errors).toEqual([]);
  });

  test("an ending learned opens its card; the life is written and goes on", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    // the frontier held (staged through the real storage adapter): the elder tells the day
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.signals = { ...s.signals, frontier_fate: 2 };
      s.facts = { ...s.facts, fact_ending: { value: "held", since: 0 } };
      await idb.save("slot_held", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_held");
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button:not([disabled])", { hasText: "그날의 일을 듣는다" }).click();
    const card = page.locator("#ending");
    await expect(card).toBeVisible();
    await expect(card.locator("h2")).toHaveText(await text(page, "end_held_title"));
    await expect(card.locator("p.meta")).toContainText(/일 · 이룬 일 \d+/);
    await card.getByRole("button", { name: "이 세계에서 계속 살아간다" }).click();
    await expect(card).toBeHidden();
    await page.locator("#backToMenuBtn").click();
    await expect(page.locator("#lives li").first()).toContainText(await text(page, "end_held_title"));
    expect(errors).toEqual([]);
  });

  test("a fall closes a life; the next begins; both are kept", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, [M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))]);
    const card = page.locator("#ending");
    await expect(card).toHaveAttribute("data-end", "died");
    await expect(card.locator("h2")).toHaveText(await text(page, "end_died_title"));
    await page.locator("#choiceOptions button", { hasText: "새로 시작한다" }).first().click();
    await expect(card).toBeHidden();
    await page.locator("#backToMenuBtn").click();
    await expect(page.locator('#lives li[data-end="died"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
