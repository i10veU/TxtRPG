// V2-Core-154 browser scenario (D-132): a talk opens with how the person greets me, through the real entry point in real
// Chromium with the real pack. tests/v2/ui-people.test.js checks the choice of greeting.
//   1. at midnight the elder opens the door with a lamp; the greeting leads the scene and the dialogue follows; by day a
//      stranger is stopped at the door; once he has told me of the ruins he lets me in
//   2. the herbalist greets a stranger, and knows me once I have asked about the sickness
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

async function gotoApp(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => window.__v2App.newGame("history-41"));
  await expect(page.locator("#game")).toBeVisible();
  return errors;
}
const text = (page, id) => page.evaluate((k) => window.__v2App.worldData.texts[k], id);
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button:not([disabled])", { hasText: label }).click();
const firstLine = (page) => page.locator("#scene p").first();

test.describe("V2 the faces of people (V2-Core-154)", () => {
  test("the elder at midnight, by day a stranger, then someone he lets in", async ({ page }) => {
    const errors = await gotoApp(page);
    await act(page, "원로를 찾아간다");
    await expect(firstLine(page)).toHaveText(await text(page, "greet_elder_night"));
    await expect(page.locator("#choice")).toBeVisible();
    await option(page, "안부만 묻는다");
    await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 8 * 60 }));
    await act(page, "원로를 찾아간다");
    await expect(firstLine(page)).toHaveText(await text(page, "greet_elder_stranger"));
    await option(page, "폐허에 대해 묻는다");
    await act(page, "원로를 찾아간다");
    await expect(firstLine(page)).toHaveText(await text(page, "greet_elder_known"));
    expect(errors).toEqual([]);
  });

  test("the herbalist: a stranger first, then someone who asked", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 8 * 60 }));
    await page.locator("#moves button", { hasText: "시장으로 간다" }).click();
    await act(page, "약초꾼에게 말을 건다");
    await expect(firstLine(page)).toHaveText(await text(page, "greet_herbalist_stranger"));
    await option(page, "마을의 배앓이에 대해 묻는다");
    await act(page, "약초꾼에게 말을 건다");
    await expect(firstLine(page)).toHaveText(await text(page, "greet_herbalist_known"));
    expect(errors).toEqual([]);
  });
});
