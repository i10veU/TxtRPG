// V2-Core-78 browser scenario (#189, Fantasy World Vertical Slice 5, step 3 -- the caravan guard): the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world
// data pack. The road to the castle town is dispatched; the rest is real buttons: the guild clerk's work,
// saved -> reloaded -> loaded, the escort (whatever its tier, it pays, costs 2 stamina and ends at the far
// bank), and back in the town the clerk has no more work until the next caravan.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-caravan-guard.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];

async function gotoApp(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  return { pageErrors, consoleErrors };
}
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 caravan guard (Slice 5: work for the merchants' guild)", () => {
  test("the clerk's work, save/load, the escort to the far bank, one guard per caravan", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await expect(page.locator("#location")).toContainText("영주의 성읍");

    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("강나루로 내려가는 상단이 호위를 구한다고");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_guard");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_guard" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the escort
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const after = await getState(page);
    expect(after.signals.guards_hired).toBe(1);
    expect(after.actors.player_1.money).toBeGreaterThan(saved.actors.player_1.money);
    expect(after.actors.player_1.growth.growth_wanderer.resources.stamina.current).toBe(saved.actors.player_1.growth.growth_wanderer.resources.stamina.current - 2);

    // back in the town: this caravan has its guard
    await move(page, "영주의 성읍");
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 맡는다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("이미 호위를 구했으니 다음 상단을 기다리라고");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
