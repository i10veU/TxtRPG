// V2-Core-45 browser scenario (Issue #123, the V2 slice of #66): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data
// pack. The bandits' dispersal becomes history: the elder tells it as news, two days later as the
// village's legend, and the ruins show the truth -- to the same character after a save -> reload ->
// load, and to a successor who inherits no knowledge. Day-long waits are dispatched (the UI's wait
// button is 30 minutes); every discovery goes through the real buttons and the log.
// V2-Core-46 (Issue #125): the character who saw the truth corrects the legend through the elder's
// real choice, and from then on the elder tells the true account -- to a successor too.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// the investigation, the confrontation and a later investigation all succeed on this seed
// (tests/v2/data-world-tale.test.js uses the same one)
const SEED = "history-41";
const NEWS = "도적단의 소식을 묻는다";
const NEWS_TEXT = "도적단이 흩어졌다는 소식";
const LEGEND_TEXT = "마을 사람들 손에 모두 쓰러졌다는 전설";
const ABANDONED_TEXT = "도적단은 쓰러진 것이 아니라 흩어졌다";
const NEW_CHARACTER = "새 캐릭터로 시작 (떠돌이)"; // V2-Core-53: one button per background
const CORRECT = "폐허에서 본 것을 바로잡아 전한다";
const CORRECT_TEXT = "앞으로는 있었던 그대로 전하겠다";
const CORRECTED_NEWS_TEXT = "누군가 폐허에서 그것을 직접 보았다고 한다";

const P = (actionId) => ({ type: "perform", actionId });
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), { type: "choose", optionId: "opt_ask_ruins" },
  { type: "move", to: "loc_market" }, P("act_buy_lantern"), { type: "move", to: "loc_village" }, { type: "move", to: "loc_ruins" },
  P("act_investigate_ruins"), { type: "move", to: "loc_village" }, P("act_rest_village"), P("act_talk_elder"),
  { type: "choose", optionId: "opt_report_findings" }, P("act_confront_leader"), P("act_talk_elder"),
  { type: "choose", optionId: "opt_bandits_disperse" }
];
const TWO_DAYS = [{ type: "wait", minutes: 1440 }, { type: "wait", minutes: 1440 }];

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
const choiceButton = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const dispatchAll = (page, actions) => page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), actions);
const knows = (state, actorId, rumorId) => state.knowledge?.[actorId]?.[rumorId];

async function askNews(page) {
  await act(page, "원로와 대화");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, NEWS).click();
  await expect(page.locator("#choice")).toBeHidden();
}

async function startDispersed(page) {
  await page.evaluate(async ({ seed, actions }) => {
    await window.__v2App.newGame(seed);
    actions.forEach((action) => window.__v2App.dispatch(action));
  }, { seed: SEED, actions: TO_DISPERSAL });
  await expect(page.locator("#game")).toBeVisible();
}

