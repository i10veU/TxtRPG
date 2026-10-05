// V2-Core-120 browser scenario (#295, succession legacy 2, step 3 -- generations in the real app, old saves): the real entry
// point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack.
//   1. three lives with real buttons: a known guard falls (the guild holds 12 of a purse of 100); the second life finds and
//      claims it, then -- known in turn, with a purse of its own -- falls: the guild holds a share again, not stacked on the
//      one already paid (12, not 24); the third life claims it. Each successor starts as a new game's first character
//      does, apart from the Canon's 3 silver (no standing, no practice, no belongings); the world's fall count is 2;
//   2. an OLD save (a known guard's fall already counted before the share existed: no `estate_held`) loaded through the
//      app's button: the successor starts, walks to the town, and the clerk holds nothing and says nothing of it; nothing
//      is made for a fall that was already past.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-estate.test.js, data-world-generations.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
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

// a guard (player_<n>) with a purse and a convoy waiting, on the first bad roll; staged and loaded with the app's button
async function stageDoomed(page, { actor, money, score, slot }) {
  await page.evaluate(async ({ HOUR, ESCORT, actor, money, score, slot }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    s.actors[actor].money = money;
    s.relations = { ...s.relations, ["npc_guild_clerk:" + actor]: { score } };
    for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
    const g = s.actors[actor].growth.growth_wanderer;
    s.actors[actor].hp.current = 1;
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
  }, { HOUR, ESCORT, actor, money, score, slot });
  await loadSlot(page, slot);
}
const startNext = async (page) => {
  await option(page, "새 캐릭터로 시작 (start_wanderer)").click();
  await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);
};
const fall = async (page) => {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "상단 호위를 맡는다").click();
  await expect(option(page, "새 캐릭터로 시작 (start_wanderer)")).toBeVisible();
};
const claim = async (page) => {
  await act(page, "상단 조합의 서기와 대화");
  await option(page, "조합이 맡아 둔 몫을 찾아간다").click();
  await expect(page.locator("#log")).toContainText("서기는 맡아 둔 은화를 세어 건넨다.");
};

test.describe("V2 generations in the real app (succession legacy 2)", () => {
  test("three lives: the share is found by the second, held again when the second falls (not stacked), found by the third", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // life 1: known, a purse of 100, falls
    await stageDoomed(page, { actor: "player_1", money: 100, score: 10, slot: "slot_g1" });
    await fall(page);
    const f1 = await getState(page);
    expect(f1.signals.estate_held).toBe(12);
    expect(f1.signals.guards_fallen).toBe(1);

    // life 2 starts as a new game's first character does, finds the share, claims it
    await startNext(page);
    const born2 = await getState(page);
    expect(born2.player.actorId).toBe("player_2");
    expect(born2.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(born2.actors.player_2.growth.growth_wanderer.proficiency?.combat ?? 0).toBe(0);
    expect(born2.actors.player_2.inventory?.item_steel_sword).toBeUndefined();
    const before = born2.actors.player_2.money;
    await claim(page);
    const c2 = await getState(page);
    expect(c2.actors.player_2.money).toBe(before + 12);
    expect(c2.signals.estate_held).toBe(0);

    // life 2, known in turn, with a purse of its own, falls: the guild holds a share again -- 12, not 24
    await stageDoomed(page, { actor: "player_2", money: 100, score: 10, slot: "slot_g2" });
    await fall(page);
    const f2 = await getState(page);
    expect(f2.signals.estate_held).toBe(12);
    expect(f2.signals.guards_fallen).toBe(2);

    // life 3 finds it
    await startNext(page);
    const born3 = await getState(page);
    expect(born3.player.actorId).toBe("player_3");
    expect(born3.relations["npc_guild_clerk:player_3"]).toBeUndefined();
    const before3 = born3.actors.player_3.money;
    await claim(page);
    const c3 = await getState(page);
    expect(c3.actors.player_3.money).toBe(before3 + 12);
    expect(c3.signals.estate_held).toBe(0);
    expect(c3.signals.guards_fallen).toBe(2);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("an old save (a fall already counted, no share) loaded through the app: nothing is made for the past", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    await stageDoomed(page, { actor: "player_1", money: 100, score: 10, slot: "slot_tmp" });
    await fall(page);
    // the save as it was before the share existed: the fall counted, nothing held, waiting for a new character
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const old = structuredClone(window.__v2App.getState());
      delete old.signals.estate_held;
      await idb.save("slot_old", old, { savedAt: 2 });
    });
    await loadSlot(page, "slot_old");
    const loaded = await getState(page);
    expect(loaded.pending).toEqual({ kind: "newCharacter" });
    expect(loaded.signals.guards_fallen).toBe(1);
    expect(loaded.signals.estate_held).toBeUndefined();
    await startNext(page);
    const next = await getState(page);
    expect(next.signals.estate_held ?? 0).toBe(0);
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "조합이 맡아 둔 몫을 찾아간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).not.toContainText("은화 일부를 조합이 맡아 두었고");
    await expect(page.locator("#log")).toContainText("조합이 믿던 호위 하나가 길에서 돌아오지 못했다고");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
