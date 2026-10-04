// V2-Core-80 browser scenario (#198, Fantasy World Vertical Slice 6, step 1 -- the corrected word goes
// north): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB,
// against the real world data pack. The dispersal and the legend's two days are dispatched; the rest is
// real buttons: the legend heard, the truth seen at the ruins and given to the elder (the village's
// correction), the road north, the castle town's board still telling the legend, saved -> reloaded ->
// loaded, and three days on the corrected account has reached the town.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-word-north.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const TO_LEGEND = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), DAY, DAY
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
const elder = async (page, label) => {
  await act(page, "원로와 대화");
  await option(page, label).click();
};

test.describe("V2 the corrected word goes north (Slice 6: news in motion)", () => {
  test("the village's correction, the town still telling the legend, save/load, three days on the corrected account", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_LEGEND);

    // the legend heard; the truth seen at the ruins; the village's correction
    await elder(page, "도적단의 소식을 묻는다");
    await expect(page.locator("#log")).toContainText("마을 사람들 손에 모두 쓰러졌다는 전설");
    await act(page, "마을에서 쉬기");
    await act(page, "마을에서 쉬기");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    await move(page, "변경 마을");
    await elder(page, "폐허에서 본 것을 바로잡아 전한다");
    expect((await getState(page)).flags.bandits_tale_corrected).toBe(true);

    // the road north
    await elder(page, "마을 바깥의 길에 대해 묻는다");
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다 (뱃삯 은화 3)").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("폐허의 도적 떼가 모두 쓰러졌다고"); // the town has only the legend
    expect((await getState(page)).flags.bandits_truth_north).toBeUndefined();

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_word");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_word" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // three days on: the correction has travelled north
    await page.evaluate(() => [1, 2, 3].forEach(() => window.__v2App.dispatch({ type: "wait", minutes: 1440 })));
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("다 쓰러진 게 아니라 흩어졌다고, 그 마을 원로가 그렇게 전하더라고 한다.");
    const end = await getState(page);
    expect(end.flags.bandits_truth_north).toBe(true);
    expect(end.knowledge.player_1.rum_bandits_fate.sources).toContain("src_castle_town_talk");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
