// V2-Core-74 browser scenario (#180, Fantasy World Vertical Slice 4, step 3 -- the river ford and the
// outside world): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real
// IndexedDB, against the real world data pack. The dispersal (the leader lives) and the elder's
// directions are dispatched; the rest is real buttons: the way north, the ferryman's news (the levy, a
// scarred man he ferried), the elder's letter of passage, saved -> reloaded -> loaded, three days on
// the caravans' next news (the fair) told at the ford, the crossing by letter, the far bank's first
// sight and its board (the royal city, the levy, the bounty).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-river-ford.test.js
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
const ferryman = async (page, label) => {
  await act(page, "뱃사공과 대화");
  await option(page, label).click();
};

test.describe("V2 river ford (Slice 4: the outside world)", () => {
  test("the ferryman's news and the leader's crossing, the letter, the caravans moving on through save/load, the far bank's board", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_DIRECTIONS);

    // the way north; the ferryman
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await expect(page.locator("#location")).toContainText("강나루");
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(page.locator("#log")).toContainText("영주가 징집령을 내려");
    await expect(page.locator("#log")).toContainText("옆구리를 감싼 사내 하나를 건네 주었다고");

    // the elder's letter of passage
    await move(page, "옛 갈림길");
    await move(page, "변경 마을");
    await act(page, "원로와 대화");
    await option(page, "강을 건널 통행 편지를 청한다").click();
    await expect(page.locator("#status")).toContainText("원로의 통행 편지 x1");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_letter");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_letter" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // three days on, the world moved: the next caravan's news
    await page.evaluate(() => [1, 2, 3].forEach(() => window.__v2App.dispatch({ type: "wait", minutes: 1440 })));
    expect((await getState(page)).signals.caravan_visits).toBe(2);
    await move(page, "옛 갈림길");
    await move(page, "강나루");
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(page.locator("#log")).toContainText("왕도에서 큰 장이 열려");

    // the crossing by letter; the far bank
    await act(page, "뱃사공과 대화");
    await expect(option(page, "강을 건넌다 (뱃삯 은화 3)")).toHaveCount(0);
    await option(page, "원로의 통행 편지를 보이고 강을 건넌다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    await expect(page.locator("#log")).toContainText("북쪽으로 곧게 뻗은 넓은 길이 지평선 너머로 사라진다.");
    await act(page, "길목의 게시판을 읽는다");
    await expect(page.locator("#log")).toContainText("북쪽으로 닷새를 걸으면 왕도라고 한다.");
    await expect(page.locator("#log")).toContainText("현상금 은화 쉰 닢.");
    const end = await getState(page);
    expect([end.facts.fact_royal_city.value, end.facts.fact_leader_bounty.value]).toEqual(["five_days_north", "posted"]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
