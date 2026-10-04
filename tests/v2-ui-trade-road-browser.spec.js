// V2-Core-87 browser scenario (#207, Fantasy World Vertical Slice 7, step 4 -- integrated: the road of trade):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The dispersal and the trade opened are dispatched, then saved with 20 silver through the
// real storage adapter and loaded with the app's button; the rest is real buttons (and dispatched waits): the
// mill's day, the road north at the levy's price, the town's want met, back for more, the ferryman's news of
// the fair, saved -> reloaded -> loaded, and the fair's price. It ends in the state a pure replay (core/
// engine.js in the page, no UI) reaches from the same loaded state.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-trade-road.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
const MERCHANT = (optionId) => [P("act_talk_town_merchant"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const SETUP = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")
];
// what the buttons (and waits) below do, as actions (for the pure replay)
const BY_HAND = [
  ...MILLER("opt_miller_buy_flour"), ...MILLER("opt_miller_buy_flour"), M("loc_crossroads"), M("loc_river_ford"),
  P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town"),
  ...MERCHANT("opt_town_merchant_sell_flour"), ...MERCHANT("opt_town_merchant_sell_flour"),
  M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_buy_flour"),
  M("loc_crossroads"), M("loc_river_ford"), DAY, DAY, P("act_talk_ferryman"), C("opt_ferryman_news"),
  P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town"), ...MERCHANT("opt_town_merchant_ask"),
  ...MERCHANT("opt_town_merchant_sell_flour_fair")
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


const replayInPage = (page, start, actions) => page.evaluate(async ({ start, actions }) => {
  const { step } = await import("/v2/core/engine.js");
  const { worldData } = await import("/v2/data/world.js");
  return actions.reduce((s, a) => step(s, a, worldData).state, start);
}, { start, actions });

test.describe("V2 the road of trade (Slice 7 integrated: flour north, the want, the fair)", () => {
  test("the levy's price, the want met, the fair heard and paid, through save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SETUP);
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
    const start = await getState(page);

    for (let i = 0; i < 2; i += 1) {
      await act(page, "방앗간 주인과 대화");
      await option(page, "밀가루 자루를 산다 (은화 2)").click();
    }
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await move(page, "영주의 성읍");
    for (let i = 0; i < 2; i += 1) {
      await act(page, "성읍의 상인과 대화");
      await option(page, "밀가루 자루를 판다 (은화 4)").click();
    }
    // back for more; the fair's news at the ford
    await move(page, "강 건너 길목");
    await move(page, "강나루");
    await move(page, "옛 갈림길");
    await move(page, "물레방아 마을");
    await act(page, "방앗간 주인과 대화");
    await option(page, "밀가루 자루를 산다 (은화 2)").click();
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY]);
    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("왕도에서 큰 장이 열려");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_trade_road");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_trade_road" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await act(page, "뱃사공과 대화");
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 상인과 대화");
    await option(page, "강 남쪽 물건에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("왕도의 큰 장으로 상단들이 곡식을 실어 올라가는 통에");
    await act(page, "성읍의 상인과 대화");
    await option(page, "밀가루 자루를 판다 (은화 6)").click();

    const end = await getState(page);
    expect(end.actors.player_1.money).toBe(20 - 6 + 8 + 6);
    expect(end.actors.player_1.inventory.item_flour_sack ?? 0).toBe(0);
    expect(end).toEqual(await replayInPage(page, start, BY_HAND));

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
