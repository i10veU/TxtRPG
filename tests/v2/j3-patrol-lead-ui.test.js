// J3: the patrol's newly reported clue must lead to a legal firsthand check.
import assert from "node:assert/strict";
import { linkedCaseLedger, linkedCasePatrolLead } from "../../web/v2/ui/linked-case-ledger.js";
import { worldData } from "../../web/v2/data/world.js";

const known = (id, source) => ({
  rumorId: id, factId: worldData.rumors[id].factId, claim: worldData.rumors[id].claim,
  source, sources: [source], confidence: 55, firstSeenDay: 0, lastSeenDay: 0, aboutDay: 0
});
const knowledge = {
  rum_ruins_secret: known("rum_ruins_secret", "npc_elder"),
  rum_well_source: known("rum_well_source", "npc_herbalist"),
  rum_spring_bandits: known("rum_spring_bandits", "obs_loc_forest_spring")
};
const ledger = linkedCaseLedger(knowledge, worldData);
assert.equal(ledger.observed, true);
const lead = known("rum_spring_trap_mark", "npc_elder");
const view = {
  actor: { id: "player_1", locationId: "loc_forest_spring" },
  knowledge: { ...knowledge, rum_spring_trap_mark: lead },
  relations: { "npc_elder:player_1": { tags: ["spring_arrows_reported"] } },
  actions: [{ actionId: "act_enc_spring_trap_mark", available: true }],
  pending: null
};
const before = JSON.stringify(view);
assert.deepEqual(linkedCasePatrolLead(ledger, view, worldData), {
  verified: false, atLocation: true, actionId: "act_enc_spring_trap_mark"
});
assert.equal(JSON.stringify(view), before, "pure projection cannot mutate PlayerView");
assert.equal(linkedCasePatrolLead(ledger, { ...view, knowledge }, worldData), null, "unknown clue is not shown");
assert.equal(linkedCasePatrolLead(ledger, { ...view, knowledge: {
  ...knowledge, rum_spring_trap_mark: { ...lead, claim: "fabricated" }
} }, worldData), null, "forged rumor is not accepted");
assert.equal(linkedCasePatrolLead(ledger, { ...view, knowledge: {
  ...knowledge, wrong_key: lead
} }, worldData), null, "mis-keyed knowledge is not accepted");
assert.equal(linkedCasePatrolLead(ledger, { ...view, knowledge: {
  ...knowledge, rum_spring_trap_mark: known("rum_spring_trap_mark", "npc_herbalist")
} }, worldData), null, "another person's account is not the elder's report");
assert.equal(linkedCasePatrolLead(ledger, { ...view, relations: {} }, worldData), null,
  "another life's report must not be inferred from public patrol state");
assert.equal(linkedCasePatrolLead(ledger, { ...view, actor: { ...view.actor, id: "player_2" } }, worldData), null,
  "a successor cannot use predecessor relation tags");
assert.equal(linkedCasePatrolLead(ledger, { ...view, pending: { kind: "choice" } }, worldData).actionId, null);
assert.equal(linkedCasePatrolLead(ledger, { ...view, actions: [] }, worldData).actionId, null);
assert.equal(linkedCasePatrolLead(ledger, { ...view, actions: [{ actionId: "act_enc_spring_trap_mark", available: false }] }, worldData).actionId, null);
assert.deepEqual(linkedCasePatrolLead(ledger, {
  ...view, actor: { ...view.actor, locationId: "loc_village" }
}, worldData), { verified: false, atLocation: false, actionId: null },
"heard clue gives a destination, never a remote action");
const observed = { ...lead, sources: ["npc_elder", "obs_loc_forest_spring"] };
assert.deepEqual(linkedCasePatrolLead(ledger, {
  ...view, knowledge: { ...knowledge, rum_spring_trap_mark: observed }
}, worldData), { verified: true, atLocation: true, actionId: null },
"firsthand verification is visible but the shortcut is not repeated");
assert.equal(linkedCasePatrolLead(null, view, worldData), null);
assert.equal(linkedCasePatrolLead(ledger, { ...view, hiddenFacts: { spring_patrol_trap_found: false } }, worldData).actionId,
  "act_enc_spring_trap_mark", "hidden state cannot change a legal visible action");
console.log("J3 patrol follow-up notebook projection: PASS");
