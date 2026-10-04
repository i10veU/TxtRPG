// V2-Core-90 browser scenario (#217, Fantasy World Vertical Slice 8, step 3 -- the records): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The
// dispersal and the crossing are dispatched, and the days waited; the rest is real buttons: the waystation board,
// five days north, the realm's written word (nothing of the frontier), saved -> reloaded -> loaded, and days later
// the border's unrest written many ways.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-royal-records.test.js
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

test.describe("V2 the records (Slice 8: the centre's written word)", () => {
  test("the written word, no frontier in it, save/load, the unrest written many ways", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_FAR_BANK);
    await act(page, "길목의 게시판을 읽는다");
    await move(page, "왕도");

    await act(page, "왕도에 내걸린 글을 읽는다");
    await expect(page.locator("#log")).toContainText("남쪽 변경에 관한 글은 한 줄도 찾을 수 없다.");
    await expect(page.locator("#log")).not.toContainText("먼 국경의 소란을 적은 글이 여럿 있다.");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_royal_records");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_royal_records" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "왕도에 내걸린 글을 읽는다");
    await expect(page.locator("#log")).toContainText("글마다 적힌 내용이 다르다.");
    const end = await getState(page);
    expect(end.knowledge.player_1.rum_realm_unrest.confidence).toBe(50);
    expect(end.knowledge.player_1.rum_bandits_fate?.sources ?? []).not.toContain("src_royal_records");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
