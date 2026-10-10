// V2-Core-51 browser scenario (Issue #135, Stats Decision, D-80): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The status shows the six common stats; the real strike button is opposed by the leader's
// STR (a save whose leader is stronger shows a margin 3 lower on the same roll); a save of the
// previous pack (0.2.0, `wit`) is refused visibly and left as it is (D-68).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// on this seed the investigation succeeds (tests/v2/data-world-combat.test.js uses the same path)
const SEED = "history-0";
const STRIKE = "정면으로 맞붙는다";

const P = (actionId) => ({ type: "perform", actionId });
const READY = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" }, P("act_buy_lantern"), { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" },
  P("act_investigate_ruins"), { type: "move", to: "loc_village" }, P("act_rest_village"), P("act_rest_village"),
  { type: "move", to: "loc_ruins" }
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
  return [...text.matchAll(/판정: [^(]+ \(([+-]?\d+)\)/g)].map((m) => Number(m[1]));
}
async function strike(page) {
  const before = (await margins(page)).length;
  await page.locator("#choiceOptions button", { hasText: STRIKE }).click();
  await expect.poll(async () => (await margins(page)).length).toBe(before + 1);
  return (await margins(page))[0];
}
async function plant(page, slot, mutateSource) {
  await page.evaluate(async ({ slot, mutateSource }) => {
    const storage = await import("/v2/storage/idb.js");
    const copy = structuredClone(window.__v2App.getState());
    new Function("s", mutateSource)(copy);
    await storage.save(slot, copy, {});
  }, { slot, mutateSource });
}

test.describe("V2 stats (STR / DEX / CON / INT / WIS / PER)", () => {
  test("the six stats in the status; the real strike is opposed by the leader's STR", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(async ({ seed, actions }) => {
      await window.__v2App.newGame(seed);
      actions.forEach((action) => window.__v2App.dispatch(action));
    }, { seed: SEED, actions: READY });
    await expect(page.locator("#status")).toContainText("능력치: 체력 8, 민첩 8, 지능 8, 감각 8, 힘 8, 지혜 8");
    expect((await getState(page)).dataRef).toEqual({ id: "frontier_village_pack", version: "0.3.0" });

    // the fight begins; saved; a second save whose leader is stronger (STR 16 -> +3 difficulty)
    await page.locator("#actions button", { hasText: "도적 두목과 싸운다" }).click();
    await expect(page.locator("#choice")).toBeVisible();
    await page.locator("#saveSlotInput").fill("slot_fight");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await plant(page, "slot_strong", "s.actors.npc_bandit_leader.growth.growth_wanderer.stats.str = 16;");

    const margin = await strike(page);
    await reload(page);
    await loadButton(page, "slot_strong").click();
    await expect(page.locator("#choice")).toBeVisible();
    // (and a third save from here: his STR back to 10, his DEX 20 -- the strike does not read DEX)
    await plant(page, "slot_quick", "s.actors.npc_bandit_leader.growth.growth_wanderer.stats.str = 10; s.actors.npc_bandit_leader.growth.growth_wanderer.stats.dex = 20;");
    expect(await strike(page)).toBe(margin - 3);

    await reload(page);
    await loadButton(page, "slot_quick").click();
    await expect(page.locator("#choice")).toBeVisible();
    expect(await strike(page)).toBe(margin);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a save of the previous pack (0.2.0, wit) is refused visibly and left untouched", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate(() => window.__v2App.newGame("stats-old-save"));
    await plant(page, "slot_old", 's.dataRef.version = "0.2.0"; for (const a of Object.values(s.actors)) a.growth.growth_wanderer.stats = { wit: a.kind === "npc" ? 10 : 8 };');

    await reload(page);
    await loadButton(page, "slot_old").click();
    await expect(page.locator("#error")).toBeVisible();
    await expect(page.locator("#error")).toContainText("호환되지 않아 불러오지 않았다");
    await expect(page.locator("#error")).toContainText("dataRef mismatch");
    await expect(page.locator("#game")).toBeHidden();
    expect(await getState(page)).toBeNull();

    await reload(page);
    await expect(page.locator("#slotList li")).toHaveCount(1);
    const stored = await page.evaluate(async () => (await (await import("/v2/storage/idb.js")).load("slot_old")));
    expect(stored.dataRef.version).toBe("0.2.0");
    expect(stored.actors.player_1.growth.growth_wanderer.stats).toEqual({ wit: 8 });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
