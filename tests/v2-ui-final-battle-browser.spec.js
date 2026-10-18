// V2-Core-140 browser scenario (roadmap M6, chapters 4 "강을 건너오는 불길" and 5 "마지막 싸움과 그 뒤"): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real pack.
// data-world-final-battle.test.js walks the same world. Act one and the days until the band crosses are dispatched; the
// chapters through the buttons:
//   1. at the crossroads the band stands; facing it opens the last fight against the scarred chief -- chapter 4 opens
//      in the story panel; breaking off sends one to the village
//   2. the elder says when it will strike and that the village has too little; three days on, the elder tells how the
//      frontier fell -- chapter 5; save -> reload -> load keeps the story panel and the state
//   3. (V2-Core-150, D-128) a world whose guild lost a guard it knew (staged through the real storage adapter): the word
//      comes south on its own cadence, and the elder's telling of that day remembers the one who did not come back
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
const CH4 = "4장 강을 건너오는 불길";
const CH5 = "5장 마지막 싸움과 그 뒤";

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

test.describe("V2 the main thread, chapters 4 and 5 (M6): the band crosses; the last fight; the frontier's fate", () => {
  test("the band at the crossroads opens chapter 4; the elder's warning; the fate told -- through the buttons, kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    await page.evaluate(() => {
      for (let i = 0; i < 60 && !window.__v2App.getState().flags.band_crossed; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    const crossed = await getState(page);
    expect(crossed.flags.band_crossed).toBe(true);
    expect(crossed.signals.band_strength).toBe(6);

    await move(page, "옛 갈림길");
    await act(page, "갈림길을 막은 무리 앞에 선다");
    await expect(page.locator("#log")).toContainText("폐허에서 놓친 두목이다");
    await expect(option(page, "정면으로 맞붙는다")).toBeVisible();
    await expect(story(page).filter({ hasText: CH4 })).toHaveCount(1);
    await expect(story(page).filter({ hasText: "무리가 강을 건너 갈림길에 진을 쳤다" })).toHaveAttribute("data-chapter", "4");
    await option(page, "물러서서 마을로 달아난다").click();
    expect((await getState(page)).actors.player_1.locationId).toBe("loc_village");

    await act(page, "원로를 찾아간다");
    await option(page, "건너온 무리에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("사흘이면 마을로 내려올 걸세");
    await expect(page.locator("#log")).toContainText("마을이 가진 것이 모자라네");

    await dispatch(page, [{ type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }]);
    const after = await getState(page);
    expect(after.signals.frontier_fate).toBe(4);
    await act(page, "원로를 찾아간다");
    await option(page, "그날의 일을 듣는다").click();
    await expect(page.locator("#log")).toContainText("그날 밤 마을이 무너졌네");
    await expect(story(page).filter({ hasText: CH5 })).toHaveCount(1);
    await expect(story(page).filter({ hasText: "무리가 내려온 밤 마을이 무너졌다" })).toHaveAttribute("data-chapter", "5");

    const told = await getState(page);
    const lines = await story(page).allTextContents();
    await page.locator("#saveSlotInput").fill("slot_ch5_saved");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_ch5_saved");
    await loadSlot(page, "slot_ch5_saved");
    expect(await getState(page)).toEqual(told);
    expect(await story(page).allTextContents()).toEqual(lines);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a guard the guild knew did not come back: the word comes south, and the elder's telling remembers it", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    await page.evaluate(() => {
      for (let i = 0; i < 60 && !window.__v2App.getState().flags.band_crossed; i += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.actors[s.player.actorId].locationId = "loc_village";
      s.signals = { ...s.signals, guards_fallen: 1 }; // the world's memory: a guard it knew fell on the road
      await idb.save("slot_mourning", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_mourning");
    await act(page, "원로를 찾아간다");
    await expect(option(page, "그날의 일을 듣는다")).toHaveCount(0);
    await option(page, "안부만 묻는다").click();
    for (let i = 0; i < 6 && !(await getState(page)).flags.guard_fall_word_south; i += 1) await dispatch(page, [{ type: "wait", minutes: 1440 }]);
    const heard = await getState(page);
    expect(heard.flags.guard_fall_word_south).toBe(true);
    expect(heard.signals.frontier_fate).toBe(4);
    await act(page, "원로를 찾아간다");
    await option(page, "그날의 일을 듣는다").click();
    await expect(page.locator("#log")).toContainText("그날 밤 마을이 무너졌네");
    await expect(page.locator("#log")).toContainText("그 길에서 돌아오지 못한 호위도 있었지");

    const told = await getState(page);
    await page.locator("#saveSlotInput").fill("slot_mourned");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_mourned");
    await loadSlot(page, "slot_mourned");
    expect(await getState(page)).toEqual(told);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
