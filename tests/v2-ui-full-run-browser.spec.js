// V2-Core-145 browser scenario (roadmap M8, MG-083 a new player's whole game, Issue #363): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB and the real pack, from a new game to an ending and
// on, through the buttons only -- no dispatch, no staged state. A player who reads the screen (the status, what the
// buttons offer) and decides from it:
//   act one (the ruins, the confrontation, the dispersal), a free rest, the ferry north; the caravan guard's work in the
//   castle town -- an escort when the clerk offers one, a night's lodging when hurt or spent, otherwise a day's wait --
//   until long after the band was talked of; the town's board tells how the frontier stands, the elder tells the day the
//   village fell (chapter 5); saved -> reloaded -> loaded, the same world, and the world goes on.
//   V2-Core-146 (Issue #365): the same start, and a player who takes the main thread on -- asks the guild and the
//   ferryman about the band, pays the ferryman to watch, looks at the band's camp every six days when whole, and once the
//   knowledge panel says it is about to cross keeps watch at the crossroads (or, finding the camp empty, reads the tracks
//   and hurries south: V2-Core-146); there the last fight, the best exchange the
//   buttons offer, breaking off to the village when hurt; the name is remembered (chapter 5, the elder), kept across a
//   reload. The seed is one whose watch hears the warning (a watch can fail; the policy measurements count how often).
// The clicks are counted (V2-Core-144: a day's wait is one).
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41";
const FIGHT_SEED = process.env.FULL_RUN_FIGHT_SEED ?? "history-41";
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

async function actOne(u) {
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
}

// one turn of the guard's work in the castle town: an escort when offered, a night when hurt or spent, else a day's wait
async function guardTurn(u, s, { askBand } = {}) {
  if (me(s).locationId !== "loc_castle_town") return u.move("loc_castle_town");
  if ((me(s).hp.current <= 6 || stamina(s) < 3) && me(s).money >= 2) return u.act("act_lodge_castle_town");
  await u.act("act_talk_guild_clerk");
  if (askBand && (await u.offered(CLERK, "opt_guild_clerk_band"))) return u.choose(CLERK, "opt_guild_clerk_band");
  if (await u.offered(CLERK, "opt_guild_clerk_escort_lead")) return u.choose(CLERK, "opt_guild_clerk_escort_lead");
  if (await u.offered(CLERK, "opt_guild_clerk_escort")) return u.choose(CLERK, "opt_guild_clerk_escort");
  await u.choose(CLERK, "opt_guild_clerk_ask");
  return u.waitDay();
}

