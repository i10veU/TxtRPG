// V2-Core-103 browser scenario (#251, World Memory 1, step 2 -- the village hears): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. The honoured scout's Slice 3, the road north and two good escorts are dispatched; the state is staged for the
// fall (the last point of hp, no strength, a bad roll found on the staged state), saved through the real storage
// adapter and loaded with the app's button (data-world-fallen-word.test.js does the same). The rest is real buttons:
// the escort that ends her, the new life in the village asking the elder "안부만 묻기" -- he has not heard -- three days
// of waiting, and the elder says a guard did not come back; then saved -> reloaded -> loaded, the same end as a pure
// replay.
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
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
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

const HOUR = { type: "wait", minutes: 60 };
const SMALL_TALK = [P("act_talk_elder"), C("opt_small_talk")];

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

const talk = (page) => act(page, "원로와 대화").then(() => option(page, "안부만 묻기").click());

test.describe("V2 the village hears (World Memory 1)", () => {
  test("a fall, the new life asks the elder: not yet; three days on: a guard did not come back -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    const before = [...SCOUT_HONOURED, ...SCOUT_TO_TOWN, ...ESCORT, M("loc_castle_town"), DAY, DAY, DAY, ...ESCORT, M("loc_castle_town")];
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), before);
    expect((await getState(page)).relations["npc_guild_clerk:player_1"].score).toBe(10);

    await page.evaluate(async ({ ESCORT, DAY }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      state.actors.player_1.hp.current = 1;
      g.stats.str = 0;
      g.skills = { ...g.skills, swordsmanship: 0 };
      g.resources.stamina.current = 6;
      for (let k = 0; k < 60; k += 1) {
        const t = structuredClone(state);
        t.rng.cursor += k;
        const r = [DAY, DAY, DAY, ...ESCORT].reduce((s, a) => step(s, a, worldData).state, t);
        if (r.pending?.kind === "newCharacter") { await idb.save("slot_doomed", t, { savedAt: 1 }); return; }
      }
      throw new Error("no bad roll");
    }, { ESCORT, DAY });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_doomed" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    const start = await getState(page);

    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await option(page, "새 캐릭터로 시작 (start_wanderer)").click();
    const lived = await getState(page);
    expect(lived.signals.guards_fallen).toBe(1);
    expect(lived.actors.player_2.locationId).toBe("loc_village");

    // the village has not heard yet
    await talk(page);
    await expect(page.locator("#log")).not.toContainText("돌아오지 못한 호위 이야기가 돈다고");
    expect((await getState(page)).flags.guard_fall_word_south).toBeUndefined();

    // three days on
    let waited = 0;
    while (!(await getState(page)).flags.guard_fall_word_south) {
      await page.evaluate((h) => window.__v2App.dispatch(h), HOUR);
      waited += 1;
      if (waited > 80) throw new Error("the word never came");
    }
    await talk(page);
    await expect(page.locator("#log")).toContainText("돌아오지 못한 호위 이야기가 돈다고");

    await page.locator("#saveSlotInput").fill("slot_word");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_word" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [DAY, DAY, DAY, ...ESCORT, NEW_LIFE, ...SMALL_TALK, ...Array(waited).fill(HOUR), ...SMALL_TALK] });
    expect(saved).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
