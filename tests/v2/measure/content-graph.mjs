// MG-039.1 (#323): the static interaction graph of the real pack, judged by the criteria fixed in
// docs/v2/first-region-baseline.md section 3 (L1-L4 per location, N1-N4 per NPC, G1-G3 for the pack). Not a test and not run
// by CI. Prints a JSON report on stdout. Usage: node content-graph.mjs [--table]
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.PACK_ROOT ?? fileURLToPath(new URL("../../..", import.meta.url));
const { worldData: d } = await import(pathToFileURL(`${ROOT}/web/v2/data/world.js`).href);

// which system each op belongs to (section 2); presentation ops (narrate, choice) belong to none
const SYSTEM = {
  fact: "info", rumor: "info",
  signal: "world", flag: "world", case: "world",
  relation: "relation",
  money: "economy", item: "economy", equip: "economy", unequip: "economy",
  hp: "body", trait: "body", alive: "body", resource: "body",
  proficiency: "growth", unlock: "growth", stat: "growth", skill: "growth",
  time: "time",
  move: "move", location: "move"
};
const CHANNEL_OPS = new Set(["fact", "signal", "flag"]);
const channelOf = (n) => (n.op === "fact" ? `fact:${n.fact}` : n.op === "signal" ? `signal:${n.key}` : `flag:${n.key}`);

// walk a condition tree: every op read
function readsOf(cond, out) {
  if (Array.isArray(cond)) { cond.forEach((c) => readsOf(c, out)); return out; }
  if (!cond || typeof cond !== "object") return out;
  if (typeof cond.op === "string") out.push(cond);
  for (const v of Object.values(cond)) if (v && typeof v === "object") readsOf(v, out);
  return out;
}
// walk an effect list: every op written, and every condition read inside `if`
function walkEffects(list, writes, reads) {
  for (const e of list ?? []) {
    if (!e || typeof e !== "object") continue;
    if (e.op === "if") {
      readsOf(e.when, reads);
      walkEffects(e.then, writes, reads);
      walkEffects(e.else, writes, reads);
    } else if (typeof e.op === "string") {
      writes.push(e);
    }
  }
}
// one element: an action, a choice option or an event
function element(kind, id, node, where) {
  const reads = [];
  const writes = [];
  readsOf(node.requires, reads);
  readsOf(node.trigger, reads);
  walkEffects(node.effects, writes, reads);
  for (const list of Object.values(node.outcomes ?? {})) walkEffects(list, writes, reads);
  const systems = new Set();
  for (const n of [...reads, ...writes]) if (SYSTEM[n.op]) systems.add(SYSTEM[n.op]);
  if (node.check) systems.add("growth");
  if (Number.isInteger(node.minutes) && node.minutes > 0) systems.add("time");
  // reading where you are is the element's address, not a system it touches
  const located = reads.some((n) => n.op === "location");
  if (located && !writes.some((n) => n.op === "move") && !reads.some((n) => n.op === "location" && n !== reads.find((r) => r.op === "location"))) systems.delete("move");
  const cost = Boolean(node.check) || (Number.isInteger(node.minutes) && node.minutes >= 60) ||
    writes.some((n) => (n.op === "hp" && n.add < 0) || (n.op === "money" && n.add < 0) || (n.op === "time" && n.minutes >= 60));
  return { kind, id, where, reads, writes, systems: [...systems].sort(), cost };
}

// where things are: an action's location; a choice's location and NPC through the action that opens it
const locOfCond = (cond) => readsOf(cond, []).find((n) => n.op === "location")?.at ?? null;
const choiceOpener = {};
for (const [id, a] of Object.entries(d.actions)) {
  for (const e of a.effects ?? []) if (e.op === "choice") choiceOpener[e.choice] = { action: id, loc: locOfCond(a.requires) };
}
const NPC_OF_ACTION = (id) => {
  const m = /^act_talk_(.+)$/.exec(id);
  if (m && d.npcs[`npc_${m[1]}`]) return `npc_${m[1]}`;
  if (/leader/.test(id)) return "npc_bandit_leader";
  return null;
};

