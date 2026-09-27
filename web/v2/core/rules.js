// Pure Condition evaluator and Effect applier per
// docs/v2/architecture/CORE_CONTRACTS.md §3, §3.2a, §4.
//
// Condition (V2-Core-02): and/or/not/always/never/eq/neq/gt/gte/lt/lte.
// Effect (V2-Core-03): flag/signal/time/if.
// Effect (V2-Core-04): stat/hp/money/item/relation (add/score only; D-29,
// D-31).
// Effect (V2-Core-05): skill/trait/unlock/case.
// Effect (V2-Core-06): exp/proficiency (D-41, D-42 resolved -- §6.4.1/6.4.2).
// Level-up/threshold reward lists are applied via the same applyEffectList
// used by if.then/else, with a reward ctx whose actorId is overridden to
// the leveling/proficient actor (same pattern as §9 succession's ctx).
// No move/rumor/fact/narrate/choice/handler yet, no death trigger (§9), no
// check(), no Resolvable — applyEffects is still not wired into engine.js's
// step() (D-40).
//
// No host APIs (DOM/window/Date/Math.random/indexedDB/localStorage/fetch/
// performance/crypto). ctx.state/data/effects/condition are never mutated
// by the caller-visible API.
//
// Unknown Condition op, wrong shape, or an unresolved selector never
// throws: it evaluates to `false` (§3.1) — this assumes a well-formed `ctx`
// (a broken ctx.state is a programmer error, same as elsewhere in the
// engine). Effect malformed input is the opposite policy: it throws
// (D-28) — except a malformed `if.when`, which safely resolves to `false`
// via evaluateCondition and is treated as a normal false branch.

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function resolveSubjectId(subject, ctx) {
  if (subject === undefined || subject === "self") return ctx.actorId;
  if (subject === "target") return ctx.targetId;
  if (typeof subject === "string") return subject;
  return undefined;
}

// -- selectors (§3.2a) ------------------------------------------------------

function resolveGrowthValue(selectorKey, growthMapKey, selector, ctx) {
  const id = selector[selectorKey];
  if (typeof id !== "string") return undefined;
  const subjectId = resolveSubjectId(selector.subject, ctx);
  const system = typeof selector.system === "string" ? selector.system : ctx.data?.world?.growthSystemId;
  if (typeof system !== "string") return undefined;
  return ctx.state?.actors?.[subjectId]?.growth?.[system]?.[growthMapKey]?.[id];
}

function resolveItem(selector, ctx) {
  if (typeof selector.item !== "string") return undefined;
  const subjectId = resolveSubjectId(selector.subject, ctx);
  return ctx.state?.actors?.[subjectId]?.inventory?.[selector.item];
}

function resolveMoney(selector, ctx) {
  if (selector.money !== true) return undefined;
  const subjectId = resolveSubjectId(selector.subject, ctx);
  return ctx.state?.actors?.[subjectId]?.money;
}

function resolveRelationScore(selector, ctx) {
  const spec = selector.relation;
  if (!isPlainObject(spec)) return undefined;
  const fromId = resolveSubjectId(spec.from, ctx);
  const toId = resolveSubjectId(spec.to, ctx);
  if (fromId === undefined || toId === undefined) return undefined;
  const edge = ctx.state?.relations?.[fromId + ":" + toId];
  return edge ? edge.score : 0; // no edge -> default Relation.score (§7.2)
}

function resolveFlag(selector, ctx) {
  if (typeof selector.flag !== "string") return undefined;
  const value = ctx.state?.flags?.[selector.flag];
  return value === undefined ? null : value;
}

function resolveSignal(selector, ctx) {
  if (typeof selector.signal !== "string") return undefined;
  const value = ctx.state?.signals?.[selector.signal];
  return value === undefined ? 0 : value;
}

function resolveDay(selector, ctx) {
  if (selector.day !== true) return undefined;
  const minute = ctx.state?.time?.minute;
  return typeof minute === "number" ? Math.floor(minute / 1440) : undefined;
}

function resolveFact(selector, ctx) {
  if (typeof selector.fact !== "string") return undefined;
  if (ctx.contextKind !== "world") return undefined; // D-06, extended to selector form
  return ctx.state?.facts?.[selector.fact]?.value;
}

