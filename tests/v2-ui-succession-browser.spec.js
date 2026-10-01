// V2-Core-36 browser investigation (Issue #102): the real entry point
// (web/v2/index.html + ui/app.js) driven in real Chromium, with real
// IndexedDB, against the real world data pack -- what a succession passes on
// and who a world reward pays. The scenarios record the CURRENT behaviour
// (docs/v2/architecture/CORE_CONTRACTS.md §9, D-70, D-71; D-71 (3) decided in
// V2-Core-44: a successor's investigation does not undo the dispersal); none of them decides
// an inheritance rule: the predecessor's inventory / relations / knowledge are
// NOT handed to the successor, and the world reward belongs to whoever holds
// the triggering edge first.
//
// Node coverage of the same rules lives in tests/v2/data-world.test.js. Every
// older spec is untouched.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
// found for this slice (tests/v2/data-world.test.js seedForRewardMatrix() uses the same idea):
// the predecessor's and the successor's own investigations, confrontations and decisions all succeed
const SEED = "succession-120";
const REPORT = "조사에서 알아낸 것을 전한다";
const FATE = "도적단 잔당의 처분을 원로에게 맡긴다";
const NEWS = "도적단의 소식을 묻는다";
const NEW_CHARACTER = "새 캐릭터로 시작";
const CONFRONT = "도적 두목과 대면";
const MARKET_EVENT = "evt_market_reopens";
const MARKET_TEXT = "상인들이 안도하며 은화 몇 닢을 사례한다";
const SUCCESSION_TEXT = "쓰러진 이가 남긴 은화 몇 닢이 새 방랑자의 손에 들어온다";

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
const actionButton = (page, label) => page.locator("#actions button", { hasText: label });
const getState = (page) => page.evaluate(() => window.__v2App.getState());
const getView = (page) => page.evaluate(() => window.__v2App.getView());
const getLog = (page) => page.evaluate(() => window.__v2App.getLog());
const relic = (state, actorId) => state.actors[actorId].inventory.item_relic ?? 0;
const fired = (state) => state.fired[MARKET_EVENT];

async function startGame(page, seed) {
  await page.evaluate((s) => window.__v2App.newGame(s), seed);
  await expect(page.locator("#game")).toBeVisible();
}

// talk to the elder and pick one of the options
async function talkAndChoose(page, optionLabel) {
  await act(page, "원로와 대화");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, optionLabel).click();
  await expect(page.locator("#choice")).toBeHidden();
}

// observe x2, the elder's rumor, the lantern, the ruins, the investigation, back to the
// village to rest: the character's own proof (relic) is in their own inventory
async function playToConfirmedVillage(page) {
  await act(page, "마을 살피기");
  await act(page, "마을 살피기");
  await talkAndChoose(page, "폐허에 대해 묻기");
  await move(page, "시장");
  await act(page, "등불 구입");
  await move(page, "변경 마을");
  await move(page, "폐허");
  await act(page, "폐허 조사");
  await move(page, "변경 마을");
  await act(page, "마을에서 쉬기");
}

// ...the report, the confrontation, and the decision about the bandits' fate
async function playToDecision(page) {
  await playToConfirmedVillage(page);
  await talkAndChoose(page, REPORT);
  await act(page, CONFRONT);
  await talkAndChoose(page, FATE);
}

// a successor in a world where the bandits are already dispersed: their own proof, report and
// confrontation (V2-Core-44, D-71 (3) decided: the dispersal is not undone, so there is no second
// decision about the bandits' fate)
async function playToOwnEdge(page) {
  await playToConfirmedVillage(page);
  await talkAndChoose(page, REPORT);
  await act(page, CONFRONT);
}

