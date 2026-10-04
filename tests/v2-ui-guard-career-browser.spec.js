// V2-Core-95 browser scenario (#226, RPG Depth 1, step 4 -- integrated: a name on the road): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play (no stats edited). The honoured scout's Slice 3 and the road north are dispatched; the rest is real buttons (and
// dispatched waits): two good escorts, the clerk who knows her, saved -> reloaded -> loaded, the jerkin bought with her
// earnings and worn, and the third escort paid as a known guard, with no wound. It ends in the state a pure replay
// (core/engine.js in the page, no UI) reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
// tests/v2/data-world-guard-career.test.js
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
// what the buttons (and waits) below do, as actions (for the pure replay)
const BY_HAND = [
  ...ESCORT, M("loc_castle_town"), DAY, DAY, DAY, ...ESCORT, M("loc_castle_town"), P("act_talk_guild_clerk"), C("opt_guild_clerk_ask"),
  DAY, DAY, DAY, P("act_talk_town_merchant"), C("opt_town_merchant_buy_jerkin"), P("act_equip_leather_jerkin"), ...ESCORT
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

async function saveReloadLoad(page, slot, count) {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
  const saved = await getState(page);
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
  expect(await getState(page)).toEqual(saved);
}
const replayInPage = (page, actions) => page.evaluate(async (actions) => {
  const { createInitialState, step } = await import("/v2/core/engine.js");
  const { worldData } = await import("/v2/data/world.js");
  return actions.reduce((s, a) => step(s, a, worldData).state, createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state);
}, actions);
async function escort(page) {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "상단 호위를 맡는다").click();
  await expect(page.locator("#location")).toContainText("강 건너 길목");
}

test.describe("V2 a name on the road (RPG Depth 1 integrated)", () => {
  test("two escorts, known, save/load, the jerkin from her earnings, the third paid as a known guard -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("integrated-36", "start_scout"));
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]);
    expect((await getState(page)).actors.player_1.locationId).toBe("loc_castle_town");

    await escort(page);
    await move(page, "영주의 성읍");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await escort(page);
    await move(page, "영주의 성읍");
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("믿을 만한 호위라고 한다.");

    await saveReloadLoad(page, "slot_career", 1);

    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "성읍의 상인과 대화");
    await option(page, "가죽 조끼를 산다 (은화 3)").click();
    await act(page, "가죽 조끼를 입는다");
    await escort(page);
    await expect(page.locator("#log")).toContainText("조합이 믿는 호위에게는 그만큼 더 쳐 준다고 한다.");
    await expect(page.locator("#log")).not.toContainText("쉬는 것만으로는 낫지 않을 것 같다.");

    const end = await getState(page);
    expect(end.actors.player_1.growth.growth_wanderer.traits.road_wound).toBeUndefined();
    expect(end.relations["npc_guild_clerk:player_1"].score).toBe(15);
    expect(end).toEqual(await replayInPage(page, [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...BY_HAND]));

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
