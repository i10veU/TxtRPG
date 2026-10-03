// V2-Core-37 browser probe (Issue #104, D-72): the real entry point (web/v2/index.html +
// ui/app.js) and the real engine modules in real Chromium, with real IndexedDB. Investigation
// only -- the scenarios pin what `completeWhen`, relation rule `when` and `facts[*].initial`
// do TODAY (nothing reads them; the existing `data.events` pipeline already expresses the same
// intent) and that the seed conventions give the same numbers in the browser as in Node. They do
// not implement or choose any semantics for the three fields. Since V2-Core-43 (Issue #118, D-76)
// `facts[*].initial` IS seeded at creation (seed input C1, `state.worldSeed`): the facts pins below
// were replaced with the decided behaviour; `completeWhen` and relation rules are still never read.
//
// Node coverage of the same facts lives in tests/v2/core-semantics-gap.test.js. Every older spec
// is untouched.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// the predecessor's investigation and confrontation both succeed on this seed (see
// tests/v2-ui-succession-browser.spec.js, which found it)
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

const getState = (page) => page.evaluate(() => window.__v2App.getState());

async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

const saveTo = async (page, slot, count) => {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
};

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
// observe x2, the elder's rumor, the lantern, the ruins, the investigation, rest, report, confront, decide
const PATH = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"),
  M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_talk_elder"), C("opt_report_findings"),
  P("act_confront_leader"), P("act_talk_elder"), C("opt_bandits_disperse")
];

const play = (page, seed, actions) =>
  page.evaluate(async ({ s, list }) => {
    await window.__v2App.newGame(s);
    list.forEach((action) => window.__v2App.dispatch(action));
    return window.__v2App.getState();
  }, { s: seed, list: actions });

