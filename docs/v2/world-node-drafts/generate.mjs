// Draft proposal generator. Pure functions: no runtime imports, random values, clock, or I/O.
// Input catalogs are authored proposals; this module does not change worldData or Canon.
export const MOTIFS = [
  ["cyberpunk", "사이버펑크"], ["arcanepunk", "아케인펑크"], ["apocalypse", "아포칼립스"],
  ["fantasy", "판타지"], ["modern_fantasy", "현대 판타지"], ["medieval_fantasy", "중세 판타지"],
  ["other_world", "이세계"], ["regression", "회귀"], ["possession", "빙의"],
  ["reincarnation", "환생"], ["science_fiction", "SF"], ["space_opera", "스페이스 오페라"],
  ["occult", "괴이·오컬트"], ["martial_arts", "무협"], ["immortal_cultivation", "선협"],
  ["hunter", "헌터"], ["gate", "게이트"], ["tower", "탑"], ["tower_climb", "탑 등반"],
  ["maze_dungeon", "미궁·던전"], ["battle_arena", "배틀 아레나"], ["dimension_wander", "차원 유랑"]
];
export const SOURCE_REFS = [
  "docs/v2/world-node-expansion-research.md@3bf3ce9704266e9c048d3d06a44514f6fcaedd7e#6",
  "docs/world-bible/01-foundations/master-direction.md@b2a4998df281088decec4e4236e42fe334bb748a#wb-0014",
  "docs/world-bible/00-governance/canon-policy.md@b2a4998df281088decec4e4236e42fe334bb748a#draft"
];
const KINDS = ["Entity", "Location", "Resource", "Event", "Knowledge"];
const NORMAL = (text) => text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const must = (condition, message) => { if (!condition) throw new Error(message); };

export function parseCatalog(text, sourcePath = "unassigned") {
  const groups = [];
  let group;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    if (row.startsWith("@")) {
      const parts = row.slice(1).split("|");
      must(parts.length === 2 && parts.every(Boolean), "Invalid motif header at line " + (index + 1));
      group = { slug: parts[0], label: parts[1], fronts: [] };
      groups.push(group);
      continue;
    }
    must(group, "Front without motif at line " + (index + 1));
    const parts = row.split("|").map((value) => value.trim());
    must(parts.length === 7 && parts.every((value) => value.length >= 5), "Invalid seven-field front at line " + (index + 1));
    group.fronts.push({
      actor: parts[0], site: parts[1], resource: parts[2], pressure: parts[3],
      intervention: parts[4], report: parts[5], verification: parts[6],
      catalogPath: sourcePath, catalogLine: index + 1
    });
  }
  return groups;
}

function assumptionFlags(slug) {
  const common = ["No new Canon", "No runtime rule or world travel is implied"];
  const special = {
    regression: ["Reset/branch law unresolved", "Prior recorded history is immutable", "Remembered prediction is not a current fact"],
    possession: ["Agency and consent unresolved", "A familiar body does not transfer obligations automatically"],
    reincarnation: ["A new life does not automatically inherit property or status", "Memory claim is not verified ancestry"],
    occult: ["An unexplained occurrence does not establish a supernatural cause"],
    dimension_wander: ["Interworld route and return law unresolved"],
    other_world: ["Arrival and crossworld travel law unresolved"],
    gate: ["Threshold connection law unresolved"]
  };
  return common.concat(special[slug] ?? []);
}

function makeNode(id, kind, label, motif, frontId, stage, proposal) {
  return {
    id, kind, label, scopeId: "motif_" + motif.slug, motifId: motif.slug,
    status: "Draft", runtime: false, lifecycle: "candidate",
    historySeed: { frontId, stage, temporalScope: "scenario-relative" },
    sourceRefs: SOURCE_REFS, proposal, relations: []
  };
}
const endpointKinds = {
  LOCATED_AT: ["Entity", "Location"],
  HAS_RESOURCE: ["Location", "Resource"],
  OCCURS_AT: ["Event", "Location"],
  INVOLVES: ["Event", "Entity"],
  AFFECTS: ["Event", "Resource"],
  ABOUT: ["Knowledge", "Event"],
  HELD_BY: ["Knowledge", "Entity"]
};
const causalKinds = { MOTIVATES: ["Event", "Event"], MAY_INFORM: ["Knowledge", "Event"] };

