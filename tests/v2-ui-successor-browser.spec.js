// V2-Core-34 browser scenarios (Issue #98): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- what a successor inherits.
// A character settles the bandits' fate (a change to the world), dies, and the
// player starts a new character: the world's history is still there for them to
// ask about, while the predecessor's own things (knowledge, the organisation's
// regard, growth, items) are not.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";
const REPORT = "조사에서 알아낸 것을 전한다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";
const NEWS = "도적단의 소식을 묻는다";
const NEWS_TEXT = "원로는 폐허의 도적단이 흩어졌다는 소식을 들려준다";
const NEW_CHARACTER = "새 캐릭터로 시작 (start_wanderer)"; // V2-Core-53: one button per background

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
const getView = (page) => page.evaluate(() => window.__v2App.getView());

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

// the information, the village's backing, the confrontation, and the elder's decision
async function playToDecision(page, { decide = true } = {}) {
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
  await talkAndChoose(page, REPORT);
  await act(page, "도적 두목과 대면");
  if (decide) await talkAndChoose(page, FATE);
}

// the character dies at the ruins through the real wait button (rested to 6 HP, the hazard
// takes 4 on arrival and 4 more after half an hour), and the player starts a new one
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

// dispatch a choice behind the UI's back; true when the engine changed nothing
const dispatchUnchanged = (page, optionId) =>
  page.evaluate((id) => {
    const snapshot = JSON.stringify(window.__v2App.getState());
    window.__v2App.dispatch({ type: "choose", optionId: id });
    return snapshot === JSON.stringify(window.__v2App.getState());
  }, optionId);

test.describe("V2 successor (what the world keeps, what a character keeps)", () => {
  test("the successor is offered the world's history, and none of the predecessor's own state", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1-3. the first character settles the bandits' fate: a change to the world
    await startCanonicalGame(page);
    await playToDecision(page);
    const decided = await getState(page);
    expect(decided.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(decided.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    expect(decided.flags.ruins_secret_confirmed).toBe(true);
    // the acting character is offered the news as well: it is the world's, not theirs
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    await choiceButton(page, "안부만 묻기").click();

    // 4. save the world as it stands
    await saveTo(page, "slot_world", 1);

    // 5-6. the first character dies, and the player starts a new one
    await dieAndStartSuccessor(page);
    const successor = await getState(page);
    expect(successor.player).toEqual({ actorId: "player_2", characterCount: 2 });
    expect(successor.actors.player_1.alive).toBe(false);
    await expect(page.locator("#status")).toContainText("HP 10/10");
    await expect(page.locator("#status")).toContainText("소지금 11");

    // what starting a character does not touch: the world's fields, the predecessor's edges and knowledge
    expect(successor.cases).toEqual(decided.cases);
    expect(successor.flags).toEqual(decided.flags);
    expect(successor.facts).toEqual(decided.facts);
    expect(successor.fired.evt_market_reopens).toBeUndefined();
    expect(successor.relations["npc_bandit_leader:org_bandits"]).toEqual(decided.relations["npc_bandit_leader:org_bandits"]);
    expect(Object.keys(successor.knowledge)).toEqual(["player_1"]);
    expect(successor.actors.player_2.inventory).toEqual({});

    // what the successor sees: nothing of the predecessor's own
    const view = await getView(page);
    expect(view.knowledge).toEqual({});
    expect(view.relations).toEqual({});
    expect(view.actor.id).toBe("player_2");

    // 7-8. the same place and action: the world's history is there, the personal decision is not
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    expect(await dispatchUnchanged(page, "opt_bandits_disperse")).toBe(true);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(NEWS_TEXT);
    const asked = await getState(page);
    // the effect is the asker's own; the world is as it was
    expect(asked.relations["npc_elder:player_2"].score).toBe(1);
    expect(asked.relations["npc_elder:player_1"]).toEqual(successor.relations["npc_elder:player_1"]);
    expect(asked.cases).toEqual(decided.cases);
    expect(asked.flags).toEqual(decided.flags);
    expect(asked.fired).toEqual(successor.fired);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load: the same input gives the same result, and another history gives none", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);
    await playToDecision(page);

    // 4. save before the character dies
    await saveTo(page, "slot_decided", 1);
    await dieAndStartSuccessor(page);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#choice")).toBeHidden();
    const stateX = await getState(page);
    await saveTo(page, "slot_successor", 2);

    // 9. reload: the same saved moment, the same input -> the same result
    await reloadAndLoad(page, "slot_decided");
    await dieAndStartSuccessor(page);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(await getState(page)).toEqual(stateX);

    // 10. the successor's own save comes back intact and offers the same news
    await reloadAndLoad(page, "slot_successor");
    expect(await getState(page)).toEqual(stateX);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1);
    await choiceButton(page, "안부만 묻기").click();

    // another history: the bandits' fate was never decided, so the world has no news to tell
    await page.evaluate(() => window.__v2App.backToMenu());
    await startCanonicalGame(page);
    await playToDecision(page, { decide: false });
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(0);
    expect(await dispatchUnchanged(page, "opt_ask_bandit_news")).toBe(true);
    await choiceButton(page, "안부만 묻기").click();
    await dieAndStartSuccessor(page);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(0);
    expect(await dispatchUnchanged(page, "opt_ask_bandit_news")).toBe(true);
    await expect(page.locator("#log")).toContainText("할 수 없다");
    await expect(page.locator("#error")).toBeHidden();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
