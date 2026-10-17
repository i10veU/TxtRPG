// V2-Core-144 browser scenario (roadmap M8, D-122, Issue #361): the real entry point (web/v2/index.html + ui/app.js) in
// real Chromium with real IndexedDB and the real pack. tests/v2/ui-wait-day.test.js runs ui/wait.js itself in Node.
//   1. "기다리기 (하루)" is a day of the half-hour button: one click makes the world 48 clicks make, with one line for the
//      time; saved -> reloaded -> loaded, the same
//   2. at the ruins it stops after the half hour that hurt, and says how long it waited; a second click is the strike
//      that kills: the new-character choice, both wait buttons shut
//   3. while a choice is open both wait buttons are shut
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";

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
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const getLog = (page) => page.evaluate(() => window.__v2App.getLog());
const newGame = (page) => page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
const waitDayBtn = (page) => page.locator("#waitDayBtn");
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 waiting a day (M8): the half-hour button, a day at a time", () => {
  test("one click is the world of 48 half-hour clicks, one line for the time; kept across a reload", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGame(page);
    await expect(page.locator("#location")).toContainText("1일차 00:00");
    await expect(waitDayBtn(page)).toHaveText("기다리기 (하루)");
    await expect(waitDayBtn(page)).toBeEnabled();
    await waitDayBtn(page).click();
    await expect(page.locator("#location")).toContainText("2일차 00:00");
    const byDay = await getState(page);
    const log = await getLog(page);
    expect(log.filter((line) => line === "하루가 지났다.")).toHaveLength(1);
    expect(log.filter((line) => line.endsWith("분이 지났다."))).toHaveLength(0);

    await newGame(page);
    for (let i = 0; i < 48; i += 1) await page.locator("#waitBtn").click();
    await expect(page.locator("#location")).toContainText("2일차 00:00");
    expect(await getState(page)).toEqual(byDay);

    await page.locator("#saveSlotInput").fill("slot_wait_day");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_wait_day");
    await loadSlot(page, "slot_wait_day");
    expect(await getState(page)).toEqual(byDay);
    await waitDayBtn(page).click();
    await expect(page.locator("#location")).toContainText("3일차 00:00");

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("at the ruins it stops after the half hour that hurt; the next strike kills and shuts both waits", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGame(page);
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    await expect(page.locator("#location")).toContainText("1일차 01:15");
    await expect(page.locator("#status")).toContainText("HP 6/10");

    await waitDayBtn(page).click();
    await expect(page.locator("#location")).toContainText("1일차 01:45");
    await expect(page.locator("#status")).toContainText("HP 2/10");
    expect((await getLog(page)).slice(-1)).toEqual(["30분을 기다리다 멈췄다."]);

    await waitDayBtn(page).click();
    await expect(page.locator("#status")).toContainText("HP 0/10");
    await expect(page.locator("#log")).toContainText("쓰러졌다");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#waitBtn")).toBeDisabled();
    await expect(waitDayBtn(page)).toBeDisabled();
    expect((await getState(page)).pending).toEqual({ kind: "newCharacter" });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("while a choice is open both waits are shut", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await newGame(page);
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(page.locator("#waitBtn")).toBeDisabled();
    await expect(waitDayBtn(page)).toBeDisabled();
    await page.locator("#choiceOptions button", { hasText: "안부만 묻기" }).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(waitDayBtn(page)).toBeEnabled();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
