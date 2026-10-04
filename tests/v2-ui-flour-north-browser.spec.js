// V2-Core-84 browser scenario (#207, Fantasy World Vertical Slice 7, step 1 -- flour north): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The dispersal, the miller's flour to the elder (the settlements trade) and the elder's letter are
// dispatched; the rest is real buttons: a sack bought at the mill, saved -> reloaded -> loaded, the road
// north by the letter, and the sack sold to the castle town's merchant for more.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-flour-north.test.js
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

test.describe("V2 flour north (Slice 7: the frontier's flour sells in the town)", () => {
  test("a sack from the mill, save/load, the road north, sold in the town for more", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TRADE);
    const before = await getState(page);

    await act(page, "방앗간 주인과 대화");
    await option(page, "밀가루 자루를 산다 (은화 2)").click();
    await expect(page.locator("#log")).toContainText("강 건너에선 더 쳐줄지도 모른다고 한다.");
    expect((await getState(page)).actors.player_1.inventory.item_flour_sack).toBe(1);

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_flour");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_flour" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 상인과 대화");
    await option(page, "밀가루 자루를 판다 (은화 4)").click();
    await expect(page.locator("#log")).toContainText("강 남쪽 밀은 곱게 빻였다며 은화 네 닢을 내준다.");
    const end = await getState(page);
    expect(end.actors.player_1.inventory.item_flour_sack ?? 0).toBe(0);
    expect(end.actors.player_1.money).toBe(before.actors.player_1.money + 2);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
