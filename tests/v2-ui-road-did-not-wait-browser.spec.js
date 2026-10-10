// V2-Core-110 browser scenario (#265, World Simulation 2, step 3 -- the road that did not wait, integrated): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack, in natural
// play. A guard the guild knows (four convoys guarded, staged strong and rested for each) is saved and loaded with the app's
// button; the royal journey with real buttons (one caravan owed, one gone; the clerk says so); the fall is staged
// (data-world-road-did-not-wait.test.js does the same) and loaded; the escort ends him; the successor starts, walks to the
// town, waits for a convoy, and the clerk tells both things; the careful way is offered (not the lead) and taken with a real
// button; saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-road-did-not-wait.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const CAREFUL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")];
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

test.describe("V2 the road that did not wait (World Simulation 2, integrated)", () => {
  test("a known guard's journey, the fall, the successor hears both, the careful way -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // an up-to-date guard the guild knows (staged strong and rested for each convoy), saved and loaded with the button
    await page.evaluate(async ({ HOUR, ESCORT }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      for (let i = 0; i < 4; i += 1) {
        for (let h = 0; h < 96 && !wanted(s); h += 1) s = run(s, [HOUR]);
        const g = s.actors.player_1.growth.growth_wanderer;
        g.stats.str = 30;
        g.resources.stamina.current = 6;
        s.actors.player_1.hp.current = s.actors.player_1.hp.max;
        s = run(run(s, ESCORT), [{ type: "move", to: "loc_castle_town" }]);
      }
      await idb.save("slot_uptodate", s, { savedAt: 1 });
    }, { HOUR, ESCORT });
    await loadSlot(page, "slot_uptodate");
    const start = await getState(page);
    expect(start.signals.guards_hired).toBe(4);
    expect(start.relations["npc_guild_clerk:player_1"].score).toBeGreaterThanOrEqual(10);

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
    expect(back.signals.caravans_unguarded).toBe(1);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "길을 조심스레 간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 오래 못 구한 상단은 기다려 주지 않는다고");

    // staged for the fall: the last point of hp, no strength, and the first bad roll; saved and loaded with the button
    await page.evaluate(async ({ ESCORT }) => {
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
        const r = ESCORT.reduce((s, a) => step(s, a, worldData).state, t);
        if (r.pending?.kind === "newCharacter") { await idb.save("slot_doomed", t, { savedAt: 2 }); return; }
      }
      throw new Error("no bad roll");
    }, { ESCORT });
    await loadSlot(page, "slot_doomed");
    const doomed = await getState(page);
    expect(doomed.signals.guards_fallen ?? 0).toBe(0);

    // the escort ends him; the guild knew him, so the world counts it
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.pending).toEqual({ kind: "newCharacter" });
    expect(fell.signals.guards_fallen).toBe(1);

    // the successor: the walk to the town, then the next convoy
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    const hours = await page.evaluate(async ({ HOUR }) => {
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let n = 0;
      while (!wanted(window.__v2App.getState()) && n < 96) { window.__v2App.dispatch(HOUR); n += 1; }
      return n;
    }, { HOUR });
    const next = await getState(page);
    expect(next.player.actorId).toBe("player_2");
    expect(next.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(next.signals.guards_fallen).toBe(1);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("호위를 오래 못 구한 상단은 기다려 주지 않는다고");
    await expect(page.locator("#log")).toContainText("조합이 믿던 호위 하나가 길에서 돌아오지 못했다고");

    // the careful way, with a real button: a day on the road
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "길을 조심스레 간다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const end = await getState(page);
    expect(end.actors.player_2.hp.current).toBeGreaterThanOrEqual(next.actors.player_2.hp.current);

    await page.locator("#saveSlotInput").fill("slot_careful");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(3);
    await loadSlot(page, "slot_careful");
    expect(await getState(page)).toEqual(end);

    // the same end as a pure replay from the loaded staged start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start: doomed, actions: [...ESCORT, NEW_LIFE, ...SUCCESSOR_WALK, ...Array.from({ length: hours }, () => HOUR), ...ASK, ...CAREFUL] });
    expect(end).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