function oneFront(motif, seed, index) {
  const id = "draft_" + motif.slug + "_" + String(index + 1).padStart(2, "0");
  const n = (suffix) => id + "_" + suffix;
  const seedRef = seed.catalogPath + "#L" + seed.catalogLine;
  const refs = SOURCE_REFS.concat(seedRef);
  const nodes = [
    makeNode(n("entity"), "Entity", seed.actor, motif, id, "participant", {
      subtype: "proposed_actor_or_collective", identityKind: "unassigned", goal: "Keep " + seed.resource + " usable at " + seed.site,
      stakes: seed.pressure, agency: "proposed; individual members not instantiated"
    }),
    makeNode(n("location"), "Location", seed.site, motif, id, "setting", {
      access: "unassigned; requires world-specific design", resourceId: n("resource"),
      conflict: seed.pressure, risk: seed.pressure
    }),
    makeNode(n("resource"), "Resource", seed.resource, motif, id, "material", {
      sourceId: n("location"), scarcity: seed.pressure, proposedUse: seed.intervention,
      unit: "unassigned", renewal: "unassigned"
    }),
    makeNode(n("pressure"), "Event", seed.pressure, motif, id, "pressure", {
      trigger: seed.pressure, proposedEffect: "Changes access to " + seed.resource,
      effectTargetId: n("resource"), magnitude: "unassigned", autonomous: "possible; not implemented"
    }),
    makeNode(n("response"), "Event", seed.intervention, motif, id, "intervention", {
      trigger: "Player chooses: " + seed.intervention, proposedEffect: seed.intervention,
      effectTargetId: n("resource"), cost: "unassigned", durableOutcome: "unassigned",
      alternatives: "unassigned; one authored intervention in seed"
    }),
    makeNode(n("report"), "Knowledge", seed.report, motif, id, "initial_report", {
      subtype: "belief", truthStatus: "unverified", claim: seed.report,
      aboutId: n("pressure"), holderId: null, sourceId: null,
      heardAt: "scenario-relative; unassigned"
    }),
    makeNode(n("evidence"), "Knowledge", seed.verification, motif, id, "verification_candidate", {
      subtype: "evidence_candidate", truthStatus: "proposed_observation", claim: seed.verification,
      aboutId: n("pressure"), holderId: null, sourceId: null,
      observedAt: "scenario-relative; unassigned"
    })
  ];
  for (const node of nodes) {
    node.sourceRefs = refs;
    node.historySeed.catalogRef = seedRef;
  }
  const edgeRows = [
    ["LOCATED_AT", "entity", "location"], ["HAS_RESOURCE", "location", "resource"],
    ["OCCURS_AT", "pressure", "location"], ["INVOLVES", "pressure", "entity"],
    ["AFFECTS", "pressure", "resource"], ["OCCURS_AT", "response", "location"],
    ["INVOLVES", "response", "entity"], ["AFFECTS", "response", "resource"],
    ["ABOUT", "report", "pressure"], ["ABOUT", "evidence", "pressure"]
  ];
  const edges = edgeRows.map(([type, from, to], i) => ({
    id: n("edge_" + String(i + 1).padStart(2, "0")), type, fromId: n(from), toId: n(to),
    status: "Draft", runtime: false, provenance: id + ":" + from + ">" + to
  }));
  const proposedCausalLinks = [
    { id: n("causal_01"), type: "MOTIVATES", fromId: n("pressure"), toId: n("response"),
      condition: "Player discovers pressure and chooses intervention", status: "Draft", runtime: false },
    { id: n("causal_02"), type: "MAY_INFORM", fromId: n("evidence"), toId: n("response"),
      condition: "Evidence is observed and interpreted; no automatic truth transfer", status: "Draft", runtime: false }
  ];
  for (const edge of edges) {
    nodes.find((node) => node.id === edge.fromId).relations.push(edge.id);
    nodes.find((node) => node.id === edge.toId).relations.push(edge.id);
  }
  const front = {
    id, motifId: motif.slug, status: "Draft", runtime: false, lifecycle: "candidate",
    historySeed: { pressure: seed.pressure, priorWorldHistory: "unasserted" },
    pressure: seed.pressure, authoredIntervention: seed.intervention,
    initialReport: seed.report, verificationCandidate: seed.verification,
    alternativeInterventions: "unassigned; not counted as authored",
    costAndDurableOutcome: "unassigned; not counted as authored",
    assumptionFlags: assumptionFlags(motif.slug), sourceRefs: refs,
    semanticSignature: NORMAL([seed.pressure, seed.intervention, seed.resource, seed.report, seed.verification].join("|")),
    nodeIds: nodes.map((node) => node.id)
  };
  return { front, nodes, edges, proposedCausalLinks };
}

