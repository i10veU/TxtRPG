// V2-Core-29 browser scenarios (Issue #88): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- the expanded canonical loop:
// village -> market (lantern) -> ruins (investigate, hazard HP loss) ->
// village (rest, HP recovery), plus the location gates, that a dead actor is
// never revived by the recovery action, and save -> reload -> load.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. The
// older V2 specs stay in place; only their canonical-path steps were extended
// with the movement the location gates now require.
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

async function startCanonicalGame(page) {
  await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);
  await expect(page.locator("#game")).toBeVisible();
}

// V2-Core-30: the investigation needs the elder's rumor, so the loop starts here
async function askElder(page) {
  await act(page, "원로와 대화");
  await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" }).click();
  await expect(page.locator("#choice")).toBeHidden();
}

test.describe("V2 canonical loop (location gates / hazard / recovery)", () => {
  test("new game -> village -> market -> buy lantern -> ruins -> investigate -> hazard HP loss -> rest recovers HP", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1. new game
    await startCanonicalGame(page);
    await expect(page.locator("#location")).toContainText("변경 마을");
    await expect(page.locator("#status")).toContainText("HP 10/10");
    await expect(page.locator("#status")).toContainText("소지금 8");
    // in the village neither gated action is offered
    await expect(actionButton(page, "등불 구입")).toHaveCount(0);
    await expect(actionButton(page, "폐허 조사")).toHaveCount(0);
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");
    await askElder(page);

    // 2. village -> market
    await move(page, "시장");
    await expect(page.locator("#location")).toContainText("시장");

    // 3. buy the lantern at the market
    await expect(actionButton(page, "등불 구입")).toBeEnabled();
    await act(page, "등불 구입");
    await expect(page.locator("#status")).toContainText("소지금 3");
    expect((await getState(page)).actors.player_1.inventory.item_lantern).toBe(1);
    // the ruins action is still not offered outside the ruins, lantern or not
    await expect(actionButton(page, "폐허 조사")).toHaveCount(0);

    // 4. move to the ruins (village first; the link needs the lantern)
    await move(page, "변경 마을");
    await move(page, "폐허");
    await expect(page.locator("#location")).toContainText("폐허");

    // 6a. hazard HP loss on arrival (existing data.events + hp Effect)
    await expect(page.locator("#status")).toContainText("HP 6/10");
    await expect(page.locator("#log")).toContainText("무너진 벽돌");

    // 5. investigate at the ruins (a real check())
    await expect(actionButton(page, "폐허 조사")).toBeEnabled();
    await act(page, "폐허 조사");
    const log = await page.evaluate(() => window.__v2App.getLog());
    expect(log.some((line) => line.includes("판정:"))).toBe(true);
    // 6b. investigating takes 60 minutes; the hazard hit again while staying
    await expect(page.locator("#status")).toContainText("HP 2/10");

    // 7. back in the village the rest action recovers HP through the hp Effect
    await move(page, "변경 마을");
    await expect(page.locator("#status")).toContainText("HP 2/10");
    await act(page, "마을에서 쉬기");
    await expect(page.locator("#status")).toContainText("HP 6/10");
    const state = await getState(page);
    expect(state.actors.player_1.hp).toEqual({ current: 6, max: 10 });
    expect(state.actors.player_1.alive).not.toBe(false);
    await expect(page.locator("#log")).toContainText("상처를 돌본다");

    // the recovered player continues with the existing progression path
    await expect(actionButton(page, "도적 두목과 대면")).toBeEnabled();
    await act(page, "도적 두목과 대면");
    const final = await getState(page);
    expect(final.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(final.time.minute).toBe(270);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a gated action dispatched at the wrong location does not run", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);

    const dispatchAndCompare = (action) =>
      page.evaluate((a) => {
        const before = JSON.stringify(window.__v2App.getState());
        window.__v2App.dispatch(a);
        return before === JSON.stringify(window.__v2App.getState());
      }, action);

    // buy at the village: money is enough, but the location gate rejects it
    expect(await dispatchAndCompare({ type: "perform", actionId: "act_buy_lantern" })).toBe(true);
    // investigate away from the ruins (even holding the lantern, see below)
    expect(await dispatchAndCompare({ type: "perform", actionId: "act_investigate_ruins" })).toBe(true);

    // rest away from the village
    await move(page, "시장");
    expect(await dispatchAndCompare({ type: "perform", actionId: "act_rest_village" })).toBe(true);
    await expect(actionButton(page, "마을에서 쉬기")).toHaveCount(0);

    // holding the lantern at the market is still not enough to investigate
    await act(page, "등불 구입");
    expect(await dispatchAndCompare({ type: "perform", actionId: "act_investigate_ruins" })).toBe(true);
    await expect(actionButton(page, "폐허 조사")).toHaveCount(0);
    // the rejection is reported through the existing log line, not a crash
    await expect(page.locator("#error")).toBeHidden();
    await expect(page.locator("#log")).toContainText("할 수 없다");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("death still ends in newCharacter, and recovery never revives a dead actor", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);

    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    await page.locator("#waitBtn").click();
    await page.locator("#waitBtn").click();
    await expect(page.locator("#status")).toContainText("HP 0/10");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#actions")).toBeEmpty();

    // the recovery action dispatched behind the UI's back is rejected
    const deadState = await getState(page);
    expect(deadState.pending).toEqual({ kind: "newCharacter" });
    const unchanged = await page.evaluate(() => {
      const before = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "perform", actionId: "act_rest_village" });
      return before === JSON.stringify(window.__v2App.getState());
    });
    expect(unchanged).toBe(true);
    const stillDead = await getState(page);
    expect(stillDead.actors.player_1.hp.current).toBe(0);
    expect(stillDead.actors.player_1.alive).toBe(false);

    // succession is intact
    await page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작" }).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#status")).toContainText("HP 10/10");
    await expect(page.locator("#status")).toContainText("소지금 11");
    const after = await getState(page);
    expect(after.player.actorId).toBe("player_2");
    expect(after.actors.player_1.alive).toBe(false);
    expect(after.actors.player_1.hp.current).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load restores the state and the same next action gives the same result", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);

    await askElder(page);
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    const beforeInvestigate = await getState(page);

    await page.locator("#saveSlotInput").fill("slot_ruins");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    // the next action on the live game
    await act(page, "폐허 조사");
    const resultLive = await getState(page);
    const logLive = await page.evaluate(() => window.__v2App.getLog());
    expect(resultLive).not.toEqual(beforeInvestigate);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await expect(page.locator("#menu")).toBeVisible();
    await page.locator("#slotList li", { hasText: "slot_ruins" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();

    expect(await getState(page)).toEqual(beforeInvestigate);
    await expect(page.locator("#location")).toContainText("폐허");
    await expect(page.locator("#status")).toContainText("HP 6/10");
    await expect(actionButton(page, "폐허 조사")).toBeEnabled();

    await act(page, "폐허 조사");
    expect(await getState(page)).toEqual(resultLive);
    const logLoaded = await page.evaluate(() => window.__v2App.getLog());
    expect(logLoaded.filter((line) => line.includes("판정:"))).toEqual(logLive.filter((line) => line.includes("판정:")));

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
