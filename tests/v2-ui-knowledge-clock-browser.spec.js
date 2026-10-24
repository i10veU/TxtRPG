// J3 RC1: real Chromium + IndexedDB smoke for the knowledge-limited danger clock.
// The report is staged through the ordinary save adapter; the page itself is unmodified.
const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";

async function open(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ENTRY, { waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  return errors;
}

async function load(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test("J3 danger clock: no opening spoiler, known report only, freshness and save/load", async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__v2App.newGame("j3-knowledge-clock"));
  await expect(page.locator("#dangerClock")).toBeHidden();

  // Staging a report through the real save adapter exercises the same UI and
  // load pipeline as an earned rumor without modifying the engine or test hook.
  await page.evaluate(async () => {
    const idb = await import("/v2/storage/idb.js");
    const s = structuredClone(window.__v2App.getState());
    const data = window.__v2App.worldData;
    const def = data.rumors.rum_band_crossing_soon;
    const day = Math.floor(s.time.minute / 1440);
    s.knowledge ??= {};
    s.knowledge[s.player.actorId] ??= {};
    s.knowledge[s.player.actorId].rum_band_crossing_soon = {
      rumorId: "rum_band_crossing_soon", factId: def.factId, claim: def.claim,
      source: "npc_ferryman", sources: ["npc_ferryman"],
      confidence: 70, confirmations: 1, firstSeenDay: day, lastSeenDay: day, aboutDay: day
    };
    await idb.save("j3-clock-known", s, { savedAt: 1 });
  });
  await load(page, "j3-clock-known");
  const clock = page.locator("#dangerClock");
  await expect(clock).toBeVisible();
  await expect(clock).toHaveAttribute("data-stage", "2");
  await expect(clock.locator("#dangerClockText")).toHaveText("곧 강을 건너올 거라는 소식");
  await expect(clock.locator("#dangerClockEvidence")).toContainText("뱃사공에게 들음");
  await expect(clock.locator("#dangerClockEvidence")).toContainText("오늘의 소식");
  await expect(clock.locator("#dangerClockEvidence")).not.toContainText("지금은 달라졌을 수 있음");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) window.__v2App.dispatch({ type: "wait", minutes: 1440 });
  });
  await expect(clock).toHaveAttribute("data-stale", "true");
  await expect(clock.locator("#dangerClockEvidence")).toContainText("지금은 달라졌을 수 있음");

  await page.locator("#saveSlotInput").fill("j3-clock-later");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("j3-clock-later");
  const textBefore = await clock.innerText();
  await load(page, "j3-clock-later");
  await expect(clock).toHaveAttribute("data-stale", "true");
  expect(await clock.innerText()).toBe(textBefore);
  expect(errors).toEqual([]);
});
