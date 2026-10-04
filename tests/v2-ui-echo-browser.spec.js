// V2-Core-82 browser scenario (#198, Fantasy World Vertical Slice 6, step 3 -- the echo): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The dispersal, the legend heard and the truth seen at the ruins are dispatched, and the days the
// caravans take; the rest is real buttons: the road to the ford, the ferryman relaying the town's legend
// back south (the character keeps what they saw), saved -> reloaded -> loaded, the village corrected, and
// the elder saying the north still tells the legend.
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

test.describe("V2 the echo (Slice 6: the town's talk comes back south)", () => {
  test("the ferryman relays the town's legend, save/load, the village corrects it, the elder hears the north lag", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_SEEN);

    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]); // a caravan's round trip
    expect((await getState(page)).signals.caravan_visits).toBeGreaterThanOrEqual(2);
    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("그쪽에선 폐허의 도적 떼가 마을 사람들 손에 모두 쓰러졌다고들 한단다.");
    expect((await getState(page)).knowledge.player_1.rum_bandits_legend.claim).toBe("dispersed"); // what was seen stays

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_echo");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_echo" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the village corrects it; up north they still tell the legend
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "원로와 대화");
    await option(page, "폐허에서 본 것을 바로잡아 전한다").click();
    await act(page, "원로와 대화");
    await option(page, "도적단의 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("고친 이야기가 그곳까지 가려면 아직 멀었다고 한다.");
    const end = await getState(page);
    expect(end.flags.bandits_tale_corrected).toBe(true);
    expect(end.flags.bandits_truth_north).toBeUndefined();
    expect(end.facts.fact_bandits_fate.value).toBe("dispersed");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
