// V2-Core-77 browser scenario (#189, Fantasy World Vertical Slice 5, step 2 -- the castle-town market):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the
// real world data pack. The road to the castle town (crossing by the elder's letter) is dispatched; the rest is real buttons: the merchant's
// word on southern goods and northern iron, saved -> reloaded -> loaded, the iron sword bought for less
// than at the frontier market, and the herb option withheld from one who carries none.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-town-market.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), ...E("opt_elder_letter"),
  // crossing by the elder's letter keeps the 3 silver the fare would cost
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")
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
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 castle-town market (Slice 5: the same goods, valued differently)", () => {
  test("the merchant's word, save/load, northern iron for less, no herb to sell", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await expect(page.locator("#location")).toContainText("영주의 성읍");

    await act(page, "성읍의 상인과 대화");
    await expect(option(page, "정화초를 판다 (은화 4)")).toHaveCount(0); // carries no herb
    await option(page, "강 남쪽 물건에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("철물은 북쪽에서 내려오니 성읍이 강 남쪽보다 싸다고");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_market");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_market" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the iron sword, for less than at the frontier market
    const before = (await getState(page)).actors.player_1.money;
    await act(page, "성읍의 상인과 대화");
    await option(page, "철검을 산다 (은화 2)").click();
    await expect(page.locator("#log")).toContainText("새로 벼린 철검을 받는다.");
    await expect(page.locator("#status")).toContainText("철검 x1");
    const end = await getState(page);
    expect(end.actors.player_1.money).toBe(before - 2);
    expect(end.facts).toEqual(saved.facts); // the merchant's word is no truth

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
