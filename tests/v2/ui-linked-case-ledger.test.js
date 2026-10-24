// J3: combining two independently learned rumors must not become a hidden-truth oracle.
import assert from "node:assert/strict";
import { linkedCaseLedger, linkedCaseElderAction, linkedCaseReported, linkedCaseSupport, linkedCasePatrolAction } from "../../web/v2/ui/linked-case-ledger.js";
import { worldData } from "../../web/v2/data/world.js";

const known = (id, source = "npc_elder") => ({
  rumorId: id, factId: worldData.rumors[id].factId, claim: worldData.rumors[id].claim,
  source, sources: [source], confidence: 60, firstSeenDay: 0, lastSeenDay: 0, aboutDay: 0
});
const ruins = known("rum_ruins_secret");
const well = known("rum_well_source", "npc_herbalist");
assert.equal(linkedCaseLedger({}, worldData), null);
assert.equal(linkedCaseLedger({ rum_ruins_secret: ruins }, worldData), null);
assert.equal(linkedCaseLedger({ rum_well_source: well }, worldData), null);
assert.equal(linkedCaseLedger({
  rum_ruins_secret: ruins, rum_well_source: { ...well, claim: "invented" }
}, worldData), null, "untrusted claims cannot unlock a second case");

const knowledge = { rum_ruins_secret: ruins, rum_well_source: well };
const before = JSON.stringify(knowledge);
const first = linkedCaseLedger(knowledge, worldData);
assert.deepEqual(first.clues.map((clue) => clue.rumorId), ["rum_ruins_secret", "rum_well_source"]);
assert.equal(first.actionId, "act_search_spring");
assert.equal(first.locationId, "loc_forest_spring");
assert.equal(first.options.length, 2);
assert.equal(first.springSeen, false);
assert.equal(first.observed, false);
assert.equal(JSON.stringify(knowledge), before, "projection is read-only");

const spring = known("rum_spring_cause", "obs_loc_forest_spring");
const springOnly = linkedCaseLedger({ ...knowledge, rum_spring_cause: spring }, worldData);
assert.equal(springOnly.springSeen, true, "directly seeing the carcass is a partial clue");
assert.equal(springOnly.observed, false, "a carcass alone does not prove the bandit link");

const arrows = known("rum_spring_bandits", "obs_loc_forest_spring");
const confirmed = linkedCaseLedger({ ...knowledge, rum_spring_cause: spring, rum_spring_bandits: arrows }, worldData);
assert.equal(confirmed.observed, true, "only first-hand arrow evidence confirms the link");
assert.equal(linkedCaseLedger({ ...knowledge, rum_spring_bandits: known("rum_spring_bandits", "npc_herbalist") }, worldData).observed, false,
  "hearsay is not field confirmation");
assert.equal(linkedCaseLedger({
  ...knowledge, rum_spring_bandits: { ...arrows, claim: "spirits" }
}, worldData).observed, false, "forged claims are rejected");

const hidden = { ...knowledge };
const snapshot = JSON.stringify(linkedCaseLedger(hidden, worldData));
hidden.facts = { fact_spring_fouler: "bandits" };
hidden.rng = { cursor: 1000 };
hidden.events = [{ type: "future.raid" }];
hidden.chronicle = [{ oldLifeKnows: "rum_spring_bandits" }];
assert.equal(JSON.stringify(linkedCaseLedger(hidden, worldData)), snapshot,
  "hidden truth, RNG, future events and past lives must not affect the ledger");

// A verified deduction can now open the *existing* elder conversation from
// the ledger itself. Availability comes exclusively from the player View.
const readyView = { actor: { id: "player_1", locationId: "loc_village" }, pending: null,
  relations: { "npc_elder:player_1": { tags: [] } },
  actions: [{ actionId: "act_talk_elder", available: true }] };
assert.equal(linkedCaseElderAction(first, readyView), null, "unverified hearsay cannot open the shortcut");
assert.equal(linkedCaseElderAction(confirmed, readyView), "act_talk_elder", "verified clue enables elder dialogue");
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, actor: { locationId: "loc_forest_spring" } }), null,
  "no remote elder dialogue");
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, pending: { kind: "choice" } }), null,
  "no shortcut while a choice is pending");
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, actions: [{ actionId: "act_talk_elder", available: false }] }), null,
  "the View, not the ledger, controls availability");
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, actions: [] }), null);
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, hiddenFacts: { spring_bandits_told: true } }),
  "act_talk_elder", "hidden world state cannot alter the shortcut");
const reported = { ...readyView, relations: { "npc_elder:player_1": { tags: ["spring_arrows_reported"] } } };
assert.equal(linkedCaseReported(confirmed, readyView), false);
assert.equal(linkedCaseReported(confirmed, reported), true, "the teller's visible relation records the report");
assert.equal(linkedCaseElderAction(confirmed, reported), null, "a completed report cannot offer a stale shortcut");
assert.equal(linkedCaseReported(first, reported), false, "a report tag alone cannot reveal unknown evidence");
assert.equal(linkedCaseReported(confirmed, { ...readyView, relations: { "npc_elder:player_2": { tags: ["spring_arrows_reported"] } } }), false,
  "another character's report is not this life’s knowledge");
