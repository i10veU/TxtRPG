// V2-Core-01 minimal engine per docs/v2/architecture/CORE_CONTRACTS.md §2.0.
// Scope: only the `wait` action and invalid-action rejection. No Condition,
// Effect, check(), actors, facts, or any other system beyond §2.0 exists yet.
// Do not add Date/Date.now, Math.random, DOM, window, or any host API here.

import { hashString } from "./rng.js";

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

// { worldSeed, data } -> { state, events }. `data` is accepted for API-shape
// stability with the full contract (§1.4) but unused until a data pack (§11)
// exists.
export function createInitialState({ worldSeed }) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    worldSeed: String(worldSeed),
    rng: { seed: hashString(String(worldSeed)), cursor: 0 },
    time: { minute: 0 }
  };
  return { state, events: [] };
}

// (state, action, data) -> { state, events }. `data` is accepted per the
// step() contract (§1.4) but unused: no Resolvable/Condition lookups exist
// in V2-Core-01.
export function step(state, action, data) {
  if (state.schemaVersion !== SCHEMA_VERSION) {
    throw new Error("TxtRPG V2 engine: unsupported schemaVersion " + state.schemaVersion);
  }

  if (!isValidWaitAction(action)) {
    return {
      state,
      events: [
        {
          minute: state.time.minute,
          type: "action.rejected",
          visibility: "player",
          data: { code: "invalid_action" }
        }
      ]
    };
  }

  const nextState = structuredClone(state);
  nextState.time.minute += action.minutes;

  return {
    state: nextState,
    events: [
      {
        minute: nextState.time.minute,
        type: "time.advanced",
        visibility: "player",
        data: { minutes: action.minutes }
      }
    ]
  };
}