// `rumor` is a recognized selector key (§3.2a) but which field it resolves
// to (confidence? claim?) is deferred (D-24) — no resolver is wired up, so
// it always resolves to `undefined` via the SELECTOR_RESOLVERS lookup miss.

const SELECTOR_RESOLVERS = {
  stat: (selector, ctx) => resolveGrowthValue("stat", "stats", selector, ctx),
  skill: (selector, ctx) => resolveGrowthValue("skill", "skills", selector, ctx),
  proficiency: (selector, ctx) => resolveGrowthValue("proficiency", "proficiency", selector, ctx),
  item: resolveItem,
  money: resolveMoney,
  relation: resolveRelationScore,
  flag: resolveFlag,
  signal: resolveSignal,
  day: resolveDay,
  fact: resolveFact
};

function resolveSelector(selector, ctx) {
  const keys = Object.keys(selector);
  if (keys.length !== 1) return undefined; // exactly one recognized key required (§3.2a)
  const resolver = SELECTOR_RESOLVERS[keys[0]];
  return resolver ? resolver(selector, ctx) : undefined;
}

function resolveValue(value, ctx) {
  if (value === null) return null;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") return value; // literal
  if (isPlainObject(value)) return resolveSelector(value, ctx);
  return undefined; // arrays or anything else are not a valid Value
}

// -- comparison ops (§3.2, §3.2a) --------------------------------------------

function evaluateComparison(op, condition, ctx) {
  const left = resolveValue(condition.left, ctx);
  const right = resolveValue(condition.right, ctx);
  // D-25: either side unresolved -> false, for every comparison op, no
  // exceptions (including eq/neq's own strict-equality special case).
  if (left === undefined || right === undefined) return false;
  switch (op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return isFiniteNumber(left) && isFiniteNumber(right) && left > right;
    case "gte":
      return isFiniteNumber(left) && isFiniteNumber(right) && left >= right;
    case "lt":
      return isFiniteNumber(left) && isFiniteNumber(right) && left < right;
    case "lte":
      return isFiniteNumber(left) && isFiniteNumber(right) && left <= right;
    default:
      return false;
  }
}

// -- public API ---------------------------------------------------------------

// (Condition, ctx) -> boolean. ctx = { state, data, actorId, targetId, contextKind }
export function evaluateCondition(condition, ctx) {
  if (!isPlainObject(condition)) return false;

  switch (condition.op) {
    case "always":
      return true;
    case "never":
      return false;
    case "not": {
      if (!isPlainObject(condition.of)) return false; // exactly one Condition (§3.2)
      return !evaluateCondition(condition.of, ctx);
    }
    case "and": {
      if (!Array.isArray(condition.of)) return false;
      for (const sub of condition.of) {
        if (!evaluateCondition(sub, ctx)) return false; // short-circuit
      }
      return true; // empty array -> true (§3.2)
    }
    case "or": {
      if (!Array.isArray(condition.of)) return false;
      for (const sub of condition.of) {
        if (evaluateCondition(sub, ctx)) return true; // short-circuit
      }
      return false; // empty array -> false (§3.2)
    }
    case "eq":
    case "neq":
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      return evaluateComparison(condition.op, condition, ctx);
    default:
      return false; // unknown op (§3.1, pending validateData)
  }
}

// -- Effect application (§4, V2-Core-03: flag/signal/time/if only) ----------
//
// Malformed Effect input throws (D-28): not a plain object, unknown op,
// missing/wrong-typed field. This is a different policy from Condition's
// "never throw" (§3.1) — the two are intentionally different systems.
//
// applyEffects() is pure from the caller's perspective (never mutates
// `effects`, `ctx`, or `ctx.state`; always returns a new state object) but
// clones `ctx.state` exactly once and mutates that private working copy in
// place as it walks the effect list — this is the standard "build a fresh
// copy via local mutation, then hand it back" implementation of a pure
// function, not an exception to the no-mutation rule (D-26). Nested Effects
// (`if.then`/`if.else`) share that same working copy and event list, so an
// earlier Effect's change is visible to a later one within the same call.

