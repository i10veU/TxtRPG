// V2-Core-56 browser scenario (Issue #145, Gate 4 = C, D-85): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The status shows stamina; the real counter button costs 3; fleeing is free; time does not
// bring it back, the village rest does. A save with too little stamina hides the costly techniques
// (the strike stays); a save made before resources (no entry) is full -- shown 6/6, the counter
// offered -- through save -> reload -> load.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "frontier-canonical-4"; // the investigation succeeds (tests/v2/data-world-resource.test.js)
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const ASK = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_FIGHT = [
  P("act_observe_village"), P("act_observe_village"), ...ASK("opt_ask_ruins"),
  M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader")
];
const STRIKE = "정면으로 맞붙는다";
const COUNTER = "그의 공격을 읽고 받아친다";
const WEAK = "그의 오래된 상처를 노린다";

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
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const status = (page) => page.locator("#status");
const getState = (page) => page.evaluate(() => window.__v2App.getState());
// plant a save through the app's own storage module, from the current state changed by `mutate`
async function plant(page, slot, mutateSource) {
  await page.evaluate(async ({ slot, mutateSource }) => {
    const storage = await import("/v2/storage/idb.js");
    const copy = structuredClone(window.__v2App.getState());
    new Function("s", mutateSource)(copy);
    await storage.save(slot, copy, {});
  }, { slot, mutateSource });
}
async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 resources (stamina pays for the techniques)", () => {
  test("the counter costs 3, fleeing nothing; time does not refill, the rest does; too little hides the techniques; an old save is full", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await expect(status(page)).toContainText("자원: stamina 6/6");

    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_FIGHT);
    await expect(choiceButton(page, COUNTER)).toHaveCount(1);
    await expect(choiceButton(page, WEAK)).toHaveCount(1);
    await choiceButton(page, COUNTER).click();
    await expect(page.locator("#log")).toContainText("판정:");
    await expect(status(page)).toContainText("자원: stamina 3/6");

    // the fight goes on (on this seed the leader stands after the first counter); fleeing is free
    await choiceButton(page, "물러서서 달아난다").click();
    await expect(page.locator("#location")).toContainText("변경 마을");
    await expect(status(page)).toContainText("자원: stamina 3/6");
    await page.locator("#waitBtn").click();
    await expect(status(page)).toContainText("자원: stamina 3/6"); // no regeneration over time
    await page.locator("#actions button", { hasText: "마을에서 쉬기" }).click();
    await expect(status(page)).toContainText("자원: stamina 6/6");
    expect((await getState(page)).actors.player_1.growth.growth_wanderer.resources.stamina).toEqual({ current: 6, max: 6 });

    // back in the fight, from a save with 1 stamina: the costly techniques are not offered
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), [M("loc_ruins"), P("act_fight_leader")]);
    await expect(choiceButton(page, STRIKE)).toHaveCount(1);
    await plant(page, "slot_tired", "s.actors.player_1.growth.growth_wanderer.resources.stamina.current = 1;");
    await plant(page, "slot_old", "delete s.actors.player_1.growth.growth_wanderer.resources;");
    await reloadAndLoad(page, "slot_tired");
    await expect(status(page)).toContainText("자원: stamina 1/6");
    await expect(choiceButton(page, STRIKE)).toHaveCount(1);
    await expect(choiceButton(page, COUNTER)).toHaveCount(0);
    await expect(choiceButton(page, WEAK)).toHaveCount(0);

    // a save from before resources: no entry, shown full, the counter offered
    await reloadAndLoad(page, "slot_old");
    const old = await getState(page);
    expect(old.actors.player_1.growth.growth_wanderer.resources).toBeUndefined(); // not migrated, not repaired
    await expect(status(page)).toContainText("자원: stamina 6/6");
    await expect(choiceButton(page, COUNTER)).toHaveCount(1);
    await expect(choiceButton(page, WEAK)).toHaveCount(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
