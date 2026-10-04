// V2-Core-81 browser scenario (#198, Fantasy World Vertical Slice 6, step 2 -- the carrier): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The dispersal, the legend heard and the truth seen at the ruins are dispatched (the village is never
// told); the rest is real buttons: the road north, the town's board still telling the legend, saved ->
// reloaded -> loaded, the carrier's telling at the board, and the board now telling the corrected account.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-carrier.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const TO_SEEN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), DAY, DAY,
  ...E("opt_ask_bandit_news"), P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"),
  ...E("opt_ask_region")
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

test.describe("V2 the carrier (Slice 6: one who saw it brings it north)", () => {
  test("the road north, the town's legend, save/load, the telling at the board, the corrected account", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_SEEN);
    expect((await getState(page)).flags.bandits_tale_corrected).toBeUndefined(); // the village never told

    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다 (뱃삯 은화 3)").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("폐허의 도적 떼가 모두 쓰러졌다고");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_carrier");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_carrier" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the telling
    await act(page, "포고판 앞 사람들에게 폐허에서 본 것을 전한다");
    await expect(page.locator("#log")).toContainText("직접 본 사람의 말이다.");
    await expect(page.locator("#actions button", { hasText: "포고판 앞 사람들에게 폐허에서 본 것을 전한다" })).toHaveCount(0);
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("다 쓰러진 게 아니라 흩어졌다고");
    const end = await getState(page);
    expect(end.flags.bandits_truth_north).toBe(true);
    expect(end.facts.fact_bandits_fate.value).toBe("dispersed");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
