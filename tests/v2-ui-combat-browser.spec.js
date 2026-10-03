// V2-Core-50 browser scenario (Issue #133): the first fight through the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The fight is started and every exchange chosen with the real buttons; the game is saved in
// the middle of the fight, the page reloaded and the save loaded, and the fight goes on to the
// leader's fall; the victor then finds the market's relief. A second run breaks off the fight.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// on this seed the investigation succeeds and four frontal exchanges fell the leader
// (tests/v2/data-world-combat.test.js runs the same path over many seeds)
const SEED = "history-0";
const FIGHT = "도적 두목과 싸운다";
const STRIKE = "정면으로 맞붙는다";
const FLEE = "물러서서 달아난다";
const START_TEXT = "그가 칼을 뽑는다";
const VICTORY_TEXT = "도적 두목이 쓰러진다";
const FLEE_TEXT = "마을로 달아난다";
const MARKET_TEXT = "상인들이 안도하며";

const P = (actionId) => ({ type: "perform", actionId });
const READY = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" }, P("act_buy_lantern"), { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" },
  P("act_investigate_ruins"), { type: "move", to: "loc_village" }, P("act_rest_village"), P("act_rest_village"),
  { type: "move", to: "loc_ruins" }
];

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
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
async function startReady(page) {
  await page.evaluate(async ({ seed, actions }) => {
    await window.__v2App.newGame(seed);
    actions.forEach((action) => window.__v2App.dispatch(action));
  }, { seed: SEED, actions: READY });
  await expect(page.locator("#game")).toBeVisible();
}
async function startFight(page) {
  await page.locator("#actions button", { hasText: FIGHT }).click();
  await expect(page.locator("#choice")).toBeVisible();
  await expect(page.locator("#log")).toContainText(START_TEXT);
}

test.describe("V2 first combat (the character against the bandit leader)", () => {
  test("exchanges through the real buttons, a save -> reload -> load mid-fight, the leader's fall, the market's relief", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startReady(page);
    await startFight(page);
    await expect(choiceButton(page, STRIKE)).toHaveCount(1);
    await expect(choiceButton(page, FLEE)).toHaveCount(1);

    // the first exchange, then a save in the middle of the fight
    await choiceButton(page, STRIKE).click();
    await expect(page.locator("#choice")).toBeVisible();
    const midFight = await getState(page);
    expect(midFight.pending).toEqual({ kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" });
    expect(midFight.actors.npc_bandit_leader.hp.current).toBeLessThan(10);
    await page.locator("#saveSlotInput").fill("slot_fight");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_fight" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(midFight);
    await expect(page.locator("#choice")).toBeVisible();

    // the fight goes on until it ends
    for (let i = 0; i < 10 && (await page.locator("#choice").isVisible()); i += 1) await choiceButton(page, STRIKE).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(VICTORY_TEXT);
    const won = await getState(page);
    expect(won.actors.npc_bandit_leader.alive).toBe(false);
    expect(won.actors.player_1.alive).toBe(true);
    expect(won.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(won.relations["org_bandits:player_1"].tags).toContain("cowed");
    await expect(page.locator("#actions button", { hasText: FIGHT })).toHaveCount(0);
    expect(await page.evaluate(() => "actors" in window.__v2App.getView())).toBe(false); // the NPC actor stays out of the view

    // the victor finds the market's relief
    await page.locator("#moves button", { hasText: "변경 마을" }).click();
    await page.locator("#moves button", { hasText: "시장" }).click();
    await expect(page.locator("#log")).toContainText(MARKET_TEXT);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("breaking off: back in the village, the leader alive with his wounds", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startReady(page);
    await startFight(page);
    await choiceButton(page, STRIKE).click();
    await expect(page.locator("#choice")).toBeVisible();
    const wounded = (await getState(page)).actors.npc_bandit_leader.hp.current;

    await choiceButton(page, FLEE).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(FLEE_TEXT);
    const fled = await getState(page);
    expect(fled.actors.player_1.locationId).toBe("loc_village");
    expect(fled.actors.npc_bandit_leader).toMatchObject({ alive: true, hp: { current: wounded, max: 10 } });
    expect(fled.relations["npc_bandit_leader:player_1"].score).toBeLessThan(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
