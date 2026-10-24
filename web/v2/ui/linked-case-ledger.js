// J3 follow-up: connect two *heard* Chapter 1 clues to a second, testable guess.
// Pure projection: only view().knowledge and the pack's rumor definitions enter.
// Never consult world facts, cases, event history, RNG or another life's chronicle.
const REQUIRED = Object.freeze(["rum_ruins_secret", "rum_well_source"]);
const OPTIONS = Object.freeze([
  Object.freeze({ id: "linked", label: "폐허의 무리가 샘을 더럽혔을 것이다." }),
  Object.freeze({ id: "separate", label: "폐허와 샘은 별개의 사건일 것이다." })
]);
const DECISION_ACTIONS = Object.freeze({
  linked: "act_request_spring_watch",
  separate: "act_request_spring_inquiry"
});

function matchingKnowledge(knowledge, data, rumorId) {
  const known = knowledge?.[rumorId];
  const definition = data?.rumors?.[rumorId];
  if (!known || !definition || known.rumorId !== rumorId ||
      known.factId !== definition.factId || known.claim !== definition.claim) return null;
  return known;
}

function firstHand(known, source) {
  return Array.isArray(known?.sources) && known.sources.includes(source) ||
    known?.source === source;
}

export function linkedCaseLedger(knowledge, data) {
  // Do not even reveal the existence of this deduction until *this character*
  // has both stories. Knowing the pack's definition is not player knowledge.
  if (!REQUIRED.every((id) => matchingKnowledge(knowledge, data, id))) return null;

  const spring = matchingKnowledge(knowledge, data, "rum_spring_cause");
  const arrows = matchingKnowledge(knowledge, data, "rum_spring_bandits");
  const springSeen = firstHand(spring, "obs_loc_forest_spring");
  const observed = firstHand(arrows, "obs_loc_forest_spring");
  return {
    question: "폐허의 무리와 우물의 오염은 같은 사건일까?",
    clues: REQUIRED.map((rumorId) => {
      const known = knowledge[rumorId];
      return {
        rumorId,
        sources: Array.isArray(known.sources)
          ? known.sources.filter((s) => typeof s === "string")
          : typeof known.source === "string" ? [known.source] : [],
        confidence: Number.isFinite(known.confidence) ? known.confidence : null,
        aboutDay: Number.isInteger(known.aboutDay) ? known.aboutDay : null
      };
    }),
    springSeen: Boolean(springSeen),
    observed: Boolean(observed),
    actionId: "act_search_spring",
    locationId: "loc_forest_spring",
    options: OPTIONS
  };
}

// Only an actual action, never a transient guess, becomes persistent. Read the
// current teller's visible relation edge; world flags and predecessor edges are
// intentionally not an input to the notebook.
export function linkedCaseDecision(ledger, playerView) {
  const actorId = playerView?.actor?.id;
  if (!ledger || typeof actorId !== "string") return null;
  const tags = playerView?.relations?.[`npc_elder:${actorId}`]?.tags;
  if (!Array.isArray(tags)) return null;
  if (tags.includes("spring_watch_requested")) return "linked";
  if (tags.includes("spring_inquiry_requested")) return "separate";
  return null;
}

export function linkedCaseDecisionAction(ledger, playerView, selection) {
  if (!ledger || ledger.observed || linkedCaseDecision(ledger, playerView) ||
      !Object.hasOwn(DECISION_ACTIONS, selection) || playerView?.pending ||
      playerView?.actor?.locationId !== "loc_village") return null;
  const actionId = DECISION_ACTIONS[selection];
  return Array.isArray(playerView?.actions) &&
    playerView.actions.some((action) => action.actionId === actionId && action.available === true)
    ? actionId : null;
}

// A report is a *player-visible act* recorded on this teller's relationship
// edge. The world flag is intentionally not consulted: successors must not
// learn what a predecessor did from omniscient world state.
export function linkedCaseReported(ledger, playerView) {
  const actorId = playerView?.actor?.id;
  if (!ledger?.observed || typeof actorId !== "string") return false;
  const tags = playerView?.relations?.[`npc_elder:${actorId}`]?.tags;
  return Array.isArray(tags) && tags.includes("spring_arrows_reported");
}

// A verified clue should lead to a real existing dialogue, not a dead-end
// instruction. The engine still decides which elder dialogue options are legal.
export function linkedCaseElderAction(ledger, playerView) {
  if (!ledger?.observed || linkedCaseReported(ledger, playerView) || playerView?.pending || playerView?.actor?.locationId !== "loc_village") return null;
  return Array.isArray(playerView?.actions) &&
    playerView.actions.some((action) => action.actionId === "act_talk_elder" && action.available === true)
    ? "act_talk_elder" : null;
}
