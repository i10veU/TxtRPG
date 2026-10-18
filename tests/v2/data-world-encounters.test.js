// V2-Core-155 (D-133, docs/v2/text-rpg-success-analysis.md C): things that happen on the way. Seoul 2033's random
// encounters, NEO Scavenger's and King of Dragon Pass's events with their follow-ups, Fallen London's opportunities --
// here as actions that appear where and when their conditions hold, grouped under a scene (`encounter`).
//   1. every encounter's ways share its scene's words; nothing rolls to open one (no check in what opens it, no event
//      writes its flags); every way of it, in every outcome, closes it
//   2. a run that never takes one is the run it was: the same actions on the pack without the encounters give the same
//      state, step for step (no shared roll is spent, nothing else reads their flags)
//   3. where and when: the well's child by day while the well is fouled, not at night, not once the well is clear, and
//      gone once a way is taken
//   4. what they lead to: the child carried to the herbalist (to the market, the word of the well's source, the village
//      warmer); the deserter sent south stands in the village's defence; the confession at the ford opens a way past the
//      levy's officer; a noticed face is followed in the castle town, and paying ends it; the trap by the spring teaches
//      its own word; the deserter handed over is walked the whole way to the town
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, view } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";

const ENC = Object.entries(worldData.actions).filter(([, a]) => a.encounter);
const groups = new Map();
for (const [id, a] of ENC) (groups.get(a.encounter) ?? groups.set(a.encounter, []).get(a.encounter)).push(id);

// 1. shapes
assert.equal(groups.size, 10, "ten encounters");
const walkOps = (x, out = []) => {
  if (Array.isArray(x)) x.forEach((y) => walkOps(y, out));
  else if (x && typeof x === "object") {
    if (typeof x.op === "string") out.push(x);
    Object.values(x).forEach((v) => walkOps(v, out));
  }
  return out;
};
for (const [scene, ids] of groups) {
  assert.equal(typeof worldData.texts[scene], "string", `scene words ${scene}`);
  const doneKey = scene.replace(/^enc_(.+)_intro$/, "enc_$1_done");
  for (const id of ids) {
    const a = worldData.actions[id];
    assert.ok(walkOps(a.requires).some((n) => n.op === "flag" && n.key === doneKey), `${id} is gone once its encounter is done`);
    const lists = a.effects ? [a.effects] : Object.values(a.outcomes);
    for (const list of lists) assert.ok(walkOps(list).some((n) => n.op === "flag" && n.key === doneKey && n.value === true), `${id}: every outcome closes it`);
    assert.equal(a.showWhenLocked, undefined, `${id} does not show where it cannot happen`);
  }
}
for (const [id, ev] of Object.entries(worldData.events)) {
  assert.ok(!walkOps(ev).some((n) => n.op === "flag" && /^enc_/.test(n.key ?? "")), `${id} does not open or close an encounter`);
}

// 2. not taking them changes nothing
const without = structuredClone(worldData);
for (const [id] of ENC) delete without.actions[id];
const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const WAIT = (minutes) => ({ type: "wait", minutes });
const ACT_ONE = [
  WAIT(8 * 60), P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"),
  WAIT(1440), M("loc_crossroads"), M("loc_river_ford"), WAIT(3 * 1440)
];
for (const seed of ["history-41", "integrated-36", "enc-parity-7"]) {
  let a = createInitialState({ worldSeed: seed, data: worldData }).state;
  let b = createInitialState({ worldSeed: seed, data: without }).state;
  for (const action of ACT_ONE) {
    a = step(a, action, worldData).state;
    b = step(b, action, without).state;
    assert.deepEqual(a, b, `${seed}: the same world after ${JSON.stringify(action)}`);
  }
}

