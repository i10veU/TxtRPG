// V2-Core-69 browser scenario (#170, Fantasy World Vertical Slice 3, step 2 -- the spring's tale): the
// real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the
// real world data pack. The purification is dispatched (Slice 2 has its own specs); the tale is real
// buttons: the herbalist's news, two days on her legend of the spring's spirit, saved -> reloaded ->
// loaded, the purified spring seen first-hand, the legend corrected for everyone, and the corrected
// account told from then on.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "herb-30"; // tests/v2/data-world-spring-tale.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const TO_PURIFIED = [
  P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
  P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), M("loc_forest_spring"),
  P("act_purify_spring"), M("loc_village"), M("loc_market")
];
const ASK = "마을의 배앓이에 대해 묻는다";
const CORRECT = "샘에서 본 것을 바로잡아 전한다";

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
const herbalist = async (page, label) => {
  await act(page, "약초꾼과 대화");
  await option(page, label).click();
};

test.describe("V2 spring tale (Slice 3: the purification becomes history)", () => {
  test("the news, the legend two days on, the truth seen at the spring and told for everyone -- through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_PURIFIED);
    expect((await getState(page)).facts.fact_well_fate.value).toBe("purified");

    // the news, while it is fresh
    await herbalist(page, ASK);
    await expect(page.locator("#log")).toContainText("배앓이가 잦아들었다며 웃는다.");

    // two days on: the market's legend
    await page.evaluate(() => [1, 2].forEach(() => window.__v2App.dispatch({ type: "wait", minutes: 1440 })));
    await herbalist(page, ASK);
    await expect(page.locator("#log")).toContainText("노한 샘의 정령이 누그러졌다는 것이다.");
    expect((await getState(page)).knowledge.player_1.rum_well_legend.claim).toBe("spirit_appeased");
    await act(page, "약초꾼과 대화");
    await expect(option(page, CORRECT)).toHaveCount(0);
    await option(page, "약초 이야기만 나눈다").click();

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_legend");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_legend" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the purified spring, first-hand: the legend corrected
    await move(page, "변경 마을");
    await move(page, "숲속 샘");
    await act(page, "샘 조사");
    await expect(page.locator("#log")).toContainText("누군가 이곳을 손수 정화했음을 말해 준다.");
    expect((await getState(page)).knowledge.player_1.rum_well_legend.claim).toBe("purified");

    // told for everyone, once
    await move(page, "변경 마을");
    await move(page, "시장");
    await herbalist(page, CORRECT);
    await expect(page.locator("#log")).toContainText("정령이 아니라 사람이 한 일이었다고");
    expect((await getState(page)).flags.well_tale_corrected).toBe(true);
    await herbalist(page, ASK);
    await expect(page.locator("#log")).toContainText("직접 본 사람이 있다고 한다.");
    await act(page, "약초꾼과 대화");
    await expect(option(page, CORRECT)).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
