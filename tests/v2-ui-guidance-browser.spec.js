const { test, expect } = require("@playwright/test");
const ENTRY = "http://127.0.0.1:4173/v2/index.html";
const action = (page, text) => page.locator("#actions button:not([disabled])", { hasText: text }).click();
const move = (page, text) => page.locator("#moves button", { hasText: text }).click();
const main = (page) => page.locator("#goalText [data-track=main]");
const text = (page, id) => page.evaluate((key) => window.__v2App.worldData.texts[key], id);
async function start(page, scout = false) {
  await page.goto(ENTRY);
  await expect.poll(() => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  if (scout) await page.locator("#backgroundSelect").selectOption("start_scout");
  await page.locator("#newGameBtn").click();
}
async function ask(page) {
  await action(page, "원로를 찾아간다");
  await page.locator("#choiceOptions button:not([disabled])", { hasText: "폐허에 대해 묻는다" }).click();
}

test("mobile: preparation and arrival are reflected in the goal, including real saved-game reload", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await ask(page);
  await expect(main(page)).toHaveText(await text(page, "goal_search_ruins"));
  await move(page, "시장으로 간다");
  await action(page, "등불을 산다");
  await expect(main(page)).toHaveText(await text(page, "goal_leave_market"));
  await expect(main(page)).not.toContainText("등불부터 구한다");
  await expect(page.locator("#news")).toContainText("낡은 등불");
  await expect(page.locator("#goal")).toHaveAttribute("data-changed", "true");
  await page.locator("#saveSlotInput").fill("guidance-lantern");
  await page.locator("#saveBtn").click();
  await expect(page.locator("#log")).toContainText("guidance-lantern");
  await page.reload();
  await page.locator("#slotList li", { hasText: "guidance-lantern" }).getByRole("button", { name: "불러오기" }).click();
  await expect(main(page)).toHaveText(await text(page, "goal_leave_market"));
  await move(page, "변경 마을로 간다");
  await expect(main(page)).toHaveText(await text(page, "goal_search_ruins_ready"));
  await move(page, "폐허로 간다");
  await expect(main(page)).toHaveText(await text(page, "goal_search_ruins_here"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("unavailable actions remain visible in their own group while numbering follows available actions", async ({ page }) => {
  await start(page);
  const later = page.getByRole("group", { name: "지금은 할 수 없는 일" });
  await expect(later).toBeVisible();
  await expect(later.getByRole("button", { name: /도적 두목 앞에 나선다/ })).toBeVisible();
  await expect(later.locator("button:not([disabled])")).toHaveCount(0);
  const viewCounts = await page.evaluate(() => {
    const entries = window.__v2App.getView().actions;
    return { all: entries.length, locked: entries.filter((a) => !a.available).length };
  });
  await expect(page.locator("#actions button")).toHaveCount(viewCounts.all);
  await expect(later.locator("button")).toHaveCount(viewCounts.locked);
  await page.keyboard.press("1");
  await expect(page.locator("#location")).toContainText("00:20");
});

test("the scout reaches the investigation goal without buying a lantern", async ({ page }) => {
  await start(page, true);
  await ask(page);
  await expect(main(page)).toHaveText(await text(page, "goal_search_ruins_night"));
  await move(page, "폐허로 간다");
  await expect(main(page)).toHaveText(await text(page, "goal_search_ruins_here"));
  expect(await page.evaluate(() => window.__v2App.getView().actor.inventory.item_lantern ?? 0)).toBe(0);
});
