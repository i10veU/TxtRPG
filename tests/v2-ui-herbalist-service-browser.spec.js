// Shared herbalist service through the real V2 UI and IndexedDB: establish, leave, wait, save, and collect.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

test("the herbalist brews shared salves while the player is away and keeps them through save/load", async ({ page }) => {
  test.setTimeout(120000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(ENTRY_URL, { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.evaluate(() => window.__v2App.newGame("service-ui"));
  await page.evaluate(async () => {
    const idb = await import("/v2/storage/idb.js");
    const s = structuredClone(window.__v2App.getState());
    const pid = s.player.actorId;
    const actor = s.actors[pid];
    actor.locationId = "loc_market";
    actor.growth.growth_wanderer.skills = { ...actor.growth.growth_wanderer.skills, herbalism: 2 };
    actor.inventory = { ...actor.inventory, item_flour_sack: 1, item_purifying_herb: 4 };
    s.signals = { ...s.signals, frontier_fate: 2 };
    s.relations = { ...s.relations, [`npc_herbalist:${pid}`]: { score: 10, mode: "neutral", tags: [] } };
    await idb.save("slot_service_ui", s, { savedAt: 1 });
  });
  await loadSlot(page, "slot_service_ui");

  await act(page, "약초꾼과 대화");
  await option(page, "약초꾼의 마을 연고 일을 돕는다").click();
  let state = await getState(page);
  expect(state.flags.herbalist_stock_established).toBe(true);
  expect(state.actors[state.player.actorId].inventory.item_flour_sack).toBeUndefined();
  expect(state.knowledge[state.player.actorId].rum_herbalist_stock.claim).toBe("established");
  await expect(page.locator("#log")).toContainText("마을에 남아 연고를 만들겠다고 한다");
  await act(page, "약초꾼과 대화");
  await option(page, "약초꾼이 맡은 연고 일에 대해 묻는다").click();
  await expect(page.locator("#log")).toContainText("정화초 두 묶음을 맡기면 다시 만들 수 있다");

  await act(page, "약초꾼과 대화");
  await option(page, "정화초 두 묶음을 약초꾼의 연고 일에 맡긴다").click();
  state = await getState(page);
  expect(state.signals.herbalist_brew_due).toBe(2);
  expect(state.signals.herbalist_salve_stock ?? 0).toBe(0);
  const startedAt = state.fired.evt_herbalist_brews.lastMinute;
  await page.locator("#moves button", { hasText: "변경 마을" }).click();
  const afterMove = await getState(page);
  const remaining = 1440 - (afterMove.time.minute - startedAt);
  expect(remaining).toBeGreaterThan(1);
  expect(remaining).toBeLessThanOrEqual(1440);
  await page.evaluate((n) => window.__v2App.dispatch({ type: "wait", minutes: n }), remaining - 1);
  expect((await getState(page)).signals.herbalist_salve_stock ?? 0).toBe(0);
  await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 1 }));
  expect((await getState(page)).signals.herbalist_salve_stock).toBe(1);

  await page.locator("#saveSlotInput").fill("slot_service_mid");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("slot_service_mid");
  const mid = await getState(page);
  await loadSlot(page, "slot_service_mid");
  expect(await getState(page)).toEqual(mid);
  await page.evaluate(() => window.__v2App.dispatch({ type: "wait", minutes: 1440 }));
  state = await getState(page);
  expect(state.signals.herbalist_brew_due).toBe(0);
  expect(state.signals.herbalist_salve_stock).toBe(2);
  expect(state.actors[state.player.actorId].locationId).toBe("loc_village");

  await page.locator("#moves button", { hasText: "시장" }).click();
  await act(page, "약초꾼과 대화");
  await option(page, "약초꾼이 맡은 연고 일에 대해 묻는다").click();
  await expect(page.locator("#log")).toContainText("만들어 둔 연고가 있다");
  await act(page, "약초꾼과 대화");
  await option(page, "약초꾼이 만든 연고를 찾아간다").click();
  state = await getState(page);
  expect(state.signals.herbalist_salve_stock).toBe(1);
  expect(state.actors[state.player.actorId].inventory.item_herbal_salve).toBe(1);
  await act(page, "약초꾼과 대화");
  await option(page, "약초꾼이 만든 연고를 찾아간다").click();
  state = await getState(page);
  expect(state.signals.herbalist_salve_stock).toBe(0);
  expect(state.actors[state.player.actorId].inventory.item_herbal_salve).toBe(2);
  await act(page, "약초꾼과 대화");
  await expect(option(page, "약초꾼이 만든 연고를 찾아간다")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