function applyFlagEffect(effect, workingState, events) {
  if (typeof effect.key !== "string") {
    throw new TypeError("flag Effect requires a string `key`");
  }
  if (typeof effect.value !== "boolean") {
    throw new TypeError("flag Effect requires a boolean `value`");
  }
  if (!isPlainObject(workingState.flags)) workingState.flags = {};
  const before = workingState.flags[effect.key];
  if (before === effect.value) return; // no-op -> no event (D-30)
  workingState.flags[effect.key] = effect.value;
  events.push({
    minute: workingState.time.minute,
    type: "flag.changed",
    visibility: "internal",
    data: { key: effect.key, value: effect.value }
  });
}

const MAX_SIGNAL = Number.MAX_SAFE_INTEGER;

function applySignalEffect(effect, workingState, events) {
  if (typeof effect.key !== "string") {
    throw new TypeError("signal Effect requires a string `key`");
  }
  if (!Number.isInteger(effect.add)) {
    throw new TypeError("signal Effect requires an integer `add`");
  }
  if (!isPlainObject(workingState.signals)) workingState.signals = {};
  const before = workingState.signals[effect.key] ?? 0;
  const after = Math.min(MAX_SIGNAL, Math.max(0, before + effect.add));
  const delta = after - before;
  workingState.signals[effect.key] = after;
  if (delta === 0) return; // no-op -> no event (D-30)
  events.push({
    minute: workingState.time.minute,
    type: "signal.raised",
    visibility: "internal",
    data: { key: effect.key, delta }
  });
}

function applyTimeEffect(effect, workingState, events) {
  if (!Number.isInteger(effect.minutes)) {
    throw new TypeError("time Effect requires an integer `minutes`");
  }
  if (effect.minutes < 0) {
    throw new TypeError("time Effect requires minutes >= 0");
  }
  if (effect.minutes === 0) return; // no-op -> no event (D-30)
  workingState.time.minute += effect.minutes;
  events.push({
    minute: workingState.time.minute,
    type: "time.advanced",
    visibility: "player",
    data: { minutes: effect.minutes } // actual applied change (not clamped here)
  });
}

function applyIfEffect(effect, workingState, events, ctx) {
  if (!Array.isArray(effect.then)) {
    throw new TypeError("if Effect requires an array `then`");
  }
  if (effect.else !== undefined && !Array.isArray(effect.else)) {
    throw new TypeError("if Effect's `else` must be an array when present");
  }
  const conditionCtx = {
    state: workingState,
    data: ctx.data,
    actorId: ctx.actorId,
    targetId: ctx.targetId,
    contextKind: "world" // Effect if.when is always evaluated in world context (§3.3)
  };
  // A malformed `when` safely resolves to `false` here (§3.1) and is treated
  // as a normal false branch, not an Effect-level malformed error (D-28).
  const takeThen = evaluateCondition(effect.when, conditionCtx);
  applyEffectList(takeThen ? effect.then : effect.else ?? [], workingState, events, ctx);
  // `if` itself never emits an event; only the Effects inside then/else do.
}

// -- subject-based Effect application (§4.2, §4.3, V2-Core-04) --------------
//
// stat/hp/money/item/relation share one policy (D-29): a malformed subject
// TYPE throws (schema error, D-28), but a well-typed subject that cannot be
// RESOLVED to an existing actor (or growth system) is not an error — it is
// silently skipped (no throw, no lazy actor, no state change, no event),
// and the next Effect in the list still runs. Visibility is decided by
// whether the resolved actor is the current player actor (D-31).

function isPlayerActor(actorId, workingState) {
  return actorId === workingState.player?.actorId;
}

// subject -> { id, actor } | null. null means "skip" (D-29), not malformed.
function resolveActor(subject, ctx, workingState) {
  if (subject !== undefined && typeof subject !== "string") {
    throw new TypeError("Effect `subject` must be a string when present");
  }
  const subjectId = resolveSubjectId(subject, ctx);
  if (subjectId === undefined) return null; // e.g. "target" with no ctx.targetId
  const actor = workingState.actors?.[subjectId];
  if (!actor) return null; // no such actor record in state.actors
  return { id: subjectId, actor };
}

function resolveGrowthSystemId(effect, ctx) {
  if (effect.system !== undefined) {
    return typeof effect.system === "string" ? effect.system : undefined;
  }
  const fallback = ctx.data?.world?.growthSystemId;
  return typeof fallback === "string" ? fallback : undefined;
}