export function buildDrafts(catalogTexts) {
  must(Array.isArray(catalogTexts) && catalogTexts.length === 2, "Expected two authored catalog segments");
  const groups = catalogTexts.flatMap((text, i) =>
    parseCatalog(text, "docs/v2/world-node-drafts/catalog-" + (i === 0 ? "a" : "b") + ".txt"));
  must(groups.length === MOTIFS.length, "Expected exactly 22 motif groups");
  const outputs = groups.map((group, index) => {
    const [slug, label] = MOTIFS[index];
    must(group.slug === slug && group.label === label, "Motif order/label mismatch: " + group.slug);
    must(group.fronts.length === 5, "Expected five authored fronts in " + slug);
    const motif = { slug, label };
    const built = group.fronts.map((seed, i) => oneFront(motif, seed, i));
    return {
      schema: "world-node-drafts/v1", status: "Draft", runtime: false,
      scope: { id: "motif_" + slug, label, kind: "genre-or-structure proposal; not a world definition" },
      canonImpact: "none; no Draft item is accepted game setting",
      sourceRefs: SOURCE_REFS, fronts: built.map((row) => row.front),
      nodes: built.flatMap((row) => row.nodes), structuralEdges: built.flatMap((row) => row.edges),
      proposedCausalLinks: built.flatMap((row) => row.proposedCausalLinks)
    };
  });
  validateDrafts(outputs);
  return outputs;
}

