// V2-Core-59 browser scenario (Issue #152, #147 Phase D, D-88): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The leader pays for his heavy blow with his own stamina: on this seed the first frontal
// strike fails -- the log tells his blow, the player loses 4 (the plain hit is 3), his stamina 6 -> 3
// -- and it survives save -> reload -> load; the next exchange succeeds, so no blow and no cost.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-1"; // the search succeeds; the first strike fails, the second succeeds (tests/v2/data-world-npc-capability.test.js)
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const READY = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"),
  M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_fight_leader")
];
const BLOW = "두목이 온 힘을 실어 칼을 내려친다.";

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
const leaderStamina = async (page) => (await getState(page)).actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina;
const strike = (page) => page.locator("#choiceOptions button", { hasText: "정면으로 맞붙는다" }).click();
const logCount = async (page, text) => (await page.locator("#log").innerText()).split(text).length - 1;

test.describe("V2 NPC capability (the leader's stamina pays for his heavy blow)", () => {
  test("a failed strike draws his blow (-4, his stamina 6 -> 3), kept through save/load; a success draws none", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), READY);
    expect(await leaderStamina(page)).toEqual({ current: 6, max: 6 });
    await expect(page.locator("#status")).toContainText("HP 6/10");

    await strike(page);
    await expect(page.locator("#log")).toContainText(BLOW);
    await expect(page.locator("#status")).toContainText("HP 2/10"); // 6 - (3 + 1)
    expect(await leaderStamina(page)).toEqual({ current: 3, max: 6 });

    await page.locator("#saveSlotInput").fill("slot_blow");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_blow" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);
    expect(await leaderStamina(page)).toEqual({ current: 3, max: 6 });

    // the next exchange succeeds: he is hit, no blow, nothing paid
    const blowsBefore = await logCount(page, BLOW);
    await strike(page);
    await expect.poll(async () => (await getState(page)).actors.npc_bandit_leader.hp.current).toBe(5);
    expect(await logCount(page, BLOW)).toBe(blowsBefore);
    expect(await leaderStamina(page)).toEqual({ current: 3, max: 6 });
    await expect(page.locator("#status")).toContainText("HP 2/10");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
