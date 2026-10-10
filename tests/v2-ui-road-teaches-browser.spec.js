// V2-Core-99 browser scenario (#244, RPG Depth 2, step 1 -- the road teaches): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The honoured scout's Slice 3 and the road north are dispatched; the state is saved as a save from before the
// fix would be -- with two escorts' practice written to the dead `swordsmanship` proficiency -- through the real
// storage adapter and loaded with the app's button. The rest is real buttons (and dispatched waits): two escorts, the
// status line's swordsmanship rank rising from 1 to 2 (the `combat` practice, D-81), saved -> reloaded -> loaded, the
// dead points untouched -- the same end as a pure replay (data-world-road-teaches.test.js).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "integrated-36";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const SCOUT_HONOURED = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"), P("act_talk_herbalist"), C("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_report_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), ...E("opt_village_honor")
];
const SCOUT_TO_TOWN = [REST, ...E("opt_ask_region"), ...E("opt_elder_letter"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross_letter"), M("loc_castle_town")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];

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
const skillsLine = (page) => page.locator("#status p", { hasText: "기술:" });

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
async function escort(page) {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "상단 호위를 맡는다").click();
  await expect(page.locator("#location")).toContainText("강 건너 길목");
  await move(page, "영주의 성읍");
}

test.describe("V2 the road teaches (RPG Depth 2)", () => {
  test("a save from before the fix, two escorts, swordsmanship 1 -> 2, save/load, the dead points untouched -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]);
    expect((await getState(page)).actors.player_1.growth.growth_wanderer.skills.swordsmanship).toBe(1);
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      state.actors.player_1.growth.growth_wanderer.proficiency.swordsmanship = 20; // as the old escort wrote it
      await idb.save("slot_before_fix", state, { savedAt: 1 });
    });
    await loadSlot(page, "slot_before_fix");
    const start = await getState(page);
    await expect(skillsLine(page)).toContainText("검술 1");

    await escort(page);
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await escort(page);
    await expect(skillsLine(page)).toContainText("검술 2");
    const g = (await getState(page)).actors.player_1.growth.growth_wanderer;
    expect(g.proficiency.combat).toBe(40);
    expect(g.proficiency.swordsmanship).toBe(20);

    await page.locator("#saveSlotInput").fill("slot_taught");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await loadSlot(page, "slot_taught");
    expect(await getState(page)).toEqual(saved);
    await expect(skillsLine(page)).toContainText("검술 2");

    // the same end as a pure replay of the same input from the loaded start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [...ESCORT, M("loc_castle_town"), DAY, DAY, DAY, ...ESCORT, M("loc_castle_town")] });
    expect(saved).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
