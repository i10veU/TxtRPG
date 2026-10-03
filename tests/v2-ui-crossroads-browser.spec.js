// V2-Core-72 browser scenario (#180, Fantasy World Vertical Slice 4, step 1 -- the old crossroads): the
// real entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack. The confrontation and the dispersal are dispatched (the leader lives); the region is
// real buttons: the road is not on the map until then; the elder tells of the region; the first walker
// at the crossroads; saved -> reloaded -> loaded; the milestone read; the leader's trail toward the ford.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-crossroads.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const BEFORE_CONFRONT = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings")
];
const DISPERSAL = [P("act_confront_leader"), ...E("opt_bandits_disperse")];

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
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const road = (page) => page.locator("#moves button", { hasText: "옛 갈림길" });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatchAll = (page, list) => page.evaluate((actions) => actions.forEach((a) => window.__v2App.dispatch(a)), list);

test.describe("V2 crossroads (Slice 4: the road out)", () => {
  test("the road opens with the bandits gone; the elder, the first walker, the milestone and the leader's trail -- through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await dispatchAll(page, BEFORE_CONFRONT);
    await expect(road(page)).toHaveCount(0);

    await dispatchAll(page, DISPERSAL);
    await expect(road(page)).toHaveCount(1);
    expect((await getState(page)).actors.npc_bandit_leader.alive).toBe(true);

    // the elder tells of the region
    await act(page, "원로와 대화");
    await option(page, "마을 바깥의 길에 대해 묻는다").click();
    await expect(page.locator("#log")).toContainText("북쪽으로 가면 강나루가 나온다고 한다.");

    // the first walker on the reopened road
    await road(page).click();
    await expect(page.locator("#location")).toContainText("옛 갈림길");
    await expect(page.locator("#log")).toContainText("오랜만에 사람의 발자국이 찍힌다.");

    // save -> reload -> load
    await page.locator("#saveSlotInput").fill("slot_crossroads");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_crossroads" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the milestone, and the leader's trail
    await act(page, "이정표 읽기");
    await expect(page.locator("#log")).toContainText("강을 건너 왕도로 이어지는 길이라고 새겨져 있다.");
    await act(page, "갈림길 살피기");
    await expect(page.locator("#log")).toContainText("발자국은 강나루 쪽으로 이어진다.");
    const end = await getState(page);
    expect([end.facts.fact_road_royal.value, end.facts.fact_leader_trail.value]).toEqual(["beyond_ford", "toward_ford"]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
