// V2-Core-83 browser scenario (#198, Fantasy World Vertical Slice 6, step 4 -- integrated: the road of the
// word): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against
// the real world data pack. The dispersal, the legend and the truth seen are dispatched; the rest is real
// buttons: the road north, the town's legend, saved -> reloaded -> loaded, the carrier's telling, the
// corrected account, back to the ford where -- a caravan's round trip later -- the ferryman relays the town's
// corrected account south, and the village that still tells its own legend. It ends in the state a pure
// replay (core/engine.js in the page, no UI) reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-word-road.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
const TO_SEEN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), DAY, DAY, ...E("opt_ask_bandit_news"),
  P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village")
];
// what the buttons below do, as actions (for the pure replay)
const BY_HAND = [
  ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town"),
  P("act_read_castle_notices"), P("act_tell_town_ruins"), P("act_read_castle_notices"), M("loc_far_bank"), M("loc_river_ford"),
  DAY, DAY, DAY, P("act_talk_ferryman"), C("opt_ferryman_news"), M("loc_crossroads"), M("loc_village"), ...E("opt_ask_bandit_news")
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
const dispatchAll = (page, list) => page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), list);
const replayInPage = (page, actions) => page.evaluate(async ({ worldSeed, actions }) => {
  const { createInitialState, step } = await import("/v2/core/engine.js");
  const { worldData } = await import("/v2/data/world.js");
  return actions.reduce((s, a) => step(s, a, worldData).state, createInitialState({ worldSeed, data: worldData }).state);
}, { worldSeed: SEED, actions });

test.describe("V2 the road of the word (Slice 6 integrated: carried north, echoed south)", () => {
  test("the carrier's telling, save/load, the ferryman's echo, the village's own legend -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, TO_SEEN);

    await act(page, "원로와 대화");
    await option(page, "마을 바깥의 길에 대해 묻는다").click();
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await act(page, "뱃사공과 대화");
    await option(page, "강을 건넌다 (뱃삯 은화 3)").click();
    await move(page, "영주의 성읍");
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("폐허의 도적 떼가 모두 쓰러졌다고");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_word_road");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_word_road" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // carried north
    await act(page, "포고판 앞 사람들에게 폐허에서 본 것을 전한다");
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("다 쓰러진 게 아니라 흩어졌다고, 그 마을 원로가 그렇게 전하더라고 한다.");
    // echoed south, a caravan's round trip later
    await move(page, "강 건너 길목");
    await move(page, "강나루");
    await dispatchAll(page, [DAY, DAY, DAY]);
    await act(page, "뱃사공과 대화");
    await option(page, "강 건너 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("성읍에서도 이제 고쳐 말한다고 한다.");
    // the village still tells its own legend
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "원로와 대화");
    await option(page, "도적단의 소식을 묻는다").click();
    await expect(page.locator("#log")).toContainText("모두 쓰러졌다는 전설이다.");

    const end = await getState(page);
    expect(end.flags.bandits_truth_north).toBe(true);
    expect(end.flags.bandits_tale_corrected).toBeUndefined();
    expect(end.facts.fact_bandits_fate.value).toBe("dispersed");
    expect(end).toEqual(await replayInPage(page, [...TO_SEEN, ...BY_HAND]));

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
