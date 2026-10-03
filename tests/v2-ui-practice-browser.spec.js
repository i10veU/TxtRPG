// V2-Core-48 browser scenario (Issue #129): the real entry point (web/v2/index.html + ui/app.js)
// in real Chromium, against the real world data pack, with the real buttons only. Two new games on
// the same seed reach the same roll at the ruins (nothing on the way draws from the RNG); the one
// whose character first observed the village twice (investigation 30, shown in the status) gets a
// margin 1 higher -- practice is execution quality.
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

const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const move = (page, label) => page.locator("#moves button", { hasText: label }).click();
// the margins of the checks the log shows, newest first (renderLog lists the latest entry on top)
async function margins(page) {
  const text = await page.locator("#log").innerText();
  return [...text.matchAll(/판정: \w+ \(margin (-?\d+)\)/g)].map((m) => Number(m[1]));
}

// a new game on the seed; optionally observe the village twice; then the rumor, a lantern, the
// ruins and the investigation through the real buttons; returns the investigation's margin
async function investigate(page, { observe }) {
  await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
  await expect(page.locator("#game")).toBeVisible();
  if (observe) {
    await act(page, "마을 살피기");
    await act(page, "마을 살피기");
    await expect(page.locator("#status")).toContainText("investigation 30");
  }
  await act(page, "원로와 대화");
  await page.locator("#choiceOptions button", { hasText: "폐허에 대해 묻기" }).click();
  await move(page, "시장");
  await act(page, "등불 구입");
  await move(page, "변경 마을");
  await move(page, "폐허");
  const before = (await margins(page)).length;
  await act(page, "폐허 조사");
  await expect.poll(async () => (await margins(page)).length).toBe(before + 1);
  return (await margins(page))[0];
}

test.describe("V2 practice (the investigation proficiency takes part in the investigation check)", () => {
  test("the same roll at the ruins: the practised character's margin is 1 higher", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    const unpractised = await investigate(page, { observe: false });
    const practised = await investigate(page, { observe: true });
    expect(practised - unpractised).toBe(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
