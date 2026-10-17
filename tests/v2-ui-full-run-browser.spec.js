// V2-Core-145 browser scenario (roadmap M8, MG-083 a new player's whole game, Issue #363): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real pack, from a new game to an ending and
// on, through the buttons only -- no dispatch, no staged state. A player who reads the screen (the status, what the
// buttons offer) and decides from it:
//   act one (the ruins, the confrontation, the dispersal), a free rest, the ferry north; the caravan guard's work in the
//   castle town -- an escort when the clerk offers one, a night's lodging when hurt or spent, otherwise a day's wait --
//   until long after the band was talked of; the town's board tells how the frontier stands, the elder tells the day the
//   village fell (chapter 5); saved -> reloaded -> loaded, the same world, and the world goes on.
// The clicks are counted (V2-Core-144: a day's wait is one).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";
const DAY = 1440;
const ELDER = "choice_elder_dialogue";
const CLERK = "choice_guild_clerk_dialogue";
const FERRY = "choice_ferryman_dialogue";

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

const exact = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

// the buttons, found by the words the pack gives them (as a player reads them)
function player(page) {
  let clicks = 0;
  const name = (kind, id, choice) =>
    page.evaluate(([k, i, c]) => {
      const d = window.__v2App.worldData;
      if (k === "action") return d.actions[i].name;
      if (k === "move") return `${d.locations[i].name}(으)로 이동`;
      return d.choices[c].options.find((o) => o.id === i).name;
    }, [kind, id, choice]);
  const press = async (locator) => {
    await expect(locator).toHaveCount(1);
    await locator.click();
    clicks += 1;
  };
  return {
    clicks: () => clicks,
    state: () => page.evaluate(() => window.__v2App.getState()),
    act: async (id) => press(page.locator("#actions button", { hasText: exact(await name("action", id)) })),
    move: async (id) => press(page.locator("#moves button", { hasText: exact(await name("move", id)) })),
    choose: async (choice, id) => press(page.locator("#choiceOptions button", { hasText: exact(await name("option", id, choice)) })),
    offered: async (choice, id) => (await page.locator("#choiceOptions button", { hasText: exact(await name("option", id, choice)) }).count()) === 1,
    waitDay: async () => press(page.locator("#waitDayBtn")),
    startOver: async () => press(page.locator("#choiceOptions button", { hasText: /^새 캐릭터로 시작/ }).first())
  };
}

const me = (s) => s.actors[s.player.actorId];
const stamina = (s) => me(s).growth.growth_wanderer.resources.stamina.current;
const day = (s) => s.time.minute / DAY;

// from the village to the castle town: the ferry (the fare, or the elder's letter for one who has it)
async function northToTown(u) {
  await u.move("loc_crossroads");
  await u.move("loc_river_ford");
  await u.act("act_talk_ferryman");
  const letter = (me(await u.state()).inventory?.item_passage_letter ?? 0) > 0;
  await u.choose(FERRY, letter ? "opt_ferryman_cross_letter" : "opt_ferryman_cross");
  await u.move("loc_castle_town");
}

test.describe("V2 a new player's whole game (M8): from a new game to an ending, through the buttons", () => {
  test("act one, the guard's work, the frontier's fall told by the board and the elder; kept across a reload; the world goes on", async ({ page }) => {
    test.setTimeout(240000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    const u = player(page);

    // act one
    await u.act("act_observe_village");
    await u.act("act_observe_village");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_ask_ruins");
    await u.move("loc_market");
    await u.act("act_buy_lantern");
    await u.move("loc_village");
    await u.move("loc_ruins");
    await u.act("act_investigate_ruins");
    await u.move("loc_village");
    await u.act("act_rest_village");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_report_findings");
    await u.act("act_confront_leader");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_bandits_disperse");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_ask_region");
    // the road north starts hurt: a rest in the village is free
    while (me(await u.state()).hp.current < me(await u.state()).hp.max) await u.act("act_rest_village");
    await northToTown(u);
    await expect(page.locator("#location")).toContainText("영주의 성읍");
    const start = await u.state();

    // the guard's work, as long as the screen gives work; a day's wait when it gives none
    let s = start;
    for (let i = 0; i < 400 && day(s) - day(start) < 64; i += 1) {
      if (s.pending?.kind === "newCharacter") {
        await u.startOver();
        await northToTown(u);
      } else if (me(s).locationId !== "loc_castle_town") {
        await u.move("loc_castle_town");
      } else if ((me(s).hp.current <= 6 || stamina(s) < 3) && me(s).money >= 2) {
        await u.act("act_lodge_castle_town");
      } else {
        await u.act("act_talk_guild_clerk");
        if (await u.offered(CLERK, "opt_guild_clerk_escort_lead")) await u.choose(CLERK, "opt_guild_clerk_escort_lead");
        else if (await u.offered(CLERK, "opt_guild_clerk_escort")) await u.choose(CLERK, "opt_guild_clerk_escort");
        else {
          await u.choose(CLERK, "opt_guild_clerk_ask");
          await u.waitDay();
        }
      }
      s = await u.state();
    }
    expect(day(s) - day(start)).toBeGreaterThanOrEqual(64);
    expect(s.signals.frontier_fate).toBe(4); // the world's: no one stood before the band, and the village had too little

    // the town's board knows how the frontier stands; the elder tells the day itself
    if (me(s).locationId !== "loc_castle_town") await u.move("loc_castle_town");
    await u.act("act_read_castle_notices");
    const texts = await page.evaluate(() => window.__v2App.worldData.texts);
    await expect(page.locator("#log")).toContainText(texts.txt_castle_fate_fell.slice(0, 12));
    await u.move("loc_far_bank");
    await u.move("loc_river_ford");
    await u.move("loc_crossroads");
    await u.move("loc_village");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_elder_aftermath");
    await expect(page.locator("#log")).toContainText(texts.txt_elder_after_fell.slice(0, 12));
    await expect(page.locator("#story")).toContainText("5장");
    const end = await u.state();
    expect(end.pending).toBeFalsy();

    // kept across a reload
    await page.locator("#saveSlotInput").fill("slot_full_run");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_full_run");
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_full_run" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await u.state()).toEqual(end);
    await expect(page.locator("#story")).toContainText("5장");

    // the ending stops nothing: the world goes on (WB-0005 §1)
    await u.act("act_observe_village");
    await u.waitDay();
    expect((await u.state()).time.minute).toBeGreaterThan(end.time.minute);

    console.log(`full run: ${u.clicks()} clicks, day ${Math.floor(day(end))}`);
    expect(u.clicks()).toBeLessThan(400);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
