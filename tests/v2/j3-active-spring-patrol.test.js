// J3 #428: helping the villagers is a costed alternative to waiting a day.
// Uses the real step engine, existing clock, resource rules, and save adapter.
import assert from "node:assert/strict";
import { createInitialState, step, validateState, view, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { actorResource, applyEffectList, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const HELP = P("act_help_mark_spring_route");
const start = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const me = (s) => s.actors[s.player.actorId];
const stamina = (s) => actorResource(me(s), worldData, "stamina").current;
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-active-patrol", s, { savedAt: 1 }))));
const texts = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
function run(state, actions) {
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), "unexpected rejection: " + JSON.stringify(action));
    state = result.state;
  }
  return state;
}
function failDamage(s) {
  const copy = structuredClone(s);
  applyEffectList(worldData.events.evt_spring_miasma.outcomes.fail, copy, [],
    { state: copy, data: worldData, actorId: copy.player.actorId });
  return me(s).hp.current - me(copy).hp.current;
}
const INTRO = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village")
];

assert.deepEqual(validateData(worldData), []);
for (const scenario of [
  { decision: "act_request_spring_watch", help: E("opt_elder_spring_watch_lantern") },
  { decision: "act_request_spring_inquiry", help: [
    M("loc_market"), ...H("opt_herbalist_spring_inquiry_herb"), M("loc_village")
  ] }
]) {
  const path = [...INTRO, P(scenario.decision), ...scenario.help,
    M("loc_forest_spring"), P("act_search_spring"), M("loc_village"), ...E("opt_tell_spring_arrows")];
  const reported = run(start(), path);
  assert.equal(reported.flags.spring_bandits_told, true);
  assert.equal(reported.signals.spring_patrol_progress, 1);
  assert.equal(reported.flags.spring_patrol_deployed, undefined);
  assert.equal(stamina(reported) >= 2, true);
  assert.ok(texts(step(run(reported, [P("act_talk_elder")]), C("opt_ask_ruins"), worldData))
    .includes("txt_spring_patrol_pending"));

  const helped = step(reported, HELP, worldData);
  assert.ok(!helped.events.some((e) => e.type === "action.rejected"));
  const active = helped.state;
  assert.equal(active.time.minute, reported.time.minute + 120, "help takes two hours");
  assert.equal(stamina(active), stamina(reported) - 2, "help costs stamina");
  assert.deepEqual(active.rng, reported.rng, "no new RNG");
  assert.equal(active.flags.spring_patrol_deployed, true);
  assert.equal(active.flags.spring_patrol_helped, true);
  assert.equal(active.signals.spring_patrol_progress, 2);
  assert.ok(texts(helped).includes("txt_spring_patrol_helped"));
  assert.deepEqual(validateState(active), []);
  assert.deepEqual(checkDataCompatibility(active, worldData), []);
  assert.deepEqual(saveLoad(active), active);
  assert.deepEqual(run(start(), path.concat(HELP)), active, "deterministic full step replay");

  const waited = run(reported, Array.from({ length: 24 }, () => P("act_rest_village")));
  assert.equal(waited.time.minute, reported.time.minute + 1440, "waiting costs a full day");
  assert.equal(waited.flags.spring_patrol_deployed, true);
  assert.equal(waited.flags.spring_patrol_helped, undefined);
  assert.equal(waited.signals.spring_patrol_progress, 2);
  assert.equal(failDamage(active), 1, "active work changes real spring damage");
  assert.equal(failDamage(waited), 1, "waiting yields the same public mitigation");
  const unmarked = structuredClone(active);
  delete unmarked.flags.spring_patrol_deployed;
  assert.equal(failDamage(unmarked), 2);
  const later = run(active, Array.from({ length: 26 }, () => P("act_rest_village")));
  assert.equal(later.signals.spring_patrol_progress, 2, "no second patrol deployment");
  assert.equal(later.flags.spring_patrol_helped, true);
  assert.ok(step(active, HELP, worldData).events.some((e) => e.type === "action.rejected"), "no repeated help");
  assert.ok(texts(step(run(active, [P("act_talk_elder")]), C("opt_ask_ruins"), worldData))
    .includes("txt_spring_patrol_helped_public"), "public completion is visible to the elder");

  const purified = structuredClone(reported);
  applyEffectList([{ op: "case", case: "case_fouled_well", stage: "resolved" }],
    purified, [], { state: purified, data: worldData, actorId: purified.player.actorId });
  assert.ok(step(purified, HELP, worldData).events.some((e) => e.type === "action.rejected"),
    "purification cancels unnecessary work");
  assert.equal(run(purified, Array.from({ length: 25 }, () => P("act_rest_village"))).flags.spring_patrol_deployed, undefined);

  const dying = structuredClone(active);
  me(dying).alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]);
  assert.equal(heir.flags.spring_patrol_deployed, true);
  assert.equal(heir.flags.spring_patrol_helped, true);
  assert.equal(Boolean(view(heir, worldData).knowledge?.rum_spring_bandits), false);
  assert.equal(heir.relations["npc_elder:" + heir.player.actorId]?.tags?.includes("spring_arrows_reported") ?? false, false);
  assert.equal(failDamage(heir), 1);
  assert.ok(texts(step(run(heir, [P("act_talk_elder")]), C("opt_ask_ruins"), worldData))
    .includes("txt_spring_patrol_helped_public"));
}

// Old saves with a public report but no progress counter can still help;
// neither the reporter's identity nor hidden facts are reconstructed.
const legacy = run(start(), INTRO);
legacy.flags = { ...legacy.flags, spring_bandits_told: true };
const oldHelp = run(legacy, [HELP]);
assert.equal(oldHelp.signals.spring_patrol_progress, 2);
assert.equal(oldHelp.flags.spring_patrol_deployed, true);
assert.deepEqual(saveLoad(oldHelp), oldHelp);

// An exhausted player must rest before they can help; no free completion.
const exhausted = structuredClone(legacy);
applyEffectList([{ op: "resource", resource: "stamina", add: -6 }], exhausted, [],
  { state: exhausted, data: worldData, actorId: exhausted.player.actorId });
assert.ok(step(exhausted, HELP, worldData).events.some((e) => e.type === "action.rejected"));
console.log("J3 costed help vs delayed patrol, saves, successor and cancellation: PASS");
