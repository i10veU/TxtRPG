// V2-Core-153 browser scenario (D-131): what a choice asks of me, shown under its words, through the real entry point in
// real Chromium with the real pack. tests/v2/ui-stakes.test.js checks the module.
//   1. a road tells its time; the search of the ruins tells its time, what makes it possible (✓) and its chance; the
//      leader's confrontation, locked, tells what of mine is lacking
//   2. in a dialogue an option I lack the means for is shown, disabled, with what it needs, and the number keys skip it;
//      an option behind a relation stays hidden
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
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const name = (page, kind, id) => page.evaluate(([k, i]) => (k === "item" ? window.__v2App.worldData.items[i].name : window.__v2App.worldData.texts[i]), [kind, id]);

test.describe("V2 the weight of a choice (V2-Core-153)", () => {
  test("a road's time, the search's chance and what makes it possible, what the confrontation lacks", async ({ page }) => {
    const errors = await gotoApp(page);
    await expect(page.locator("#moves button", { hasText: "시장으로 간다" })).toHaveAttribute("data-note", "15분");
    const confront = page.locator("#actions button", { hasText: "도적 두목 앞에 나선다" });
    await expect(confront).toBeDisabled();
    await expect(confront).toHaveAttribute("data-note", `필요: ${await name(page, "item", "item_relic")} · ${await name(page, "text", "lbl_unlock_unl_keen_eye")}`);
    await dispatch(page, [
      { type: "perform", actionId: "act_talk_elder" }, { type: "choose", optionId: "opt_ask_ruins" },
      { type: "move", to: "loc_market" }, { type: "perform", actionId: "act_buy_lantern" },
      { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" }
    ]);
    const search = page.locator("#actions button", { hasText: "폐허 안을 살핀다" });
    await expect(search).toHaveAttribute("data-note", new RegExp(`^✓ ${await name(page, "item", "item_lantern")} · 1시간 · 조사 \\d+% · `));
    await expect(search).toHaveAttribute("title", /해낼 가능성 \d+%/);
    // the words of the choice stay its own
    await expect(search).toHaveText("폐허 안을 살핀다");
    expect(errors).toEqual([]);
  });

  test("a dialogue option I lack the means for is shown and skipped by the keys; one behind a relation is hidden", async ({ page }) => {
    const errors = await gotoApp(page);
    await dispatch(page, [{ type: "move", to: "loc_market" }, { type: "perform", actionId: "act_talk_herbalist" }]);
    const brew = page.locator("#choiceOptions button", { hasText: "정화제를 달여 달라고 한다" });
    await expect(brew).toBeDisabled();
    await expect(brew).toHaveAttribute("data-note", `필요: ${await name(page, "item", "item_purifying_herb")} 2`);
    await expect(page.locator("#choiceOptions button", { hasText: "약초 고르는 법을 배운다" })).toHaveCount(0);
    // keys: 1 is the first option I can take
    await page.keyboard.press("1");
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#news li").first()).toContainText("새로 안 것");
    expect(errors).toEqual([]);
  });
});
