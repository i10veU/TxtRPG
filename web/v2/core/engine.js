// V2 engine per docs/v2/architecture/CORE_CONTRACTS.md §2, §5, §9.
// V2-Core-01: SCHEMA_VERSION, createInitialState, step (`wait` + invalid
// action reject only).
// V2-Core-11 (D-46/D-47/D-48/D-49): `perform`/`move`/`startCharacter`
// wired into step(), reusing rules.js's applyEffectList/evaluateCondition/
// check (no separate Effect/Condition path -- D-26/D-27/D-28/D-29/D-30
// unchanged). `choose` (D-35) stays unimplemented: its gate gets a
// structurally complete reject, but nothing in this engine ever sets
// `pending.kind` to "choice", so that code path is unreachable in
// practice. §2.5 stages 9-10 (day.started, triggers) remain unimplemented
// (out of this round's scope) -- a `perform`/`move` still ends with
// `action.resolved` per stage 11.
// Do not add Date/Date.now, Math.random, DOM, window, or any host API here.

import { hashString } from "./rng.js";
import { applyEffectList, evaluateCondition, check } from "./rules.js";

export const SCHEMA_VERSION = 1;

const MIN_WAIT_MINUTES = 1;
const MAX_WAIT_MINUTES = 1440;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidWaitAction(action) {
  if (!isPlainObject(action)) return false;
  if (action.type !== "wait") return false;
  if (!Number.isInteger(action.minutes)) return false;
  if (action.minutes < MIN_WAIT_MINUTES || action.minutes > MAX_WAIT_MINUTES) return false;
  return true;
}

function isValidPerformAction(action) {
  if (!isPlainObject(action)) return false;
  if (action.type !== "perform") return false;
  if (typeof action.actionId !== "string") return false;
  if (action.targetId !== undefined && typeof action.targetId !== "string") return false;
  return true;
}

function isValidMoveAction(action) {
  if (!isPlainObject(action)) return false;
  if (action.type !== "move") return false;
  if (typeof action.to !== "string") return false;
  return true;
}

function isValidChooseAction(action) {
  if (!isPlainObject(action)) return false;
  if (action.type !== "choose") return false;
  if (typeof action.optionId !== "string") return false;
  return true;
}

function isValidStartCharacterAction(action) {
  if (!isPlainObject(action)) return false;
  if (action.type !== "startCharacter") return false;
  if (typeof action.templateId !== "string") return false;
  return true;
}

// -> one of "wait"/"perform"/"move"/"choose"/"startCharacter", or null if
// the action shape itself is malformed (§2.5 stage 2, D-28-style).
function validateActionShape(action) {
  if (isValidWaitAction(action)) return "wait";
  if (isValidPerformAction(action)) return "perform";
  if (isValidMoveAction(action)) return "move";
  if (isValidChooseAction(action)) return "choose";
  if (isValidStartCharacterAction(action)) return "startCharacter";
  return null;
}

function rejectAction(state, code) {
  return {
    state,
    events: [{ minute: state.time.minute, type: "action.rejected", visibility: "player", data: { code } }]
  };
}

// characterTemplate -> Actor (D-47, §2.1/§11). Reuses the Actor schema's own
// field names; `id`/`alive` are always engine-computed, `hp.current` always
// starts at `hp.max` (full health).
function buildActorFromTemplate(id, template) {
  if (typeof template.locationId !== "string") {
    throw new TypeError("characterTemplate requires a string `locationId`");
  }
  const maxHp = Number.isInteger(template.hp?.max) ? template.hp.max : 0;
  return {
    id,
    kind: typeof template.kind === "string" ? template.kind : "player",
    alive: true,
    locationId: template.locationId,
    hp: { current: maxHp, max: maxHp },
    money: Number.isInteger(template.money) ? template.money : 0,
    inventory: isPlainObject(template.inventory) ? structuredClone(template.inventory) : {},
    growth: isPlainObject(template.growth) ? structuredClone(template.growth) : {},
    tags: Array.isArray(template.tags) ? [...template.tags] : []
  };
}

