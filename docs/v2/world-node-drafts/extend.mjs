// Optional authored companion layer for the 110 Draft fronts.
// Pure functions; no runtime imports or automatic Canon promotion.
import { MOTIFS, SOURCE_REFS, validateDrafts } from "./generate.mjs";

const must = (ok, message) => { if (!ok) throw new Error(message); };
const normalize = (value) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function parseCompanions(text, sourcePath) {
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const p = trimmed.split("|").map((part) => part.trim());
    must(p.length === 8 && p.every((part) => part.length >= 5),
      "Invalid eight-field companion row " + sourcePath + ":" + (index + 1));
    rows.push({
      frontId: p[0], counterparty: p[1], counterpartyGoal: p[2], evidenceSite: p[3],
      alternative: p[4], costAndConsequence: p[5], additionalBelief: p[6],
      beliefHolder: p[7], sourceRef: sourcePath + "#L" + (index + 1)
    });
  }
  return rows;
}

function companionNode(front, motif, row, suffix, kind, label, stage, proposal) {
  return {
    id: front.id + "_" + suffix, kind, label, scopeId: "motif_" + motif,
    motifId: motif, status: "Draft", runtime: false, lifecycle: "candidate",
    historySeed: { frontId: front.id, stage, temporalScope: "scenario-relative", catalogRef: row.sourceRef },
    sourceRefs: SOURCE_REFS.concat(row.sourceRef), proposal, relations: []
  };
}

function addCompanions(output, rows) {
  const nodes = new Map(output.nodes.map((node) => [node.id, node]));
  for (const [index, front] of output.fronts.entries()) {
    const row = rows[index];
    must(row && row.frontId === front.id, "Companion front order mismatch " + front.id);
    const n = (suffix) => front.id + "_" + suffix;
    const extra = [
      companionNode(front, output.scope.id.slice(6), row, "counterparty", "Entity", row.counterparty,
        "counterparty", { subtype: "proposed_role", goal: row.counterpartyGoal,
          stakes: front.pressure, individualOrCollective: "unresolved" }),
      companionNode(front, output.scope.id.slice(6), row, "belief_holder", "Entity", row.beliefHolder,
        "belief_holder", { subtype: "proposed_role", goal: "Assess or act on: " + row.additionalBelief,
          stakes: front.pressure, individualOrCollective: "unresolved" }),
      companionNode(front, output.scope.id.slice(6), row, "evidence_site", "Location", row.evidenceSite,
        "verification_candidate", { access: "unassigned", resourceId: null,
          conflict: front.pressure, verificationStatus: "candidate; not visited or observed" }),
      companionNode(front, output.scope.id.slice(6), row, "alternative", "Event", row.alternative,
        "alternative_intervention", { trigger: "Player may choose: " + row.alternative,
          costAndConsequence: row.costAndConsequence, alternativeToId: n("response"),
          effectTargetId: null, implementation: "unassigned" }),
      companionNode(front, output.scope.id.slice(6), row, "additional_belief", "Knowledge", row.additionalBelief,
        "additional_belief", { subtype: "belief", truthStatus: "unverified",
          claim: row.additionalBelief, aboutId: n("pressure"), holderId: n("belief_holder"),
          sourceId: null, heardAt: "scenario-relative; unassigned" })
    ];
    for (const node of extra) {
      must(!nodes.has(node.id), "Duplicate companion node " + node.id);
      output.nodes.push(node);
      nodes.set(node.id, node);
      front.nodeIds.push(node.id);
    }
    const edgeRows = [
      ["INVOLVES", n("pressure"), n("counterparty")],
      ["ABOUT", n("additional_belief"), n("pressure")],
      ["HELD_BY", n("additional_belief"), n("belief_holder")],
      ["VERIFICATION_SITE_FOR", n("evidence_site"), n("evidence")],
      ["ALTERNATIVE_TO", n("alternative"), n("response")]
    ];
    edgeRows.forEach(([type, fromId, toId], edgeIndex) => {
      const edge = {
        id: n("companion_edge_" + String(edgeIndex + 1).padStart(2, "0")),
        type, fromId, toId, status: "Draft", runtime: false, provenance: row.sourceRef
      };
      output.structuralEdges.push(edge);
      nodes.get(fromId).relations.push(edge.id);
      nodes.get(toId).relations.push(edge.id);
    });
    front.alternativeInterventions = row.alternative;
    front.authoredAlternativeTradeoff = row.costAndConsequence;
    front.durableOutcomeStatus = "unassigned";
    front.companion = {
      counterpartyId: n("counterparty"), evidenceSiteId: n("evidence_site"),
      alternativeEventId: n("alternative"), additionalBeliefId: n("additional_belief"),
      beliefHolderId: n("belief_holder"), sourceRef: row.sourceRef
    };
    front.sourceRefs.push(row.sourceRef);
  }
}