test.describe("V2 a new player's whole game (M8): from a new game to an ending, through the buttons", () => {
  test("act one, the guard's work, the frontier's fall told by the board and the elder; kept across a reload; the world goes on", async ({ page }) => {
    test.setTimeout(240000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    const u = player(page);

    await actOne(u);
    await northToTown(u);
    await expect(page.locator("#location")).toContainText("영주의 성읍");
    const start = await u.state();

    // the guard's work, as long as the screen gives work; a day's wait when it gives none
    let s = start;
    for (let i = 0; i < 400 && day(s) - day(start) < 64; i += 1) {
      if (s.pending?.kind === "newCharacter") {
        await u.startOver();
        await northToTown(u);
      } else {
        await guardTurn(u, s);
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

  test("the main thread taken on: the band asked after and watched, the vigil at the crossroads, the last fight, the name remembered", async ({ page }) => {
    test.setTimeout(300000);
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), FIGHT_SEED);
    const u = player(page);
    await actOne(u);
    await northToTown(u);
    const knowsText = async (label) => (await page.locator("#knowledge").innerText()).includes(label);
    const texts = await page.evaluate(() => window.__v2App.worldData.texts);
    const SOON = texts.lbl_rumor_rum_band_crossing_soon;

    const plan = { askedClerk: false, ferryman: false, lastWatch: -Infinity, campEmpty: false };
    const WATCH = await page.evaluate(() => window.__v2App.worldData.actions.act_watch_band_camp.name);
    let s = await u.state();
    const start = s;
    // until the warning (or the camp found empty: they have gone): the guard's work, the band asked after, the ferryman
    // paid, the camp watched when whole
    for (let i = 0; i < 500 && !(await knowsText(SOON)) && !plan.campEmpty && day(s) - day(start) < 70; i += 1) {
      if (s.pending?.kind === "newCharacter") {
        await u.startOver();
        await northToTown(u);
        Object.assign(plan, { askedClerk: false, ferryman: false, lastWatch: -Infinity });
      } else if (!plan.askedClerk && me(s).locationId === "loc_castle_town" && s.pending === null) {
        await u.act("act_talk_guild_clerk");
        if (await u.offered(CLERK, "opt_guild_clerk_band")) { await u.choose(CLERK, "opt_guild_clerk_band"); plan.askedClerk = true; }
        else await u.choose(CLERK, "opt_guild_clerk_ask");
        if (!plan.askedClerk) await guardTurn(u, await u.state());
      } else if (plan.askedClerk && !plan.ferryman && me(s).money >= 3 + 5 && ["loc_castle_town", "loc_far_bank"].includes(me(s).locationId)) {
        // the ferryman knows where the band gathers; for five he will watch the river
        if (me(s).locationId === "loc_castle_town") await u.move("loc_far_bank");
        await u.move("loc_river_ford");
        await u.act("act_talk_ferryman");
        await u.choose(FERRY, "opt_ferryman_band");
        await u.act("act_talk_ferryman");
        if (await u.offered(FERRY, "opt_ferryman_watch")) await u.choose(FERRY, "opt_ferryman_watch");
        else await u.choose(FERRY, "opt_ferryman_news");
        await u.act("act_talk_ferryman");
        await u.choose(FERRY, "opt_ferryman_cross");
        await u.move("loc_castle_town");
        plan.ferryman = true;
      } else if (plan.ferryman && day(s) - plan.lastWatch >= 6 && me(s).locationId === "loc_castle_town") {
        if (me(s).hp.current < me(s).hp.max && me(s).money >= 2) await u.act("act_lodge_castle_town");
        else if (me(s).hp.current >= me(s).hp.max) {
          plan.lastWatch = day(s);
          await u.move("loc_far_bank");
          await u.move("loc_band_camp");
          // no watch to keep: the camp is empty, and its tracks say the band has gone south (V2-Core-146)
          if ((await page.locator("#actions button", { hasText: exact(WATCH) }).count()) === 1) await u.act("act_watch_band_camp");
          else {
            await u.act("act_search_empty_camp");
            plan.campEmpty = true;
          }
          await u.move("loc_far_bank");
          if (!plan.campEmpty) await u.move("loc_castle_town");
        } else await guardTurn(u, s);
      } else {
        await guardTurn(u, s, { askBand: !plan.askedClerk });
      }
      s = await u.state();
    }
    expect((await knowsText(SOON)) || (plan.campEmpty && (await knowsText(texts.lbl_rumor_rum_band_crossed)))).toBe(true);

    // the vigil: the fare home kept, then the crossroads, a day at a time, until the band stands there
    while (!plan.campEmpty && me(s).money < 3) { await guardTurn(u, s); s = await u.state(); }
    if (me(await u.state()).locationId === "loc_castle_town") await u.move("loc_far_bank");
    await u.move("loc_river_ford");
    await u.move("loc_crossroads");
    const FACE = await page.evaluate(() => window.__v2App.worldData.actions.act_face_band.name);
    const faceable = async () => (await page.locator("#actions button", { hasText: exact(FACE) }).count()) === 1;
    for (let i = 0; i < 30 && !(await faceable()); i += 1) await u.waitDay();
    expect(await faceable()).toBe(true);

    // the last fight: the best exchange the buttons offer; when hurt, back to the village to rest, and again
    const FIGHT = "choice_final_battle";
    for (let stand = 0; stand < 12 && !(await u.state()).flags.band_broken; stand += 1) {
      await u.act("act_face_band");
      while ((await u.state()).pending?.kind === "choice") {
        const st = await u.state();
        const key = st.actors.npc_bandit_leader.alive ? "chief" : "right_hand";
        if (me(st).hp.current <= 4) { await u.choose(FIGHT, `opt_final_${key}_flee`); break; }
        let picked = false;
        for (const o of ["weak_spot", "with_village", "sword_cut", "strike"]) {
          const id = `opt_final_${key}_${o}`;
          const exists = await page.evaluate(([c, i]) => window.__v2App.worldData.choices[c].options.some((x) => x.id === i), [FIGHT, id]);
          if (exists && (await u.offered(FIGHT, id))) { await u.choose(FIGHT, id); picked = true; break; }
        }
        expect(picked).toBe(true);
      }
      if ((await u.state()).flags.band_broken) break;
      while (me(await u.state()).hp.current < me(await u.state()).hp.max) await u.act("act_rest_village");
      await u.move("loc_crossroads");
    }
    const won = await u.state();
    expect(won.flags.band_broken).toBe(true);
    expect(won.signals.frontier_fate).toBe(1);
    await expect(page.locator("#log")).toContainText(texts.txt_final_victory.slice(0, 12));
    await expect(page.locator("#story")).toContainText("4장");

    // the elder tells the day: the name the village calls
    if (me(won).locationId !== "loc_village") await u.move("loc_village");
    await u.act("act_talk_elder");
    await u.choose(ELDER, "opt_elder_aftermath");
    await expect(page.locator("#log")).toContainText(texts.txt_elder_after_name.slice(0, 12));
    await expect(page.locator("#story")).toContainText("5장");
    const end = await u.state();

    await page.locator("#saveSlotInput").fill("slot_full_run_name");
    await page.locator("#saveBtn").click();
    await expect(page.locator("#log")).toContainText("slot_full_run_name");
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_full_run_name" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await u.state()).toEqual(end);
    await u.waitDay();
    expect((await u.state()).time.minute).toBeGreaterThan(end.time.minute);

    console.log(`full run (the name): ${u.clicks()} clicks, day ${Math.floor(day(end))}, south on ${plan.campEmpty ? "the empty camp" : "the warning"}`);
    expect(u.clicks()).toBeLessThan(600);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
