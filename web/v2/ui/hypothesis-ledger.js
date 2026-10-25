// J3 RC1: a hypothesis is a player's choice, never an oracle over hidden world facts.
// Only view().knowledge may enter this projection. No state, RNG, flags or Save access.
const RUINS = Object.freeze({
  rumorId: "rum_ruins_secret",
  observedAt: "obs_loc_ruins",
  locationId: "loc_ruins",
  actionId: "act_investigate_ruins",
  question: "원로가 말한 폐허에는 정말 무리가 숨어 있을까?",
  options: Object.freeze([
    Object.freeze({ id: "hideout", label: "폐허는 무리의 은신처일 것이다." }),
    Object.freeze({ id: "empty", label: "폐허에는 아무도 없을 것이다." })
  ])
});

export function hypothesisLedger(knowledge, data, minute) {
  const known = knowledge?.[RUINS.rumorId];
  const definition = data?.rumors?.[RUINS.rumorId];
  if (!known || known.rumorId !== RUINS.rumorId || !definition ||
      known.factId !== definition.factId || known.claim !== definition.claim) return null;
  // The UI's public clock bounds the character's own report dates. Future
  // observations and reports not yet received are not usable evidence.
  // Legacy callers without a clock retain the original pure projection.
  if (Number.isFinite(minute)) {
    const today = Math.floor(minute / 1440);
    if ((Number.isInteger(known.aboutDay) && known.aboutDay > today) ||
        (Number.isInteger(known.lastSeenDay) && known.lastSeenDay > today)) return null;
  }
  const sources = Array.isArray(known.sources) ? known.sources.filter((s) => typeof s === "string") :
    typeof known.source === "string" ? [known.source] : [];
  const observed = sources.includes(RUINS.observedAt);
  return {
    question: RUINS.question,
    rumorId: RUINS.rumorId,
    sources,
    confidence: Number.isFinite(known.confidence) ? known.confidence : null,
    lastSeenDay: Number.isInteger(known.lastSeenDay) ? known.lastSeenDay : null,
    aboutDay: Number.isInteger(known.aboutDay) ? known.aboutDay :
      Number.isInteger(known.lastSeenDay) ? known.lastSeenDay : null,
    observed,
    locationId: RUINS.locationId,
    actionId: RUINS.actionId,
    options: RUINS.options
  };
}
