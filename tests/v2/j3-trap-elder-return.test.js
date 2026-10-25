// J3 #445: observer-only follow-up from earned field proof to elder decision.
import assert from "node:assert/strict";
import { createInitialState, step, view } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { linkedCaseLedger, linkedCaseTrapFollowup } from "../../web/v2/ui/linked-case-ledger.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const PATH = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village"), P("act_request_spring_watch"),
  M("loc_forest_spring"), P("act_search_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), P("act_help_mark_spring_route"),
  ...E("opt_ask_ruins")
];
function run(state, actions) {
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"),
      "rejected " + JSON.stringify(action));
    state = result.state;
  }
  return state;
}
const projection = (state) => {
  const player = view(state, worldData);
  return linkedCaseTrapFollowup(linkedCaseLedger(player.knowledge, worldData),
    player, worldData, Math.floor(state.time.minute / 1440));
};
const seed = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const heard = run(seed(), PATH);
assert.equal(projection(heard), null, "hearsay cannot unlock return guidance");
const atSpring = run(heard, [M("loc_forest_spring"), P("act_enc_spring_trap_mark")]);
assert.deepEqual(projection(atSpring), { status: "open", atLocation: false, actionId: null });
const atVillage = run(atSpring, [M("loc_village")]);
assert.deepEqual(projection(atVillage),
  { status: "open", atLocation: true, actionId: "act_talk_elder" });
const inDialogue = run(atVillage, [P("act_talk_elder")]);
assert.deepEqual(projection(inDialogue), { status: "open", atLocation: true, actionId: null },
  "pending dialogue must not offer a duplicate action");
const future = structuredClone(atVillage);
future.knowledge[future.player.actorId].rum_spring_trap_mark.lastSeenDay += 100;
assert.equal(projection(future), null, "future-dated evidence must not be shown");
const miskeyed = structuredClone(atVillage);
miskeyed.knowledge[miskeyed.player.actorId].rum_spring_trap_mark.rumorId = "fake";
assert.equal(projection(miskeyed), null, "invalid provenance must not guide the player");
for (const [optionId, status, tag] of [
  ["opt_elder_trap_reinforce_route", "route", "spring_trap_route_reinforced"],
  ["opt_elder_trap_publish_warning", "notice", "spring_trap_notice_published"]
]) {
  const result = step(inDialogue, C(optionId), worldData);
  assert.ok(!result.events.some((e) => e.type === "action.rejected"), optionId);
  const done = result.state;
  assert.deepEqual(done.rng, inDialogue.rng, "no new random draws");
  assert.equal(done.relations[`npc_elder:${done.player.actorId}`].tags.includes(tag), true);
  assert.deepEqual(projection(done), { status, atLocation: true, actionId: null });
  const restored = parseLoadedRecord(JSON.parse(JSON.stringify(
    buildSaveRecord("j3-return-" + status, done, { savedAt: 1 }))));
  assert.deepEqual(projection(restored), projection(done), "save/load keeps the personal record");
  const dying = structuredClone(done);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const successor = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]);
  assert.equal(projection(successor), null, "successor cannot inherit private evidence or a personal shortcut");
}
console.log("J3 trap proof -> elder navigation -> persistent observer-only recap: PASS");
