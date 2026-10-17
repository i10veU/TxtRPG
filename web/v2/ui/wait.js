// V2-Core-144 (roadmap M8, D-122, Issue #361): waiting a day the way the wait button waits -- the same 30-minute
// `wait`, up to 48 of them, stopping after the half hour in which something happened to the character or around them.
// The world is exactly what as many clicks would have made: the spring's and the ruins' hazards (30-minute cooldowns,
// no catch-up) strike every half hour as before, which a single 1440-minute wait would not do.
// No DOM: ui/app.js calls it, and tests/v2/ui-wait-day.test.js runs it in Node against the real pack.

import { step } from "../core/engine.js";

export const WAIT_MINUTES = 30;
export const WAITS_IN_A_DAY = 48;

const hpOf = (state) => state.actors?.[state.player?.actorId]?.hp?.current;

// -> { state, events, minutes, stop }: stop is null after a whole day, otherwise why it stopped --
//    "rejected" (the wait itself was refused; nothing changed), "pending" (a choice or a new character waits),
//    "hurt" (the character lost HP in that half hour), "news" (the world told the player something)
export function waitDay(state, data) {
  let current = state;
  const events = [];
  for (let i = 0; i < WAITS_IN_A_DAY; i += 1) {
    const hpBefore = hpOf(current);
    const result = step(current, { type: "wait", minutes: WAIT_MINUTES }, data);
    events.push(...result.events);
    if (result.events.some((e) => e.type === "action.rejected")) return { state: current, events, minutes: i * WAIT_MINUTES, stop: "rejected" };
    current = result.state;
    const minutes = (i + 1) * WAIT_MINUTES;
    if (current.pending) return { state: current, events, minutes, stop: "pending" };
    if (hpOf(current) < hpBefore) return { state: current, events, minutes, stop: "hurt" };
    if (result.events.some((e) => e.visibility === "player" && e.type === "narration")) return { state: current, events, minutes, stop: "news" };
  }
  return { state: current, events, minutes: WAITS_IN_A_DAY * WAIT_MINUTES, stop: null };
}
