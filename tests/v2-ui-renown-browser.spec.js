// V2-Core-142 browser scenario (roadmap M7, the apex: the realm's name): the real entry point (web/v2/index.html + ui/app.js)
// in real Chromium with real IndexedDB and the real pack. data-world-renown.test.js walks the same world. The defender's
// world (the band broken by this character, the word gone north) is staged through the real storage adapter; then through
// the buttons:
//   1. the royal records name the frontier's defender -- and this character, reading them, is known to the realm (the
//      character panel shows the title)
//   2. the castle town's notices tell the deed; save -> reload -> load keeps the state
//   3. (V2-Core-149, D-127) after the remnants regroup the waystation's board posts their bounty again
//   4. (V2-Core-149, D-127) the word goes north on its own cadence and the ferryman passes it on; kept across a reload
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

  test("a second successful hunt starts a full week after the old quiet ends", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-hunt-ui"));
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const { createInitialState, step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      const s = structuredClone(window.__v2App.getState());
      const pid = s.player.actorId;
      s.actors[pid].locationId = "loc_band_camp";
      const growth = s.actors[pid].growth.growth_wanderer;
      growth.skills = { ...growth.skills, swordsmanship: 2 };
      s.signals = { ...s.signals, frontier_fate: 1 };
      s.signals.remnants_quiet = 0;
      s.flags = { ...s.flags, band_broken: true };
      s.fired = { ...s.fired, evt_unrest_remnants_regroup: { count: 7, lastMinute: s.time.minute } };
      let found = false;
      for (let i = 0; i < 300; i += 1) {
        s.rng = createInitialState({ worldSeed: `hunt-ui-${i}`, data: worldData }).state.rng;
        const trial = step(s, { type: "perform", actionId: "act_hunt_band_remnants" }, worldData);
        const tier = trial.events.find((e) => e.type === "check.resolved")?.data.tier;
        if (tier === "success" || tier === "great") { found = true; break; }
      }
      if (!found) throw new Error("no successful hunt seed");
      await idb.save("slot_hunt_restart", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_hunt_restart");
    await act(page, "숲 너머에 남은 무리를 뒤쫓는다");
    const hunted = await getState(page);
    expect(hunted.signals.remnants_quiet).toBe(7);
    expect(hunted.fired.evt_unrest_remnants_regroup).toEqual({ count: 8, lastMinute: hunted.time.minute });
    await expect(page.locator("#actions")).not.toContainText("숲 너머에 남은 무리를 뒤쫓는다");

    await page.locator("#saveSlotInput").fill("slot_hunt_week");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_hunt_week");
    await loadSlot(page, "slot_hunt_week");
    expect(await getState(page)).toEqual(hunted);
    await dispatch(page, Array(6).fill({ type: "wait", minutes: 1440 }));
    expect((await getState(page)).signals.remnants_quiet).toBe(1);
    await dispatch(page, [{ type: "wait", minutes: 1440 }]);
    expect((await getState(page)).signals.remnants_quiet).toBe(0);
    await expect(page.locator("#actions")).toContainText("숲 너머에 남은 무리를 뒤쫓는다");
    // V2-Core-149 (D-127): back in the woods, and the waystation says so
    expect((await getState(page)).facts.fact_remnants.value).toBe("regrouped");
    await move(page, "강 건너 길목");
    await act(page, "길목의 게시판을 읽는다");
    await expect(page.locator("#log")).toContainText("무리의 남은 자들이 다시 모였다고 한다");
    await expect(page.locator("#knowledge li", { hasText: "숲 너머에 무리의 잔당이 다시 모였다" })).toHaveCount(1);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the word goes north on its cadence; the ferryman passes it on -- kept across a reload", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await dispatch(page, TO_DISPERSAL);
    // staged: the band broken by this character a cadence ago, the word on its way (its first step taken just now)
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.flags = { ...s.flags, band_crossed: true, band_broken: true, road_walked: true };
      s.signals = { ...s.signals, frontier_fate: 1, fate_word_age: 1 };
      s.fired = { ...s.fired, evt_unrest_word_north: { count: 1, lastMinute: s.time.minute } };
      await idb.save("slot_word_north", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_word_north");
    const ask = async () => { await act(page, "뱃사공에게 말을 건다"); await option(page, "강 건너 소식을 묻는다").click(); };
    await ask();
    await expect(page.locator("#log")).not.toContainText("변경 이야기는 상단 편에 북으로 올라갔소");
    for (let i = 0; i < 6 && !(await getState(page)).flags.fate_word_north; i += 1) await page.locator("#waitDayBtn").click();
    const arrived = await getState(page);
    expect(arrived.flags.fate_word_north).toBe(true);
    expect(arrived.facts.fact_fate_word.value).toBe("north");
    await ask();
    await expect(page.locator("#log")).toContainText("변경 이야기는 상단 편에 북으로 올라갔소");
    await expect(page.locator("#knowledge li", { hasText: "변경의 일이 상단 편에 북쪽으로 올라갔다" })).toHaveCount(1);
    await expect(story(page).filter({ hasText: "변경의 일이 상단 편에 북쪽으로 올라갔다" })).toHaveCount(1);

    const told = await getState(page);
    await page.locator("#saveSlotInput").fill("slot_word_told");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_word_told");
    await loadSlot(page, "slot_word_told");
    expect(await getState(page)).toEqual(told);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
