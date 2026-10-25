// J3: the action news feed must never promote hearsay to firsthand proof.
import assert from "node:assert/strict";
import { knowledgeNewsChange } from "../../web/v2/ui/knowledge-news.js";

const heard = (confidence, sources = ["npc_elder"]) => ({
  rumorId: "rum_ruins_secret", confidence, sources, source: sources[0]
});
const before = heard(70);
const after = heard(95);
const snapshot = JSON.stringify([before, after]);
assert.deepEqual(knowledgeNewsChange(before, after),
  { kind: "learned", note: "확신 높은 전언" }, "high-confidence hearsay is not confirmed");
assert.equal(JSON.stringify([before, after]), snapshot, "news projection is read-only");
assert.deepEqual(knowledgeNewsChange(heard(95), heard(95, ["npc_elder", "obs_loc_ruins"])),
  { kind: "confirmed", note: "직접 확인함" }, "direct observation after trusted testimony is still news");
assert.deepEqual(knowledgeNewsChange(heard(65), heard(85, ["npc_elder", "obs_loc_ruins"])),
  { kind: "confirmed", note: "직접 확인함" }, "firsthand evidence does not require a confidence threshold");
assert.equal(knowledgeNewsChange(heard(95, ["obs_loc_ruins"]), heard(100, ["obs_loc_ruins"])), null,
  "already witnessed evidence is not confirmed again");
assert.equal(knowledgeNewsChange(heard(60), heard(80)), null, "ordinary confidence change is not news");
assert.equal(knowledgeNewsChange(heard(95), heard(95)), null, "unchanged reports do not generate news");
assert.equal(knowledgeNewsChange(null, heard(95)), null, "first discovery uses the existing story path");
assert.equal(knowledgeNewsChange(heard(95), null), null);
assert.equal(knowledgeNewsChange(heard(90, ["npc_elder"]), heard(90, ["npc_elder", 1, null])), null,
  "invalid source entries cannot fabricate observation");
assert.deepEqual(knowledgeNewsChange({ confidence: 60, source: "npc_elder" },
  { confidence: 95, source: "obs_loc_ruins" }),
  { kind: "confirmed", note: "직접 확인함" }, "legacy single-source saves still work");

// A knowledge entry can be replaced during a legacy Save normalization or
// malformed restore. The news feed must not present a *different* claim as
// firsthand confirmation of the original claim, even if the new entry has an
// observation source. The engine's facts and other lives remain out of scope.
const same = (confidence, sources = ["npc_elder"]) => ({
  rumorId: "rum_ruins_secret", factId: "fact_ruins_secret",
  claim: "bandit_hideout", confidence, sources
});
const report = same(60);
const observedSame = { ...same(95, ["npc_elder", "obs_loc_ruins"]) };
assert.deepEqual(knowledgeNewsChange(report, observedSame),
  { kind: "confirmed", note: "직접 확인함" },
  "a matching rumor and claim still earns field confirmation");
assert.equal(knowledgeNewsChange(report, {
  ...observedSame, rumorId: "rum_spring_bandits", factId: "fact_spring_fouler", claim: "bandits"
}), null, "an unrelated rumor cannot confirm the prior rumor");
assert.equal(knowledgeNewsChange(report, { ...observedSame, claim: "empty" }), null,
  "an incompatible claim cannot be presented as confirming the previous claim");
assert.equal(knowledgeNewsChange(report, { ...observedSame, factId: "fact_other" }), null,
  "a different fact cannot be presented as confirming the previous fact");
assert.deepEqual(knowledgeNewsChange(report, { ...same(95) }),
  { kind: "learned", note: "확신 높은 전언" },
  "the identity guard must preserve confidence-only news");

console.log("J3 knowledge news provenance and repeat suppression: PASS");
