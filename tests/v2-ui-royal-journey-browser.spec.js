// V2-Core-91 browser scenario (#217, Fantasy World Vertical Slice 8, step 4 -- integrated: the frontier comes to
// the centre): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against
// the real world data pack. The dispersal and the crossing are dispatched, and the days waited; the rest is real
// buttons: the waystation board, five days north, the first arrival, the greatest market with the fair seen at its
// source, the written word with nothing of the frontier, saved -> reloaded -> loaded, the unrest written many ways,
// and home again to the village's own legend. It ends in the state a pure replay (core/engine.js in the page, no
// UI) reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-royal-journey.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_FAR_BANK = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross")
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
// what the buttons (and waits) below do, as actions (for the pure replay)
const BY_HAND = [
  P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), P("act_read_royal_records"),
  DAY, DAY, DAY, P("act_read_royal_records"), M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"),
  P("act_talk_elder"), C("opt_ask_bandit_news")
];
const replayInPage = (page, actions) => page.evaluate(async ({ worldSeed, actions }) => {
  const { createInitialState, step } = await import("/v2/core/engine.js");
  const { worldData } = await import("/v2/data/world.js");
  return actions.reduce((s, a) => step(s, a, worldData).state, createInitialState({ worldSeed, data: worldData }).state);
}, { worldSeed: SEED, actions });

test.describe("V2 the frontier comes to the centre (Slice 8 integrated)", () => {
  test("five days north, the market and the written word, save/load, the unrest, home again -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_FAR_BANK);

    await act(page, "길목의 게시판을 읽는다");
    await move(page, "왕도");
    await expect(page.locator("#log")).toContainText("왕권의 자리이고, 왕국에서 가장 큰 시장이 서는 곳이라고 말한다.");
    await act(page, "왕도의 큰 시장을 둘러본다");
    await expect(page.locator("#log")).toContainText("들은 소식이 이제 본 것이 된다.");
    await act(page, "왕도에 내걸린 글을 읽는다");
    await expect(page.locator("#log")).toContainText("남쪽 변경에 관한 글은 한 줄도 찾을 수 없다.");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_royal_journey");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_royal_journey" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "왕도에 내걸린 글을 읽는다");
    await expect(page.locator("#log")).toContainText("글마다 적힌 내용이 다르다.");
    await move(page, "강 건너 길목");
    await move(page, "강나루");
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "원로와 대화");
    await option(page, "도적단의 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("모두 쓰러졌다는 전설이다.");

    const end = await getState(page);
    expect(end.facts.fact_bandits_fate.value).toBe("dispersed");
    expect(end).toEqual(await replayInPage(page, [...TO_FAR_BANK, ...BY_HAND]));

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