// { worldSeed, data? } -> { state, events }. `data` is optional (D-47): when
// it lacks a usable `world.startTemplateId` + characterTemplate, the result
// is byte-for-byte the same minimal V2-Core-01 state as before (no player,
// no actors, no pending) -- existing callers that never passed `data` are
// unaffected. When a template IS resolvable, `player_1` is created directly
// here (not via `startCharacter`, which is reserved for post-death only,
// D-47).
export function createInitialState({ worldSeed, data }) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    worldSeed: String(worldSeed),
    rng: { seed: hashString(String(worldSeed)), cursor: 0 },
    time: { minute: 0 }
  };

  if (typeof data?.id === "string") {
    state.dataRef = { id: data.id, version: data.version };
  }
  if (typeof data?.world?.id === "string") {
    state.worldId = data.world.id + "_" + hashString(String(worldSeed)).toString(16); // D-03
  }

  const templateId = data?.world?.startTemplateId;
  const template = typeof templateId === "string" ? data.characterTemplates?.[templateId] : undefined;
  if (isPlainObject(template)) {
    state.player = { actorId: "player_1", characterCount: 1 };
    state.pending = null;
    state.actors = { player_1: buildActorFromTemplate("player_1", template) };
  }

  return { state, events: [] };
}

function resolveWait(state, action) {
  const nextState = structuredClone(state);
  nextState.time.minute += action.minutes;
  return {
    state: nextState,
    events: [{ minute: nextState.time.minute, type: "time.advanced", visibility: "player", data: { minutes: action.minutes } }]
  };
}

// Missing/absent outcome falls back per §2.3: great -> success, partial ->
// fail. success/fail are the two that must exist in well-formed data; a
// still-missing one degrades to an empty Effect list rather than throwing
// (no validateData layer exists yet to have caught it earlier).
function resolveOutcomeEffects(outcomes, tier) {
  const o = isPlainObject(outcomes) ? outcomes : {};
  if (tier === "great") return Array.isArray(o.great) ? o.great : Array.isArray(o.success) ? o.success : [];
  if (tier === "success") return Array.isArray(o.success) ? o.success : [];
  if (tier === "partial") return Array.isArray(o.partial) ? o.partial : Array.isArray(o.fail) ? o.fail : [];
  return Array.isArray(o.fail) ? o.fail : [];
}

function resolvePerform(state, action, data) {
  const resolvable = data?.actions?.[action.actionId];
  if (!isPlainObject(resolvable)) {
    return rejectAction(state, "unknown_action");
  }

  const requiresCtx = { state, data, actorId: state.player.actorId, targetId: action.targetId, contextKind: "player" };
  if (resolvable.requires !== undefined && !evaluateCondition(resolvable.requires, requiresCtx)) {
    return rejectAction(state, "requirements_not_met");
  }

  const workingState = structuredClone(state);
  const events = [];
  const workingCtx = { state: workingState, data, actorId: workingState.player.actorId, targetId: action.targetId };

  let effectsToApply;
  if (resolvable.check !== undefined) {
    const { result, rng } = check(resolvable.check, workingCtx);
    workingState.rng = rng;
    const attemptKey = resolvable.check.attemptKey;
    if (typeof attemptKey === "string") {
      if (!isPlainObject(workingState.attempts)) workingState.attempts = {};
      workingState.attempts[attemptKey] = (workingState.attempts[attemptKey] ?? 0) + 1;
    }
    events.push({ minute: workingState.time.minute, type: "check.resolved", visibility: "player", data: result });
    effectsToApply = resolveOutcomeEffects(resolvable.outcomes, result.tier);
  } else {
    effectsToApply = Array.isArray(resolvable.effects) ? resolvable.effects : [];
  }

  applyEffectList(effectsToApply, workingState, events, workingCtx);

  if (Number.isInteger(resolvable.minutes) && resolvable.minutes > 0) {
    applyEffectList([{ op: "time", minutes: resolvable.minutes }], workingState, events, workingCtx);
  }

  events.push({ minute: workingState.time.minute, type: "action.resolved", visibility: "player", data: {} });
  return { state: workingState, events };
}

