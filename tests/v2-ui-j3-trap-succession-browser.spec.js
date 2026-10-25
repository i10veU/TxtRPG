// J3 #447: cross-generation consequences through the real Chromium UI and IndexedDB.
// Do not seed private successor knowledge, alter the RNG, or inject world signals.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const PATH = [
  P("act_talk_elder"), C("opt_ask_ruins"), P("act_inspect_well"),
  M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"),
  P("act_talk_herbalist"), C("opt_herbalist_teach"), M("loc_village"),
  P("act_request_spring_watch"), M("loc_forest_spring"), P("act_search_spring"),
  M("loc_village"), P("act_talk_elder"), C("opt_tell_spring_arrows"),
  P("act_help_mark_spring_route"), P("act_talk_elder"), C("opt_ask_ruins")
];
const NEXT = "#linkedCaseNext";
const OPTIONS = [
  {
    id: 1,
    label: "확인한 덫 주변의 샘길 표식을 보강한다 (2시간, 기력 2)",
    result: "몸에 해로운 기운은 닿지 않았다",
    damage: 0,
    confidence: 55
  },
  {
    id: 2,
    label: "확인한 덫 표식을 마을 장부에 공고한다 (30분, 은화 1)",
    result: "숨이 조금 막히지만 더 깊은 곳으로 들지는 않았다",
    damage: 1,
    confidence: 80
  }
];
const state = (page) => page.evaluate(() => window.__v2App.getState());
const visible = (page) => page.evaluate(() => window.__v2App.getView());
const act = (page, label) => page.locator("#actions button:not([disabled])", { hasText: label }).first().click();
const move = (page, label) => page.locator("#moves button:not([disabled])", { hasText: label }).click();
const choice = (page, label) => page.locator("#choiceOptions button:not([disabled])", { hasText: label }).click();

async function saveAndReload(page, slot) {
  const before = await state(page);
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText(slot);
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot })
    .getByRole("button", { name: "불러오기" }).click();
  await expect.poll(() => page.evaluate(() => window.__v2App.getState()?.player?.actorId ?? null))
    .toBe(before.player.actorId);
  await expect.poll(async () => JSON.stringify(await state(page))).toBe(JSON.stringify(before));
}

async function dieThroughRuinsAndSucceed(page) {
  // Purchase a lantern using ordinary controls, then expose the character to
  // the existing ruins hazard; no fabricated death state or direct HP edit.
  await move(page, "시장");
  await act(page, "등불을 산다");
  await move(page, "변경 마을");
  await move(page, "폐허");
  for (let i = 0; i < 8; i++) {
    if ((await state(page)).pending?.kind === "newCharacter") break;
    await expect(page.locator("#waitBtn")).toBeEnabled();
    await page.locator("#waitBtn").click();
  }
  const dead = await state(page);
  expect(dead.pending).toEqual({ kind: "newCharacter" });
  expect(dead.actors.player_1.alive).toBe(false);
  await choice(page, "새로 시작한다 (떠돌이)");
  await expect(page.locator("#location")).toContainText("변경 마을");
  const heir = await state(page);
  expect(heir.player.actorId).toBe("player_2");
  expect(heir.actors.player_2.alive).toBe(true);
  return { dead, heir };
}

for (const scenario of OPTIONS) {
  test("J3 trap consequence survives succession in Chromium: " + scenario.id, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ENTRY, { waitUntil: "networkidle" });
    await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.evaluate((path) => {
      const app = window.__v2App;
      app.newGame("herb-30");
      for (const action of path) app.dispatch(action);
    }, PATH);

    // Earn the evidence with the existing notebook action, then make one real
    // elder choice using the UI (no state injection).
    await move(page, "숲속 샘");
    await page.locator(NEXT).getByRole("button", {
      name: "전해 들은 덫 표식을 현장에서 확인한다"
    }).click();
    await move(page, "변경 마을");
    await page.locator(NEXT).getByRole("button", {
      name: "확인한 덫 표식으로 원로와 후속 대응을 의논한다"
    }).click();
    await choice(page, scenario.label);
    const chosen = await state(page);
    expect(chosen.signals.spring_trap_followup).toBe(scenario.id);
    expect(chosen.knowledge.player_1.rum_spring_trap_mark.sources)
      .toContain("obs_loc_forest_spring");
    await saveAndReload(page, "j3-heir-before-" + scenario.id);

    const { dead, heir } = await dieThroughRuinsAndSucceed(page);
    expect(dead.signals.spring_trap_followup).toBe(scenario.id);
    expect(heir.signals.spring_trap_followup).toBe(scenario.id);
    expect(heir.flags.spring_patrol_deployed).toBe(true);
    expect(heir.knowledge.player_2?.rum_spring_trap_mark).toBeUndefined();
    expect((await visible(page)).knowledge?.rum_spring_trap_mark).toBeUndefined();
    await expect(page.locator(NEXT).getByRole("button", {
      name: "확인한 덫 표식으로 원로와 후속 대응을 의논한다"
    })).toHaveCount(0);

    // A successor must hear the public account for themselves. Published
    // warnings improve testimony, but never become firsthand observation.
    await act(page, "원로를 찾아간다");
    for (const candidate of OPTIONS) {
      await expect(page.locator("#choiceOptions").getByRole("button", {
        name: candidate.label
      })).toHaveCount(0);
    }
    await choice(page, "폐허에 대해 묻는다");
    const heard = await state(page);
    const report = heard.knowledge.player_2?.rum_spring_trap_mark;
    expect(report?.confidence).toBe(scenario.confidence);
    expect(report?.sources).toEqual(["npc_elder"]);
    expect(heard.knowledge.player_1.rum_spring_trap_mark.sources)
      .toContain("obs_loc_forest_spring");
    await saveAndReload(page, "j3-heir-after-" + scenario.id);

    // The successor learns the spring route independently (without accepting
    // the herbalist's protective herb), then encounters the real miasma event.
    await move(page, "시장");
    await act(page, "약초꾼에게 말을 건다");
    await choice(page, "마을의 배앓이에 대해 묻는다");
    await move(page, "변경 마을");
    // Count the arrival as an exposure too; assert HP before and after the
    // actual failing action, not just a narration somewhere in the log.
    async function observeExposure(action) {
      const before = await state(page);
      const logLength = await page.evaluate(() => window.__v2App.getLog().length);
      await action();
      const after = await state(page);
      const lines = await page.evaluate((length) =>
        window.__v2App.getLog().slice(length).join("\\n"), logLength);
      if (!lines.includes(scenario.result)) return false;
      expect(before.actors.player_2.hp.current - after.actors.player_2.hp.current)
        .toBe(scenario.damage);
      return true;
    }
    let observedFailure = await observeExposure(() => move(page, "숲속 샘"));
    expect((await state(page)).relations["npc_herbalist:player_2"]?.tags)
      .not.toContain("spring_inquiry_herb_given");
    // A resisted CON roll is not evidence of mitigation. The actual failed
    // event must be seen within a bounded number of ordinary wait actions.
    for (let i = 0; i < 8 && !observedFailure; i++) {
      await expect(page.locator("#waitBtn")).toBeEnabled();
      observedFailure = await observeExposure(() => page.locator("#waitBtn").click());
    }
    expect(observedFailure, "expected a real failed CON event, not only a world flag").toBe(true);
    expect((await state(page)).signals.spring_trap_followup).toBe(scenario.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