function findStatDefinition(ctx, system, statId) {
  const stats = ctx.data?.growthSystems?.[system]?.stats;
  return Array.isArray(stats) ? stats.find((s) => isPlainObject(s) && s.id === statId) : undefined;
}

function applyStatEffect(effect, workingState, events, ctx) {
  if (typeof effect.stat !== "string") {
    throw new TypeError("stat Effect requires a string `stat`");
  }
  if (!Number.isInteger(effect.add)) {
    throw new TypeError("stat Effect requires an integer `add`");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("stat Effect's `system`, when present, must be a string");
  }

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // no growth system to resolve against -> skip (D-29)

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = {};
  if (!isPlainObject(actor.growth[system].stats)) actor.growth[system].stats = {};

  const before = actor.growth[system].stats[effect.stat] ?? 0;
  const definition = findStatDefinition(ctx, system, effect.stat);
  const min = definition && Number.isInteger(definition.min) ? definition.min : -Infinity;
  const max = definition && Number.isInteger(definition.max) ? definition.max : Infinity;
  const after = Math.min(max, Math.max(min, before + effect.add));
  const delta = after - before;
  actor.growth[system].stats[effect.stat] = after;
  if (delta === 0) return; // D-30

  events.push({
    minute: workingState.time.minute,
    type: "stat.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { stat: effect.stat, delta }
  });
}

function applyHpEffect(effect, workingState, events, ctx) {
  if (!Number.isInteger(effect.add)) {
    throw new TypeError("hp Effect requires an integer `add`");
  }
  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const actor = resolved.actor;
  const before = actor.hp.current; // actor.hp is part of the actor schema (§2.1); a broken record throws naturally
  const after = Math.min(actor.hp.max, Math.max(0, before + effect.add));
  const delta = after - before;
  actor.hp.current = after;
  if (delta === 0) return; // D-30

  events.push({
    minute: workingState.time.minute,
    type: "hp.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { delta }
  });
  // Not implemented here (§9, temporarily scoped out): death trigger
  // (alive=false, actor.died) when `after === 0`. current is still clamped
  // and stored above.
}

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

function applyMoneyEffect(effect, workingState, events, ctx) {
  if (!Number.isInteger(effect.add)) {
    throw new TypeError("money Effect requires an integer `add`");
  }
  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const actor = resolved.actor;
  const before = Number.isInteger(actor.money) ? actor.money : 0;
  const after = Math.min(MAX_SAFE, Math.max(0, before + effect.add));
  const delta = after - before;
  actor.money = after;
  if (delta === 0) return; // D-30

  events.push({
    minute: workingState.time.minute,
    type: "money.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { delta }
  });
}

function applyItemEffect(effect, workingState, events, ctx) {
  if (typeof effect.item !== "string") {
    throw new TypeError("item Effect requires a string `item`");
  }
  if (!Number.isInteger(effect.add)) {
    throw new TypeError("item Effect requires an integer `add`");
  }
  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.inventory)) actor.inventory = {};
  const before = actor.inventory[effect.item] ?? 0;
  const after = Math.min(MAX_SAFE, Math.max(0, before + effect.add));
  const delta = after - before;
  if (after === 0) {
    delete actor.inventory[effect.item]; // existing contract: 0 -> key deleted
  } else {
    actor.inventory[effect.item] = after;
  }
  if (delta === 0) return; // D-30

  events.push({
    minute: workingState.time.minute,
    type: "item.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { item: effect.item, delta }
  });
}

const MAX_RELATION_SCORE = 100;
const MIN_RELATION_SCORE = -100;
const VALID_RELATION_MODES = new Set(["neutral", "cooperation", "conflict"]);

