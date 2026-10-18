// V2-Core-151 (J3, the voice): what the character means to do now. The pack lists goals in `world.goals`, latest stage
// first; each track shows the first goal whose `when` holds for the player. Conditions read what the character knows and
// has done, through the engine's own evaluator -- not a second one. Pure: the UI renders the result, tests read it.
import { evaluateCondition } from "../core/rules.js";

export function currentGoals(state, data) {
  const ctx = { state, data, actorId: state.player.actorId, contextKind: "player" };
  const shown = new Map();
  for (const goal of data.world?.goals ?? []) {
    if (!shown.has(goal.track) && evaluateCondition(goal.when, ctx)) shown.set(goal.track, goal);
  }
  return [...shown.values()];
}
