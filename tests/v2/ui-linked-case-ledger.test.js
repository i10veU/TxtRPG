// J3: combining two independently learned rumors must not become a hidden-truth oracle.
import assert from "node:assert/strict";
import { linkedCaseLedger } from "../../web/v2/ui/linked-case-ledger.js";
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
console.log("J3 cross-case deduction projection: PASS");