// relation Effect (D-43, §7.3/§4.2): add/mode/tag/untag are independently
// validated and applied, then combined into at most one relation.changed
// event per Effect call (D-30 stays Effect-scoped, not field-scoped).
function applyRelationEffect(effect, workingState, events, ctx) {
  if (effect.add !== undefined && !Number.isInteger(effect.add)) {
    throw new TypeError("relation Effect's `add`, when present, must be an integer");
  }
  if (effect.from !== undefined && typeof effect.from !== "string") {
    throw new TypeError("relation Effect's `from`, when present, must be a string");
  }
  if (effect.to !== undefined && typeof effect.to !== "string") {
    throw new TypeError("relation Effect's `to`, when present, must be a string");
  }
  if (effect.mode !== undefined && !VALID_RELATION_MODES.has(effect.mode)) {
    throw new TypeError('relation Effect\'s `mode`, when present, must be "neutral", "cooperation", or "conflict"');
  }
  if (effect.tag !== undefined && typeof effect.tag !== "string") {
    throw new TypeError("relation Effect's `tag`, when present, must be a string");
  }
  if (effect.untag !== undefined && typeof effect.untag !== "string") {
    throw new TypeError("relation Effect's `untag`, when present, must be a string");
  }

  // §7.3 defaults: from -> target, to -> self (resolveSubjectId's own
  // undefined-default is `self`, so `from` needs an explicit substitution).
  const fromId = resolveSubjectId(effect.from === undefined ? "target" : effect.from, ctx);
  const toId = resolveSubjectId(effect.to, ctx);
  if (fromId === undefined || toId === undefined) return; // D-29: skip

  const edgeKey = fromId + ":" + toId;
  const existing = workingState.relations?.[edgeKey];
  const beforeScore = existing && Number.isInteger(existing.score) ? existing.score : 0;
  const beforeMode = existing?.mode ?? "neutral";
  const beforeTags = existing?.tags ?? [];
  let cooperationCount = existing?.cooperationCount ?? 0;
  let conflictCount = existing?.conflictCount ?? 0;

  const add = effect.add ?? 0;
  const afterScore = Math.min(MAX_RELATION_SCORE, Math.max(MIN_RELATION_SCORE, beforeScore + add));
  const scoreDelta = afterScore - beforeScore;

  // D-43: setting `mode` always sets it and, for cooperation/conflict,
  // always bumps the counter -- regardless of whether `mode` already held
  // that value (V1 npc-relations.js's "re-applied every day" semantics).
  let afterMode = beforeMode;
  let modeChanged = false;
  if (effect.mode !== undefined) {
    afterMode = effect.mode;
    if (effect.mode === "cooperation") cooperationCount += 1;
    else if (effect.mode === "conflict") conflictCount += 1;
    modeChanged =
      afterMode !== beforeMode ||
      cooperationCount !== (existing?.cooperationCount ?? 0) ||
      conflictCount !== (existing?.conflictCount ?? 0);
  }

  let afterTags = beforeTags;
  if (effect.tag !== undefined && !afterTags.includes(effect.tag)) {
    afterTags = [...afterTags, effect.tag].sort();
  }
  if (effect.untag !== undefined && afterTags.includes(effect.untag)) {
    afterTags = afterTags.filter((t) => t !== effect.untag);
  }
  // Net diff against beforeTags (not two independent flags) so a tag/untag
  // pair on the same string that cancels out is correctly seen as no change.
  const tagsAdded = afterTags.filter((t) => !beforeTags.includes(t));
  const tagsRemoved = beforeTags.filter((t) => !afterTags.includes(t));
  const tagsChanged = tagsAdded.length > 0 || tagsRemoved.length > 0;

  if (scoreDelta === 0 && !modeChanged && !tagsChanged) return; // D-30/D-43: nothing changed -> no edge touch, no event

  if (!isPlainObject(workingState.relations)) workingState.relations = {};
  const day = Math.floor(workingState.time.minute / 1440);
  workingState.relations[edgeKey] = {
    score: afterScore,
    mode: afterMode,
    lastDay: day,
    cooperationCount,
    conflictCount,
    tags: afterTags
  };

  const data = { from: fromId, to: toId }; // two endpoints -> no single actorId (§4.2)
  if (scoreDelta !== 0) data.delta = scoreDelta;
  if (modeChanged) data.mode = afterMode; // absolute result, like case.updated's `stage` (not a delta)
  if (tagsAdded.length > 0) data.tagAdded = tagsAdded[0];
  if (tagsRemoved.length > 0) data.tagRemoved = tagsRemoved[0];

  events.push({
    minute: workingState.time.minute,
    type: "relation.changed",
    visibility: isPlayerActor(fromId, workingState) || isPlayerActor(toId, workingState) ? "player" : "internal",
    data
  });
}

