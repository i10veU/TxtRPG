// V2-Core-112 browser scenario (#272, RPG Depth 4, step 2 -- a harder convoy for the geared lead): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to
// the castle town is dispatched; a lead-holder with silver is staged through the real storage adapter and loaded with the
// app's button (data-world-danger-road.test.js stages the same); the rest is real buttons: no hard convoy without steel
// (the clerk offers the lead only), the steel sword bought and wielded, the clerk's word about a convoy for the geared,
// the hard convoy taken -- a hard check, three stamina -- saved -> reloaded -> loaded, the same end as a pure replay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-danger-road.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];

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

test.describe("V2 a harder convoy for the geared lead (RPG Depth 4)", () => {
  test("no hard convoy without steel, the steel bought and wielded, the clerk's word, the hard convoy taken -- save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);

    // a lead-holder with silver and rest, staged through the real storage adapter and loaded with the button
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const state = structuredClone(window.__v2App.getState());
      const g = state.actors.player_1.growth.growth_wanderer;
      state.actors.player_1.money = 100;
      g.resources.stamina.current = 6;
      g.stats.str = 14;
      g.unlocks = { ...(g.unlocks ?? {}), unl_road_lead: true };
      await idb.save("slot_lead", state, { savedAt: 1 });
    });
    await loadSlot(page, "slot_lead");

    // wait for a convoy with a real clock; without steel the clerk offers the lead and not the hard convoy
    const waitForConvoy = () => page.evaluate(async ({ HOUR }) => {
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const wanted = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let n = 0;
      while (!wanted(window.__v2App.getState()) && n < 96) { window.__v2App.dispatch(HOUR); n += 1; }
    }, { HOUR });
    await waitForConvoy();
    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "상단 호위를 이끈다")).toBeVisible();
    await expect(option(page, "위험한 상단 호위를 이끈다")).toHaveCount(0);
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).not.toContainText("강철을 걸친 이만 부탁할 수 있는 상단이");

    // the steel sword, with real buttons
    await act(page, "성읍의 상인과 대화");
    await option(page, "강철 검을 산다 (은화 24)").click();
    await act(page, "강철 검을 든다");

    await act(page, "상단 조합의 서기와 대화");
    await expect(option(page, "위험한 상단 호위를 이끈다")).toBeVisible();
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#log")).toContainText("강철을 걸친 이만 부탁할 수 있는 상단이");

    await page.locator("#saveSlotInput").fill("slot_geared");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const saved = await getState(page);
    await loadSlot(page, "slot_geared");
    expect(await getState(page)).toEqual(saved);

    // the hard convoy, with a real button
    const before = await getState(page);
    await act(page, "상단 조합의 서기와 대화");
    await option(page, "위험한 상단 호위를 이끈다").click();
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    const after = await getState(page);
    expect(after.signals.guards_hired).toBe((before.signals.guards_hired ?? 0) + 1);
    expect(before.actors.player_1.growth.growth_wanderer.resources.stamina.current - after.actors.player_1.growth.growth_wanderer.resources.stamina.current).toBe(3);

    const replay = await page.evaluate(async (start) => {
      const { step } = await import("/v2/core/engine.js");
      const { worldData } = await import("/v2/data/world.js");
      const a = step(start, { type: "perform", actionId: "act_talk_guild_clerk" }, worldData);
      const b = step(a.state, { type: "choose", optionId: "opt_guild_clerk_escort_danger" }, worldData);
      return { state: b.state, difficulty: b.events.find((e) => e.type === "check.resolved").data.difficulty };
    }, before);
    expect(replay.difficulty).toBe(14);
    expect(after).toEqual(replay.state);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
