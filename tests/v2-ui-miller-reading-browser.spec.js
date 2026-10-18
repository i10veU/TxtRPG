// V2-Core-135 browser scenario (#335, MG-045/046, D-114): how long a word holds, and the miller's reading, through the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real pack.
// data-world-miller-reading.test.js walks the same world. Staged (through the real storage adapter and the app's button):
// the trader (twenty silver, no letter), and a town wanting one sack whose want last came back just now -- so the next
// caravan buys the mill's sack and meets it. The caravan, the miller's and the ferryman's words are the world's.
//   1. at the mill the miller tells what he made of the purchase ("the town must want it", a guess, today); at the ford the
//      ferryman tells how the caravan's step ended ("enough") -- two words about the same day, both kept
//   2. three days on, both words read "지금은 달라졌을 수 있음"; what the caravan took north (history) does not
//   3. save -> reload -> load keeps both words and their marks
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
const TO_TRADE = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"),
  M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_mill_hamlet")
];
const WANTS = "성읍 상인이 밀가루를 찾는다";
const TOOK = "상단이 변경의 밀가루를 싣고 북으로 갔다";

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
const log = (page) => page.locator("#log");
const word = (page, text) => page.locator("#knowledge li", { hasText: text });
const dispatch = (page, list) => page.evaluate((l) => l.forEach((a) => window.__v2App.dispatch(a)), list);
const me = (s) => s.actors[s.player.actorId];
const ferryman = async (page, label) => { await act(page, "뱃사공과 대화"); await option(page, label).click(); };
const merchant = async (page, label) => { await act(page, "성읍의 상인과 대화"); await option(page, label).click(); };
const miller = async (page, label) => { await act(page, "방앗간 주인과 대화"); await option(page, label).click(); };

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
// a day at a time through the app until the next caravan has passed
async function untilNextCaravan(page) {
  await page.evaluate(() => {
    const seen = window.__v2App.getState().signals.caravan_visits ?? 0;
    for (let i = 0; i < 10 && (window.__v2App.getState().signals.caravan_visits ?? 0) === seen; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    if ((window.__v2App.getState().signals.caravan_visits ?? 0) === seen) throw new Error("no caravan came");
  });
}

const BOUGHT = "상단이 방앗간 밀가루를 사 갔으니 성읍이 찾는 모양이다";
const ENOUGH = "성읍에 밀가루가 넉넉하다";
const MAYBE = "지금은 달라졌을 수 있음";

test.describe("V2 the miller's reading, and words that may no longer hold (#335)", () => {
  test("two words about one day, from the mill and the ford; three days on, both may no longer hold -- kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await expect(page.locator("#game")).toBeVisible();
    await dispatch(page, TO_TRADE);
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.actors[s.player.actorId].money = 20;
      delete s.actors[s.player.actorId].inventory.item_passage_letter;
      s.signals.town_flour_wanted = 1;
      s.fired.evt_town_flour_demand.lastMinute = s.fired.evt_caravan.lastMinute + 4320 - 60;
      await idb.save("slot_miller_reading", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_miller_reading");

    // before the purchase, the miller has nothing to read
    await miller(page, "이 근방의 소식을 묻는다");
    await expect(word(page, BOUGHT)).toHaveCount(0);

    await untilNextCaravan(page);
    const passed = await getState(page);
    expect(passed.signals.town_flour_wanted).toBe(0);
    await miller(page, "이 근방의 소식을 묻는다");
    await expect(log(page)).toContainText("성읍에서 찾으니 사 갔겠지");
    await expect(word(page, BOUGHT)).toHaveText(`${BOUGHT} · 방앗간 주인에게 들음 · 그럴듯함 · 오늘`);

    await dispatch(page, [M("loc_crossroads"), M("loc_river_ford")]);
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(word(page, ENOUGH)).toHaveText(`${ENOUGH} · 뱃사공에게 들음 · 믿을 만함 · 오늘`);
    await expect(word(page, BOUGHT)).toHaveCount(1);
    await expect(page.locator("#knowledge li[data-expired]")).toHaveCount(0);

    // three days on: both may no longer hold; the caravan's sack north is history
    await dispatch(page, [{ type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }]);
    await expect(word(page, BOUGHT)).toHaveText(`${BOUGHT} · 방앗간 주인에게 들음 · 그럴듯함 · 3일 전 · ${MAYBE}`);
    await expect(word(page, ENOUGH)).toHaveText(`${ENOUGH} · 뱃사공에게 들음 · 믿을 만함 · 3일 전 · ${MAYBE}`);
    await expect(word(page, ENOUGH)).toHaveAttribute("data-expired", "true");
    await expect(word(page, TOOK)).not.toContainText(MAYBE);

    await page.locator("#saveSlotInput").fill("slot_miller_saved");
    await page.locator("#saveBtn").click();
    await expect(log(page)).toContainText("slot_miller_saved");
    const saved = await getState(page);
    await loadSlot(page, "slot_miller_saved");
    expect((await getState(page)).knowledge).toEqual(saved.knowledge);
    await expect(page.locator("#knowledge li[data-expired]")).toHaveCount(2);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