// the character dies at the ruins through the real wait button (rested to 6 HP, the hazard takes
// 4 on arrival and 4 more after half an hour), and the player starts a new one
async function dieAndStartSuccessor(page) {
  await move(page, "폐허");
  await expect(page.locator("#status")).toContainText("HP 2/10");
  await page.locator("#waitBtn").click();
  await expect(page.locator("#status")).toContainText("HP 0/10");
  await expect(page.locator("#choice")).toBeVisible();
  await choiceButton(page, NEW_CHARACTER).click();
  await expect(page.locator("#choice")).toBeHidden();
  await expect(page.locator("#location")).toContainText("변경 마을");
}

async function reloadAndLoad(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await expect(page.locator("#menu")).toBeVisible();
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}

const saveTo = async (page, slot, count) => {
  await page.locator("#saveSlotInput").fill(slot);
  await page.locator("#saveBtn").click();
  await expect.poll(() => page.locator("#slotList li").count()).toBe(count);
};

// dispatch an action behind the UI's back; true when the engine changed nothing
const dispatchUnchanged = (page, action) =>
  page.evaluate((a) => {
    const snapshot = JSON.stringify(window.__v2App.getState());
    window.__v2App.dispatch(a);
    return snapshot === JSON.stringify(window.__v2App.getState());
  }, action);
const choose = (optionId) => ({ type: "choose", optionId });