test.describe("V2 core semantics investigation (completeWhen / relation rule when / facts.initial)", () => {
  test("the real pack: its fact starts at its `initial` (D-76), cases and relations move only through Effects, and it survives save -> reload -> load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // a new game starts with the fact's `initial` (D-76), and no cases, no edges
    await page.evaluate((s) => window.__v2App.newGame(s), SEED);
    await expect(page.locator("#game")).toBeVisible();
    const fresh = await getState(page);
    expect(fresh.facts).toEqual({ fact_ruins_secret: { value: "unknown", since: 0 } });
    expect(fresh.cases).toBeUndefined();
    expect(fresh.relations ?? {}).toEqual({});
    const pack = await page.evaluate(async () => (await import("/v2/data/world.js")).worldData);
    expect(pack.facts).toEqual({ fact_ruins_secret: { initial: "unknown" }, fact_bandits_fate: {}, fact_leader_wound: {}, fact_well_source: {}, fact_spring_cause: {} }); // V2-Core-45, V2-Core-55 and V2-Core-64 (the well's two): no `initial`
    expect(pack.cases).toBeUndefined();
    expect(pack.rules.relation).toBeUndefined();
    expect(JSON.stringify(pack)).not.toContain("completeWhen");

    // the path: the fact, the case and the relation edges are all written by explicit Effects
    const played = await play(page, SEED, PATH);
    expect(played.facts.fact_ruins_secret.value).toBe("bandit_hideout");
    expect(played.facts.fact_ruins_secret.since).toBeGreaterThan(0);
    expect(played.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(Object.keys(played.relations).sort()).toEqual(["npc_bandit_leader:org_bandits", "npc_bandit_leader:player_1", "npc_elder:player_1", "org_bandits:player_1"]);

    // save through the UI, reload, load: the same state, and the same next step
    await saveTo(page, "slot_gap", 1);
    await reloadAndLoad(page, "slot_gap");
    expect(await getState(page)).toEqual(played);
    const next = await page.evaluate(() => {
      window.__v2App.dispatch({ type: "wait", minutes: 10 });
      return window.__v2App.getState();
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_gap" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    const again = await page.evaluate(() => {
      window.__v2App.dispatch({ type: "wait", minutes: 10 });
      return window.__v2App.getState();
    });
    expect(again).toEqual(next);

    // the same seed and the same actions give the same history
    expect(await play(page, SEED, PATH)).toEqual(played);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the real engine in Chromium: completeWhen and relation rules are validated but never read, facts are seeded (D-76), and the same intent is expressible with data.events", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const result = await page.evaluate(async () => {
      const engine = await import("/v2/core/engine.js");
      const rules = await import("/v2/core/rules.js");
      const rng = await import("/v2/core/rng.js");
      const base = (extra) => ({
        formatVersion: 1, id: "probe_pack", version: "0.1.0",
        world: { id: "probe_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
        rules: { check: {}, succession: [] },
        characterTemplates: { start_default: { kind: "player", locationId: "loc_start", hp: { max: 10 }, money: 5, inventory: {}, growth: {}, tags: [] } },
        locations: { loc_start: { links: [] } },
        actions: { act_ready: { effects: [{ op: "flag", key: "ready", value: true }] } },
        ...extra
      });
      const start = (data, seed) => engine.createInitialState({ worldSeed: seed, data }).state;
      const wait = { type: "wait", minutes: 1440 };

      // declared and valid: completeWhen and the relation rule are ignored, the facts are seeded
      const declared = base({
        cases: { case_a: { stages: [{ id: "s1", completeWhen: { op: "always" } }, { id: "s2" }] } },
        rules: { check: {}, succession: [], relation: { rule_a: { when: { op: "always" }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 5 }] } } },
        facts: { f_fixed: { initial: "x" }, f_pick: { initial: { pickFrom: ["a", "b", "c"] } } }
      });
      let state = start(declared, "seed-1");
      const initial = { facts: state.facts ?? null, cases: state.cases ?? null, relations: state.relations ?? null };
      const seen = [];
      for (const action of [wait, { type: "wait", minutes: 10 }, wait]) {
        const r = engine.step(state, action, declared);
        seen.push(...r.events.map((e) => e.type));
        state = r.state;
      }

      // the same intent through the existing pipeline
      const expressed = base({
        events: {
          a_to_s2: { trigger: { op: "flag", key: "ready" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s2" }] },
          b_to_s3: { trigger: { op: "case", case: "case_a", stage: "s2" }, once: true, effects: [{ op: "case", case: "case_a", stage: "s3" }] },
          c_rule: { trigger: { op: "flag", key: "ready" }, effects: [{ op: "relation", from: "npc_a", to: "self", add: 5 }] }
        }
      });
      const e1 = engine.step(start(expressed, "seed-1"), { type: "perform", actionId: "act_ready" }, expressed);
      const e2 = engine.step(e1.state, wait, expressed);

      // the seed conventions, as numbers
      const st = start(base({}), "seed-1");
      return {
        declaredValid: rules.validateData(declared),
        c1Pick: ["a", "b", "c"][rng.nextUint32({ seed: rng.deriveSeed("seed-1", "fact:f_pick"), cursor: 0 }).value % 3],
        initial,
        seen: [...new Set(seen)],
        finalFacts: state.facts ?? null, finalCases: state.cases ?? null, finalRelations: state.relations ?? null,
        expressedValid: rules.validateData(expressed),
        chain: e1.events.filter((e) => e.type === "case.updated").map((e) => `${e.data.case}:${e.data.stage}`),
        ruleScores: [e1.state.relations["npc_a:player_1"].score, e2.state.relations["npc_a:player_1"].score],
        seeds: {
          rngSeed: st.rng.seed,
          hashOfSeed: rng.hashString("seed-1"),
          derivedString: rng.deriveSeed("seed-1", "fact:f_pick"),
          derivedRngSeed: rng.deriveSeed(st.rng.seed, "fact:f_pick"),
          stringForm: rng.deriveSeed("255", "x"),
          numericForm: rng.deriveSeed(255, "x"),
          labelA: rng.deriveSeed("seed-1", "fact:a"),
          labelB: rng.deriveSeed("seed-1", "fact:b")
        }
      };
    });

    expect(result.declaredValid).toEqual([]);
    const seededFacts = { f_fixed: { value: "x", since: 0 }, f_pick: { value: result.c1Pick, since: 0 } };
    expect(result.initial).toEqual({ facts: seededFacts, cases: null, relations: null });
    expect(result.seen).toEqual(["time.advanced", "day.started"]); // no case.updated, no relation.changed, no fact.changed
    expect(result.finalFacts).toEqual(seededFacts);
    expect(result.finalCases).toBeNull();
    expect(result.finalRelations).toBeNull();
    expect(result.expressedValid).toEqual([]);
    expect(result.chain).toEqual(["case_a:s2", "case_a:s3"]);
    expect(result.ruleScores).toEqual([5, 10]); // an event without once/cooldown applies on every step
    // the numbers Node computes for the same inputs (tests/v2/core-semantics-gap.test.js probe)
    expect(result.seeds).toEqual({
      rngSeed: 3597787782,
      hashOfSeed: 3597787782,
      derivedString: 1966658722,
      derivedRngSeed: 1567532526,
      stringForm: 3910629045,
      numericForm: 157932535,
      labelA: 333431915,
      labelB: 350209534
    });
    expect(result.seeds.derivedString).not.toBe(result.seeds.derivedRngSeed);
    expect(result.seeds.stringForm).not.toBe(result.seeds.numericForm);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
