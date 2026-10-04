// V2-Core-85 browser scenario (#207, Fantasy World Vertical Slice 7, step 2 -- the town's demand has an end):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The dispersal, the trade opened and the elder's letter are dispatched (then saved with 20
// silver and loaded), and the days waited; the rest is real buttons: two sacks and the mill's day is done, a third the next day, the road north, the
// town wants two, then has enough, saved -> reloaded -> loaded, and days later it wants flour again.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-flour-demand.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
const TO_TRADE = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")
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

const DAY = { type: "wait", minutes: 1440 };
const buyButton = (page) => option(page, "밀가루 자루를 산다 (은화 2)");
const sellButton = (page) => option(page, "밀가루 자루를 판다 (은화 4)");
const closeChoice = async (page, label) => { await option(page, label).click(); };

test.describe("V2 the town's demand (Slice 7: flour has its limits)", () => {
  test("the mill's day, the town's want met and returning, through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TRADE);
    // a trader with silver to spend: the same world, saved through the real storage adapter with 20 silver
    // (data-world-flour-demand.test.js does the same), then loaded with the app's own button
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      state.actors.player_1.money = 20;
      await idb.save("slot_trader", state, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_trader" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect((await getState(page)).actors.player_1.money).toBe(20);

    // the mill: two sacks today
    await act(page, "방앗간 주인과 대화");
    await buyButton(page).click();
    await act(page, "방앗간 주인과 대화");
    await buyButton(page).click();
    await act(page, "방앗간 주인과 대화");
    await expect(buyButton(page)).toHaveCount(0);
    await closeChoice(page, "이 근방의 소식을 묻는다");
    await expect(page.locator("#log")).toContainText("오늘 내놓을 밀가루는 벌써 다 나갔다고 한다.");
    await page.evaluate((a) => window.__v2App.dispatch(a), DAY);
    await act(page, "방앗간 주인과 대화");
    await buyButton(page).click();
    expect((await getState(page)).actors.player_1.inventory.item_flour_sack).toBe(3);

    // the town: two sacks, then enough
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 상인과 대화");
    await closeChoice(page, "강 남쪽 물건에 대해 묻는다");
    await expect(page.locator("#log")).toContainText("성읍 빵집들이 강 남쪽 밀을 찾는다고.");
    await act(page, "성읍의 상인과 대화");
    await sellButton(page).click();
    await act(page, "성읍의 상인과 대화");
    await sellButton(page).click();
    await act(page, "성읍의 상인과 대화");
    await expect(sellButton(page)).toHaveCount(0);
    await closeChoice(page, "강 남쪽 물건에 대해 묻는다");
    await expect(page.locator("#log")).toContainText("밀가루는 지난번에 들어온 것으로 당분간 넉넉하다고 한다.");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_flour_demand");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_flour_demand" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // days later the town wants flour again
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "성읍의 상인과 대화");
    await sellButton(page).click();
    const end = await getState(page);
    expect(end.actors.player_1.inventory.item_flour_sack ?? 0).toBe(0);
    expect(end.signals.town_flour_wanted).toBe(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
