// V2-Core-126 browser scenario (#309, Road News step 1b -- what the guard knows, in words): the real entry point
// (web/v2/index.html + ui/app.js) in real Chromium with real IndexedDB, against the real world data pack. The road to the castle
// town is dispatched; the road's condition and the guard's standing are staged through the real storage adapter and loaded with
// the app's button (data-world-road-news.test.js stages the same); the rest is real buttons.
//   1. no internal id on screen: the menu's backgrounds, the status line (stats, practice, skills and tiers, traits, resources,
//      gear), a check's result, a refused action, the new-character buttons -- words, not ids;
//   2. what the guard knows: each word with where it came from, how sure, how old; the one the clerk's choice bears on is marked
//      while that choice is open; an older word of the same thing is marked when a newer one replaces it; the yard's talk reads
//      as hearsay.
const { test, expect } = require("@playwright/test");

const ENTRY_URL = "http://127.0.0.1:4173/v2/index.html";
const SEED = "history-41"; // tests/v2/data-world-road-news.test.js
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const DAY = { type: "wait", minutes: 1440 };
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
// an id of the pack or of the engine, on screen
const PACK_ID = /\b(rum|txt|lbl|npc|obs|src|loc|act|opt|fact|unl|evt|item|start|choice)_[a-z0-9_]+/;
const ENGINE_WORD = /\b(great|success|partial|fail|margin|requirements_not_met|unknown_[a-z]+|pending_[a-z_]+|str|dex|con|int|wis|per|stamina|swordsmanship|investigation|herbalism|combat|hand|body|Novice|Apprentice|Adept|Untrained)\b/;

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
const act = (page, label) => page.locator("#actions button", { hasText: label }).click();
const option = (page, label) => page.locator("#choiceOptions button", { hasText: label });
const knowledge = (page) => page.locator("#knowledge li");
const word = (page, text) => page.locator("#knowledge li", { hasText: text });
const noIds = async (page, where) => {
  const text = await page.locator(where).innerText();
  expect(text, `${where}: no pack id`).not.toMatch(PACK_ID);
  expect(text, `${where}: no engine word`).not.toMatch(ENGINE_WORD);
};

async function loadSlot(page, slot) {
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(async () => page.evaluate(() => Boolean(window.__v2App))).toBe(true);
  await page.locator("#slotList li", { hasText: slot }).getByRole("button", { name: "불러오기" }).click();
  await expect(page.locator("#game")).toBeVisible();
}
// the road's condition and the guard's standing with the clerk, a convoy waiting; extra edits by `patch` (in the page). Staged
// from the app's current state (what the guard knows is kept) and loaded with the app's button
async function stage(page, { trouble, score, slot, patch = "" }) {
  await page.evaluate(async ({ HOUR, trouble, score, slot, patch }) => {
    const idb = await import("/v2/storage/idb.js");
    const { step } = await import("/v2/core/engine.js");
    const { evaluateCondition } = await import("/v2/core/rules.js");
    const { worldData } = await import("/v2/data/world.js");
    const open = (s) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort").requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
    let s = structuredClone(window.__v2App.getState());
    for (let h = 0; h < 96 && !open(s); h += 1) s = step(s, HOUR, worldData).state;
    s.relations = { ...s.relations, ["npc_guild_clerk:" + s.player.actorId]: { score } };
    s.signals = { ...s.signals, road_trouble: trouble };
    s.facts.fact_road_north = { value: ["quiet", "uneasy", "dangerous"][trouble], since: s.time.minute };
    if (patch) new Function("s", patch)(s);
    await idb.save(slot, s, { savedAt: 1 });
  }, { HOUR, trouble, score, slot, patch });
  await loadSlot(page, slot);
}
const toTown = async (page) => { await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), TO_TOWN); };
const clerk = (page) => act(page, "상단 조합의 서기와 대화");
const ask = async (page) => { await clerk(page); await option(page, "일거리를 묻는다").click(); };

