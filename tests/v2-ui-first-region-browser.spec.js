// V2-Core-141 browser scenario (roadmap M2, the first region completed): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB and the real pack. data-world-first-region.test.js walks the same
// world. Act one and the days until the band gathers are dispatched; the region's hands through the buttons:
//   1. the ferryman, told of the band, is paid to watch the river -- the story panel's chapter 3 records it
//   2. across the river the waystation talks of the southerner; one the elder warned posts a call for hands
//   3. save -> reload -> load keeps the state and the story panel
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
const option = (page, label) => page.locator("#choiceOptions button:not([disabled])", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const story = (page) => page.locator("#story li");
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 the first region (M2): the ford's watch and the waystation's call", () => {
  test("the ferryman watches; the board talks of the southerner; a call for hands -- through the buttons, kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    await page.evaluate(() => {
      for (let i = 0; i < 20 && (window.__v2App.getState().signals.band_gathering ?? 0) < 1; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    // staged through the real storage adapter: a purse for the fares, the watch and the call; the elder's warning given
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.actors[s.player.actorId].money = 60;
      s.flags.frontier_warned = true;
      await idb.save("slot_region", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_region");

    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 무리에 대해 묻는다").click();
    await act(page, "뱃사공과 대화");
    await option(page, "무리가 건너오면 마을에 알려 달라고 부탁한다").click();
    await expect(page.locator("#log")).toContainText("하루는 벌 거요");
    await expect(story(page).filter({ hasText: "뱃사공이 무리가 건너오면 마을에 알려 주기로 했다" })).toHaveAttribute("data-chapter", "3");
    expect((await getState(page)).flags.ferryman_watches).toBe(true);

    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다").click();
    await act(page, "길목의 게시판을 읽는다");
    await expect(page.locator("#log")).toContainText("남쪽 변경에서 강을 건너온 나그네");
    const money = (await getState(page)).actors.player_1.money;
    await act(page, "길목 게시판에 변경을 지킬 일손을 구하는 글을 붙인다");
    await expect(page.locator("#log")).toContainText("창을 들 손을 구한다");
    const after = await getState(page);
    expect(after.actors.player_1.money).toBe(money - 15);
    expect(after.signals.frontier_defense).toBe(1);
    await expect(page.locator("#actions button", { hasText: "일손을 구하는 글" })).toHaveCount(0);

    const lines = await story(page).allTextContents();
    await page.locator("#saveSlotInput").fill("slot_region_saved");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_region_saved");
    await loadSlot(page, "slot_region_saved");
    expect(await getState(page)).toEqual(after);
    expect(await story(page).allTextContents()).toEqual(lines);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
