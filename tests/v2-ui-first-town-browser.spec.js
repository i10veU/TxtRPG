// V2-Core-79 browser scenario (#189, Fantasy World Vertical Slice 5, step 4 -- integrated: the frontier and
// its first town): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real
// IndexedDB, against the real world data pack. In the page, against the real engine, the play policy of
// tests/v2/data-world-first-town.test.js plans the walk from the dispersed village to the castle town --
// the way north, the crossing, the road, the lord's notices, the caravan guard's escort and back; the app
// plays exactly those actions through its own dispatch, is saved -> reloaded -> loaded halfway, shows the
// decree and the escort's end, and ends in the state a pure replay reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";

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
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatchAll = (page, list) => page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), list);

async function planInPage(page, seed) {
  return page.evaluate(async (worldSeed) => {
    const { createInitialState, step } = await import("/v2/core/engine.js");
    const { worldData } = await import("/v2/data/world.js");
    const P = (actionId) => ({ type: "perform", actionId });
    const M = (to) => ({ type: "move", to });
    const C = (optionId) => ({ type: "choose", optionId });
    const E = (optionId) => [P("act_talk_elder"), C(optionId)];
    const ROADS = {
      loc_village: ["loc_market", "loc_ruins", "loc_forest_spring", "loc_crossroads"],
      loc_market: ["loc_village"], loc_ruins: ["loc_village"], loc_forest_spring: ["loc_village"],
      loc_crossroads: ["loc_village", "loc_mill_hamlet", "loc_river_ford"],
      loc_mill_hamlet: ["loc_crossroads"], loc_river_ford: ["loc_crossroads"]
    };
    const nextHop = (from, to) => {
      const seen = new Map([[from, null]]);
      const queue = [from];
      while (queue.length > 0) {
        const at = queue.shift();
        if (at === to) break;
        for (const next of ROADS[at]) if (!seen.has(next)) { seen.set(next, at); queue.push(next); }
      }
      let hop = to;
      while (seen.get(hop) !== from) hop = seen.get(hop);
      return hop;
    };
    function nextForTown(s) {
      const id = s.player.actorId;
      const me = s.actors[id];
      const loc = me.locationId;
      const knows = s.knowledge?.[id] ?? {};
      const inventory = me.inventory ?? {};
      const go = (to) => (loc === to ? null : [M(nextHop(loc, to))]);
      if (loc !== "loc_far_bank" && loc !== "loc_castle_town") {
        if (!knows.rum_road_ford) return go("loc_village") ?? E("opt_ask_region");
        if (!inventory.item_passage_letter && me.money < 3) return go("loc_village") ?? E("opt_elder_letter");
        return go("loc_river_ford") ?? [P("act_talk_ferryman"), C(inventory.item_passage_letter ? "opt_ferryman_cross_letter" : "opt_ferryman_cross")];
      }
      if (loc !== "loc_castle_town") return [M("loc_castle_town")];
      if (!(knows.rum_realm_levy?.sources ?? []).includes("obs_loc_castle_town")) return [P("act_read_castle_notices")];
      if ((s.signals?.guards_hired ?? 0) < 1) return [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
      return null;
    }
    const apply = (s, a) => {
      const r = step(s, a, worldData);
      if (r.events.some((e) => e.type === "action.rejected")) throw new Error("rejected " + JSON.stringify(a));
      return r.state;
    };
    const dispersal = [
      P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
      M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
      P("act_confront_leader"), ...E("opt_bandits_disperse")
    ];
    let state = createInitialState({ worldSeed, data: worldData }).state;
    for (const a of dispersal) state = apply(state, a);
    const walk = [];
    for (let i = 0; i < 80; i += 1) {
      const next = nextForTown(state);
      if (next === null) break;
      for (const a of next) { walk.push(a); state = apply(state, a); }
    }
    return { dispersal, walk, end: state };
  }, seed);
}

test.describe("V2 first town (Slice 5: the frontier and its castle town)", () => {
  test("the policy's walk to the castle town and the escort, played by the app through save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const { dispersal, walk, end } = await planInPage(page, SEED);
    expect(end.actors.player_1.locationId).toBe("loc_castle_town");
    expect(end.signals.guards_hired).toBe(1);

    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, dispersal);

    const half = Math.floor(walk.length / 2);
    await dispatchAll(page, walk.slice(0, half));
    await page.locator("#saveSlotInput").fill("slot_first_town");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_first_town" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await dispatchAll(page, walk.slice(half));
    await expect(page.locator("#location")).toContainText("영주의 성읍");
    await expect(page.locator("#log")).toContainText("인장이 찍힌 글은 길고 자세하다.");
    await expect(page.locator("#log")).toContainText("강 건너 길목에 닿");
    expect(await getState(page)).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
