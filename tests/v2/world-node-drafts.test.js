// Draft graph contract and byte-for-byte artifact regression; no runtime pack imports.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildDrafts, validateDrafts } from "../../docs/v2/world-node-drafts/generate.mjs";
import { extendDrafts, validateExtendedDrafts } from "../../docs/v2/world-node-drafts/extend.mjs";

const dir = new URL("../../docs/v2/world-node-drafts/", import.meta.url);
const read = (name) => readFileSync(new URL(name, dir), "utf8");
const catalogs = ["catalog-a.txt", "catalog-b.txt"].map(read);
const companions = ["companion-a.txt", "companion-b.txt"].map(read);
const base = buildDrafts(catalogs);
const outputs = extendDrafts(base, companions);
const report = validateExtendedDrafts(outputs, base, companions);
assert.deepEqual(report, {
  motifCount: 22, authoredFrontCount: 110, nodeCount: 1320,
  kindCounts: { Entity: 330, Location: 220, Resource: 110, Event: 330, Knowledge: 330 },
  structuralEdgeCount: 1650, proposedCausalLinkCount: 220,
  status: "Draft", runtime: false
});
assert.equal(JSON.stringify(outputs), JSON.stringify(extendDrafts(buildDrafts(catalogs), companions)),
  "generation must be deterministic");

const malformed = [
  ["forged signature", (x) => { x[0].fronts[0].semanticSignature = "forged"; }],
  ["duplicate front", (x) => { x[0].fronts[1].id = x[0].fronts[0].id; }],
  ["foreign front node", (x) => { x[0].fronts[0].nodeIds[0] = x[0].fronts[1].nodeIds[0]; }],
  ["false history owner", (x) => { x[0].nodes[0].historySeed.frontId = x[0].fronts[1].id; }],
  ["missing proposal target", (x) => { x[0].nodes[1].proposal.resourceId = "missing"; }],
  ["nonincident relation", (x) => { x[0].nodes[0].relations.push(x[0].structuralEdges[1].id); }],
  ["omitted reverse relation", (x) => { x[0].nodes[1].relations.pop(); }],
  ["duplicate global edge", (x) => {
    const prior = x[0].structuralEdges[0].id;
    const edge = x[1].structuralEdges[0];
    const before = edge.id;
    edge.id = prior;
    for (const node of x[1].nodes) node.relations = node.relations.map((id) => id === before ? prior : id);
  }],
  ["causal type in structural list", (x) => { x[0].structuralEdges[10].type = "MAY_INFORM"; }],
  ["cross-front structural target", (x) => {
    const edge = x[0].structuralEdges[0];
    const oldTarget = edge.toId;
    edge.toId = x[0].fronts[1].nodeIds[1];
    x[0].nodes.find((n) => n.id === oldTarget).relations =
      x[0].nodes.find((n) => n.id === oldTarget).relations.filter((id) => id !== edge.id);
    x[0].nodes.find((n) => n.id === edge.toId).relations.push(edge.id);
  }]
];
for (const [name, mutate] of malformed) {
  const copy = structuredClone(base);
  mutate(copy);
  assert.throws(() => validateDrafts(copy), undefined, name);
}
const changed = structuredClone(outputs);
changed[0].fronts[0].authoredAlternativeTradeoff = "no cost";
assert.throws(() => validateExtendedDrafts(changed, base, companions), /differs/, "authored tradeoff mutation");
const cli = fileURLToPath(new URL("../../docs/v2/world-node-drafts/write.mjs", import.meta.url));
const checkOutput = execFileSync(process.execPath, [cli, "--check"], { encoding: "utf8" });
assert.match(checkOutput, /"nodeCount":1320/);
console.log("world-node Drafts: 22 motifs, 110 authored fronts, 1320 nodes; deterministic artifacts and 11 mutations checked");
