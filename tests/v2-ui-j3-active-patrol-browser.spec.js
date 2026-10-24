// Real 390px J3 journey: clues -> notebook judgment -> field proof ->
// elder report -> costed village patrol -> save/restore -> safer spring.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const HELP = "마을 사람들과 샘길 표식을 놓는다 (2시간, 기력 2)";

test("J3 player accelerates village patrol with a real cost", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await ledger.getByRole("button", { name: "폐허의 무리가 샘을 더럽혔을 것이다." }).click();
  await page.locator("#linkedCaseNext").getByRole("button", { name: "이 판단을 원로에게 전한다" }).click();
  await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_forest_spring" }));
  await page.locator("#actions button", { hasText: "샘 주변을 뒤져 본다" }).click();
  await expect(page.locator("#log")).toContainText("도적단의 화살이다.");
  await page.evaluate(() => window.__v2App.dispatch({ type: "move", to: "loc_village" }));
  await page.locator("#linkedCaseNext").getByRole("button", {
    name: "확인한 단서를 원로에게 이야기한다"
  }).click();
  await page.locator("#choiceOptions").getByRole("button", {
    name: "샘의 짐승에 박힌 도적단의 화살을 전한다"
  }).click();
  await expect.poll(() => page.evaluate(() => window.__v2App.getState().signals.spring_patrol_progress)).toBe(1);
  await expect(page.locator("#linkedCaseNext").getByRole("button", { name: HELP })).toBeVisible();
  await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
  await page.locator("#choiceOptions").getByRole("button", { name: "폐허에 대해 묻는다" }).click();
  await expect(page.locator("#log")).toContainText("두 시간 안에 마칠 수 있다");

  const before = await page.evaluate(async () => {
    const app = window.__v2App;
    const state = app.getState();
    const { actorResource } = await import("./core/rules.js");
    return {
      minute: state.time.minute,
      stamina: actorResource(state.actors[state.player.actorId], app.getData?.() ?? (await import("./data/world.js")).worldData, "stamina").current
    };
  });
  const button = page.locator("#linkedCaseNext").getByRole("button", { name: HELP });
  await expect(button).toBeVisible();
  await button.click();
  await expect.poll(() => page.evaluate(() => window.__v2App.getState().flags.spring_patrol_deployed)).toBe(true);
  const after = await page.evaluate(async () => {
    const s = window.__v2App.getState();
    const { actorResource } = await import("./core/rules.js");
    const { worldData } = await import("./data/world.js");
    return {
      minute: s.time.minute,
      stamina: actorResource(s.actors[s.player.actorId], worldData, "stamina").current,
      progress: s.signals.spring_patrol_progress,
      helped: s.flags.spring_patrol_helped
    };
  });
  expect(after.minute - before.minute).toBe(120);
  expect(after.stamina - before.stamina).toBe(-2);
  expect(after.progress).toBe(2);
  expect(after.helped).toBe(true);
  await expect(button).toHaveCount(0);
  await expect(page.locator("#log")).toContainText("두 시간이 지나자");

  const slot = "j3-active-patrol";
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText(slot);
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot })
    .getByRole("button", { name: "불러오기" }).click();
  await expect.poll(() => page.evaluate(() => window.__v2App.getState()?.flags?.spring_patrol_helped)).toBe(true);
  await expect(page.locator("#linkedCaseNext").getByRole("button", { name: HELP })).toHaveCount(0);
  await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
  await page.locator("#choiceOptions").getByRole("button", { name: "폐허에 대해 묻는다" }).click();
  await expect(page.locator("#log")).toContainText("두 시간 만에 표시");
  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) {
      window.__v2App.dispatch({ type: "perform", actionId: "act_rest_village" });
    }
  });
  await expect.poll(() => page.evaluate(() => window.__v2App.getState().time.minute)).toBe(after.minute + 25 * 60);
  expect(await page.evaluate(() => window.__v2App.getState().signals.spring_patrol_progress)).toBe(2);
  const hp = await page.evaluate(() => {
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
  expect(hp - hpAfter).toBeGreaterThanOrEqual(0);
  expect(hp - hpAfter).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
