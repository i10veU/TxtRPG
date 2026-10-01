// V2-Core-44 browser scenario (Issue #120, D-71 (3) decided): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The bandits are dispersed, the game is saved, the page is reloaded and the save loaded, and
// the character investigates the ruins again -- successfully, on this seed. The dispersal stands:
// the leader is not a member again, the elder still tells of it, and the fate cannot be decided
// twice. Every older spec is untouched except the succession spec, which follows the decision.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// the investigation, the confrontation and the second investigation all succeed on this seed
// (tests/v2/data-world-history.test.js uses the same `history-<n>` seeds)
const SEED = "history-41";
const NEWS = "도적단의 소식을 묻는다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";

const P = (actionId) => ({ type: "perform", actionId });
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" }, P("act_buy_lantern"), { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" },
  P("act_investigate_ruins"), { type: "move", to: "loc_village" }, P("act_rest_village"), P("act_talk_elder"),
  { type: "choose", optionId: "opt_report_findings" }, P("act_confront_leader"), P("act_talk_elder"),
  { type: "choose", optionId: "opt_bandits_disperse" }
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

const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const membership = (state) => state.relations["npc_bandit_leader:org_bandits"].tags;

test.describe("V2 world history (a settled world edge is not undone by a later investigation)", () => {
  test("dispersed -> save -> reload -> load -> investigate again: the dispersal stands", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // the decided history, driven through the app's own dispatch
    const dispersed = await page.evaluate(async ({ seed, actions }) => {
      await window.__v2App.newGame(seed);
      actions.forEach((action) => window.__v2App.dispatch(action));
      return window.__v2App.getState();
    }, { seed: SEED, actions: TO_DISPERSAL });
    expect(membership(dispersed)).toEqual([]);
    expect(dispersed.cases.case_ruins_mystery.stage).toBe("resolved");

    // saved through the UI, the page reloaded, the save loaded through the UI
    await page.locator("#saveSlotInput").fill("slot_history");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_history" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(dispersed);

    // back to the ruins with the real buttons, and a successful second investigation
    await act(page, "마을에서 쉬기");
    await act(page, "마을에서 쉬기");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    const searched = await getState(page);
    expect(searched.attempts).toEqual(dispersed.attempts); // no attemptKey on this check
    expect(searched.actors.player_1.inventory.item_relic).toBe(2); // the second success did happen
    expect(membership(searched)).toEqual([]); // ...and did not bring the gang back
    await move(page, "변경 마을");

    // the elder: the news of the dispersal is still told, and the fate cannot be decided again
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(membership(await getState(page))).toEqual([]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
