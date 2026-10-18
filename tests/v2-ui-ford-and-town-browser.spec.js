// V2-Core-132 browser scenario (#328, MG-045/046, D-112/D-113): the ford and the town through the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real pack. data-world-ford-and-town.test.js
// walks the same world. Only the trader is staged (twenty silver, no elder's letter -- the letter makes every crossing free),
// through the real storage adapter and the app's button; the caravans, the town's want and the ferryman's word are the world's.
//   1. the loop through the real UI: flour from the mill; at the ford the ferryman's word on the town's want is dated by the
//      day the caravan passed ("N일 전의 일 (오늘 들음)"), beside what that caravan took north; the fare; in the town the
//      merchant's word is today's; two sacks sold make a supplier he knows, who is given his note; south again, and the
//      next flour crosses on his account;
//   2. a real save from before (tests/v2/fixtures/save-before-ford-and-town.json): loaded with the app's button the ferryman
//      has nothing of the town to tell until a caravan passes, and his dated word survives save -> reload -> load.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const OLD_SAVE = JSON.parse(fs.readFileSync(path.join(__dirname, "v2", "fixtures", "save-before-ford-and-town.json"), "utf8"));
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

test.describe("V2 the ford and the town (MG-045/046)", () => {
  test("the dated word, the fare, the merchant's word, his note and the flour on his account -- through the real UI", async ({ page }) => {
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
      await idb.save("slot_trader", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_trader");

    // two sacks at the mill, to the ford; the next caravan passes; a day later the ferryman is asked
    await miller(page, "밀가루 자루를 산다");
    await miller(page, "밀가루 자루를 산다");
    await dispatch(page, [M("loc_crossroads"), M("loc_river_ford")]);
    await untilNextCaravan(page);
    const passed = await getState(page);
    expect(passed.knowledge.npc_ferryman.rum_town_flour_wanted.aboutDay).toBe(Math.floor(passed.time.minute / 1440));
    await dispatch(page, [{ type: "wait", minutes: 1440 }]);
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(log(page)).toContainText("성읍 상인이 강 남쪽 밀가루를 찾는다더군");
    await expect(word(page, WANTS)).toHaveText(`${WANTS} · 뱃사공에게 들음 · 믿을 만함 · 1일 전의 일 (오늘 들음)`);
    await expect(word(page, TOOK)).toHaveText(`${TOOK} · 뱃사공에게 들음 · 직접 확인함 · 1일 전의 일 (오늘 들음)`);

    // the fare, and the town
    const before = await getState(page);
    await ferryman(page, "강을 건넌다 (뱃삯 은화 3)");
    expect(me(await getState(page)).money).toBe(me(before).money - 3);
    await dispatch(page, [M("loc_castle_town")]);
    await merchant(page, "강 남쪽 물건에 대해 묻는다");
    await expect(word(page, WANTS)).toHaveText(`${WANTS} · 뱃사공에게 들음, 성읍의 상인에게 들음 · 믿을 만함 · 오늘`);

    // two sacks sold: a supplier he knows -- he gives his note while the town wants flour
    for (let i = 0; i < 2; i += 1) {
      await act(page, "성읍의 상인과 대화");
      await page.locator("#choiceOptions button:not([disabled])", { hasText: /^밀가루 자루를 판다/ }).first().click();
    }
    const sold = await getState(page);
    expect(sold.relations[`npc_town_merchant:${sold.player.actorId}`].score).toBe(10);
    // the second caravan met one of the town's two; the first sale met the last, and the want came back (its cadence since
    // the trade opened has passed); the second sale leaves one wanted -- so the merchant asks for flour
    expect(sold.signals.town_flour_wanted).toBe(1);
    {
      await merchant(page, "밀가루를 대 주기로 하고 짐표를 받는다");
      await expect(log(page)).toContainText("상인이 짐표 한 장을 써 준다");
      expect(me(await getState(page)).inventory.item_merchant_note).toBe(1);

      // south again (free), flour, and across on his account
      await dispatch(page, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_mill_hamlet"), { type: "wait", minutes: 1440 }]);
      await miller(page, "밀가루 자루를 산다");
      await dispatch(page, [M("loc_crossroads"), M("loc_river_ford")]);
      await act(page, "뱃사공과 대화");
      await expect(option(page, "상인의 짐표를 보이고 밀가루를 싣는다")).toBeVisible();
      await expect(option(page, "짐 없이 상인의 짐표를 내민다")).toHaveCount(0);
      const atFord = await getState(page);
      await option(page, "상인의 짐표를 보이고 밀가루를 싣는다").click();
      await expect(log(page)).toContainText("상인 앞으로 달아 두지");
      const across = await getState(page);
      expect(me(across).money).toBe(me(atFord).money);
      expect(me(across).locationId).toBe("loc_far_bank");
      expect(across.signals.merchant_ferry_account).toBe(3);

      // V2-Core-148 (D-126, M8 step 3 K1): in the town the note's sack goes at the note's price whatever the town wants.
      // The town has enough when the carrier arrives; a few days on its want comes back -- and still the market's price
      // is not offered while the carriage is under way
      await dispatch(page, [M("loc_castle_town")]);
      expect((await getState(page)).signals.town_flour_wanted ?? 0).toBe(0);
      for (let day = 0; day < 10 && ((await getState(page)).signals.town_flour_wanted ?? 0) < 1; day += 1) await page.locator("#waitDayBtn").click();
      const wanting = await getState(page);
      expect(wanting.signals.town_flour_wanted).toBeGreaterThanOrEqual(1);
      await act(page, "성읍의 상인과 대화");
      await expect(option(page, "짐표대로 밀가루를 넘긴다 (은화 4)")).toBeVisible();
      await expect(option(page, "밀가루 자루를 판다")).toHaveCount(0);
      await option(page, "짐표대로 밀가루를 넘긴다 (은화 4)").click();
      await expect(log(page)).toContainText("마침 찾던 참이오. 그래도 값은 짐표대로 넷이오.");
      const paid = await getState(page);
      expect(me(paid).money).toBe(me(wanting).money + 4);
      expect(paid.signals.town_flour_wanted).toBe(wanting.signals.town_flour_wanted - 1);
      expect(paid.relations[`npc_town_merchant:${paid.player.actorId}`].tags ?? []).not.toContain("carrying");
    }
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a save from before: loaded with the app's button, the ferryman's word starts with the next caravan and is kept", async ({ page }) => {
    test.setTimeout(60000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(async (state) => {
      const idb = await import("/v2/storage/idb.js");
      await idb.save("slot_before_ford", state, { savedAt: 1 });
    }, OLD_SAVE.state);
    await loadSlot(page, "slot_before_ford");
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(word(page, WANTS)).toHaveCount(0);
    await expect(page.locator("#knowledge li", { hasText: "성읍에 밀가루가 넉넉하다" })).toHaveCount(0);

    await untilNextCaravan(page);
    await ferryman(page, "강 건너 소식을 묻는다");
    await expect(page.locator("#knowledge li").filter({ hasText: /^성읍 (상인이 밀가루를 찾는다|에 밀가루가 넉넉하다) · 뱃사공에게 들음 · 믿을 만함 · 오늘$/ })).toHaveCount(1);
    const heard = await getState(page);

    await page.locator("#saveSlotInput").fill("slot_ford_saved");
    await page.locator("#saveBtn").click();
    await expect(log(page)).toContainText("slot_ford_saved");
    await loadSlot(page, "slot_ford_saved");
    const loaded = await getState(page);
    expect(loaded.knowledge).toEqual(heard.knowledge);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
