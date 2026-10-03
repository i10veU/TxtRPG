// V2-Core-75 browser scenario (#180, Fantasy World Vertical Slice 4, step 4 -- integrated horizon): the
// real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the
// real world data pack. In the page, against the real engine, the play policy of
// tests/v2/data-world-horizon.test.js plans the walk from the village to the far bank's board in the
// dispersed world (the leader lives); the app plays exactly those actions through its own dispatch, is
// saved -> reloaded -> loaded halfway, shows the board's bounty, and ends in the state a pure replay reaches.
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
    const MILLER = (optionId) => [P("act_talk_miller"), C(optionId)];
    const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
    const ROADS = {
      loc_village: ["loc_market", "loc_ruins", "loc_forest_spring", "loc_crossroads"],
      loc_market: ["loc_village"], loc_ruins: ["loc_village"], loc_forest_spring: ["loc_village"],
      loc_crossroads: ["loc_village", "loc_mill_hamlet", "loc_river_ford"],
      loc_mill_hamlet: ["loc_crossroads"], loc_river_ford: ["loc_crossroads"], loc_far_bank: ["loc_river_ford"]
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
    function nextForHorizon(s) {
      const id = s.player.actorId;
      const me = s.actors[id];
      const loc = me.locationId;
      const knows = s.knowledge?.[id] ?? {};
      const inventory = me.inventory ?? {};
      const go = (to) => (loc === to ? null : [M(nextHop(loc, to))]);
      const trading = (s.relations?.["org_mill_hamlet:org_village"]?.tags ?? []).includes("trading");
      if (knows.rum_royal_city) return null;
      if (!knows.rum_road_hamlet || !knows.rum_road_ford) return go("loc_village") ?? E("opt_ask_region");
      if (!knows.rum_road_royal) return go("loc_crossroads") ?? [P("act_read_milestone")];
      if (s.facts?.fact_leader_trail === undefined && s.facts?.fact_bandit_toll === undefined) return go("loc_crossroads") ?? [P("act_search_crossroads")];
      if (!trading) {
        if (!inventory.item_flour_sack) return go("loc_mill_hamlet") ?? [...MILLER("opt_miller_news"), ...MILLER("opt_miller_flour")];
        return go("loc_village") ?? E("opt_deliver_flour");
      }
      if (!knows.rum_realm_levy && !knows.rum_realm_fair && !knows.rum_realm_unrest) return go("loc_river_ford") ?? FERRY("opt_ferryman_news");
      if (loc === "loc_far_bank") return [P("act_read_waystation_board")];
      if (!inventory.item_passage_letter && me.money < 3) return go("loc_village") ?? E("opt_elder_letter");
      return go("loc_river_ford") ?? FERRY(inventory.item_passage_letter ? "opt_ferryman_cross_letter" : "opt_ferryman_cross");
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
    for (let i = 0; i < 120; i += 1) {
      const next = nextForHorizon(state);
      if (next === null) break;
      for (const a of next) { walk.push(a); state = apply(state, a); }
    }
    return { dispersal, walk, end: state };
  }, seed);
}

test.describe("V2 horizon (Slice 4: village -> region -> outside world)", () => {
  test("the policy's walk to the far bank, played by the app through save/load -- the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const { dispersal, walk, end } = await planInPage(page, SEED);
    expect(end.actors.player_1.locationId).toBe("loc_far_bank");
    expect(end.relations["org_mill_hamlet:org_village"].tags).toEqual(["trading"]);

    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, dispersal);

    const half = Math.floor(walk.length / 2);
    await dispatchAll(page, walk.slice(0, half));
    await page.locator("#saveSlotInput").fill("slot_horizon");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_horizon" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    await dispatchAll(page, walk.slice(half));
    await expect(page.locator("#location")).toContainText("강 건너 길목");
    await expect(page.locator("#log")).toContainText("현상금 은화 쉰 닢.");
    expect(await getState(page)).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