test.describe("V2 succession investigation (what passes on, and who the world reward pays)", () => {
  test("predecessor -> death -> successor: nothing personal is inherited, the world is kept, the reward is unclaimed", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);

    // 1-2. the first character: own proof, the report, the confrontation, the decision
    await startGame(page, SEED);
    await playToDecision(page);
    const decided = await getState(page);
    expect(relic(decided, "player_1")).toBe(1);
    expect(decided.flags.ruins_secret_confirmed).toBe(true);
    expect(decided.cases.case_ruins_mystery.stage).toBe("resolved");
    expect(decided.relations["npc_elder:player_1"].tags).toEqual(["confidant"]);
    expect(decided.relations["org_bandits:player_1"].tags).toEqual(["cowed"]);
    expect(decided.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    expect(fired(decided)).toBeUndefined();

    // 3. save the moment of the decision
    await saveTo(page, "slot_decided", 1);

    // 4. the first character dies; the dead record, the world and the pending gate
    await move(page, "폐허");
    await page.locator("#waitBtn").click();
    await expect(page.locator("#status")).toContainText("HP 0/10");
    const dead = await getState(page);
    expect(dead.actors.player_1.alive).toBe(false);
    expect(dead.pending).toEqual({ kind: "newCharacter" });
    await expect(page.locator("#waitBtn")).toBeDisabled();
    expect(await dispatchUnchanged(page, { type: "move", to: "loc_market" })).toBe(true);

    // 5. the player starts the successor
    await choiceButton(page, NEW_CHARACTER).click();
    await expect(page.locator("#choice")).toBeHidden();
    await expect(page.locator("#location")).toContainText("변경 마을");
    await expect(page.locator("#log")).toContainText(SUCCESSION_TEXT);
    const successor = await getState(page);

    // 6. the successor's starting state: template + the pack's fixed money, nothing from the predecessor
    const a = dead.actors.player_1;
    const b = successor.actors.player_2;
    expect(successor.player).toEqual({ actorId: "player_2", characterCount: 2 });
    expect(b.money).toBe(11);
    expect(b.money).not.toBe(a.money);
    expect(b.inventory).toEqual({});
    expect(b.hp).toEqual({ current: 10, max: 10 });
    expect(b.tags).toEqual([]);
    expect(b.growth.growth_wanderer.unlocks ?? {}).toEqual({});
    expect(a.growth.growth_wanderer.unlocks).toEqual({ unl_keen_eye: true });
    await expect(page.locator("#status")).toContainText("소지금 11");
    await expect(page.locator("#status")).not.toContainText("폐허의 유물");
    expect(successor.actors.player_1).toEqual(dead.actors.player_1);
    const seen = await getView(page);
    expect(seen.actor.id).toBe("player_2");
    expect(seen.knowledge ?? {}).toEqual({});
    expect(seen.relations ?? {}).toEqual({});

    // 7. the world-level consequences are kept exactly as they were
    for (const field of ["time", "rng", "flags", "signals", "facts", "cases", "fired", "attempts", "relations", "knowledge"]) {
      expect(successor[field], field).toEqual(dead[field]);
    }
    expect(successor.flags.ruins_secret_confirmed).toBe(true);
    expect(successor.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1); // world-only `requires`: offered to the successor too
    await expect(choiceButton(page, REPORT)).toHaveCount(0); // the personal proof is not
    await expect(choiceButton(page, FATE)).toHaveCount(0);
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();

    // 8. the predecessor's personal state stays with the predecessor
    expect(relic(await getState(page), "player_2")).toBe(0);
    await expect(actionButton(page, CONFRONT)).toBeDisabled();
    expect(await dispatchUnchanged(page, { type: "perform", actionId: "act_confront_leader" })).toBe(true);
    const edges = (state, id) => Object.keys(state.relations).filter((k) => k.endsWith(`:${id}`)).sort();
    expect(edges(await getState(page), "player_1")).toEqual(["npc_bandit_leader:player_1", "npc_elder:player_1", "org_bandits:player_1"]);
    expect(edges(await getState(page), "player_2").every((k) => k === "npc_elder:player_2")).toBe(true);

    // 9. the reward the predecessor earned is not the successor's: the market pays nothing
    const beforeVisit = await getState(page);
    await move(page, "시장");
    const atMarket = await getState(page);
    expect(atMarket.actors.player_2.money).toBe(beforeVisit.actors.player_2.money);
    expect(fired(atMarket)).toBeUndefined();
    expect((await getLog(page)).join("\n")).not.toContain(MARKET_TEXT);
    expect(atMarket.actors.player_1.money).toBe(dead.actors.player_1.money);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the successor earns their own edge: then (and only then) the market pays them, once for the whole world", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startGame(page, SEED);
    await playToDecision(page);
    await dieAndStartSuccessor(page);
    const before = await getState(page);

    // the successor's own proof: the dispersal A decided stands (V2-Core-44, D-71 (3) decided)
    await playToConfirmedVillage(page);
    const proven = await getState(page);
    expect(relic(proven, "player_2")).toBe(1);
    expect(proven.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    await act(page, "원로와 대화");
    await expect(choiceButton(page, NEWS)).toHaveCount(1); // the world's history holds: still offered
    await expect(choiceButton(page, FATE)).toHaveCount(0); // and the fate cannot be decided again
    await choiceButton(page, "안부만 묻기").click();
    await expect(page.locator("#choice")).toBeHidden();
    await move(page, "시장");
    expect(fired(await getState(page))).toBeUndefined(); // no edge of their own yet
    await move(page, "변경 마을");

    // their own report and confrontation
    await talkAndChoose(page, REPORT);
    await act(page, CONFRONT);
    const decided = await getState(page);
    expect(decided.relations["org_bandits:player_2"].tags).toEqual(["cowed"]);
    expect(decided.relations["npc_bandit_leader:org_bandits"].tags).toEqual([]);
    expect(decided.actors.player_1.money).toBe(before.actors.player_1.money);

    // save -> visit -> reload -> load -> visit: the same input gives the same result
    await saveTo(page, "slot_b_decided", 1);
    await move(page, "시장");
    const paid = await getState(page);
    expect(paid.actors.player_2.money).toBe(decided.actors.player_2.money + 3);
    expect(paid.actors.player_1.money).toBe(before.actors.player_1.money); // the dead predecessor is never paid
    expect(fired(paid).count).toBe(1);
    await expect(page.locator("#log")).toContainText(MARKET_TEXT);

    await reloadAndLoad(page, "slot_b_decided");
    expect(await getState(page)).toEqual(decided);
    await move(page, "시장");
    expect(await getState(page)).toEqual(paid);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the predecessor collects first: the successor's own edge is never paid (`once` is world-wide)", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await startGame(page, SEED);
    await playToDecision(page);

    // the predecessor collects the reward, then dies
    const decided = await getState(page);
    await move(page, "시장");
    const collected = await getState(page);
    expect(collected.actors.player_1.money).toBe(decided.actors.player_1.money + 3);
    expect(fired(collected).count).toBe(1);
    await move(page, "변경 마을");
    await dieAndStartSuccessor(page);
    const successor = await getState(page);
    expect(fired(successor)).toEqual(fired(collected));

    // the successor stands in the market with no edge of their own: nothing
    await move(page, "시장");
    expect((await getState(page)).actors.player_2.money).toBe(successor.actors.player_2.money);
    await move(page, "변경 마을");

    // and with an edge of their own: still nothing, and the world-wide record is untouched
    await playToOwnEdge(page);
    const own = await getState(page);
    expect(own.relations["org_bandits:player_2"].tags).toEqual(["cowed"]);
    const ownMoney = own.actors.player_2.money;
    await move(page, "시장");
    const after = await getState(page);
    expect(after.actors.player_2.money).toBe(ownMoney);
    expect(fired(after)).toEqual(fired(collected));
    expect((await getLog(page)).filter((line) => line.includes(MARKET_TEXT))).toHaveLength(1);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("the same inputs from the same seed give the same history, and a rejected input changes nothing", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    const PROOF = [
      { type: "perform", actionId: "act_observe_village" },
      { type: "perform", actionId: "act_observe_village" },
      { type: "perform", actionId: "act_talk_elder" },
      choose("opt_ask_ruins"),
      { type: "move", to: "loc_market" },
      { type: "perform", actionId: "act_buy_lantern" },
      { type: "move", to: "loc_village" },
      { type: "move", to: "loc_ruins" },
      { type: "perform", actionId: "act_investigate_ruins" },
      { type: "move", to: "loc_village" },
      { type: "perform", actionId: "act_rest_village" }
    ];
    const OWN_EDGE = [{ type: "perform", actionId: "act_talk_elder" }, choose("opt_report_findings"), { type: "perform", actionId: "act_confront_leader" }];
    const DECIDE = [...OWN_EDGE, { type: "perform", actionId: "act_talk_elder" }, choose("opt_bandits_disperse")];
    const path = [
      ...PROOF,
      ...DECIDE,
      { type: "move", to: "loc_ruins" },
      { type: "wait", minutes: 30 },
      { type: "startCharacter", templateId: "start_wanderer" },
      ...PROOF,
      ...OWN_EDGE, // the bandits stay dispersed: no second decision (V2-Core-44)
      { type: "move", to: "loc_market" }
    ];
    const replay = () =>
      page.evaluate(async ({ seed, actions }) => {
        await window.__v2App.newGame(seed);
        const rejected = [];
        actions.forEach((action, index) => {
          const before = JSON.stringify(window.__v2App.getState());
          window.__v2App.dispatch(action);
          if (before === JSON.stringify(window.__v2App.getState())) rejected.push(index);
        });
        return { state: window.__v2App.getState(), rejected };
      }, { seed: SEED, actions: path });
    const first = await replay();
    expect(first.rejected).toEqual([]); // every input of the path was accepted and changed the state
    expect(first.state.actors.player_2.money).toBe(11 - 5 + 3);
    expect(first.state.fired[MARKET_EVENT].count).toBe(1);
    const second = await replay();
    expect(second).toEqual(first);

    // a rejected input (startCharacter while no new character is pending) leaves the state untouched
    const unchanged = await page.evaluate(async ({ seed, actions }) => {
      await window.__v2App.newGame(seed);
      actions.forEach((action) => window.__v2App.dispatch(action));
      const snapshot = JSON.stringify(window.__v2App.getState());
      window.__v2App.dispatch({ type: "startCharacter", templateId: "start_wanderer" });
      return snapshot === JSON.stringify(window.__v2App.getState());
    }, { seed: SEED, actions: path.slice(0, path.length - 1) });
    expect(unchanged).toBe(true);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
