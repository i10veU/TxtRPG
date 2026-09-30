// V2-Core-30 browser scenarios (Issue #90): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- the information loop:
// elder dialogue -> rumor (knowledge) -> lantern -> ruins -> investigation
// (available only because of the rumor) -> the rumor confirmed -> confrontation,
// plus save -> reload -> load.
//
// The UI does not render `knowledge`; a player learns things from the log text
// and from which actions are offered. The knowledge state itself is read through
// the same `__v2App.getView()` hook the other specs use. Node coverage of the
// same rules lives in tests/v2/data-world.test.js.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";

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
const actionButton = (page, label) => page.locator("#actions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const getRumor = (page) => page.evaluate(() => window.__v2App.getView().knowledge?.rum_ruins_secret ?? null);

async function startCanonicalGame(page) {
  await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);
  await expect(page.locator("#game")).toBeVisible();
}

// talk to the elder and pick one of the two options
async function talkToElder(page, optionLabel) {
  await act(page, "원로와 대화");
  await expect(page.locator("#choice")).toBeVisible();
  await page.locator("#choiceOptions button", { hasText: optionLabel }).click();
  await expect(page.locator("#choice")).toBeHidden();
}

test.describe("V2 information loop (elder rumor -> investigation -> confirmation)", () => {
  test("elder rumor -> lantern -> ruins -> investigation confirms the rumor -> confrontation", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1. new game: the player knows nothing yet
    await startCanonicalGame(page);
    await expect(page.locator("#location")).toContainText("변경 마을");
    expect(await getRumor(page)).toBeNull();
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");

    // 2. the elder dialogue offers both options through the real choice UI
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" })).toHaveCount(1);
    await expect(page.locator("#choiceOptions button", { hasText: "안부만 묻기" })).toHaveCount(1);
    await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" }).click();
    await expect(page.locator("#choice")).toBeHidden();

    // 3. the rumor result: told in the log, recorded as the player's knowledge
    await expect(page.locator("#log")).toContainText("원로는 목소리를 낮추며");
    expect(await getRumor(page)).toEqual({
      rumorId: "rum_ruins_secret",
      factId: "fact_ruins_secret",
      claim: "bandit_hideout",
      source: "npc_elder",
      sources: ["npc_elder"],
      confidence: 60,
      confirmations: 1,
      firstSeenDay: 0,
      lastSeenDay: 0
    });
    // the truth behind the rumor is not in the player's view, and no raw ids leak onto the page
    expect(await page.evaluate(() => "facts" in window.__v2App.getView())).toBe(false);
    await expect(page.locator("#game")).not.toContainText("fact_ruins_secret");

    // 4. market -> lantern
    await move(page, "시장");
    await act(page, "등불 구입");
    await expect(page.locator("#status")).toContainText("소지금 3");

    // 5. to the ruins: with the rumor and the lantern the investigation is offered
    await move(page, "변경 마을");
    await move(page, "폐허");
    await expect(page.locator("#location")).toContainText("폐허");
    await expect(actionButton(page, "폐허 조사")).toBeEnabled();

    // 6. investigation (a real check)
    await act(page, "폐허 조사");
    const log = await page.evaluate(() => window.__v2App.getLog());
    expect(log.some((line) => line.includes("판정:"))).toBe(true);

    // 7. the information is confirmed: same claim, now also from what the player saw
    await expect(page.locator("#log")).toContainText("등불 아래 드러난 흔적");
    const confirmed = await getRumor(page);
    expect(confirmed.claim).toBe("bandit_hideout");
    expect(confirmed.confirmations).toBe(2);
    expect(confirmed.sources).toEqual(["npc_elder", "obs_loc_ruins"]);
    const state = await getState(page);
    expect(state.facts.fact_ruins_secret.value).toBe("bandit_hideout");
    expect(state.flags.ruins_secret_confirmed).toBe(true);

    // 9. confrontation, existing gating (confirmed flag + unlock) and result; leave
    // the hazard first and recover, as in the canonical loop
    await move(page, "변경 마을");
    await act(page, "마을에서 쉬기");
    await expect(actionButton(page, "도적 두목과 대면")).toBeEnabled();
    await act(page, "도적 두목과 대면");
    const final = await getState(page);
    expect(final.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(final.time.minute).toBe(270);
    expect(final.actors.player_1.hp).toEqual({ current: 6, max: 10 });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("without the elder's rumor the investigation is not offered, and asking later opens it", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);

    // small talk teaches nothing
    await talkToElder(page, "안부만 묻기");
    expect(await getRumor(page)).toBeNull();

    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");

    // 8. lantern in hand, at the ruins -- but the action is simply not there, and
    // dispatching it behind the UI's back does nothing (no reason is shown)
    await expect(page.locator("#location")).toContainText("폐허");
    expect((await getState(page)).actors.player_1.inventory.item_lantern).toBe(1);
    await expect(actionButton(page, "폐허 조사")).toHaveCount(0);
    const unchanged = await page.evaluate(() => {
      const before = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "perform", actionId: "act_investigate_ruins" });
      return before === JSON.stringify(window.__v2App.getState());
    });
    expect(unchanged).toBe(true);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();

    // not a dead end: go back, ask about the ruins, return
    await move(page, "변경 마을");
    await talkToElder(page, "폐허에 대해 묻기");
    expect((await getRumor(page)).confirmations).toBe(1);
    await move(page, "폐허");
    await expect(actionButton(page, "폐허 조사")).toBeEnabled();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load keeps the knowledge and the same investigation result", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);

    await talkToElder(page, "폐허에 대해 묻기");
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    const beforeInvestigate = await getState(page);
    const rumorBefore = await getRumor(page);
    expect(rumorBefore.confirmations).toBe(1);

    await page.locator("#saveSlotInput").fill("slot_rumor");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    // the next action on the live game
    await act(page, "폐허 조사");
    const resultLive = await getState(page);
    const rumorLive = await getRumor(page);
    const checkLive = (await page.evaluate(() => window.__v2App.getLog())).filter((line) => line.includes("판정:"));
    expect(rumorLive.confirmations).toBe(2);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await expect(page.locator("#menu")).toBeVisible();
    await page.locator("#slotList li", { hasText: "slot_rumor" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();

    // 10. the loaded game is the saved one: same state, same knowledge, investigation still offered
    expect(await getState(page)).toEqual(beforeInvestigate);
    expect(await getRumor(page)).toEqual(rumorBefore);
    await expect(actionButton(page, "폐허 조사")).toBeEnabled();

    await act(page, "폐허 조사");
    expect(await getState(page)).toEqual(resultLive);
    expect(await getRumor(page)).toEqual(rumorLive);
    const checkLoaded = (await page.evaluate(() => window.__v2App.getLog())).filter((line) => line.includes("판정:"));
    expect(checkLoaded).toEqual(checkLive);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
