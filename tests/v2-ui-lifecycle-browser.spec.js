// V2-Core-25 browser scenarios (Issue #80): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium against the real
// world data pack -- location-gated actions, time advancement, the ruins
// hazard event, HP decrease, death, the `newCharacter` UI (previously never
// executed in a browser, Issue #78 finding), succession, and save/load of the
// new lifecycle states via real IndexedDB.
//
// Node coverage of the same mechanics lives in
// tests/v2/data-world-lifecycle.test.js; the canonical playthrough is still
// covered, unchanged, by tests/v2-ui-browser.spec.js.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";

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

// Reaches the ruins with the lantern through the real buttons.
async function walkToRuins(page) {
  await move(page, "시장");
  await act(page, "등불 구입");
  await move(page, "변경 마을");
  await move(page, "폐허");
}

test.describe("V2 UI lifecycle (time / location / event / death / succession)", () => {
  test("location gating and time advancement are visible and lock reasons stay hidden", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();

    await expect(page.locator("#location")).toContainText("변경 마을");
    await expect(page.locator("#location")).toContainText("1일차 00:00");
    await expect(page.locator("#actions button", { hasText: "마을 살피기" })).toBeEnabled();
    await expect(page.locator("#actions button", { hasText: "원로와 대화" })).toBeEnabled();

    // moving costs the link's minutes (existing `minutes` semantics)
    await move(page, "시장");
    await expect(page.locator("#location")).toContainText("시장");
    await expect(page.locator("#location")).toContainText("1일차 00:15");

    // showWhenLocked:true -> shown but disabled, with NO reason text (D-06/D-15);
    // no showWhenLocked -> not listed at all
    const talk = page.locator("#actions button", { hasText: "원로와 대화" });
    await expect(talk).toBeDisabled();
    await expect(talk).toHaveText("원로와 대화 (잠김)");
    await expect(page.locator("#actions button", { hasText: "마을 살피기" })).toHaveCount(0);
    await expect(page.locator("#error")).toBeHidden();
    await expect(page.locator("#game")).not.toContainText("requirements_not_met");

    // a locked action dispatched behind the UI's back is rejected by the engine
    const unchanged = await page.evaluate(() => {
      const before = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "perform", actionId: "act_talk_elder" });
      return before === JSON.stringify(window.__v2App.getState());
    });
    expect(unchanged).toBe(true);

    // an ungated action still works here
    await expect(page.locator("#actions button", { hasText: "등불 구입" })).toBeEnabled();

    // back in the village the gated actions are offered and executable again
    await move(page, "변경 마을");
    await expect(page.locator("#location")).toContainText("1일차 00:30");
    await expect(page.locator("#actions button", { hasText: "마을 살피기" })).toBeEnabled();
    await expect(page.locator("#actions button", { hasText: "원로와 대화" })).toBeEnabled();
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("ruins hazard event -> HP decrease -> death -> newCharacter UI -> succession", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();
    await expect(page.locator("#status")).toContainText("HP 10/10");

    // arrival: 15 + 15 + 45 minutes; the event trigger runs in the same step
    await walkToRuins(page);
    await expect(page.locator("#location")).toContainText("폐허");
    await expect(page.locator("#location")).toContainText("1일차 01:15");
    await expect(page.locator("#status")).toContainText("HP 6/10");
    await expect(page.locator("#log")).toContainText("무너진 벽돌");
    const fired = await page.evaluate(() => window.__v2App.getState().fired);
    expect(fired.evt_ruins_hazard).toEqual({ count: 1, lastMinute: 75 });

    // waiting 30 minutes elapses the cooldown -> second hit
    await page.locator("#waitBtn").click();
    await expect(page.locator("#location")).toContainText("1일차 01:45");
    await expect(page.locator("#status")).toContainText("HP 2/10");

    // third hit kills the wanderer
    await page.locator("#waitBtn").click();
    await expect(page.locator("#status")).toContainText("HP 0/10");
    await expect(page.locator("#log")).toContainText("쓰러졌다");

    // the previously-unexecuted newCharacter UI branch
    await expect(page.locator("#choice")).toBeVisible();
    const startButton = page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (start_wanderer)" });
    await expect(startButton).toHaveCount(1);
    await expect(page.locator("#actions")).toBeEmpty();
    await expect(page.locator("#moves")).toBeEmpty();
    await expect(page.locator("#waitBtn")).toBeDisabled();
    const dead = await page.evaluate(() => {
      const s = window.__v2App.getState();
      return { pending: s.pending, alive: s.actors.player_1.alive, actorId: s.player.actorId };
    });
    expect(dead).toEqual({ pending: { kind: "newCharacter" }, alive: false, actorId: "player_1" });

    // starting a new character: template stats + succession stipend
    await startButton.click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#location")).toContainText("변경 마을");
    await expect(page.locator("#status")).toContainText("HP 10/10");
    await expect(page.locator("#status")).toContainText("소지금 11");
    await expect(page.locator("#log")).toContainText("쓰러진 이가 남긴");
    await expect(page.locator("#waitBtn")).toBeEnabled();
    await expect(page.locator("#actions button", { hasText: "마을 살피기" })).toBeEnabled();

    const after = await page.evaluate(() => {
      const s = window.__v2App.getState();
      return {
        player: s.player,
        pending: s.pending,
        oldAlive: s.actors.player_1.alive,
        minute: s.time.minute,
        hazardCount: s.fired.evt_ruins_hazard.count
      };
    });
    expect(after).toEqual({
      player: { actorId: "player_2", characterCount: 2 },
      pending: null,
      oldAlive: false,
      minute: 135,
      hazardCount: 3
    });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("save/load regression: pending newCharacter and the state after it survive a real reload", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.locator("#newGameBtn").click();

    // fast path to death through the same dispatch the buttons use
    await page.evaluate(() => {
      const d = window.__v2App.dispatch;
      d({ type: "move", to: "loc_market" });
      d({ type: "perform", actionId: "act_buy_lantern" });
      d({ type: "move", to: "loc_village" });
      d({ type: "move", to: "loc_ruins" });
      d({ type: "wait", minutes: 30 });
      d({ type: "wait", minutes: 30 });
    });
    await expect(page.locator("#choice")).toBeVisible();
    const deadState = await page.evaluate(() => window.__v2App.getState());
    expect(deadState.pending).toEqual({ kind: "newCharacter" });

    await page.locator("#saveSlotInput").fill("slot_dead");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await expect(page.locator("#menu")).toBeVisible();
    await page.locator("#slotList li", { hasText: "slot_dead" }).getByRole("button", { name: "불러오기" }).click();

    // the pending state is restored byte-for-byte and the UI shows the newCharacter choice again
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#choice")).toBeVisible();
    expect(await page.evaluate(() => window.__v2App.getState())).toEqual(deadState);
    await expect(page.locator("#actions")).toBeEmpty();

    await page.locator("#choiceOptions button", { hasText: "새 캐릭터로 시작 (start_wanderer)" }).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#status")).toContainText("소지금 11");
    const aliveState = await page.evaluate(() => window.__v2App.getState());
    expect(aliveState.player.actorId).toBe("player_2");

    await page.locator("#saveSlotInput").fill("slot_alive");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_alive" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    await expect(page.locator("#choice")).toBeHidden();
    expect(await page.evaluate(() => window.__v2App.getState())).toEqual(aliveState);
    await expect(page.locator("#actions button", { hasText: "마을 살피기" })).toBeEnabled();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
