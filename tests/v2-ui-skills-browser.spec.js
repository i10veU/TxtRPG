// V2-Core-52 browser scenario (Issue #137, Skill Decision = A, D-81): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium, against the real world data pack. Practice grows
// skills at thresholds, and the status shows them: the first observation (15 points) gives no rank,
// the second (30) the first investigation rank; the successful search (60) the third and the keen
// eye; four exchanges of the fight (combat 20) the first swordsmanship rank. Real buttons for the
// practice and the fight.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// on this seed the search succeeds and four frontal exchanges fell the leader
// (tests/v2-ui-combat-browser.spec.js, tests/v2/data-world-combat.test.js)
const SEED = "history-0";
const P = (actionId) => ({ type: "perform", actionId });
const TO_READY_AFTER_OBSERVING = [
  P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
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
const status = (page) => page.locator("#status");
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 skills (practice -> threshold -> rank, shown in the status)", () => {
  test("observing, searching and fighting raise the ranks the status shows; the practice adds no bonus of its own", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();

    await page.locator("#actions button", { hasText: "마을 살피기" }).click();
    await expect(status(page)).toContainText("investigation 15");
    await expect(status(page)).not.toContainText("기술:");
    await page.locator("#actions button", { hasText: "마을 살피기" }).click();
    await expect(status(page)).toContainText("기술: investigation 1 (Novice)"); // V2-Core-53: with its mastery tier

    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_READY_AFTER_OBSERVING);
    await expect(status(page)).toContainText("기술: investigation 3 (Apprentice)");
    await expect(status(page)).toContainText("해금: unl_keen_eye");

    await page.locator("#actions button", { hasText: "도적 두목과 싸운다" }).click();
    for (let i = 0; i < 10 && (await page.locator("#choice").isVisible()); i += 1) {
      await page.locator("#choiceOptions button", { hasText: "정면으로 맞붙는다" }).click();
    }
    await expect(page.locator("#choice")).toBeHidden();
    await expect(status(page)).toContainText("기술: investigation 3 (Apprentice), swordsmanship 1 (Novice)");
    const state = await getState(page);
    expect(state.actors.player_1.growth.growth_wanderer.proficiency.combat).toBe(20);
    expect(state.actors.player_1.growth.growth_wanderer.skills).toEqual({ investigation: 3, swordsmanship: 1 });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
