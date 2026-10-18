// V2-Core-139 browser scenario (roadmap M5, chapter 3 "변경을 지키는 일"): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB and the real pack. data-world-keep-frontier.test.js walks the same
// world. Act one and the days until the band gathers are dispatched; the chapter through the buttons:
//   1. the ferryman's word of the band gives the north woods' path -- chapter 3 opens in the story panel
//   2. across the river the woods are a place to go; watching the band there tells how many they are (or the watcher
//      is spotted) -- either way through the buttons
//   3. the elder, warned, takes silver for the village; save -> reload -> load keeps the story panel and the state
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
];
const CH3 = "3장 변경을 지키는 일";
const WAY = "무리는 강 건너 길목에서 북쪽 숲길로 들어갔다";

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
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const story = (page) => page.locator("#story li");
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 the main thread, chapter 3 (M5): keeping the frontier", () => {
  test("the woods' path opens chapter 3; the watch; the village's silver -- through the buttons, kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    await page.evaluate(() => {
      for (let i = 0; i < 20 && (window.__v2App.getState().signals.band_gathering ?? 0) < 1; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    // staged through the real storage adapter: a purse for the fares and the village
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.actors[s.player.actorId].money = 40;
      await idb.save("slot_ch3", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_ch3");
    expect((await getState(page)).signals.band_strength).toBe(1);

    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 무리에 대해 묻는다").click();
    await expect(story(page).filter({ hasText: CH3 })).toHaveCount(1);
    await expect(story(page).filter({ hasText: WAY })).toHaveAttribute("data-chapter", "3");

    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다").click();
    await move(page, "북쪽 숲 너머");
    expect((await getState(page)).actors.player_1.locationId).toBe("loc_band_camp");
    await act(page, "숲에 숨어 무리를 지켜본다");
    await expect(page.locator("#log")).toContainText(/모닥불 두엇|마른 가지가 부러진다/);

    await dispatch(page, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village")]);
    await act(page, "원로를 찾아간다");
    await option(page, "강 건너 소문을 나눈다").click();
    await act(page, "원로를 찾아간다");
    const money = (await getState(page)).actors.player_1.money;
    await option(page, "마을의 대비에 은화 10을 보탠다").click();
    await expect(page.locator("#log")).toContainText("창과 등불");
    const after = await getState(page);
    expect(after.actors.player_1.money).toBe(money - 10);
    expect(after.signals.frontier_defense).toBe(1);

    const lines = await story(page).allTextContents();
    await page.locator("#saveSlotInput").fill("slot_ch3_saved");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_ch3_saved");
    await loadSlot(page, "slot_ch3_saved");
    expect(await getState(page)).toEqual(after);
    expect(await story(page).allTextContents()).toEqual(lines);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
