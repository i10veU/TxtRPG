// Write or byte-check the committed Draft artifacts.
// node docs/v2/world-node-drafts/write.mjs [--check]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildDrafts, MOTIFS, SOURCE_REFS } from "./generate.mjs";
import { extendDrafts, validateExtendedDrafts } from "./extend.mjs";

const at = (name) => new URL(name, import.meta.url);
const read = (name) => readFile(at(name), "utf8");
const catalogs = await Promise.all(["catalog-a.txt", "catalog-b.txt"].map(read));
const companions = await Promise.all(["companion-a.txt", "companion-b.txt"].map(read));
const base = buildDrafts(catalogs);
const outputs = extendDrafts(base, companions);
const report = validateExtendedDrafts(outputs, base, companions);
const manifest = {
  schema: "world-node-drafts/manifest-v1",
  status: "Draft", runtime: false,
  meaning: "110 authored causal fronts expanded into 1320 linked candidate nodes; these are not 1320 independent mechanics or 22 established worlds",
  sourceRefs: SOURCE_REFS,
  sources: ["catalog-a.txt", "catalog-b.txt", "companion-a.txt", "companion-b.txt"],
  ...report,
  knownLimits: [
    "No generated file is imported by the playable worldData pack.",
    "Each of the 110 fronts is a connected proposal; cross-front and crossworld gameplay links are not asserted.",
    "Initial reports and added beliefs are unverified; evidence sites and observations are candidates.",
    "Player intervention costs, durable outcomes, world travel, and save semantics remain unassigned unless explicitly authored.",
    "Structural edges and proposed causal links are counted separately."
  ],
  motifs: outputs.map((output, index) => ({
    slug: MOTIFS[index][0], label: MOTIFS[index][1],
    file: "generated/" + MOTIFS[index][0] + ".json",
    authoredFronts: output.fronts.length,
    nodes: output.nodes.length,
    structuralEdges: output.structuralEdges.length,
    proposedCausalLinks: output.proposedCausalLinks.length
  }))
};
const files = outputs.map((output, index) => [
  "generated/" + MOTIFS[index][0] + ".json", JSON.stringify(output, null, 2) + "\n"
]);
files.push(["manifest.json", JSON.stringify(manifest, null, 2) + "\n"]);
if (process.argv.includes("--check")) {
  for (const [path, expected] of files) {
    const actual = await read(path);
    if (actual !== expected) throw new Error(path + " differs from deterministic generated output");
  }
} else {
  await mkdir(at("generated/"), { recursive: true });
  for (const [path, content] of files) await writeFile(at(path), content, "utf8");
}
console.log(JSON.stringify({ mode: process.argv.includes("--check") ? "check" : "write", ...report }));
