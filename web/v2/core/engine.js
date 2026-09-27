// V2 engine per docs/v2/architecture/CORE_CONTRACTS.md §2, §5, §9.
// V2-Core-01: SCHEMA_VERSION, createInitialState, step (`wait` + invalid
// action reject only).
// V2-Core-11 (D-46/D-47/D-48/D-49): `perform`/`move`/`startCharacter`
// wired into step(), reusing rules.js's applyEffectList/evaluateCondition/
// check (no separate Effect/Condition path -- D-26/D-27/D-28/D-29/D-30
// unchanged).
// V2-Core-12 (D-35/D-50/D-51): `choose` (data.choices[id].options[], matched
// by `id`) reuses the same Resolvable interpreter as `perform` (§2.3 "one
// interpreter"), extracted into resolveResolvable(). Every resolved action
// now also runs §2.5 stages 9 (day.started per crossed day boundary) and 10
// (data.events trigger pass, id-ascending, once/cooldown via state.fired,
// one pass = the "1-step chain limit").
// V2-Core-13 (D-53/D-15): view(state, data) -- pure query, {actor,
// knowledge, relations, pending, actions}, exactly §8.4's named categories.
// `handler` stays deliberately unimplemented (§4.4 callout, no real use
// case yet -- not a blocker).
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

