// V2-Core-71 browser scenario (#170, Fantasy World Vertical Slice 3, step 4 -- integrated continuity):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against
// the real world data pack. In the page, against the real engine, the scout's way (both stories and
// their consequences, tests/v2/data-world-continuity.test.js) is replayed and the play policy picks the
// successor's way to the village's honour; the app plays all of it through its own dispatch (the
// successor started by the real button), is saved -> reloaded -> loaded halfway through the successor's
// way, shows what the village tells the successor, and ends in exactly the state a pure replay reaches.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

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

// the scout's actions, the successor's (by the policy), and the pure end state -- all in the page
async function planInPage(page) {
  return page.evaluate(async () => {
    const { createInitialState, step } = await import("/v2/core/engine.js");
    const { worldData } = await import("/v2/data/world.js");
    const P = (actionId) => ({ type: "perform", actionId });
    const M = (to) => ({ type: "move", to });
    const C = (optionId) => ({ type: "choose", optionId });
    const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
    const E = (optionId) => [P("act_talk_elder"), C(optionId)];
    const REST = P("act_rest_village");
    const DAY = { type: "wait", minutes: 1440 };
    const scout = [
      P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
      M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
      ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
      ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
      ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
      M("loc_village"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), REST, REST,
      M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
      M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
      M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
      M("loc_village"), M("loc_market"), ...H("opt_herbalist_report_spring"), M("loc_village"),
      ...E("opt_tell_spring_arrows"), ...E("opt_village_honor"),
      M("loc_market"), DAY, DAY, ...H("opt_herbalist_ask_sickness"), M("loc_village"), M("loc_forest_spring"), P("act_search_spring"),
      M("loc_village"), M("loc_market"), ...H("opt_herbalist_correct_legend"),
      M("loc_village"), M("loc_ruins")
    ];
    const rel = (s, from) => s.relations?.[`${from}:${s.player.actorId}`] ?? { score: 0, tags: [] };
    function nextForHonour(s) {
      if (s.pending?.kind === "newCharacter") return [{ type: "startCharacter", templateId: "start_wanderer" }];
      const me = s.actors[s.player.actorId];
      const loc = me.locationId;
      const hp = me.hp.current;
      const stamina = me.growth.growth_wanderer.resources?.stamina?.current ?? 6;
      const inventory = me.inventory ?? {};
      const knows = s.knowledge?.[s.player.actorId] ?? {};
      const go = (to) => (loc === to ? null : loc === "loc_village" ? [M(to)] : [M("loc_village")]);
      const recover = (needStamina) => {
        if (loc === "loc_village" && (hp < me.hp.max || needStamina)) return [REST];
        return hp <= 4 || needStamina ? go("loc_village") : null;
      };
      if ((rel(s, "org_village").tags ?? []).includes("trusted")) return null;
      const elder = rel(s, "npc_elder");
      const herbalist = rel(s, "npc_herbalist");
      if (elder.score < 15) {
        if (!knows.rum_ruins_secret) return go("loc_village") ?? E("opt_ask_ruins");
        if (!inventory.item_relic) {
          if (!inventory.item_lantern) return go("loc_market") ?? [P("act_buy_lantern")];
          return recover(false) ?? go("loc_ruins") ?? [P("act_investigate_ruins")];
        }
        if (!(elder.tags ?? []).includes("confidant")) return go("loc_village") ?? E("opt_report_findings");
      }
      if (herbalist.score < 15) {
        if (!(herbalist.tags ?? []).includes("consulted")) return go("loc_market") ?? H("opt_herbalist_ask_sickness");
        if ((inventory.item_purifying_herb ?? 0) >= 2) return go("loc_market") ?? H("opt_herbalist_give_herbs");
        return recover(stamina < 2) ?? go("loc_forest_spring") ?? [P("act_gather_herbs")];
      }
      return go("loc_village") ?? E("opt_village_honor");
    }
    const apply = (s, a) => {
      const r = step(s, a, worldData);
      if (r.events.some((e) => e.type === "action.rejected")) throw new Error("rejected " + JSON.stringify(a));
      return r.state;
    };
    let state = createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state;
    for (const a of scout) state = apply(state, a);
    while (state.pending?.kind !== "newCharacter") {
      scout.push({ type: "wait", minutes: 30 });
      state = apply(state, scout.at(-1));
    }
    const successor = [];
    for (let i = 0; i < 200; i += 1) {
      const next = nextForHonour(state);
      if (next === null) break;
      for (const a of next) {
        successor.push(a);
        state = apply(state, a);
      }
    }
    return { scout, successor, end: state };
  });
}

test.describe("V2 continuity (Slice 3: consequences carried forward)", () => {
  test("the scout's world told to a successor who earns the village's honour anew -- through the app and save/load, the same end as a pure replay", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const { scout, successor, end } = await planInPage(page);
    expect(successor[0]).toEqual({ type: "startCharacter", templateId: "start_wanderer" });
    expect(end.relations["org_village:player_2"].tags).toEqual(["trusted"]);

    await page.locator("#backgroundSelect").selectOption("start_scout");
    await page.evaluate(() => window.__v2App.newGame("integrated-36", document.querySelector("#backgroundSelect").value));
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, scout);
    await expect(page.locator("#log")).toContainText("쓰러졌다...");
    const world = await getState(page);
    expect([world.flags.spring_bandits_told, world.flags.well_tale_corrected, world.flags.village_honored]).toEqual([true, true, true]);

    // the successor, by the button; the village tells them the world they arrive in
    await page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (start_wanderer)" }).click();
    await page.locator("#actions button", { hasText: "원로와 대화" }).click();
    await page.locator("#choiceOptions button", { hasText: "안부만 묻기" }).click();
    await expect(page.locator("#log")).toContainText("마을이 이름을 걸고 감사했던 방랑자 이야기를 꺼낸다.");
    // (small talk changes nothing: the plan's next actions still apply)

    // halfway through the successor's way: save -> reload -> load
    const half = Math.floor(successor.length / 2);
    await dispatchAll(page, successor.slice(1, half));
    await page.locator("#saveSlotInput").fill("slot_successor_way");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_successor_way" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the rest of the way: honoured on their own
    await dispatchAll(page, successor.slice(half));
    await expect(page.locator("#log")).toContainText("이제 이 마을은 당신의 편이라고 말한다.");
    expect(await getState(page)).toEqual(end);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
