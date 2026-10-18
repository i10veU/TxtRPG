// V2-Core-159 browser scenario (D-137): the screen tidied, through the real entry point in real Chromium.
//   1. the menu is a book's cover: the picture, the name with its seal, the line under it; the game's small masthead
//      is not on the menu, and is in the game; the cover's picture dissolves into the band of the cover, not the page
//   2. the saved games in plain words: an empty shelf says so; a game saved under its default name is listed with the
//      day and the hour as a person says them
//   3. the place's name stands apart from the hour; a choice under the hand changes colour; the tab has its icon
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
  return errors;
}

test.describe("V2 the screen tidied (V2-Core-159)", () => {
  test("the menu is a book's cover; the masthead belongs to the game", async ({ page }) => {
    const errors = await gotoApp(page);
    await expect(page.locator("#menu .cover h1")).toHaveText("무명의 연대기");
    await expect(page.locator("#menu .cover .seal")).toHaveText("無名");
    await expect(page.locator("#menu .cover .lede")).toContainText("이름은 세계가 기억할 때 생긴다");
    await expect(page.locator(".masthead")).toBeHidden();
    // the foot of the picture is the colour of the cover's band
    const [foot, band] = await page.evaluate(() => {
      const c = document.getElementById("coverArt");
      const d = c.getContext("2d").getImageData(Math.floor(c.width / 2), c.height - 1, 1, 1).data;
      const probe = document.createElement("span");
      probe.style.color = "var(--cover-bg)";
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number);
      probe.remove();
      return [[d[0], d[1], d[2]], rgb];
    });
    foot.forEach((v, i) => expect(Math.abs(v - band[i])).toBeLessThan(28));
    await page.locator("#newGameBtn").click();
    await expect(page.locator(".masthead")).toBeVisible();
    await expect(page.locator(".masthead .brand")).toHaveText("무명의 연대기");
    expect(errors).toEqual([]);
  });

  test("the saved games in plain words", async ({ page }) => {
    const errors = await gotoApp(page);
    await expect(page.locator("#slotEmpty")).toBeVisible();
    await expect(page.locator("#slotList li")).toHaveCount(0);
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#saveSlotInput")).toHaveValue("기록 1");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("기록 1");
    await page.locator("#backToMenuBtn").click();
    await expect(page.locator("#slotEmpty")).toBeHidden();
    const row = page.locator("#slotList li", { hasText: "기록 1" });
    await expect(row.locator(".slot")).toHaveText("기록 1");
    await expect(row.locator(".saved")).toHaveText(/\d+월 \d+일/);
    await row.getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("the place's name apart from the hour; a choice under the hand; the tab's icon", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await expect(page.locator("#location .place")).toHaveText("변경 마을");
    await expect(page.locator("#location")).toContainText("변경 마을 · 1일째 깊은 밤 00:00");
    const choice = page.locator("#actions button:not([disabled])").first();
    const still = await choice.evaluate((b) => getComputedStyle(b).backgroundColor);
    await choice.hover();
    await expect.poll(() => choice.evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe(still);
    expect(await page.locator('link[rel="icon"]').getAttribute("href")).toMatch(/^data:image\/svg\+xml,/);
    expect(errors).toEqual([]);
  });
});
