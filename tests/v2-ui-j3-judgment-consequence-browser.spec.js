// Real J3 notebook click -> engine decision -> elder follow-up -> Save restoration.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";

for (const scenario of [
  { guess: "폐허의 무리가 샘을 더럽혔을 것이다.", flag: "spring_watch_requested", tag: "spring_watch_requested",
    verdict: "원로에게 샘 경계를 요청했다", followup: "샘으로 향하는 길을 지켜보고" },
  { guess: "폐허와 샘은 별개의 사건일 것이다.", flag: "spring_inquiry_requested", tag: "spring_inquiry_requested",
    verdict: "원로에게 먼저 조사하자고 제안했다", followup: "같은 사건으로 단정하지" }
]) {
  test("J3 judgment creates a durable consequence: " + scenario.flag, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate(() => window.__v2App.newGame("j3-judgment-browser"));
    const ledger = page.locator("#linkedCaseLedger");
    await expect(ledger).toBeHidden();
    await page.evaluate(() => {
      const app = window.__v2App;
      app.dispatch({ type: "perform", actionId: "act_talk_elder" });
      app.dispatch({ type: "choose", optionId: "opt_ask_ruins" });
      app.dispatch({ type: "move", to: "loc_market" });
      app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
      app.dispatch({ type: "choose", optionId: "opt_herbalist_ask_sickness" });
      app.dispatch({ type: "move", to: "loc_village" });
    });
    await expect(ledger).toBeVisible();
    await ledger.getByRole("button", { name: scenario.guess }).click();
    const commit = page.locator("#linkedCaseNext").getByRole("button", { name: "이 판단을 원로에게 전한다" });
    await expect(commit).toBeVisible();
    await commit.click();
    await expect(page.locator("#linkedCaseVerdict")).toContainText(scenario.verdict);
    await expect(commit).toHaveCount(0);
    await expect(page.locator("#linkedCaseChoices button")).toHaveCount(0);
    const recorded = await page.evaluate(() => {
      const state = window.__v2App.getState();
      return { flags: state.flags, tags: state.relations["npc_elder:" + state.player.actorId]?.tags ?? [] };
    });
    expect(recorded.flags[scenario.flag]).toBe(true);
    expect(recorded.tags).toContain(scenario.tag);

    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻는다" }).click();
    await expect(page.locator("#log")).toContainText(scenario.followup);

    await page.locator("#saveSlotInput").fill("j3-judgment-" + scenario.flag);
    await page.locator("#saveBtn").click();
    // Saving is asynchronous; wait for the successful write before reloading.
    await expect(page.locator("#log")).toContainText("j3-judgment-" + scenario.flag);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "j3-judgment-" + scenario.flag })
      .getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#linkedCaseVerdict")).toContainText(scenario.verdict);
    await expect(page.locator("#linkedCaseChoices button")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