function resolveMove(state, action, data) {
  const destination = data?.locations?.[action.to];
  if (!isPlainObject(destination)) {
    return rejectAction(state, "unknown_location");
  }

  const currentLocationId = state.actors[state.player.actorId].locationId;
  const outgoing = data?.locations?.[currentLocationId]?.links;
  const link = Array.isArray(outgoing) ? outgoing.find((l) => isPlainObject(l) && l.to === action.to) : undefined;

  const requiresCtx = { state, data, actorId: state.player.actorId, contextKind: "player" };
  const destinationOk = destination.requires === undefined || evaluateCondition(destination.requires, requiresCtx);
  const linkOk = link !== undefined && (link.requires === undefined || evaluateCondition(link.requires, requiresCtx));
  if (!destinationOk || !linkOk) {
    return rejectAction(state, "requirements_not_met");
  }

  const workingState = structuredClone(state);
  const events = [];
  const workingCtx = { state: workingState, data, actorId: workingState.player.actorId };

  applyEffectList([{ op: "move", to: action.to }], workingState, events, workingCtx);

  const minutes = Number.isInteger(link.minutes) ? link.minutes : 0;
  if (minutes > 0) {
    applyEffectList([{ op: "time", minutes }], workingState, events, workingCtx);
  }

  events.push({ minute: workingState.time.minute, type: "action.resolved", visibility: "player", data: {} });
  return { state: workingState, events };
}

// Only reachable when pending.kind === "newCharacter" (the step() gate
// enforces this) -- i.e. always a post-death respawn (D-47). The very
// first character is created directly by createInitialState, never here.
function resolveStartCharacter(state, action, data) {
  const template = data?.characterTemplates?.[action.templateId];
  if (!isPlainObject(template)) {
    return rejectAction(state, "unknown_action"); // D-47/D-48: closest fixed code for "referenced content missing"
  }

  const workingState = structuredClone(state);
  const events = [];

  const previousActorId = workingState.player.actorId;
  const characterCount = workingState.player.characterCount + 1;
  const newActorId = "player_" + characterCount;

  workingState.actors[newActorId] = buildActorFromTemplate(newActorId, template);
  workingState.player = { actorId: newActorId, characterCount };
  workingState.pending = null;

  events.push({ minute: workingState.time.minute, type: "character.started", visibility: "player", data: { actorId: newActorId } });

  const succession = Array.isArray(data?.rules?.succession) ? data.rules.succession : [];
  const successionCtx = { state: workingState, data, actorId: newActorId, targetId: previousActorId };
  applyEffectList(succession, workingState, events, successionCtx);

  events.push({ minute: workingState.time.minute, type: "action.resolved", visibility: "player", data: {} });
  return { state: workingState, events };
}

// (state, action, data) -> { state, events }.
export function step(state, action, data) {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("TxtRPG V2 engine: unsupported schemaVersion " + state.schemaVersion);
  }

  const actionType = validateActionShape(action);
  if (actionType === null) {
    return rejectAction(state, "invalid_action");
  }

  if (state.player === undefined) {
    // D-48: this world was never bootstrapped with the actor system (no
    // `data.world.startTemplateId` at createInitialState time) -- only
    // `wait` is meaningful, exactly like V2-Core-01.
    if (actionType !== "wait") return rejectAction(state, "invalid_action");
    return resolveWait(state, action);
  }

  // §2.5 stage 3 (D-48): pending / dead gate. Applies to every action type
  // including `wait` now that a player actor exists (§9: "이 상태에서는
  // startCharacter만 허용한다").
  const pending = state.pending ?? null;
  if (pending?.kind === "choice" && actionType !== "choose") {
    return rejectAction(state, "pending_choice");
  }
  if (pending?.kind === "newCharacter" && actionType !== "startCharacter") {
    return rejectAction(state, "pending_new_character");
  }
  if (actionType === "choose" && pending?.kind !== "choice") {
    return rejectAction(state, "no_pending_choice");
  }
  if (actionType === "startCharacter" && pending?.kind !== "newCharacter") {
    return rejectAction(state, "invalid_action");
  }
  if (actionType === "perform" || actionType === "move" || actionType === "choose") {
    const currentActor = state.actors?.[state.player.actorId];
    if (!currentActor || currentActor.alive === false) {
      return rejectAction(state, "actor_dead");
    }
  }

  if (actionType === "wait") return resolveWait(state, action);
  if (actionType === "choose") {
    // D-35: data.choices resolution is out of scope; unreachable in
    // practice since nothing here ever sets pending.kind to "choice".
    return rejectAction(state, "unknown_option");
  }
  if (actionType === "perform") return resolvePerform(state, action, data);
  if (actionType === "move") return resolveMove(state, action, data);
  return resolveStartCharacter(state, action, data);
}
