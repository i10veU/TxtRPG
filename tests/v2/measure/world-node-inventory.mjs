// WNG-0: read-only inventory of V2 world definitions and graph references.
// Usage: node tests/v2/measure/world-node-inventory.mjs [--table]
// No state mutation, external dependency, random input, or browser API.
import { worldData } from "../../../web/v2/data/world.js";

const d = worldData;
const collections = ["locations", "npcs", "organizations", "factions", "resources", "items", "facts", "rumors", "events", "actions", "choices"];
const counts = Object.fromEntries(collections.map(k => [k, Object.keys(d[k] ?? {}).length]));
const nodes = new Map();
const edges = [];
const dangling = [];
const add = (kind, id) => { if (!nodes.has(id)) nodes.set(id, { kind, id }); };
for (const [kind, ids] of Object.entries({
  Location: Object.keys(d.locations ?? {}),
  Entity: [...Object.keys(d.npcs ?? {}), ...Object.keys(d.organizations ?? {}), ...Object.keys(d.factions ?? {})],
  Resource: [...Object.keys(d.resources ?? {}), ...Object.keys(d.items ?? {})],
  Event: Object.keys(d.events ?? {}),
  Knowledge: [...Object.keys(d.facts ?? {}), ...Object.keys(d.rumors ?? {})]
})) for (const id of ids) add(kind, id);

function link(from, type, to, expectedKind) {
  if (!to || typeof to !== "string") return;
  if (!nodes.has(to)) { dangling.push({ from, type, to, expectedKind }); return; }
  edges.push({ from, type, to });
}
for (const [id, r] of Object.entries(d.rumors ?? {})) link(id, "ABOUT", r.factId, "Knowledge");
for (const [id, loc] of Object.entries(d.locations ?? {})) {
  for (const target of Object.values(loc.links ?? {})) {
    const dest = typeof target === "string" ? target : target?.to ?? target?.location;
    link(id, "CONNECTED_TO", dest, "Location");
  }
}
const elementCount = Object.keys(d.actions ?? {}).length +
  Object.values(d.choices ?? {}).reduce((n, c) => n + (c.options?.length ?? 0), 0) +
  Object.keys(d.events ?? {}).length;
const degrees = new Map([...nodes.keys()].map(id => [id, 0]));
for (const e of edges) { degrees.set(e.from, degrees.get(e.from) + 1); degrees.set(e.to, degrees.get(e.to) + 1); }
const kinds = ["Entity", "Location", "Resource", "Event", "Knowledge"];
const byKind = Object.fromEntries(kinds.map(k => {
  const group = [...nodes.values()].filter(n => n.kind === k);
  return [k, { count: group.length, isolatedInExtractedGraph: group.filter(n => degrees.get(n.id) === 0).length }];
}));
const report = {
  scope: "V2 worldData static definitions; excludes runtime instances and V1",
  source: "web/v2/data/world.js",
  packVersion: d.version ?? null,
  definitions: counts,
  fiveKinds: byKind,
  totalUniqueNodes: nodes.size,
  extractedEdges: edges.length,
  danglingCandidateReferences: dangling,
  interactiveElements: elementCount,
  notes: [
    "Counts are static definitions, not instantiated world populations.",
    "Only explicitly mapped link types are counted. Other condition/effect and runtime relations are NOT included.",
    "IsolatedInExtractedGraph is not a game-world isolation verdict.",
    "Do not infer graph completeness or gameplay depth from these counts."
  ]
};
if (process.argv.includes("--table")) {
  console.log("WNG-0 static V2 inventory");
  for (const [k,v] of Object.entries(byKind)) console.log(k.padEnd(12), String(v.count).padStart(6), "isolated-in-extract", v.isolatedInExtractedGraph);
  console.log("total", nodes.size, "edges", edges.length, "interactive elements", elementCount);
  console.log("definitions", JSON.stringify(counts));
  console.log("dangling candidates", dangling.length);
} else console.log(JSON.stringify(report, null, 2));
