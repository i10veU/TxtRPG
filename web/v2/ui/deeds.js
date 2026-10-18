// V2-Core-156 (D-134): what a life is remembered for. `world.deeds` names what can be done; a deed is this life's when it
// came true during it -- the deeds already true when the life began (its baseline: a predecessor's, the world's) are not.
// Read through the engine's own evaluator, from the player's side; pure.
import { evaluateCondition } from "../core/rules.js";

export function deedsTrue(state, data) {
  const ctx = { state, data, actorId: state.player.actorId, contextKind: "player" };
  return (data.world?.deeds ?? []).filter((d) => d && evaluateCondition(d.when, ctx)).map((d) => d.id);
}

export function lifeDeeds(state, data, baseline) {
  const before = new Set(baseline ?? []);
  return deedsTrue(state, data).filter((id) => !before.has(id));
}

// the ending the character has just come to know (a rumour of `world.endings` it did not know before), or null
export function endingLearned(beforeKnowledge, afterKnowledge, data) {
  const ending = (data.world?.endings ?? []).find((e) => afterKnowledge?.[e.rumor] && !beforeKnowledge?.[e.rumor]);
  return ending ?? null;
}
