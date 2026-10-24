// J3 #443: actual Chromium controls for a second, evidence-gated choice.
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
const OPTIONS = [
  { label: "확인한 덫 주변의 샘길 표식을 보강한다 (2시간, 기력 2)", value: 1 },
  { label: "확인한 덫 표식을 마을 장부에 공고한다 (30분, 은화 1)", value: 2 }
];
for (const option of OPTIONS) {
  test("J3 firsthand trap proof unlocks a lasting decision: " + option.value, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate((actions) => {
      const app = window.__v2App;
      app.newGame("herb-30");
      for (const action of actions) app.dispatch(action);
    }, PATH);
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await expect(page.locator("#choiceOptions").getByRole("button", { name: option.label })).toHaveCount(0);
    await page.locator("#choiceOptions").getByRole("button", { name: "안부만 묻는다" }).click();
    await page.locator("#moves button", { hasText: "숲속 샘" }).click();
    await page.locator("#linkedCaseNext").getByRole("button", { name: "전해 들은 덫 표식을 현장에서 확인한다" }).click();
    await expect.poll(() => page.evaluate(() => {
      const s = window.__v2App.getState();
      return s.knowledge[s.player.actorId]?.rum_spring_trap_mark?.sources?.includes("obs_loc_forest_spring");
    })).toBe(true);
    await page.locator("#moves button", { hasText: "변경 마을" }).click();
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    for (const candidate of OPTIONS) {
      await expect(page.locator("#choiceOptions").getByRole("button", { name: candidate.label })).toBeVisible();
    }
    await page.locator("#choiceOptions").getByRole("button", { name: option.label }).click();
    await expect.poll(() => page.evaluate(() => window.__v2App.getState().signals.spring_trap_followup))
      .toBe(option.value);
    await page.locator("#saveSlotInput").fill("j3-trap-choice-" + option.value);
    await page.locator("#saveBtn").click();
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "j3-trap-choice-" + option.value })
      .getByRole("button", { name: "불러오기" }).click();
    await expect.poll(() => page.evaluate(() => window.__v2App.getState().signals.spring_trap_followup))
      .toBe(option.value);
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    for (const candidate of OPTIONS) {
      await expect(page.locator("#choiceOptions").getByRole("button", { name: candidate.label })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
