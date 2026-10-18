// V2-Core-158 browser scenario (D-136): the pictures, through the real entry point in real Chromium with the real pack.
// tests/v2/ui-art.test.js checks what is drawn; this checks that it is drawn, where, and when it changes.
//   1. a new game: the night village at the head of the page, to the card's edges, hidden from screen readers; the
//      morning brings the day's light; another place, another picture
//   2. the menu has its cover; the dark theme draws the same place darker
//   3. the ending card has its own picture, and the place's picture steps aside while the card is open; the card is
//      built again on every step, and its picture does not fade in again
//   4. a phone: the picture keeps its shape and the page does not scroll sideways
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
// how bright the sky is: the mean of a strip across the top of the picture
const skyOf = (page, id) =>
  page.evaluate((canvasId) => {
    const c = document.getElementById(canvasId);
    const d = c.getContext("2d").getImageData(0, 0, c.width, Math.max(1, Math.floor(c.height * 0.15))).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4);
  }, id);
const drawnOf = (page, id) =>
  page.evaluate((canvasId) => {
    const c = document.getElementById(canvasId) ?? document.querySelector(canvasId);
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) opaque += 1;
    return opaque / Math.ceil(d.length / (4 * 97));
  }, id);

test.describe("V2 the pictures (V2-Core-158)", () => {
  test("the place at the head of the page, in the light of the hour", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    const art = page.locator("#sceneArt");
    await expect(art).toBeVisible();
    await expect(art).toHaveAttribute("data-scene", "loc_village");
    await expect(art).toHaveAttribute("data-band", "night");
    await expect(page.locator(".page > .art")).toHaveAttribute("aria-hidden", "true");
    expect(await drawnOf(page, "sceneArt")).toBeGreaterThan(0.99);
    const [card, picture] = await Promise.all([page.locator(".page").boundingBox(), art.boundingBox()]);
    expect(Math.abs(card.width - picture.width)).toBeLessThan(3);
    expect(Math.abs(picture.height - (picture.width * 5) / 12)).toBeLessThan(2);
    const night = await skyOf(page, "sceneArt");

    await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 8 * 60 }));
    await expect(art).toHaveAttribute("data-band", "day");
    expect(await skyOf(page, "sceneArt")).toBeGreaterThan(night + 40);

    await page.locator("#moves button", { hasText: "시장" }).click();
    await expect(art).toHaveAttribute("data-scene", "loc_market");
    expect(errors).toEqual([]);
  });

  test("the cover on the menu; the dark theme draws darker", async ({ page }) => {
    const errors = await gotoApp(page);
    const cover = page.locator("#coverArt");
    await expect(cover).toBeVisible();
    await expect(cover).toHaveAttribute("data-scene", "cover");
    expect(await drawnOf(page, "coverArt")).toBeGreaterThan(0.99);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 8 * 60 }));
    await expect(page.locator("#sceneArt")).toHaveAttribute("data-band", "day");
    const light = await skyOf(page, "sceneArt");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => skyOf(page, "sceneArt")).toBeLessThan(light - 60);
    expect(errors).toEqual([]);
  });

  test("the ending card has its own picture; the place's steps aside", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      s.signals = { ...s.signals, frontier_fate: 2 };
      s.facts = { ...s.facts, fact_ending: { value: "held", since: 0 } };
      await idb.save("slot_held", s, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_held" }).getByRole("button", { name: "불러오기" }).click();
    await page.locator("#actions button", { hasText: "원로를 찾아간다" }).click();
    await page.locator("#choiceOptions button:not([disabled])", { hasText: "그날의 일을 듣는다" }).click();
    const last = page.locator("#ending canvas.ending-art");
    await expect(last).toBeVisible();
    await expect(last).toHaveAttribute("data-scene", "loc_village");
    await expect(last).toHaveAttribute("data-band", "dawn");
    expect(await drawnOf(page, "#ending canvas.ending-art")).toBeGreaterThan(0.99);
    await expect(page.locator("#sceneArt")).toBeHidden();
    // the card is built again on every step; its picture does not fade in again
    await expect(last).not.toHaveClass(/fresh/);
    await page.locator("#waitBtn").click();
    await expect(last).toBeVisible();
    expect(await last.evaluate((c) => c.getAnimations().length)).toBe(0);
    await page.locator("#ending").getByRole("button", { name: "이 세계에서 계속 살아간다" }).click();
    await expect(page.locator("#sceneArt")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("on a phone the picture keeps its shape and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    const box = await page.locator("#sceneArt").boundingBox();
    expect(box.width).toBeGreaterThan(300);
    expect(Math.abs(box.height - (box.width * 5) / 12)).toBeLessThan(2);
    expect(await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
