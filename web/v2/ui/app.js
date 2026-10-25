// V2-Core-23: minimal browser UI bootstrap (docs/v2/architecture/CORE_CONTRACTS.md,
// Issue #76). A thin adapter over the existing engine/storage public API --
// it never reimplements Condition/Effect/check semantics. It reuses
// `evaluateCondition` (already exported by rules.js) to decide which
// location links to show, exactly the same way engine.js itself resolves
// `requires` -- not a new evaluator.
//
// UI-held state is deliberately minimal (Issue #76 "UI 상태 관리"): the
// authoritative `state` object itself, `worldData` (fixed), the current
// save slot, a `busy` re-entrancy guard, and a bounded display log. The UI
// never keeps a second copy of game state -- every render recomputes
// `view(state, worldData)` fresh from the authoritative state.
//
// Lock reasons: `view()` deliberately never explains why a locked action is
// locked (D-06/D-15 -- exposing a reason can leak hidden facts). This UI
// respects that as-is: a locked (showWhenLocked) action renders disabled
// with no explanation, by design, not by omission.

import { createInitialState, step, view, validateState, checkDataCompatibility, adoptNewActors } from "../core/engine.js";
import { actorResource, evaluateCondition } from "../core/rules.js";
import * as storage from "../storage/idb.js";
import { worldData } from "../data/world.js";
import { waitDay } from "./wait.js";
import { currentGoals } from "./goals.js";
import { stakesOf, duration } from "./stakes.js";
import { knowledgeClock } from "./knowledge-clock.js";
import { knowledgeNewsChange } from "./knowledge-news.js";
import { hypothesisLedger } from "./hypothesis-ledger.js";
import { linkedCaseLedger, linkedCaseElderAction, linkedCaseReported, linkedCaseDecision, linkedCaseDecisionAction, linkedCaseSupport, linkedCasePatrolAction, linkedCasePatrolLead, linkedCaseTrapFollowup } from "./linked-case-ledger.js";
import { greetingFor } from "./people.js";
import { deedsTrue, endingLearned } from "./deeds.js";
import * as chronicle from "../storage/chronicle.js";
import { sceneOf, endingScene, COVER } from "./art.js";
import { paint } from "./paint.js";

const DAY_MINUTES = 1440;

let state = null;
let currentSlot = null;
let busy = false;
// Every session choice invalidates completions from earlier load/save requests.
let intentVersion = 0;
let slotListVersion = 0;
const logEntries = [];
const MAX_LOG_ENTRIES = 200;
// V2-Core-151 (J3): the scene -- what the last thing I did brought, in prose. The record (logEntries) keeps every line
let sceneLines = [];
// V2-Core-152: what the last step taught or gave me (rumours, items, silver, wounds), and whether my goal moved
let newsItems = [];
let goalChanged = false;
// The guess is an ephemeral UI choice, never a fact or inherited Save field.
let hypothesisSelection = null;
let hypothesisLifeKey = null;
let linkedCaseSelection = null;
let linkedCaseLifeKey = null;
// V2-Core-156 (D-134): the life being played, as the chronicle keeps it (storage/chronicle.js), and the ending shown
let life = null;
let endingCard = null;

// V2-Core-126 (#309, Road News step 1b): no internal id on screen. The pack's ids are shown by the words its `texts` give them
// (`lbl_*`); the engine's own ids (a check's tier, a rejection's code) by the UI's words here
const word = (key, fallback) => worldData.texts?.[key] ?? fallback;
const TIER_WORDS = { great: "대성공", success: "성공", partial: "어중간함", fail: "실패" };
const REJECT_WORDS = {
  requirements_not_met: "지금은 할 수 없다.",
  unknown_action: "그런 행동은 없다.",
  unknown_location: "그곳으로는 갈 수 없다.",
  unknown_option: "그런 선택지는 없다.",
  pending_choice: "먼저 앞의 선택을 해야 한다.",
  no_pending_choice: "고를 선택지가 없다.",
  pending_new_character: "먼저 새 캐릭터를 정해야 한다.",
  actor_dead: "쓰러진 몸으로는 할 수 없다.",
  invalid_action: "할 수 없는 행동이다."
};
const templateName = (templateId) => word(`lbl_tmpl_${templateId}`, templateId);

