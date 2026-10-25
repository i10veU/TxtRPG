// WNG-0 keeps authored nodes, static links, and rule mentions distinct.
import assert from "node:assert/strict";
import { worldData } from "../../web/v2/data/world.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inventoryWorld } from "./measure/world-node-inventory.mjs";

const fixture = {
  world: { growthSystemId: "growth_a" },
  locations: {
    loc_a: { links: [{ to: "loc_b" }, { to: "loc_b" }] },
    loc_b: { links: [] }
  },
  npcs: { npc_a: { actor: { locationId: "loc_a" } } },
  orgs: { org_a: {} },
  items: { item_a: {} },
  facts: { fact_a: {} },
  rumors: { rum_a: { factId: "fact_a" } },
  events: {
    evt_a: {
      trigger: { op: "relation", from: "npc_a", to: "org_a", tag: "member" },
      restartWhen: { op: "fact", fact: "fact_a", eq: "ready" },
      effects: [{ op: "item", item: "item_a", add: 1 }]
    }
  },
  actions: {
    act_a: { requires: { op: "resource", resource: "stamina", min: 1 } },
    act_b: { requires: { op: "and", of: [
      { op: "resource", system: "growth_b", resource: "stamina", min: 1 },
      { op: "alive", subject: "target" },
      { op: "location", in: ["loc_a", "loc_b"] },
      { op: "rumor", fact: "fact_a" },
      { op: "eq", left: { item: "item_a" }, right: 1 },
      { op: "eq", left: { relation: { from: "npc_a", to: "org_a" } }, right: 0 }
    ] } }
  },
  choices: { choice_a: { options: [{ requires: { op: "fact", fact: "fact_a", eq: "known" }, effects: [{ op: "move", to: "loc_b" }] }] } },
  growthSystems: {
    growth_a: { resources: [{ id: "stamina", max: 6 }] },
    growth_b: { resources: [{ id: "stamina", max: 8 }] }
  }
};
const graph = inventoryWorld(fixture);
assert.equal(graph.totalUniqueNodes, 10, "same resource label in two growth systems has two scoped definitions");
assert.equal(graph.fiveKinds.Resource.count, 3);
assert.equal(graph.extractedEdges, 3, "duplicate links are one typed edge; authored NPC start is separate");
assert.ok(graph.graph.structuralEdges.some((e) => e.from === "npcs:npc_a" && e.to === "locations:loc_a" &&
  e.type === "INITIAL_LOCATION" && e.provenance.includes("npcs.npc_a.actor.locationId")));
const road = graph.graph.structuralEdges.find((e) => e.type === "CONNECTED_TO");
assert.deepEqual(road.provenance, ["locations.loc_a.links[0].to", "locations.loc_a.links[1].to"]);
assert.ok(graph.graph.structuralEdges.some((e) => e.type === "ABOUT" && e.from === "rumors:rum_a" && e.to === "facts:fact_a"));
assert.ok(graph.graph.declaredRelationEdges.some((e) =>
  e.from === "npcs:npc_a" && e.type === "RELATION_RULE_READ" && e.to === "orgs:org_a"));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "actions:act_a" && r.type === "READS_RESOURCE" &&
  r.to === "growthSystems.growth_a.resources:stamina"));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "actions:act_b" && r.to === "growthSystems.growth_b.resources:stamina"));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "actions:act_b" && r.to === "facts:fact_a" && r.provenance.some((p) => p.endsWith(".fact"))));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "actions:act_b" && r.to === "items:item_a" && r.provenance.some((p) => p.endsWith(".left.item"))));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "actions:act_b" && r.to === "locations:loc_b" && r.provenance.some((p) => p.endsWith(".in[1]"))));
assert.ok(graph.graph.declaredRuleReferences.some((r) =>
  r.owner === "events:evt_a" && r.type === "READS_KNOWLEDGE" &&
  r.provenance.includes("events.evt_a.restartWhen.fact")));
assert.equal(graph.danglingCandidateReferences.length, 0);
assert.equal(graph.wrongKindReferences.length, 0);
assert.equal(graph.ambiguousCandidateReferences.length, 0);
assert.equal(graph.fiveKinds.Resource.unreferencedInExtractedStaticData, 0,
  "both growth-system resources have explicit read references");

const wrong = structuredClone(fixture);
wrong.locations.loc_a.links[0].to = "fact_a";
wrong.rumors.rum_a.factId = "rum_a";
wrong.actions.act_a.requires.resource = "unknown_resource";
wrong.actions.act_b.requires.of[0].system = "missing_growth";
const bad = inventoryWorld(wrong);
assert.equal(bad.wrongKindReferences.length, 2, "wrong kind and wrong Knowledge subtype are reported");
assert.equal(bad.danglingCandidateReferences.length, 2);
assert.ok(bad.danglingCandidateReferences.some((r) => r.to === "unknown_resource"));
assert.ok(bad.danglingCandidateReferences.some((r) => r.to === "stamina" && r.expectedScope === "missing_growth"));

