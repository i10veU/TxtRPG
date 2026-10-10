// V2-Core-123 browser scenario (#302, Death & Injury, step 3 -- the world remembers the maimed): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the castle
// town is dispatched; a guard with a convoy waiting is staged (hp, strength, standing with the guild, and the first bad roll)
// through the real storage adapter and loaded with the app's button (data-world-guards-maimed.test.js stages the same); the rest
// is real buttons.
//   1. a known guard (standing 10) comes back from a failed escort with a deep wound: the guild remembers it (a world number, not
//      a state of the guard). With no convoy waiting the clerk still says it and offers nothing; with one waiting the careful way
//      -- the world-memory job, an easier check and a failure that costs nothing -- is offered, with its own word, and taken;
//   2. not remembered: a guard the guild did not know who comes back with a deep wound, a known guard who comes back with a mild
//      one -- no number, no word from the clerk, no careful way;
//   3. a successor: the same guard later falls; the next life starts whole (no wound, no standing, nothing of it on the actor),
//      does not carry the number, and finds it out -- the clerk tells it, the careful way is offered.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-guards-maimed.test.js
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
// what the clerk says (the world's words, as the pack writes them)
const WORD_MAIMED = "깊은 상처를 입고 돌아왔다고";
const OFFER_MAIMED = "깊은 상처를 안고 길에서 돌아왔으니";
const WORD_FELL = "길에서 돌아오지 못했다고";
const OFFER_FELL = "호위 하나가 길에서 돌아오지 못했으니";

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
const log = (page) => page.locator("#log");

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

// a guard with a convoy waiting, `hp` and `score` (standing with the clerk), weak enough that the first bad roll fails; `outcome`
// is what that roll must be: "wound" (a wound, alive) or "fall" (the end of the life). Staged and loaded with the app's button
async function stageGuard(page, { hp, score, slot, outcome }) {
  await page.evaluate(async ({ HOUR, ESCORT, hp, score, slot, outcome }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    const me = s.player.actorId;
    s.actors[me].money = 60;
    s.relations = { ...s.relations, ["npc_guild_clerk:" + me]: { score } };
    for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
    const g = s.actors[me].growth.growth_wanderer;
    s.actors[me].hp.current = hp;
    g.stats.str = 0;
    g.skills = { ...g.skills, swordsmanship: 0 };
    g.resources.stamina.current = 6;
    for (let k = 0; k < 60; k += 1) {
      const t = structuredClone(s);
      t.rng.cursor += k;
      const r = run(t, ESCORT);
      const hit = outcome === "fall" ? r.pending?.kind === "newCharacter" : r.actors[me].growth.growth_wanderer.traits?.road_wound === true && r.pending === null;
      if (hit) { await idb.save(slot, t, { savedAt: 1 }); return; }
    }
    throw new Error("no bad roll");
  }, { HOUR, ESCORT, hp, score, slot, outcome });
  await loadSlot(page, slot);
}
const toTown = async (page) => { await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN); };
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const ask = async (page) => { await clerk(page); await option(page, "일거리를 묻는다").click(); };
// wait (an hour at a time, through the app) until a convoy wants a guard again
const untilConvoy = (page) => page.evaluate(async ({ HOUR }) => {
  const { evaluateCondition } = await import("/v2/core/rules.js");
  const { worldData } = await import("/v2/data/world.js");
  const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
  for (let h = 0; h < 96 && !open(window.__v2App.getState()); h += 1) window.__v2App.dispatch(HOUR);
}, { HOUR });
const me = (s) => s.actors[s.player.actorId];
const traitsOf = (s) => me(s).growth.growth_wanderer.traits ?? {};
const newGameInTown = async (page) => {
  await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
  await expect(page.locator("#game")).toBeVisible();
  await toTown(page);
};