const elements = [];
for (const [id, a] of Object.entries(d.actions)) elements.push(element("action", id, a, { loc: locOfCond(a.requires), npc: NPC_OF_ACTION(id) }));
for (const [cid, c] of Object.entries(d.choices)) {
  const opener = choiceOpener[cid] ?? {};
  const npc = opener.action ? NPC_OF_ACTION(opener.action) : null;
  for (const o of c.options) elements.push(element("option", o.id, o, { loc: opener.loc ?? null, npc, choice: cid }));
}
for (const [id, ev] of Object.entries(d.events)) elements.push(element("event", id, ev, { loc: null, npc: null }));

// channels: who writes, who reads (a rumor's fact is read by the rumor: the truth it is about)
const channels = {};
const ch = (key) => (channels[key] ??= { writers: new Set(), readers: new Set(), initial: false });
for (const el of elements) {
  const at = el.kind === "event" ? `event:${el.id}` : el.where.loc ?? "anywhere";
  for (const n of el.writes) if (CHANNEL_OPS.has(n.op)) ch(channelOf(n)).writers.add(at);
  for (const n of el.reads) if (CHANNEL_OPS.has(n.op)) ch(channelOf(n)).readers.add(at);
}
for (const [fid, f] of Object.entries(d.facts)) if (f && f.initial !== undefined) ch(`fact:${fid}`).initial = true;
for (const r of Object.values(d.rumors)) if (r.factId) ch(`fact:${r.factId}`).readers.add("rumor");
const isolated = Object.entries(channels).filter(([, c]) => c.readers.size === 0 || c.writers.size === 0).map(([k, c]) => ({ channel: k, why: c.readers.size === 0 ? "never read" : c.initial ? "only its initial value" : "never written" }));
const crossPlace = Object.entries(channels).filter(([, c]) => [...c.writers].some((w) => [...c.readers].some((r) => r !== w && r !== "rumor"))).map(([k]) => k);

// per location (L1-L4)
const locations = Object.keys(d.locations).map((loc) => {
  const here = elements.filter((e) => e.where.loc === loc);
  const written = new Set(here.flatMap((e) => e.writes.filter((n) => CHANNEL_OPS.has(n.op)).map(channelOf)));
  const trace = [...written].filter((k) => [...channels[k].readers].some((r) => r !== loc && r !== "rumor"));
  return {
    loc,
    L1_things_to_do: here.length,
    L2_things_to_learn: here.filter((e) => e.writes.some((n) => n.op === "fact" || n.op === "rumor")).length,
    L3_traces_elsewhere: trace.length,
    L4_risks_or_costs: here.filter((e) => e.cost).length,
    elements: here.map((e) => e.id)
  };
}).map((l) => ({ ...l, pass: l.L1_things_to_do >= 2 && l.L2_things_to_learn >= 1 && l.L3_traces_elsewhere >= 1 && l.L4_risks_or_costs >= 1 }));

// supplementary (not a criterion; reported beside L3 and G1, docs/v2/first-region-baseline.md section 5): consequences that
// travel by the character's knowledge -- a rumor learned at one place and read by a condition at another (D-71: knowledge is
// the character's, so the pack routes many consequences through it rather than through world facts)
const rumorReaders = {};
for (const el of elements) for (const n of el.reads) if (n.op === "rumor") (rumorReaders[n.rumor] ??= new Set()).add(el.kind === "event" ? `event:${el.id}` : el.where.loc ?? "anywhere");
for (const l of locations) {
  const here = elements.filter((e) => e.where.loc === l.loc);
  const learned = new Set(here.flatMap((e) => e.writes.filter((n) => n.op === "rumor").map((n) => n.rumor)));
  l.L3k_knowledge_traces = [...learned].filter((r) => [...(rumorReaders[r] ?? [])].some((w) => w !== l.loc)).length;
}
// supplementary: density without the bare openers (an action whose only effect opens a dialogue) and gear toggles
const opener = (e) => e.kind === "action" && e.writes.length > 0 && e.writes.every((n) => n.op === "choice");
const toggle = (e) => e.kind === "action" && /^act_(un)?equip_/.test(e.id);