const el = {
  root: document.getElementById("app"),
  menu: document.getElementById("menu"),
  game: document.getElementById("game"),
  location: document.getElementById("location"),
  status: document.getElementById("status"),
  moves: document.getElementById("moves"),
  actions: document.getElementById("actions"),
  choice: document.getElementById("choice"),
  choiceOptions: document.getElementById("choiceOptions"),
  log: document.getElementById("log"),
  scene: document.getElementById("scene"),
  goalText: document.getElementById("goalText"),
  goal: document.getElementById("goal"),
  news: document.getElementById("news"),
  choiceTitle: document.getElementById("choiceTitle"),
  ending: document.getElementById("ending"),
  sceneArt: document.getElementById("sceneArt"),
  coverArt: document.getElementById("coverArt"),
  chronicleSection: document.getElementById("chronicleSection"),
  lives: document.getElementById("lives"),
  deedBook: document.getElementById("deedBook"),
  notebookBtn: document.getElementById("notebookBtn"),
  vitals: document.getElementById("vitals"),
  knowledge: document.getElementById("knowledge"),
  dangerClock: document.getElementById("dangerClock"),
  dangerClockText: document.getElementById("dangerClockText"),
  dangerClockEvidence: document.getElementById("dangerClockEvidence"),
  hypothesisLedger: document.getElementById("hypothesisLedger"),
  hypothesisQuestion: document.getElementById("hypothesisQuestion"),
  hypothesisEvidence: document.getElementById("hypothesisEvidence"),
  hypothesisChoices: document.getElementById("hypothesisChoices"),
  hypothesisVerdict: document.getElementById("hypothesisVerdict"),
  hypothesisNext: document.getElementById("hypothesisNext"),
  linkedCaseLedger: document.getElementById("linkedCaseLedger"),
  linkedCaseQuestion: document.getElementById("linkedCaseQuestion"),
  linkedCaseEvidence: document.getElementById("linkedCaseEvidence"),
  linkedCaseChoices: document.getElementById("linkedCaseChoices"),
  linkedCaseVerdict: document.getElementById("linkedCaseVerdict"),
  linkedCaseNext: document.getElementById("linkedCaseNext"),
  storySection: document.getElementById("storySection"),
  story: document.getElementById("story"),
  slotList: document.getElementById("slotList"),
  saveSlotInput: document.getElementById("saveSlotInput"),
  saveBtn: document.getElementById("saveBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  backgroundSelect: document.getElementById("backgroundSelect"),
  waitBtn: document.getElementById("waitBtn"),
  waitDayBtn: document.getElementById("waitDayBtn"),
  backToMenuBtn: document.getElementById("backToMenuBtn"),
  error: document.getElementById("error")
};

function showError(message) {
  if (!el.error) return;
  el.error.textContent = message;
  el.error.hidden = !message;
}

function pushLog(text) {
  logEntries.push(text);
  while (logEntries.length > MAX_LOG_ENTRIES) logEntries.shift();
}

// D-31/§2.4: `internal` events are never shown to the player. `action.resolved`
// and `character.started` are structural markers with nothing worth narrating
// beyond what their sibling events already said.
function describeEvent(e) {
  if (e.visibility !== "player") return null;
  switch (e.type) {
    case "narration":
      return worldData.texts?.[e.data.textId] ?? null;
    case "time.advanced":
      return `${e.data.minutes}분이 지났다.`;
    case "check.resolved":
      return `판정: ${TIER_WORDS[e.data.tier] ?? "?"} (${e.data.margin >= 0 ? "+" : ""}${e.data.margin})`;
    case "action.rejected":
      return REJECT_WORDS[e.data.code] ?? "할 수 없다.";
    case "choice.offered":
      return "새로운 선택을 해야 한다.";
    case "actor.died":
      return "쓰러졌다...";
    default:
      return null;
  }
}

function applyEvents(events) {
  events.forEach((e) => {
    const text = describeEvent(e);
    if (text) pushLog(text);
  });
}

// V2-Core-151: the scene shows the world's words and what could not be done; the time, the dice and the bookkeeping stay
// in the record. A step with nothing to say shows the place I am in
const SCENE_TYPES = new Set(["narration", "action.rejected", "actor.died"]);
function setScene(events) {
  const lines = events.filter((e) => SCENE_TYPES.has(e.type)).map(describeEvent).filter(Boolean);
  // V2-Core-154: a talk begins with how the person greets me (ui/people.js)
  const offered = events.find((e) => e.type === "choice.offered");
  const greeting = offered ? greetingFor(offered.data.choiceId, state, worldData) : null;
  if (greeting) lines.unshift(greeting);
  sceneLines = lines.length > 0 ? lines : placeLines();
}
function placeLines() {
  const actor = state?.actors?.[state.player.actorId];
  const text = actor && worldData.texts?.[`txt_place_${actor.locationId}`];
  return text ? [text] : [];
}
// V2-Core-152: a step's gains, read by comparing what I knew and had before it with after it (view() only -- nothing
// hidden). A word I had not heard, a word now confirmed, an item, silver, a wound, a new turn of the story
function snapshot() {
  if (!state) return null;
  const v = view(state, worldData);
  if (!v) return null;
  return { knowledge: v.knowledge ?? {}, actor: v.actor, goals: currentGoals(state, worldData).map((g) => g.textId), deeds: deedsTrue(state, worldData) };
}
function diffNews(before, after) {
  if (!before || !after) return [];
  const items = [];
  for (const [rumorId, k] of Object.entries(after.knowledge)) {
    if (!k || typeof k.rumorId !== "string") continue;
    const old = before.knowledge[rumorId];
    const label = word(`lbl_rumor_${rumorId}`, null);
    if (!label) continue;
    const chapter = worldData.rumors?.[rumorId]?.story?.chapter;
    const from = (k.sources ?? [k.source]).map(sourceName).join(", ");
    if (!old) items.push({ kind: Number.isInteger(chapter) ? "story" : "learned", text: label, note: from, rumorId });
    else {
      const update = knowledgeNewsChange(old, k);
      if (update) items.push({ ...update, text: label, rumorId });
    }
  }
  const inv = (a) => a.inventory ?? {};
  const itemIds = new Set([...Object.keys(inv(before.actor)), ...Object.keys(inv(after.actor))]);
  for (const id of itemIds) {
    const d = (inv(after.actor)[id] ?? 0) - (inv(before.actor)[id] ?? 0);
    const name = worldData.items?.[id]?.name ?? id;
    if (d > 0) items.push({ kind: "gained", text: d > 1 ? `${name} ${d}` : name });
    if (d < 0) items.push({ kind: "spent", text: -d > 1 ? `${name} ${-d}` : name });
  }
  const money = after.actor.money - before.actor.money;
  if (money !== 0) items.push({ kind: money > 0 ? "gained" : "spent", text: `은화 ${Math.abs(money)}` });
  const hp = after.actor.hp.current - before.actor.hp.current;
  if (hp !== 0) items.push({ kind: hp > 0 ? "healed" : "hurt", text: `체력 ${hp > 0 ? "+" : "−"}${Math.abs(hp)}` });
  items.push(...growthNews(before.actor, after.actor));
  return items;
}
// V2-Core-156: the numbers going up (RPG.kr) -- practice, a skill's rank, a stat, a new gift, a wound taken or closed
const WOUNDS = new Set(["road_wound", "road_wound_deep"]);
function growthNews(beforeActor, afterActor) {
  const sys = worldData.world.growthSystemId;
  const g0 = beforeActor.growth?.[sys] ?? {};
  const g1 = afterActor.growth?.[sys] ?? {};
  const items = [];
  const keys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort();
  keys(g0.proficiency, g1.proficiency).forEach((k) => {
    const d = (g1.proficiency?.[k] ?? 0) - (g0.proficiency?.[k] ?? 0);
    if (d > 0) items.push({ kind: "grew", text: `${word(`lbl_prof_${k}`, k)} 숙련 +${d}` });
  });
  keys(g0.skills, g1.skills).forEach((k) => {
    const a = g0.skills?.[k] ?? 0;
    const b = g1.skills?.[k] ?? 0;
    if (b > a) items.push({ kind: "grew", text: `${word(`lbl_skill_${k}`, k)} ${a} → ${b}` });
  });
  keys(g0.stats, g1.stats).forEach((k) => {
    const a = g0.stats?.[k] ?? 0;
    const b = g1.stats?.[k] ?? 0;
    if (b > a) items.push({ kind: "grew", text: `${word(`lbl_stat_${k}`, k)} ${a} → ${b}` });
  });
  keys(g0.unlocks, g1.unlocks).forEach((k) => {
    if (g1.unlocks?.[k] && !g0.unlocks?.[k]) items.push({ kind: "grew", text: `새 재주 · ${word(`lbl_unlock_${k}`, k)}` });
  });
  keys(g0.traits, g1.traits).forEach((k) => {
    const had = g0.traits?.[k] === true;
    const has = g1.traits?.[k] === true;
    if (has && !had) items.push({ kind: WOUNDS.has(k) ? "hurt" : "grew", text: word(`lbl_trait_${k}`, k) });
    if (had && !has && WOUNDS.has(k)) {
      const name = word(`lbl_trait_${k}`, k);
      items.push({ kind: "healed", text: `${name}${subjectParticle(name)} 아물었다` });
    }
  });
  return items;
}
// "상처가", "흉이": the subject particle a Korean word takes
function subjectParticle(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? "이" : "가";
}

function noteChanges(before, events = []) {
  const after = snapshot();
  newsItems = diffNews(before, after);
  goalChanged = Boolean(before && after) && before.goals[0] !== after.goals[0];
  if (!before || !after || !life) return;
  // what this life has done -- a deed true already when the life began is not its own
  const fresh = after.deeds.filter((id) => !before.deeds.includes(id) && !life.baseline.includes(id) && !life.deeds.includes(id));
  if (fresh.length > 0) {
    life.deeds.push(...fresh);
    fresh.forEach((id) => newsItems.push({ kind: "deed", text: word(id, id), note: word(`${id}_desc`, ""), deedId: id }));
    chronicle
      .markDeeds(fresh)
      .then((first) => {
        if (first.length === 0) return;
        newsItems.forEach((n) => {
          if (first.includes(n.deedId)) n.note = `처음 이룬 일 · ${n.note}`;
        });
        render();
      })
      .catch(() => {});
  }
  const ending = endingLearned(before.knowledge, after.knowledge, worldData);
  if (ending) closeLife(ending.id);
  else if (events.some((e) => e.type === "actor.died" && e.visibility === "player")) closeLife("died");
  else if (fresh.length > 0) keepLife();
}

// V2-Core-156 (D-134): the life in the chronicle -- begun with a new game or a new life, found again on a load
const lifeKey = () => `${state.worldId}:${state.player.actorId}`;
const daysOf = (l) => Math.floor((state.time.minute - l.startMinute) / DAY_MINUTES) + 1;
function keepLife() {
  if (!life) return;
  chronicle.putLife({ ...life, days: daysOf(life) }).catch(() => {});
}
function beginLife(templateId) {
  life = { key: lifeKey(), templateId, startMinute: state.time.minute, baseline: deedsTrue(state, worldData), deeds: [], end: null };
  endingCard = null;
  keepLife();
}
function resumeLife() {
  const key = lifeKey();
  life = null;
  endingCard = null;
  chronicle
    .getLife(key)
    .then((found) => {
      if (!state || lifeKey() !== key) return;
      // an older save, or a chronicle cleared: the life is kept from here on; its background is not known (the actor does not
      // keep it), so none is shown rather than a guess
      life = found ?? { key, templateId: null, startMinute: state.time.minute, baseline: deedsTrue(state, worldData), deeds: [], end: null };
      if (!found) keepLife();
    })
    .catch(() => {});
}
// one life in a line: its background (when known), how long, how it ended, what it did
const lifeLine = (templateId, days, title, deeds) =>
  [templateId && templateName(templateId), `${days}일`, title, `이룬 일 ${deeds}`].filter(Boolean).join(" · ");
// an ending (or a fall) closes the record's account -- the life may go on, and later deeds still join it
function closeLife(end) {
  if (!life) return;
  if (life.end === null) life.end = end;
  // a fall after the story has closed: the life is remembered by its ending, not as a nameless fall
  const story = end === "died" ? (life.end === "died" ? null : life.end) : end;
  endingCard = {
    end,
    title: word(story ? `${story}_title` : "end_died_title", ""),
    body: word(end !== "died" ? `${end}_body` : story ? "end_died_after_body" : "end_died_body", ""),
    meta: lifeLine(life.templateId, daysOf(life), null, life.deeds.length),
    deeds: life.deeds.map((id) => word(id, id))
  };
  keepLife();
}

function prologueLines(templateId) {
  const ids = worldData.world.prologue?.[templateId] ?? [];
  return ids.map((id) => worldData.texts?.[id]).filter(Boolean);
}

function formatTime(minute) {
  const day = Math.floor(minute / DAY_MINUTES) + 1;
  const ofDay = minute % DAY_MINUTES;
  const hour = Math.floor(ofDay / 60);
  const hh = String(hour).padStart(2, "0");
  const mm = String(ofDay % 60).padStart(2, "0");
  return `${day}일째 ${partOfDay(hour)} ${hh}:${mm}`;
}
function partOfDay(hour) {
  if (hour < 5) return "깊은 밤";
  if (hour < 7) return "새벽";
  if (hour < 11) return "아침";
  if (hour < 14) return "한낮";
  if (hour < 17) return "오후";
  if (hour < 20) return "저녁";
  return "밤";
}

function locationName(locationId) {
  return worldData.locations?.[locationId]?.name ?? locationId;
}

function requiresCtx(contextKind) {
  return { state, data: worldData, actorId: state.player.actorId, contextKind };
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function makeButton(label, onClick, { disabled = false, title } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.disabled = disabled;
  if (title) btn.title = title;
  btn.addEventListener("click", onClick);
  return btn;
}

// V2-Core-153 (D-131): what the choice asks of me, under its words (ui/stakes.js). Shown by CSS from data-note, so the
// button's own text stays the choice's words
function markStakes(btn, stakes) {
  if (!stakes) return btn;
  if (stakes.note) btn.dataset.note = stakes.note;
  if (stakes.risk) btn.dataset.risk = stakes.risk;
  if (stakes.locked) btn.dataset.locked = "true";
  if (stakes.title) btn.title = stakes.title;
  return btn;
}

function dispatch(action) {
  if (!state || busy) return;
  busy = true;
  showError("");
  const before = snapshot();
  try {
    const result = step(state, action, worldData);
    state = result.state;
    applyEvents(result.events);
    setScene(result.events);
    // a new life opens with its own prologue
    if (action.type === "startCharacter" && !result.events.some((e) => e.type === "action.rejected")) {
      sceneLines = prologueLines(action.templateId);
    }
    noteChanges(action.type === "startCharacter" ? null : before, result.events);
    if (action.type === "startCharacter" && !result.events.some((e) => e.type === "action.rejected")) beginLife(action.templateId);
  } catch (err) {
    showError(`처리 중 오류: ${err.message}`);
  } finally {
    busy = false;
    render();
  }
}

// V2-Core-144 (D-122, #361): a day of the wait button's half hours in one click (ui/wait.js), one line for the time
// instead of a line per half hour; the world's own lines as they came
function waitADay() {
  if (!state || busy) return;
  busy = true;
  showError("");
  const before = snapshot();
  try {
    const result = waitDay(state, worldData);
    state = result.state;
    applyEvents(result.events.filter((e) => e.type !== "time.advanced"));
    if (result.stop === null) pushLog("하루가 지났다.");
    else if (result.minutes > 0) pushLog(`${formatDuration(result.minutes)}을 기다리다 멈췄다.`);
    setScene(result.events);
    if (!result.events.some((e) => SCENE_TYPES.has(e.type))) {
      sceneLines = [result.stop === null ? "하루가 지났다. 별다른 일은 없었다." : `${formatDuration(result.minutes)}을 기다렸다.`];
    }
    noteChanges(before, result.events);
  } catch (err) {
    showError(`처리 중 오류: ${err.message}`);
  } finally {
    busy = false;
    render();
  }
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function renderChoice(pending) {
  clearChildren(el.choiceOptions);
  if (!pending || pending.kind !== "choice") {
    el.choice.hidden = true;
    return;
  }
  el.choice.hidden = false;
  if (el.choiceTitle) el.choiceTitle.textContent = word(`lbl_choice_${pending.choiceId}`, "무엇이라고 할까");
  const def = worldData.choices?.[pending.choiceId];
  const options = Array.isArray(def?.options) ? def.options : [];
  const shown = options.filter((o) => o && typeof o === "object").map((option) => ({
    option,
    available: option.requires === undefined || evaluateCondition(option.requires, requiresCtx("player")),
    stakes: stakesOf(option, state, worldData)
  }));
  // what I can say first; then what I could, if I had the means (an option behind something not mine stays hidden)
  [...shown.filter((o) => o.available), ...shown.filter((o) => !o.available && o.stakes?.locked)].forEach(({ option, available, stakes }) => {
    const label = option.name ?? option.id;
    el.choiceOptions.appendChild(
      markStakes(makeButton(label, () => dispatch({ type: "choose", optionId: option.id }), { disabled: !available }), stakes)
    );
  });
}

function renderNewCharacter(pending) {
  clearChildren(el.choiceOptions);
  if (!pending || pending.kind !== "newCharacter") return false;
  el.choice.hidden = false;
  if (el.choiceTitle) el.choiceTitle.textContent = "다시, 이름 없는 누군가로";
  Object.keys(worldData.characterTemplates ?? {})
    .sort()
    .forEach((templateId) => {
      el.choiceOptions.appendChild(
        makeButton(`새로 시작한다 (${templateName(templateId)})`, () => dispatch({ type: "startCharacter", templateId }))
      );
    });
  return true;
}

function renderMoves(actorLocationId, pendingActive) {
  clearChildren(el.moves);
  if (pendingActive) return;
  const links = worldData.locations?.[actorLocationId]?.links;
  if (!Array.isArray(links)) return;
  links.forEach((link) => {
    if (!link || typeof link.to !== "string") return;
    const available = link.requires === undefined || evaluateCondition(link.requires, requiresCtx("player"));
    if (!available) return;
    const btn = makeButton(`${toward(locationName(link.to))} 간다`, () => dispatch({ type: "move", to: link.to }));
    if (Number.isInteger(link.minutes)) btn.dataset.note = duration(link.minutes);
    el.moves.appendChild(btn);
  });
}

// "시장으로", "마을로": the particle a Korean place name takes
function toward(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  const final = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${name}${final === 0 || final === 8 ? "로" : "으로"}`;
}

// what I can do first; what I cannot do yet after it, quietly. V2-Core-155 (D-133): something happening here comes first --
// one card per encounter (the actions sharing an `encounter` scene): the scene, then its ways; a way I lack the means
// for is shown under it, disabled, with what it needs (ui/stakes.js -- a way behind something not mine stays hidden)
function actionButton(actionId, available) {
  const def = worldData.actions?.[actionId];
  const label = def?.name ?? actionId;
  return markStakes(
    makeButton(available ? label : `${label} (지금은 할 수 없다)`, () => dispatch({ type: "perform", actionId }), { disabled: !available }),
    def ? stakesOf(def, state, worldData) : null
  );
}
function renderActions(actions, pendingActive) {
  clearChildren(el.actions);
  if (pendingActive) return;
  const sceneOf = (actionId) => worldData.actions?.[actionId]?.encounter;
  const scenes = [...new Set(actions.filter((a) => a.available && sceneOf(a.actionId)).map((a) => sceneOf(a.actionId)))];
  scenes.forEach((scene) => {
    const card = document.createElement("div");
    card.className = "encounter";
    card.dataset.encounter = scene;
    const p = document.createElement("p");
    p.textContent = word(scene, "");
    card.appendChild(p);
    const shown = new Set(actions.filter((a) => a.available && sceneOf(a.actionId) === scene).map((a) => a.actionId));
    shown.forEach((id) => card.appendChild(actionButton(id, true)));
    Object.entries(worldData.actions ?? {})
      .filter(([id, def]) => def.encounter === scene && !shown.has(id) && stakesOf(def, state, worldData)?.locked)
      .forEach(([id]) => card.appendChild(actionButton(id, false)));
    el.actions.appendChild(card);
  });
  actions.filter((a) => a.available && !sceneOf(a.actionId))
    .forEach(({ actionId }) => el.actions.appendChild(actionButton(actionId, true)));
  // Keep the View's locked buttons discoverable without giving them the weight of a choice I can make now.
  const later = actions.filter((a) => !a.available && !sceneOf(a.actionId));
  if (later.length > 0) {
    const group = document.createElement("div");
    group.className = "later-actions";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "지금은 할 수 없는 일");
    const label = document.createElement("p");
    label.className = "later-label";
    label.textContent = "지금은 할 수 없는 일";
    group.appendChild(label);
    later.forEach(({ actionId }) => group.appendChild(actionButton(actionId, false)));
    el.actions.appendChild(group);
  }
}

function renderStatus(actor) {
  const growth = actor.growth?.[worldData.world.growthSystemId] ?? {};
  const stats = Object.keys(growth.stats ?? {})
    .sort()
    .map((k) => `${word(`lbl_stat_${k}`, k)} ${growth.stats[k]}`)
    .join(", ");
  const proficiency = Object.keys(growth.proficiency ?? {})
    .sort()
    .map((k) => `${word(`lbl_prof_${k}`, k)} ${growth.proficiency[k]}`)
    .join(", ");
  // V2-Core-53 (D-82): a skill's mastery tier is a label over its rank, from the world's data
  const tiers = worldData.growthSystems?.[worldData.world.growthSystemId]?.masteryTiers ?? [];
  const tierOf = (rank) => {
    const label = tiers.filter((t) => rank >= t.minRank).at(-1)?.label;
    return label && word(`lbl_tier_${label.toLowerCase()}`, label);
  };
  const skills = Object.keys(growth.skills ?? {})
    .sort()
    .map((k) => {
      const tier = tierOf(growth.skills[k]);
      const name = word(`lbl_skill_${k}`, k);
      return tier ? `${name} ${growth.skills[k]} (${tier})` : `${name} ${growth.skills[k]}`;
    })
    .join(", ");
  const traits = Object.keys(growth.traits ?? {})
    .filter((k) => growth.traits[k] === true)
    .sort()
    .map((k) => word(`lbl_trait_${k}`, k))
    .join(", ");
  const unlocks = Object.keys(growth.unlocks ?? {}).sort().map((k) => word(`lbl_unlock_${k}`, k)).join(", ");
  // V2-Core-56 (D-85): every resource the world's growth system defines, as the engine reads it
  // (an entry the save does not have is full)
  const resources = (worldData.growthSystems?.[worldData.world.growthSystemId]?.resources ?? [])
    .map((def) => [def.id, actorResource(actor, worldData, def.id)])
    .filter(([, r]) => r !== undefined)
    .map(([id, r]) => `${word(`lbl_res_${id}`, id)} ${r.current}/${r.max}`)
    .join(", ");
  // V2-Core-58 (D-87): what is wielded (slot -> item), apart from what is owned
  const loadout = Object.keys(actor.loadout ?? {})
    .sort()
    .map((slot) => `${word(`lbl_slot_${slot}`, slot)} ${worldData.items?.[actor.loadout[slot]]?.name ?? actor.loadout[slot]}`)
    .join(", ");
  const inventory = Object.keys(actor.inventory ?? {})
    .sort()
    .map((k) => `${worldData.items?.[k]?.name ?? k} x${actor.inventory[k]}`)
    .join(", ");

  clearChildren(el.status);
  const lines = [
    `HP ${actor.hp.current}/${actor.hp.max}`,
    `소지금 ${actor.money}`,
    resources && `자원: ${resources}`,
    stats && `능력치: ${stats}`,
    proficiency && `숙련도: ${proficiency}`,
    skills && `기술: ${skills}`,
    traits && `특성: ${traits}`,
    unlocks && `해금: ${unlocks}`,
    loadout && `장비: ${loadout}`,
    inventory && `소지품: ${inventory}`
  ].filter(Boolean);
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    el.status.appendChild(p);
  });
}

// V2-Core-126 (#309, Road News step 1b): what the character knows -- a short list, not a journal. For each word: what it says,
// where it came from, how sure, how old, whether newer word of the same thing has replaced it, and whether the choice in front of
// the player bears on it (a choice names the facts it bears on: `relevantFacts`). Read from view(); nothing hidden is shown
function sourceName(source) {
  const own = worldData.texts?.[`lbl_src_${source}`];
  if (own) return own;
  const npc = worldData.npcs?.[source]?.name;
  if (npc) return `${npc}에게 들음`;
  if (source.startsWith("obs_loc_") && worldData.locations?.[source.slice(4)]) return `직접 봄 (${locationName(source.slice(4))})`;
  return "어디서 들었는지 모름";
}
function certainty(confidence, sources = []) {
  // A highly trusted second-hand account is still not a first-hand observation.
  // The score alone must never promote hearsay into field verification.
  if (confidence >= 90) {
    const entries = Array.isArray(sources) ? sources : [sources];
    return entries.some((source) => typeof source === "string" && source.startsWith("obs_loc_"))
      ? "직접 확인함" : "확신 높은 전언";
  }
  if (confidence >= 70) return "믿을 만함";
  if (confidence >= 50) return "그럴듯함";
  return "뜬소문";
}
// V2-Core-138 (D-116): the main thread as this character knows it -- the words whose rumour belongs to a chapter
// (`story.chapter` in the pack), oldest first within a chapter. A character's own knowledge only: a successor who has
// not heard it has no story yet (D-71). The section is hidden while it is empty.
function renderStory(knowledge) {
  if (!el.story) return;
  clearChildren(el.story);
  const when = (k) => (Number.isInteger(k.aboutDay) ? k.aboutDay : k.lastSeenDay);
  const chapterOf = (k) => worldData.rumors?.[k.rumorId]?.story?.chapter;
  const entries = Object.values(knowledge ?? {})
    .filter((k) => k && typeof k.rumorId === "string" && Number.isInteger(chapterOf(k)))
    .sort((a, b) => chapterOf(a) - chapterOf(b) || when(a) - when(b) || a.rumorId.localeCompare(b.rumorId));
  let shown;
  entries.forEach((k) => {
    const chapter = chapterOf(k);
    if (chapter !== shown) {
      const head = document.createElement("li");
      head.className = "story-chapter";
      head.textContent = word(`lbl_story_chapter_${chapter}`, `${chapter}장`);
      el.story.appendChild(head);
      shown = chapter;
    }
    const li = document.createElement("li");
    li.dataset.chapter = String(chapter);
    li.textContent = word(`lbl_rumor_${k.rumorId}`, "알 수 없는 이야기");
    el.story.appendChild(li);
  });
  if (el.storySection) el.storySection.hidden = entries.length === 0;
}

function renderKnowledge(knowledge, pending) {
  if (!el.knowledge) return;
  clearChildren(el.knowledge);
  const today = Math.floor(state.time.minute / DAY_MINUTES);
  const bearsOn = pending?.kind === "choice" ? worldData.choices?.[pending.choiceId]?.relevantFacts ?? [] : [];
  const entries = Object.values(knowledge ?? {}).filter((k) => k && typeof k.rumorId === "string");
  // V2-Core-131 (D-112): a word is as new as the day it is about, when that is known; else the day it was heard
  const when = (k) => (Number.isInteger(k.aboutDay) ? k.aboutDay : k.lastSeenDay);
  const rows = entries.map((k) => ({
    k,
    relevant: bearsOn.includes(k.factId),
    stale: entries.some((o) => o !== k && o.factId === k.factId && when(o) > when(k))
  }));
  rows.sort((a, b) => Number(b.relevant) - Number(a.relevant) || when(b.k) - when(a.k) || a.k.rumorId.localeCompare(b.k.rumorId));
  const ago = (days) => (days <= 0 ? "오늘" : `${days}일 전`);
  rows.forEach(({ k, relevant, stale }) => {
    const age = today - k.lastSeenDay;
    // heard later than the day it is about: both days, the event's first
    const told = Number.isInteger(k.aboutDay) && k.aboutDay < k.lastSeenDay ? `${ago(today - k.aboutDay)}의 일 (${ago(age)} 들음)` : ago(age);
    const parts = [
      word(`lbl_rumor_${k.rumorId}`, "알 수 없는 이야기"),
      (k.sources ?? [k.source]).map(sourceName).join(", "),
      certainty(k.confidence, k.sources ?? [k.source]),
      told
    ];
    if (stale) parts.push("더 새 소식이 있음");
    // V2-Core-135 (D-114): a word about a changing condition, as old as the pack says it holds, may no longer be true
    const validDays = worldData.rumors?.[k.rumorId]?.validDays;
    const expired = !stale && Number.isInteger(validDays) && today - when(k) >= validDays;
    if (expired) parts.push("지금은 달라졌을 수 있음");
    const li = document.createElement("li");
    li.textContent = (relevant ? "[지금 선택과 관련] " : "") + parts.join(" · ");
    if (relevant) li.dataset.relevant = "true";
    if (newsItems.some((n) => n.rumorId === k.rumorId)) li.dataset.new = "true";
    if (stale) li.dataset.stale = "true";
    if (expired) li.dataset.expired = "true";
    el.knowledge.appendChild(li);
  });
}

// J3 RC1: the player must commit to a guess before the existing engine's
// field investigation can test it. No hidden facts, RNG or flags are read.
function renderHypothesisLedger(playerView) {
  if (!el.hypothesisLedger) return;
  const key = `${state.worldId}:${state.player.actorId}`;
  if (hypothesisLifeKey !== key) {
    hypothesisLifeKey = key;
    hypothesisSelection = null;
  }
  const ledger = hypothesisLedger(playerView.knowledge, worldData);
  el.hypothesisLedger.hidden = !ledger;
  if (!ledger) return;
  el.hypothesisQuestion.textContent = ledger.question;
  const from = ledger.sources.length ? ledger.sources.map(sourceName).join(", ") : "출처 불명";
  const today = Math.floor(state.time.minute / DAY_MINUTES);
  const age = Number.isInteger(ledger.aboutDay) ? Math.max(0, today - ledger.aboutDay) : null;
  const heardAge = Number.isInteger(ledger.lastSeenDay) ? Math.max(0, today - ledger.lastSeenDay) : null;
  const when = age === null ? "언제의 소식인지 모름" :
    age === 0 ? "오늘의 소식" : `${age}일 전의 소식`;
  const heard = heardAge !== null && heardAge !== age ?
    ` · ${heardAge === 0 ? "오늘" : `${heardAge}일 전`} 들음` : "";
  el.hypothesisEvidence.textContent =
    `들은 근거 · ${word(`lbl_rumor_${ledger.rumorId}`, "폐허에 관한 소문")} · ${from} · ${certainty(ledger.confidence ?? 0, ledger.sources)} · ${when}${heard}`;
  clearChildren(el.hypothesisChoices);
  clearChildren(el.hypothesisNext);
  if (ledger.observed) {
    el.hypothesisVerdict.textContent = hypothesisSelection === "hideout"
      ? "현장에서 확인했다. 짐작이 근거를 얻었다."
      : hypothesisSelection === "empty"
        ? "현장에서 반증되었다. 소문을 다시 살펴볼 때다."
        : "현장에서 직접 확인한 기록이 있다.";
    return;
  }
  el.hypothesisVerdict.textContent = hypothesisSelection
    ? "아직은 짐작이다. 현장을 확인하기 전에는 참·거짓을 알 수 없다."
    : "원로의 말만으로는 알 수 없다. 어느 쪽이라고 생각하는가?";
  for (const option of ledger.options) {
    const button = makeButton(option.label, () => {
      hypothesisSelection = option.id;
      renderHypothesisLedger(playerView);
      el.hypothesisChoices.querySelector('[data-hypothesis="' + option.id + '"]')?.focus();
    }, { disabled: Boolean(playerView.pending) });
    button.dataset.hypothesis = option.id;
    button.setAttribute("aria-pressed", String(hypothesisSelection === option.id));
    el.hypothesisChoices.appendChild(button);
  }
  if (!hypothesisSelection) return;
  const canInvestigate = !playerView.pending && playerView.actions.some(
    (action) => action.actionId === ledger.actionId && action.available
  );
  if (canInvestigate) {
    el.hypothesisNext.appendChild(makeButton("이 짐작을 현장에서 검증한다", () =>
      dispatch({ type: "perform", actionId: ledger.actionId })));
  } else {
    el.hypothesisNext.textContent = playerView.actor.locationId === ledger.locationId
      ? "조사할 준비가 더 필요하다. 등불을 갖추거나 밤눈이 밝아야 한다."
      : "등불을 준비하고 폐허로 가서 직접 조사해야 한다.";
  }
}

// Optional second deduction: two rumors learned in this life, not a hidden fact oracle.
function renderLinkedCaseLedger(playerView) {
  if (!el.linkedCaseLedger) return;
  const key = state.worldId + ":" + state.player.actorId;
  if (linkedCaseLifeKey !== key) {
    linkedCaseLifeKey = key;
    linkedCaseSelection = null;
  }
  const today = Math.floor(state.time.minute / DAY_MINUTES);
  const ledger = linkedCaseLedger(playerView.knowledge, worldData, today);
  el.linkedCaseLedger.hidden = !ledger;
  if (!ledger) return;
  const decision = linkedCaseDecision(ledger, playerView);
  const judgment = decision ?? linkedCaseSelection;
  el.linkedCaseQuestion.textContent = ledger.question;
  el.linkedCaseEvidence.textContent = "함께 읽은 단서 · " + ledger.clues.map((clue) => {
    const from = clue.sources.length ? clue.sources.map(sourceName).join(", ") : "출처 불명";
    const when = Number.isInteger(clue.aboutDay)
      ? Math.max(0, today - clue.aboutDay) + "일 전의 소식" : "시점 미상";
    return word("lbl_rumor_" + clue.rumorId, "소문") +
      " (" + from + ", " + certainty(clue.confidence ?? 0) + ", " + when + ")";
  }).join(" + ");
  clearChildren(el.linkedCaseChoices);
  clearChildren(el.linkedCaseNext);
  if (ledger.observed) {
    el.linkedCaseVerdict.textContent = judgment === "separate"
      ? "현장에서 반증되었다. 사체의 화살은 도적단의 것이었다."
      : "현장에서 도적단의 화살을 확인했다. 두 사건을 잇는 근거가 생겼다.";
    if (linkedCaseReported(ledger, playerView)) {
      el.linkedCaseNext.textContent = "이 단서는 이미 원로에게 전했다. 마을의 이야기가 달라졌다.";
      const patrolAction = linkedCasePatrolAction(ledger, playerView);
      if (patrolAction) {
        el.linkedCaseNext.appendChild(makeButton("마을 사람들과 샘길 표식을 놓는다 (2시간, 기력 2)", () =>
          dispatch({ type: "perform", actionId: patrolAction })));
      }
      // The elder's *new* account is a lead, not verified world truth.
      const followup = linkedCasePatrolLead(ledger, playerView, worldData, today);
      if (followup) {
        const note = document.createElement("p");
        note.textContent = followup.verified
          ? "원로에게 들은 덫 표식을 샘에서 직접 확인했다."
          : followup.atLocation
            ? "원로에게 들은 덫 표식은 아직 전언이다. 샘에서 직접 확인하자."
            : "원로가 전한 덫 표식은 아직 전언이다. 숲속 샘에서 확인하자.";
        el.linkedCaseNext.appendChild(note);
        if (followup.actionId) {
          el.linkedCaseNext.appendChild(makeButton("전해 들은 덫 표식을 현장에서 확인한다", () =>
            dispatch({ type: "perform", actionId: followup.actionId })));
        }
        if (followup.verified) {
          // Pre-#446 saves have no personal completion tag. An untagged view
          // cannot prove that another response is available; use neutral
          // wording while the engine retains authority over legal choices.
          const next = linkedCaseTrapFollowup(ledger, playerView, worldData, today);
          if (next) {
            const guidance = document.createElement("p");
            guidance.textContent = next.status === "route"
              ? "덫 주변 샘길을 보강했다. 경계 길의 위험이 줄었다."
              : next.status === "notice"
                ? "확인한 덫 표식을 마을 장부에 알렸다. 이후 전언이 더 널리 퍼진다."
                : next.atLocation
                  ? "덫 표식에 관한 마을의 대응을 원로에게 확인하자. 추가 조치 여부는 대화에서 알 수 있다."
                  : "덫 표식을 직접 확인했다. 변경 마을의 원로에게 돌아가 현재 대응 상황을 확인하자.";
            el.linkedCaseNext.appendChild(guidance);
            if (next.actionId) {
              el.linkedCaseNext.appendChild(makeButton("원로에게 덫 표식 대응 상황을 확인한다", () =>
                dispatch({ type: "perform", actionId: next.actionId })));
            }
          }
        }
      }
      return;
    }
    const elderAction = linkedCaseElderAction(ledger, playerView);
    if (elderAction) {
      el.linkedCaseNext.appendChild(makeButton("확인한 단서를 원로에게 이야기한다", () =>
        dispatch({ type: "perform", actionId: elderAction })));
    } else {
      el.linkedCaseNext.textContent = playerView.actor.locationId === "loc_village"
        ? "원로와 이야기하려면 현재 행동을 마쳐야 한다."
        : "확인한 단서를 전하려면 마을의 원로를 찾아가자.";
    }
    return;
  }
  el.linkedCaseVerdict.textContent = decision === "linked"
    ? "원로에게 샘 경계를 요청했다. 아직은 가설이다. 직접 확인하자."
    : decision === "separate"
      ? "원로에게 먼저 조사하자고 제안했다. 아직은 가설이다. 직접 확인하자."
      : ledger.springSeen
        ? "샘의 사체는 확인했지만, 도적단과의 연결은 아직 확인되지 않았다."
        : linkedCaseSelection
          ? "두 소문을 엮은 짐작이다. 샘에서 흔적을 찾아야 확인할 수 있다."
          : "폐허 이야기와 우물의 물길을 함께 놓고 생각해 보자.";
  if (!decision) for (const option of ledger.options) {
    const button = makeButton(option.label, () => {
      linkedCaseSelection = option.id;
      renderLinkedCaseLedger(playerView);
      el.linkedCaseChoices.querySelector('[data-linked-guess="' + option.id + '"]')?.focus();
    }, { disabled: Boolean(playerView.pending) });
    button.dataset.linkedGuess = option.id;
    button.setAttribute("aria-pressed", String(linkedCaseSelection === option.id));
    el.linkedCaseChoices.appendChild(button);
  }
  if (!linkedCaseSelection && !decision) return;
  const decisionAction = linkedCaseDecisionAction(ledger, playerView, linkedCaseSelection);
  if (decisionAction) {
    el.linkedCaseNext.appendChild(makeButton("이 판단을 원로에게 전한다", () =>
      dispatch({ type: "perform", actionId: decisionAction })));
    return;
  }
  const canSearch = !playerView.pending && playerView.actions.some(
    (action) => action.actionId === ledger.actionId && action.available
  );
  if (canSearch) {
    el.linkedCaseNext.appendChild(makeButton("이 짐작을 샘에서 검증한다", () =>
      dispatch({ type: "perform", actionId: ledger.actionId })));
  } else {
    el.linkedCaseNext.textContent = playerView.actor.locationId === ledger.locationId
      ? "지금은 조사할 수 없다. 다른 행동을 마친 뒤 다시 살펴보자."
      : "우물의 물길을 따라 숲속 샘으로 가서 흔적을 찾아보자.";
  }
  // The support is an existing dialogue, never a direct item grant from UI.
  // Keep field verification available regardless of the player's judgment.
  const support = linkedCaseSupport(ledger, playerView);
  if (support) {
    const note = document.createElement("p");
    const withNpc = support.npcName === "원로" ? "원로와" : "약초꾼과";
    const findNpc = support.npcName === "원로" ? "원로를" : "약초꾼을";
    note.textContent = support.received
      ? support.npcName + "에게서 " + support.itemName + " 지원을 받았다."
      : support.prepared
        ? "등불을 이미 갖고 있어 원로의 추가 지원은 필요하지 않다."
        : playerView.pending
          ? "진행 중인 선택을 마친 뒤 " + withNpc + " 준비를 상의하자."
          : support.atLocation
            ? withNpc + " " + support.itemName + " 준비를 상의할 수 있다."
            : support.locationName + "의 " + findNpc + " 찾아가 준비를 상의하자.";
    el.linkedCaseNext.appendChild(note);
    if (support.actionId) {
      el.linkedCaseNext.appendChild(makeButton(support.npcName + "에게 준비를 상의한다", () =>
        dispatch({ type: "perform", actionId: support.actionId })));
    }
  }
}

// J3 RC1: this is a clock of *reported* danger, not the hidden world timer.
// It receives only the current life’s knowledge from view(); never facts or signals.
function renderDangerClock(knowledge) {
  if (!el.dangerClock) return;
  const report = knowledgeClock(knowledge, worldData, state.time.minute);
  el.dangerClock.hidden = !report;
  if (!report) return;
  el.dangerClock.dataset.stage = String(report.stage);
  el.dangerClock.dataset.stale = String(report.stale);
  el.dangerClockText.textContent = report.text;
  const sources = report.sources.length ? report.sources : report.source ? [report.source] : [];
  const from = sources.length ? sources.map(sourceName).join(", ") : "출처 불명";
  const about = report.ageDays === 0 ? "오늘의 소식" : `${report.ageDays}일 전의 소식`;
  const heard = report.heardAgeDays === report.ageDays ? "" :
    ` · ${report.heardAgeDays === 0 ? "오늘" : `${report.heardAgeDays}일 전`} 들음`;
  const uncertain = report.stale ? " · 지금은 달라졌을 수 있음" : "";
  el.dangerClockEvidence.textContent = `${from} · ${certainty(report.confidence, sources)} · ${about}${heard}${uncertain}`;
}

// V2-Core-157 (D-135): the lines come in one after another -- by CSS alone (--i is a line's place), so every word is on
// the page from the first moment, for a reader, a screen reader and a test alike; no motion when motion is not wanted
let sceneShown = null;
function renderScene() {
  if (!el.scene) return;
  if (sceneShown === sceneLines) return; // the same scene, not drawn again (its lines would come in twice)
  sceneShown = sceneLines;
  clearChildren(el.scene);
  sceneLines.forEach((text, i) => {
    const p = document.createElement("p");
    p.textContent = text;
    p.style.setProperty("--i", String(i));
    el.scene.appendChild(p);
  });
}

const NEWS_WORDS = { learned: "새로 안 것", story: "이야기가 움직였다", confirmed: "확인했다", gained: "얻었다", spent: "내주었다", healed: "나았다", hurt: "다쳤다", grew: "늘었다", deed: "이룬 일" };

// V2-Core-158 (D-136): the pictures -- the place in the light of the hour at the head of the page, the cover on the
// menu, the last page of a life on the ending card (ui/art.js says what is drawn, ui/paint.js draws it). A picture is
// drawn again only when what it shows, the page's width or the theme changes
const darkTheme = () => {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "dark" || (chosen !== "light" && Boolean(globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches));
};
const drawn = new WeakMap();
// `ground` is the colour of what the picture sits on, which its foot dissolves into
function picture(canvas, scene, ground = "--page") {
  if (!canvas) return;
  const dark = darkTheme();
  const key = `${JSON.stringify(scene)}|${dark}|${canvas.clientWidth}`;
  if (drawn.get(canvas) === key) return;
  const paper = getComputedStyle(document.documentElement).getPropertyValue(ground).trim() || "#f4f5f1";
  if (!paint(canvas, scene, { dark, paper })) return;
  const changed = canvas.dataset.scene !== scene.key || canvas.dataset.band !== scene.band;
  drawn.set(canvas, key);
  canvas.dataset.scene = scene.key;
  canvas.dataset.band = scene.band;
  if (changed) {
    canvas.classList.remove("fresh");
    void canvas.offsetWidth; // restart the fade for a new picture
    canvas.classList.add("fresh");
    // once only: the ending card is rebuilt on every step, and a picture put back must not fade in again
    canvas.addEventListener("animationend", () => canvas.classList.remove("fresh"), { once: true });
  }
}
const endingArt = document.createElement("canvas");
endingArt.className = "ending-art";
endingArt.setAttribute("aria-hidden", "true");
function renderPictures() {
  if (state) picture(el.sceneArt, sceneOf(state, worldData));
  else picture(el.coverArt, COVER, "--cover-bg");
  if (endingCard) picture(endingArt, endingScene(endingCard.end), "--accent-soft");
}

function renderEnding() {
  if (!el.ending) return;
  clearChildren(el.ending);
  el.ending.hidden = !endingCard;
  if (!endingCard) return;
  el.ending.dataset.end = endingCard.end;
  el.ending.appendChild(endingArt);
  const label = document.createElement("small");
  label.textContent = endingCard.end === "died" ? "이 삶의 끝" : "이야기의 끝";
  const title = document.createElement("h2");
  title.textContent = endingCard.title;
  const body = document.createElement("p");
  body.textContent = endingCard.body;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = endingCard.meta;
  el.ending.append(label, title, body, meta);
  if (endingCard.deeds.length > 0) {
    const list = document.createElement("ul");
    endingCard.deeds.forEach((d) => {
      const li = document.createElement("li");
      li.textContent = d;
      list.appendChild(li);
    });
    el.ending.appendChild(list);
  }
  if (endingCard.end !== "died") {
    el.ending.appendChild(makeButton("이 세계에서 계속 살아간다", () => {
      endingCard = null;
      render();
    }));
  }
}

// the chronicle on the menu: the lives that ended, and the book of deeds (what was never done stays a blank)
async function refreshChronicle() {
  if (!el.chronicleSection) return;
  let lives = [];
  let done = [];
  try {
    [lives, done] = await Promise.all([chronicle.listLives(), chronicle.listDeeds()]);
  } catch {
    el.chronicleSection.hidden = true;
    return;
  }
  if (state) return;
  clearChildren(el.lives);
  lives.slice(0, 12).forEach((l) => {
    const li = document.createElement("li");
    const title = l.end === "died" ? word("end_died_title", "") : word(`${l.end}_title`, l.end);
    li.textContent = lifeLine(l.templateId, l.days, title, l.deeds.length);
    li.dataset.end = l.end;
    el.lives.appendChild(li);
  });
  clearChildren(el.deedBook);
  const doneIds = new Set(done.map((d) => d.id));
  const all = worldData.world.deeds ?? [];
  all.forEach((d) => {
    const li = document.createElement("li");
    const known = doneIds.has(d.id);
    li.dataset.done = String(known);
    li.textContent = known ? word(d.id, d.id) : "？？？";
    if (known) li.title = word(`${d.id}_desc`, "");
    el.deedBook.appendChild(li);
  });
  const count = document.getElementById("deedCount");
  if (count) count.textContent = `${doneIds.size} / ${all.length}`;
  el.chronicleSection.hidden = lives.length === 0 && doneIds.size === 0;
}
function renderNews() {
  if (!el.news) return;
  clearChildren(el.news);
  el.news.hidden = newsItems.length === 0;
  newsItems.forEach((n) => {
    const li = document.createElement("li");
    li.dataset.kind = n.kind;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = NEWS_WORDS[n.kind];
    const what = document.createElement("span");
    what.className = "what";
    what.textContent = n.text;
    li.append(tag, what);
    if (n.note) {
      const note = document.createElement("span");
      note.className = "note";
      note.textContent = n.note;
      li.appendChild(note);
    }
    el.news.appendChild(li);
  });
}

// V2-Core-151: what I mean to do now (ui/goals.js), the main thread first
function renderGoal() {
  if (!el.goalText) return;
  clearChildren(el.goalText);
  if (el.goal) el.goal.dataset.changed = String(goalChanged);
  currentGoals(state, worldData).forEach((goal, i) => {
    const span = document.createElement("span");
    span.dataset.track = goal.track;
    if (i > 0) span.className = "side";
    span.textContent = word(goal.textId, "");
    el.goalText.appendChild(span);
  });
}

function renderVitals(actor) {
  if (!el.vitals) return;
  const stamina = actorResource(actor, worldData, "stamina");
  el.vitals.textContent = [`체력 ${actor.hp.current}/${actor.hp.max}`, stamina && `기력 ${stamina.current}/${stamina.max}`, `은화 ${actor.money}`]
    .filter(Boolean)
    .join(" · ");
  // V2-Core-157: the body as marks, a glance before the numbers (Seoul 2033's three hearts); drawn by CSS from data-*
  const marks = document.getElementById("marks");
  if (marks) {
    marks.dataset.hp = String(Math.round((10 * Math.max(0, actor.hp.current)) / Math.max(1, actor.hp.max)));
    marks.dataset.low = String(actor.hp.current * 10 <= actor.hp.max * 3);
    marks.style.setProperty("--hp", String(Math.max(0, actor.hp.current) / Math.max(1, actor.hp.max)));
    marks.style.setProperty("--st", stamina ? String(stamina.current / Math.max(1, stamina.max)) : "0");
  }
}

function renderLog() {
  clearChildren(el.log);
  logEntries
    .slice()
    .reverse()
    .forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      el.log.appendChild(li);
    });
}

function render() {
  document.getElementById("app")?.setAttribute("data-view", state ? "game" : "menu");
  if (!state) {
    el.menu.hidden = false;
    el.game.hidden = true;
    renderPictures();
    return;
  }
  el.menu.hidden = true;
  el.game.hidden = false;

  const playerView = view(state, worldData);
  if (!playerView) {
    showError("플레이어 상태를 읽을 수 없다.");
    return;
  }

  clearChildren(el.location);
  const place = document.createElement("span");
  place.className = "place";
  place.textContent = locationName(playerView.actor.locationId);
  el.location.append(place, ` · ${formatTime(state.time.minute)}`);
  renderStatus(playerView.actor);
  renderVitals(playerView.actor);

  const pendingActive = Boolean(playerView.pending);
  renderMoves(playerView.actor.locationId, pendingActive);
  renderActions(playerView.actions, pendingActive);

  if (playerView.pending?.kind === "choice") {
    renderChoice(playerView.pending);
  } else if (!renderNewCharacter(playerView.pending)) {
    el.choice.hidden = true;
    clearChildren(el.choiceOptions);
  }

  const doingLabel = document.getElementById("doingLabel");
  if (doingLabel) doingLabel.hidden = pendingActive;
  el.waitBtn.disabled = pendingActive;
  el.waitDayBtn.disabled = pendingActive;
  renderStory(playerView.knowledge);
  renderKnowledge(playerView.knowledge, playerView.pending);
  renderDangerClock(playerView.knowledge);
  renderHypothesisLedger(playerView);
  renderLinkedCaseLedger(playerView);
  renderLog();
  renderEnding();
  renderPictures();
  renderScene();
  renderNews();
  renderGoal();
  if (el.notebookBtn) {
    const known = Object.values(playerView.knowledge ?? {}).filter((k) => k && typeof k.rumorId === "string").length;
    const fresh = newsItems.filter((n) => n.rumorId).length;
    el.notebookBtn.dataset.count = fresh > 0 ? `아는 것 ${known} · 새로 ${fresh}` : `아는 것 ${known}`;
  }
}

// V2-Core-159: when a game was saved, as a person says it ("10월 18일 오후 3:20")
function savedWhen(savedAt) {
  const at = new Date(savedAt);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}
async function refreshSlotList() {
  const request = ++slotListVersion;
  const intent = intentVersion;
  let slots;
  try {
    slots = await storage.list();
  } catch (err) {
    if (request === slotListVersion && intent === intentVersion) {
      showError(`저장 목록을 불러오지 못했다: ${err.message}`);
    }
    return;
  }
  if (request !== slotListVersion || intent !== intentVersion) return;
  clearChildren(el.slotList);
  const empty = document.getElementById("slotEmpty");
  if (empty) empty.hidden = slots.length > 0;
  slots.forEach((meta) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "slot";
    name.textContent = meta.slot;
    const when = document.createElement("span");
    when.className = "saved";
    when.textContent = savedWhen(meta.savedAt);
    li.append(name, when, makeButton("불러오기", () => loadGame(meta.slot)));
    el.slotList.appendChild(li);
  });
}

// V2-Core-54 (D-83): the first character's background is the menu's choice (a characterTemplate);
// the select starts at the world's own start template, so a game started without touching it is
// the same as before.
function renderBackgroundChoice() {
  if (!el.backgroundSelect) return;
  clearChildren(el.backgroundSelect);
  Object.keys(worldData.characterTemplates ?? {})
    .sort()
    .forEach((templateId) => {
      const option = document.createElement("option");
      option.value = templateId;
      option.textContent = templateName(templateId);
      option.selected = templateId === worldData.world.startTemplateId;
      el.backgroundSelect.appendChild(option);
    });
}

function newGame(seed, templateId = el.backgroundSelect?.value || undefined) {
  const worldSeed = seed || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const result = createInitialState({ worldSeed, data: worldData, templateId });
  ++intentVersion;
  state = result.state;
  hypothesisSelection = null;
  hypothesisLifeKey = null;
  linkedCaseSelection = null;
  linkedCaseLifeKey = null;
  currentSlot = null;
  logEntries.length = 0;
  applyEvents(result.events);
  sceneLines = prologueLines(state.actors[state.player.actorId]?.templateId ?? templateId ?? worldData.world.startTemplateId);
  newsItems = [];
  goalChanged = false;
  beginLife(state.actors[state.player.actorId]?.templateId ?? templateId ?? worldData.world.startTemplateId);
  showError("");
  render();
}

async function saveGame(slot) {
  if (!state) return;
  const request = ++intentVersion;
  try {
    await storage.save(slot, state, {});
    if (request !== intentVersion) return;
    currentSlot = slot;
    pushLog(`"${slot}"에 저장했다.`);
    render();
    await refreshSlotList();
  } catch (err) {
    if (request === intentVersion) showError(`저장 실패: ${err.message}`);
  }
}

async function loadGame(slot) {
  const request = ++intentVersion;
  try {
    const loaded = await storage.load(slot);
    if (request !== intentVersion) return;
    const errors = validateState(loaded);
    if (errors.length > 0) {
      showError(`불러온 state가 유효하지 않다: ${errors.join("; ")}`);
      return;
    }
    // D-68: a save made with a different data pack must not be run silently
    // with this one. Rejected, never repaired; the save itself is left as is.
    const incompatible = checkDataCompatibility(loaded, worldData);
    if (incompatible.length > 0) {
      showError(`이 저장은 현재 데이터와 호환되지 않아 불러오지 않았다: ${incompatible.join("; ")}`);
      return;
    }
    // D-115 (WB-0030 Q6): an actor this pack defines but the save predates is seeded as a new game would have it
    state = adoptNewActors(loaded, worldData).state;
    hypothesisSelection = null;
    hypothesisLifeKey = null;
    linkedCaseSelection = null;
    linkedCaseLifeKey = null;
    currentSlot = slot;
    logEntries.length = 0;
    pushLog(`"${slot}"에서 불러왔다.`);
    sceneLines = placeLines();
    newsItems = [];
    goalChanged = false;
    resumeLife();
    showError("");
    render();
  } catch (err) {
    if (request === intentVersion) showError(`불러오기 실패: ${err.message}`);
  }
}

function backToMenu() {
  ++intentVersion;
  hypothesisSelection = null;
  hypothesisLifeKey = null;
  linkedCaseSelection = null;
  linkedCaseLifeKey = null;
  state = null;
  currentSlot = null;
  showError("");
  render();
  refreshSlotList();
  refreshChronicle();
}

el.newGameBtn?.addEventListener("click", () => newGame());
el.waitBtn?.addEventListener("click", () => dispatch({ type: "wait", minutes: 30 }));
el.waitDayBtn?.addEventListener("click", waitADay);
el.backToMenuBtn?.addEventListener("click", backToMenu);
// the notebook folds away; what is in it stays in the page
const notebookBtn = document.getElementById("notebookBtn");
const notes = document.getElementById("notes");
notebookBtn?.addEventListener("click", () => {
  notes.hidden = !notes.hidden;
  notebookBtn.setAttribute("aria-expanded", String(!notes.hidden));
  notebookBtn.textContent = notes.hidden ? "수첩 펼치기" : "수첩 접기";
});
// V2-Core-152: the number keys press the numbered choices (what to say, else what to do), as they are shown
document.addEventListener("keydown", (e) => {
  if (!state || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName ?? "")) return;
  const n = Number(e.key);
  if (!Number.isInteger(n) || n < 1 || n > 9) return;
  const list = el.choice.hidden ? el.actions : el.choiceOptions;
  const button = [...list.querySelectorAll("button")].filter((b) => !b.disabled)[n - 1];
  if (button) {
    e.preventDefault();
    button.click();
  }
});
el.saveBtn?.addEventListener("click", () => {
  const slot = (el.saveSlotInput?.value || "").trim();
  if (!slot) {
    showError("저장 슬롯 이름을 입력하라.");
    return;
  }
  saveGame(slot);
});

// the pictures follow the page's width and the theme
const repaint = () => requestAnimationFrame(renderPictures);
if (globalThis.ResizeObserver) new ResizeObserver(repaint).observe(document.getElementById("app"));
globalThis.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", repaint);
new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

renderBackgroundChoice();
refreshSlotList();
refreshChronicle();
render();

// Test-only hook, mirroring the pattern already used by web/v2/storage/smoke.html
// (D-64/V2-Core-21) -- not part of the player-facing UI. Lets
// tests/v2-ui-browser.spec.js drive the real page deterministically (a fixed
// worldSeed) instead of duplicating this module's logic.
window.__v2App = {
  newGame,
  saveGame,
  loadGame,
  backToMenu,
  dispatch,
  getState: () => state,
  getView: () => (state ? view(state, worldData) : null),
  getLog: () => logEntries.slice(),
  worldData
};
