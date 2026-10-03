// V2-Core-55 browser scenario (Issue #143, Reputation Decision, D-84): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. Small talk and asking again earn no trust; asking about the ruins (+5) and reporting (+10)
// reach the elder's trust (15), which shows a new option -- the leader's old wound -- and knowing it
// shows a new fight option, the weak spot (base 9). The trust and the rumor survive save -> reload
// -> load. Real buttons for the dialogue and the fight.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "frontier-canonical-4"; // the investigation succeeds (tests/v2/data-world-reputation.test.js)
const TO_RELIC_AND_REST = [
  { type: "move", to: "loc_market" }, { type: "perform", actionId: "act_buy_lantern" }, { type: "move", to: "loc_village" },
  { type: "move", to: "loc_ruins" }, { type: "perform", actionId: "act_investigate_ruins" }, { type: "move", to: "loc_village" },
  { type: "perform", actionId: "act_rest_village" }, { type: "perform", actionId: "act_rest_village" }
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
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const elderScore = async (page) => (await getState(page)).relations?.["npc_elder:player_1"]?.score;
// the margins of the checks the log shows, newest first (renderLog lists the latest entry on top)
async function margins(page) {
  const text = await page.locator("#log").innerText();
  return [...text.matchAll(/판정: \w+ \(margin (-?\d+)\)/g)].map((m) => Number(m[1]));
}
// click a fight option and return its check's margin (waits for its own log line)
async function exchange(page, label) {
  const before = (await margins(page)).length;
  await choiceButton(page, label).click();
  await expect.poll(async () => (await margins(page)).length).toBe(before + 1);
  return (await margins(page))[0];
}
async function ask(page, label) {
  await act(page, "원로와 대화");
  await choiceButton(page, label).click();
  await expect(page.locator("#choice")).toBeHidden();
}

test.describe("V2 reputation (the elder's trust, earned once, opens the leader's old wound)", () => {
  test("no farming; trust 15 shows the question; the old wound shows the weak spot; kept through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");

    // small talk, three times: dialogue only
    for (let i = 0; i < 3; i += 1) await ask(page, "안부만 묻기");
    expect(await elderScore(page)).toBeUndefined();
    // the ruins: +5 the first time, nothing after
    await ask(page, "폐허에 대해 묻기");
    expect(await elderScore(page)).toBe(5);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, "두목에 대해 더 묻는다")).toHaveCount(0); // not trusted yet
    await choiceButton(page, "폐허에 대해 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    expect(await elderScore(page)).toBe(5);

    // the investigation (the relic), then the report: +10, 15 = trust
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_RELIC_AND_REST);
    expect((await getState(page)).actors.player_1.inventory.item_relic).toBe(1);
    await ask(page, "조사에서 알아낸 것을 전한다");
    expect(await elderScore(page)).toBe(15);
    await ask(page, "조사에서 알아낸 것을 전한다"); // again: nothing more
    expect(await elderScore(page)).toBe(15);

    await act(page, "원로와 대화");
    await expect(choiceButton(page, "두목에 대해 더 묻는다")).toHaveCount(1);
    await choiceButton(page, "두목에 대해 더 묻는다").click();
    await expect(page.locator("#log")).toContainText("왼쪽 옆구리");
    expect((await getState(page)).knowledge.player_1.rum_leader_old_wound.claim).toBe("old_wound");

    // save -> reload -> load keeps the trust and the rumor
    await page.locator("#saveSlotInput").fill("slot_trust");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_trust" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the fight: the weak spot is there, at difficulty 9
    await page.locator("#moves button", { hasText: "폐허" }).click();
    await act(page, "도적 두목과 싸운다");
    await expect(choiceButton(page, "정면으로 맞붙는다")).toHaveCount(1);
    await expect(choiceButton(page, "그의 오래된 상처를 노린다")).toHaveCount(1);
    await page.locator("#saveSlotInput").fill("slot_fight");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    const weakMargin = await exchange(page, "그의 오래된 상처를 노린다");
    expect((await getState(page)).actors.player_1.growth.growth_wanderer.proficiency.combat).toBe(5);
    // the same exchange, from the same save, with the strike: the same roll, 2 harder (11 vs 9)
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_fight" }).getByRole("button", { name: "불러오기" }).click();
    await expect(choiceButton(page, "정면으로 맞붙는다")).toHaveCount(1);
    const strikeMargin = await exchange(page, "정면으로 맞붙는다");
    expect(weakMargin).toBe(strikeMargin + 2);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("without the rumor the fight has no weak spot", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");
    await ask(page, "폐허에 대해 묻기");
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_RELIC_AND_REST);
    await page.locator("#moves button", { hasText: "폐허" }).click();
    await act(page, "도적 두목과 싸운다");
    await expect(choiceButton(page, "정면으로 맞붙는다")).toHaveCount(1);
    await expect(choiceButton(page, "그의 오래된 상처를 노린다")).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
