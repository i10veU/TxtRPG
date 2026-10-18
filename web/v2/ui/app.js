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
import { greetingFor } from "./people.js";

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
  notebookBtn: document.getElementById("notebookBtn"),
  vitals: document.getElementById("vitals"),
  knowledge: document.getElementById("knowledge"),
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
  return { knowledge: v.knowledge ?? {}, actor: v.actor, goals: currentGoals(state, worldData).map((g) => g.textId) };
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
    else if (old.confidence < 90 && k.confidence >= 90) items.push({ kind: "confirmed", text: label, note: "직접 확인함", rumorId });
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
  return items;
}
function noteChanges(before) {
  const after = snapshot();
  newsItems = diffNews(before, after);
  goalChanged = Boolean(before && after) && before.goals[0] !== after.goals[0];
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
    noteChanges(action.type === "startCharacter" ? null : before);
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
    noteChanges(before);
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

// what I can do first; what I cannot do yet after it, quietly
function renderActions(actions, pendingActive) {
  clearChildren(el.actions);
  if (pendingActive) return;
  [...actions.filter((a) => a.available), ...actions.filter((a) => !a.available)].forEach(({ actionId, available }) => {
    const def = worldData.actions?.[actionId];
    const label = def?.name ?? actionId;
    el.actions.appendChild(
      markStakes(
        makeButton(available ? label : `${label} (지금은 할 수 없다)`, () => dispatch({ type: "perform", actionId }), {
          disabled: !available
        }),
        def ? stakesOf(def, state, worldData) : null
      )
    );
  });
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
function certainty(confidence) {
  if (confidence >= 90) return "직접 확인함";
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
      certainty(k.confidence),
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

function renderScene() {
  if (!el.scene) return;
  clearChildren(el.scene);
  sceneLines.forEach((text) => {
    const p = document.createElement("p");
    p.textContent = text;
    el.scene.appendChild(p);
  });
}

const NEWS_WORDS = { learned: "새로 안 것", story: "이야기가 움직였다", confirmed: "확인했다", gained: "얻었다", spent: "내주었다", healed: "나았다", hurt: "다쳤다" };
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
  if (!state) {
    el.menu.hidden = false;
    el.game.hidden = true;
    return;
  }
  el.menu.hidden = true;
  el.game.hidden = false;

  const playerView = view(state, worldData);
  if (!playerView) {
    showError("플레이어 상태를 읽을 수 없다.");
    return;
  }

  el.location.textContent = `${locationName(playerView.actor.locationId)} · ${formatTime(state.time.minute)}`;
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
  renderLog();
  renderScene();
  renderNews();
  renderGoal();
  if (el.notebookBtn) {
    const known = Object.values(playerView.knowledge ?? {}).filter((k) => k && typeof k.rumorId === "string").length;
    const fresh = newsItems.filter((n) => n.rumorId).length;
    el.notebookBtn.dataset.count = fresh > 0 ? `아는 것 ${known} · 새로 ${fresh}` : `아는 것 ${known}`;
  }
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
  slots.forEach((meta) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${meta.slot} (${new Date(meta.savedAt).toLocaleString()})`;
    li.appendChild(label);
    li.appendChild(makeButton("불러오기", () => loadGame(meta.slot)));
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
  currentSlot = null;
  logEntries.length = 0;
  applyEvents(result.events);
  sceneLines = prologueLines(state.actors[state.player.actorId]?.templateId ?? templateId ?? worldData.world.startTemplateId);
  newsItems = [];
  goalChanged = false;
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
    currentSlot = slot;
    logEntries.length = 0;
    pushLog(`"${slot}"에서 불러왔다.`);
    sceneLines = placeLines();
    newsItems = [];
    goalChanged = false;
    showError("");
    render();
  } catch (err) {
    if (request === intentVersion) showError(`불러오기 실패: ${err.message}`);
  }
}

function backToMenu() {
  ++intentVersion;
  state = null;
  currentSlot = null;
  showError("");
  render();
  refreshSlotList();
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

renderBackgroundChoice();
refreshSlotList();
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
