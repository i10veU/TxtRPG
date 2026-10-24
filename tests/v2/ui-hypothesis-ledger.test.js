// The hypothesis ledger must not infer world truth from hidden facts or prior lives.
import assert from "node:assert/strict";
import { hypothesisLedger } from "../../web/v2/ui/hypothesis-ledger.js";
import { worldData } from "../../web/v2/data/world.js";

const rumor = worldData.rumors.rum_ruins_secret;
const heard = () => ({
  rum_ruins_secret: {
    rumorId: "rum_ruins_secret", factId: rumor.factId, claim: rumor.claim,
    source: "npc_elder", sources: ["npc_elder"], confidence: 60,
    firstSeenDay: 0, lastSeenDay: 0, aboutDay: 0
  }
});

assert.equal(hypothesisLedger({}, worldData), null, "no knowledge, no hypothesis");
assert.equal(hypothesisLedger({ rum_ruins_secret: { ...heard().rum_ruins_secret, claim: "invented" } }, worldData), null,
  "inconsistent knowledge is not silently trusted");

const original = heard();
const snapshot = JSON.stringify(original);
const first = hypothesisLedger(original, worldData);
assert.equal(first.observed, false, "elder testimony is not first-hand proof");
assert.equal(first.options.length, 2);
assert.equal(first.actionId, "act_investigate_ruins");
assert.deepEqual(first.sources, ["npc_elder"]);
assert.equal(JSON.stringify(original), snapshot, "projection must not mutate knowledge");

const observed = heard();
observed.rum_ruins_secret.sources.push("obs_loc_ruins");
assert.equal(hypothesisLedger(observed, worldData).observed, true, "direct field observation can confirm");
const onlyOtherLife = { ...heard(), rum_ruins_secret: { ...heard().rum_ruins_secret, sources: ["npc_elder"] } };
assert.equal(hypothesisLedger(onlyOtherLife, worldData).observed, false);

const tainted = heard();
tainted.rum_ruins_secret.sources = ["npc_elder"];
const copy = JSON.stringify(hypothesisLedger(tainted, worldData));
tainted.hiddenFacts = { fact_ruins_secret: "bandit_hideout" };
tainted.hiddenRng = { cursor: 900 };
tainted.hiddenEvents = ["raid"];
assert.equal(JSON.stringify(hypothesisLedger(tainted, worldData)), copy, "hidden truth must not affect projection");
assert.equal(hypothesisLedger({ rum_ruins_secret: null }, worldData), null);
console.log("J3 hypothesis ledger pure projection: PASS");
