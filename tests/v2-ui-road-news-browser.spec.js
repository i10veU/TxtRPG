// V2-Core-125 browser scenario (#307, Road News step 1a -- the road has a condition, and word of it): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the castle
// town is dispatched; the road's condition, the guard's standing with the guild and (for the ride) the roll are staged through the
// real storage adapter and loaded with the app's button (data-world-road-news.test.js stages the same); the rest is real buttons.
//   1. word by trust: a guard the guild does not know hears the yard's talk -- unsettled, nothing finer -- and that the ledger is
//      for known guards; a known guard hears the ledger's word for this road (dangerous); each is kept as the character's
//      knowledge with its source and certainty; asking changes nothing in the world;
//   2. a guard who rides sees the road, the word is kept through save -> reload -> load, and the old word stays dated when the
//      road has moved on.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-road-news.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const DAY = { type: "wait", minutes: 1440 };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
// the world's words, as the pack writes them
const YARD_UNSETTLED = "심상치 않다는 수군거림";
const FOR_KNOWN = "조합이 아는 호위에게만 일러 준다";
const LEDGER_DANGEROUS = "요즘 강나루 길이 험하다고 한다";
const SEEN_DANGEROUS = "이번 길은 험했다";

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
const log = (page) => page.locator("#log");
const words = (s) => s.knowledge?.[s.player.actorId] ?? {};

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

// the road's condition (`trouble`, the world number and the fact that names it) and the guard's standing with the clerk, a convoy
// waiting; with `ride`, a strong guard and the first roll that brings the convoy through. Staged and loaded with the app's button
async function stageRoad(page, { trouble, score, slot, ride = false }) {
  await page.evaluate(async ({ HOUR, ESCORT, trouble, score, slot, ride }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    const me = s.player.actorId;
    for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [HOUR]);
    s.relations = { ...s.relations, ["npc_guild_clerk:" + me]: { score } };
    s.signals = { ...s.signals, road_trouble: trouble };
    s.facts.fact_road_north = { value: ["quiet", "uneasy", "dangerous"][trouble], since: s.time.minute };
    if (ride) {
      const g = s.actors[me].growth.growth_wanderer;
      g.stats.str = 14;
      g.resources.stamina.current = 6;
      s.actors[me].hp.current = s.actors[me].hp.max;
      for (let k = 0; k < 60; k += 1) {
        const t = structuredClone(s);
        t.rng.cursor += k;
        const r = step(t, ESCORT[0], worldData).state;
        const done = step(r, ESCORT[1], worldData);
        const tier = done.events.find((e) => e.type === "check.resolved")?.data.tier;
        if (tier === "success" || tier === "great") { await idb.save(slot, t, { savedAt: 1 }); return; }
      }
      throw new Error("no good roll");
    }
    await idb.save(slot, s, { savedAt: 1 });
  }, { HOUR, ESCORT, trouble, score, slot, ride });
  await loadSlot(page, slot);
}
const toTown = async (page) => { await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN); };
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const ask = async (page) => { await clerk(page); await option(page, "일거리를 묻는다").click(); };
const newGameInTown = async (page) => {
  await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
  await expect(page.locator("#game")).toBeVisible();
  await toTown(page);
};

test.describe("V2 road news (Road News, step 1a)", () => {
  test("word by trust: the yard's talk for a stranger, the ledger's word for a known guard -- kept, with its source and certainty", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);

    // a stranger on a dangerous road: unsettled, nothing finer, and the ledger is for known guards
    await stageRoad(page, { trouble: 2, score: 5, slot: "slot_road_stranger" });
    const before = await getState(page);
    await ask(page);
    await expect(log(page)).toContainText(YARD_UNSETTLED);
    await expect(log(page)).toContainText(FOR_KNOWN);
    await expect(log(page)).not.toContainText(LEDGER_DANGEROUS);
    const heard = await getState(page);
    expect(words(heard).rum_road_talk_unsettled).toMatchObject({ claim: "unsettled", source: "src_guild_hall_talk", confidence: 40 });
    expect(words(heard).rum_road_dangerous).toBeUndefined();
    expect([heard.signals, heard.facts]).toEqual([before.signals, before.facts]); // asking is information: the world is as it was

    // the same road, a guard the guild knows: the ledger's word
    await stageRoad(page, { trouble: 2, score: 10, slot: "slot_road_known" });
    await ask(page);
    await expect(log(page)).toContainText(LEDGER_DANGEROUS);
    await expect(log(page)).not.toContainText(FOR_KNOWN);
    const told = await getState(page);
    expect(words(told).rum_road_dangerous).toMatchObject({ claim: "dangerous", source: "npc_guild_clerk", confidence: 80 });
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a guard who rides sees the road; the word survives save -> reload -> load, and stays dated when the road moves on", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGameInTown(page);
    await stageRoad(page, { trouble: 2, score: 10, slot: "slot_road_ride", ride: true });
    await clerk(page);
    await option(page, "상단 호위를 맡는다").click();
    await expect(log(page)).toContainText(SEEN_DANGEROUS);
    const rode = await getState(page);
    const seen = words(rode).rum_road_dangerous;
    expect(seen).toMatchObject({ claim: "dangerous", source: "obs_road_north", confidence: 90 });

    // save, reload, load: the word is the character's and is kept as it was
    await page.locator("#saveSlotInput").fill("slot_road_saved");
    await page.locator("#saveBtn").click();
    await expect(log(page)).toContainText("slot_road_saved");
    await loadSlot(page, "slot_road_saved");
    expect(words(await getState(page)).rum_road_dangerous).toEqual(seen);

    // days pass: the road turns on, the word does not change by itself (dated: first and last seen as they were)
    await move(page, "영주의 성읍");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY, DAY, DAY, DAY]);
    const later = await getState(page);
    expect(later.fired.evt_road_north.count).toBeGreaterThan(rode.fired.evt_road_north.count);
    expect(words(later).rum_road_dangerous).toEqual(seen);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