const wrongDefaultScope = structuredClone(fixture);
wrongDefaultScope.growthSystems.growth_b.resources.push({ id: "other", max: 1 });
wrongDefaultScope.actions.act_a.requires.resource = "other";
const defaultScopeReport = inventoryWorld(wrongDefaultScope);
assert.ok(defaultScopeReport.danglingCandidateReferences.some((r) =>
  r.to === "other" && r.expectedScope === "growth_a"),
  "an absent active-system resource must not silently resolve in another system");
const nonEntityTarget = structuredClone(fixture);
nonEntityTarget.items.target = {};
nonEntityTarget.events.evt_a.effects.push({ op: "item", item: "target", add: 1 });
const targetReport = inventoryWorld(nonEntityTarget);
assert.equal(targetReport.danglingCandidateReferences.length, 0);
assert.ok(targetReport.graph.declaredRuleReferences.some((r) =>
  r.to === "items:target" && r.type === "WRITES_RESOURCE"));

const collided = structuredClone(fixture);
collided.items.org_a = {};
assert.throws(() => inventoryWorld(collided), /Ambiguous node ID org_a/,
  "a duplicate raw ID across definitions must never be silently merged");

const before = JSON.stringify(worldData);
const actual = inventoryWorld(worldData);
assert.equal(JSON.stringify(worldData), before, "the auditor must not mutate the pack");
const herbalistExtension = Number(Boolean(worldData.events.evt_herbalist_brews));
// V2-Core-149 (D-127): the word north and the remnants as facts, each with its rumor (two facts, two rumors, two ABOUT edges)
const worldWordExtension = Number(Boolean(worldData.facts.fact_fate_word && worldData.facts.fact_remnants));
// V2-Core-155 (D-133): the trap by the spring teaches its own word (one fact, one rumor, one ABOUT edge)
const springTrapExtension = Number(Boolean(worldData.facts.fact_spring_trap));
// Post-J3: one authored, carrier-owned crate enables a new supply-route choice.
const supplyCrateExtension = Number(Boolean(worldData.items.item_waystation_supply_crate));
assert.deepEqual(Object.fromEntries(Object.entries(actual.fiveKinds).map(([kind, row]) => [kind, row.count])), {
  Entity: 12, Location: 11, Resource: 14 + supplyCrateExtension, Event: 30 + herbalistExtension,
  Knowledge: 96 + 2 * herbalistExtension + 4 * worldWordExtension + 2 * springTrapExtension
});
assert.equal(actual.totalUniqueNodes, 163 + 3 * herbalistExtension + 4 * worldWordExtension + 2 * springTrapExtension + supplyCrateExtension);
assert.equal(actual.definitions.orgs, 3);
assert.equal(actual.definitions.growthResources, 1);
assert.equal(actual.extractedEdges, 75 + herbalistExtension + 2 * worldWordExtension + springTrapExtension, "authored NPC starts and each declared rumor are structural");
assert.equal(actual.danglingCandidateReferences.length, 0);
assert.equal(actual.wrongKindReferences.length, 0);
assert.equal(actual.ambiguousCandidateReferences.length, 0);
assert.ok(actual.graph.declaredRelationEdges.some((e) =>
  e.from === "npcs:npc_bandit_leader" && e.to === "orgs:org_bandits" &&
  e.type === "RELATION_RULE_READ" && e.provenance.includes("events.evt_bandits_tale.trigger.of[1].of")));
assert.ok(actual.graph.structuralEdges.some((e) =>
  e.from === "locations:loc_village" && e.to === "locations:loc_market" && e.type === "CONNECTED_TO"));
assert.ok(actual.graph.structuralEdges.some((e) =>
  e.from === "rumors:rum_bandits_fate" && e.to === "facts:fact_bandits_fate" && e.type === "ABOUT"));
const cli = fileURLToPath(new URL("./measure/world-node-inventory.mjs", import.meta.url));
const jsonOutput = execFileSync(process.execPath, [cli], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
const cliReport = JSON.parse(jsonOutput);
assert.deepEqual(cliReport.fiveKinds, actual.fiveKinds, "CLI JSON uses the same audited counts");
assert.equal(cliReport.extractedEdges, actual.extractedEdges);
const tableOutput = execFileSync(process.execPath, [cli, "--table"], { encoding: "utf8" });
assert.match(tableOutput, new RegExp("total " + actual.totalUniqueNodes + " structural edges " + actual.extractedEdges));
assert.match(tableOutput, /dangling 0 wrong kind 0 ambiguous 0/);
console.log("world-node inventory: " +
  Object.entries(actual.fiveKinds).map(([kind, row]) => kind + "=" + row.count).join(" ") +
  " total=" + actual.totalUniqueNodes + " structural=" + actual.extractedEdges +
  " relationRules=" + actual.declaredRelationRuleEdges +
  " ruleRefs=" + actual.declaredRuleReferences + " diagnostics=0");
