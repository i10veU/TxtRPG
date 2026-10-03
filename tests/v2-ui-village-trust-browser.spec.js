// V2-Core-70 browser scenario (#170, Fantasy World Vertical Slice 3, step 3 -- the village's trust):
// the real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the
// real world data pack. Both stories are dispatched (the scout of V2-Core-60, then the well); the
// standing is real buttons: the elder offers the village's thanks, once; saved -> reloaded -> loaded;
// at the herbalist's stall only the honoured price of the salve is offered (1 silver), and the salve
// heals the scout.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const REST = P("act_rest_village");
// tests/v2/data-world-village-trust.test.js
const BOTH_STORIES = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), REST, REST,
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_search_spring"), P("act_search_spring"), P("act_gather_herbs"), M("loc_village"), REST, REST,
  M("loc_forest_spring"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"), REST, M("loc_forest_spring"), P("act_gather_herbs"),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), REST, M("loc_forest_spring"), P("act_purify_spring"),
  M("loc_village"), M("loc_market"), ...H("opt_herbalist_report_spring"), M("loc_village")
];
const HONOR = "마을의 이름으로 감사를 받는다";

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

test.describe("V2 village trust (Slice 3: the two stories add up)", () => {
  test("honoured once in the village's name; the honoured price at the herbalist's -- through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#backgroundSelect").selectOption("start_scout");
    await page.evaluate(() => window.__v2App.newGame("integrated-36", document.querySelector("#backgroundSelect").value));
    await expect(page.locator("#game")).toBeVisible();
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), BOTH_STORIES);
    await expect(page.locator("#status")).toContainText("HP 6/10");

    // the village's thanks, once
    await act(page, "원로와 대화");
    await option(page, HONOR).click();
    await expect(page.locator("#log")).toContainText("이제 이 마을은 당신의 편이라고 말한다.");
    expect((await getState(page)).relations["org_village:player_1"]).toMatchObject({ score: 20, tags: ["trusted"] });
    await act(page, "원로와 대화");
    await expect(option(page, HONOR)).toHaveCount(0);
    await option(page, "안부만 묻기").click();

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_honoured");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_honoured" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the herbalist's salve at the honoured price -- the ordinary price is not offered
    await move(page, "시장");
    await act(page, "약초꾼과 대화");
    await expect(option(page, "약초 연고를 산다 (은화 3)")).toHaveCount(0);
    await option(page, "약초 연고를 산다 (마을의 호의, 은화 1)").click();
    await expect(page.locator("#log")).toContainText("마을이 감사한 사람에게서 더 받을 수는 없다고 한다.");
    await expect(page.locator("#status")).toContainText("소지금 0");
    await expect(page.locator("#status")).toContainText("약초 연고 x1");

    // the salve heals
    await act(page, "약초 연고를 바른다");
    await expect(page.locator("#log")).toContainText("쓰라림이 가라앉는다.");
    await expect(page.locator("#status")).toContainText("HP 10/10");
    await expect(page.locator("#actions button", { hasText: "약초 연고를 바른다" })).toHaveCount(0);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
