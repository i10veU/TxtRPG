// V2-Core-86 browser scenario (#207, Fantasy World Vertical Slice 7, step 3 -- the fair's news): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack.
// The dispersal, the trade opened and the elder's letter are dispatched (then saved with 20 silver and loaded),
// and the days waited; the rest is real buttons: two sacks at the mill, the ferryman's news of the royal fair,
// saved -> reloaded -> loaded, the crossing, the merchant's reason, and the sacks sold at the fair's price.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-flour-fair.test.js
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

async function saveReloadLoad(page, slot, count) {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
  const saved = await getState(page);
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
  expect(await getState(page)).toEqual(saved);
}

test.describe("V2 the fair's news (Slice 7: what you hear sets what you earn)", () => {
  test("the fair heard at the ford, save/load, sold in the town at the fair's price", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TRADE);
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

    for (let i = 0; i < 2; i += 1) {
      await act(page, "방앗간 주인과 대화");
      await option(page, "밀가루 자루를 산다 (은화 2)").click();
    }
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("왕도에서 큰 장이 열려");

    await saveReloadLoad(page, "slot_fair", 2);

    await act(page, "뱃사공과 대화");
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 상인과 대화");
    await expect(option(page, "밀가루 자루를 판다 (은화 4)")).toHaveCount(0);
    await option(page, "강 남쪽 물건에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("왕도의 큰 장으로 상단들이 곡식을 실어 올라가는 통에");
    const before = await getState(page);
    for (let i = 0; i < 2; i += 1) {
      await act(page, "성읍의 상인과 대화");
      await option(page, "밀가루 자루를 판다 (은화 6)").click();
    }
    await expect(page.locator("#log")).toContainText("큰 장이 끝나기 전에 더 가져오라고 한다.");
    const end = await getState(page);
    expect(end.actors.player_1.money).toBe(before.actors.player_1.money + 12);
    expect(end.actors.player_1.inventory.item_flour_sack ?? 0).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
