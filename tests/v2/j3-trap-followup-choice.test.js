// J3 #443: a second verified clue changes a later, costed decision and world.
import assert from "node:assert/strict";
import { createInitialState, step, view, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { applyEffectList, actorResource, evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const seed = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const me = (s) => s.actors[s.player.actorId];
const stamina = (s) => actorResource(me(s), worldData, "stamina").current;
const knowledge = (s) => view(s, worldData).knowledge?.rum_spring_trap_mark;
const textIds = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-trap-choice", s, { savedAt: 1 }))));
function run(state, actions) {
  let last;
  for (const action of actions) {
    last = step(state, action, worldData);
    assert.ok(!last.events.some((e) => e.type === "action.rejected"), "rejected " + JSON.stringify(action));
    state = last.state;
  }
  return { state, last };
}
const PATH = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village"), P("act_request_spring_watch"),
  M("loc_forest_spring"), P("act_search_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), P("act_help_mark_spring_route"),
  ...E("opt_ask_ruins")
];
const FIELD = [M("loc_forest_spring"), P("act_enc_spring_trap_mark"), M("loc_village")];
const OPTIONS = ["opt_elder_trap_reinforce_route", "opt_elder_trap_publish_warning"];
function rejected(state, option) {
  const pending = run(state, [P("act_talk_elder")]).state;
  const result = step(pending, C(option), worldData);
  assert.ok(result.events.some((e) => e.type === "action.rejected"), option + " must reject");
  assert.deepEqual(result.state, pending, "rejected choices do not mutate state");
}
function failDamage(s) {
  const copy = structuredClone(s);
  applyEffectList(worldData.events.evt_spring_miasma.outcomes.fail, copy, [],
    { state: copy, data: worldData, actorId: copy.player.actorId });
  return me(s).hp.current - me(copy).hp.current;
}
function heirOf(s) {
  const dying = structuredClone(s);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  return run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
}
assert.deepEqual(validateData(worldData), []);
const heard = run(seed(), PATH).state;
assert.equal(heard.flags.spring_patrol_trap_found, true);
assert.deepEqual(knowledge(heard).sources, ["npc_elder"]);
for (const option of OPTIONS) rejected(heard, option);
assert.equal(failDamage(heard), 1, "baseline marked patrol still costs 1 HP on failure");

const verified = run(heard, FIELD).state;
assert.ok(knowledge(verified).sources.includes("obs_loc_forest_spring"));
assert.equal(verified.signals.spring_trap_followup, undefined);
const choiceRequirement = worldData.choices.choice_elder_dialogue.options.find((o) => o.id === OPTIONS[0]).requires;
assert.equal(evaluateCondition(choiceRequirement.of[0], { state: verified, data: worldData, actorId: verified.player.actorId }), true);
const malformed = structuredClone(verified);
malformed.knowledge[malformed.player.actorId].rum_spring_trap_mark.rumorId = "rum_forged";
assert.equal(evaluateCondition(choiceRequirement.of[0], { state: malformed, data: worldData, actorId: malformed.player.actorId }), false,
  "a mis-keyed observed entry cannot unlock the choice");
const future = structuredClone(verified);
future.knowledge[future.player.actorId].rum_spring_trap_mark.lastSeenDay += 100;
assert.equal(evaluateCondition(choiceRequirement.of[0], { state: future, data: worldData, actorId: future.player.actorId }), false,
  "future-dated observations cannot unlock the choice");
const heardOnly = structuredClone(verified);
heardOnly.knowledge[heardOnly.player.actorId].rum_spring_trap_mark.sources = ["npc_elder"];
assert.equal(evaluateCondition(choiceRequirement.of[0], { state: heardOnly, data: worldData, actorId: heardOnly.player.actorId }), false);
const legacy = structuredClone(verified);
legacy.knowledge[legacy.player.actorId].rum_spring_trap_mark.source = "obs_loc_forest_spring";
delete legacy.knowledge[legacy.player.actorId].rum_spring_trap_mark.sources;
assert.equal(evaluateCondition(choiceRequirement.of[0], { state: legacy, data: worldData, actorId: legacy.player.actorId }), true,
  "older single-source saves remain readable");

for (const option of OPTIONS) {
  const before = run(verified, [P("act_talk_elder")]).state;
  const result = step(before, C(option), worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), option);
  const after = result.state;
  const route = option === OPTIONS[0];
  assert.equal(after.signals.spring_trap_followup, route ? 1 : 2);
  assert.equal(after.time.minute - before.time.minute, route ? 120 : 30);
  assert.equal(stamina(after), stamina(before) - (route ? 2 : 0));
  assert.equal(me(after).money, me(before).money - (route ? 0 : 1));
  assert.deepEqual(after.rng, before.rng, "no extra random draws");
  assert.equal(failDamage(after), route ? 0 : 1, "route and notice have different actual hazard outcomes");
  assert.ok(textIds(result).includes(route ? "txt_spring_trap_route_reinforced" : "txt_spring_trap_warning_published"));
  assert.deepEqual(validateState(after), []);
  assert.deepEqual(checkDataCompatibility(after, worldData), []);
  assert.deepEqual(saveLoad(after), after);
  assert.deepEqual(run(seed(), [...PATH, ...FIELD, P("act_talk_elder"), C(option)]).state, after,
    "same seed and actual earned path must replay byte-identically");
  const repeated = run(after, [P("act_talk_elder")]).state;
  for (const other of OPTIONS) {
    const reject = step(repeated, C(other), worldData);
    assert.ok(reject.events.some((e) => e.type === "action.rejected"), "mutually exclusive and nonfarmable");
  }
  const news = run(after, E("opt_ask_ruins"));
  assert.ok(textIds(news.last).includes(route ? "txt_spring_trap_route_followup" : "txt_spring_trap_notice_followup"),
    "NPC observes the lasting world choice");
  const successor = heirOf(after);
  assert.equal(knowledge(successor), undefined, "personal proof never passes to successor");
  assert.equal(successor.signals.spring_trap_followup, route ? 1 : 2);
  assert.equal(failDamage(successor), route ? 0 : 1);
  const publicNews = run(successor, E("opt_ask_ruins"));
  assert.equal(knowledge(publicNews.state).confidence, route ? 55 : 80,
    "a published notice makes later public testimony stronger");
  assert.deepEqual(knowledge(publicNews.state).sources, ["npc_elder"], "successor only hears testimony");
  for (const other of OPTIONS) rejected(publicNews.state, other);
}
console.log("J3 trap observation -> two costed world decisions -> successor consequences: PASS");
