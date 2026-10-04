// V2-Core-88 browser scenario (#217, Fantasy World Vertical Slice 8, step 1 -- the road to the royal city): the
// real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world
// data pack. The dispersal and the crossing are dispatched; the rest is real buttons: no road north until the
// waystation board is read, saved -> reloaded -> loaded, five days on the wide road, the first arrival, and the
// way back.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-royal-road.test.js
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

test.describe("V2 the road to the royal city (Slice 8: five days north)", () => {
  test("the way read on the board, save/load, five days north, the first arrival, the way back", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_FAR_BANK);
    await expect(page.locator("#moves button", { hasText: "왕도" })).toHaveCount(0);

    await act(page, "길목의 게시판을 읽는다");
    await expect(page.locator("#log")).toContainText("북쪽으로 닷새를 걸으면 왕도라고 한다.");
    await expect(page.locator("#moves button", { hasText: "왕도" })).toHaveCount(1);

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_royal_road");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_royal_road" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await move(page, "왕도");
    await expect(page.locator("#location")).toContainText("왕도");
    await expect(page.locator("#log")).toContainText("이곳이 왕권의 자리이고, 왕국에서 가장 큰 시장이 서는 곳이라고 말한다.");
    const there = await getState(page);
    expect(there.time.minute - saved.time.minute).toBe(7200);

    await move(page, "강 건너 길목");
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    expect((await getState(page)).time.minute - there.time.minute).toBe(7200);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
