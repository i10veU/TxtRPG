// V2-Core-93 browser scenario (#226, RPG Depth 1, step 2 -- a hard road leaves a mark): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to
// the castle town is dispatched, then saved as a weak guard carrying a salve through the real storage adapter and
// loaded with the app's button; the rest is real buttons: a failed escort that wounds, the way home and a rest that
// does not close the wound, saved -> reloaded -> loaded, and the salve that does.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-road-wound.test.js
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

test.describe("V2 a hard road leaves a mark (RPG Depth 1)", () => {
  test("a failed escort wounds, rest does not close it, save/load, the salve does", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      g.stats.str = 1;
      g.resources.stamina.current = 6;
      state.actors.player_1.inventory.item_herbal_salve = 1;
      await idb.save("slot_weak_guard", state, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_weak_guard" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();

    await escort(page);
    await expect(page.locator("#log")).toContainText("쉬는 것만으로는 낫지 않을 것 같다.");
    await move(page, "강 건너 길목");
    await move(page, "강나루");
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "마을에서 쉬기");
    await act(page, "마을에서 쉬기");
    const restedState = await getState(page);
    expect(restedState.actors.player_1.growth.growth_wanderer.traits.road_wound).toBe(true);

    await saveReloadLoad(page, "slot_wounded", 2);

    await act(page, "길에서 얻은 상처에 연고를 바른다");
    await expect(page.locator("#log")).toContainText("며칠 동안 당기던 것이 풀린다.");
    await expect(page.locator("#actions button", { hasText: "길에서 얻은 상처에 연고를 바른다" })).toHaveCount(0);
    const end = await getState(page);
    expect(end.actors.player_1.growth.growth_wanderer.traits?.road_wound).toBeUndefined();
    expect(end.actors.player_1.inventory.item_herbal_salve ?? 0).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
