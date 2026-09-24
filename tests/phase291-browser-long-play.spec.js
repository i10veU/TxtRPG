const { test, expect } = require("@playwright/test");

async function submit(page, command) {
  await page.locator("#actionInput").fill(command);
  await page.locator("#actionForm button").click();
}

async function stateSnapshot(page) {
  return page.evaluate(() => {
    const world = window.AnonymousRPGApp.getState().world;
    const chain = world.playerQuests.chains["grain-warehouse"];
    return {
      day: world.day,
      minutes: world.minutes,
      cases: world.cases.map((entry) => [entry.id, entry.status]),
      history: world.caseHistory.map((entry) => entry.caseId),
      chainStatus: chain && chain.status,
      completedSteps: chain && chain.steps.filter((step) => step.status === "complete").length,
      campaignPhase: world.campaignPhase,
      finaleReady: world.finaleReady,
      gameStatus: world.gameStatus
    };
  });
}

test("progresses a representative case chain through the Worker and reload", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.AnonymousRPGApp.getState()))).toBe(true);

  await page.evaluate(async () => {
    const state = window.AnonymousRPGApp.getState();
    state.world.day = 0;
    state.world.minutes = 1320;
    state.world.npcSimulationMinute = 1320;
    state.world.tutorial = { step: 4, completed: true };
    state.world.campaignPhase = "long-play";
    state.world.finaleReady = false;
    state.world.ending = null;
    state.world.gameStatus = "active";
    state.world.flags.warehouseSuspicion = true;
    state.world.cases = [];
    state.world.caseHistory = [];
    state.world.caseCausalityDay = -1;
    state.world.playerQuests = { chains: {} };
    await window.AnonymousRPGApp.save();
  });
  await page.reload({ waitUntil: "networkidle" });

  await expect.poll(async () => page.evaluate(() => {
    const state = window.AnonymousRPGApp.getState();
    return state.world.cases.some((entry) => entry.id === "grain-warehouse" && entry.status === "open");
  })).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.AnonymousRPGApp.getRuntimeStatus().workerActive)).toBe(true);

  await submit(page, "사건목록");
  await expect(page.locator("#storyBody")).toContainText("grain-warehouse");
  await submit(page, "사건분기 1 1");
  await expect.poll(async () => page.evaluate(() => {
    const entry = window.AnonymousRPGApp.getState().world.cases.find((item) => item.id === "grain-warehouse");
    return [entry && entry.status, window.AnonymousRPGApp.getRuntimeStatus().workerActive];
  })).toEqual(["resolved", true]);

  await submit(page, "잠");
  await expect.poll(async () => page.evaluate(() => {
    const world = window.AnonymousRPGApp.getState().world;
    return [world.cases.some((entry) => entry.id === "grain-aftershock" && entry.status === "open"), window.AnonymousRPGApp.getRuntimeStatus().workerActive];
  })).toEqual([true, true]);
  await submit(page, "사건목록");
  await expect(page.locator("#storyBody")).toContainText("grain-aftershock");
  await submit(page, "사건분기 grain-aftershock 1");
  await expect.poll(async () => page.evaluate(() => {
    const entry = window.AnonymousRPGApp.getState().world.cases.find((item) => item.id === "grain-aftershock");
    return [entry && entry.status, window.AnonymousRPGApp.getRuntimeStatus().workerActive];
  })).toEqual(["resolved", true]);

  await expect.poll(async () => (await stateSnapshot(page)).chainStatus).toBe("complete");
  const progressed = await stateSnapshot(page);
  expect(progressed.history).toEqual(expect.arrayContaining(["grain-warehouse", "grain-aftershock"]));
  expect(progressed.completedSteps).toBe(4);
  expect(progressed.campaignPhase).toBe("finale-ready");
  expect(progressed.finaleReady).toBe(true);
  expect(progressed.gameStatus).toBe("active");

  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => (await stateSnapshot(page)).chainStatus).toBe("complete");
  const restored = await stateSnapshot(page);
  expect(restored.history).toEqual(expect.arrayContaining(["grain-warehouse", "grain-aftershock"]));
  expect(restored.campaignPhase).toBe("finale-ready");
  expect(restored.finaleReady).toBe(true);
  expect(restored.gameStatus).toBe("active");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