test.describe("V2 the world remembers the maimed (Death & Injury, step 3)", () => {
  test("a known guard comes back with a deep wound: remembered, said by the clerk, and the careful way is offered", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    expect((await getState(page)).signals.guards_maimed).toBeUndefined();
    await stageGuard(page, { hp: 5, score: 10, slot: "slot_maimed", outcome: "wound" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("상처가 깊다");
    await move(page, "영주의 성읍");
    const hurt = await getState(page);
    expect(traitsOf(hurt).road_wound_deep).toBe(true);
    expect(hurt.signals.guards_maimed).toBe(1);
    expect(hurt.signals.guards_fallen ?? 0).toBe(0);

    // no convoy waits right after one: the clerk says what the guild remembers, and has nothing to offer
    await clerk(page);
    await expect(option(page, "상단 호위를 맡는다")).toHaveCount(0);
    await expect(option(page, "길을 조심스레 간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).toContainText(WORD_MAIMED);
    await expect(log(page)).not.toContainText(OFFER_MAIMED);
    await expect(log(page)).not.toContainText(WORD_FELL);

    // a convoy waits: the careful way is offered, in the maiming's words (no fall is remembered), and taken
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).toContainText(OFFER_MAIMED);
    await expect(log(page)).not.toContainText(OFFER_FELL);
    const before = await getState(page);
    await clerk(page);
    await option(page, "길을 조심스레 간다").click();
    const after = await getState(page);
    expect(after.pending ?? null).toBeNull();
    expect(me(after).hp.current).toBeGreaterThanOrEqual(me(before).hp.current); // the careful way costs no hp
    expect(after.signals.guards_maimed).toBe(1); // remembered, not added to, not spent
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("not remembered: a guard the guild did not know, and a mild wound -- no number, no word, no careful way", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    // a stranger (standing 5) comes back with a deep wound
    await newGameInTown(page);
    await stageGuard(page, { hp: 5, score: 5, slot: "slot_stranger", outcome: "wound" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("상처가 깊다");
    await move(page, "영주의 성읍");
    const stranger = await getState(page);
    expect(traitsOf(stranger).road_wound_deep).toBe(true);
    expect(stranger.signals.guards_maimed).toBeUndefined();
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "상단 호위를 맡는다")).toBeVisible();
    await expect(option(page, "길을 조심스레 간다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).not.toContainText(WORD_MAIMED);
    await expect(log(page)).not.toContainText(OFFER_MAIMED);

    // a known guard (standing 10) comes back with a mild wound only
    await newGameInTown(page);
    await stageGuard(page, { hp: 10, score: 10, slot: "slot_mild", outcome: "wound" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("옆구리에 상처를 입었다");
    await move(page, "영주의 성읍");
    const mildOnly = await getState(page);
    expect(traitsOf(mildOnly).road_wound).toBe(true);
    expect(traitsOf(mildOnly).road_wound_deep).toBeUndefined();
    expect(mildOnly.signals.guards_maimed).toBeUndefined();
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "길을 조심스레 간다")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a successor: starts whole, does not carry the number, and finds it out -- the clerk tells it and the careful way is offered", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    // life 1: a known guard comes back with a deep wound ...
    await stageGuard(page, { hp: 5, score: 10, slot: "slot_life1", outcome: "wound" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("상처가 깊다");
    await move(page, "영주의 성읍");
    expect((await getState(page)).signals.guards_maimed).toBe(1);
    // ... and, still unhealed, goes out on the road at hp 1 and does not come back
    await stageGuard(page, { hp: 1, score: 10, slot: "slot_fall", outcome: "fall" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.guards_fallen).toBe(1);
    expect(fell.signals.guards_maimed).toBe(1); // the fall is a fall; the earlier maiming stays remembered, not added to

    // life 2: a new game's first character, apart from nothing of life 1's wound
    await option(page, "새 캐릭터로 시작 (떠돌이)").click();
    const born = await getState(page);
    expect(born.player.actorId).toBe("player_2");
    expect(traitsOf(born).road_wound).toBeUndefined();
    expect(traitsOf(born).road_wound_deep).toBeUndefined();
    expect(born.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(born.signals.guards_maimed).toBe(1); // the world's number, as it was
    expect(JSON.stringify(me(born))).not.toContain("maimed");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);

    // the successor finds it out: the clerk tells both memories, and offers the careful way once (the fall's words)
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).toContainText(WORD_MAIMED);
    await expect(log(page)).toContainText(WORD_FELL);
    await expect(log(page)).toContainText(OFFER_FELL);
    await expect(log(page)).not.toContainText(OFFER_MAIMED);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