// The one Resolvable interpreter (§2.3), shared by `perform`, `choose`, and
// trigger (D-51): check-or-effects -> outcomes (if checked) -> minutes as a
// trailing time Effect. Mutates workingState/events in place.
function resolveResolvable(resolvable, workingState, events, ctx) {
  let effectsToApply;
  if (resolvable.check !== undefined) {
    const { result, rng } = check(resolvable.check, ctx);
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

  applyEffectList(effectsToApply, workingState, events, ctx);

  if (Number.isInteger(resolvable.minutes) && resolvable.minutes > 0) {
    applyEffectList([{ op: "time", minutes: resolvable.minutes }], workingState, events, ctx);
  }
}

// §2.5 stage 9 (D-50): one `day.started` per day boundary crossed while
// resolving this action, reported at the action's final minute (matching
// every other event's "report current time" convention).
function pushDayStartedEvents(beforeMinute, workingState, events) {
  const dayBefore = Math.floor(beforeMinute / 1440);
  const dayAfter = Math.floor(workingState.time.minute / 1440);
  for (let day = dayBefore + 1; day <= dayAfter; day += 1) {
    events.push({ minute: workingState.time.minute, type: "day.started", visibility: "internal", data: { day } });
  }
}

// §2.5 stage 10 (D-51): one id-ascending pass over data.events. A trigger
// that fires applies its Resolvable to the SAME working copy, so later
// trigger ids in this same pass can see it (ordinary sequential visibility,
// §4.1) -- but the pass never restarts, which is the "1-step chain limit"
// (a newly-true earlier-id trigger waits for the next step() call).
function runTriggerStage(workingState, events, data) {
  if (workingState.player === undefined) return; // no actor system bootstrapped (D-48-style)
  const definitions = data?.events;
  if (!isPlainObject(definitions)) return;

  Object.keys(definitions)
    .sort()
    .forEach((eventId) => {
      const def = definitions[eventId];
      if (!isPlainObject(def)) return;

      const fired = workingState.fired?.[eventId];
      if (def.once === true && fired && fired.count > 0) return;
      if (Number.isInteger(def.cooldown) && fired && workingState.time.minute - fired.lastMinute < def.cooldown) return;

      const triggerCtx = { state: workingState, data, actorId: workingState.player.actorId, contextKind: "world" };
      if (!evaluateCondition(def.trigger, triggerCtx)) return;

      resolveResolvable(def, workingState, events, { state: workingState, data, actorId: workingState.player.actorId });

      if (!isPlainObject(workingState.fired)) workingState.fired = {};
      const previousCount = workingState.fired[eventId]?.count ?? 0;
      workingState.fired[eventId] = { count: previousCount + 1, lastMinute: workingState.time.minute };

      events.push({ minute: workingState.time.minute, type: "trigger.fired", visibility: "internal", data: { eventId } });
    });
}

function runWorldAndTriggerStages(beforeMinute, workingState, events, data) {
  pushDayStartedEvents(beforeMinute, workingState, events);
  runTriggerStage(workingState, events, data);
}

function resolveWait(state, action, data) {
  const workingState = structuredClone(state);
  const events = [];
  const beforeMinute = workingState.time.minute;

  workingState.time.minute += action.minutes;
  events.push({ minute: workingState.time.minute, type: "time.advanced", visibility: "player", data: { minutes: action.minutes } });

  runWorldAndTriggerStages(beforeMinute, workingState, events, data);
  return { state: workingState, events };
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
  const beforeMinute = workingState.time.minute;

  resolveResolvable(resolvable, workingState, events, workingCtx);
  runWorldAndTriggerStages(beforeMinute, workingState, events, data);

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
  const beforeMinute = workingState.time.minute;

  applyEffectList([{ op: "move", to: action.to }], workingState, events, workingCtx);

  const minutes = Number.isInteger(link.minutes) ? link.minutes : 0;
  if (minutes > 0) {
    applyEffectList([{ op: "time", minutes }], workingState, events, workingCtx);
  }

  runWorldAndTriggerStages(beforeMinute, workingState, events, data);

  events.push({ minute: workingState.time.minute, type: "action.resolved", visibility: "player", data: {} });
  return { state: workingState, events };
}

// Only reachable when pending.kind === "choice" (the step() gate enforces
// this, D-35). Matches the option by `id` within
// data.choices[pending.choiceId].options[] (6.2절-style array-of-{id,...}).
function resolveChoose(state, action, data) {
  const choiceDef = data?.choices?.[state.pending.choiceId];
  const option = Array.isArray(choiceDef?.options) ? choiceDef.options.find((o) => isPlainObject(o) && o.id === action.optionId) : undefined;
  if (!isPlainObject(option)) {
    return rejectAction(state, "unknown_option");
  }

  const requiresCtx = { state, data, actorId: state.player.actorId, contextKind: "player" };
  if (option.requires !== undefined && !evaluateCondition(option.requires, requiresCtx)) {
    return rejectAction(state, "requirements_not_met");
  }

  const workingState = structuredClone(state);
  const events = [];
  const workingCtx = { state: workingState, data, actorId: workingState.player.actorId };
  const beforeMinute = workingState.time.minute;

  workingState.pending = null; // D-35: consuming a choice always clears pending, like startCharacter (D-47)
  resolveResolvable(option, workingState, events, workingCtx);
  runWorldAndTriggerStages(beforeMinute, workingState, events, data);

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
  const beforeMinute = workingState.time.minute;

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

  runWorldAndTriggerStages(beforeMinute, workingState, events, data);

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
    return resolveWait(state, action, data);
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

  if (actionType === "wait") return resolveWait(state, action, data);
  if (actionType === "choose") return resolveChoose(state, action, data);
  if (actionType === "perform") return resolvePerform(state, action, data);
  if (actionType === "move") return resolveMove(state, action, data);
  return resolveStartCharacter(state, action, data);
}

// (state, data) -> PlayerView | null (D-53, §8.4/§1.4). Pure query: no
// mutation, no RNG. Returns exactly the 5 fields §8.4 names (no invented
// categories) -- facts, other actors' knowledge, and internal events are
// never included. `null` when no player actor exists yet (world never
// bootstrapped with data.world.startTemplateId, D-47).
export function view(state, data) {
  const playerActorId = state.player?.actorId;
  const actor = playerActorId !== undefined ? state.actors?.[playerActorId] : undefined;
  if (!isPlainObject(actor)) return null;

  const knowledge = structuredClone(state.knowledge?.[playerActorId] ?? {});

  const relations = {};
  if (isPlainObject(state.relations)) {
    Object.keys(state.relations)
      .sort()
      .forEach((edgeKey) => {
        const [fromId, toId] = edgeKey.split(":");
        if (fromId === playerActorId || toId === playerActorId) {
          relations[edgeKey] = structuredClone(state.relations[edgeKey]);
        }
      });
  }

  // D-15/D-53: every action whose requires is satisfied, plus locked ones
  // that opt into showWhenLocked -- never the reason a locked one is locked.
  const actions = [];
  if (isPlainObject(data?.actions)) {
    const requiresCtx = { state, data, actorId: playerActorId, contextKind: "player" };
    Object.keys(data.actions)
      .sort()
      .forEach((actionId) => {
        const def = data.actions[actionId];
        if (!isPlainObject(def)) return;
        const available = def.requires === undefined || evaluateCondition(def.requires, requiresCtx);
        if (available) {
          actions.push({ actionId, available: true });
        } else if (def.showWhenLocked === true) {
          actions.push({ actionId, available: false });
        }
      });
  }

  return {
    actor: structuredClone(actor),
    knowledge,
    relations,
    pending: state.pending ?? null,
    actions
  };
}
