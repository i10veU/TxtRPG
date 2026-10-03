// V2-Core-35 browser scenarios (Issue #100): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- a world flag is not a
// character's own proof. `ruins_secret_confirmed` is the world's record; the
// report option and the confrontation ask for the relic that only the
// character's own successful investigation puts in their own inventory. A
// successor can read the world's history, but has to earn their own proof.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";
// a seed on which the predecessor's and the successor's own investigations both succeed
// (found by tests/v2/data-world.test.js's seedWhereBothSucceed(): the first one)
const TWO_SUCCESSES_SEED = "successor-gate-0";
const REPORT = "조사에서 알아낸 것을 전한다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";
const NEWS = "도적단의 소식을 묻는다";
const NEWS_TEXT = "원로는 폐허의 도적단이 흩어졌다는 소식을 들려준다";
const NEW_CHARACTER = "새 캐릭터로 시작 (start_wanderer)"; // V2-Core-53: one button per background
const CONFRONT = "도적 두목과 대면";

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
const actionButton = (page, label) => page.locator("#actions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const relic = (state, actorId) => state.actors[actorId].inventory.item_relic ?? 0;

async function startGame(page, seed) {
  await page.evaluate((s) => window.__v2App.newGame(s), seed);
  await expect(page.locator("#game")).toBeVisible();
}

// talk to the elder and pick one of the options
async function talkAndChoose(page, optionLabel) {
  await act(page, "원로와 대화");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, optionLabel).click();
  await expect(page.locator("#choice")).toBeHidden();
}

// observe x2, the elder's rumor, the lantern, the ruins, the investigation, and back to
// the village to rest: this character's own proof is in their inventory, the world flag is set
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

// ...and the rest of the first character's story: the report, the confrontation, the decision
async function playToDecision(page) {
  await playToConfirmedVillage(page);
  await talkAndChoose(page, REPORT);
  await act(page, CONFRONT);
  await talkAndChoose(page, FATE);
}

// the character dies at the ruins through the real wait button (rested to 6 HP, the hazard takes
// 4 on arrival and 4 more after half an hour), and the player starts a new one
async function dieAndStartSuccessor(page) {
  await move(page, "폐허");
  await expect(page.locator("#status")).toContainText("HP 2/10");
  await page.locator("#waitBtn").click();
  await expect(page.locator("#status")).toContainText("HP 0/10");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, NEW_CHARACTER).click();
  await expect(page.locator("#choice")).toBeHidden();
  await expect(page.locator("#location")).toContainText("변경 마을");
}

async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

const saveTo = async (page, slot, count) => {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
};

// dispatch an action behind the UI's back; true when the engine changed nothing
const dispatchUnchanged = (page, action) =>
  page.evaluate((a) => {
    const snapshot = JSON.stringify(window.__v2App.getState());
    window.__v2App.dispatch(a);
    return snapshot === JSON.stringify(window.__v2App.getState());
  }, action);
const choose = (optionId) => ({ type: "choose", optionId });

