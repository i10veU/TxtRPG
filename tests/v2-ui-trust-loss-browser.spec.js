// V2-Core-130 browser scenario (#318, MG-046.1 step 1 -- trust that opens doors): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. A known lead in steel (35 of the guild's
// trust) on a dangerous road with a failing roll is staged through the real storage adapter and loaded with the app's button
// (data-world-trust-loss.test.js pins the same rule); the rest is real buttons:
//   the guard takes the danger job and fails, comes back, and the clerk's ledger line says the guild will not easily trust
//   them again; asked for work, the clerk gives the yard's talk and says the ledger is for known guards; the knowledge list
//   shows the yard's word as hearsay; the lost trust survives save -> reload -> load.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";
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
// the pack's words
const TRUST_LOST = "조합은 쉽게 다시 믿지 않는다";
const FOR_KNOWN = "조합이 아는 호위에게만 일러 준다";
const YARD_UNSETTLED = "심상치 않다는 수군거림";

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
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const standing = (s) => s.relations?.["npc_guild_clerk:" + s.player.actorId]?.score ?? 0;

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 trust that opens doors (MG-046.1 step 1)", () => {
  test("a failed danger job costs the guild's trust: the ledger closes to the yard's talk, through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN);
    // a known lead in steel, a convoy waiting, a dangerous road, and the first roll that fails the danger job (the guard lives)
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const { step } = await import("/v2/core/engine.js");
      const { evaluateCondition } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const run = (s, list) => list.reduce((x, a) => step(x, a, worldData).state, s);
      const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
      let s = structuredClone(window.__v2App.getState());
      const id = s.player.actorId;
      const g = s.actors[id].growth.growth_wanderer;
      s.actors[id].money = 100;
      g.stats.str = 14;
      g.unlocks = { ...(g.unlocks ?? {}), unl_road_lead: true };
      s = run(s, [{ type: "perform", actionId: "act_talk_town_merchant" }, { type: "choose", optionId: "opt_town_merchant_buy_steel_sword" }, { type: "perform", actionId: "act_equip_steel_sword" }]);
      for (let h = 0; h < 96 && !open(s); h += 1) s = run(s, [{ type: "wait", minutes: 60 }]);
      s.relations = { ...s.relations, ["npc_guild_clerk:" + id]: { score: 35 } };
      s.signals = { ...s.signals, road_trouble: 2 };
      s.facts.fact_road_north = { value: "dangerous", since: s.time.minute };
      s.actors[id].growth.growth_wanderer.resources.stamina.current = 6;
      s.actors[id].hp.current = s.actors[id].hp.max;
      const DANGER = [{ type: "perform", actionId: "act_talk_guild_clerk" }, { type: "choose", optionId: "opt_guild_clerk_escort_danger" }];
      for (let k = 0; k < 300; k += 1) {
        const t = structuredClone(s);
        t.rng.cursor += k;
        const r = step(step(t, DANGER[0], worldData).state, DANGER[1], worldData);
        const tier = r.events.find((e) => e.type === "check.resolved")?.data.tier;
        if ((tier === "fail" || tier === "partial") && r.state.pending === null) { await idb.save("slot_trust_staged", t, { savedAt: 1 }); return; }
      }
      throw new Error("no failing roll the guard survives");
    });
    await loadSlot(page, "slot_trust_staged");
    expect(standing(await getState(page))).toBe(35);

    // the danger job, failed, through the real buttons
    await clerk(page);
    await option(page, "위험한 상단 호위를 이끈다").click();
    await expect(log(page)).toContainText(TRUST_LOST);
    const failed = await getState(page);
    expect(failed.pending).toBeFalsy();
    expect(standing(failed)).toBe(5);

    // back in town and asked for work: the yard's talk, not the ledger
    await move(page, "영주의 성읍");
    await clerk(page);
    await option(page, "일거리를 묻는다").click();
    await expect(log(page)).toContainText(FOR_KNOWN);
    await expect(log(page)).toContainText(YARD_UNSETTLED);
    await expect(page.locator("#knowledge li", { hasText: "강나루 길이 심상치 않다 · 조합 마당의 이야기 · 뜬소문 · 오늘" })).toHaveCount(1);

    // save -> reload -> load: the lost trust is kept
    await page.locator("#saveSlotInput").fill("slot_trust_saved");
    await page.locator("#saveBtn").click();
    await expect(log(page)).toContainText("slot_trust_saved");
    await loadSlot(page, "slot_trust_saved");
    expect(standing(await getState(page))).toBe(5);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
