// V2-Core-101 browser scenario (#244, RPG Depth 2, step 3 -- integrated: a guard's living): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The honoured scout's Slice 3 and the road north are dispatched, then six escorts by the policy of
// data-world-guard-living (the jerkin before the third, a night in the town when spent, waiting by the hour for the
// caravan). The rest is real buttons: spent, a night in the town, the seventh escort; saved -> reloaded -> loaded; the
// eighth -- the status line's swordsmanship at its last rank -- the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "integrated-36";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
const DAY = { type: "wait", minutes: 1440 };
const HOUR = { type: "wait", minutes: 60 };
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

const skillsLine = (page) => page.locator("#status p", { hasText: "기술:" });

// the policy of data-world-guard-living, run in the page through the app's own dispatch; returns the actions taken
function careerInPage(page, count) {
  return page.evaluate(async ({ count, ESCORT, HOUR }) => {
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const app = window.__v2App;
    const taken = [];
    const go = (a) => { app.dispatch(a); taken.push(a); };
    const me = () => app.getState().actors.player_1;
    const wanted = () => { const s = app.getState(); return evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" }); };
    for (let i = 0; i < count; i += 1) {
      if (me().locationId === "loc_far_bank") go({ type: "move", to: "loc_castle_town" });
      if (app.getState().signals.guards_hired === 2 && !me().inventory.item_leather_jerkin) {
        [{ type: "perform", actionId: "act_talk_town_merchant" }, { type: "choose", optionId: "opt_town_merchant_buy_jerkin" }, { type: "perform", actionId: "act_equip_leather_jerkin" }].forEach(go);
      }
      if (me().growth.growth_wanderer.resources.stamina.current < 2) go({ type: "perform", actionId: "act_lodge_castle_town" });
      for (let h = 0; h < 96 && !wanted(); h += 1) go(HOUR);
      ESCORT.forEach(go);
    }
    go({ type: "move", to: "loc_castle_town" });
    return taken;
  }, { count, ESCORT, HOUR });
}
async function escort(page) {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "상단 호위를 맡는다").click();
  await expect(page.locator("#location")).toContainText("강 건너 길목");
  await page.locator("#moves button", { hasText: "영주의 성읍" }).click();
}
async function waitForCaravan(page) {
  return page.evaluate(async (HOUR) => {
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const app = window.__v2App;
    const wanted = () => { const s = app.getState(); return evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" }); };
    let hours = 0;
    for (; hours < 96 && !wanted(); hours += 1) app.dispatch(HOUR);
    return hours;
  }, HOUR);
}

test.describe("V2 a guard's living (RPG Depth 2 integrated)", () => {
  test("six escorts, spent, a night in the town, the seventh, save/load, the eighth at the last rank -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]);
    const start = await getState(page);
    const taken = await careerInPage(page, 6);
    const six = await getState(page);
    expect(six.signals.guards_hired).toBe(6);
    expect(stamina(six)).toBe(0);
    await expect(skillsLine(page)).toContainText("swordsmanship 4");

    // spent: a night in the town, then the seventh caravan
    await act(page, "성읍에서 묵는다");
    await expect(page.locator("#log")).toContainText("은화 두 닢을 내고 성읍의 지붕 아래에서 하룻밤을 묵는다.");
    const wait7 = await waitForCaravan(page);
    await escort(page);

    await page.locator("#saveSlotInput").fill("slot_living");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_living" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    const wait8 = await waitForCaravan(page);
    await escort(page);
    const end = await getState(page);
    expect(end.signals.guards_hired).toBe(8);
    await expect(skillsLine(page)).toContainText("swordsmanship 5");
    expect(end.actors.player_1.growth.growth_wanderer.proficiency.combat).toBe(100);
    expect(end.actors.player_1.money - start.actors.player_1.money).toBe(42 - 3 - 2 * 2);

    // the same end as a pure replay: the dispatched career, then what the buttons did (and the hours waited between)
    const BUTTONS_ESCORT = [...ESCORT, M("loc_castle_town")];
    const after = [P("act_lodge_castle_town"), ...Array(wait7).fill(HOUR), ...BUTTONS_ESCORT, ...Array(wait8).fill(HOUR), ...BUTTONS_ESCORT];
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((x, a) => step(x, a, worldData).state, start);
    }, { start, actions: [...taken, ...after] });
    expect(replayed).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
