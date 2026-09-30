// V2-Core-32 browser scenarios (Issue #94): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- relationship -> organisation ->
// choice: a confrontation the village stood behind also cows the bandit
// organisation, and only then does the elder offer to take the bandits' fate.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched: the unbacked confrontation is exactly what it was.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";
const REPORT = "조사에서 알아낸 것을 전한다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";
const FATE_TEXT = "원로는 도적단 잔당에게 사람을 보내 해산을 권한다";

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

// dispatch the fate option behind the UI's back; true when the engine changed nothing
const dispatchFateUnchanged = (page) =>
  page.evaluate(() => {
    const snapshot = JSON.stringify(window.__v2App.getState());
    window.__v2App.dispatch({ type: "choose", optionId: "opt_bandits_disperse" });
    return snapshot === JSON.stringify(window.__v2App.getState());
  });

test.describe("V2 faction loop (relationship -> organisation -> elder choice)", () => {
  test("a backed confrontation cows the bandits, and only then the elder offers to take their fate", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1-3. new game, the information (rumor + confirmed investigation), and the relationship
    await startCanonicalGame(page);
    await playToConfirmedVillage(page);
    const confirmed = await getState(page);
    expect(confirmed.flags.ruins_secret_confirmed).toBe(true);
    // the investigation wrote the leader's membership of the organisation (an ordinary relation edge)
    expect(edge(confirmed, "npc_bandit_leader:org_bandits").tags).toEqual(["member"]);
    expect(edge(confirmed, "org_bandits:player_1")).toBeUndefined();
    await talkAndChoose(page, REPORT);
    expect(edge(await getState(page), "npc_elder:player_1").tags).toEqual(["confidant"]);

    // the organisation has not reacted yet: no fate option after the report alone
    await act(page, "원로와 대화");
    await expect(choiceButton(page, REPORT)).toHaveCount(1);
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    expect(await dispatchFateUnchanged(page)).toBe(true);
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();

    // 7. the confrontation -- the same check and result -- also cows the organisation
    await act(page, "도적 두목과 대면");
    const confronted = await getState(page);
    expect(confronted.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(edge(confronted, "org_bandits:player_1")).toEqual({
      score: -10, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: ["cowed"]
    });
    // the player sees the organisation's attitude, but not the leader's membership edge
    const relations = await page.evaluate(() => window.__v2App.getView().relations);
    expect(relations["org_bandits:player_1"].tags).toEqual(["cowed"]);
    expect(relations["npc_bandit_leader:org_bandits"]).toBeUndefined();

    // 4. the faction-related choice is now offered
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, FATE)).toHaveCount(1);
    await choiceButton(page, FATE).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(FATE_TEXT);
    const after = await getState(page);
    expect(edge(after, "npc_bandit_leader:org_bandits").tags).toEqual([]);
    expect(edge(after, "npc_elder:player_1").score).toBe(edge(confronted, "npc_elder:player_1").score + 5);
    expect(edge(after, "org_bandits:player_1")).toEqual(edge(confronted, "org_bandits:player_1"));

    // 10. the option closes itself: the leader is no longer a member
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    expect(await dispatchFateUnchanged(page)).toBe(true);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load: without the village's backing the organisation stays as it was", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);
    await playToConfirmedVillage(page);

    // 8. save the moment before the decision
    const atDecision = await getState(page);
    await page.locator("#saveSlotInput").fill("slot_faction");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    // branch A: report, confront, and the fate option is there
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    await act(page, "원로와 대화");
    await expect(choiceButton(page, FATE)).toHaveCount(1);
    const stateA = await getState(page);
    expect(edge(stateA, "org_bandits:player_1").tags).toEqual(["cowed"]);

    // branch B, from the same saved moment: confront without reporting -- the same
    // place and action, but no organisation edge and no fate option
    await reloadAndLoad(page, "slot_faction");
    expect(await getState(page)).toEqual(atDecision);
    await act(page, "도적 두목과 대면");
    const confrontedB = await getState(page);
    expect(confrontedB.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(edge(confrontedB, "org_bandits:player_1")).toBeUndefined();
    expect(edge(confrontedB, "npc_bandit_leader:org_bandits").tags).toEqual(["member"]);
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    // 10. the option is rejected behind the UI's back; the choice stays pending and answerable
    const pendingBefore = (await getState(page)).pending;
    expect(await dispatchFateUnchanged(page)).toBe(true);
    expect((await getState(page)).pending).toEqual(pendingBefore);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(edge(await getState(page), "org_bandits:player_1")).toBeUndefined();

    // 9. branch A again from the saved moment: identical to the first time
    await reloadAndLoad(page, "slot_faction");
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    await act(page, "원로와 대화");
    await expect(choiceButton(page, FATE)).toHaveCount(1);
    expect(await getState(page)).toEqual(stateA);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
