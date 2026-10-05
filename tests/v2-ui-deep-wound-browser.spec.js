// V2-Core-121 browser scenario (#298, Death & Injury, step 1 -- the mild wound heals, the deep wound): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the castle
// town is dispatched; a guard with a convoy waiting is staged (hp, strength, and the first bad roll) through the real storage
// adapter and loaded with the app's button (data-world-deep-wound.test.js stages the same); the rest is real buttons.
//   1. a mild wound: a failed escort from a healthy hp leaves a mild wound; a night's lodging closes it and says so;
//   2. a deep wound: a failed escort that leaves hp at 2 or below -- the lead job (open to this guard) is no longer offered, the clerk
//      says why, a night heals only half and the wound stays; four nights close it (hp full again) and the lead job is back;
//   3. an old save (a mild wound as the previous pack wrote it, hp low) loaded through the app's button: the next lodging closes it,
//      nothing deep is made for the past.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-deep-wound.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
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
const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

// a guard at hp `hp` with a convoy waiting, weak enough that the first bad roll fails; staged and loaded with the app's button
async function stageGuard(page, { hp, lead, slot, mild }) {
  await page.evaluate(async ({ HOUR, ESCORT, hp, lead, slot, mild }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    s.actors.player_1.money = 60;
    for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
    const g = s.actors.player_1.growth.growth_wanderer;
    s.actors.player_1.hp.current = hp;
    g.stats.str = 0;
    g.resources.stamina.current = 6;
    if (lead) g.unlocks = { ...(g.unlocks ?? {}), unl_road_lead: true };
    if (mild) g.traits = { ...(g.traits ?? {}), road_wound: true };
    if (slot === "slot_old") { await idb.save(slot, s, { savedAt: 1 }); return; }
    for (let k = 0; k < 60; k += 1) {
      const t = structuredClone(s);
      t.rng.cursor += k;
      const r = run(t, ESCORT);
      const wounded = r.actors.player_1.growth.growth_wanderer.traits?.road_wound === true;
      if (wounded && r.pending === null) { await idb.save(slot, t, { savedAt: 1 }); return; }
    }
    throw new Error("no bad roll");
  }, { HOUR, ESCORT, hp, lead, slot, mild });
  await loadSlot(page, slot);
}
const toTown = async (page) => { await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN); };
const escort = async (page, label = "상단 호위를 맡는다") => {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, label).click();
};
const lodge = async (page) => { await act(page, "성읍에서 묵는다"); };
// wait (an hour at a time, through the app) until a convoy wants a guard again
const untilConvoy = (page) => page.evaluate(async ({ HOUR }) => {
  const { evaluateCondition } = await import("/v2/core/rules.js");
  const { worldData } = await import("/v2/data/world.js");
  const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
  for (let h = 0; h < 96 && !open(window.__v2App.getState()); h += 1) window.__v2App.dispatch(HOUR);
}, { HOUR });
const traitsOf = async (page) => (await getState(page)).actors.player_1.growth.growth_wanderer.traits ?? {};

test.describe("V2 the mild wound heals, the deep wound (Death & Injury, step 1)", () => {
  test("a mild wound: a failed escort leaves it, a night closes it", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await toTown(page);
    await stageGuard(page, { hp: 10, lead: false, slot: "slot_mild" });
    await escort(page);
    await expect(page.locator("#log")).toContainText("옆구리에 상처를 입었다");
    await move(page, "영주의 성읍");
    expect((await traitsOf(page)).road_wound).toBe(true);
    expect((await traitsOf(page)).road_wound_deep).toBeUndefined();
    await lodge(page);
    await expect(page.locator("#log")).toContainText("하룻밤 쉬고 나니 옆구리의 상처가 가라앉았다");
    expect((await traitsOf(page)).road_wound).toBeUndefined();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a deep wound: no lead job, the clerk says why, a night heals half, four nights close it and the job is back -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await toTown(page);
    await stageGuard(page, { hp: 5, lead: true, slot: "slot_deep" });
    const start = await getState(page);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible(); // whole: the lead job is open
    await option(page, "상단 호위를 맡는다").click();
    await expect(page.locator("#log")).toContainText("상처가 깊다");
    await move(page, "영주의 성읍");
    const deep = await getState(page);
    expect(deep.actors.player_1.hp.current).toBe(2);
    expect(deep.actors.player_1.growth.growth_wanderer.traits.road_wound_deep).toBe(true);
    expect(deep.actors.player_1.growth.growth_wanderer.traits.road_wound).toBe(true);

    // the lead job is closed, the ordinary escort is not; the clerk says what he sees (a convoy waits again)
    await untilConvoy(page);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 이끈다")).toHaveCount(0);
    await expect(option(page, "상단 호위를 맡는다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("저 상처는 하룻밤으로 낫지 않는다고");
    await expect(page.locator("#log")).toContainText("몸이 나을 때까지 이끄는 일은 없다");

    // a night heals half, and the wound stays
    await lodge(page);
    await expect(page.locator("#log")).toContainText("깊은 상처는 쉬어도 더디게 아문다");
    const night1 = await getState(page);
    expect(night1.actors.player_1.hp.current).toBe(4);
    expect(night1.actors.player_1.growth.growth_wanderer.traits.road_wound_deep).toBe(true);
    // three more: hp back to full, and it closes
    for (let i = 0; i < 3; i += 1) await lodge(page);
    await expect(page.locator("#log")).toContainText("며칠을 쉰 끝에 깊은 상처가 마침내 아물었다");
    const closed = await getState(page);
    expect(closed.actors.player_1.hp.current).toBe(10);
    expect(closed.actors.player_1.growth.growth_wanderer.traits.road_wound_deep).toBeUndefined();
    expect(closed.actors.player_1.growth.growth_wanderer.traits.road_wound).toBeUndefined();

    await page.locator("#saveSlotInput").fill("slot_healed");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    await loadSlot(page, "slot_healed");
    const saved = await getState(page);
    expect(saved).toEqual(closed);

    // the same end as a pure replay from the loaded staged start
    const replayed = await page.evaluate(async ({ start, actions }) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      return actions.reduce((s, a) => step(s, a, worldData).state, start);
    }, { start, actions: [...ESCORT, M("loc_castle_town"), P("act_lodge_castle_town"), P("act_lodge_castle_town"), P("act_lodge_castle_town"), P("act_lodge_castle_town")] });
    // the clerk talks in between (the dialogue changes nothing in the character's wounds): compare what the wounds decide
    expect(replayed.actors.player_1.growth.growth_wanderer.traits ?? {}).toEqual(saved.actors.player_1.growth.growth_wanderer.traits ?? {});
    expect(replayed.actors.player_1.hp).toEqual(saved.actors.player_1.hp);

    // the lead job is back (the next convoy)
    await untilConvoy(page);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("an old save (a mild wound as the previous pack wrote it) loaded through the app: the next lodging closes it, nothing deep is made for the past", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await toTown(page);
    await stageGuard(page, { hp: 2, lead: false, slot: "slot_old", mild: true });
    const old = await getState(page);
    expect(old.actors.player_1.growth.growth_wanderer.traits).toEqual({ road_wound: true });
    await lodge(page);
    await expect(page.locator("#log")).toContainText("하룻밤 쉬고 나니 옆구리의 상처가 가라앉았다");
    const after = await getState(page);
    expect(after.actors.player_1.growth.growth_wanderer.traits ?? {}).toEqual({});
    expect(after.actors.player_1.hp.current).toBe(6);
    expect(after.signals.guards_maimed).toBeUndefined();
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
