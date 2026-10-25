// J3: a high-confidence account is still hearsay until this life observes it.
// Pure comparison of player-visible knowledge; no state, world truth or RNG.
function firsthand(entry) {
  if (!entry || typeof entry !== "object") return false;
  const sources = Array.isArray(entry.sources) ? entry.sources : [entry.source];
  return sources.some((source) => typeof source === "string" && source.startsWith("obs_loc_"));
}

// Return a news update only when the player's evidence actually changes.
// A later field observation is confirmation even if confidence was already high;
// rising confidence in second-hand testimony is *not* field verification.
export function knowledgeNewsChange(previous, current) {
  if (!previous || !current) return null;
  // An observation of a different rumor, fact or claim is not evidence for
  // the earlier account. Legacy entries can omit identity fields: compare
  // only fields present on both sides, without consulting hidden world state.
  for (const key of ["rumorId", "factId", "claim"]) {
    if (typeof previous[key] === "string" && typeof current[key] === "string" &&
        previous[key] !== current[key]) return null;
  }
  const wasObserved = firsthand(previous);
  const nowObserved = firsthand(current);
  if (!wasObserved && nowObserved) return { kind: "confirmed", note: "직접 확인함" };
  if (!nowObserved && Number.isFinite(previous.confidence) && Number.isFinite(current.confidence) &&
      previous.confidence < 90 && current.confidence >= 90) {
    return { kind: "learned", note: "확신 높은 전언" };
  }
  return null;
}
