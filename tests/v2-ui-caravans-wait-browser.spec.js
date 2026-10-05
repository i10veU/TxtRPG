// V2-Core-108 browser scenario (#265, World Simulation 2, step 1 -- the caravans do not wait): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The road to the river ford is dispatched and 24 days pass there (a traveller away -- the royal road is ten);
// the world's count is checked: nine caravans came, three shares wait, three left with other guards. The state is saved
// as a strong, rested guard through the real storage adapter and loaded with the app's button
// (data-world-caravans-wait.test.js stages the same). The rest is real buttons: the crossing, the clerk -- who says that
// caravans that were not guarded did not wait -- and three escorts: the first three caravans' shortfall is paid first,
// the three shares the cap kept are still there; saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-caravans-wait.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const TO_FORD = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
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


test.describe("V2 the caravans do not wait (World Simulation 2)", () => {
  test("24 days away, three shares kept and three gone, the clerk says so, three escorts leave three waiting -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    const days = Array(24).fill(DAY);
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...TO_FORD, ...days]);
    const away = await getState(page);
    expect(away.signals.caravan_visits).toBe(9);
    expect(away.signals.guards_owed).toBe(3);
    expect(away.signals.caravans_unguarded).toBe(3);
    expect(away.signals.guards_hired).toBeUndefined();

    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      g.stats.str = 30;
      g.resources.stamina.current = g.resources.stamina.max ?? 6;
      await idb.save("slot_away", state, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_away" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    const start = await getState(page);

    // the crossing, the clerk's word
    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다").click();
    await move(page, "영주의 성읍");
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 오래 못 구한 상단은 기다려 주지 않는다고");

    // three escorts: the first three caravans' shortfall is paid first, the kept shares wait
    await escort(page);
    await escort(page);
    await escort(page);
    const end = await getState(page);
    expect(end.signals.guards_hired).toBe(3);
    expect(end.signals.guards_owed).toBe(3);
    expect(end.signals.caravans_unguarded).toBe(4);
    expect(end.signals.caravan_visits).toBe(10);

    await saveReloadLoad(page, "slot_wait", 2);

    // the same end as a pure replay from the loaded start
    const BACK = M("loc_castle_town");
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [P("act_talk_ferryman"), C("opt_ferryman_cross"), BACK, ...ASK, ...ESCORT, BACK, ...ESCORT, BACK, ...ESCORT, BACK] });
    expect(end).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