test.describe("V2 what the guard knows, in words (Road News, step 1b)", () => {
  test("no internal id on screen: the menu, the status, a check, a refusal, the next life", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await expect(page.locator("#backgroundSelect option")).toHaveText(["정찰자", "떠돌이"]);
    await noIds(page, "#menu");
    await page.evaluate((seed) => window.__v2App.newGame(seed, "start_scout"), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await toTown(page);
    await expect(page.locator("#status")).toContainText("능력치: 체력 8, 민첩 8, 지능 8, 감각 8, 힘 8, 지혜 8");
    await expect(page.locator("#status")).toContainText("자원: 기력");
    await expect(page.locator("#status")).toContainText("특성: 조사의 재능, 밤눈");
    await expect(page.locator("#log")).toContainText(/판정: (대성공|성공|어중간함|실패) \([+-]\d+\)/);
    // a refused action reads as a sentence, not a code
    await page.evaluate(() => window.__v2App.dispatch({ type: "perform", actionId: "act_no_such_thing" }));
    await expect(page.locator("#log li").first()).toHaveText("그런 행동은 없다.");
    await noIds(page, "#game");
    // the next life: the buttons name the backgrounds
    await stage(page, { trouble: 0, score: 0, slot: "slot_words_end", patch: "s.actors[s.player.actorId].hp.current = 0; s.actors[s.player.actorId].alive = false; s.pending = { kind: 'newCharacter' };" });
    await expect(option(page, "새 캐릭터로 시작 (떠돌이)")).toBeVisible();
    await expect(option(page, "새 캐릭터로 시작 (정찰자)")).toBeVisible();
    await noIds(page, "#game");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test("what the guard knows: from where, how sure, how old; what the choice bears on; what newer word replaced", async ({ page }) => {
    const { pageErrors, consoleErrors } = await gotoApp(page);
    await page.evaluate((seed) => window.__v2App.newGame(seed), SEED);
    await expect(page.locator("#game")).toBeVisible();
    await toTown(page);
    // what the elder told of the way north, in words, with who said it
    await expect(word(page, "강나루는 북쪽에 있다")).toHaveText("강나루는 북쪽에 있다 · 마을 원로에게 들음 · 그럴듯함 · 오늘");

    // a stranger hears the yard's talk: hearsay
    await stage(page, { trouble: 2, score: 5, slot: "slot_words_stranger" });
    await ask(page);
    await expect(word(page, "강나루 길이 심상치 않다")).toHaveText("강나루 길이 심상치 않다 · 조합 마당의 이야기 · 뜬소문 · 오늘");

    // a known guard hears the ledger: reliable; with the clerk's choice open, it is the word that bears on it, first in the list
    // (and an unrelated word heard today, which comes first by its name when nothing bears on it)
    await stage(page, { trouble: 2, score: 10, slot: "slot_words_known", patch: "const d = Math.floor(s.time.minute / 1440); s.knowledge[s.player.actorId].rum_realm_levy = { rumorId: 'rum_realm_levy', factId: 'fact_realm_levy', claim: 'known', source: 'npc_ferryman', sources: ['npc_ferryman'], confidence: 60, confirmations: 1, firstSeenDay: d, lastSeenDay: d };" });
    await ask(page);
    await expect(word(page, "강나루 길이 험하다")).toHaveText("강나루 길이 험하다 · 상단 조합의 서기에게 들음 · 믿을 만함 · 오늘");
    await clerk(page);
    await expect(knowledge(page).first()).toHaveText(/^\[지금 선택과 관련\] 강나루 길이 험하다/);
    await expect(page.locator("#knowledge li[data-relevant]")).toHaveCount(2); // the road's two words (the yard's talk, the ledger's), and only those
    await expect(word(page, "강나루는 북쪽에 있다")).not.toHaveAttribute("data-relevant", "true");
    await option(page, "일거리를 묻는다").click();
    await expect(page.locator("#knowledge li[data-relevant]")).toHaveCount(0); // the choice is closed
    await expect(knowledge(page).first()).toHaveText("영주의 징집령이 내렸다 · 뱃사공에게 들음 · 그럴듯함 · 오늘");

    // days later the ledger says quiet: the new word is today's, the old one is dated and marked as replaced
    await page.evaluate((list) => list.forEach((a) => window.__v2App.dispatch(a)), [DAY, DAY, DAY]);
    await stage(page, { trouble: 0, score: 10, slot: "slot_words_later" });
    await ask(page);
    await expect(word(page, "강나루 길이 조용하다")).toHaveText("강나루 길이 조용하다 · 상단 조합의 서기에게 들음 · 믿을 만함 · 오늘");
    await expect(word(page, "강나루 길이 험하다")).toHaveText(/^강나루 길이 험하다 · 상단 조합의 서기에게 들음 · 믿을 만함 · \d+일 전 · 더 새 소식이 있음$/);
    await expect(word(page, "강나루 길이 험하다")).toHaveAttribute("data-stale", "true");
    await expect(word(page, "강나루 길이 조용하다")).not.toHaveAttribute("data-stale", "true");
    await noIds(page, "#knowledge");
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
