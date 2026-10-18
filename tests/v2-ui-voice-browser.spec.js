// V2-Core-151 browser scenario (J3, the voice): the reading screen through the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB and the real pack. tests/v2/data-world-voice.test.js checks the pack.
//   1. a new game opens with the prologue in the scene and a goal; the record keeps the bookkeeping, the scene does not;
//      asking the elder puts his words in the scene and moves the goal; a road reads "시장으로 간다"; arriving with
//      nothing else happening shows the place
//   2. the scout's prologue is the scout's, and the scout is not sent for a lantern
//   3. a saved game loads into the place it was saved in, with its goal
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

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
const text = (page, id) => page.evaluate((k) => window.__v2App.worldData.texts[k], id);
const scene = (page) => page.locator("#scene");
const goal = (page) => page.locator("#goalText");

test.describe("V2 the voice (J3)", () => {
  test("the prologue, the goal, the elder's words, the road and the place -- through the buttons", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await expect(page).toHaveTitle("무명의 연대기");
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(scene(page)).toContainText(await text(page, "txt_prologue_levy"));
    await expect(scene(page)).toContainText(await text(page, "txt_prologue_purse"));
    await expect(goal(page).locator("[data-track=main]")).toHaveText(await text(page, "goal_meet_elder"));
    await expect(goal(page).locator("[data-track=well]")).toHaveText(await text(page, "goal_well_sick"));
    await expect(page.locator("#location")).toContainText("변경 마을 · 1일째 깊은 밤 00:00");
    await expect(page.locator("#vitals")).toHaveText("체력 10/10 · 기력 6/6 · 은화 8");

    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button:not([disabled])", { hasText: "폐허에 대해 묻는다" }).click();
    await expect(scene(page).locator("p")).toHaveCount(1);
    await expect(scene(page)).toHaveText(await text(page, "txt_ask_ruins"));
    await expect(goal(page).locator("[data-track=main]")).toHaveText(await text(page, "goal_search_ruins"));

    await page.locator("#moves button", { hasText: "시장으로 간다" }).click();
    await expect(page.locator("#location")).toContainText("시장");
    await expect(scene(page)).toHaveText(await text(page, "txt_place_loc_market"));
    // the time it took is in the record, not in the scene
    await expect(page.locator("#log")).toContainText("분이 지났다.");
    await expect(scene(page)).not.toContainText("분이 지났다");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the scout opens as the lord's scout and reads the dark without a lantern", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#backgroundSelect").selectOption("start_scout");
    await page.locator("#newGameBtn").click();
    await expect(scene(page)).toContainText(await text(page, "txt_prologue_scout_levy"));
    await expect(scene(page)).toContainText(await text(page, "txt_prologue_scout_purse"));
    await expect(scene(page)).not.toContainText(await text(page, "txt_prologue_purse"));
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button:not([disabled])", { hasText: "폐허에 대해 묻는다" }).click();
    await expect(goal(page).locator("[data-track=main]")).toHaveText(await text(page, "goal_search_ruins_night"));
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a saved game loads into its place with its goal", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button:not([disabled])", { hasText: "폐허에 대해 묻는다" }).click();
    await page.locator("#saveSlotInput").fill("slot_voice");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_voice");
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_voice" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(scene(page)).toHaveText(await text(page, "txt_place_loc_village"));
    await expect(goal(page).locator("[data-track=main]")).toHaveText(await text(page, "goal_search_ruins"));
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
