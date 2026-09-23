const { test, expect } = require("@playwright/test");

test.describe("TxtRPG browser runtime", () => {
  test("boots through Worker, renders state, and persists through IndexedDB", async ({ page }) => {
    const pageErrors = [];
    const consoleErrors = [];

    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });

    const screen = await page.locator(".game").boundingBox();
    expect(screen.width).toBe(100);
    expect(screen.height).toBe(200);

    await expect(page).toHaveTitle(/무명의 연대기/);
    await expect(page.locator("#storyBody .turn")).toHaveCount(2);
    await expect(page.locator("#location")).toHaveText(/세르카/);
    await expect(page.locator("#npcList li")).toHaveCount(7);
    await expect(page.locator("#relationList li")).toHaveCount(6);
    await expect(page.locator("#organizationList li")).toHaveCount(6);
    await page.keyboard.press("3");
    await expect(page.locator("#overlayTitle")).toHaveText("NPC");
    await expect(page.locator("#npcList li")).toHaveCount(7);
    await expect(page.locator("#npcList")).toContainText("목표 0/3");
    await page.keyboard.press("Escape");
    await page.locator("#actionInput").fill("인물관계");
    await page.locator("#actionForm button").click();
    await expect(page.locator("#storyBody")).toContainText("↔");
    await page.locator("#actionInput").fill("지역자원");
    await page.locator("#actionForm button").click();
    await expect(page.locator("#storyBody")).toContainText("목재");
    await expect(page.locator("#storyBody")).toContainText("어물");

    await expect.poll(async () => {
      return page.evaluate(() => {
        const status = window.AnonymousRPGApp.getRuntimeStatus();
        return status.workerActive && Boolean(window.AnonymousRPGApp.getState());
      });
    }).toBe(true);

    const runtime = await page.evaluate(() => window.AnonymousRPGApp.getRuntimeStatus());
    expect(runtime.workerActive).toBe(true);
    expect(runtime.storage).toBe("AnonymousChroniclesDB");

    await page.keyboard.press("1");
    await expect(page.locator(".overlay")).toHaveClass(/is-open/);
    await expect(page.locator("#overlayTitle")).toHaveText("STATUS");
    await page.keyboard.press("Escape");
    await expect(page.locator(".overlay")).not.toHaveClass(/is-open/);

    const before = await page.evaluate(() => {
      const state = window.AnonymousRPGApp.getState();
      return {
        day: state.world.day,
        minutes: state.world.minutes,
        npcSimulationMinute: state.world.npcSimulationMinute,
        grainSupply: state.world.grainSupply,
        factionSimulationDay: state.world.factionSimulationDay,
        goalProgress: state.npcs.mara.goalState.progress,
        goalStatus: state.npcs.mara.goalState.status
      };
    });

    await page.locator("#actionInput").fill("휴식");
    await page.locator("#actionForm button").click();

    await expect.poll(async () => {
      return page.locator("#storyBody .turn").count();
    }).toBeGreaterThan(2);

    const after = await page.evaluate(() => {
      const state = window.AnonymousRPGApp.getState();
      return {
        day: state.world.day,
        minutes: state.world.minutes,
        npcSimulationMinute: state.world.npcSimulationMinute,
        grainSupply: state.world.grainSupply,
        factionSimulationDay: state.world.factionSimulationDay,
        goalProgress: state.npcs.mara.goalState.progress,
        goalStatus: state.npcs.mara.goalState.status,
        npcActions: Object.values(state.npcs).map((npc) => npc.lastAction).filter(Boolean)
      };
    });

    expect(after.day).toBe(before.day);
    expect(after.minutes).toBe(420);
    expect(after.npcSimulationMinute).toBe(420);
    expect(after.npcSimulationMinute).toBeGreaterThan(before.npcSimulationMinute);
    expect(after.grainSupply).toBeGreaterThan(before.grainSupply);
    expect(after.npcActions.length).toBeGreaterThan(0);
    expect(after.factionSimulationDay).toBe(after.day);
    expect(after.goalProgress).toBeGreaterThan(0);
    expect(["active", "blocked"]).toContain(after.goalStatus);

    await page.keyboard.press("6");
    await expect(page.locator(".overlay")).toHaveClass(/is-open/);
    await expect(page.locator("#overlayTitle")).toHaveText("RUMORS");
    await page.keyboard.press("Escape");

    await expect.poll(async () => {
      return page.evaluate(async () => {
        const names = await indexedDB.databases();
        return names.map((entry) => entry.name);
      });
    }).toContain("AnonymousChroniclesDB");

    const persistedTurns = await page.locator("#storyBody .turn").count();
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.locator("#storyBody .turn")).toHaveCount(persistedTurns);
    await expect.poll(async () => {
      return page.evaluate(() => window.AnonymousRPGApp.getState().world.minutes);
    }).toBe(420);

    const restored = await page.evaluate(() => {
      const state = window.AnonymousRPGApp.getState();
      const runtime = window.AnonymousRPGApp.getRuntimeStatus();
      return {
        minutes: state.world.minutes,
        npcSimulationMinute: state.world.npcSimulationMinute,
        grainSupply: state.world.grainSupply,
        factionSimulationDay: state.world.factionSimulationDay,
        workerActive: runtime.workerActive
      };
    });

    expect(restored.minutes).toBe(420);
    expect(restored.npcSimulationMinute).toBe(420);
    expect(restored.grainSupply).toBe(after.grainSupply);
    expect(restored.factionSimulationDay).toBe(0);
    expect(restored.workerActive).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
