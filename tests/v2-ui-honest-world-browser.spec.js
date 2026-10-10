// V2-Core-117 browser scenario (#282, World Simulation 3, step 3 -- an honest clock, integrated): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural play.
// A known guard (four convoys guarded, staged strong and rested for each) is saved and loaded with the app's button; the
// fall is staged and loaded and the escort ends them with a real button; the successor starts and walks to the town. Then
// the royal journey, with real buttons -- and the world's numbers after it (the caravans that passed, the shares owed and
// gone, the fallen guard's word) equal what the same minutes waited at home leave, computed in the page through the real
// engine (data-world-honest-world.test.js pins the same three ways): the clock does not care how the days are spent.
// The clerk says why a convoy left; saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-honest-world.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const JOURNEY = [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_walk_royal_market"), M("loc_far_bank"), M("loc_castle_town")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

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

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

const NUMBERS = (s) => ({
  signals: Object.fromEntries(["caravan_visits", "guards_owed", "caravans_unguarded", "guards_fallen", "fallen_word_age", "bandits_tale_age"].map((k) => [k, s.signals?.[k] ?? 0])),
  flags: { guard_fall_word_south: s.flags?.guard_fall_word_south ?? false },
  fired: Object.fromEntries(["evt_caravan", "evt_fallen_word_south", "evt_bandits_tale"].map((id) => [id, s.fired?.[id] ?? null])),
  minute: s.time.minute
});

test.describe("V2 an honest clock (World Simulation 3, integrated)", () => {
  test("a known guard falls, the successor takes the royal journey -- the world's numbers are what the same days at home leave -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // a known guard, up to date (staged strong and rested for each convoy), a convoy waiting, on the first bad roll
    await page.evaluate(async ({ HOUR, ESCORT }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      for (let i = 0; i < 4; i += 1) {
        for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
        const g = s.actors.player_1.growth.growth_wanderer;
        g.stats.str = 30; g.resources.stamina.current = 6; s.actors.player_1.hp.current = s.actors.player_1.hp.max;
        s = run(run(s, ESCORT), [{ type: "move", to: "loc_castle_town" }]);
      }
      for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
      const g = s.actors.player_1.growth.growth_wanderer;
      s.actors.player_1.hp.current = 1;
      g.stats.str = 0;
      g.skills = { ...g.skills, swordsmanship: 0 };
      g.resources.stamina.current = 6;
      for (let k = 0; k < 60; k += 1) {
        const t = structuredClone(s);
        t.rng.cursor += k;
        const r = ESCORT.reduce((x, a) => step(x, a, worldData).state, t);
        if (r.pending?.kind === "newCharacter") { await idb.save("slot_doomed", t, { savedAt: 1 }); return; }
      }
      throw new Error("no bad roll");
    }, { HOUR, ESCORT });
    await loadSlot(page, "slot_doomed");
    expect((await getState(page)).signals.guards_fallen ?? 0).toBe(0);

    // the escort ends them (a real button); the successor starts and walks to the town
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    expect((await getState(page)).signals.guards_fallen).toBe(1);
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    const inTown = await getState(page);
    expect(inTown.actors.player_2.locationId).toBe("loc_castle_town");

    // the royal journey, with real buttons
    await move(page, "강 건너 길목");
    await act(page, "길목의 게시판을 읽는다");
    await move(page, "왕도");
    await expect(page.locator("#location")).toContainText("왕도");
    await act(page, "왕도의 큰 시장을 둘러본다");
    await move(page, "강 건너 길목");
    await move(page, "영주의 성읍");
    const back = await getState(page);
    expect(back.signals.guards_owed).toBe(3);
    expect(back.signals.caravans_unguarded).toBeGreaterThanOrEqual(1);

    // the same minutes at home, through the real engine in the page: the same world numbers
    const home = await page.evaluate(async ({ start, minutes }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      const days = Math.floor(minutes / 1440);
      const waits = [...Array(days).fill({ type: "wait", minutes: 1440 }), { type: "wait", minutes: minutes - days * 1440 }];
      return waits.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start: inTown, minutes: back.time.minute - inTown.time.minute });
    expect(NUMBERS(back)).toEqual(NUMBERS(home));

    // the clerk says why a convoy left
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 오래 못 구한 상단은 기다려 주지 않는다고");

    await page.locator("#saveSlotInput").fill("slot_clock");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await loadSlot(page, "slot_clock");
    expect(await getState(page)).toEqual(saved);

    // the same end as a pure replay from the loaded staged start
    const doomed = await page.evaluate(async () => (await import("/v2/storage/idb.js")).load("slot_doomed").then((r) => r.state ?? r));
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start: doomed, actions: [...ESCORT, NEW_LIFE, ...SUCCESSOR_WALK, ...JOURNEY, ...ASK] });
    expect(saved).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
