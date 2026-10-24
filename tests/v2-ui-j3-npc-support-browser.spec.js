// J3 end-to-end: a real notebook judgment unlocks a different NPC supply,
// persists through IndexedDB, and cannot be claimed twice.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";

for (const scenario of [
  {
    guess: "폐허의 무리가 샘을 더럽혔을 것이다.",
    npcAction: "원로를 찾아간다",
    npcOption: "샘길을 지키던 마을의 등불을 받는다",
    item: "item_lantern",
    tag: "spring_watch_lantern_loaned",
    flag: "spring_watch_requested",
    opposite: "샘 조사에 쓸 정화초를 받는다"
  },
  {
    guess: "폐허와 샘은 별개의 사건일 것이다.",
    npcAction: "약초꾼에게 말을 건다",
    npcOption: "샘 조사에 쓸 정화초를 받는다",
    item: "item_purifying_herb",
    tag: "spring_inquiry_herb_given",
    flag: "spring_inquiry_requested",
    opposite: "샘길을 지키던 마을의 등불을 받는다",
    travelMarket: true
  }
]) {
  test("J3 judgment unlocks one real NPC grant: " + scenario.flag, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate(() => window.__v2App.newGame("j3-npc-support-browser"));
    await page.evaluate(() => {
      const app = window.__v2App;
      app.dispatch({ type: "perform", actionId: "act_talk_elder" });
      app.dispatch({ type: "choose", optionId: "opt_ask_ruins" });
      app.dispatch({ type: "move", to: "loc_market" });
      app.dispatch({ type: "perform", actionId: "act_talk_herbalist" });
      app.dispatch({ type: "choose", optionId: "opt_herbalist_ask_sickness" });
      app.dispatch({ type: "move", to: "loc_village" });
    });
    const ledger = page.locator("#linkedCaseLedger");
    await expect(ledger).toBeVisible();
    await ledger.getByRole("button", { name: scenario.guess }).click();
    await page.locator("#linkedCaseNext").getByRole("button", { name: "이 판단을 원로에게 전한다" }).click();
    const support = page.locator("#linkedCaseNext");
    if (scenario.travelMarket) {
      await expect(support).toContainText("장터");
      await expect(support.getByRole("button", { name: "약초꾼에게 준비를 상의한다" })).toHaveCount(0);
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_market" }));
    }
    // Use the notebook's real-action shortcut, not a direct UI item grant.
    const supportButton = support.getByRole("button", {
      name: scenario.travelMarket ? "약초꾼에게 준비를 상의한다" : "원로에게 준비를 상의한다"
    });
    await expect(supportButton).toBeVisible();
    await supportButton.click();
    const choices = page.locator("#choiceOptions");
    await expect(choices.getByRole("button", { name: scenario.npcOption })).toBeVisible();
    await expect(choices.getByRole("button", { name: scenario.opposite })).toHaveCount(0);
    await choices.getByRole("button", { name: scenario.npcOption }).click();
    const first = await page.evaluate(({ item, tag, flag }) => {
      const state = window.__v2App.getState();
      const player = state.player.actorId;
      const npc = item === "item_lantern" ? "npc_elder" : "npc_herbalist";
      return {
        itemCount: state.actors[player].inventory[item] ?? 0,
        tags: state.relations[npc + ":" + player]?.tags ?? [],
        flag: state.flags[flag]
      };
    }, scenario);
    expect(first.itemCount).toBe(1);
    expect(first.tags).toContain(scenario.tag);
    expect(first.flag).toBe(true);
    await expect(support).toContainText("지원");
    await expect(supportButton).toHaveCount(0);

    await page.locator("#actions button", { hasText: scenario.npcAction }).click();
    await expect(page.locator("#choiceOptions").getByRole("button", { name: scenario.npcOption })).toHaveCount(0);
    // Close the dialogue with an ordinary legal choice before saving.
    const safeChoice = scenario.travelMarket ? "약초 이야기만 나눈다" : "안부만 묻는다";
    await page.locator("#choiceOptions").getByRole("button", { name: safeChoice }).click();

    const slot = "j3-npc-" + scenario.flag;
    await page.locator("#saveSlotInput").fill(slot);
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText(slot);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
    await expect.poll(() => page.evaluate((item) => {
      const s = window.__v2App.getState();
      return s?.actors?.[s.player.actorId]?.inventory?.[item] ?? 0;
    }, scenario.item)).toBe(1);
    // The supplied item has a measurable consequence in the *real* browser
    // engine after a persisted reload; neither path changes the CON roll.
    if (!scenario.travelMarket) {
      const hpBefore = await page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].hp.current;
      });
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_ruins" }));
      await expect.poll(() => page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].locationId;
      })).toBe("loc_ruins");
      await expect.poll(() => page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].hp.current;
      })).toBe(hpBefore - 2);
      await expect(page.locator("#log")).toContainText("안전한 발판");
    } else {
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_village" }));
      await expect.poll(() => page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].locationId;
      })).toBe("loc_village");
      const hpBefore = await page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].hp.current;
      });
      await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_forest_spring" }));
      await expect.poll(() => page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].locationId;
      })).toBe("loc_forest_spring");
      const hpAfter = await page.evaluate(() => {
        const s = window.__v2App.getState();
        return s.actors[s.player.actorId].hp.current;
      });
      // The spring's CON check may succeed; on failure preparation limits
      // the loss to one HP, never the old two-HP outcome.
      expect([hpBefore, hpBefore - 1]).toContain(hpAfter);
      if (hpAfter === hpBefore - 1) {
        await expect(page.locator("#log")).toContainText("정화초를 코에");
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
