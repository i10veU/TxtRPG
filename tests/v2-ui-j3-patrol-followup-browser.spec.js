// J3 full loop: earned clues -> report -> patrol -> NPC testimony -> save/load
// -> field verification. Exercise the actual UI shortcut, not a mocked renderer.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const LABEL = "전해 들은 덫 표식을 현장에서 확인한다";

test("J3 patrol testimony returns to the player as a verifiable field lead", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ENTRY, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => {
    const app = window.__v2App;
    app.newGame("herb-30");
    const actions = [
      { type: "perform", actionId: "act_talk_elder" },
      { type: "choose", optionId: "opt_ask_ruins" },
      { type: "perform", actionId: "act_inspect_well" },
      { type: "move", to: "loc_market" },
      { type: "perform", actionId: "act_talk_herbalist" },
      { type: "choose", optionId: "opt_herbalist_ask_sickness" },
      { type: "perform", actionId: "act_talk_herbalist" },
      { type: "choose", optionId: "opt_herbalist_teach" },
      { type: "move", to: "loc_village" },
      { type: "move", to: "loc_forest_spring" },
      { type: "perform", actionId: "act_search_spring" },
      { type: "move", to: "loc_village" },
      { type: "perform", actionId: "act_talk_elder" },
      { type: "choose", optionId: "opt_tell_spring_arrows" }
    ];
    for (const action of actions) app.dispatch(action);
  });
  const next = page.locator("#linkedCaseNext");
  await expect(page.locator("#linkedCaseLedger")).toBeVisible();
  await expect(next).not.toContainText("덫 표식");
  await expect(next.getByRole("button", { name: LABEL })).toHaveCount(0);
  // The costed patrol is a real game action. Its result is not automatically
  // disclosed as personal knowledge.
  await next.getByRole("button", { name: "마을 사람들과 샘길 표식을 놓는다 (2시간, 기력 2)" }).click();
  await expect.poll(() => page.evaluate(() => window.__v2App.getState().flags.spring_patrol_trap_found)).toBe(true);
  await expect(next).not.toContainText("덫 표식");
  await expect(next.getByRole("button", { name: LABEL })).toHaveCount(0);

  await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
  await page.locator("#choiceOptions").getByRole("button", { name: "폐허에 대해 묻는다" }).click();
  const heard = await page.evaluate(() => {
    const s = window.__v2App.getState();
    return s.knowledge[s.player.actorId]?.rum_spring_trap_mark;
  });
  expect(heard.sources).toEqual(["npc_elder"]);
  await expect(next).toContainText("아직 전언");
  await expect(next).toContainText("숲속 샘에서 확인");
  await expect(next.getByRole("button", { name: LABEL })).toHaveCount(0);

  await page.locator("#saveSlotInput").fill("j3-patrol-followup-ui");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("j3-patrol-followup-ui");
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: "j3-patrol-followup-ui" })
    .getByRole("button", { name: "불러오기" }).click();
  await expect(next).toContainText("아직 전언");
  await page.locator("#moves button", { hasText: "숲속 샘" }).click();
  const shortcut = next.getByRole("button", { name: LABEL });
  await expect(shortcut).toBeVisible();
  await shortcut.click();
  await expect.poll(() => page.evaluate(() => {
    const s = window.__v2App.getState();
    return s.knowledge[s.player.actorId]?.rum_spring_trap_mark?.sources?.includes("obs_loc_forest_spring");
  })).toBe(true);
  await expect(next).toContainText("직접 확인했다");
  await expect(shortcut).toHaveCount(0);
  const verified = await page.evaluate(() => {
    const s = window.__v2App.getState();
    return s.knowledge[s.player.actorId].rum_spring_trap_mark;
  });
  expect(verified.sources).toContain("npc_elder");
  expect(verified.sources).toContain("obs_loc_forest_spring");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
