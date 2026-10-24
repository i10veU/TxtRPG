// J3 #426: witnessed evidence changes what villagers do a day later.
// All consequences are simulated by the existing event, time and HP rules.
import assert from "node:assert/strict";
import { createInitialState, step, validateState, view, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { applyEffectList, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const start = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const INTRO = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village")
];
const me = (s) => s.actors[s.player.actorId];
const textIds = (events) => events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-patrol", s, { savedAt: 1 }))));

function run(state, actions) {
  let events = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"),
      "unexpected rejection: " + JSON.stringify(action));
    state = result.state;
    events = result.events;
  }
  return { state, events };
}
function failDamage(state) {
  const copy = structuredClone(state);
  const events = [];
  applyEffectList(worldData.events.evt_spring_miasma.outcomes.fail, copy, events,
    { state: copy, data: worldData, actorId: copy.player.actorId });
  return { loss: me(state).hp.current - me(copy).hp.current, events, rng: copy.rng };
}

assert.deepEqual(validateData(worldData), []);
assert.equal(worldData.events.evt_spring_a_patrol_progress.cooldown, 1440);
assert.equal(worldData.events.evt_spring_a_patrol_progress.catchUp, true);
for (const scenario of [
  { decision: "act_request_spring_watch", help: E("opt_elder_spring_watch_lantern") },
  { decision: "act_request_spring_inquiry",
    help: [M("loc_market"), ...H("opt_herbalist_spring_inquiry_herb"), M("loc_village")] }
]) {
  const path = [...INTRO, P(scenario.decision), ...scenario.help,
    M("loc_forest_spring"), P("act_search_spring"), M("loc_village")];
  const proof = run(start(), path).state;
  assert.ok(view(proof, worldData).knowledge.rum_spring_bandits);
  assert.equal(proof.flags.spring_patrol_deployed, undefined);

  // Neither hearing a rumor nor finding proof privately starts village action.
  const unreported = run(proof, Array.from({ length: 25 }, () => P("act_rest_village"))).state;
  assert.equal(unreported.signals?.spring_patrol_progress, undefined);
  assert.equal(unreported.flags.spring_patrol_deployed, undefined);

  const told = run(proof, E("opt_tell_spring_arrows")).state;
  assert.equal(told.flags.spring_bandits_told, true);
  assert.equal(told.signals.spring_patrol_progress, 1,
    "first tick starts when the elder hears first-hand proof");
  assert.equal(told.flags.spring_patrol_deployed, undefined);
  assert.deepEqual(validateState(told), []);
  assert.deepEqual(checkDataCompatibility(told, worldData), []);
  assert.deepEqual(saveLoad(told), told);

  // A player who purifies the spring before the patrol arrives has already
  // removed the hazard. The village must not fabricate a late deployment.
  const purified = structuredClone(told);
  applyEffectList([{ op: "case", case: "case_fouled_well", stage: "resolved" }],
    purified, [], { state: purified, data: worldData, actorId: purified.player.actorId });
  const cancelled = run(purified, Array.from({ length: 25 }, () => P("act_rest_village"))).state;
  assert.equal(cancelled.signals.spring_patrol_progress, 1);
  assert.equal(cancelled.flags.spring_patrol_deployed, undefined);

  const early = run(told, Array.from({ length: 23 }, () => P("act_rest_village"))).state;
  assert.equal(early.flags.spring_patrol_deployed, undefined,
    "patrol cannot arrive before a full day");
  const ready = run(early, [P("act_rest_village")]).state;
  assert.equal(ready.flags.spring_patrol_deployed, true,
    "villagers mark the route one day after the report");
  assert.equal(ready.signals.spring_patrol_progress, 2);
  assert.deepEqual(saveLoad(ready), ready);
  assert.deepEqual(validateState(ready), []);
  assert.deepEqual(run(start(), path.concat(E("opt_tell_spring_arrows"),
    Array.from({ length: 24 }, () => P("act_rest_village")))).state, ready,
    "identical actions and seed must replay the same delayed world consequence");
  const later = run(ready, Array.from({ length: 30 }, () => P("act_rest_village"))).state;
  assert.equal(later.signals.spring_patrol_progress, 2, "no repeat progress or reward");
  assert.equal(later.flags.spring_patrol_deployed, true);
  const elder = run(ready, E("opt_ask_ruins"));
  assert.ok(textIds(elder.events).includes("txt_spring_patrol_deployed"),
    "public patrol becomes discoverable from the elder");

  // The village's public patrol protects any traveller, independently of a
  // personally received herb. Two sources of protection never stack.
  const bare = structuredClone(ready);
  delete me(bare).inventory.item_purifying_herb;
  const beforePatrol = structuredClone(bare);
  delete beforePatrol.flags.spring_patrol_deployed;
  assert.equal(failDamage(beforePatrol).loss, 2);
  assert.equal(failDamage(bare).loss, 1);
  assert.ok(textIds(failDamage(bare).events).includes("txt_spring_miasma_patrol"));
  assert.deepEqual(failDamage(bare).rng, bare.rng, "mitigation cannot draw RNG");
  if (me(ready).inventory.item_purifying_herb) {
    assert.equal(failDamage(ready).loss, 1, "personal herb and patrol do not stack");
  }
  const spring = step(bare, M("loc_forest_spring"), worldData);
  const unmarked = step(beforePatrol, M("loc_forest_spring"), worldData);
  assert.ok(spring.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_spring_miasma"));
  assert.deepEqual(spring.state.rng, unmarked.state.rng, "same CON roll regardless of patrol");
  const markedLoss = me(bare).hp.current - me(spring.state).hp.current;
  const unmarkedLoss = me(beforePatrol).hp.current - me(unmarked.state).hp.current;
  assert.ok((markedLoss === 1 && unmarkedLoss === 2) ||
    (markedLoss === 0 && unmarkedLoss === 0), "real engine applies 1/2 on failure or 0/0 on success");

  // Successors see the changed public route, never the predecessor's private
  // hypothesis, support or NPC reappraisal.
  const dying = structuredClone(ready);
  me(dying).alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(heir.flags.spring_patrol_deployed, true);
  assert.equal(Boolean(view(heir, worldData).knowledge?.rum_spring_bandits), false);
  assert.equal(heir.relations["npc_elder:" + heir.player.actorId]?.tags?.includes("spring_watch_vindicated") ?? false, false);
  assert.equal(heir.relations["npc_elder:" + heir.player.actorId]?.tags?.includes("spring_inquiry_revised") ?? false, false);
  assert.equal(failDamage(heir).loss, 1, "the patrol is a world consequence, not inherited knowledge");
  const heirElder = run(heir, E("opt_ask_ruins"));
  assert.ok(textIds(heirElder.events).includes("txt_spring_patrol_deployed"));
  assert.ok(!textIds(heirElder.events).includes("txt_spring_watch_afterproof"));
  assert.ok(!textIds(heirElder.events).includes("txt_spring_inquiry_afterproof"));
}

// A prior-version save with only the public report flag begins its bounded
// response on the next real step; no schema migration or guessed teller.
const legacy = run(start(), INTRO).state;
legacy.flags = { ...legacy.flags, spring_bandits_told: true };
const legacyStarted = run(legacy, [P("act_rest_village")]).state;
assert.equal(legacyStarted.signals.spring_patrol_progress, 1);
assert.equal(legacyStarted.flags.spring_patrol_deployed, undefined);
console.log("J3 first-hand report -> delayed village patrol -> safer spring: PASS");