test.describe("V2 successor gates (the world's flag is not a character's own proof)", () => {
  test("the successor reads the world's history but cannot report or confront on the predecessor's proof", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1-4. the first character: rumor, investigation, the proof, the report (a personal consequence)
    await startGame(page, CANONICAL_SEED);
    await playToDecision(page);
    const decided = await getState(page);
    expect(relic(decided, "player_1")).toBe(1);
    expect(decided.flags.ruins_secret_confirmed).toBe(true);
    expect(decided.relations["npc_elder:player_1"].tags).toEqual(["confidant"]);
    expect(decided.relations["org_bandits:player_1"].tags).toEqual(["cowed"]);

    // 5-6. the first character dies, and the player starts a new one
    await dieAndStartSuccessor(page);
    const successor = await getState(page);
    expect(successor.player.actorId).toBe("player_2");
    expect(relic(successor, "player_2")).toBe(0);
    // the world's record is there for the successor to read; the proof is not
    expect(successor.flags.ruins_secret_confirmed).toBe(true);
    expect(successor.cases.case_ruins_mystery.stage).toBe("resolved");
    await saveTo(page, "slot_successor", 1);

    // 7. behind the UI's back the personal choices are refused, and nothing changes
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, REPORT)).toHaveCount(0);
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    const pendingBefore = (await getState(page)).pending;
    expect(await dispatchUnchanged(page, choose("opt_report_findings"))).toBe(true);
    expect((await getState(page)).pending).toEqual(pendingBefore);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();

    // 8. ...while the world's history is offered to them
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(NEWS_TEXT);
    const afterNews = await getState(page);
    expect(afterNews.knowledge.player_2.rum_bandits_fate).toBeDefined();
    expect(afterNews.relations["npc_elder:player_2"]).toBeUndefined(); // information only since V2-Core-55 (D-84)
    expect(afterNews.flags).toEqual(successor.flags);
    expect(afterNews.cases).toEqual(successor.cases);

    // the confrontation is shown locked, and stays locked with the keen-eye unlock: the world flag alone is not proof
    const locked = actionButton(page, CONFRONT);
    await expect(locked).toBeDisabled();
    await expect(locked).toHaveText(`${CONFRONT} (잠김)`);
    for (let i = 0; i < 4; i += 1) await act(page, "마을 살피기");
    expect((await getState(page)).actors.player_2.growth.growth_wanderer.unlocks).toEqual({ unl_keen_eye: true });
    await expect(actionButton(page, CONFRONT)).toBeDisabled();
    expect(await dispatchUnchanged(page, { type: "perform", actionId: "act_confront_leader" })).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load: the same input gives the same result for the successor", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startGame(page, CANONICAL_SEED);
    await playToDecision(page);
    await dieAndStartSuccessor(page);

    // 9. save the successor's first moment
    const atStart = await getState(page);
    await saveTo(page, "slot_b", 1);

    // the same inputs: refused personal choice, then the world's news
    const sequence = async () => {
      await act(page, "원로와 대화");
      await expect(choiceButton(page, REPORT)).toHaveCount(0);
      expect(await dispatchUnchanged(page, choose("opt_report_findings"))).toBe(true);
      await choiceButton(page, NEWS).click();
      await expect(page.locator("#choice")).toBeHidden();
      return getState(page);
    };
    const first = await sequence();

    // 10. reload, load the saved moment, repeat: identical
    await reloadAndLoad(page, "slot_b");
    expect(await getState(page)).toEqual(atStart);
    expect(await sequence()).toEqual(first);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the successor earns their own proof, and then the report and the confrontation open for them", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startGame(page, TWO_SUCCESSES_SEED);
    await playToConfirmedVillage(page);
    expect(relic(await getState(page), "player_1")).toBe(1);
    await dieAndStartSuccessor(page);

    // the successor asks the elder, but the rumor is not proof: no report yet
    await talkAndChoose(page, "폐허에 대해 묻기");
    await act(page, "원로와 대화");
    await expect(choiceButton(page, REPORT)).toHaveCount(0);
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(relic(await getState(page), "player_2")).toBe(0);

    // their own investigation
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    await move(page, "변경 마을");
    await act(page, "마을에서 쉬기");
    const earned = await getState(page);
    expect(relic(earned, "player_2")).toBe(1);
    expect(relic(earned, "player_1")).toBe(1);

    // now the proof is theirs: the report is offered and accepted, on their own edge
    await talkAndChoose(page, REPORT);
    const reported = await getState(page);
    expect(reported.relations["npc_elder:player_2"].tags).toEqual(["confidant"]);
    // the predecessor only investigated and never reported, so their own edge carries no tag
    expect(reported.relations["npc_elder:player_1"].tags).toEqual([]);
    await expect(actionButton(page, CONFRONT)).toBeEnabled();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
