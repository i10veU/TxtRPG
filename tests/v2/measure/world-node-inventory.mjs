// WNG-0: read-only inventory of authored V2 definitions and static references.
// Usage: node tests/v2/measure/world-node-inventory.mjs [--table]
// An authored rule reference is not an instantiated relationship or proof of runtime causality.
import { pathToFileURL } from "node:url";
import { worldData } from "../../../web/v2/data/world.js";

const KINDS = ["Entity", "Location", "Resource", "Event", "Knowledge"];
const OWN_COLLECTIONS = [
  ["locations", "Location", "location"],
  ["npcs", "Entity", "npc"],
  ["orgs", "Entity", "organization"],
  ["items", "Resource", "item"],
  ["events", "Event", "event"],
  ["facts", "Knowledge", "fact"],
  ["rumors", "Knowledge", "rumor"]
];
const keyOf = (origin, id) => origin + ":" + id;

export function inventoryWorld(data) {
  const definitions = Object.fromEntries(
    ["locations", "npcs", "orgs", "items", "events", "facts", "rumors", "actions", "choices"]
      .map((name) => [name, Object.keys(data[name] ?? {}).length])
  );
  definitions.growthResources = 0;
  const nodes = new Map();
  const ids = new Map();
  const addNode = (kind, subtype, origin, id) => {
    if (typeof id !== "string" || !id) throw new Error("Invalid node ID in " + origin);
    const key = keyOf(origin, id);
    if (nodes.has(key)) throw new Error("Duplicate node definition: " + key);
    // Growth resource names may recur in separate systems; all other duplicate raw IDs are ambiguous.
    const previous = ids.get(id) ?? [];
    if (previous.length && (subtype !== "growthResource" || previous.some((node) => node.subtype !== "growthResource"))) {
      throw new Error("Ambiguous node ID " + id + " at " + previous[0].origin + " and " + origin);
    }
    const node = { key, id, kind, subtype, origin };
    nodes.set(key, node);
    ids.set(id, [...previous, node]);
  };
  for (const [origin, kind, subtype] of OWN_COLLECTIONS) {
    for (const id of Object.keys(data[origin] ?? {})) addNode(kind, subtype, origin, id);
  }
  for (const [systemId, system] of Object.entries(data.growthSystems ?? {})) {
    const resources = system.resources ?? [];
    const entries = Array.isArray(resources)
      ? resources.map((resource) => [resource.id, resource])
      : Object.entries(resources);
    for (const [id] of entries) {
      addNode("Resource", "growthResource", "growthSystems." + systemId + ".resources", id);
      definitions.growthResources++;
    }
  }

  const danglingCandidateReferences = [];
  const wrongKindReferences = [];
  const ambiguousCandidateReferences = [];
  const resolve = (id, kind, subtype, path, type, system) => {
    if (typeof id !== "string" || !id || (kind === "Entity" && ["self", "target", "world"].includes(id))) return null;
    const candidates = ids.get(id) ?? [];
    if (!candidates.length) {
      danglingCandidateReferences.push({ path, type, to: id, expectedKind: kind, expectedSubtype: subtype ?? null });
      return null;
    }
    const matches = candidates.filter((node) => node.kind === kind && (!subtype || node.subtype === subtype));
    if (!matches.length) {
      wrongKindReferences.push({ path, type, to: id, actualKinds: candidates.map((node) => node.kind + "/" + node.subtype), expectedKind: kind, expectedSubtype: subtype ?? null });
      return null;
    }
    if (subtype === "growthResource") {
      const selectedSystem = system ?? data.world?.growthSystemId;
      if (typeof selectedSystem === "string") {
        const scoped = matches.find((node) => node.origin === "growthSystems." + selectedSystem + ".resources");
        if (!scoped) {
          danglingCandidateReferences.push({ path, type, to: id, expectedKind: kind,
            expectedSubtype: subtype, expectedScope: selectedSystem });
          return null;
        }
        return scoped;
      }
    }
    if (matches.length > 1) {
      ambiguousCandidateReferences.push({ path, type, to: id, candidates: matches.map((node) => node.key) });
      return null;
    }
    return matches[0];
  };
  const addEdge = (map, from, type, to, path) => {
    const key = from + "|" + type + "|" + to;
    const edge = map.get(key) ?? { from, type, to, provenance: [] };
    if (!edge.provenance.includes(path)) edge.provenance.push(path);
    map.set(key, edge);
  };
  const structural = new Map();
  for (const [id, rumor] of Object.entries(data.rumors ?? {})) {
    const target = resolve(rumor.factId, "Knowledge", "fact", "rumors." + id + ".factId", "ABOUT");
    if (target) addEdge(structural, keyOf("rumors", id), "ABOUT", target.key, "rumors." + id + ".factId");
  }
  for (const [id, loc] of Object.entries(data.locations ?? {})) {
    for (const [i, link] of (loc.links ?? []).entries()) {
      const path = "locations." + id + ".links[" + i + "]" + (typeof link === "string" ? "" : ".to");
      const target = resolve(typeof link === "string" ? link : link?.to, "Location", "location", path, "CONNECTED_TO");
      if (target) addEdge(structural, keyOf("locations", id), "CONNECTED_TO", target.key, path);
    }
  }

  for (const [id, npc] of Object.entries(data.npcs ?? {})) {
    if (typeof npc.actor?.locationId !== "string") continue;
    const path = "npcs." + id + ".actor.locationId";
    const target = resolve(npc.actor.locationId, "Location", "location", path, "INITIAL_LOCATION");
    if (target) addEdge(structural, keyOf("npcs", id), "INITIAL_LOCATION", target.key, path);
  }

  const relationRules = new Map();
  const ruleReferences = new Map();
  const addResolvedReference = (owner, phase, target, path) => {
    const type = (phase === "read" ? "READS_" : "WRITES_") + target.kind.toUpperCase();
    const key = owner + "|" + type + "|" + target.key;
    const ref = ruleReferences.get(key) ?? { owner, type, to: target.key, provenance: [] };
    if (!ref.provenance.includes(path)) ref.provenance.push(path);
    ruleReferences.set(key, ref);
  };
  const addReference = (owner, phase, kind, subtype, id, path, system) => {
    const target = resolve(id, kind, subtype, path, "RULE_" + phase.toUpperCase(), system);
    if (target) addResolvedReference(owner, phase, target, path);
  };
  const scan = (value, path, owner, phase) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((part, i) => scan(part, path + "[" + i + "]", owner, phase));
      return;
    }
    // Comparison Values are selector objects without an op. Only left/right positions
    // use this grammar; other metadata objects must not become graph references.
    if (!value.op && /\.(left|right)$/.test(path)) {
      if (typeof value.item === "string") addReference(owner, "read", "Resource", "item", value.item, path + ".item");
      if (typeof value.fact === "string") addReference(owner, "read", "Knowledge", "fact", value.fact, path + ".fact");
      if (typeof value.rumor === "string") addReference(owner, "read", "Knowledge", "rumor", value.rumor, path + ".rumor");
      if (value.relation && typeof value.relation === "object") {
        const spec = value.relation;
        const from = resolve(spec.from, "Entity", null, path + ".relation.from", "RELATION_SELECTOR");
        const to = resolve(spec.to, "Entity", null, path + ".relation.to", "RELATION_SELECTOR");
        if (from) addResolvedReference(owner, "read", from, path + ".relation.from");
        if (to) addResolvedReference(owner, "read", to, path + ".relation.to");
        if (from && to) addEdge(relationRules, from.key, "RELATION_RULE_READ", to.key, path + ".relation");
      }
    }
    switch (value.op) {
      case "location":
        addReference(owner, phase, "Location", "location", value.at, path + ".at");
        if (Array.isArray(value.in)) value.in.forEach((id, i) =>
          addReference(owner, phase, "Location", "location", id, path + ".in[" + i + "]"));
        break;
      case "move": addReference(owner, "write", "Location", "location", value.to, path + ".to"); break;
      case "item": case "equip": case "unequip":
        addReference(owner, phase, "Resource", "item", value.item, path + ".item"); break;
      case "resource":
        addReference(owner, phase, "Resource", "growthResource", value.resource, path + ".resource", value.system); break;
      case "fact": addReference(owner, phase, "Knowledge", "fact", value.fact, path + ".fact"); break;
      case "rumor":
        if (typeof value.rumor === "string") addReference(owner, phase, "Knowledge", "rumor", value.rumor, path + ".rumor");
        else addReference(owner, phase, "Knowledge", "fact", value.fact, path + ".fact");
        break;
      case "relation": {
        const from = resolve(value.from, "Entity", null, path + ".from", "RELATION_RULE");
        if (from) addResolvedReference(owner, phase, from, path + ".from");
        const to = resolve(value.to, "Entity", null, path + ".to", "RELATION_RULE");
        if (to) addResolvedReference(owner, phase, to, path + ".to");
        // A fixed pair in a rule is a declared read/write, not a current relationship.
        if (from && to) addEdge(relationRules, from.key, phase === "read" ? "RELATION_RULE_READ" : "RELATION_RULE_WRITE", to.key, path);
        break;
      }
      case "alive": addReference(owner, phase, "Entity", null, value.subject, path + ".subject"); break;
    }
    for (const [field, child] of Object.entries(value)) {
      if (field === "op") continue;
      const nextPhase = ["requires", "trigger", "when", "restartWhen"].includes(field) ? "read"
        : ["effects", "then", "else", "outcomes", "success", "great", "partial", "fail"].includes(field) ? "write"
        : phase;
      scan(child, path + "." + field, owner, nextPhase);
    }
  };
  for (const [id, event] of Object.entries(data.events ?? {})) scan(event, "events." + id, keyOf("events", id), "read");
  for (const [id, action] of Object.entries(data.actions ?? {})) scan(action, "actions." + id, keyOf("actions", id), "read");
  for (const [id, choice] of Object.entries(data.choices ?? {})) scan(choice, "choices." + id, keyOf("choices", id), "read");
  for (const [id, loc] of Object.entries(data.locations ?? {})) {
    for (const [i, link] of (loc.links ?? []).entries()) if (link?.requires) {
      scan(link.requires, "locations." + id + ".links[" + i + "].requires", keyOf("locations", id), "read");
    }
  }
  for (const [id, template] of Object.entries(data.characterTemplates ?? {})) {
    addReference(keyOf("characterTemplates", id), "read", "Location", "location", template.locationId, "characterTemplates." + id + ".locationId");
  }
  for (const [id, system] of Object.entries(data.growthSystems ?? {})) scan(system, "growthSystems." + id, keyOf("growthSystems", id), "read");
  scan(data.rules ?? {}, "rules", "rules", "read");

  const structuralEdges = [...structural.values()];
  const declaredRelationEdges = [...relationRules.values()];
  const declaredRuleReferences = [...ruleReferences.values()];
  const structuralDegree = new Map([...nodes.keys()].map((key) => [key, 0]));
  const staticDegree = new Map(structuralDegree);
  for (const edge of structuralEdges) {
    structuralDegree.set(edge.from, structuralDegree.get(edge.from) + 1);
    structuralDegree.set(edge.to, structuralDegree.get(edge.to) + 1);
    staticDegree.set(edge.from, staticDegree.get(edge.from) + 1);
    staticDegree.set(edge.to, staticDegree.get(edge.to) + 1);
  }
  for (const edge of declaredRelationEdges) {
    staticDegree.set(edge.from, staticDegree.get(edge.from) + 1);
    staticDegree.set(edge.to, staticDegree.get(edge.to) + 1);
  }
  for (const ref of declaredRuleReferences) {
    staticDegree.set(ref.to, staticDegree.get(ref.to) + 1);
    if (nodes.has(ref.owner)) staticDegree.set(ref.owner, staticDegree.get(ref.owner) + 1);
  }
  const fiveKinds = Object.fromEntries(KINDS.map((kind) => {
    const group = [...nodes.values()].filter((node) => node.kind === kind);
    return [kind, {
      count: group.length,
      isolatedInStructuralGraph: group.filter((node) => structuralDegree.get(node.key) === 0).length,
      unreferencedInExtractedStaticData: group.filter((node) => staticDegree.get(node.key) === 0).length
    }];
  }));
  const interactiveElements = definitions.actions +
    Object.values(data.choices ?? {}).reduce((n, choice) => n + (choice.options?.length ?? 0), 0) +
    definitions.events;
  return {
    scope: "V2 worldData static definitions; excludes runtime instances and V1",
    source: "web/v2/data/world.js",
    packVersion: data.version ?? null,
    definitions,
    fiveKinds,
    totalUniqueNodes: nodes.size,
    extractedEdges: structuralEdges.length,
    declaredRelationRuleEdges: declaredRelationEdges.length,
    declaredRuleReferences: declaredRuleReferences.length,
    danglingCandidateReferences,
    wrongKindReferences,
    ambiguousCandidateReferences,
    interactiveElements,
    graph: { nodes: [...nodes.values()], structuralEdges, declaredRelationEdges, declaredRuleReferences },
    notes: [
      "Structural edges are authored location links, rumor-to-fact references, and NPC starting locations; repeated declarations retain provenance.",
      "Relation-rule edges and action/event references are static read/write declarations, not current relationships or observed causality.",
      "Isolation counts describe this limited extraction only; current runtime actor position, inventory, knowledge, signal and flag state is excluded.",
      "Static references cover listed five-kind fields in conditions, effects, Value selectors and NPC starting locations; actor loadouts and rumor.source evidence tokens are outside this extraction."
    ]
  };
}

const direct = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (direct) {
  const report = inventoryWorld(worldData);
  if (process.argv.includes("--table")) {
    console.log("WNG-0 static V2 inventory");
    for (const [kind, row] of Object.entries(report.fiveKinds)) {
      console.log(kind.padEnd(12), String(row.count).padStart(6),
        "structural-isolated", row.isolatedInStructuralGraph,
        "static-unreferenced", row.unreferencedInExtractedStaticData);
    }
    console.log("total", report.totalUniqueNodes, "structural edges", report.extractedEdges,
      "relation rules", report.declaredRelationRuleEdges, "rule references", report.declaredRuleReferences);
    console.log("definitions", JSON.stringify(report.definitions));
    console.log("dangling", report.danglingCandidateReferences.length, "wrong kind", report.wrongKindReferences.length,
      "ambiguous", report.ambiguousCandidateReferences.length);
  } else console.log(JSON.stringify(report, null, 2));
}
