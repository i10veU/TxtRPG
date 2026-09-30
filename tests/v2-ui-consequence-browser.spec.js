// V2-Core-31 browser scenarios (Issue #92): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- confirmed information ->
// a relationship choice -> a different confrontation consequence, plus the
// rejection when the information is missing and save -> reload -> load.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched: not reporting to the elder is still a valid path.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";
const REPORT = "조사에서 알아낸 것을 전한다";
const BACKED_TEXT = "마을 사람들이 당신 뒤에 서 있다";

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
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const edge = (state, key) => state.relations?.[key];

async function startCanonicalGame(page) {
  await page.evaluate((seed) => window.__v2App.newGame(seed), CANONICAL_SEED);
  await expect(page.locator("#game")).toBeVisible();
}

// talk to the elder and pick one of the options
async function talkAndChoose(page, optionLabel) {
  await act(page, "원로와 대화");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, optionLabel).click();
  await expect(page.locator("#choice")).toBeHidden();
}

// observe x2, the elder's rumor, the lantern, the ruins, the investigation, and
// back to the village to rest -- the information is confirmed, HP is recovered
async function playToConfirmedVillage(page) {
  await act(page, "마을 살피기");
  await act(page, "마을 살피기");
  await talkAndChoose(page, "폐허에 대해 묻기");
  await move(page, "시장");
  await act(page, "등불 구입");
  await move(page, "변경 마을");
  await move(page, "폐허");
  await act(page, "폐허 조사");
  await move(page, "변경 마을");
  await act(page, "마을에서 쉬기");
}

async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 consequence loop (confirmed information -> elder -> confrontation)", () => {
  test("the report option follows the information, and the confrontation shows the difference", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1. new game
    await startCanonicalGame(page);
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");

    // 9. nothing confirmed yet: the report option is not offered, and choosing it
    // behind the UI's back is rejected while the choice stays pending
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, "폐허에 대해 묻기")).toHaveCount(1);
    await expect(choiceButton(page, "안부만 묻기")).toHaveCount(1);
    await expect(choiceButton(page, REPORT)).toHaveCount(0);
    const before = await getState(page);
    const unchanged = await page.evaluate(() => {
      const snapshot = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "choose", optionId: "opt_report_findings" });
      return snapshot === JSON.stringify(window.__v2App.getState());
    });
    expect(unchanged).toBe(true);
    expect(before.pending).toEqual({ kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();

    // 2. the elder's rumor (the choice was still answerable)
    await choiceButton(page, "폐허에 대해 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(edge(await getState(page), "npc_elder:player_1").score).toBe(5);

    // knowing the rumor is still not enough: the option waits for the confirmation
    await act(page, "원로와 대화");
    await expect(choiceButton(page, REPORT)).toHaveCount(0);
    const rumorOnly = await page.evaluate(() => {
      const snapshot = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "choose", optionId: "opt_report_findings" });
      return snapshot === JSON.stringify(window.__v2App.getState());
    });
    expect(rumorOnly).toBe(true);
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();

    // 3. the investigation confirms the information (fact + flag, as in V2-Core-30)
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    const confirmed = await getState(page);
    expect(confirmed.facts.fact_ruins_secret.value).toBe("bandit_hideout");
    expect(confirmed.flags.ruins_secret_confirmed).toBe(true);
    await move(page, "변경 마을");
    await act(page, "마을에서 쉬기");

    // 4. with the information in hand the elder offers a relationship choice
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, REPORT)).toHaveCount(1);
    await choiceButton(page, REPORT).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText("원로는 오래 침묵하다");
    const reported = await getState(page);
    // asked (+5), small talk while closing the earlier dialogue (+1), reported (+10)
    expect(edge(reported, "npc_elder:player_1")).toEqual({
      score: 16, mode: "cooperation", lastDay: 0, cooperationCount: 1, conflictCount: 0, tags: ["confidant"]
    });

    // 5/6. the confrontation is the same check and result, with a different consequence
    await expect(actionButton(page, "도적 두목과 대면")).toBeEnabled();
    await act(page, "도적 두목과 대면");
    await expect(page.locator("#log")).toContainText(BACKED_TEXT);
    const final = await getState(page);
    expect(final.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(final.time.minute).toBe(270);
    expect(edge(final, "npc_bandit_leader:player_1").score).toBe(-20);
    const relations = await page.evaluate(() => window.__v2App.getView().relations);
    expect(relations["npc_elder:player_1"].tags).toEqual(["confidant"]);
    expect(relations["npc_bandit_leader:player_1"].score).toBe(-20);
    expect(await page.evaluate(() => "facts" in window.__v2App.getView())).toBe(false);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load: the same input gives the same consequence, and not reporting gives the other", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);
    await playToConfirmedVillage(page);

    // 7. save the moment before the decision
    const atDecision = await getState(page);
    await page.locator("#saveSlotInput").fill("slot_decision");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    // branch A: report, then confront
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    const stateA = await getState(page);
    expect(edge(stateA, "npc_bandit_leader:player_1").score).toBe(-20);
    await expect(page.locator("#log")).toContainText(BACKED_TEXT);

    // branch B, from the same saved moment: confront without reporting
    await reloadAndLoad(page, "slot_decision");
    expect(await getState(page)).toEqual(atDecision);
    await act(page, "도적 두목과 대면");
    const stateB = await getState(page);
    expect(edge(stateB, "npc_bandit_leader:player_1").score).toBe(-10);
    expect(edge(stateB, "npc_elder:player_1").tags).toEqual([]);
    expect(stateB.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(stateB.time.minute).toBe(stateA.time.minute);
    await expect(page.locator("#log")).not.toContainText(BACKED_TEXT);

    // 8. branch A again from the saved moment: identical to the first time
    await reloadAndLoad(page, "slot_decision");
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    expect(await getState(page)).toEqual(stateA);
    await expect(page.locator("#log")).toContainText(BACKED_TEXT);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
