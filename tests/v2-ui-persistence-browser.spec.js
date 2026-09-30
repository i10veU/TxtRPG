// V2-Core-33 browser scenarios (Issue #96): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- a result that outlives the
// moment it was made. The bandits are cowed and the elder settles their fate;
// much later, in another place, the market notices -- once -- and only for the
// player who made those decisions.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched: the earlier choices are exactly what they were.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// picked in V2-Core-22 so both real check() calls land on a non-fail tier
const CANONICAL_SEED = "frontier-canonical-4";
const REPORT = "조사에서 알아낸 것을 전한다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";
const MARKET_TEXT = "도적단이 흩어졌다는 소식에 상인들이 안도하며";

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
const getLog = (page) => page.evaluate(() => window.__v2App.getLog());
const moneyOf = (state) => state.actors[state.player.actorId].money;
const marketPaid = (log) => log.filter((line) => line.includes(MARKET_TEXT)).length;

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

const saveTo = async (page, slot, count) => {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
};

test.describe("V2 persistent consequence (an earlier decision, a later place)", () => {
  test("the decision outlives time and travel: the market notices once, much later", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1-3. new game, the information, the village's backing, the confrontation
    await startCanonicalGame(page);
    await playToConfirmedVillage(page);
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    // 4. the decision that leaves a mark
    await act(page, "원로와 대화");
    await choiceButton(page, FATE).click();
    await expect(page.locator("#choice")).toBeHidden();
    const decided = await getState(page);
    expect(decided.relations["org_bandits:player_1"].tags).toEqual(["cowed"]);
    expect(decided.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    expect(decided.fired.evt_market_reopens).toBeUndefined();
    expect(marketPaid(await getLog(page))).toBe(0);
    const before = moneyOf(decided);

    // 5. much later: two days pass through the real wait action; nothing about the mark changes
    await page.evaluate(() => {
      window.__v2App.dispatch({ type: "wait", minutes: 600 });
      window.__v2App.dispatch({ type: "wait", minutes: 1440 });
    });
    const aged = await getState(page);
    expect(aged.time.minute).toBe(decided.time.minute + 2040);
    expect(aged.relations).toEqual(decided.relations);
    expect(moneyOf(aged)).toBe(before);

    // 6. in another place: the same move that has always been just a move now pays, once
    await move(page, "시장");
    await expect(page.locator("#log")).toContainText(MARKET_TEXT);
    await expect(page.locator("#status")).toContainText(`소지금 ${before + 3}`);
    const paid = await getState(page);
    expect(moneyOf(paid)).toBe(before + 3);
    // 7. the follow-up event is on record, and collecting it touches no relation
    expect(paid.fired.evt_market_reopens).toEqual({ count: 1, lastMinute: paid.time.minute });
    expect(paid.relations).toEqual(decided.relations);
    await move(page, "변경 마을");
    await move(page, "시장");
    expect(moneyOf(await getState(page))).toBe(before + 3);
    expect(marketPaid(await getLog(page))).toBe(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save -> reload -> load: the same visit gives the same result, other histories give none, and once survives the load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startCanonicalGame(page);
    await playToConfirmedVillage(page);

    // 5/8. save the moment before the decisions
    const atDecision = await getState(page);
    await saveTo(page, "slot_decision", 1);

    // branch X: report, confront, decide, then the market
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    await talkAndChoose(page, FATE);
    await move(page, "시장");
    const stateX = await getState(page);
    expect(moneyOf(stateX)).toBe(moneyOf(atDecision) + 3);
    await expect(page.locator("#log")).toContainText(MARKET_TEXT);
    // 8. save after collecting: the once record must survive a real reload
    await saveTo(page, "slot_paid", 2);

    // branch Y: backed, but the bandits' fate is never decided
    await reloadAndLoad(page, "slot_decision");
    expect(await getState(page)).toEqual(atDecision);
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    await move(page, "시장");
    const stateY = await getState(page);
    expect(moneyOf(stateY)).toBe(moneyOf(atDecision));
    expect(stateY.fired.evt_market_reopens).toBeUndefined();
    expect(marketPaid(await getLog(page))).toBe(0);

    // branch Z: no backing at all -- and the decision is rejected behind the UI's back (10)
    await reloadAndLoad(page, "slot_decision");
    await act(page, "도적 두목과 대면");
    await act(page, "원로와 대화");
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    const pendingBefore = (await getState(page)).pending;
    const unchanged = await page.evaluate(() => {
      const snapshot = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "choose", optionId: "opt_bandits_disperse" });
      return snapshot === JSON.stringify(window.__v2App.getState());
    });
    expect(unchanged).toBe(true);
    expect((await getState(page)).pending).toEqual(pendingBefore);
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    await move(page, "시장");
    const stateZ = await getState(page);
    expect(moneyOf(stateZ)).toBe(moneyOf(atDecision));
    expect(stateZ.fired.evt_market_reopens).toBeUndefined();
    expect(marketPaid(await getLog(page))).toBe(0);

    // 9. branch X again from the saved moment: identical to the first time
    await reloadAndLoad(page, "slot_decision");
    await talkAndChoose(page, REPORT);
    await act(page, "도적 두목과 대면");
    await talkAndChoose(page, FATE);
    await move(page, "시장");
    expect(await getState(page)).toEqual(stateX);

    // the state saved after collecting still holds the once record: a second visit pays nothing
    await reloadAndLoad(page, "slot_paid");
    expect(await getState(page)).toEqual(stateX);
    await move(page, "변경 마을");
    await move(page, "시장");
    expect(moneyOf(await getState(page))).toBe(moneyOf(stateX));
    expect(marketPaid(await getLog(page))).toBe(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