test.describe("V2 world tale (the dispersal becomes history, and a later life finds it)", () => {
  test("news, then -- two days and a reload later -- the legend, then the truth at the ruins", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startDispersed(page);
    const dispersed = await getState(page);
    expect(dispersed.facts.fact_bandits_fate.value).toBe("dispersed");
    expect(dispersed.signals.bandits_tale_age).toBe(1);

    // fresh: the elder's news
    await askNews(page);
    await expect(page.locator("#log")).toContainText(NEWS_TEXT);
    expect(knows(await getState(page), "player_1", "rum_bandits_fate").claim).toBe("dispersed");

    // two days pass; saved, reloaded, loaded
    await dispatchAll(page, TWO_DAYS);
    const aged = await getState(page);
    expect(aged.signals.bandits_tale_age).toBe(3);
    await page.locator("#saveSlotInput").fill("slot_tale");
    await page.locator("#saveBtn").click();
    await expect.poll(() => page.locator("#slotList li").count()).toBe(1);
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
    await page.locator("#slotList li", { hasText: "slot_tale" }).getByRole("button", { name: "불러오기" }).click();
    await expect(page.locator("#game")).toBeVisible();
    expect(await getState(page)).toEqual(aged);

    // later: the same question gets the legend
    await askNews(page);
    await expect(page.locator("#log")).toContainText(LEGEND_TEXT);
    expect(knows(await getState(page), "player_1", "rum_bandits_legend").claim).toBe("slain");

    // the ruins: the hideout was abandoned, not fought over; the legend is corrected
    await act(page, "마을에서 쉬기");
    await act(page, "마을에서 쉬기");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    await expect(page.locator("#log")).toContainText(ABANDONED_TEXT);
    const searched = await getState(page);
    expect(knows(searched, "player_1", "rum_bandits_fate").claim).toBe("dispersed");
    expect(knows(searched, "player_1", "rum_bandits_legend")).toMatchObject({ claim: "dispersed", source: "obs_loc_ruins", confidence: 80 });
    expect(await page.evaluate(() => "facts" in window.__v2App.getView())).toBe(false); // the objective history is never in the view (§8.4)

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("a successor inherits no knowledge, hears the legend, and finds the truth on their own", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startDispersed(page);

    // the character who dispersed the bandits dies at the ruins (real wait button); a new one starts
    await move(page, "폐허");
    for (let i = 0; i < 6 && (await page.locator("#choice").isHidden()); i += 1) await page.locator("#waitBtn").click();
    await expect(choiceButton(page, NEW_CHARACTER)).toBeVisible();
    await choiceButton(page, NEW_CHARACTER).click();
    await expect(page.locator("#choice")).toBeHidden();
    const successor = await getState(page);
    expect(successor.player.actorId).toBe("player_2");
    expect(successor.knowledge?.player_2).toBeUndefined();

    // days later the elder tells the successor the legend
    await dispatchAll(page, TWO_DAYS);
    await askNews(page);
    await expect(page.locator("#log")).toContainText(LEGEND_TEXT);
    expect(knows(await getState(page), "player_2", "rum_bandits_legend").claim).toBe("slain");

    // their own way to the ruins and their own search
    await act(page, "원로와 대화");
    await choiceButton(page, "폐허에 대해 묻기").click();
    await move(page, "시장");
    await act(page, "등불 구입");
    await move(page, "변경 마을");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    await expect(page.locator("#log")).toContainText(ABANDONED_TEXT);
    const found = await getState(page);
    expect(knows(found, "player_2", "rum_bandits_legend").claim).toBe("dispersed");
    expect(knows(found, "player_1", "rum_bandits_legend")).toBeUndefined(); // the predecessor never heard it

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the one who saw the truth corrects the legend, and the elder tells it to the next life", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startDispersed(page);
    await dispatchAll(page, TWO_DAYS);

    // the legend: heard, but nothing to correct yet (the option is not offered)
    await act(page, "원로와 대화");
    await expect(page.locator("#choice")).toBeVisible();
    await expect(choiceButton(page, CORRECT)).toHaveCount(0);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#log")).toContainText(LEGEND_TEXT);

    // the ruins show the truth
    await act(page, "마을에서 쉬기");
    await act(page, "마을에서 쉬기");
    await move(page, "폐허");
    await act(page, "폐허 조사");
    await expect(page.locator("#log")).toContainText(ABANDONED_TEXT);
    await move(page, "변경 마을");

    // the correction, through the elder's real choice; it is offered once
    await act(page, "원로와 대화");
    await expect(choiceButton(page, CORRECT)).toHaveCount(1);
    await choiceButton(page, CORRECT).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#log")).toContainText(CORRECT_TEXT);
    expect((await getState(page)).flags.bandits_tale_corrected).toBe(true);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, CORRECT)).toHaveCount(0);
    await choiceButton(page, NEWS).click();
    await expect(page.locator("#log")).toContainText(CORRECTED_NEWS_TEXT);

    // the character dies at the ruins; the successor inherits nothing and hears the true account
    await move(page, "폐허");
    for (let i = 0; i < 6 && (await page.locator("#choice").isHidden()); i += 1) await page.locator("#waitBtn").click();
    await choiceButton(page, NEW_CHARACTER).click();
    await expect(page.locator("#choice")).toBeHidden();
    const successor = await getState(page);
    expect(successor.player.actorId).toBe("player_2");
    expect(successor.knowledge?.player_2).toBeUndefined();
    await askNews(page);
    await expect(page.locator("#log")).toContainText(CORRECTED_NEWS_TEXT);
    const heard = (await getState(page)).knowledge.player_2;
    expect(Object.keys(heard)).toEqual(["rum_bandits_fate"]); // the truth, and no legend
    expect(heard.rum_bandits_fate).toMatchObject({ claim: "dispersed", source: "npc_elder" });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
