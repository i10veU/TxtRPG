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

import { createInitialState, step, view, validateState, checkDataCompatibility } from "../core/engine.js";
import { actorResource, evaluateCondition } from "../core/rules.js";
import * as storage from "../storage/idb.js";
import { worldData } from "../data/world.js";

const DAY_MINUTES = 1440;

let state = null;
let currentSlot = null;
let busy = false;
const logEntries = [];
const MAX_LOG_ENTRIES = 200;

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
  knowledge: document.getElementById("knowledge"),
  slotList: document.getElementById("slotList"),
  saveSlotInput: document.getElementById("saveSlotInput"),
  saveBtn: document.getElementById("saveBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  backgroundSelect: document.getElementById("backgroundSelect"),
  waitBtn: document.getElementById("waitBtn"),
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

function formatTime(minute) {
  const day = Math.floor(minute / DAY_MINUTES) + 1;
  const ofDay = minute % DAY_MINUTES;
  const hh = String(Math.floor(ofDay / 60)).padStart(2, "0");
  const mm = String(ofDay % 60).padStart(2, "0");
  return `${day}일차 ${hh}:${mm}`;
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

function dispatch(action) {
  if (!state || busy) return;
  busy = true;
  showError("");
  try {
    const result = step(state, action, worldData);
    state = result.state;
    applyEvents(result.events);
  } catch (err) {
    showError(`처리 중 오류: ${err.message}`);
  } finally {
    busy = false;
    render();
  }
}

function renderChoice(pending) {
  clearChildren(el.choiceOptions);
  if (!pending || pending.kind !== "choice") {
    el.choice.hidden = true;
    return;
  }
  el.choice.hidden = false;
  const def = worldData.choices?.[pending.choiceId];
  const options = Array.isArray(def?.options) ? def.options : [];
  options.forEach((option) => {
    if (!option || typeof option !== "object") return;
    const available = option.requires === undefined || evaluateCondition(option.requires, requiresCtx("player"));
    if (!available) return;
    const label = option.name ?? option.id;
    el.choiceOptions.appendChild(makeButton(label, () => dispatch({ type: "choose", optionId: option.id })));
  });
}

function renderNewCharacter(pending) {
  clearChildren(el.choiceOptions);
  if (!pending || pending.kind !== "newCharacter") return false;
  el.choice.hidden = false;
  Object.keys(worldData.characterTemplates ?? {})
    .sort()
    .forEach((templateId) => {
      el.choiceOptions.appendChild(
        makeButton(`새 캐릭터로 시작 (${templateName(templateId)})`, () => dispatch({ type: "startCharacter", templateId }))
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
    el.moves.appendChild(makeButton(`${locationName(link.to)}(으)로 이동`, () => dispatch({ type: "move", to: link.to })));
  });
}

function renderActions(actions, pendingActive) {
  clearChildren(el.actions);
  if (pendingActive) return;
  actions.forEach(({ actionId, available }) => {
    const def = worldData.actions?.[actionId];
    const label = def?.name ?? actionId;
    el.actions.appendChild(
      makeButton(available ? label : `${label} (잠김)`, () => dispatch({ type: "perform", actionId }), {
        disabled: !available
      })
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
function renderKnowledge(knowledge, pending) {
  if (!el.knowledge) return;
  clearChildren(el.knowledge);
  const today = Math.floor(state.time.minute / DAY_MINUTES);
  const bearsOn = pending?.kind === "choice" ? worldData.choices?.[pending.choiceId]?.relevantFacts ?? [] : [];
  const entries = Object.values(knowledge ?? {}).filter((k) => k && typeof k.rumorId === "string");
  const rows = entries.map((k) => ({
    k,
    relevant: bearsOn.includes(k.factId),
    stale: entries.some((o) => o !== k && o.factId === k.factId && o.lastSeenDay > k.lastSeenDay)
  }));
  rows.sort((a, b) => Number(b.relevant) - Number(a.relevant) || b.k.lastSeenDay - a.k.lastSeenDay || a.k.rumorId.localeCompare(b.k.rumorId));
  rows.forEach(({ k, relevant, stale }) => {
    const age = today - k.lastSeenDay;
    const parts = [
      word(`lbl_rumor_${k.rumorId}`, "알 수 없는 이야기"),
      (k.sources ?? [k.source]).map(sourceName).join(", "),
      certainty(k.confidence),
      age <= 0 ? "오늘" : `${age}일 전`
    ];
    if (stale) parts.push("더 새 소식이 있음");
    const li = document.createElement("li");
    li.textContent = (relevant ? "[지금 선택과 관련] " : "") + parts.join(" · ");
    if (relevant) li.dataset.relevant = "true";
    if (stale) li.dataset.stale = "true";
    el.knowledge.appendChild(li);
  });
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

  el.location.textContent = `${locationName(playerView.actor.locationId)} — ${formatTime(state.time.minute)}`;
  renderStatus(playerView.actor);

  const pendingActive = Boolean(playerView.pending);
  renderMoves(playerView.actor.locationId, pendingActive);
  renderActions(playerView.actions, pendingActive);

  if (playerView.pending?.kind === "choice") {
    renderChoice(playerView.pending);
  } else if (!renderNewCharacter(playerView.pending)) {
    el.choice.hidden = true;
    clearChildren(el.choiceOptions);
  }

  el.waitBtn.disabled = pendingActive;
  renderKnowledge(playerView.knowledge, playerView.pending);
  renderLog();
}

async function refreshSlotList() {
  clearChildren(el.slotList);
  let slots;
  try {
    slots = await storage.list();
  } catch (err) {
    showError(`저장 목록을 불러오지 못했다: ${err.message}`);
    return;
  }
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
  state = result.state;
  currentSlot = null;
  logEntries.length = 0;
  applyEvents(result.events);
  showError("");
  render();
}

async function saveGame(slot) {
  if (!state) return;
  try {
    await storage.save(slot, state, {});
    currentSlot = slot;
    pushLog(`"${slot}"에 저장했다.`);
    await refreshSlotList();
    render();
  } catch (err) {
    showError(`저장 실패: ${err.message}`);
  }
}

async function loadGame(slot) {
  try {
    const loaded = await storage.load(slot);
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
    state = loaded;
    currentSlot = slot;
    logEntries.length = 0;
    pushLog(`"${slot}"에서 불러왔다.`);
    showError("");
    render();
  } catch (err) {
    showError(`불러오기 실패: ${err.message}`);
  }
}

function backToMenu() {
  state = null;
  currentSlot = null;
  render();
  refreshSlotList();
}

el.newGameBtn?.addEventListener("click", () => newGame());
el.waitBtn?.addEventListener("click", () => dispatch({ type: "wait", minutes: 30 }));
el.backToMenuBtn?.addEventListener("click", backToMenu);
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
