// V2-Core-47 browser scenario (Issue #127, D-77): the real entry point (web/v2/index.html +
// ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The bandit
// leader is an actor from the start of a new game; the real confrontation button is opposed by his
// stat (`wit`; WIS since V2-Core-51 -- a save whose leader is wiser shows a margin 2 lower on the same roll); he survives
// save -> reload -> load; he never appears in the view; and a save of the previous pack (0.1.0, no
// leader actor) is refused visibly and left as it is (D-68, Gate 2).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// the investigation and the confrontation succeed on this seed (tests/v2/npc-actor.test.js)
const SEED = "history-41";
const CONFRONT = "도적 두목과 대면";

const P = (actionId) => ({ type: "perform", actionId });
const TO_CONFRONT = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" }, P("act_buy_lantern"), { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" },
  P("act_investigate_ruins"), { type: "move", to: "loc_village" }, P("act_rest_village"), P("act_talk_elder"),
  { type: "choose", optionId: "opt_report_findings" }
];

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

const getState = (page) => page.evaluate(() => window.__v2App.getState());
const loadButton = (page, slot) => page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" });
async function reload(page) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
}
// the margins of the checks the log shows, newest first (renderLog lists the latest entry on top)
async function margins(page) {
  const text = await page.locator("#log").innerText();
  return [...text.matchAll(/판정: \w+ \(margin (-?\d+)\)/g)].map((m) => Number(m[1]));
}
// click the confrontation and return its check's margin (waits for its own log line)
async function confront(page) {
  const before = (await margins(page)).length;
  await page.locator("#actions button", { hasText: CONFRONT }).click();
  await expect.poll(async () => (await margins(page)).length).toBe(before + 1);
  return (await margins(page))[0];
}
// plant a save through the app's own storage module, from the current state changed by `mutate`
async function plant(page, slot, mutateSource) {
  await page.evaluate(async ({ slot, mutateSource }) => {
    const storage = await import("/v2/storage/idb.js");
    const copy = structuredClone(window.__v2App.getState());
    new Function("s", mutateSource)(copy);
    await storage.save(slot, copy, {});
  }, { slot, mutateSource });
}

test.describe("V2 NPC actor (the bandit leader is an actor, and the confrontation reads him)", () => {
  test("the leader is an actor; the real confrontation is opposed by his WIS; he survives save -> reload -> load", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(async ({ seed, actions }) => {
      await window.__v2App.newGame(seed);
      actions.forEach((action) => window.__v2App.dispatch(action));
    }, { seed: SEED, actions: TO_CONFRONT });
    await expect(page.locator("#game")).toBeVisible();

    const before = await getState(page);
    expect(before.actors.npc_bandit_leader).toEqual({
      id: "npc_bandit_leader", kind: "npc", alive: true, locationId: "loc_ruins",
      hp: { current: 10, max: 10 }, money: 0, inventory: {},
      growth: { growth_wanderer: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, per: 10 } } }, tags: []
    });
    expect(before.dataRef).toEqual({ id: "frontier_village_pack", version: "0.3.0" });
    const shown = await page.evaluate(() => window.__v2App.getView());
    expect(shown.actor.id).toBe("player_1");
    expect("actors" in shown).toBe(false);
    expect(JSON.stringify(shown)).not.toContain('"kind":"npc"');

    // saved through the UI; a second save whose leader is wiser (WIS 14 -> +2 difficulty)
    await page.locator("#saveSlotInput").fill("slot_before");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await plant(page, "slot_sharp", "s.actors.npc_bandit_leader.growth.growth_wanderer.stats.wis = 14;");

    // the real button, against the template's leader
    const margin = await confront(page);
    expect(Number.isInteger(margin)).toBe(true);
    expect((await getState(page)).cases.case_ruins_mystery.stage).toBe("resolved");

    // reload; the sharper leader's save: the same roll, a margin 2 lower
    await reload(page);
    await expect.poll(() => page.locator("#slotList li").count()).toBe(2);
    await loadButton(page, "slot_sharp").click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await confront(page)).toBe(margin - 2);

    // the first save loads back with the leader as he was
    await page.locator("#backToMenuBtn").click();
    await loadButton(page, "slot_before").click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(before);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a save of the previous pack (0.1.0, no leader actor) is refused visibly and left untouched", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("npc-old-save"));
    await plant(page, "slot_old", 's.dataRef.version = "0.1.0"; delete s.actors.npc_bandit_leader;');

    await reload(page);
    await expect(page.locator("#menu")).toBeVisible();
    await loadButton(page, "slot_old").click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toContainText("호환되지 않아 불러오지 않았다");
    await expect(page.locator("#error")).toContainText("dataRef mismatch");
    await expect(page.locator("#game")).toBeHidden();
    expect(await getState(page)).toBeNull();

    // not deleted, not repaired, not migrated
    await reload(page);
    await expect(page.locator("#slotList li")).toHaveCount(1);
    const stored = await page.evaluate(async () => (await (await import("/v2/storage/idb.js")).load("slot_old")));
    expect(stored.dataRef.version).toBe("0.1.0");
    expect("npc_bandit_leader" in stored.actors).toBe(false);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
