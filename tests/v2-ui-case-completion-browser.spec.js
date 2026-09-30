// V2-Core-38 browser scenario (Issue #106, D-73): case completion in real Chromium with real
// IndexedDB. `completeWhen` stays a reserved, validated field with no runtime meaning; a case moves
// when a `data.events` trigger fires (or an explicit `case` Effect runs). The engine modules and
// the storage adapter are the real ones (web/v2/core/*.js, web/v2/storage/idb.js), driven with a
// synthetic abstract-ID pack through dynamic import; the real pack is driven through the UI.
//
// Node coverage of the same rules lives in tests/v2/case-completion.test.js. Every older spec is
// untouched.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "succession-120";

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

// a synthetic pack, rebuilt inside the page (page.evaluate cannot close over Node values)
const PACK_SOURCE = `
  const inStage = (stage) => ({ op: "case", case: "case_a", stage });
  return {
    formatVersion: 1, id: "probe_pack", version: "0.1.0",
    world: { id: "probe_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: { start_default: { kind: "player", locationId: "loc_a", hp: { max: 3 }, money: 0, inventory: {}, growth: {}, tags: [] } },
    locations: { loc_a: { links: [] } },
    actions: {
      act_start: { effects: [{ op: "case", case: "case_a", stage: "s1" }] },
      act_ready: { effects: [{ op: "flag", key: "ready", value: true }] },
      act_second: { effects: [{ op: "flag", key: "second", value: true }] }
    },
    cases: { case_a: { stages: [{ id: "s1", completeWhen: { op: "flag", key: "ready" } }, { id: "s2" }, { id: "s3" }] } },
    events: {
      // the entry event rewards and moves to s2; the completion id sorts BEFORE the entry id, so it
      // completes on the next accepted step (one-step chain limit)
      e_b_enter: { trigger: { op: "and", of: [inStage("s1"), { op: "flag", key: "ready" }] }, effects: [{ op: "case", case: "case_a", stage: "s2" }, { op: "money", add: 3 }] },
      e_a_complete: { trigger: inStage("s2"), once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] },
      e_roll: { trigger: { op: "flag", key: "second" }, once: true, check: { difficulty: -100 }, outcomes: { success: [{ op: "case", case: "case_b", stage: "won" }], fail: [{ op: "case", case: "case_b", stage: "lost" }] } }
    }
  };
`;

test.describe("V2 case completion (completeWhen reserved, data.events is the path)", () => {
  test("a case chain driven by data.events survives a real IndexedDB save -> page reload -> load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    const first = await page.evaluate(async (packSource) => {
      const engine = await import("/v2/core/engine.js");
      const rules = await import("/v2/core/rules.js");
      const idb = await import("/v2/storage/idb.js");
      const data = new Function(packSource)();
      const P = (actionId) => ({ type: "perform", actionId });
      let state = engine.createInitialState({ worldSeed: "case-seed", data }).state;
      const trace = [];
      for (const action of [P("act_start"), P("act_ready")]) {
        const result = engine.step(state, action, data);
        state = result.state;
        trace.push(result.events.filter((e) => e.type === "case.updated").map((e) => e.data.stage));
      }
      await idb.save("slot_case", state, { savedAt: 1 });
      // the uninterrupted continuation, for the comparison after the reload
      const next = engine.step(state, { type: "wait", minutes: 1 }, data);
      return { valid: rules.validateData(data), trace, state, next };
    }, PACK_SOURCE);

    expect(first.valid).toEqual([]);
    // `completeWhen` is declared on s1 and its condition is true, yet only the event moved the case:
    // act_start entered s1, act_ready made the entry event fire (-> s2, +3); the completion id sorts
    // before the entry id, so s3 waits for the next step
    expect(first.trace).toEqual([["s1"], ["s2"]]);
    expect(first.state.cases.case_a.stage).toBe("s2");
    expect(first.state.actors.player_1.money).toBe(3);
    expect(first.next.state.cases.case_a.stage).toBe("s3");
    expect(first.next.state.actors.player_1.money).toBe(3); // the guarded entry event did not fire again

    // a real page reload, then load the record back from IndexedDB and take the same next step
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    const second = await page.evaluate(async (packSource) => {
      const engine = await import("/v2/core/engine.js");
      const idb = await import("/v2/storage/idb.js");
      const data = new Function(packSource)();
      const loadedState = await idb.load("slot_case"); // load(slot) resolves to the state itself
      const next = engine.step(loadedState, { type: "wait", minutes: 1 }, data);
      // the check-carrying event: the stage is chosen by the outcome and the gameplay stream advances
      const rolled = engine.step(next.state, { type: "perform", actionId: "act_second" }, data);
      const again = engine.step(next.state, { type: "perform", actionId: "act_second" }, data);
      await idb.remove("slot_case");
      return { loadedState, next, rolled, again, cursorBefore: next.state.rng.cursor };
    }, PACK_SOURCE);

    expect(second.loadedState).toEqual(first.state);
    expect(second.next).toEqual(first.next);
    expect(second.rolled.events.some((e) => e.type === "check.resolved")).toBe(true);
    expect(second.rolled.state.cases.case_b.stage).toBe("won");
    expect(second.rolled.state.rng.cursor).toBeGreaterThan(second.cursorBefore);
    expect(second.again).toEqual(second.rolled); // same input, same result

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the real pack: its case moves only through its explicit `case` Effect, however much time passes", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const P = (actionId) => ({ type: "perform", actionId });
    const C = (optionId) => ({ type: "choose", optionId });
    const M = (to) => ({ type: "move", to });
    const PATH = [
      P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"),
      M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"),
      M("loc_village"), P("act_rest_village"), P("act_talk_elder"), C("opt_report_findings")
    ];
    const result = await page.evaluate(async ({ seed, path }) => {
      await window.__v2App.newGame(seed);
      const pack = (await import("/v2/data/world.js")).worldData;
      path.forEach((action) => window.__v2App.dispatch(action));
      const beforeConfront = window.__v2App.getState();
      window.__v2App.dispatch({ type: "perform", actionId: "act_confront_leader" });
      const confronted = window.__v2App.getState();
      for (let day = 0; day < 3; day += 1) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
      const later = window.__v2App.getState();
      return { hasCases: pack.cases !== undefined, completeWhen: JSON.stringify(pack).includes("completeWhen"), beforeConfront, confronted, later };
    }, { seed: SEED, path: PATH });

    expect(result.hasCases).toBe(false);
    expect(result.completeWhen).toBe(false);
    expect(result.beforeConfront.cases).toBeUndefined();
    expect(result.confronted.cases.case_ruins_mystery.stage).toBe("resolved");
    // three days later the case is exactly as the confrontation left it
    expect(result.later.cases).toEqual(result.confronted.cases);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
