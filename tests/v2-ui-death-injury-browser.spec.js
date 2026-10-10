// V2-Core-124 browser scenario (#304, Death & Injury, step 4 -- the three tiers together, across lives): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the castle
// town is dispatched; a known guard with a convoy waiting is staged (hp, strength, standing, wounds, kit, and the dice) through the
// real storage adapter and loaded with the app's button (data-world-death-injury.test.js stages the same); the rest is real buttons.
//   1. one guard through the tiers: a mild wound (the lead job still offered, a night closes it); a deep wound (the lead job gone,
//      the clerk says why and what the guild remembers, the careful way offered);
//   2. the choice the wound makes, on the very same saved dice: the ordinary escort ends the life, the careful way does not (the
//      wound is where it was, no hp lost);
//   3. the next life across the generations: born whole, the world's memory told by the clerk (the maiming and the fall), the
//      held share claimed, the dead guard's sword bought at half price, the careful way ridden.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-death-injury.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const CAREFUL = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort_careful")];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
// what the clerk and the road say (the pack's own words)
const SEES_DEEP = "저 상처는 하룻밤으로 낫지 않는다고";
const DEEP_CLOSES_LEAD = "몸이 나을 때까지 이끄는 일은 없다";
const WORD_MAIMED = "깊은 상처를 입고 돌아왔다고";
const OFFER_MAIMED = "깊은 상처를 안고 길에서 돌아왔으니";
const WORD_FELL = "길에서 돌아오지 못했다고";
const OFFER_FELL = "호위 하나가 길에서 돌아오지 못했으니";
const OFFER_ESTATE = "은화 일부를 조합이 맡아 두었고";
const OFFER_KIT = "반값에 내준다고 한다";
const CAREFUL_FAIL = "다친 사람 없이 강 건너 길목에 닿는다";
const NEW_LIFE = "새 캐릭터로 시작 (start_wanderer)";

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
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const ask = async (page) => { await clerk(page); await option(page, "일거리를 묻는다").click(); };
const lodge = (page) => act(page, "성읍에서 묵는다");
const me = (s) => s.actors[s.player.actorId];
const traitsOf = (s) => me(s).growth.growth_wanderer.traits ?? {};

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
// a known guard with a convoy waiting, staged and loaded with the app's button. `find` picks the dice: "wound" (the escort fails and
// the guard lives wounded), "fall" (the escort ends the life), "choice" (the ordinary escort ends the life and the careful way fails
// harmlessly -- the same dice, two roads)
async function stage(page, { hp, score = 10, money = 60, lead = false, steel = false, deep = false, maimed = 0, find, slot }) {
  await page.evaluate(async ({ HOUR, ESCORT, CAREFUL, hp, score, money, lead, steel, deep, maimed, find, slot }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const said = (s0, list) => { let s = s0; const out = []; for (const a of list) { const r = step(s, a, worldData); out.push(...r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)); s = r.state; } return { s, out }; };
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    const me = s.player.actorId;
    s.actors[me].money = money;
    s.relations = { ...s.relations, ["npc_guild_clerk:" + me]: { score } };
    if (maimed) s.signals = { ...s.signals, guards_maimed: maimed };
    for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
    const g = s.actors[me].growth.growth_wanderer;
    s.actors[me].hp.current = hp;
    g.stats.str = 0;
    g.skills = { ...g.skills, swordsmanship: 0 };
    g.resources.stamina.current = 6;
    if (lead) g.unlocks = { ...(g.unlocks ?? {}), unl_road_lead: true };
    if (deep) g.traits = { ...(g.traits ?? {}), road_wound: true, road_wound_deep: true };
    if (steel) s.actors[me].inventory = { ...(s.actors[me].inventory ?? {}), item_steel_sword: 1 };
    for (let k = 0; k < 120; k += 1) {
      const t = structuredClone(s);
      t.rng.cursor += k;
      const r = said(t, ESCORT);
      const fell = r.s.pending?.kind === "newCharacter";
      let hit = false;
      if (find === "wound") hit = !fell && r.s.pending === null && r.s.actors[me].growth.growth_wanderer.traits?.road_wound === true;
      else if (find === "fall") hit = fell;
      else if (find === "choice") hit = fell && said(structuredClone(t), CAREFUL).out.includes("txt_careful_fail");
      if (hit) { await idb.save(slot, t, { savedAt: 1 }); return; }
    }
    throw new Error("no such dice");
  }, { HOUR, ESCORT, CAREFUL, hp, score, money, lead, steel, deep, maimed, find, slot });
  await loadSlot(page, slot);
}
const toTown = async (page) => { await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN); };
const newGameInTown = async (page) => {
  await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
  await expect(page.locator("#game")).toBeVisible();
  await toTown(page);
};
// wait (an hour at a time, through the app) until a convoy wants a guard again
const untilConvoy = (page) => page.evaluate(async ({ HOUR }) => {
  const { evaluateCondition } = await import("/v2/core/rules.js");
  const { worldData } = await import("/v2/data/world.js");
  const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
  for (let h = 0; h < 96 && !open(window.__v2App.getState()); h += 1) window.__v2App.dispatch(HOUR);
}, { HOUR });