// per NPC (N1-N4)
const npcs = Object.keys(d.npcs).map((npc) => {
  const all = elements.flatMap((e) => e.writes.map((n) => ({ e, n })));
  const own = elements.filter((e) => e.where.npc === npc);
  const N1 = all.filter(({ n }) => n.op === "rumor" && n.source === npc).length;
  const N2 = all.filter(({ n }) => n.op === "relation" && (n.from === npc || n.to === npc)).length;
  const N3 = own.filter((e) => e.reads.some((n) => CHANNEL_OPS.has(n.op))).length;
  const N4 = elements.filter((e) => e.kind === "event").filter((e) => e.writes.some((n) => (n.op === "relation" && (n.from === npc || n.to === npc)) || (n.subject === npc) || (n.op === "rumor" && n.source === npc))).length;
  return { npc, N1_knowledge: N1, N2_relation_moves: N2, N3_reacts_to_world: N3, N4_moves_without_player: N4, pass: N1 >= 1 && N2 >= 1 && N3 >= 1 };
});

const multi = elements.filter((e) => e.systems.length >= 2).length;
const channelCount = Object.keys(channels).length;
const report = {
  pack: d.version ?? null,
  counts: { locations: locations.length, npcs: npcs.length, actions: Object.keys(d.actions).length, options: elements.filter((e) => e.kind === "option").length, events: Object.keys(d.events).length, channels: channelCount },
  G1_density: { multiSystem: multi, elements: elements.length, share: multi / elements.length, pass: multi / elements.length >= 0.8 },
  G1_supplementary_without_openers_and_toggles: (() => { const kept = elements.filter((e) => !opener(e) && !toggle(e)); const m = kept.filter((e) => e.systems.length >= 2).length; return { multiSystem: m, elements: kept.length, share: m / kept.length }; })(),
  G2_isolated: { isolated: isolated.length, channels: channelCount, share: isolated.length / channelCount, pass: isolated.length / channelCount <= 0.1, list: isolated },
  G3_crossPlace: { channels: crossPlace.length, list: crossPlace },
  locations,
  npcs,
  singleSystem: elements.filter((e) => e.systems.length < 2).map((e) => ({ id: e.id, kind: e.kind, systems: e.systems, loc: e.where.loc }))
};

if (process.argv.includes("--table")) {
  const pct = (x) => `${(100 * x).toFixed(1)}%`;
  console.log(`elements ${elements.length} (actions ${report.counts.actions}, options ${report.counts.options}, events ${report.counts.events}); channels ${channelCount}`);
  console.log(`G1 density: ${multi}/${elements.length} = ${pct(report.G1_density.share)} -> ${report.G1_density.pass ? "pass" : "FAIL"}`);
  const g1s = report.G1_supplementary_without_openers_and_toggles;
  console.log(`   (supplementary, without ${elements.length - g1s.elements} bare openers and gear toggles: ${g1s.multiSystem}/${g1s.elements} = ${pct(g1s.share)})`);
  console.log(`G2 isolated: ${isolated.length}/${channelCount} = ${pct(report.G2_isolated.share)} -> ${report.G2_isolated.pass ? "pass" : "FAIL"}`);
  for (const i of isolated) console.log(`   ${i.channel}: ${i.why}`);
  console.log(`G3 channels written in one place and read in another: ${crossPlace.length}`);
  console.log("locations: L1 do / L2 learn / L3 trace / L4 cost  (supplementary L3k: traces through knowledge)");
  for (const l of locations) console.log(`   ${l.loc.padEnd(18)} ${String(l.L1_things_to_do).padStart(3)} ${String(l.L2_things_to_learn).padStart(3)} ${String(l.L3_traces_elsewhere).padStart(3)} ${String(l.L4_risks_or_costs).padStart(3)}  ${l.pass ? "pass" : "FAIL"}   L3k ${l.L3k_knowledge_traces}`);
  console.log("npcs: N1 knows / N2 relation / N3 reacts / N4 acts alone");
  for (const n of npcs) console.log(`   ${n.npc.padEnd(18)} ${String(n.N1_knowledge).padStart(3)} ${String(n.N2_relation_moves).padStart(3)} ${String(n.N3_reacts_to_world).padStart(3)} ${String(n.N4_moves_without_player).padStart(3)}  ${n.pass ? "pass" : "FAIL"}`);
  console.log(`single-system elements (${report.singleSystem.length}):`);
  for (const s of report.singleSystem) console.log(`   ${s.kind} ${s.id} [${s.systems.join(",")}] @${s.loc ?? "-"}`);
} else {
  console.log(JSON.stringify(report, null, 1));
}