assert.equal(linkedCaseElderAction(confirmed, { ...readyView, relations: {}, hiddenFacts: { spring_bandits_told: true } }),
  "act_talk_elder", "a hidden world flag must never disclose a predecessor's report");

// The notebook must not invent a patrol from the world's hidden state.
// The existing action is offered only after *this life* reports first-hand
// evidence and the engine's PlayerView marks it available.
const patrolReady = { ...reported, actions: [{ actionId: "act_help_mark_spring_route", available: true }] };
const patrolSnapshot = JSON.stringify(patrolReady);
assert.equal(linkedCasePatrolAction(confirmed, patrolReady), "act_help_mark_spring_route");
assert.equal(JSON.stringify(patrolReady), patrolSnapshot, "patrol projection does not mutate PlayerView");
assert.equal(linkedCasePatrolAction(first, patrolReady), null, "heard clues alone cannot unlock patrol");
assert.equal(linkedCasePatrolAction(confirmed, { ...readyView, actions: patrolReady.actions }), null,
  "field evidence without a personal report does not offer the action");
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, pending: { kind: "choice" } }), null);
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, actor: { ...patrolReady.actor, locationId: "loc_market" } }), null);
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, actions: [] }), null);
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, actions: [{ actionId: "act_help_mark_spring_route", available: false }] }), null,
  "completed work or insufficient stamina is enforced by the engine");
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, actor: { ...patrolReady.actor, id: "player_2" } }), null,
  "a successor cannot use the previous life’s report");
assert.equal(linkedCasePatrolAction(confirmed, { ...patrolReady, hiddenFacts: { spring_patrol_deployed: true }, signals: { spring_patrol_progress: 2 } }),
  "act_help_mark_spring_route", "hidden world state cannot alter a view-authorized action");

// An actual village decision, not a transient guess or hidden world flag,
// offers a route to the existing NPC support conversation.
assert.equal(linkedCaseSupport(first, readyView), null, "rumors alone do not unlock help");
const watchView = { ...readyView,
  actor: { ...readyView.actor, inventory: {} },
  relations: { "npc_elder:player_1": { tags: ["spring_watch_requested"] } } };
const watchBefore = JSON.stringify(watchView);
const watchSupport = linkedCaseSupport(first, watchView);
assert.deepEqual(watchSupport, {
  npcName: "원로", itemName: "등불", locationName: "마을",
  received: false, prepared: false, atLocation: true, actionId: "act_talk_elder"
});
assert.equal(JSON.stringify(watchView), watchBefore, "support projection never mutates the View");
assert.equal(linkedCaseSupport(first, { ...watchView, pending: { kind: "choice" } }).actionId, null);
assert.equal(linkedCaseSupport(first, { ...watchView, actions: [] }).actionId, null);
assert.equal(linkedCaseSupport(first, { ...watchView, actor: { ...watchView.actor, locationId: "loc_market" } }).actionId, null);
assert.equal(linkedCaseSupport(first, { ...watchView, actor: { ...watchView.actor, inventory: { item_lantern: 1 } } }).prepared, true);
assert.equal(linkedCaseSupport(first, { ...watchView, actor: { ...watchView.actor, inventory: { item_lantern: 1 } } }).actionId, null,
  "an owned lantern must not promise a redundant elder grant");
const watchGranted = { ...watchView,
  relations: { "npc_elder:player_1": { tags: ["spring_watch_requested", "spring_watch_lantern_loaned"] } } };
assert.equal(linkedCaseSupport(first, watchGranted).received, true);
assert.equal(linkedCaseSupport(first, watchGranted).actionId, null, "received help cannot be offered again");
assert.equal(linkedCaseSupport(confirmed, watchView), null, "after direct proof the support preparation prompt ends");
assert.equal(linkedCaseSupport(first, { ...readyView, hiddenFacts: { spring_watch_requested: true } }), null,
  "hidden world flags cannot unlock a personal NPC reward");
assert.equal(linkedCaseSupport(first, { ...watchGranted, actor: { ...watchGranted.actor, id: "player_2" } }), null,
  "a successor cannot see the predecessor's grant");

const inquiryView = {
  actor: { id: "player_1", locationId: "loc_market", inventory: {} },
  pending: null,
  relations: {
    "npc_elder:player_1": { tags: ["spring_inquiry_requested"] },
    "npc_herbalist:player_1": { tags: [] }
  },
  actions: [{ actionId: "act_talk_herbalist", available: true }]
};
assert.deepEqual(linkedCaseSupport(first, inquiryView), {
  npcName: "약초꾼", itemName: "정화초", locationName: "장터",
  received: false, prepared: false, atLocation: true, actionId: "act_talk_herbalist"
});
assert.equal(linkedCaseSupport(first, {
  ...inquiryView, relations: {
    ...inquiryView.relations,
    "npc_herbalist:player_1": { tags: ["spring_inquiry_herb_given"] }
  }
}).received, true);
assert.equal(linkedCaseSupport(first, {
  ...inquiryView, relations: {
    ...inquiryView.relations,
    "npc_herbalist:player_1": { tags: ["spring_inquiry_herb_given"] }
  }
}).actionId, null);

console.log("J3 cross-case deduction projection: PASS");
