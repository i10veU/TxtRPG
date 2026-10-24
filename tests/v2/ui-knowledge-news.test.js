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
console.log("J3 knowledge news provenance and repeat suppression: PASS");
