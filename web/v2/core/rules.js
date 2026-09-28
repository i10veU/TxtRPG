// Pure Condition evaluator, Effect applier, and check() per
// docs/v2/architecture/CORE_CONTRACTS.md §3, §3.2a, §4, §5.
//
// check() (V2-Core-11, D-49 -- §5): pure, {result, rng} per the documented
// D-27 exception (state.rng is read but never mutated here; the caller
// assigns the returned rng back onto its own working copy).
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
// Effect (V2-Core-07): relation mode/tag/untag (D-43 resolved -- §7.3/§4.2).
// Effect (V2-Core-08): fact (D-44 resolved -- §4.2/§8.1).
// Effect (V2-Core-09): rumor (D-45/D-14 resolved -- §8.3/§4.2). state.knowledge
// is a top-level actorId-keyed map (like state.relations), not nested under
// actors[id], so subject/`from` only need resolveSubjectId, no state.actors
// record. The Condition-side `rumor` selector (§3.2a) was deferred (D-24)
// at the time -- resolved in V2-Core-15, see below.
// Effect (V2-Core-10): hp's §9 death trigger (D-34 resolved) -- alive=false
// + actor.died on the alive->dead transition, and state.pending set when
// the dying actor is the player. `startCharacter`/succession remain
// action-level (step()) and are out of scope (D-40, engine.js untouched).
// check() (V2-Core-11, D-49): pure evaluation, not an Effect and not an
// action -- it's invoked from within engine.js's step() while resolving a
// `perform`/`choose`/trigger Resolvable (§2.3/§2.5 stage 7).
// Effect (V2-Core-12): choice (D-35 resolved -- §4.2).
// Effect (V2-Core-13): narrate (D-52 resolved -- §4.2). `handler` is
// deliberately not implemented (§4.4 callout) -- no real content needs it
// yet, so no handlers.js registry exists (YAGNI, not a blocker).
// Condition (V2-Core-14, D-54): the §3.2 "shorthand" ops (stat/flag/signal/
// skill/trait/item/relation/fact/day/location/unlock/case/money) -- reuses
// §3.1's common min/max/eq comparator (matchScalarArgs) and the existing
// selector resolvers instead of a new per-op grammar. `rumor` was excluded
// at the time (D-24 plus then-unresolved fields); `handler` is already
// correctly `false` via the default branch (D-38, no registry).
// Condition (V2-Core-15, D-24 resolved): `rumor` selector resolves to the
// entry's `claim` (mirrors `fact`'s own `.value`, §8.2's substantive-content
// field, not a metadata field like confidence/since). The `rumor` shorthand
// Condition op (both the direct-rumor and fact-reverse-lookup forms) is a
// mechanical read of the same already-fixed RumorEntry schema -- no new
// fields invented, so it's implemented alongside the selector.
//
// No host APIs (DOM/window/Date/Math.random/indexedDB/localStorage/fetch/
// performance/crypto). ctx.state/data/effects/condition are never mutated
// by the caller-visible API. `rollDie` (rng.js) is the only host-adjacent
// import, and it is itself pure (§2.7).
//
// Unknown Condition op, wrong shape, or an unresolved selector never
// throws: it evaluates to `false` (§3.1) — this assumes a well-formed `ctx`
// (a broken ctx.state is a programmer error, same as elsewhere in the
// engine). Effect malformed input is the opposite policy: it throws
// (D-28) — except a malformed `if.when`, which safely resolves to `false`
// via evaluateCondition and is treated as a normal false branch.

import { rollDie } from "./rng.js";

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

// `rumor` selector (D-24 resolved, V2-Core-15): resolves to the believed
// `claim`, mirroring `fact`'s own resolver returning `.value` rather than a
// metadata field like `.since` -- claim is Rumor's equivalent substantive
// content (§8.2). Unlike `fact`, no contextKind restriction applies: a
// Rumor is exactly the information an actor is allowed to know/act on
// (§8.4 restricts Fact, not Rumor). Subject/`state.knowledge` lookup reuses
// the same resolveSubjectId-only pattern the rumor Effect already uses
// (§8.3 -- no `state.actors` record required).
function resolveRumorClaim(selector, ctx) {
  if (typeof selector.rumor !== "string") return undefined;
  const subjectId = resolveSubjectId(selector.subject, ctx);
  if (subjectId === undefined) return undefined;
  return ctx.state?.knowledge?.[subjectId]?.[selector.rumor]?.claim;
}

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
  fact: resolveFact,
  rumor: resolveRumorClaim
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

