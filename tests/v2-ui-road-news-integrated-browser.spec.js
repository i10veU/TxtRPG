// V2-Core-128 browser scenario (#313, #306 Road News step 3 -- integration and regression): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. Unlike the step 1a/1b scenarios, the road is
// never staged: every condition is the one the world's own course gives (data-world-road-news-integrated.test.js walks the same
// world). Only the guard is staged (known to the guild, the lead, steel), through the real storage adapter and the app's button.
//   1. the loop through the real UI: the guard asks and the list shows the ledger's word for today; days pass, the road moves on
//      and the word only grows older; asked again, the new word is today's and the old one is marked as replaced; on the
//      course's first dangerous road the clerk's choice is open with the road's words first, the guard hears "dangerous" and
//      leads the ordinary convoy (the danger job on offer beside it) -- and sees the road for themselves;
//   2. a real save from before Road News (tests/v2/fixtures/save-before-road-news.json), loaded with the app's button: the road
//      turns at the next step, the clerk gives an unknown guard the yard's talk, and the word survives save -> reload -> load.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";
const OLD_SAVE = JSON.parse(fs.readFileSync(path.join(__dirname, "v2", "fixtures", "save-before-road-news.json"), "utf8"));
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const LEDGER = "상단 조합의 서기에게 들음 · 믿을 만함";

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
const log = (page) => page.locator("#log");
const knowledge = (page) => page.locator("#knowledge li");
const word = (page, text) => page.locator("#knowledge li", { hasText: text });
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const ask = async (page) => { await clerk(page); await option(page, "일거리를 묻는다").click(); };
const me = (s) => s.actors[s.player.actorId];

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
// time passes through the app, an hour (or a day) at a time, until the world's road and the clerk's convoy are as asked
async function waitUntil(page, { changedFrom, trouble, convoy = false, unit = 60 }) {
  await page.evaluate(async ({ changedFrom, trouble, convoy, unit }) => {
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    const done = (s) => (changedFrom === undefined || s.facts.fact_road_north?.value !== changedFrom)
      && (trouble === undefined || (s.signals.road_trouble ?? 0) === trouble) && (!convoy || open(s));
    for (let i = 0; i < 24 * 120 && !done(window.__v2App.getState()); i += 1) window.__v2App.dispatch({ type: "wait", minutes: unit });
    if (!done(window.__v2App.getState())) throw new Error("the road never came to that");
  }, { changedFrom, trouble, convoy, unit });
}

