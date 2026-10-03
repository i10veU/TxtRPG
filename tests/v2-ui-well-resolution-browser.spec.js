// V2-Core-66 browser scenario (#160, Fantasy World Vertical Slice 2, step 3 -- resolution): the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The way to the spring with a remedy is dispatched (steps 1 and 2 have their own
// specs); the resolution is real buttons: purifying the spring (the case resolved, no more miasma),
// saved -> reloaded -> loaded, the village seeing its well clear, the well running clear, the
// herbalist telling the sickness has passed, and thanking the purifier once.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "herb-30"; // tests/v2/data-world-well-resolution.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const TO_REMEDY = [
  P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
  P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), M("loc_forest_spring")
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
const checkLines = async (page) => ((await page.locator("#log").innerText()).match(/판정:/g) ?? []).length;

test.describe("V2 fouled well resolution (Slice 2: the purified spring)", () => {
  test("purify, save/load, the clear well, the herbalist's news and her thanks once", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_REMEDY);
    await expect(page.locator("#status")).toContainText("샘 정화제 x1");

    // purify: the case is resolved; the 30 minutes at the spring roll no miasma
    const before = await checkLines(page);
    await act(page, "샘을 정화한다");
    await expect(page.locator("#log")).toContainText("독한 안개가 천천히 걷히고 물빛이 맑아진다.");
    expect(await checkLines(page)).toBe(before);
    expect((await getState(page)).cases.case_fouled_well.stage).toBe("resolved");
    await expect(page.locator("#actions button", { hasText: "샘을 정화한다" })).toHaveCount(0);

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_purified");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_purified" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the village sees its well clear; the well runs clear
    await move(page, "변경 마을");
    await expect(page.locator("#log")).toContainText("길어 올린 물이 다시 맑다며");
    await act(page, "우물 살피기");
    await expect(page.locator("#log")).toContainText("이제 썩은 냄새는 없다.");

    // the herbalist: the sickness has passed; she thanks the purifier, once
    await move(page, "시장");
    await act(page, "약초꾼과 대화");
    await option(page, "마을의 배앓이에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("배앓이가 잦아들었다며 웃는다.");
    await act(page, "약초꾼과 대화");
    await option(page, "샘을 정화했다고 전한다").click();
    await expect(page.locator("#log")).toContainText("손을 꼭 잡고 고맙다고 말한다.");
    expect((await getState(page)).relations["npc_herbalist:player_1"]).toMatchObject({ score: 15, tags: ["consulted", "purifier", "taught", "thanked"] });
    await act(page, "약초꾼과 대화");
    await expect(option(page, "샘을 정화했다고 전한다")).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