// -- Growth Effects (§6, V2-Core-05: skill/trait/unlock/case; V2-Core-06:
// exp/proficiency, D-41/D-42 resolved -- §6.4.1/6.4.2) ----------------------

// Reused by skill/trait/exp/proficiency (kept separate from stat's
// findStatDefinition in evaluateCondition's helpers so V2-Core-04's stat
// code stays untouched).
function findGrowthDefinition(ctx, system, collectionKey, id) {
  const list = ctx.data?.growthSystems?.[system]?.[collectionKey];
  return Array.isArray(list) ? list.find((item) => isPlainObject(item) && item.id === id) : undefined;
}

function findLevelRewards(ctx, system, level) {
  const rewards = ctx.data?.growthSystems?.[system]?.levelRewards;
  const list = isPlainObject(rewards) ? rewards[String(level)] : undefined;
  return Array.isArray(list) ? list : undefined;
}

// expTable-based level formula (D-41, §6.4.1): rawLevel = count of thresholds
// cleared, clamped by level.max when present. levelDef itself may be null/
// undefined (level-less growth system) -> undefined signals "no level concept".
function computeLevel(exp, levelDef) {
  if (!isPlainObject(levelDef) || !Array.isArray(levelDef.expTable)) return undefined;
  const rawLevel = levelDef.expTable.filter((v) => Number.isFinite(v) && exp >= v).length;
  return Number.isInteger(levelDef.max) ? Math.min(rawLevel, levelDef.max) : rawLevel;
}

// exp Effect (D-41, §6.4.1): {op:"exp", amount, subject?, system?}.
// amount must be a non-negative integer (negative/NaN/Infinity/non-integer
// -> malformed, throw, D-28). levelRewards for each level gained are applied
// sequentially, depth-first, via the same applyEffectList used elsewhere,
// with a reward ctx whose actorId is the leveling actor (§9 succession
// pattern). amount>=0 plus a finite level.max structurally bounds the
// cascade -- no separate recursion-limit mechanism is needed.
function applyExpEffect(effect, workingState, events, ctx) {
  if (!Number.isInteger(effect.amount) || effect.amount < 0) {
    throw new TypeError("exp Effect requires a non-negative integer `amount`");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("exp Effect's `system`, when present, must be a string");
  }

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = { level: 1, exp: 0 };
  const growthState = actor.growth[system];
  if (!Number.isInteger(growthState.exp)) growthState.exp = 0;
  if (!Number.isInteger(growthState.level)) growthState.level = 1;

  const before = growthState.exp;
  const after = Math.min(MAX_SAFE, before + effect.amount);
  const delta = after - before;
  growthState.exp = after;
  if (delta === 0) return; // D-30: no actual exp change -> no event, no level processing

  events.push({
    minute: workingState.time.minute,
    type: "exp.gained",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { system, delta }
  });

  const levelDef = ctx.data?.growthSystems?.[system]?.level;
  const newLevel = computeLevel(after, levelDef);
  if (newLevel === undefined) return; // level-less growth system (§6.4.1): exp only

  const oldLevel = growthState.level;
  if (newLevel <= oldLevel) return;

  const rewardCtx = { ...ctx, actorId: resolved.id };
  for (let level = oldLevel + 1; level <= newLevel; level += 1) {
    growthState.level = level;
    const rewards = findLevelRewards(ctx, system, level);
    if (rewards) applyEffectList(rewards, workingState, events, rewardCtx);
    events.push({
      minute: workingState.time.minute,
      type: "level.up",
      visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
      actorId: resolved.id,
      data: { system, from: level - 1, to: level }
    });
  }
}