test.describe("V2 the three tiers together (Death & Injury, step 4)", () => {
  test("one guard through the tiers: a mild wound a night closes, a deep wound that shuts the lead job and is remembered", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    // tier 1 -- a mild wound: the lead job is still offered, a night closes it
    await stage(page, { hp: 10, lead: true, find: "wound", slot: "slot_tier1" });
    await clerk(page);
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible();
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("옆구리에 상처를 입었다");
    await move(page, "영주의 성읍");
    const scratched = await getState(page);
    expect(traitsOf(scratched).road_wound).toBe(true);
    expect(traitsOf(scratched).road_wound_deep).toBeUndefined();
    expect(scratched.signals.guards_maimed).toBeUndefined();
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible(); // a mild wound closes nothing
    await option(page, "일거리를 묻는다").click();
    await lodge(page);
    await expect(log(page)).toContainText("하룻밤 쉬고 나니 옆구리의 상처가 가라앉았다");
    expect(traitsOf(await getState(page))).toEqual({});

    // tier 2 -- the same guard, careless: out on the road at hp 5, and a deep wound
    await stage(page, { hp: 5, lead: true, find: "wound", slot: "slot_tier2" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText("상처가 깊다");
    await move(page, "영주의 성읍");
    const maimed = await getState(page);
    expect(me(maimed).hp.current).toBe(2);
    expect(traitsOf(maimed).road_wound_deep).toBe(true);
    expect(traitsOf(maimed).road_wound).toBe(true);
    expect(maimed.signals.guards_maimed).toBe(1); // the guild knew them: remembered
    await untilConvoy(page);
    await clerk(page);
    await expect(option(page, "상단 호위를 이끈다")).toHaveCount(0); // the lead job is shut
    await expect(option(page, "상단 호위를 맡는다")).toBeVisible(); // the ordinary escort is not
    await expect(option(page, "길을 조심스레 간다")).toBeVisible(); // and the world, remembering, offers the careful way
    await option(page, "일거리를 묻는다").click();
    for (const text of [SEES_DEEP, DEEP_CLOSES_LEAD, WORD_MAIMED, OFFER_MAIMED]) await expect(log(page)).toContainText(text);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the choice the wound makes, on the same saved dice: the ordinary escort ends the life, the careful way does not", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    await stage(page, { hp: 2, lead: true, steel: true, deep: true, maimed: 1, money: 200, find: "choice", slot: "slot_choice" });
    const start = await getState(page);
    expect(me(start).hp.current).toBe(2);
    expect(traitsOf(start).road_wound_deep).toBe(true);
    // road 1: the ordinary escort, ridden at hp 2 on a bad roll
    await clerk(page);
    await expect(option(page, "상단 호위를 이끈다")).toHaveCount(0);
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, NEW_LIFE)).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.guards_fallen).toBe(1);
    expect(fell.signals.guards_maimed).toBe(1); // the blow that kills is a fall; the earlier maiming stays one
    // road 2: the same saved state and dice, the careful way
    await loadSlot(page, "slot_choice");
    await clerk(page);
    await option(page, "길을 조심스레 간다").click();
    await expect(log(page)).toContainText(CAREFUL_FAIL);
    await expect(option(page, NEW_LIFE)).toHaveCount(0);
    const safe = await getState(page);
    expect(safe.pending ?? null).toBeNull();
    expect(me(safe).hp.current).toBe(2); // no hp lost
    expect(traitsOf(safe).road_wound_deep).toBe(true); // the wound is where it was
    expect(safe.signals.guards_fallen ?? 0).toBe(0);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the next life across the generations: born whole, told what the guild kept, claims the share, buys the sword, rides the careful way", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    await stage(page, { hp: 2, steel: true, deep: true, maimed: 1, money: 200, find: "fall", slot: "slot_doomed" });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(option(page, NEW_LIFE)).toBeVisible();
    const fell = await getState(page);
    expect(fell.signals.guards_fallen).toBe(1);
    expect(fell.signals.guards_maimed).toBe(1);
    expect(fell.signals.estate_held).toBe(12); // the guild holds a share of a purse of 200 (the cap)
    expect(fell.signals.kit_steel).toBe(1); // and the sword the guard carried

    // life 2 starts as a new game's first character does, and the world's numbers are as they were
    await option(page, NEW_LIFE).click();
    const born = await getState(page);
    expect(born.player.actorId).toBe("player_2");
    expect(traitsOf(born)).toEqual({});
    expect(born.relations["npc_guild_clerk:player_2"]).toBeUndefined();
    expect(me(born).inventory?.item_steel_sword).toBeUndefined();
    for (const key of ["guards_maimed", "guards_fallen", "estate_held", "kit_steel"]) expect(born.signals[key]).toBe(fell.signals[key]);
    expect(JSON.stringify(me(born))).not.toContain("maim");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), SUCCESSOR_WALK);

    // the successor finds it out: both memories, the share, the kit, the careful way
    await untilConvoy(page);
    await ask(page);
    for (const text of [WORD_MAIMED, WORD_FELL, OFFER_FELL, OFFER_ESTATE, OFFER_KIT]) await expect(log(page)).toContainText(text);
    const before = me(await getState(page)).money;
    await clerk(page);
    await option(page, "조합이 맡아 둔 몫을 찾아간다").click();
    await expect(log(page)).toContainText("서기는 맡아 둔 은화를 세어 건넨다.");
    expect(me(await getState(page)).money).toBe(before + 12);
    await clerk(page);
    await option(page, "쓰러진 호위가 남긴 강철 검을 받는다 (은화 12)").click();
    await expect(log(page)).toContainText("서기는 궤짝에서 기름 먹인 강철 검을 꺼내 건넨다.");
    const armed = await getState(page);
    expect(me(armed).inventory.item_steel_sword).toBe(1);
    expect(armed.signals.estate_held).toBe(0);
    expect(armed.signals.kit_steel).toBe(0);
    await clerk(page);
    await expect(option(page, "길을 조심스레 간다")).toBeVisible();
    await option(page, "길을 조심스레 간다").click();
    const rode = await getState(page);
    expect(rode.pending ?? null).toBeNull();
    expect(rode.signals.guards_maimed).toBe(1);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
