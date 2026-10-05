// V2-Core-109 browser scenario (#265, World Simulation 2, step 2 -- what a long absence costs): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The road to the castle town is dispatched, then a guard who is up to date -- six convoys guarded, staged strong
// and rested for each (data-world-journey-cost.test.js does the same) -- is saved through the real storage adapter and
// loaded with the app's button. The rest is real buttons: the far bank, the waystation board, the five days to the royal
// city, its market, the five days back, the town (four caravans passed on the honest clock, V2-Core-116: three are
// still owed, one is gone); the clerk, who says that a caravan did not wait, and a job; saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-journey-cost.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const HOUR = { type: "wait", minutes: 60 };
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



test.describe("V2 what a long absence costs (World Simulation 2)", () => {
  test("six convoys guarded, the royal journey, three caravans owed and one gone, the clerk says so, a job -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // an up-to-date guard (staged strong and rested for each convoy), saved and loaded with the button
    await page.evaluate(async ({ HOUR, ESCORT }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      for (let i = 0; i < 6; i += 1) {
        for (let h = 0; h < 96 && !wanted(s); h += 1) s = run(s, [HOUR]);
        const g = s.actors.player_1.growth.growth_wanderer;
        g.stats.str = 30;
        g.resources.stamina.current = 6;
        s.actors.player_1.hp.current = s.actors.player_1.hp.max;
        s = run(run(s, ESCORT), [{ type: "move", to: "loc_castle_town" }]);
      }
      await idb.save("slot_uptodate", s, { savedAt: 1 });
    }, { HOUR, ESCORT });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_uptodate" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    const start = await getState(page);
    expect(start.signals.guards_hired).toBe(6);
    expect(start.signals.guards_owed ?? 0).toBe(0);
    expect(start.signals.caravans_unguarded ?? 0).toBe(0);

    // the royal journey, with real buttons
    await move(page, "강 건너 길목");
    await act(page, "길목의 게시판을 읽는다");
    await move(page, "왕도");
    await expect(page.locator("#location")).toContainText("왕도");
    await act(page, "왕도의 큰 시장을 둘러본다");
    await move(page, "강 건너 길목");
    await move(page, "영주의 성읍");
    const back = await getState(page);
    expect(back.signals.caravan_visits - start.signals.caravan_visits).toBe(4);
    expect(back.signals.guards_owed).toBe(3);
    expect(back.signals.caravans_unguarded).toBe(1);

    // the clerk says so; three jobs wait (the cap's shares), one caravan is gone
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 오래 못 구한 상단은 기다려 주지 않는다고");
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const end = await getState(page);
    expect(end.signals.guards_hired).toBe(7);
    expect(end.signals.guards_owed).toBe(2);

    await saveReloadLoad(page, "slot_journey", 2);

    // the same end as a pure replay from the loaded start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town"), ...ASK, ...ESCORT] });
    expect(end).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
