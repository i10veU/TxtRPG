// V2-Core-107 browser scenario (#258, RPG Depth 3, step 3 -- integrated: beyond the last rank): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The honoured scout's Slice 3, the road north and seven escorts are dispatched; the rest is real buttons: the
// eighth escort fills the practice (the status line lists `unl_road_lead`), a night, the clerk offers the lead (and not
// the careful way: no fall yet) and she leads. The fall is then staged (data-world-beyond-last-rank.test.js: the last
// hp, no strength, a bad roll), saved through the real storage adapter and loaded with the app's button; the escort that
// ends her, the new life walking to the town (dispatched), the clerk offering the careful way and not the lead, and the
// careful job; saved -> reloaded -> loaded, the same end as a pure replay.
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
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const LEAD = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_lead")];
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

const statusLine = (page, label) => page.locator("#status p", { hasText: label });
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const NEXT_LIFE_TO_TOWN = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const CAREFUL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")];

test.describe("V2 beyond the last rank (RPG Depth 3 integrated)", () => {
  test("the last rank opens the lead, a known guard falls, the successor is offered the careful way and not the lead -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [...SCOUT_HONOURED, ...SCOUT_TO_TOWN]);
    const start = await getState(page);
    const taken = await careerInPage(page, 7);
    const seven = await getState(page);

    // the eighth escort, a night, the clerk's offer, the lead
    if (stamina(seven) < 2) await act(page, "성읍에서 묵는다");
    const wait8 = await waitForCaravan(page);
    await escort(page);
    await expect(statusLine(page, "해금:")).toContainText("상단을 이끌 자격");
    await act(page, "성읍에서 묵는다");
    const wait9 = await waitForCaravan(page);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible();
    await expect(option(page, "길을 조심스레 간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 이끄는 자리도 맡을 만하다고");
    await expect(page.locator("#log")).not.toContainText("날을 넘겨 천천히 길을 가는 방법도 있다고");
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 이끈다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    await page.locator("#moves button", { hasText: "영주의 성읍" }).click();
    const led = await getState(page);
    expect(led.signals.guards_hired).toBe(9);
    expect(led.signals.guards_fallen).toBeUndefined();

    // the fall, staged: the last hp, no strength, a bad roll found on the staged state; saved and loaded with the button
    const hours = await page.evaluate(async ({ ESCORT, HOUR }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      state.actors.player_1.hp.current = 1;
      g.stats.str = 0;
      g.skills = { ...g.skills, swordsmanship: 0 };
      g.resources.stamina.current = 6;
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      for (let k = 0; k < 80; k += 1) {
        const t = structuredClone(state);
        t.rng.cursor += k;
        let s = t;
        let h = 0;
        for (; h < 96 && !wanted(s); h += 1) s = run(s, [HOUR]);
        if (run(s, ESCORT).pending?.kind === "newCharacter") { await idb.save("slot_doomed", t, { savedAt: 1 }); return h; }
      }
      throw new Error("no bad roll");
    }, { ESCORT, HOUR });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_doomed" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    const staged = await getState(page);

    // the escort that ends her, the new life
    const waitFall = await waitForCaravan(page);
    expect(waitFall).toBe(hours);
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    expect((await getState(page)).signals.guards_fallen).toBe(1);

    // the successor in the town: the careful way is offered, the lead is not
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), NEXT_LIFE_TO_TOWN);
    const waitNext = await waitForCaravan(page);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await expect(option(page, "상단 호위를 이끈다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("날을 넘겨 천천히 길을 가는 방법도 있다고");
    await expect(page.locator("#log")).not.toContainText("호위를 이끄는 자리도 맡을 만하다고");
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "길을 조심스레 간다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const end = await getState(page);
    expect(end.actors.player_2.hp.current).toBe(10);

    await page.locator("#saveSlotInput").fill("slot_beyond");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_beyond" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);
    expect(saved).toEqual(end);

    // the same end as a pure replay: the first life (dispatched, then buttons), the staged fall, the second life
    const nights = stamina(seven) < 2 ? [P("act_lodge_castle_town")] : [];
    const lifeOne = [...taken, ...nights, ...Array(wait8).fill(HOUR), ...ESCORT, M("loc_castle_town"), P("act_lodge_castle_town"), ...Array(wait9).fill(HOUR), ...ASK, ...LEAD, M("loc_castle_town")];
    const replayedOne = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((x, a) => step(x, a, worldData).state, start);
    }, { start, actions: lifeOne });
    expect(replayedOne).toEqual(led);
    const lifeTwo = [...Array(waitFall).fill(HOUR), ...ESCORT, NEW_LIFE, ...NEXT_LIFE_TO_TOWN, ...Array(waitNext).fill(HOUR), ...ASK, ...CAREFUL];
    const replayedTwo = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((x, a) => step(x, a, worldData).state, start);
    }, { start: staged, actions: lifeTwo });
    expect(replayedTwo).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
