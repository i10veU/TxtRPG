// J3: the cross-case notebook cannot know events or reports from the future.
import assert from "node:assert/strict";
import { linkedCaseLedger } from "../../web/v2/ui/linked-case-ledger.js";
import { worldData } from "../../web/v2/data/world.js";

const entry = (rumorId, source = "npc_elder") => ({
  rumorId,
  factId: worldData.rumors[rumorId].factId,
  claim: worldData.rumors[rumorId].claim,
  source,
  sources: [source],
  confidence: 60,
  aboutDay: 1,
  firstSeenDay: 4,
  lastSeenDay: 4
});
const known = {
  rum_ruins_secret: entry("rum_ruins_secret"),
  rum_well_source: entry("rum_well_source", "npc_herbalist")
};
const snapshot = JSON.stringify(known);
assert.ok(linkedCaseLedger(known, worldData, 4), "both reports heard today can unlock the second guess");
assert.equal(linkedCaseLedger(known, worldData, 3), null, "unreceived reports must not unlock a guess");
assert.equal(linkedCaseLedger({ ...known, rum_well_source: { ...known.rum_well_source, aboutDay: 5 } }, worldData, 4), null,
  "a future event cannot appear as an already-known clue");
assert.equal(linkedCaseLedger({ ...known, rum_well_source: { ...known.rum_well_source, lastSeenDay: 5 } }, worldData, 4), null,
  "a report not received until tomorrow cannot unlock a guess");
assert.equal(linkedCaseLedger({ ...known, rum_well_source: { ...known.rum_well_source, firstSeenDay: 5 } }, worldData, 4), null,
  "a future first observation cannot unlock a guess");
const futureSpring = entry("rum_spring_cause", "obs_loc_forest_spring");
const futureArrows = entry("rum_spring_bandits", "obs_loc_forest_spring");
assert.equal(linkedCaseLedger({ ...known, rum_spring_cause: { ...futureSpring, aboutDay: 5 } }, worldData, 4).springSeen, false,
  "future spring observation must not be counted as seen");
assert.equal(linkedCaseLedger({ ...known, rum_spring_bandits: { ...futureArrows, lastSeenDay: 5 } }, worldData, 4).observed, false,
  "future arrow evidence must not confirm a case");
assert.equal(linkedCaseLedger({ ...known, rum_spring_bandits: futureArrows }, worldData, 4).observed, true,
  "today's direct observation still confirms the case");
assert.equal(JSON.stringify(known), snapshot, "notebook projection must not mutate knowledge");
console.log("J3 linked-case notebook time boundary: PASS");
