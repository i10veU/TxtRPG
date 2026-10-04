// V2-Core-100 browser scenario (#244, RPG Depth 2, step 2 -- a bed in the castle town): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The honoured scout's Slice 3, the road north and her three escorts are dispatched (data-world-castle-lodging);
// the rest is real buttons (and dispatched waits): a fourth caravan wants its guard and she is too spent to take it;
// a night in the town for two silver, stamina refilled, saved -> reloaded -> loaded, and the escort taken from the
// town -- the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "integrated-36";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const BACK_AND_WAIT = [M("loc_castle_town"), DAY, DAY, DAY];
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
const THREE_ESCORTS = [...ESCORT, ...BACK_AND_WAIT, ...ESCORT, ...BACK_AND_WAIT, ...ESCORT, M("loc_castle_town")];

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
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const stamina = (s) => s.actors.player_1.growth.growth_wanderer.resources.stamina.current;

test.describe("V2 a bed in the castle town (RPG Depth 2)", () => {
  test("spent after three escorts, a night for two silver, save/load, the next caravan from the town -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...THREE_ESCORTS]);
    // wait for the fourth caravan
    await page.evaluate((day) => {
      while ((window.__v2App.getState().signals.guards_owed ?? 0) < 1) window.__v2App.dispatch(day);
    }, DAY);
    const spent = await getState(page);
    expect(spent.actors.player_1.locationId).toBe("loc_castle_town");
    expect(stamina(spent)).toBe(0);

    // the clerk has work, but the escort is not offered to a spent guard
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 맡는다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("강나루로 내려가는 상단이 호위를 구한다고");

    // a night in the town
    await act(page, "성읍에서 묵는다");
    await expect(page.locator("#log")).toContainText("은화 두 닢을 내고 성읍의 지붕 아래에서 하룻밤을 묵는다.");
    const rested = await getState(page);
    expect(spent.actors.player_1.money - rested.actors.player_1.money).toBe(2);
    expect(stamina(rested)).toBe(6);
    expect(rested.time.minute - spent.time.minute).toBe(480);

    await page.locator("#saveSlotInput").fill("slot_lodged");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_lodged" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the next caravan, from the town
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const end = await getState(page);
    expect(end.signals.guards_hired).toBe(4);

    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start: spent, actions: [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask"), P("act_lodge_castle_town"), ...ESCORT] });
    expect(end).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
