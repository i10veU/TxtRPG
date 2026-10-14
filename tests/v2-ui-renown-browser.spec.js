// V2-Core-142 browser scenario (roadmap M7, the apex: the realm's name): the real entry point (web/v2/index.html + ui/app.js)
// in real Chromium with real IndexedDB and the real pack. data-world-renown.test.js walks the same world. The defender's
// world (the band broken by this character, the word gone north) is staged through the real storage adapter; then through
// the buttons:
//   1. the royal records name the frontier's defender -- and this character, reading them, is known to the realm (the
//      character panel shows the title)
//   2. the castle town's notices tell the deed; save -> reload -> load keeps the state
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
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const story = (page) => page.locator("#story li");
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 the strongest one (M7): the realm's name", () => {
  test("the royal records name the defender; the title in the character panel; the town tells it -- kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      const pid = s.player.actorId;
      s.actors[pid].locationId = "loc_royal_city";
      s.actors[pid].money = 40;
      s.flags.band_crossed = true;
      s.flags.band_broken = true;
      s.flags.fate_word_north = true;
      s.signals.frontier_fate = 1;
      s.relations[`org_village:${pid}`] = { score: 20, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: ["defender"] };
      await idb.save("slot_renown", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_renown");

    await act(page, "왕도에 내걸린 글을 읽는다");
    await expect(page.locator("#log")).toContainText("남쪽 변경의 수호자");
    await expect(page.locator("#log")).toContainText("왕도가 그 이름을 안다");
    const read = await getState(page);
    expect(read.actors.player_1.growth.growth_wanderer.unlocks.unl_realm_renown).toBe(true);
    await expect(page.locator("body")).toContainText("왕국이 아는 이름");

    await move(page, "강 건너 길목");
    await move(page, "성읍");
    await act(page, "성읍의 포고판을 읽는다");
    await expect(page.locator("#log")).toContainText("갈림길의 수호자");
    await expect(page.locator("#log")).toContainText("수호자다");

    const after = await getState(page);
    await page.locator("#saveSlotInput").fill("slot_renown_saved");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_renown_saved");
    await loadSlot(page, "slot_renown_saved");
    expect(await getState(page)).toEqual(after);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
