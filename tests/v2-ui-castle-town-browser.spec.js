// V2-Core-76 browser scenario (#189, Fantasy World Vertical Slice 5, step 1 -- the road north and the
// castle town): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real
// IndexedDB, against the real world data pack. The dispersal, the elder's directions and the crossing are
// dispatched; the rest is real buttons: the wide road north, the castle town's first sight, the lord's
// decree on the notice board (and not yet the frontier's tale -- it has not become a legend), saved ->
// reloaded -> loaded, three days on the frontier's legend has travelled north with the caravans.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-castle-town.test.js
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
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 castle town (Slice 5: the first urban sphere)", () => {
  test("the road north, the lord's decree at its source, the frontier's legend arriving with the caravans through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_FAR_BANK);
    await expect(page.locator("#location")).toContainText("강 건너 길목");

    // the wide road north
    await move(page, "영주의 성읍");
    await expect(page.locator("#location")).toContainText("영주의 성읍");
    await expect(page.locator("#log")).toContainText("언덕 위에 돌로 쌓은 성이 보인다.");

    // the decree at its source; the frontier's tale is not yet a legend
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("인장이 찍힌 글은 길고 자세하다.");
    await expect(page.locator("#log")).not.toContainText("폐허의 도적 떼가 모두 쓰러졌다고");
    expect((await getState(page)).knowledge.player_1.rum_realm_levy.sources).toContain("obs_loc_castle_town");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_town");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_town" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // three days on: the dispersal became a legend, and the caravans carried it north
    await page.evaluate(() => [1, 2, 3].forEach(() => window.__v2App.dispatch({ type: "wait", minutes: 1440 })));
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("폐허의 도적 떼가 모두 쓰러졌다고, 상단 사람들에게 들었다고 한다.");
    const end = await getState(page);
    expect(end.knowledge.player_1.rum_bandits_legend.sources).toContain("src_castle_town_talk");
    expect(end.facts.fact_bandits_fate.value).toBe("dispersed"); // the truth is unchanged by the tale

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