// -- shorthand Condition ops (§3.2, D-54) ------------------------------------
//
// §3.1's common rule ("min/max(inclusive) for numeric comparisons, eq for
// equality, no-arg means an existence/truthy check") is implemented once as
// matchScalarArgs() and reused by every op below instead of inventing a
// per-op comparator grammar. Values are resolved through the same helpers
// the selectors (§3.2a) and Effects already use wherever the field names
// match (resolveGrowthValue/resolveItem/resolveFact); `flag`/`signal` use
// `key` (not the selector's `flag`/`signal` field name) so they read state
// directly instead. `money` reads state directly too -- the selector's
// `{money:true}` marker is a Value-grammar device this op doesn't need.

function matchScalarArgs(value, args, defaultMinWhenBare) {
  if (args.eq !== undefined) return value === args.eq;
  const hasMin = args.min !== undefined;
  const hasMax = args.max !== undefined;
  if (hasMin && !isFiniteNumber(args.min)) return false;
  if (hasMax && !isFiniteNumber(args.max)) return false;
  if (!hasMin && !hasMax) {
    if (defaultMinWhenBare !== undefined) return isFiniteNumber(value) && value >= defaultMinWhenBare;
    return Boolean(value);
  }
  if (!isFiniteNumber(value)) return false;
  if (hasMin && value < args.min) return false;
  if (hasMax && value > args.max) return false;
  return true;
}

// D-54: from defaults to target, to defaults to self (same as the `relation`
// Effect's own D-43/§7.3 convention) -- the opposite of every other op's
// self-default, so it can't reuse resolveSubjectId's own default directly.
function evaluateRelationCondition(condition, ctx) {
  const fromId = resolveSubjectId(condition.from !== undefined ? condition.from : "target", ctx);
  const toId = resolveSubjectId(condition.to !== undefined ? condition.to : "self", ctx);
  if (fromId === undefined || toId === undefined) return false;
  const edge = ctx.state?.relations?.[fromId + ":" + toId];
  const score = edge ? edge.score : 0;
  const mode = edge ? edge.mode : "neutral";
  const tags = edge?.tags ?? [];
  const hasScoreArg = condition.min !== undefined || condition.max !== undefined || condition.eq !== undefined;
  const hasModeArg = condition.mode !== undefined;
  const hasTagArg = condition.tag !== undefined;
  if (!hasScoreArg && !hasModeArg && !hasTagArg) return true; // no constraint given -> vacuously true (D-54)
  if (hasScoreArg && !matchScalarArgs(score, condition)) return false;
  if (hasModeArg && mode !== condition.mode) return false;
  if (hasTagArg && !tags.includes(condition.tag)) return false;
  return true;
}

// D-54: hourFrom/hourTo are both-or-neither; §3.2's own text fixes the
// midnight-wraparound rule, inclusive bounds reuse the min/max convention.
function evaluateDayCondition(condition, ctx) {
  const minute = ctx.state?.time?.minute;
  if (typeof minute !== "number") return false;
  const day = Math.floor(minute / 1440);
  const hour = Math.floor((minute % 1440) / 60);
  const hasDayArg = condition.min !== undefined || condition.max !== undefined || condition.eq !== undefined;
  if (hasDayArg && !matchScalarArgs(day, condition)) return false;
  const hasFrom = condition.hourFrom !== undefined;
  const hasTo = condition.hourTo !== undefined;
  if (hasFrom !== hasTo) return false; // only makes sense as a pair
  if (hasFrom && hasTo) {
    if (!isFiniteNumber(condition.hourFrom) || !isFiniteNumber(condition.hourTo)) return false;
    const inRange =
      condition.hourFrom <= condition.hourTo
        ? hour >= condition.hourFrom && hour <= condition.hourTo
        : hour >= condition.hourFrom || hour <= condition.hourTo; // wraps midnight (§3.2)
    if (!inRange) return false;
  }
  return true;
}

function evaluateLocationCondition(condition, ctx) {
  const subjectId = resolveSubjectId(condition.subject, ctx);
  const locationId = ctx.state?.actors?.[subjectId]?.locationId;
  const hasAt = condition.at !== undefined;
  const hasIn = condition.in !== undefined;
  if (!hasAt && !hasIn) return false;
  if (hasAt && locationId !== condition.at) return false;
  if (hasIn && (!Array.isArray(condition.in) || !condition.in.includes(locationId))) return false;
  return true;
}

