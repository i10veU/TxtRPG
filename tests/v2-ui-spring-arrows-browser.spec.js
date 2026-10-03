// V2-Core-68 browser scenario (#170, Fantasy World Vertical Slice 3, step 1 -- the arrows at the
// spring): the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB,
// against the real world data pack, with real buttons for every step of the slice: the elder tells of
// the hideout; at the spring the search reads the bandit arrows; the elder is told (once, +5); saved ->
// reloaded -> loaded; the village's account has changed -- the elder about the ruins, the herbalist
// about the sickness -- and the telling is not offered again.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "herb-30"; // tests/v2/data-world-spring-arrows.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const TO_SPRING = [P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring")];
const TELL = "샘의 짐승에 박힌 도적단의 화살을 전한다";

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
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const elder = async (page, label) => {
  await act(page, "원로와 대화");
  await option(page, label).click();
};

test.describe("V2 spring arrows (Slice 3: the two stories meet)", () => {
  test("the arrows read at the spring, told to the elder once, and the village's account changed -- through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();

    // the hideout, from the elder
    await elder(page, "폐허에 대해 묻기");
    await expect(page.locator("#log")).toContainText("마을 외곽의 폐허에 대해 이야기한다.");
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_SPRING);

    // the search reads the arrows
    await act(page, "샘 조사");
    await expect(page.locator("#log")).toContainText("도적단의 화살이다.");
    expect((await getState(page)).facts.fact_spring_fouler.value).toBe("bandits");

    // telling the elder: once, +5
    await move(page, "변경 마을");
    const before = (await getState(page)).relations["npc_elder:player_1"].score;
    await elder(page, TELL);
    await expect(page.locator("#log")).toContainText("샘을 흐린 것도 도적들이었다는 말이 곧 마을에 퍼질 것이다.");
    await expect(page.locator("#log")).toContainText("두목은 아직 어딘가 살아 있다고 한다.");
    expect((await getState(page)).relations["npc_elder:player_1"].score).toBe(before + 5);

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_arrows");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_arrows" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the village's account: the elder about the ruins, the herbalist about the sickness
    await act(page, "원로와 대화");
    await expect(option(page, TELL)).toHaveCount(0);
    await option(page, "폐허에 대해 묻기").click();
    await expect(page.locator("#log")).toContainText("숲속 샘까지 흐려 놓았다는 이야기도 잊지 않고 덧붙인다.");
    await move(page, "시장");
    await act(page, "약초꾼과 대화");
    await option(page, "마을의 배앓이에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("이야기가 시장에도 돈다고 한다.");
    expect((await getState(page)).relations["npc_elder:player_1"].score).toBe(before + 5);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
