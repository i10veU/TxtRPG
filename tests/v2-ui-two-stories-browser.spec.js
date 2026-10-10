// V2-Core-67 browser scenario (#160, Fantasy World Vertical Slice 2, step 4 -- integrated playthrough):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the
// real world data pack. The play policy of tests/v2/data-world-two-stories.test.js runs in the page
// against the real engine to choose the actions (seed two-1: a reckless first character falls at the
// spring with a remedy in hand, the successor finishes the story); the app then plays exactly those
// actions through its own dispatch, is saved -> reloaded -> loaded right after the successor starts,
// and ends in the very state a pure replay of the same actions reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "two-1";

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

// the policy, in the page, with the page's own engine: the actions and the pure end state
async function planInPage(page, seed) {
  return page.evaluate(async (worldSeed) => {
    const { createInitialState, step } = await import("/v2/core/engine.js");
    const { worldData } = await import("/v2/data/world.js");
    const P = (actionId) => ({ type: "perform", actionId });
    const M = (to) => ({ type: "move", to });
    const C = (optionId) => ({ type: "choose", optionId });
    const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
    function nextForWell(s, reckless) {
      if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
      const id = s.player.actorId;
      const me = s.actors[id];
      const loc = me.locationId;
      const hp = reckless ? me.hp.max : me.hp.current;
      const stamina = me.growth.growth_wanderer.resources?.stamina?.current ?? 6;
      const inventory = me.inventory ?? {};
      const knows = s.knowledge?.[id] ?? {};
      const tags = s.relations?.[`npc_herbalist:${id}`]?.tags ?? [];
      const go = (to) => (loc === to ? null : loc === "loc_village" ? [M(to)] : [M("loc_village")]);
      if (s.cases?.case_fouled_well?.stage === "resolved") {
        return tags.includes("purifier") && !tags.includes("thanked") ? go("loc_market") ?? H("opt_herbalist_report_spring") : null;
      }
      if (!tags.includes("consulted")) return go("loc_market") ?? H("opt_herbalist_ask_sickness");
      if (!tags.includes("taught") && me.money >= 2) return go("loc_market") ?? H("opt_herbalist_teach");
      if ((inventory.item_purifying_herb ?? 0) >= 2 && !inventory.item_spring_remedy) return go("loc_market") ?? H("opt_herbalist_brew");
      const gathering = !inventory.item_spring_remedy && knows.rum_spring_cause;
      if (loc === "loc_village" && (hp < 8 || (gathering && stamina < 2))) return [P("act_rest_village")];
      if (hp <= 4 || (gathering && stamina < 2)) return go("loc_village");
      if (inventory.item_spring_remedy && knows.rum_spring_cause) return go("loc_forest_spring") ?? [P("act_purify_spring")];
      if (!knows.rum_spring_cause) return go("loc_forest_spring") ?? [P("act_search_spring")];
      return go("loc_forest_spring") ?? [P("act_gather_herbs")];
    }
    let state = createInitialState({ worldSeed, data: worldData }).state;
    const actions = [];
    for (let i = 0; i < 300; i += 1) {
      const next = nextForWell(state, state.player.actorId === "player_1");
      if (next === null) break;
      for (const action of next) {
        const result = step(state, action, worldData);
        if (result.events.some((e) => e.type === "action.rejected")) throw new Error("rejected " + JSON.stringify(action));
        actions.push(action);
        state = result.state;
      }
    }
    return { actions, end: state };
  }, seed);
}

test.describe("V2 two stories (Slice 2: integrated playthrough)", () => {
  test("a fallen first character, the successor finishes the well -- through the app and save/load, the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const { actions, end } = await planInPage(page, SEED);
    const restart = actions.findIndex((a) => a.type === "startCharacter");
    expect(restart).toBeGreaterThan(0);
    expect(end.cases.case_fouled_well.stage).toBe("resolved");
    expect(end.player.actorId).toBe("player_2");

    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    // the first character's way, up to the fall at the spring
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), actions.slice(0, restart));
    await expect(page.locator("#log")).toContainText("쓰러졌다...");
    await expect(page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (떠돌이)" })).toHaveCount(1);
    // the successor, by the button
    await page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (떠돌이)" }).click();
    await expect(page.locator("#log")).toContainText("새 방랑자의 손에 들어온다.");
    const successor = await getState(page);
    expect(successor.player.actorId).toBe("player_2");
    expect(successor.facts.fact_spring_cause.value).toBe("rotting_carcass");
    expect(successor.knowledge?.player_2 ?? {}).toEqual({});
    await expect(page.locator("#moves button", { hasText: "숲속 샘" })).toHaveCount(0); // the way is not inherited

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_successor");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_successor" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(successor);

    // the successor finishes the story
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), actions.slice(restart + 1));
    await expect(page.locator("#log")).toContainText("손을 꼭 잡고 고맙다고 말한다.");
    expect(await getState(page)).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
