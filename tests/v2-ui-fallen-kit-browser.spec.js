// V2-Core-114 browser scenario (#279, succession legacy, step 1 -- the fallen's kit): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the
// castle town is dispatched; a guard the guild knows, in steel and mail with a convoy waiting, is staged on the first bad
// roll through the real storage adapter and loaded with the app's button (data-world-fallen-kit.test.js stages the same);
// the rest is real buttons: the escort ends them, the successor starts bare (the guild holds the steel and the mail,
// the successor cannot afford either yet and the clerk says there is a kit), silver is staged and loaded, the steel
// and then the mail are taken at half the merchant's price, saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-fallen-kit.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const TAKE_STEEL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_fallen_steel")];
const TAKE_MAIL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_fallen_mail")];
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

test.describe("V2 the fallen's kit (succession legacy)", () => {
  test("a known guard falls in steel and mail, the successor starts bare and finds the kit at half price -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // a guard the guild knows, in steel and mail, a convoy waiting, on the first bad roll; staged and loaded with the button
    await page.evaluate(async ({ HOUR, ESCORT }) => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      s.actors.player_1.money = 200;
      const buy = (id) => [{ type: "perform", actionId: "act_talk_town_merchant" }, { type: "choose", optionId: id }];
      s = run(s, [...buy("opt_town_merchant_buy_steel_sword"), ...buy("opt_town_merchant_buy_mail_shirt"), { type: "perform", actionId: "act_equip_steel_sword" }, { type: "perform", actionId: "act_equip_mail_shirt" }]);
      s.relations = { ...s.relations, "npc_guild_clerk:player_1": { score: 10 } };
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
    const doomed = await getState(page);
    expect(doomed.signals.kit_steel ?? 0).toBe(0);

    // the escort ends them; the guild keeps the steel and the mail
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (start_wanderer)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.kit_steel).toBe(1);
    expect(fell.signals.kit_mail).toBe(1);

    // the successor starts bare; the kit is there, but eleven silver buys neither
    await option(page, "새 캐릭터로 시작 (start_wanderer)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    const next = await getState(page);
    expect(next.player.actorId).toBe("player_2");
    expect(next.actors.player_2.inventory?.item_steel_sword).toBeUndefined();
    expect(next.actors.player_2.inventory?.item_mail_shirt).toBeUndefined();
    expect(next.actors.player_2.loadout ?? {}).toEqual({});
    expect(next.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(next.actors.player_2.money).toBeLessThan(12);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "쓰러진 호위가 남긴 강철 검을 받는다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("돌아오지 못한 호위가 지녔던 물건을 조합이 거두어 두었고");

    // silver, staged and loaded with the button; then the kit, with real buttons
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      state.actors.player_2.money = 40;
      await idb.save("slot_silver", state, { savedAt: 2 });
    });
    await loadSlot(page, "slot_silver");
    const start = await getState(page);
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "쓰러진 호위가 남긴 강철 검을 받는다 (은화 12)").click();
    await expect(page.locator("#log")).toContainText("은화 열두 닢을 받아 장부에 적는다.");
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "쓰러진 호위가 남긴 강철 검을 받는다")).toHaveCount(0);
    await option(page, "쓰러진 호위가 남긴 사슬 갑옷을 받는다 (은화 24)").click();
    await expect(page.locator("#log")).toContainText("은화 스물네 닢을 받아 장부에 적는다.");
    const end = await getState(page);
    expect(end.actors.player_2.money).toBe(4);
    expect(end.actors.player_2.inventory.item_steel_sword).toBe(1);
    expect(end.actors.player_2.inventory.item_mail_shirt).toBe(1);
    expect(end.signals.kit_steel).toBe(0);
    expect(end.signals.kit_mail).toBe(0);

    await page.locator("#saveSlotInput").fill("slot_kit");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(3);
    await loadSlot(page, "slot_kit");
    expect(await getState(page)).toEqual(end);

    // the same end as a pure replay from the loaded staged start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [...TAKE_STEEL, ...TAKE_MAIL] });
    expect(end).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
