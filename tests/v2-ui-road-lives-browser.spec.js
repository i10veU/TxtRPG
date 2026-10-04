// V2-Core-96 browser scenario (#237, World Simulation 1, step 1 -- the caravans keep coming): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to
// the castle town is dispatched, then saved as a strong guard through the real storage adapter and loaded with the
// app's button; the rest is real buttons (and dispatched waits): three escorts, saved -> reloaded -> loaded, and a
// fourth caravan that wants -- and gets -- its guard. Before V2-Core-96 the road went quiet after the third.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-road-lives.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
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
async function escort(page) {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "상단 호위를 맡는다").click();
  await expect(page.locator("#location")).toContainText("강 건너 길목");
  await move(page, "영주의 성읍");
}

const stamina = (page) => page.evaluate(() => window.__v2App.getState().actors.player_1.growth.growth_wanderer.resources.stamina.current);

test.describe("V2 the caravans keep coming (World Simulation 1)", () => {
  test("three escorts, save/load, a fourth caravan wanting its guard", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      g.stats.str = 30;
      g.resources.stamina.current = 6;
      await idb.save("slot_long_road", state, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_long_road" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();

    for (let i = 0; i < 3; i += 1) {
      await escort(page);
      await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    }
    const afterThree = await getState(page);
    expect(afterThree.signals.guards_hired).toBe(3);
    expect(afterThree.signals.caravan_visits).toBeGreaterThan(3); // the road kept living past the third
    expect(afterThree.signals.guards_owed).toBeGreaterThan(0);
    expect(await stamina(page)).toBe(0); // three escorts spent the stamina

    // a rest in the village refills it: there and back by the roads
    for (const label of ["강 건너 길목", "강나루", "옛 갈림길", "변경 마을"]) await move(page, label);
    await act(page, "마을에서 쉬기");
    for (const label of ["옛 갈림길", "강나루"]) await move(page, label);
    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다 (뱃삯 은화 3)").click();
    await move(page, "영주의 성읍");

    await saveReloadLoad(page, "slot_fourth", 2);

    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("강나루로 내려가는 상단이 호위를 구한다고");
    await escort(page);
    const end = await getState(page);
    expect(end.signals.guards_hired).toBe(4);
    expect(end.signals.caravan_visits).toBeGreaterThanOrEqual(4);
    expect(end.signals.guards_hired).toBeLessThanOrEqual(end.signals.caravan_visits);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