// proficiency Effect (D-42, §6.4.2): {op:"proficiency", id, add, subject?, system?}.
// add must be a non-negative integer (D-28). The definition's `max` is a
// hard clamp (falls back to MAX_SAFE when undefined). Thresholds are
// processed in ascending `at` order; only before<at<=after fires; each
// threshold's effects run depth-first via the same reward-ctx pattern as
// exp. No re-entry/un-firing logic: growth here is monotonic-only (add>=0).
function applyProficiencyEffect(effect, workingState, events, ctx) {
  if (typeof effect.id !== "string") {
    throw new TypeError("proficiency Effect requires a string `id`");
  }
  if (!Number.isInteger(effect.add) || effect.add < 0) {
    throw new TypeError("proficiency Effect requires a non-negative integer `add`");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("proficiency Effect's `system`, when present, must be a string");
  }

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = {};
  if (!isPlainObject(actor.growth[system].proficiency)) actor.growth[system].proficiency = {};
  const profMap = actor.growth[system].proficiency;

  const before = Number.isInteger(profMap[effect.id]) ? profMap[effect.id] : 0;
  const definition = findGrowthDefinition(ctx, system, "proficiencies", effect.id);
  const max = definition && Number.isInteger(definition.max) ? definition.max : MAX_SAFE;
  const after = Math.min(max, Math.max(0, before + effect.add));
  const delta = after - before;
  profMap[effect.id] = after;
  if (delta === 0) return; // D-30: add=0 or clamp absorbed the whole change -> no event

  events.push({
    minute: workingState.time.minute,
    type: "proficiency.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { id: effect.id, delta }
  });

  const thresholds = definition && Array.isArray(definition.thresholds) ? definition.thresholds : [];
  const crossed = thresholds
    .filter((t) => isPlainObject(t) && Number.isFinite(t.at) && before < t.at && t.at <= after)
    .sort((a, b) => a.at - b.at);
  if (crossed.length === 0) return;

  const rewardCtx = { ...ctx, actorId: resolved.id };
  crossed.forEach((threshold) => {
    if (Array.isArray(threshold.effects)) {
      applyEffectList(threshold.effects, workingState, events, rewardCtx);
    }
  });
}

function applySkillEffect(effect, workingState, events, ctx) {
  if (typeof effect.skill !== "string") {
    throw new TypeError("skill Effect requires a string `skill`");
  }
  const add = effect.add === undefined ? 1 : effect.add; // §4.2 default add=1
  if (!Number.isInteger(add)) {
    throw new TypeError("skill Effect's `add`, when present, must be an integer");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("skill Effect's `system`, when present, must be a string");
  }

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = {};
  if (!isPlainObject(actor.growth[system].skills)) actor.growth[system].skills = {};

  const before = actor.growth[system].skills[effect.skill] ?? 0;
  const definition = findGrowthDefinition(ctx, system, "skills", effect.skill);
  const maxRank = definition && Number.isInteger(definition.maxRank) ? definition.maxRank : Infinity;
  const after = Math.min(maxRank, Math.max(0, before + add));
  const delta = after - before;
  if (delta === 0) return; // D-30

  if (after === 0) {
    delete actor.growth[system].skills[effect.skill]; // §4.2: 0이면 삭제
  } else {
    actor.growth[system].skills[effect.skill] = after;
  }

  events.push({
    minute: workingState.time.minute,
    type: "skill.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { skill: effect.skill, delta }
  });
}

function applyTraitEffect(effect, workingState, events, ctx) {
  if (typeof effect.trait !== "string") {
    throw new TypeError("trait Effect requires a string `trait`");
  }
  if (effect.remove !== undefined && typeof effect.remove !== "boolean") {
    throw new TypeError("trait Effect's `remove`, when present, must be a boolean");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("trait Effect's `system`, when present, must be a string");
  }
  const remove = effect.remove === true;

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = {};
  if (!isPlainObject(actor.growth[system].traits)) actor.growth[system].traits = {};
  const traits = actor.growth[system].traits;

  if (remove) {
    if (traits[effect.trait] !== true) return; // no-op, D-30
    delete traits[effect.trait];
    events.push({
      minute: workingState.time.minute,
      type: "trait.changed",
      visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
      actorId: resolved.id,
      data: { trait: effect.trait, added: false }
    });
    return;
  }

  const hadBefore = traits[effect.trait] === true;
  const definition = findGrowthDefinition(ctx, system, "traits", effect.trait);
  const exclusive = definition && Array.isArray(definition.exclusive) ? definition.exclusive : [];
  const removedExclusive = [];
  exclusive.forEach((otherId) => {
    if (typeof otherId === "string" && traits[otherId] === true) {
      delete traits[otherId];
      removedExclusive.push(otherId);
    }
  });

  traits[effect.trait] = true;
  if (hadBefore && removedExclusive.length === 0) return; // already had it, nothing exclusive removed -> no-op

  events.push({
    minute: workingState.time.minute,
    type: "trait.changed",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { trait: effect.trait, added: true, removedExclusive }
  });
}

