// V2-Core-58 browser scenario (Issue #150, #147 Phase B, D-87): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. New Game -> buy the iron sword (owned, not wielded: no technique) -> "철검을 든다" (the status
// shows it in hand) -> save -> reload -> load (still in hand) -> the fight offers "철검으로 베어 든다",
// used with the real button -> flee -> "철검을 내려놓는다" -> the fight no longer offers it; the sword
// is still owned. The scout can buy and wield it too.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "frontier-canonical-4"; // the investigation succeeds (tests/v2/data-world-reputation.test.js)
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const TO_RELIC = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"),
  M("loc_market"), P("act_buy_lantern")
];
const ON_TO_FIGHT = [
  M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"), M("loc_ruins"), P("act_fight_leader")
];
const CUT = "철검으로 베어 든다";

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
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const actionButton = (page, label) => page.locator("#actions button", { hasText: label });
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const status = (page) => page.locator("#status");
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatchAll = (page, actions) => page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), actions);

test.describe("V2 equipment (owned is not wielded; the sword in hand opens a technique)", () => {
  test("buy -> equip -> save/reload/load -> the technique -> unequip -> gone", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, TO_RELIC);

    // buy: owned, not wielded
    await act(page, "철검 구입");
    await expect(status(page)).toContainText("소지품: 철검 x1, 낡은 등불 x1");
    await expect(status(page)).not.toContainText("장비:");
    await expect(status(page)).toContainText("소지금 0");

    // equip with the real button
    await act(page, "철검을 든다");
    await expect(status(page)).toContainText("장비: hand 철검");
    await expect(status(page)).toContainText("소지품: 철검 x1, 낡은 등불 x1"); // still one, still owned
    await expect(actionButton(page, "철검을 든다")).toHaveCount(0);
    await expect(actionButton(page, "철검을 내려놓는다")).toHaveCount(1);

    // save -> reload -> load: still in hand
    await page.locator("#saveSlotInput").fill("slot_sword");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    expect(saved.actors.player_1.loadout).toEqual({ hand: "item_iron_sword" });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_sword" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);
    await expect(status(page)).toContainText("장비: hand 철검");

    // the fight offers the technique; use it
    await dispatchAll(page, ON_TO_FIGHT);
    await expect(choiceButton(page, "정면으로 맞붙는다")).toHaveCount(1);
    await expect(choiceButton(page, CUT)).toHaveCount(1);
    await choiceButton(page, CUT).click();
    await expect(page.locator("#log")).toContainText("판정:");
    expect((await getState(page)).actors.player_1.growth.growth_wanderer.proficiency.combat).toBe(5);

    // on this seed the leader stands after the cut (10 -> 3): flee, lower the sword -- the
    // technique is gone, the sword still owned
    await expect(page.locator("#choice")).toBeVisible();
    await choiceButton(page, "물러서서 달아난다").click();
    await expect(page.locator("#location")).toContainText("변경 마을");
    await act(page, "철검을 내려놓는다");
    await expect(status(page)).not.toContainText("장비:");
    await expect(status(page)).toContainText("철검 x1");
    const lowered = await getState(page);
    expect(lowered.actors.player_1.loadout).toEqual({});
    expect(lowered.actors.npc_bandit_leader.alive).toBe(true);
    await dispatchAll(page, [M("loc_ruins"), P("act_fight_leader")]);
    await expect(choiceButton(page, "정면으로 맞붙는다")).toHaveCount(1);
    await expect(choiceButton(page, CUT)).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the scout buys and wields it too; the wanderer without it has nothing to wield", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#backgroundSelect").selectOption("start_scout");
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(actionButton(page, "철검을 든다")).toHaveCount(0);
    await page.locator("#moves button", { hasText: "시장" }).click();
    await act(page, "철검 구입");
    await act(page, "철검을 든다");
    await expect(status(page)).toContainText("장비: hand 철검");
    await expect(status(page)).toContainText("특성: investigation_talent, night_vision");
    await expect(status(page)).toContainText("소지금 0");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
