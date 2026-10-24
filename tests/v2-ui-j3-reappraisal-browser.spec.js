// Browser replay of the full J3 causal loop. Both guesses use real notebook
// buttons, NPC choices, field search, elder report and IndexedDB restore.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const REPORT = "샘의 짐승에 박힌 도적단의 화살을 전한다";

for (const scenario of [
  {
    guess: "폐허의 무리가 샘을 더럽혔을 것이다.",
    helpButton: "원로에게 준비를 상의한다",
    helpOption: "샘길을 지키던 마을의 등불을 받는다",
    outcomeTag: "spring_watch_vindicated",
    proofText: "그때 경계를 청한 말을",
    memoryText: "경계하자던 말과 직접 가져온 화살",
    delta: 7, item: "item_lantern"
  },
  {
    guess: "폐허와 샘은 별개의 사건일 것이다.",
    helpButton: "약초꾼에게 준비를 상의한다",
    helpOption: "샘 조사에 쓸 정화초를 받는다",
    outcomeTag: "spring_inquiry_revised",
    proofText: "샘길 경계를 늦출 수 없겠군",
    memoryText: "말을 새 증거에 맞춰",
    delta: 4, item: "item_purifying_herb",
    market: true
  }
]) {
  test("J3 field proof reappraises earlier judgment: " + scenario.outcomeTag, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate(() => {
      const app = window.__v2App;
      app.newGame("herb-30");
      app.dispatch({ type: "perform", actionId: "act_talk_elder" });
      app.dispatch({ type: "choose", optionId: "opt_ask_ruins" });
      app.dispatch({ type: "perform", actionId: "act_inspect_well" });
      app.dispatch({ type: "move", to: "loc_market" });
      app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
      app.dispatch({ type: "choose", optionId: "opt_herbalist_ask_sickness" });
      app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
      app.dispatch({ type: "choose", optionId: "opt_herbalist_teach" });
      app.dispatch({ type: "move", to: "loc_village" });
    });
    const ledger = page.locator("#linkedCaseLedger");
    await expect(ledger).toBeVisible();
    await ledger.getByRole("button", { name: scenario.guess }).click();
    await page.locator("#linkedCaseNext").getByRole("button", { name: "이 판단을 원로에게 전한다" }).click();
    if (scenario.market) {
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_market" }));
    }
    const help = page.locator("#linkedCaseNext").getByRole("button", { name: scenario.helpButton });
    await expect(help).toBeVisible();
    await help.click();
    await page.locator("#choiceOptions").getByRole("button", { name: scenario.helpOption }).click();
    expect(await page.evaluate((item) => {
      const s = window.__v2App.getState();
      return s.actors[s.player.actorId].inventory[item] ?? 0;
    }, scenario.item)).toBe(1);
    if (scenario.market) {
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_village" }));
    }
    await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_forest_spring" }));
    await page.locator("#actions button", { hasText: "샘 주변을 뒤져 본다" }).click();
    await expect(page.locator("#log")).toContainText("도적단의 화살이다.");
    await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_village" }));
    const shortcut = page.locator("#linkedCaseNext").getByRole("button", {
      name: "확인한 단서를 원로에게 이야기한다"
    });
    await expect(shortcut).toBeVisible();
    const before = await page.evaluate(() => {
      const s = window.__v2App.getState();
      return s.relations["npc_elder:" + s.player.actorId].score;
    });
    await shortcut.click();
    await page.locator("#choiceOptions").getByRole("button", { name: REPORT }).click();
    await expect(page.locator("#log")).toContainText(scenario.proofText);
    const reported = await page.evaluate(() => {
      const s = window.__v2App.getState();
      return {
        score: s.relations["npc_elder:" + s.player.actorId].score,
        tags: s.relations["npc_elder:" + s.player.actorId].tags,
        flag: s.flags.spring_bandits_told
      };
    });
    expect(reported.score).toBe(before + scenario.delta);
    expect(reported.tags).toContain(scenario.outcomeTag);
    expect(reported.flag).toBe(true);
    await expect(shortcut).toHaveCount(0);

    const slot = "j3-reappraisal-" + scenario.outcomeTag;
    await page.locator("#saveSlotInput").fill(slot);
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText(slot);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: slot })
      .getByRole("button", { name: "불러오기" }).click();
    await expect.poll(() => page.evaluate(() => window.__v2App.getState()?.flags?.spring_bandits_told)).toBe(true);
    const restored = await page.evaluate(() => {
      const s = window.__v2App.getState();
      return s.relations["npc_elder:" + s.player.actorId];
    });
    expect(restored.score).toBe(reported.score);
    expect(restored.tags).toContain(scenario.outcomeTag);
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await expect(page.locator("#choiceOptions").getByRole("button", { name: REPORT })).toHaveCount(0);
    await page.locator("#choiceOptions").getByRole("button", { name: "폐허에 대해 묻는다" }).click();
    await expect(page.locator("#log")).toContainText(scenario.memoryText);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
