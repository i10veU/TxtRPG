// V2-Core-138 browser scenario (roadmap M4, World Bible WB-0030/WB-0031): the main thread's second chapter and the story
// panel, through the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real
// pack. data-world-band-across.test.js walks the same world. Act one is played through the app's dispatch (the same
// actions as the buttons); the chapter itself through the buttons.
//   1. a new game has no story: the panel is hidden
//   2. after the third caravan the ferryman, asked of the band across the river, tells of armed men and their scarred
//      leader -- the panel shows "2장 강 건너의 그림자" with those words, under chapter 1 if the character knows its end
//   3. the elder, told who leads them, warns the frontier; the panel adds it; save -> reload -> load keeps it all
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
];
const CH2 = "2장 강 건너의 그림자";
const RECRUITS = "강 건너에서 누군가 품삯을 후하게 주고 사람을 모은다";
const SCARRED = "강 건너 무리를 이끄는 자는 왼쪽 옆구리를 감싸는 사내다";
const WARNED = "원로가 변경에 대비를 일렀다. 이제 그들이 언제 강을 건너오는지 지켜볼 때다";

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
const option = (page, label) => page.locator("#choiceOptions button:not([disabled])", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const story = (page) => page.locator("#story li");
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 the main thread, chapter 2 (M4): across the river", () => {
  test("no story in a new game; the band, its leader and the frontier warned -- in the story panel, kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#storySection")).toBeHidden();

    await dispatch(page, TO_DISPERSAL);
    // a day at a time until the third caravan (the unrest, and the band across the river)
    await page.evaluate(() => {
      for (let i = 0; i < 20 && (window.__v2App.getState().signals.caravan_visits ?? 0) < 3; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    expect((await getState(page)).signals.band_gathering).toBe(1);

    await act(page, "뱃사공에게 말을 건다");
    await option(page, "강 건너 무리에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("무장한 사내들");
    // V2-Core-151: the story is in the notebook, which a player opens
    await page.locator("#notebookBtn").click();
    await expect(page.locator("#storySection")).toBeVisible();
    await expect(story(page).filter({ hasText: CH2 })).toHaveCount(1);
    await expect(story(page).filter({ hasText: RECRUITS })).toHaveAttribute("data-chapter", "2");
    await expect(story(page).filter({ hasText: SCARRED })).toHaveAttribute("data-chapter", "2");

    await dispatch(page, [M("loc_crossroads"), M("loc_village")]);
    await act(page, "원로를 찾아간다");
    await option(page, "강 건너 소문을 나눈다").click();
    await expect(page.locator("#log")).toContainText("그 버릇을 아는 이는 많지 않네");
    await expect(story(page).filter({ hasText: WARNED })).toHaveCount(1);
    // chapters in order, each heading before its words
    const lines = await story(page).allTextContents();
    expect(lines.indexOf(CH2)).toBeLessThan(lines.indexOf(RECRUITS));
    const before = await getState(page);
    expect(before.flags.frontier_warned).toBe(true);

    await page.locator("#saveSlotInput").fill("slot_story");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_story");
    await loadSlot(page, "slot_story");
    expect(await getState(page)).toEqual(before);
    expect(await story(page).allTextContents()).toEqual(lines);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
