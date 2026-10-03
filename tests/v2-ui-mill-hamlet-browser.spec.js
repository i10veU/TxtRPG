// V2-Core-73 browser scenario (#180, Fantasy World Vertical Slice 4, step 2 -- the mill hamlet): the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The dispersal (the leader lives) and the elder's directions are dispatched; the
// hamlet is real buttons: the way east, the miller's news (a scarred man at the ford), the flour for the
// elder, saved -> reloaded -> loaded with the sack in hand, the trade opened, the hamlet's carts at the
// market and its bread bought and eaten.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-mill-hamlet.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_DIRECTIONS = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region")
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
const miller = async (page, label) => {
  await act(page, "방앗간 주인과 대화");
  await option(page, label).click();
};

test.describe("V2 mill hamlet (Slice 4: the region's second settlement)", () => {
  test("the miller's news, the flour carried through save/load, the trade opened and the hamlet's bread", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_DIRECTIONS);

    // the way east
    await move(page, "옛 갈림길");
    await move(page, "물레방아 마을");
    await expect(page.locator("#location")).toContainText("물레방아 마을");

    // the region's news: the leader lives
    await miller(page, "이 근방의 소식을 묻는다");
    await expect(page.locator("#log")).toContainText("옆구리를 감싼 사내가 강나루에서 배를 찾더라는 소문이 있다고");

    // the flour for the elder
    await miller(page, "원로에게 밀가루를 전해 주겠다고 한다");
    await expect(page.locator("#status")).toContainText("밀가루 자루 x1");

    // save -> reload -> load with the sack in hand
    await page.locator("#saveSlotInput").fill("slot_flour");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_flour" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // delivered: trade between the settlements
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "원로와 대화");
    await option(page, "물레방아 마을의 밀가루를 전한다").click();
    await expect(page.locator("#log")).toContainText("곧 장터에 수레가 올 거라고 말한다.");
    expect((await getState(page)).relations["org_mill_hamlet:org_village"].tags).toEqual(["trading"]);

    // the market: the hamlet's carts, its bread
    await move(page, "시장");
    await expect(page.locator("#log")).toContainText("물레방아 마을의 수레가 들어와 있다.");
    await act(page, "물레방아 빵 구입");
    await expect(page.locator("#status")).toContainText("물레방아 빵 x1");
    await act(page, "물레방아 빵을 먹는다");
    await expect(page.locator("#log")).toContainText("몸에 힘이 돈다.");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