test.describe("V2 road news, integrated (Road News, step 3)", () => {
  test("the world's own road through the real UI: today's word, an older word, a newer one, and the choice on a dangerous road", async ({ page }) => {
    test.setTimeout(120000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    // the guard only: known to the guild, the lead, steel in hand -- the road is the world's
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      let s = structuredClone(window.__v2App.getState());
      const id = s.player.actorId;
      const g = s.actors[id].growth.growth_wanderer;
      s.actors[id].money = 100;
      g.stats.str = 14;
      g.unlocks = { ...(g.unlocks ?? {}), unl_road_lead: true };
      s.relations = { ...s.relations, ["npc_guild_clerk:" + id]: { score: 30 } };
      for (const a of [{ type: "perform", actionId: "act_talk_town_merchant" }, { type: "choose", optionId: "opt_town_merchant_buy_steel_sword" }, { type: "perform", actionId: "act_equip_steel_sword" }]) s = step(s, a, worldData).state;
      await idb.save("slot_road_guard", s, { savedAt: 1 });
    });
    await loadSlot(page, "slot_road_guard");
    const start = await getState(page);
    const first = start.facts.fact_road_north.value;
    expect(first).toBe("quiet"); // the course's first place in this world

    // asked: the ledger's word, today's
    await ask(page);
    await expect(log(page)).toContainText("요즘 강나루 길이 조용하다고");
    await expect(word(page, "강나루 길이 조용하다")).toHaveText(`강나루 길이 조용하다 · ${LEDGER} · 오늘`);

    // the road moves on; the word only grows older (nothing on screen says the road has changed)
    await waitUntil(page, { changedFrom: first, unit: 1440 });
    const moved = await getState(page);
    expect(moved.facts.fact_road_north.value).not.toBe(first);
    await expect(word(page, "강나루 길이 조용하다")).toHaveText(new RegExp(`^강나루 길이 조용하다 · ${LEDGER} · \\d+일 전$`));
    await expect(word(page, "강나루 길이 조용하다")).not.toHaveAttribute("data-stale", "true");

    // asked again: the road as it is now is today's word; the old one is marked as replaced
    await ask(page);
    const now = { uneasy: "강나루 길이 어수선하다", dangerous: "강나루 길이 험하다" }[moved.facts.fact_road_north.value];
    await expect(word(page, now)).toHaveText(`${now} · ${LEDGER} · 오늘`);
    await expect(word(page, "강나루 길이 조용하다")).toHaveAttribute("data-stale", "true");
    await expect(word(page, "강나루 길이 조용하다")).toHaveText(/더 새 소식이 있음$/);

    // the course's first dangerous road, a convoy waiting: the clerk's choice open, the road's words first
    await waitUntil(page, { trouble: 2, convoy: true });
    await clerk(page);
    await expect(knowledge(page).first()).toHaveText(/^\[지금 선택과 관련\] /);
    await expect(option(page, "위험한 상단 호위를 이끈다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).toContainText("요즘 강나루 길이 험하다고");
    await expect(word(page, "강나루 길이 험하다")).toHaveText(`강나루 길이 험하다 · ${LEDGER} · 오늘`);
    await expect(knowledge(page).first()).toHaveText(/^강나루 길이 험하다 /);

    // the guard who heard "dangerous" leads the ordinary convoy instead -- and sees the road
    const before = await getState(page);
    await clerk(page);
    await option(page, /^상단 호위를 이끈다/).click();
    const after = await getState(page);
    expect(after.pending).toBeFalsy();
    expect(me(before).hp.current - me(after).hp.current).toBeLessThanOrEqual(3); // the lead costs what it did, on any road
    await expect(log(page)).toContainText("이번 길은 험했다");
    await expect(word(page, "강나루 길이 험하다")).toHaveText(/^강나루 길이 험하다 · 상단 조합의 서기에게 들음, 직접 봄 \(강나루 길\) · /);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a save from before Road News: loaded with the app's button, the road turns, the yard's talk, kept through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(async (state) => {
      const idb = await import("/v2/storage/idb.js");
      await idb.save("slot_before_road_news", state, { savedAt: 1 });
    }, OLD_SAVE.state);
    await loadSlot(page, "slot_before_road_news");
    const old = await getState(page);
    expect(old.fired.evt_road_north).toBeUndefined();
    expect(me(old).hp.current).toBe(3);

    // the next step: the road turns once, from the first place
    await page.locator("#waitBtn").click();
    const turned = await getState(page);
    expect(turned.fired.evt_road_north.count).toBe(1);
    expect(turned.signals.road_phase).toBe(1);

    // the guild does not know this guard: the yard's talk, hearsay
    await ask(page);
    await expect(log(page)).toContainText("조합이 아는 호위에게만 일러 준다");
    await expect(page.locator("#knowledge li", { hasText: "조합 마당의 이야기 · 뜬소문 · 오늘" })).toHaveCount(1);
    const heard = await getState(page);

    // save -> reload -> load: the word is the character's and is kept as it was
    await page.locator("#saveSlotInput").fill("slot_old_saved");
    await page.locator("#saveBtn").click();
    await expect(log(page)).toContainText("slot_old_saved");
    await loadSlot(page, "slot_old_saved");
    const loaded = await getState(page);
    expect(loaded.knowledge[loaded.player.actorId]).toEqual(heard.knowledge[heard.player.actorId]);
    expect(loaded.fired.evt_road_north).toEqual(heard.fired.evt_road_north);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
