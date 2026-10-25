// #449: replay the *actual pre-#446 choice effects* without inventing a
// completion tag. Only those two relation effects changed in PR #446.
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
const path = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village"), P("act_request_spring_watch"),
  M("loc_forest_spring"), P("act_search_spring"), M("loc_village"),
  ...E("opt_tell_spring_arrows"), P("act_help_mark_spring_route"),
  ...E("opt_ask_ruins"), M("loc_forest_spring"),
  P("act_enc_spring_trap_mark"), M("loc_village"), P("act_talk_elder")
];
function run(initial, actions, data = worldData) {
  let state = initial;
  for (const action of actions) {
    const result = step(state, action, data);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), JSON.stringify(action));
    state = result.state;
  }
  return state;
}
const initial = createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const pending = run(initial, path);
assert.equal(pending.pending?.choiceId, "choice_elder_dialogue");
const oldPack = structuredClone(worldData);
const options = oldPack.choices.choice_elder_dialogue.options;
const route = options.find((option) => option.id === "opt_elder_trap_reinforce_route");
route.effects = route.effects.filter((effect) => effect.tag !== "spring_trap_route_reinforced");
const notice = options.find((option) => option.id === "opt_elder_trap_publish_warning");
const noticeRelation = notice.effects.find((effect) => effect.op === "relation");
assert.equal(noticeRelation.add, 4);
delete noticeRelation.tag; // PR #446 added only this tag; retain the +4 trust effect.

for (const [optionId, signal] of [
  ["opt_elder_trap_reinforce_route", 1],
  ["opt_elder_trap_publish_warning", 2]
]) {
  const before446 = run(pending, [C(optionId)], oldPack);
  assert.equal(before446.signals.spring_trap_followup, signal);
  assert.deepEqual(before446.rng, pending.rng);
  const edge = before446.relations[`npc_elder:${before446.player.actorId}`];
  assert.equal((edge.tags ?? []).includes("spring_trap_route_reinforced"), false);
  assert.equal((edge.tags ?? []).includes("spring_trap_notice_published"), false);
  const record = buildSaveRecord("legacy-j3-" + signal, before446, { savedAt: 1 });
  const restored = parseLoadedRecord(JSON.parse(JSON.stringify(record)));
  assert.deepEqual(restored, before446, "old state must load unchanged, not fabricated/migrated");
  const observed = view(restored, worldData);
  assert.equal(Object.hasOwn(observed, "signals"), false, "world outcome is not in view()");
  const ledger = linkedCaseLedger(observed.knowledge, worldData);
  const followup = linkedCaseTrapFollowup(ledger, observed, worldData,
    Math.floor(restored.time.minute / 1440));
  // An untagged old completion and an untagged modern open choice cannot
  // be distinguished reliably by the five-field view contract.
  assert.deepEqual(followup, { status: "open", atLocation: true, actionId: "act_talk_elder" });
}
console.log("J3 pre-#446 Save fixture: old effects, unmodified load, observer ambiguity PASS");