// 3. where and when
const enc = (state, scene) => view(state, worldData).actions.filter((x) => x.available && worldData.actions[x.actionId].encounter === scene).map((x) => x.actionId);
let s = createInitialState({ worldSeed: "history-41", data: worldData }).state; // 00:00
assert.deepEqual(enc(s, "enc_well_child_intro"), [], "not at night");
s = step(s, WAIT(8 * 60), worldData).state;
assert.deepEqual(enc(s, "enc_well_child_intro").sort(), ["act_enc_well_child_ask", "act_enc_well_child_carry"], "by day; the bread only with bread");
const clear = structuredClone(s);
clear.cases = { ...clear.cases, case_fouled_well: { stage: "resolved" } };
assert.deepEqual(enc(clear, "enc_well_child_intro"), [], "not once the well is clear");

// 4. what they lead to
const carried = step(s, P("act_enc_well_child_carry"), worldData).state;
const me = (st) => st.actors[st.player.actorId];
assert.equal(me(carried).locationId, "loc_market");
assert.equal(carried.knowledge[carried.player.actorId].rum_well_source.source, "npc_herbalist");
assert.equal(carried.relations[`org_village:${carried.player.actorId}`].score, 3);
assert.deepEqual(enc(step(carried, M("loc_village"), worldData).state, "enc_well_child_intro"), [], "gone once taken");

const deserterWorld = structuredClone(s);
deserterWorld.signals = { ...deserterWorld.signals, band_gathering: 1, frontier_defense: 0 };
me(deserterWorld).locationId = "loc_band_camp";
assert.ok(enc(deserterWorld, "enc_deserter_intro").includes("act_enc_deserter_south"));
const sent = step(deserterWorld, P("act_enc_deserter_south"), worldData).state;
assert.equal(sent.signals.frontier_defense, 1, "he stands in the village's defence");
assert.equal(sent.flags.deserter_sent_south, true);

const ford = structuredClone(s);
ford.signals = { ...ford.signals, caravan_visits: 1 };
ford.facts = { ...ford.facts, fact_realm_levy: { value: "known", since: 0 } };
me(ford).locationId = "loc_river_ford";
const evening = step(ford, WAIT(10 * 60), worldData).state; // 18:00
const confessed = step(evening, P("act_enc_ford_traveller_confess"), worldData).state;
assert.equal(confessed.flags.levy_warned, true);
const bank = structuredClone(confessed);
me(bank).locationId = "loc_far_bank";
const morning = step(bank, WAIT(15 * 60), worldData).state; // the next morning
assert.ok(enc(morning, "enc_levy_officer_intro").includes("act_enc_levy_officer_warned"), "the traveller's word opens a way past him");

const noticed = structuredClone(morning);
noticed.flags = { ...noticed.flags, levy_noticed: true };
me(noticed).locationId = "loc_castle_town";
me(noticed).money = 10;
assert.ok(enc(noticed, "enc_followed_intro").includes("act_enc_followed_pay"));
const paid = step(noticed, P("act_enc_followed_pay"), worldData).state;
assert.equal(paid.flags.levy_noticed, false);
assert.equal(me(paid).money, 7);
assert.deepEqual(enc(paid, "enc_followed_intro"), [], "no longer followed");

const spring = structuredClone(s);
me(spring).locationId = "loc_forest_spring";
const markSeen = step(spring, P("act_enc_spring_trap_mark"), worldData).state;
const knows = markSeen.knowledge[markSeen.player.actorId];
assert.equal(knows.rum_spring_trap_mark.claim, "bandit_mark", "the trap teaches what was seen: the ruin bandits' mark on it");
assert.equal(knows.rum_spring_bandits, undefined, "not the arrows in the beast (the elder's telling)");
assert.equal(markSeen.facts.fact_spring_trap.value, "bandit_mark");

const handed = step(deserterWorld, P("act_enc_deserter_hand_over"), worldData).state;
assert.equal(me(handed).locationId, "loc_castle_town", "he is walked to the town where the guild pays");
assert.equal(handed.time.minute - deserterWorld.time.minute, 240 + 720, "the way there: the camp to the far bank, then the town");
assert.equal(me(handed).money, me(deserterWorld).money + 5);

console.log("V2-Core-155 data-world-encounters.test.js: all checks passed");
