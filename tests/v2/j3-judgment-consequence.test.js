// J3: two heard rumors -> committed choice -> distinct world response -> later dialogue.
// No second engine, no UI-only save fields and no hidden-truth projection.
import assert from "node:assert/strict";
import { createInitialState, step, view, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";
import { linkedCaseLedger, linkedCaseDecision, linkedCaseDecisionAction } from "../../web/v2/ui/linked-case-ledger.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const INTRO = [
  P("act_talk_elder"), C("opt_ask_ruins"),
  M("loc_market"), P("act_talk_herbalist"), C("opt_herbalist_ask_sickness"),
  M("loc_village")
];
const start = () => createInitialState({ worldSeed: "j3-judgment-choice", data: worldData }).state;
function run(state, actions) {
  const logs = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((event) => event.type === "action.rejected"),
      "unexpected reject: " + JSON.stringify(action));
    logs.push(result);
    state = result.state;
  }
  return { state, logs };
}
const narration = (result) => result.events.filter((event) => event.type === "narration").map((event) => event.data.textId);
const relation = (state) => state.relations["npc_elder:" + state.player.actorId];
const available = (state, id) => view(state, worldData).actions.find((a) => a.actionId === id)?.available === true;
const ledgerFor = (state) => linkedCaseLedger(view(state, worldData).knowledge, worldData);

assert.equal(available(start(), "act_request_spring_watch"), false, "rumor gate prevents premature action");
assert.equal(ledgerFor(start()), null);
const base = run(start(), INTRO).state;
assert.deepEqual(checkDataCompatibility(base, worldData), [], "existing pack version remains compatible");
assert.ok(ledgerFor(base));
assert.equal(available(base, "act_request_spring_watch"), true);
assert.equal(available(base, "act_request_spring_inquiry"), true);
assert.equal(linkedCaseDecisionAction(ledgerFor(base), view(base, worldData), "linked"), "act_request_spring_watch");
assert.equal(linkedCaseDecisionAction(ledgerFor(base), view(base, worldData), "separate"), "act_request_spring_inquiry");
assert.equal(linkedCaseDecisionAction(ledgerFor(base), view(base, worldData), "__proto__"), null);
assert.equal(linkedCaseDecisionAction(ledgerFor(base), { ...view(base, worldData), pending: { kind: "choice" } }, "linked"), null);
assert.equal(linkedCaseDecisionAction(ledgerFor(base), { ...view(base, worldData), actor: { id: base.player.actorId, locationId: "loc_market" } }, "linked"), null);

for (const [selection, actionId, flag, tag, delta, followup] of [
  ["linked", "act_request_spring_watch", "spring_watch_requested", "spring_watch_requested", -2, "txt_spring_watch_followup"],
  ["separate", "act_request_spring_inquiry", "spring_inquiry_requested", "spring_inquiry_requested", 2, "txt_spring_inquiry_followup"]
]) {
  const choice = step(base, P(actionId), worldData);
  assert.ok(!choice.events.some((e) => e.type === "action.rejected"));
  const chosen = choice.state;
  assert.equal(chosen.flags[flag], true, "the village's response is durable world state");
  assert.equal(relation(chosen).score, relation(base).score + delta, "the two choices have distinct social cost");
  assert.ok(relation(chosen).tags.includes(tag), "the teller's act is visible on their relation edge");
  assert.equal(chosen.time.minute, base.time.minute + 10);
  assert.equal(linkedCaseDecision(ledgerFor(chosen), view(chosen, worldData)), selection);
  assert.equal(linkedCaseDecisionAction(ledgerFor(chosen), view(chosen, worldData), selection), null);
  assert.equal(available(chosen, "act_request_spring_watch"), false);
  assert.equal(available(chosen, "act_request_spring_inquiry"), false);
  assert.ok(step(chosen, P(actionId), worldData).events.some((e) => e.type === "action.rejected"), "no repeat rewards");
  const later = run(chosen, [P("act_talk_elder"), C("opt_ask_ruins")]);
  assert.ok(narration(later.logs[1]).includes(followup), "the elder's next account must differ");
  assert.deepEqual(validateState(chosen), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-judgment", chosen, { savedAt: 1 }))));
  assert.deepEqual(loaded, chosen, "choice survives save/load");
  assert.deepEqual(run(start(), INTRO.concat(P(actionId))).state, chosen, "same seed + actions = same state");
  assert.equal(linkedCaseDecision(ledgerFor(chosen), {
    ...view(chosen, worldData), actor: { id: "player_2", locationId: "loc_village" }
  }), null, "a successor must not inherit the teller's decision");
  assert.equal(linkedCaseDecision(ledgerFor(chosen), {
    ...view(chosen, worldData), relations: {}, hiddenFlags: { [flag]: true }
  }), null, "the notebook never reads hidden world flags");
}
const watch = step(base, P("act_request_spring_watch"), worldData).state;
const inquiry = step(base, P("act_request_spring_inquiry"), worldData).state;
assert.notDeepEqual(watch, inquiry, "judgment changes the world, not just the UI");
assert.equal(watch.flags.spring_inquiry_requested, undefined);
assert.equal(inquiry.flags.spring_watch_requested, undefined);
console.log("J3 judgment -> world consequence: PASS");