function applyUnlockEffect(effect, workingState, events, ctx) {
  if (typeof effect.id !== "string") {
    throw new TypeError("unlock Effect requires a string `id`");
  }
  if (effect.system !== undefined && typeof effect.system !== "string") {
    throw new TypeError("unlock Effect's `system`, when present, must be a string");
  }

  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const system = resolveGrowthSystemId(effect, ctx);
  if (system === undefined) return; // D-29: skip

  const actor = resolved.actor;
  if (!isPlainObject(actor.growth)) actor.growth = {};
  if (!isPlainObject(actor.growth[system])) actor.growth[system] = {};
  if (!isPlainObject(actor.growth[system].unlocks)) actor.growth[system].unlocks = {};

  if (actor.growth[system].unlocks[effect.id] === true) return; // idempotent (§4.2), D-30

  actor.growth[system].unlocks[effect.id] = true;
  events.push({
    minute: workingState.time.minute,
    type: "unlock.granted",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { id: effect.id }
  });
}

// case is world-level (no subject, §4.1) -- state.cases[case] = {stage, since: minute} (§2.1)
function applyCaseEffect(effect, workingState, events) {
  if (typeof effect.case !== "string") {
    throw new TypeError("case Effect requires a string `case`");
  }
  if (typeof effect.stage !== "string") {
    throw new TypeError("case Effect requires a string `stage`");
  }

  if (!isPlainObject(workingState.cases)) workingState.cases = {};
  const existing = workingState.cases[effect.case];
  if (existing && existing.stage === effect.stage) return; // no-op, D-30

  workingState.cases[effect.case] = { stage: effect.stage, since: workingState.time.minute };
  events.push({
    minute: workingState.time.minute,
    type: "case.updated",
    visibility: "player",
    data: { case: effect.case, stage: effect.stage }
  });
}

function applyOneEffect(effect, workingState, events, ctx) {
  if (!isPlainObject(effect)) {
    throw new TypeError("Effect must be a plain object");
  }
  switch (effect.op) {
    case "flag":
      return applyFlagEffect(effect, workingState, events);
    case "signal":
      return applySignalEffect(effect, workingState, events);
    case "time":
      return applyTimeEffect(effect, workingState, events);
    case "if":
      return applyIfEffect(effect, workingState, events, ctx);
    case "stat":
      return applyStatEffect(effect, workingState, events, ctx);
    case "hp":
      return applyHpEffect(effect, workingState, events, ctx);
    case "money":
      return applyMoneyEffect(effect, workingState, events, ctx);
    case "skill":
      return applySkillEffect(effect, workingState, events, ctx);
    case "trait":
      return applyTraitEffect(effect, workingState, events, ctx);
    case "unlock":
      return applyUnlockEffect(effect, workingState, events, ctx);
    case "case":
      return applyCaseEffect(effect, workingState, events);
    case "item":
      return applyItemEffect(effect, workingState, events, ctx);
    case "relation":
      return applyRelationEffect(effect, workingState, events, ctx);
    case "exp":
      return applyExpEffect(effect, workingState, events, ctx);
    case "proficiency":
      return applyProficiencyEffect(effect, workingState, events, ctx);
    default:
      throw new TypeError("Unknown Effect op: " + JSON.stringify(effect.op));
  }
}

function applyEffectList(effects, workingState, events, ctx) {
  if (!Array.isArray(effects)) {
    throw new TypeError("Effect list must be an array");
  }
  for (const effect of effects) {
    applyOneEffect(effect, workingState, events, ctx);
  }
}

// (effects: Effect[], ctx) -> { state, events }. ctx = { state, data, actorId, targetId }
export function applyEffects(effects, ctx) {
  const workingState = structuredClone(ctx.state);
  const events = [];
  applyEffectList(effects, workingState, events, ctx);
  return { state: workingState, events };
}