function summarize(outputs) {
  const kinds = { Entity: 0, Location: 0, Resource: 0, Event: 0, Knowledge: 0 };
  for (const output of outputs) for (const node of output.nodes) kinds[node.kind]++;
  return {
    motifCount: outputs.length, authoredFrontCount: outputs.reduce((n, o) => n + o.fronts.length, 0),
    nodeCount: outputs.reduce((n, o) => n + o.nodes.length, 0),
    kindCounts: kinds,
    structuralEdgeCount: outputs.reduce((n, o) => n + o.structuralEdges.length, 0),
    proposedCausalLinkCount: outputs.reduce((n, o) => n + o.proposedCausalLinks.length, 0),
    status: "Draft", runtime: false
  };
}

export function extendDrafts(baseOutputs, companionTexts) {
  validateDrafts(baseOutputs);
  must(Array.isArray(companionTexts) && companionTexts.length === 2,
    "Expected both authored companion catalogs");
  const all = companionTexts.flatMap((text, i) =>
    parseCompanions(text, "docs/v2/world-node-drafts/companion-" + (i === 0 ? "a" : "b") + ".txt"));
  must(all.length === 110, "Expected one authored companion per baseline front");
  const ids = new Set(), semantics = new Set();
  for (const row of all) {
    must(!ids.has(row.frontId), "Duplicate companion front " + row.frontId);
    ids.add(row.frontId);
    const signature = normalize([row.counterpartyGoal, row.alternative,
      row.costAndConsequence, row.additionalBelief].join("|"));
    must(!semantics.has(signature), "Duplicate companion semantics " + row.frontId);
    semantics.add(signature);
  }
  const outputs = JSON.parse(JSON.stringify(baseOutputs));
  let cursor = 0;
  for (const [i, output] of outputs.entries()) {
    must(output.scope.id === "motif_" + MOTIFS[i][0], "Companion motif order mismatch");
    addCompanions(output, all.slice(cursor, cursor + 5));
    cursor += 5;
  }
  const allowed = {
    LOCATED_AT: ["Entity", "Location"], HAS_RESOURCE: ["Location", "Resource"],
    OCCURS_AT: ["Event", "Location"], INVOLVES: ["Event", "Entity"],
    AFFECTS: ["Event", "Resource"], ABOUT: ["Knowledge", "Event"],
    HELD_BY: ["Knowledge", "Entity"], VERIFICATION_SITE_FOR: ["Location", "Knowledge"],
    ALTERNATIVE_TO: ["Event", "Event"]
  };
  const globalNodeIds = new Set(), globalEdgeIds = new Set();
  for (const output of outputs) {
    must(output.fronts.length === 5 && output.nodes.length === 60 &&
      output.structuralEdges.length === 75 && output.proposedCausalLinks.length === 10,
      "Unexpected companion counts in " + output.scope.id);
    const nodeMap = new Map(output.nodes.map((node) => [node.id, node]));
    must(nodeMap.size === output.nodes.length, "Duplicate node in " + output.scope.id);
    for (const node of output.nodes) {
      must(!globalNodeIds.has(node.id), "Global duplicate node " + node.id);
      globalNodeIds.add(node.id);
      must(node.status === "Draft" && node.runtime === false && node.lifecycle === "candidate",
        "Non-draft companion node " + node.id);
      must(node.sourceRefs.some((ref) => ref.startsWith("docs/v2/world-node-drafts/")),
        "Missing row provenance " + node.id);
    }
    for (const front of output.fronts) {
      must(front.nodeIds.length === 12 && front.companion?.sourceRef &&
        front.sourceRefs.includes(front.companion.sourceRef), "Incomplete companion front " + front.id);
      must(front.nodeIds.every((id) => nodeMap.get(id)?.historySeed.frontId === front.id),
        "Cross-front companion ownership " + front.id);
      const alt = nodeMap.get(front.companion.alternativeEventId);
      const belief = nodeMap.get(front.companion.additionalBeliefId);
      must(alt?.label === front.alternativeInterventions &&
        alt.proposal.costAndConsequence === front.authoredAlternativeTradeoff &&
        front.durableOutcomeStatus === "unassigned" &&
        belief?.proposal.claim === belief.label && belief.proposal.holderId === front.companion.beliefHolderId &&
        belief.proposal.sourceId === null, "Companion content mismatch " + front.id);
    }
    for (const edge of output.structuralEdges) {
      const kinds = allowed[edge.type];
      must(kinds && !globalEdgeIds.has(edge.id), "Duplicate or invalid edge " + edge.id);
      globalEdgeIds.add(edge.id);
      const from = nodeMap.get(edge.fromId), to = nodeMap.get(edge.toId);
      must(from && to && from.kind === kinds[0] && to.kind === kinds[1] &&
        from.historySeed.frontId === to.historySeed.frontId, "Bad companion edge " + edge.id);
    }
    for (const node of output.nodes) {
      const incident = output.structuralEdges.filter((edge) => edge.fromId === node.id || edge.toId === node.id)
        .map((edge) => edge.id).sort();
      must(incident.length > 0 && JSON.stringify(incident) === JSON.stringify(node.relations.slice().sort()),
        "Bad node relation " + node.id);
    }
  }
  return outputs;
}

export function validateExtendedDrafts(outputs, baseOutputs, companionTexts) {
  const expected = extendDrafts(baseOutputs, companionTexts);
  must(JSON.stringify(outputs) === JSON.stringify(expected), "Extended artifact differs from authored generator output");
  return summarize(outputs);
}