function evaluateCaseCondition(condition, ctx) {
  if (typeof condition.case !== "string") return false;
  const stage = ctx.state?.cases?.[condition.case]?.stage;
  const hasStage = condition.stage !== undefined;
  const hasIn = condition.in !== undefined;
  if (!hasStage && !hasIn) return false;
  if (hasStage && stage !== condition.stage) return false;
  if (hasIn && (!Array.isArray(condition.in) || !condition.in.includes(stage))) return false;
  return true;
}

// D-24 resolved (V2-Core-15): both §3.2 forms are mechanical reads of the
// already-fixed RumorEntry schema (§8.2) -- no new fields invented. The
// `rumor` form checks the subject's own entry (existence, plus
// `minConfidence` if given); the `fact` form is a reverse lookup for any
// entry whose `factId` matches (accuracy is never computed, same as the
// rumor Effect -- §8.2's isAccurate stays internal-only).
function evaluateRumorCondition(condition, ctx) {
  const subjectId = resolveSubjectId(condition.subject, ctx);
  const entries = ctx.state?.knowledge?.[subjectId];
  if (!isPlainObject(entries)) return false;

  let entry;
  if (typeof condition.rumor === "string") {
    entry = entries[condition.rumor];
  } else if (typeof condition.fact === "string") {
    entry = Object.keys(entries)
      .sort()
      .map((id) => entries[id])
      .find((e) => isPlainObject(e) && e.factId === condition.fact);
  } else {
    return false;
  }
  if (!isPlainObject(entry)) return false;
  if (condition.minConfidence !== undefined) {
    return matchScalarArgs(entry.confidence, { min: condition.minConfidence });
  }
  return true;
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
    case "stat":
      return matchScalarArgs(resolveGrowthValue("stat", "stats", condition, ctx), condition);
    case "flag":
      return matchScalarArgs(
        typeof condition.key === "string" ? ctx.state?.flags?.[condition.key] : undefined,
        condition
      );
    case "signal":
      return matchScalarArgs(
        typeof condition.key === "string" ? ctx.state?.signals?.[condition.key] ?? 0 : undefined,
        condition
      );
    case "skill":
      return matchScalarArgs(resolveGrowthValue("skill", "skills", condition, ctx), condition, 1);
    case "trait":
      return Boolean(resolveGrowthValue("trait", "traits", condition, ctx));
    case "item":
      return matchScalarArgs(resolveItem(condition, ctx), condition, 1);
    case "relation":
      return evaluateRelationCondition(condition, ctx);
    case "fact":
      return matchScalarArgs(resolveFact(condition, ctx), condition);
    case "day":
      return evaluateDayCondition(condition, ctx);
    case "location":
      return evaluateLocationCondition(condition, ctx);
    case "unlock":
      return Boolean(resolveGrowthValue("id", "unlocks", condition, ctx));
    case "case":
      return evaluateCaseCondition(condition, ctx);
    case "money": {
      const subjectId = resolveSubjectId(condition.subject, ctx);
      return matchScalarArgs(ctx.state?.actors?.[subjectId]?.money, condition);
    }
    case "rumor":
      return evaluateRumorCondition(condition, ctx);
    default:
      return false; // unknown op, or `handler` (deliberately deferred, D-38) (§3.1, pending validateData)
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

  // §9 death trigger (D-34 resolved): current reaching 0 kills the actor,
  // once, exactly on the alive->dead transition (a later hp Effect that
  // keeps current at 0 has delta 0 and returns above, so this never fires
  // twice). This does not stop the rest of the Effect list -- later Effects
  // (even ones targeting this now-dead actor) still apply normally, per
  // §4.1's ordinary sequential application; no new early-exit machinery is
  // added. `startCharacter`/succession (§9) are action-level (step()) and
  // out of scope here (D-40, engine.js untouched).
  if (after === 0 && actor.alive !== false) {
    actor.alive = false;
    events.push({
      minute: workingState.time.minute,
      type: "actor.died",
      visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
      actorId: resolved.id,
      data: {}
    });
    if (isPlayerActor(resolved.id, workingState)) {
      workingState.pending = { kind: "newCharacter" };
    }
  }
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

// move Effect (D-46, §4.2/§2.2): `to` is set directly on the actor, no
// connectivity check here -- that's the calling action's requires (§2.2,
// §11 location schema, D-48). Not in 4.1's "subject ignored" list, so
// subject resolves the same way as every other actor-based Effect (D-29).
function applyMoveEffect(effect, workingState, events, ctx) {
  if (typeof effect.to !== "string") {
    throw new TypeError("move Effect requires a string `to`");
  }
  const resolved = resolveActor(effect.subject, ctx, workingState);
  if (!resolved) return; // D-29: skip

  const actor = resolved.actor;
  if (actor.locationId === effect.to) return; // D-30: already there, no-op

  actor.locationId = effect.to;
  events.push({
    minute: workingState.time.minute,
    type: "actor.moved",
    visibility: isPlayerActor(resolved.id, workingState) ? "player" : "internal",
    actorId: resolved.id,
    data: { to: effect.to }
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

// fact is world-level (no subject, §4.1) -- state.facts[fact] = {value, since: minute} (§8.1, D-44)
function applyFactEffect(effect, workingState, events) {
  if (typeof effect.fact !== "string") {
    throw new TypeError("fact Effect requires a string `fact`");
  }
  if (effect.set === undefined) {
    throw new TypeError("fact Effect requires a `set` value");
  }

  if (!isPlainObject(workingState.facts)) workingState.facts = {};
  const existing = workingState.facts[effect.fact];
  if (existing && JSON.stringify(existing.value) === JSON.stringify(effect.set)) return; // no-op, D-30/D-44

  workingState.facts[effect.fact] = { value: effect.set, since: workingState.time.minute };
  events.push({
    minute: workingState.time.minute,
    type: "fact.changed",
    visibility: "internal",
    data: { fact: effect.fact, value: effect.set }
  });
}

const MAX_CONFIDENCE = 100;
const MIN_CONFIDENCE = 0;
const MAX_RUMOR_SOURCES = 8;

function clampConfidence(value) {
  return Math.min(MAX_CONFIDENCE, Math.max(MIN_CONFIDENCE, value));
}

// rumor Effect (D-45/D-14 resolved, §8.3): {op, rumor, subject?, source?,
// confidence?, from?, observe?}. Mode is chosen by which fields are present
// (`from` -> copy, `observe:true` -> observe, else -> learn from
// data.rumors[rumor]'s fixed claim; `from`+`observe` together is malformed).
// state.knowledge is a top-level actorId-keyed map like state.relations
// (§8.2), not nested under actors[id] like growth/inventory, so subject/
// `from` only need resolveSubjectId (D-29) -- no state.actors record
// required, same as relation's from/to.
function applyRumorEffect(effect, workingState, events, ctx) {
  if (typeof effect.rumor !== "string") {
    throw new TypeError("rumor Effect requires a string `rumor`");
  }
  if (effect.subject !== undefined && typeof effect.subject !== "string") {
    throw new TypeError("rumor Effect's `subject`, when present, must be a string");
  }
  if (effect.from !== undefined && typeof effect.from !== "string") {
    throw new TypeError("rumor Effect's `from`, when present, must be a string");
  }
  if (effect.observe !== undefined && typeof effect.observe !== "boolean") {
    throw new TypeError("rumor Effect's `observe`, when present, must be a boolean");
  }
  if (effect.source !== undefined && typeof effect.source !== "string") {
    throw new TypeError("rumor Effect's `source`, when present, must be a string");
  }
  if (effect.confidence !== undefined && !Number.isInteger(effect.confidence)) {
    throw new TypeError("rumor Effect's `confidence`, when present, must be an integer");
  }
  if (effect.from !== undefined && effect.observe === true) {
    throw new TypeError("rumor Effect cannot combine `from` and `observe` -- they select different modes");
  }

  const subjectId = resolveSubjectId(effect.subject, ctx);
  if (subjectId === undefined) return; // D-29: skip

  let incomingFactId;
  let incomingClaim;
  let incomingConfidence;
  let incomingSource;

  if (effect.from !== undefined) {
    // copy mode
    const fromId = resolveSubjectId(effect.from, ctx);
    if (fromId === undefined) return; // D-29: skip
    const copied = workingState.knowledge?.[fromId]?.[effect.rumor];
    if (!copied) return; // D-29: nothing to copy, skip
    incomingFactId = copied.factId;
    incomingClaim = copied.claim;
    incomingConfidence = clampConfidence(copied.confidence - (ctx.data?.rules?.rumor?.relayLoss ?? 0));
    incomingSource = fromId;
  } else {
    // learn (source) or observe mode -- both need the data.rumors definition
    const definition = ctx.data?.rumors?.[effect.rumor];
    if (!isPlainObject(definition) || typeof definition.factId !== "string") return; // D-29: skip

    if (typeof effect.source !== "string") {
      throw new TypeError("rumor Effect requires a string `source` for the learn/observe forms");
    }
    if (!Number.isInteger(effect.confidence)) {
      throw new TypeError("rumor Effect requires an integer `confidence` for the learn/observe forms");
    }

    incomingFactId = definition.factId;
    incomingSource = effect.source;
    incomingConfidence = clampConfidence(effect.confidence);

    if (effect.observe === true) {
      const fact = workingState.facts?.[incomingFactId];
      if (!fact) return; // D-29: nothing observed yet, skip
      incomingClaim = fact.value;
    } else {
      incomingClaim = definition.claim;
    }
  }

  if (!isPlainObject(workingState.knowledge)) workingState.knowledge = {};
  if (!isPlainObject(workingState.knowledge[subjectId])) workingState.knowledge[subjectId] = {};
  const knowledgeMap = workingState.knowledge[subjectId];
  const existing = knowledgeMap[effect.rumor];
  const day = Math.floor(workingState.time.minute / 1440);
  const visibility = isPlayerActor(subjectId, workingState) ? "player" : "internal";

  if (!existing) {
    knowledgeMap[effect.rumor] = {
      rumorId: effect.rumor,
      factId: incomingFactId,
      claim: incomingClaim,
      source: incomingSource,
      sources: [incomingSource],
      confidence: incomingConfidence,
      confirmations: 1,
      firstSeenDay: day,
      lastSeenDay: day
    };
    events.push({
      minute: workingState.time.minute,
      type: "rumor.learned",
      visibility,
      actorId: subjectId,
      data: { rumor: effect.rumor, factId: incomingFactId, claim: incomingClaim, confidence: incomingConfidence, delta: incomingConfidence }
    });
    return;
  }

  const sameClaim = JSON.stringify(existing.claim) === JSON.stringify(incomingClaim);

  if (!sameClaim) {
    // D-14: higher confidence wins outright and replaces the whole entry; a
    // tie or a lower-confidence conflicting claim keeps the existing belief
    // (deterministic -- no coin flip on a tie).
    if (incomingConfidence <= existing.confidence) return; // no-op
    const before = existing.confidence;
    knowledgeMap[effect.rumor] = {
      rumorId: effect.rumor,
      factId: incomingFactId,
      claim: incomingClaim,
      source: incomingSource,
      sources: [incomingSource],
      confidence: incomingConfidence,
      confirmations: 1,
      firstSeenDay: day,
      lastSeenDay: day
    };
    events.push({
      minute: workingState.time.minute,
      type: "rumor.updated",
      visibility,
      actorId: subjectId,
      data: {
        rumor: effect.rumor,
        factId: incomingFactId,
        claim: incomingClaim,
        confidence: incomingConfidence,
        delta: incomingConfidence - before,
        claimChanged: true
      }
    });
    return;
  }

  // same claim -> reconfirmation (new source vs same source)
  const isNewSource = !existing.sources.includes(incomingSource);
  const gain = isNewSource ? ctx.data?.rules?.rumor?.newSourceGain ?? 0 : ctx.data?.rules?.rumor?.sameSourceGain ?? 0;
  const beforeConfidence = existing.confidence;
  const afterConfidence = clampConfidence(beforeConfidence + gain);
  const confidenceDelta = afterConfidence - beforeConfidence;

  let sources = existing.sources;
  let confirmations = existing.confirmations;
  if (isNewSource) {
    if (sources.length < MAX_RUMOR_SOURCES) sources = [...sources, incomingSource].sort();
    confirmations += 1;
  }

  const dayChanged = existing.lastSeenDay !== day;
  if (confidenceDelta === 0 && !dayChanged && sources === existing.sources && confirmations === existing.confirmations) {
    return; // D-30: nothing actually changed -> no-op
  }

  knowledgeMap[effect.rumor] = { ...existing, confidence: afterConfidence, sources, confirmations, lastSeenDay: day };

  events.push({
    minute: workingState.time.minute,
    type: "rumor.updated",
    visibility,
    actorId: subjectId,
    data: { rumor: effect.rumor, factId: existing.factId, claim: existing.claim, confidence: afterConfidence, delta: confidenceDelta }
  });
}

// narrate Effect (D-52 resolved, §4.2): {op, textId}. World-level, no
// subject (§4.1 exemption list). Never touches state at all -- it doesn't
// even look up data.texts[textId] (the UI/storage layer resolves textId to
// content itself, per the "event references textId only" rule). Because
// there is no stored value to compare, D-30's "no change -> no event" rule
// has nothing to apply to: narrate always emits, every time (like
// time.advanced on every wait, not like a state-assignment op).
function applyNarrateEffect(effect, workingState, events) {
  if (typeof effect.textId !== "string") {
    throw new TypeError("narrate Effect requires a string `textId`");
  }
  events.push({
    minute: workingState.time.minute,
    type: "narration",
    visibility: "player",
    data: { textId: effect.textId }
  });
}

// choice Effect (D-35 resolved, §4.2): {op, choice, sourceId?}. World-level,
// no subject (§4.1 exemption list). `sourceId` is an opaque, content-author
// -supplied label (same idea as rumor's `source`) -- the engine never
// infers it. A later choice/newCharacter pending in the same Effect list
// simply overwrites this one (D-30/D-35: ordinary sequential-apply "last
// write wins", not a new priority mechanism).
function applyChoiceEffect(effect, workingState, events) {
  if (typeof effect.choice !== "string") {
    throw new TypeError("choice Effect requires a string `choice`");
  }
  if (effect.sourceId !== undefined && typeof effect.sourceId !== "string") {
    throw new TypeError("choice Effect's `sourceId`, when present, must be a string");
  }

  const pending = { kind: "choice", choiceId: effect.choice };
  if (effect.sourceId !== undefined) pending.sourceId = effect.sourceId;

  if (JSON.stringify(workingState.pending ?? null) === JSON.stringify(pending)) return; // D-30: no-op

  workingState.pending = pending;
  const data = { choiceId: effect.choice };
  if (effect.sourceId !== undefined) data.sourceId = effect.sourceId;
  events.push({
    minute: workingState.time.minute,
    type: "choice.offered",
    visibility: "player",
    data
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
    case "fact":
      return applyFactEffect(effect, workingState, events);
    case "rumor":
      return applyRumorEffect(effect, workingState, events, ctx);
    case "move":
      return applyMoveEffect(effect, workingState, events, ctx);
    case "choice":
      return applyChoiceEffect(effect, workingState, events);
    case "narrate":
      return applyNarrateEffect(effect, workingState, events);
    default:
      throw new TypeError("Unknown Effect op: " + JSON.stringify(effect.op));
  }
}

// Exported for engine.js (V2-Core-11, D-47/D-48): step() builds its own
// single working copy (§2.5 stage 6) and must apply Resolvable
// effects/outcomes/succession Effects onto that SAME copy, not a freshly
// re-cloned one -- so it reuses this lower-level function directly instead
// of the top-level applyEffects() (which would clone again). This is the
// existing implementation, reused as-is (D-26/D-30 unchanged), not a new
// bypass path.
export function applyEffectList(effects, workingState, events, ctx) {
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

// -- check() (§5, V2-Core-11, D-49) ------------------------------------------
//
// D-49: `data.rules.check`'s per-field defaults are §5.3's own stated
// "제안 기본값" (proposed defaults), adopted literally as the engine's
// fallback when a field is absent from data -- not invented. D-09
// (maxTotalModifier) stays unresolved: its stated default is "no cap", so
// no capping logic is implemented (there's nothing decided to implement).

const DEFAULT_CHECK_DICE = { count: 2, sides: 10 };
const DEFAULT_CHECK_TIERS = { great: 6, success: 0, partial: -3 };
const DEFAULT_CHECK_DIFFICULTIES = { easy: 8, normal: 11, hard: 14, extreme: 17 };
const DEFAULT_STAT_MODIFIER = { pivot: 10, step: 2 };
const DEFAULT_RELATION_MODIFIER = { step: 25 };

function checkRules(ctx) {
  const configured = ctx.data?.rules?.check;
  return {
    dice: isPlainObject(configured?.dice) ? configured.dice : DEFAULT_CHECK_DICE,
    tiers: isPlainObject(configured?.tiers) ? configured.tiers : DEFAULT_CHECK_TIERS,
    difficulties: isPlainObject(configured?.difficulties) ? configured.difficulties : DEFAULT_CHECK_DIFFICULTIES,
    statModifier: isPlainObject(configured?.statModifier) ? configured.statModifier : DEFAULT_STAT_MODIFIER,
    relationModifier: isPlainObject(configured?.relationModifier) ? configured.relationModifier : DEFAULT_RELATION_MODIFIER,
    retryPenalty: Number.isInteger(configured?.retryPenalty) ? configured.retryPenalty : 0
  };
}

function statModifierValue(value, config) {
  const pivot = Number.isInteger(config.pivot) ? config.pivot : DEFAULT_STAT_MODIFIER.pivot;
  const step = Number.isInteger(config.step) && config.step !== 0 ? config.step : DEFAULT_STAT_MODIFIER.step;
  return Math.floor((value - pivot) / step);
}

// §5.4: "item: 보유 아이템 정의 중 modifiers[].tags가 spec.tags와 겹치는 항목의 value 합" --
// trait uses the exact same {tags,value} shape ("trait: item과 같은 방식", §6.2 already
// names it for trait; item's is the same structure reused, D-49).
function sumMatchingModifiers(modifierList, tags) {
  if (!Array.isArray(modifierList)) return 0;
  return modifierList.reduce((sum, m) => {
    if (!isPlainObject(m) || !Array.isArray(m.tags) || !Number.isInteger(m.value)) return sum;
    return m.tags.some((t) => tags.includes(t)) ? sum + m.value : sum;
  }, 0);
}

// §5.4 fixed order: stat -> skill -> proficiency -> item -> trait -> relation -> situational.
// Zero-value modifiers are omitted from the breakdown (§5.4).
function computeCheckModifiers(spec, ctx, system, rules) {
  const modifiers = [];
  const actor = ctx.state.actors?.[ctx.actorId];
  const growth = system !== undefined ? actor?.growth?.[system] : undefined;

  if (typeof spec.stat === "string") {
    const value = growth?.stats?.[spec.stat] ?? 0;
    const m = statModifierValue(value, rules.statModifier);
    if (m !== 0) modifiers.push({ source: "stat:" + spec.stat, value: m });
  }

  if (typeof spec.skill === "string") {
    const rank = growth?.skills?.[spec.skill] ?? 0;
    const definition = system !== undefined ? findGrowthDefinition(ctx, system, "skills", spec.skill) : undefined;
    const perRank = definition && Number.isInteger(definition.checkBonusPerRank) ? definition.checkBonusPerRank : 0;
    const m = rank * perRank;
    if (m !== 0) modifiers.push({ source: "skill:" + spec.skill, value: m });
  }

  if (typeof spec.proficiency === "string") {
    const points = growth?.proficiency?.[spec.proficiency] ?? 0;
    const definition = system !== undefined ? findGrowthDefinition(ctx, system, "proficiencies", spec.proficiency) : undefined;
    const step = definition && Number.isInteger(definition.checkStep) && definition.checkStep !== 0 ? definition.checkStep : undefined;
    const m = step !== undefined ? Math.floor(points / step) : 0;
    if (m !== 0) modifiers.push({ source: "proficiency:" + spec.proficiency, value: m });
  }

  const tags = Array.isArray(spec.tags) ? spec.tags : [];
  if (tags.length > 0) {
    // item: held (D-10 "보유 기준") -- inventory[itemId] > 0, sorted for determinism (§2.6).
    const inventory = actor?.inventory ?? {};
    Object.keys(inventory)
      .sort()
      .forEach((itemId) => {
        if (!(inventory[itemId] > 0)) return;
        const m = sumMatchingModifiers(ctx.data?.items?.[itemId]?.modifiers, tags);
        if (m !== 0) modifiers.push({ source: "item:" + itemId, value: m });
      });

    // trait: same matching rule as item, over currently-held traits.
    const traits = growth?.traits ?? {};
    Object.keys(traits)
      .sort()
      .forEach((traitId) => {
        if (traits[traitId] !== true) return;
        const definition = system !== undefined ? findGrowthDefinition(ctx, system, "traits", traitId) : undefined;
        const m = sumMatchingModifiers(definition?.modifiers, tags);
        if (m !== 0) modifiers.push({ source: "trait:" + traitId, value: m });
      });
  }

  if (spec.useRelation === true && ctx.targetId !== undefined) {
    const edgeKey = ctx.targetId + ":" + ctx.actorId; // target -> self (§5.4)
    const edge = ctx.state.relations?.[edgeKey];
    const score = edge && Number.isInteger(edge.score) ? edge.score : 0;
    const step = Number.isInteger(rules.relationModifier.step) && rules.relationModifier.step !== 0 ? rules.relationModifier.step : DEFAULT_RELATION_MODIFIER.step;
    const m = Math.floor(score / step);
    if (m !== 0) modifiers.push({ source: "relation", value: m });
  }

  if (Array.isArray(spec.situational)) {
    spec.situational.forEach((entry) => {
      if (isPlainObject(entry) && typeof entry.source === "string" && Number.isInteger(entry.value) && entry.value !== 0) {
        modifiers.push({ source: entry.source, value: entry.value });
      }
    });
  }

  return modifiers;
}

// §5.5: integer as-is, name looked up in `difficulties`, or opposed
// (base + the opposed subject's stat/skill modifier only -- not the full
// 7-source list, per §5.5's literal wording; the opposed side is never
// rolled, §5.5).
function resolveDifficulty(spec, ctx, system, rules) {
  const d = spec.difficulty;
  if (Number.isInteger(d)) return d;
  if (typeof d === "string") {
    const named = rules.difficulties[d];
    if (!Number.isInteger(named)) {
      throw new TypeError("check spec's `difficulty` name is not defined in data.rules.check.difficulties: " + JSON.stringify(d));
    }
    return named;
  }
  if (isPlainObject(d) && isPlainObject(d.opposed)) {
    if (!Number.isInteger(d.base)) {
      throw new TypeError("check spec's opposed `difficulty` requires an integer `base`");
    }
    const opposedId = resolveSubjectId(d.opposed.subject, ctx);
    let opposedModifier = 0;
    if (opposedId !== undefined) {
      const opposedGrowth = system !== undefined ? ctx.state.actors?.[opposedId]?.growth?.[system] : undefined;
      if (typeof d.opposed.stat === "string") {
        opposedModifier += statModifierValue(opposedGrowth?.stats?.[d.opposed.stat] ?? 0, rules.statModifier);
      }
      if (typeof d.opposed.skill === "string") {
        const rank = opposedGrowth?.skills?.[d.opposed.skill] ?? 0;
        const definition = system !== undefined ? findGrowthDefinition(ctx, system, "skills", d.opposed.skill) : undefined;
        const perRank = definition && Number.isInteger(definition.checkBonusPerRank) ? definition.checkBonusPerRank : 0;
        opposedModifier += rank * perRank;
      }
    }
    return d.base + opposedModifier;
  }
  throw new TypeError("check spec requires a valid `difficulty` (integer, known name, or opposed object)");
}

// check(spec, ctx) -> { result, rng }. ctx = { state, data, actorId, targetId? }.
// Pure: reads ctx.state.rng but never mutates ctx.state (D-27 exception,
// documented in §5.2 -- the caller assigns the returned `rng` onto its own
// working copy). attemptKey's `state.attempts[key] += 1` is NOT done here
// (that is a state mutation) -- the caller does it after this call.
export function check(spec, ctx) {
  if (!isPlainObject(spec)) {
    throw new TypeError("check spec must be a plain object");
  }
  const system = typeof ctx.data?.world?.growthSystemId === "string" ? ctx.data.world.growthSystemId : undefined;
  const rules = checkRules(ctx);

  const attempts = spec.attemptKey !== undefined ? ctx.state.attempts?.[spec.attemptKey] ?? 0 : 0;
  const difficulty = resolveDifficulty(spec, ctx, system, rules) + attempts * rules.retryPenalty;

  const diceCount = Number.isInteger(rules.dice.count) ? rules.dice.count : DEFAULT_CHECK_DICE.count;
  const diceSides = Number.isInteger(rules.dice.sides) ? rules.dice.sides : DEFAULT_CHECK_DICE.sides;

  let rng = ctx.state.rng;
  const dice = [];
  for (let i = 0; i < diceCount; i += 1) {
    const rolled = rollDie(rng, diceSides);
    dice.push(rolled.value);
    rng = rolled.rng;
  }
  const roll = dice.reduce((sum, value) => sum + value, 0);

  const modifiers = computeCheckModifiers(spec, ctx, system, rules);
  const total = roll + modifiers.reduce((sum, m) => sum + m.value, 0);
  const margin = total - difficulty;

  const tiers = rules.tiers;
  let tier = "fail";
  if (margin >= tiers.great) tier = "great";
  else if (margin >= tiers.success) tier = "success";
  else if (margin >= tiers.partial) tier = "partial";

  return { result: { tier, dice, roll, modifiers, total, difficulty, margin }, rng };
}
