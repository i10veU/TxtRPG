// V2-Core-65 browser scenario (#160, Fantasy World Vertical Slice 2, step 2 -- herbalism): the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The way to the spring is dispatched (step 1 has its own spec); every herbalism step
// is a real button: the herbalist's lesson (2 silver, herbalism 1 = Novice), three gatherings at the
// spring (2 stamina each; success, success, fail on this seed), saved -> reloaded -> loaded between
// them, no stamina left for a fourth, and the remedy brewed from two herbs.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "herb-30"; // tests/v2/data-world-herbalism.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });

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
const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const status = (page) => page.locator("#status");
const getState = (page) => page.evaluate(() => window.__v2App.getState());
// click the gathering and wait for its own check line (each gathering also rolls the miasma: 2 lines)
async function gather(page) {
  const count = async () => ((await page.locator("#log").innerText()).match(/판정:/g) ?? []).length;
  const before = await count();
  await act(page, "정화초 채집");
  await expect.poll(count).toBe(before + 2);
}

test.describe("V2 herbalism (Slice 2: the remedy)", () => {
  test("the lesson, gathering for stamina, save/load between gatherings, and the remedy", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), [P("act_inspect_well"), M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);

    // the lesson: 2 silver, herbalism practice 20 = rank 1 (Novice), once
    await act(page, "약초꾼과 대화");
    await option(page, "약초 고르는 법을 배운다").click();
    await expect(page.locator("#log")).toContainText("정화초를 가려내는 법을 차근차근 일러 준다.");
    await expect(status(page)).toContainText("소지금 6");
    await expect(status(page)).toContainText("약초학 1 (초심)");
    await act(page, "약초꾼과 대화");
    await expect(option(page, "약초 고르는 법을 배운다")).toHaveCount(0);
    await option(page, "약초 이야기만 나눈다").click();

    await page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), [M("loc_village"), M("loc_forest_spring"), P("act_search_spring")]);
    await expect(status(page)).toContainText("자원: 기력 6/6");

    // two gatherings: two herbs, 4 stamina
    await gather(page);
    await expect(page.locator("#log")).toContainText("정화초 한 묶음을 가려 거둔다.");
    await expect(status(page)).toContainText("자원: 기력 4/6");
    await gather(page);
    await expect(status(page)).toContainText("정화초 x2");
    await expect(status(page)).toContainText("자원: 기력 2/6");

    // save -> reload -> load between gatherings
    await page.locator("#saveSlotInput").fill("slot_herbs");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_herbs" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the third fails (practice only); no stamina for a fourth
    await gather(page);
    await expect(page.locator("#log")).toContainText("정화초는 찾지 못했다.");
    await expect(status(page)).toContainText("자원: 기력 0/6");
    await expect(page.locator("#actions button", { hasText: "정화초 채집" })).toHaveCount(0); // a closed action is not listed
    await expect(status(page)).toContainText("약초학 2 (초심)");

    // the remedy: two herbs at her stall
    await move(page, "변경 마을");
    await move(page, "시장");
    await act(page, "약초꾼과 대화");
    await option(page, "정화제를 달여 달라고 한다").click();
    await expect(page.locator("#log")).toContainText("맑은 정화제 한 병을 만들어 준다.");
    await expect(status(page)).toContainText("샘 정화제 x1");
    const end = await getState(page);
    expect(end.actors.player_1.inventory.item_spring_remedy).toBe(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
