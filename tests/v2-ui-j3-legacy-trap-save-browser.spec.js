// #449: actual pre-#446 choice-effect Save, real IndexedDB reload at 390px.
// The fixture is produced by replaying the original effect definitions,
// not by deleting a tag from an already-completed modern save.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const PATH = [
  ["perform", "act_talk_elder"], ["choose", "opt_ask_ruins"],
  ["perform", "act_inspect_well"], ["move", "loc_market"],
  ["perform", "act_talk_herbalist"], ["choose", "opt_herbalist_ask_sickness"],
  ["perform", "act_talk_herbalist"], ["choose", "opt_herbalist_teach"],
  ["move", "loc_village"], ["perform", "act_request_spring_watch"],
  ["move", "loc_forest_spring"], ["perform", "act_search_spring"],
  ["move", "loc_village"], ["perform", "act_talk_elder"],
  ["choose", "opt_tell_spring_arrows"], ["perform", "act_help_mark_spring_route"],
  ["perform", "act_talk_elder"], ["choose", "opt_ask_ruins"],
  ["move", "loc_forest_spring"], ["perform", "act_enc_spring_trap_mark"],
  ["move", "loc_village"], ["perform", "act_talk_elder"]
];
const BUTTON = "원로에게 덫 표식 대응 상황을 확인한다";
for (const [optionId, outcome] of [
  ["opt_elder_trap_reinforce_route", 1],
  ["opt_elder_trap_publish_warning", 2]
]) {
  test("J3 pre-446 Save has neutral follow-up, not a false open choice " + outcome, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    const slot = "legacy-trap-" + outcome;
    const fixture = await page.evaluate(async ({ PATH, optionId, slot }) => {
      const [{ createInitialState, step }, { worldData }, storage] = await Promise.all([
        import("/v2/core/engine.js"), import("/v2/data/world.js"), import("/v2/storage/idb.js")
      ]);
      let state = createInitialState({ worldSeed: "herb-30", data: worldData }).state;
      for (const [type, id] of PATH) {
        const action = type === "move" ? { type, to: id } :
          type === "choose" ? { type, optionId: id } : { type, actionId: id };
        const result = step(state, action, worldData);
        if (result.events.some((e) => e.type === "action.rejected")) {
          throw new Error("fixture action rejected: " + JSON.stringify(action));
        }
        state = result.state;
      }
      const oldData = structuredClone(worldData);
      const choices = oldData.choices.choice_elder_dialogue.options;
      const route = choices.find((choice) => choice.id === "opt_elder_trap_reinforce_route");
      route.effects = route.effects.filter((effect) => effect.tag !== "spring_trap_route_reinforced");
      const notice = choices.find((choice) => choice.id === "opt_elder_trap_publish_warning");
      delete notice.effects.find((effect) => effect.op === "relation").tag;
      const result = step(state, { type: "choose", optionId }, oldData);
      if (result.events.some((e) => e.type === "action.rejected")) throw new Error("legacy choice rejected");
      await storage.save(slot, result.state, { savedAt: 1 });
      return {
        signal: result.state.signals.spring_trap_followup,
        tags: result.state.relations[`npc_elder:${result.state.player.actorId}`]?.tags ?? []
      };
    }, { PATH, optionId, slot });
    expect(fixture.signal).toBe(outcome);
    expect(fixture.tags).not.toContain("spring_trap_route_reinforced");
    expect(fixture.tags).not.toContain("spring_trap_notice_published");

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate((name) => window.__v2App.loadGame(name), slot);
    const next = page.locator("#linkedCaseNext");
    await expect(next).toContainText("추가 조치 여부는 대화에서 알 수 있다");
    await expect(next).not.toContainText("다음 대응을 결정하자");
    await expect(next).not.toContainText("샘길을 보강했다");
    await expect(next).not.toContainText("마을 장부에 알렸다");
    const check = next.getByRole("button", { name: BUTTON });
    await expect(check).toBeVisible();
    await check.click();
    await expect.poll(() => page.evaluate(() => window.__v2App.getView()?.pending?.choiceId))
      .toBe("choice_elder_dialogue");
    await expect(page.locator("#choiceOptions").getByRole("button", { name: /확인한 덫/ }))
      .toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
