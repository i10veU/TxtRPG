// V2-Core-64 browser scenario (#160, Fantasy World Vertical Slice 2, step 1 -- discovery): the real
// entry point (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real
// world data pack, with real buttons only: the forest spring is not on the map until the character
// knows the source; the well (PER) tells it, the herbalist at the market tells it again (+5 trust
// once); the spring's miasma (CON) costs 2 HP on arrival on this seed; the search finds the carcass;
// saved -> reloaded -> loaded at the spring, the same state.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "well-9"; // tests/v2/data-world-fouled-well.test.js: well success, miasma fail, search success, miasma resisted

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
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 fouled well (Slice 2: discovery)", () => {
  test("the well and the herbalist reveal the spring; the miasma and the search; kept through save/load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#moves button", { hasText: "숲속 샘" })).toHaveCount(0);

    // the well (PER): the water comes from the forest spring
    await act(page, "우물 살피기");
    await expect(page.locator("#log")).toContainText("이 물은 숲속 샘에서 온다.");
    await expect(page.locator("#moves button", { hasText: "숲속 샘" })).toHaveCount(1);
    expect((await getState(page)).facts.fact_well_source.value).toBe("forest_spring");

    // the herbalist at the market: the same account, +5 once
    await expect(page.locator("#actions button", { hasText: "약초꾼과 대화" })).toHaveCount(0);
    await move(page, "시장");
    await act(page, "약초꾼과 대화");
    await page.locator("#choiceOptions button", { hasText: "마을의 배앓이에 대해 묻는다" }).click();
    await expect(page.locator("#log")).toContainText("그 샘이 탈이 난 게 틀림없다고 한다.");
    await act(page, "약초꾼과 대화");
    await page.locator("#choiceOptions button", { hasText: "마을의 배앓이에 대해 묻는다" }).click();
    expect((await getState(page)).relations["npc_herbalist:player_1"]).toMatchObject({ score: 5, tags: ["consulted"] });

    // the spring: the miasma on arrival (not resisted on this seed: 2 HP)
    await move(page, "변경 마을");
    await move(page, "숲속 샘");
    await expect(page.locator("#location")).toContainText("숲속 샘");
    await expect(page.locator("#log")).toContainText("숨이 막히고 속이 뒤집힌다.");
    await expect(page.locator("#status")).toContainText("HP 8/10");

    // save -> reload -> load at the spring
    await page.locator("#saveSlotInput").fill("slot_spring");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    const saved = await getState(page);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_spring" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(saved);

    // the search (PER) finds the carcass; the next miasma is resisted
    await act(page, "샘 조사");
    await expect(page.locator("#log")).toContainText("샘물을 흐리는 것은 이것이다.");
    await expect(page.locator("#log")).toContainText("숨을 고르며 버텨 낸다.");
    await expect(page.locator("#status")).toContainText("HP 8/10");
    const end = await getState(page);
    expect(end.facts.fact_spring_cause.value).toBe("rotting_carcass");
    expect(end.knowledge.player_1.rum_spring_cause.sources).toEqual(["obs_loc_forest_spring"]);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
