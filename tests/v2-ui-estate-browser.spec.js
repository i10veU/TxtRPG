// V2-Core-114 browser scenario (#279, succession legacy, step 1 -- the fallen's kit): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the
// castle town is dispatched; a guard the guild knows, in steel and mail with a convoy waiting, is staged on the first bad
// roll through the real storage adapter and loaded with the app's button (data-world-fallen-kit.test.js stages the same);
// the rest is real buttons: the escort ends them, the successor starts bare (the guild holds the steel and the mail,
// the successor cannot afford either yet and the clerk says there is a kit), silver is staged and loaded, the steel
// and then the mail are taken at half the merchant's price, saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-estate.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const CLAIM = [P("act_talk_guild_clerk"), C("opt_guild_clerk_estate")];
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

// a guard with a purse and a convoy waiting, on the first bad roll; staged and loaded with the app's button
async function stageDoomed(page, { money, score, slot }) {
  await page.evaluate(async ({ HOUR, ESCORT, money, score, slot }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    s.actors.player_1.money = money;
    s.relations = { ...s.relations, "npc_guild_clerk:player_1": { score } };
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
      if (r.pending?.kind === "newCharacter") { await idb.save(slot, t, { savedAt: 1 }); return; }
    }
    throw new Error("no bad roll");
  }, { HOUR, ESCORT, money, score, slot });
  await loadSlot(page, slot);
}

test.describe("V2 the guild holds a fallen guard's share (succession legacy 2)", () => {
  test("a known guard falls, the guild holds a share, the successor starts as before and claims it -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await stageDoomed(page, { money: 100, score: 10, slot: "slot_doomed" });
    const doomed = await getState(page);
    expect(doomed.signals.estate_held ?? 0).toBe(0);

    // the escort ends them; the guild holds a share of the purse, bounded
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.estate_held).toBe(12);
    expect(fell.signals.guards_fallen).toBe(1);

    // the successor starts as before: nothing handed over
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    const next = await getState(page);
    expect(next.player.actorId).toBe("player_2");
    expect(next.actors.player_2.money).toBeLessThan(15);
    expect(next.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(next.signals.estate_held).toBe(12);

    // the clerk says the guild holds a share; the claim is a real button
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("은화 일부를 조합이 맡아 두었고, 이어 가는 이가 찾아오면 내준다고 한다.");
    const start = await getState(page);
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "조합이 맡아 둔 몫을 찾아간다").click();
    await expect(page.locator("#log")).toContainText("서기는 맡아 둔 은화를 세어 건넨다.");
    const end = await getState(page);
    expect(end.actors.player_2.money).toBe(start.actors.player_2.money + 12);
    expect(end.signals.estate_held).toBe(0);
    expect(end.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "조합이 맡아 둔 몫을 찾아간다")).toHaveCount(0);

    await page.locator("#saveSlotInput").fill("slot_estate");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    await loadSlot(page, "slot_estate");
    const saved = await getState(page);

    // the same end as a pure replay from the loaded staged start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start: doomed, actions: [...ESCORT, { type: "startCharacter", templateId: "start_wanderer" }, ...SUCCESSOR_WALK, ...ASK, ...CLAIM, P("act_talk_guild_clerk")] });
    expect(saved).toEqual(replayed);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a guard the guild did not know leaves nothing: no share, no clerk's word, no claim", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await stageDoomed(page, { money: 100, score: 5, slot: "slot_unknown" });
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.estate_held ?? 0).toBe(0);
    expect(fell.signals.guards_fallen ?? 0).toBe(0);
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "조합이 맡아 둔 몫을 찾아간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).not.toContainText("은화 일부를 조합이 맡아 두었고");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
