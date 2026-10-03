// V2-Core-49 browser check (Issue #131, D-78): the `hp` selector and the `alive` Condition in real
// Chromium, through the same modules the app loads (web/v2/core/*.js, web/v2/data/world.js). The
// real pack plus one probe action: an NPC's wound is read by an `hp` threshold, his death by
// `not alive` (world context, `if`), and the `alive` requirement refuses a fourth strike (player
// context). The first combat (next issue) puts these into the real pack and the real buttons.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

test.describe("V2 hp / alive (Gate 3) in Chromium", () => {
  test("an NPC's wound and death are observable by Conditions, in both contexts", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(ENTRY_URL, { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const { createInitialState, step } = await import("/v2/core/engine.js");
      const { evaluateCondition, validateData } = await import("/v2/core/rules.js");
      const { worldData } = await import("/v2/data/world.js");
      const probe = structuredClone(worldData);
      probe.actions.act_probe_strike = {
        name: "probe",
        requires: { op: "alive", subject: "npc_bandit_leader" },
        effects: [
          { op: "hp", subject: "npc_bandit_leader", add: -4 },
          { op: "if", when: { op: "lte", left: { hp: "current", subject: "npc_bandit_leader" }, right: 6 }, then: [{ op: "flag", key: "probe_wounded", value: true }] },
          { op: "if", when: { op: "not", of: { op: "alive", subject: "npc_bandit_leader" } }, then: [{ op: "flag", key: "probe_down", value: true }] }
        ]
      };
      let state = createInitialState({ worldSeed: "hp-alive", data: probe }).state;
      const codes = [];
      const hps = [];
      for (let i = 0; i < 4; i += 1) {
        const r = step(state, { type: "perform", actionId: "act_probe_strike" }, probe);
        state = r.state;
        codes.push(r.events.find((e) => e.type === "action.rejected")?.data.code ?? null);
        hps.push(state.actors.npc_bandit_leader.hp.current);
      }
      const ctx = { state, data: probe, actorId: "player_1", contextKind: "player" };
      return {
        errors: validateData(probe),
        codes,
        hps,
        flags: state.flags,
        leaderAlive: state.actors.npc_bandit_leader.alive,
        playerAlive: evaluateCondition({ op: "alive" }, ctx),
        leaderMaxHp: evaluateCondition({ op: "eq", left: { hp: "max", subject: "npc_bandit_leader" }, right: 10 }, ctx),
        badField: validateData({ ...probe, actions: { ...probe.actions, act_bad: { name: "x", requires: { op: "eq", left: { hp: "now" }, right: 0 }, effects: [] } } }).length
      };
    });

    expect(result.errors).toEqual([]);
    expect(result.codes).toEqual([null, null, null, "requirements_not_met"]);
    expect(result.hps).toEqual([6, 2, 0, 0]);
    expect(result.flags).toMatchObject({ probe_wounded: true, probe_down: true });
    expect(result.leaderAlive).toBe(false);
    expect(result.playerAlive).toBe(true);
    expect(result.leaderMaxHp).toBe(true);
    expect(result.badField).toBe(1);
    expect(pageErrors).toEqual([]);
  });
});
