// V2-Core-113 browser scenario (#272, RPG Depth 4, step 3 -- a geared career, integrated): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the
// castle town is dispatched; the career up to the moment the lead's unlock and the steel sword are both held -- eleven
// convoys, the steel bought on the fifth with the silver earned, strong and rested for each (data-world-geared-career.test.js
// runs the same) -- is saved through the real storage adapter and loaded with the app's button; the rest is real buttons:
// the clerk's word about a hard convoy, the mail bought and worn (silver staged to its price), the hard convoy; the fall is
// staged and loaded; the successor, bare: the merchant's steel out of reach, the clerk offering the careful way and not the
// hard one; saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-geared-career.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const LEAD = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_lead")];
const DANGER = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_danger")];
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
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
const waitForConvoy = (page) => page.evaluate(async ({ HOUR }) => {
  const { evaluateCondition } = await import("/v2/core/rules.js");
  const { worldData } = await import("/v2/data/world.js");
  const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
  let n = 0;
  while (!wanted(window.__v2App.getState()) && n < 96) { window.__v2App.dispatch(HOUR); n += 1; }
  return n;
}, { HOUR });

test.describe("V2 a geared career (RPG Depth 4, integrated)", () => {
  test("silver to steel, the hard convoy, the fall, the bare successor -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // the career, staged strong and rested for each convoy: the steel on the fifth, the unlock and the offer on the eleventh
    await page.evaluate(async ({ HOUR, ESCORT, LEAD }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const opt = (id) => worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id);
      const open = (s, o) => evaluateCondition(o.requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      for (let job = 1; job <= 30; job += 1) {
        for (let h = 0; h < 96 && !open(s, opt("opt_guild_clerk_escort")); h += 1) s = run(s, [HOUR]);
        const g = () => s.actors.player_1.growth.growth_wanderer;
        g().stats.str = 30;
        g().resources.stamina.current = 6;
        s.actors.player_1.hp.current = s.actors.player_1.hp.max;
        if (!s.actors.player_1.inventory?.item_steel_sword && s.actors.player_1.money >= 24) {
          s = run(s, [{ type: "perform", actionId: "act_talk_town_merchant" }, { type: "choose", optionId: "opt_town_merchant_buy_steel_sword" }, { type: "perform", actionId: "act_equip_steel_sword" }]);
        }
        if (open(s, opt("opt_guild_clerk_escort_danger"))) break;
        s = run(run(s, g().unlocks?.unl_road_lead ? LEAD : ESCORT), [{ type: "move", to: "loc_castle_town" }]);
      }
      s.actors.player_1.money = 48; // the mail's price, staged (the steel was bought with earned silver)
      await idb.save("slot_career", s, { savedAt: 1 });
    }, { HOUR, ESCORT, LEAD });
    await loadSlot(page, "slot_career");
    const career = await getState(page);
    expect(career.actors.player_1.loadout).toEqual({ hand: "item_steel_sword" });
    expect(career.actors.player_1.growth.growth_wanderer.unlocks.unl_road_lead).toBe(true);

    // the clerk's word about a hard convoy; the mail, bought and worn with real buttons
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "위험한 상단 호위를 이끈다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("강철을 걸친 이만 부탁할 수 있는 상단이");
    await act(page, "성읍의 상인과 대화");
    await option(page, "사슬 갑옷을 산다 (은화 48)").click();
    await act(page, "사슬 갑옷을 입는다");
    expect((await getState(page)).actors.player_1.loadout).toEqual({ hand: "item_steel_sword", body: "item_mail_shirt" });

    // the hard convoy, with a real button
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "위험한 상단 호위를 이끈다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    expect((await getState(page)).actors.player_1.money).toBeGreaterThanOrEqual(2);

    // the fall, staged: back in the town, the last hp, no strength, and the first bad roll; loaded with the button
    await page.evaluate(async ({ HOUR, DANGER }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let state = run(structuredClone(window.__v2App.getState()), [{ type: "move", to: "loc_castle_town" }]);
      for (let h = 0; h < 96 && !open(state); h += 1) state = run(state, [HOUR]);
      const g = state.actors.player_1.growth.growth_wanderer;
      state.actors.player_1.hp.current = 1;
      g.stats.str = 0;
      g.skills = { ...g.skills, swordsmanship: 0 };
      g.resources.stamina.current = 6;
      for (let k = 0; k < 60; k += 1) {
        const t = structuredClone(state);
        t.rng.cursor += k;
        const r = DANGER.reduce((s, a) => step(s, a, worldData).state, t);
        if (r.pending?.kind === "newCharacter") { await idb.save("slot_doomed", t, { savedAt: 2 }); return; }
      }
      throw new Error("no bad roll");
    }, { HOUR, DANGER });
    await loadSlot(page, "slot_doomed");
    const doomed = await getState(page);
    expect(doomed.signals.guards_fallen ?? 0).toBe(0);

    await act(page, "상단 조합의 서기와 대화");
    await option(page, "위험한 상단 호위를 이끈다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.pending).toEqual({ kind: "newCharacter" });
    expect(fell.signals.guards_fallen).toBe(1);

    // the successor: bare; the same steel at the same price, out of reach; the careful way, not the hard one
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    const hours = await waitForConvoy(page);
    const next = await getState(page);
    expect(next.player.actorId).toBe("player_2");
    expect(next.actors.player_2.loadout ?? {}).toEqual({});
    expect(next.actors.player_2.inventory?.item_steel_sword).toBeUndefined();
    expect(next.actors.player_2.inventory?.item_mail_shirt).toBeUndefined();
    expect(next.actors.player_2.growth.growth_wanderer.unlocks?.unl_road_lead).toBeUndefined();
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await expect(option(page, "위험한 상단 호위를 이끈다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await act(page, "성읍의 상인과 대화");
    await expect(option(page, "강철 검을 산다")).toHaveCount(0);
    await expect(option(page, "사슬 갑옷을 산다")).toHaveCount(0);
    await option(page, "강 남쪽 물건에 대해 묻는다").click();

    await page.locator("#saveSlotInput").fill("slot_successor");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(3);
    const saved = await getState(page);
    await loadSlot(page, "slot_successor");
    expect(await getState(page)).toEqual(saved);

    // the same end as a pure replay from the loaded staged start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, {
      start: doomed,
      actions: [...DANGER, NEW_LIFE, ...SUCCESSOR_WALK, ...Array.from({ length: hours }, () => HOUR),
        P("act_talk_guild_clerk"), C("opt_guild_clerk_ask"), P("act_talk_town_merchant"), C("opt_town_merchant_ask")]
    });
    expect(saved).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