export function validateDrafts(outputs) {
  must(Array.isArray(outputs) && outputs.length === MOTIFS.length, "Invalid output motif count");
  const globalIds = new Set(), globalEdgeIds = new Set(), signatures = new Set();
  const semanticFields = ["pressure", "authoredIntervention", "initialReport", "verificationCandidate"];
  const semanticSets = Object.fromEntries(semanticFields.map((field) => [field, new Set()]));
  let frontCount = 0, nodeCount = 0, edgeCount = 0, causalCount = 0;
  const kindCounts = Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  for (const [index, output] of outputs.entries()) {
    const [slug, label] = MOTIFS[index];
    must(output.schema === "world-node-drafts/v1" && output.status === "Draft" && output.runtime === false, "Draft boundary failed");
    must(output.scope.id === "motif_" + slug && output.scope.label === label, "Scope mismatch");
    must(output.fronts.length === 5 && output.nodes.length === 35, "Front/node count mismatch in " + slug);
    const local = new Map(output.nodes.map((node) => [node.id, node]));
    const expectedCatalog = "docs/v2/world-node-drafts/catalog-" + (index < 11 ? "a" : "b") + ".txt";
    const frontIds = new Set();
    must(local.size === output.nodes.length, "Duplicate node ID in " + slug);
    for (const node of output.nodes) {
      const frontId = node.historySeed?.frontId;
      must(frontId && output.fronts.some((front) => front.id === frontId && front.nodeIds.includes(node.id)),
        "Node has wrong front ownership " + node.id);
      must(node.motifId === slug && node.scopeId === "motif_" + slug &&
        node.id.startsWith(frontId + "_"), "Node namespace mismatch " + node.id);
      must(node.sourceRefs.some((ref) => ref.startsWith(expectedCatalog + "#L")) &&
        node.historySeed.catalogRef === node.sourceRefs.at(-1),
        "Missing exact catalog provenance " + node.id);
      must(!globalIds.has(node.id), "Duplicate global node ID " + node.id);
      globalIds.add(node.id);
      must(KINDS.includes(node.kind) && node.status === "Draft" && node.runtime === false &&
        node.lifecycle === "candidate", "Invalid node boundary " + node.id);
      must(node.historySeed?.frontId && node.sourceRefs?.length && node.relations?.length &&
        node.proposal && typeof node.label === "string", "Incomplete node " + node.id);
    }
    for (const [frontIndex, front] of output.fronts.entries()) {
      frontCount++;
      const expectedId = "draft_" + slug + "_" + String(frontIndex + 1).padStart(2, "0");
      must(front.id === expectedId && !frontIds.has(front.id), "Duplicate or misplaced front ID " + front.id);
      frontIds.add(front.id);
      must(front.motifId === slug && front.sourceRefs.some((ref) => ref.startsWith(expectedCatalog + "#L")),
        "Front provenance/namespace mismatch " + front.id);
      const expectedSuffixes = ["entity", "location", "resource", "pressure", "response", "report", "evidence"];
      must(front.nodeIds.every((id, i) => id === front.id + "_" + expectedSuffixes[i]),
        "Front node ownership mismatch " + front.id);
      const resource = local.get(front.id + "_resource");
      must(front.pressure === local.get(front.id + "_pressure")?.label &&
        front.authoredIntervention === local.get(front.id + "_response")?.label &&
        front.initialReport === local.get(front.id + "_report")?.label &&
        front.verificationCandidate === local.get(front.id + "_evidence")?.label &&
        front.historySeed.pressure === front.pressure, "Front content mismatch " + front.id);
      const expectedSignature = NORMAL([front.pressure, front.authoredIntervention, resource?.label,
        front.initialReport, front.verificationCandidate].join("|"));
      must(front.semanticSignature === expectedSignature, "Forged semantic signature " + front.id);
      must(front.status === "Draft" && front.runtime === false && front.nodeIds.length === 7,
        "Invalid front " + front.id);
      const kinds = front.nodeIds.map((id) => local.get(id)?.kind).sort();
      must(kinds.join(",") === "Entity,Event,Event,Knowledge,Knowledge,Location,Resource",
        "Wrong five-kind mix in " + front.id);
      for (const field of semanticFields) {
        const normalized = NORMAL(front[field]);
        must(normalized.length > 12 && !semanticSets[field].has(normalized),
          "Duplicate or generic " + field + " in " + front.id);
        semanticSets[field].add(normalized);
      }
      must(!signatures.has(front.semanticSignature), "Duplicate causal signature " + front.id);
      signatures.add(front.semanticSignature);
    }
    const edgeIds = new Set();
    for (const [phase, edges] of [["structural", output.structuralEdges], ["causal", output.proposedCausalLinks]]) {
      for (const edge of edges) {
      const kinds = (phase === "structural" ? endpointKinds : causalKinds)[edge.type];
      must(kinds, "Unknown edge type " + edge.type);
      must(!edgeIds.has(edge.id) && !globalEdgeIds.has(edge.id), "Duplicate edge " + edge.id);
      edgeIds.add(edge.id);
      globalEdgeIds.add(edge.id);
      must(edge.status === "Draft" && edge.runtime === false, "Non-draft edge " + edge.id);
      must(local.has(edge.fromId) && local.has(edge.toId), "Dangling edge " + edge.id);
      must(local.get(edge.fromId).kind === kinds[0] && local.get(edge.toId).kind === kinds[1],
        "Wrong endpoint kind " + edge.id);
      if (phase === "structural") must(
        local.get(edge.fromId).historySeed.frontId === local.get(edge.toId).historySeed.frontId,
        "Cross-front structural edge " + edge.id);
      }
    }
    for (const node of output.nodes) {
      const incident = output.structuralEdges.filter((edge) => edge.fromId === node.id || edge.toId === node.id)
        .map((edge) => edge.id).sort();
      must(JSON.stringify(node.relations.slice().sort()) === JSON.stringify(incident),
        "Missing, extra, or nonincident relation " + node.id);
      must(incident.length > 0, "Isolated node " + node.id);
      const proposal = node.proposal;
      const checkRef = (field, kind, nullable = false) => {
        const value = proposal[field];
        if (value === null && nullable) return;
        must(typeof value === "string" && local.get(value)?.kind === kind,
          "Invalid proposal reference " + node.id + "." + field);
      };
      if (node.kind === "Location") checkRef("resourceId", "Resource");
      if (node.kind === "Resource") checkRef("sourceId", "Location");
      if (node.kind === "Event") checkRef("effectTargetId", "Resource");
      if (node.kind === "Knowledge") {
        checkRef("aboutId", "Event");
        checkRef("holderId", "Entity", true);
        checkRef("sourceId", "Entity", true);
      }
      kindCounts[node.kind]++;
    }
    nodeCount += output.nodes.length;
    edgeCount += output.structuralEdges.length;
    causalCount += output.proposedCausalLinks.length;
  }
  return { motifCount: outputs.length, authoredFrontCount: frontCount, nodeCount,
    kindCounts,
    structuralEdgeCount: edgeCount, proposedCausalLinkCount: causalCount,
    distinctSemanticSignatures: signatures.size, runtime: false, status: "Draft" };
}
