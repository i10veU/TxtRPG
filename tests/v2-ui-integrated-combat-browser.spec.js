// V2-Core-60 browser scenario (#147 Phase E, Integrated Combat): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack -- one fight that composes every capability, with real buttons for each capability step:
// the scout chosen at New Game (talent: three observations reach 51 and the keen eye), the iron sword
// bought and wielded, then (dispatched) the rumor, the dark search, the elder's trust and the old wound;
// in the fight the counter (3) and the old wound (2) spend stamina, the leader's heavy blow lands,
// with 1 stamina left only the free techniques are offered, saved/reloaded/loaded mid-fight, and two
// sword cuts end it -- the status shows the skills with their mastery tiers.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "integrated-36"; // tests/v2/data-world-integrated-combat.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const ASK = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_FIGHT_AFTER_THE_SWORD = [
  M("loc_village"), ...ASK("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader")
];
const STRIKE = "정면으로 맞붙는다";
const CUT = "철검으로 베어 든다";
const WEAK = "그의 오래된 상처를 노린다";
const COUNTER = "그의 공격을 읽고 받아친다";

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
const status = (page) => page.locator("#status");
const getState = (page) => page.evaluate(() => window.__v2App.getState());
// click a fight option and wait for its own check line (the log lists the newest entry first)
async function exchange(page, label) {
  const count = async () => ((await page.locator("#log").innerText()).match(/판정:/g) ?? []).length;
  const before = await count();
  await choiceButton(page, label).click();
  await expect.poll(count).toBe(before + 1);
}

test.describe("V2 integrated combat (every capability in one fight)", () => {
  test("talent, skill and mastery, equipment, resource, techniques and the NPC's blow -- through save/load to victory", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    // the scout, by the menu (the world seed fixed through the app's own newGame)
    await page.locator("#backgroundSelect").selectOption("start_scout");
    await page.evaluate((seed) => window.__v2App.newGame(seed, document.querySelector("#backgroundSelect").value), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await expect(status(page)).toContainText("특성: 조사의 재능, 밤눈");

    // talent -> practice -> skill / unlock
    for (let i = 0; i < 3; i += 1) await act(page, "마을 살피기");
    await expect(status(page)).toContainText("숙련도: 조사 51");
    await expect(status(page)).toContainText("해금: 예리한 눈");

    // equipment
    await page.locator("#moves button", { hasText: "시장" }).click();
    await act(page, "철검 구입");
    await act(page, "철검을 든다");
    await expect(status(page)).toContainText("장비: 손 철검");

    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), TO_FIGHT_AFTER_THE_SWORD);
    await expect(status(page)).toContainText("기술: 조사 4 (수련)");
    for (const label of [STRIKE, WEAK, CUT, COUNTER, "물러서서 달아난다"]) await expect(choiceButton(page, label)).toHaveCount(1);
    await expect(status(page)).toContainText("자원: 기력 6/6");

    // the counter (3), then the old wound (2) -- which fails: the leader's heavy blow
    await exchange(page, COUNTER);
    await expect(status(page)).toContainText("자원: 기력 3/6");
    await exchange(page, WEAK);
    await expect(page.locator("#log")).toContainText("두목이 온 힘을 실어 칼을 내려친다.");
    await expect(status(page)).toContainText("자원: 기력 1/6");
    expect((await getState(page)).actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current).toBe(3);
    // 1 stamina: only the free techniques
    await expect(choiceButton(page, COUNTER)).toHaveCount(0);
    await expect(choiceButton(page, WEAK)).toHaveCount(0);
    await expect(choiceButton(page, CUT)).toHaveCount(1);

    // save -> reload -> load mid-fight
    await page.locator("#saveSlotInput").fill("slot_mid_fight");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_mid_fight" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);
    await expect(choiceButton(page, CUT)).toHaveCount(1);
    await expect(choiceButton(page, COUNTER)).toHaveCount(0);

    // two sword cuts: victory; the fight grew swordsmanship to its first rank
    await exchange(page, CUT);
    await exchange(page, CUT);
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText("도적 두목이 쓰러진다.");
    await expect(status(page)).toContainText("기술: 조사 4 (수련), 검술 1 (초심)");
    const end = await getState(page);
    expect(end.actors.npc_bandit_leader.alive).toBe(false);
    expect(end.cases.case_ruins_mystery.stage).toBe("resolved");
    expect([end.actors.player_1.alive, end.actors.player_1.hp.current]).toEqual([true, 1]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
