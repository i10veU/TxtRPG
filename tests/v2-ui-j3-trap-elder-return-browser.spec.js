// J3 #445: real 390px browser loop, including reload and both world choices.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const PATH = [
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" },
  { type: "perform", actionId: "act_inspect_well" },
  { type: "move", to: "loc_market" },
  { type: "perform", actionId: "act_talk_herbalist" },
  { type: "choose", optionId: "opt_herbalist_ask_sickness" },
  { type: "perform", actionId: "act_talk_herbalist" },
  { type: "choose", optionId: "opt_herbalist_teach" },
  { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_request_spring_watch" },
  { type: "move", to: "loc_forest_spring" },
  { type: "perform", actionId: "act_search_spring" },
  { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_tell_spring_arrows" },
  { type: "perform", actionId: "act_help_mark_spring_route" },
  { type: "perform", actionId: "act_talk_elder" },
  { type: "choose", optionId: "opt_ask_ruins" }
];
const SHORTCUT = "원로에게 덫 표식 대응 상황을 확인한다";
const OPTIONS = [
  { label: "확인한 덫 주변의 샘길 표식을 보강한다 (2시간, 기력 2)", recap: "샘길을 보강했다", value: 1 },
  { label: "확인한 덫 표식을 마을 장부에 공고한다 (30분, 은화 1)", recap: "마을 장부에 알렸다", value: 2 }
];
for (const option of OPTIONS) {
  test("J3 verified trap leads back to elder and closes after choice " + option.value, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate((actions) => {
      window.__v2App.newGame("herb-30");
      for (const action of actions) window.__v2App.dispatch(action);
    }, PATH);
    const next = page.locator("#linkedCaseNext");
    await expect(next.getByRole("button", { name: SHORTCUT })).toHaveCount(0);
    await page.locator("#moves button", { hasText: "숲속 샘" }).click();
    await expect(next.getByRole("button", { name: SHORTCUT })).toHaveCount(0);
    await next.getByRole("button", { name: "전해 들은 덫 표식을 현장에서 확인한다" }).click();
    await expect(next).toContainText("원로에게 돌아가");
    await expect(next.getByRole("button", { name: SHORTCUT })).toHaveCount(0);
    await page.locator("#moves button", { hasText: "변경 마을" }).click();
    const shortcut = next.getByRole("button", { name: SHORTCUT });
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(shortcut).toHaveCount(0);
    await expect(page.locator("#choiceOptions").getByRole("button", { name: option.label })).toBeVisible();
    await page.locator("#choiceOptions").getByRole("button", { name: option.label }).click();
    await expect.poll(() => page.evaluate(() => window.__v2App.getState().signals.spring_trap_followup))
      .toBe(option.value);
    await expect(next).toContainText(option.recap);
    await expect(shortcut).toHaveCount(0);
    await page.locator("#saveSlotInput").fill("j3-return-" + option.value);
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("j3-return-" + option.value);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "j3-return-" + option.value })
      .getByRole("button", { name: "불러오기" }).click();
    await expect(next).toContainText(option.recap);
    await expect(next.getByRole("button", { name: SHORTCUT })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
