// V2-Core-137 browser scenario (D-115, World Bible WB-0030 Q6): additive actor migration through the real load path
// (web/v2/index.html + ui/app.js, real Chromium, real IndexedDB, the real pack). actor-adoption.test.js covers the
// engine function with synthetic data. Here a save written before an actor existed is staged by removing the pack's
// one actor (the bandit leader) from a new game's state and saving it through the real storage adapter:
//   1. loaded with the app's button, the leader is there exactly as a new game seeds him, and he can be confronted;
//   2. saved with the app's button, reloaded and loaded again, he is still there and the state is the same.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const LEADER = "npc_bandit_leader";

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
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
const getState = (page) => page.evaluate(() => window.__v2App.getState());

test.describe("V2 additive actor migration (D-115)", () => {
  test("a save without the pack's actor loads with him seeded as a new game would, and keeps him across save and load", async ({ page }) => {
    test.setTimeout(60000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("history-41"));
    await expect(page.locator("#game")).toBeVisible();
    const fresh = await getState(page);
    expect(fresh.actors[LEADER]).toBeTruthy();
    await page.evaluate(async (leader) => {
      const idb = await import("/v2/storage/idb.js");
      const s = structuredClone(window.__v2App.getState());
      delete s.actors[leader]; // a save from before the actor existed
      await idb.save("slot_before_actor", s, { savedAt: 1 });
    }, LEADER);

    await loadSlot(page, "slot_before_actor");
    const adopted = await getState(page);
    expect(adopted.actors[LEADER]).toEqual(fresh.actors[LEADER]);
    expect(adopted.rng).toEqual(fresh.rng);
    expect(adopted.time).toEqual(fresh.time);
    await expect(page.locator("#error")).toHaveText("");

    await page.locator("#saveSlotInput").fill("slot_after_actor");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_after_actor");
    await loadSlot(page, "slot_after_actor");
    expect(await getState(page)).toEqual(adopted);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
