// V2-Core-157 browser scenario (D-135): the feel of a book, through the real entry point in real Chromium with the real
// pack.
//   1. the scene's lines come in one after another: each line knows its place (--i), every word is on the page from the
//      first moment, and the same scene is not drawn again when the page is (a save) -- its lines do not come in twice
//   2. no motion when motion is not wanted (prefers-reduced-motion: reduce)
//   3. the body as two bars beside the numbers: full at the start; low strength turns the bar red
//   4. the menu says how to read the screen, in three lines
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
const animationOf = (page) => page.locator("#scene p").first().evaluate((p) => getComputedStyle(p).animationName);

test.describe("V2 the feel of a book (V2-Core-157)", () => {
  test("the lines come in one after another, every word already on the page; a scene is not drawn twice", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    const lines = page.locator("#scene p");
    expect(await lines.count()).toBeGreaterThan(1);
    const places = await lines.evaluateAll((ps) => ps.map((p) => p.style.getPropertyValue("--i")));
    expect(places).toEqual(places.map((_, i) => String(i)));
    const words = await lines.evaluateAll((ps) => ps.map((p) => p.textContent.length));
    expect(words.every((n) => n > 0)).toBe(true);
    expect(await animationOf(page)).toBe("ink");

    await lines.first().evaluate((p) => {
      p.dataset.seen = "yes";
    });
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("저장했다");
    await expect(lines.first()).toHaveAttribute("data-seen", "yes");

    await page.locator("#actions button").first().click();
    await expect(page.locator("#scene p[data-seen]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("no motion when motion is not wanted", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    expect(await animationOf(page)).toBe("none");
    expect(errors).toEqual([]);
  });

  test("the body as two bars; low strength turns red", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    const marks = page.locator("#marks");
    await expect(marks).toHaveAttribute("data-hp", "10");
    await expect(marks).toHaveAttribute("data-low", "false");
    await expect(marks.locator("i")).toHaveCount(2);

    // a body near its end, staged through the real storage adapter
    await page.evaluate(async () => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      const me = s.actors[s.player.actorId];
      me.hp = { ...me.hp, current: Math.max(1, Math.floor(me.hp.max / 5)) };
      await idb.save("slot_low", s, { savedAt: 1 });
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_low" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(marks).toHaveAttribute("data-low", "true");
    const red = await marks.locator("i.hp").evaluate((i) => getComputedStyle(i, "::after").backgroundColor);
    const danger = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--danger)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(red).toBe(danger);
    expect(errors).toEqual([]);
  });

  test("the menu says how to read the screen", async ({ page }) => {
    const errors = await gotoApp(page);
    const howto = page.locator("#menu .howto li");
    await expect(howto).toHaveCount(3);
    await expect(howto.nth(0)).toContainText("위의 글");
    await expect(howto.nth(1)).toContainText("초록 띠");
    await expect(howto.nth(2)).toContainText("번호");
    expect(errors).toEqual([]);
  });
});
