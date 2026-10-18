// V2-Core-154 (D-132): how a person greets me when I come to talk -- the first of `world.greetings[choiceId]` whose
// condition holds for me (what is between us, the hour, what has happened). Roadwarden shows a friendship growing in the
// way people greet and address the player. Read through the engine's own evaluator; pure, so tests read it too.
import { evaluateCondition } from "../core/rules.js";

export function greetingFor(choiceId, state, data) {
  const list = data.world?.greetings?.[choiceId];
  if (!Array.isArray(list)) return null;
  const ctx = { state, data, actorId: state.player.actorId, contextKind: "player" };
  const greeting = list.find((g) => g && evaluateCondition(g.when, ctx));
  return greeting ? data.texts?.[greeting.textId] ?? null : null;
}
