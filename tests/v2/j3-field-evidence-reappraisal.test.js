// J3 vertical slice: heard clues -> committed judgment -> real NPC help ->
// first-hand field proof -> elder's personal reappraisal -> durable consequence.
import assert from "node:assert/strict";
import { createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
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
const score = (s) => s.relations["npc_elder:" + s.player.actorId]?.score ?? 0;
const tags = (s) => s.relations["npc_elder:" + s.player.actorId]?.tags ?? [];
const known = (s, id) => Boolean(view(s, worldData).knowledge?.[id]);
const narration = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const saved = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-reappraisal", s, { savedAt: 1 }))));

function run(state, actions) {
  const logs = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"),
      "unexpected rejection: " + JSON.stringify(action));
    logs.push(result);
    state = result.state;
  }
  return { state, logs };
}

assert.deepEqual(validateData(worldData), []);
const base = run(start(), INTRO).state;
assert.ok(known(base, "rum_ruins_secret") && known(base, "rum_well_source"));
assert.equal(known(base, "rum_spring_bandits"), false);

for (const scenario of [
  {
    decision: "act_request_spring_watch",
    help: E("opt_elder_spring_watch_lantern"),
    decisionTag: "spring_watch_requested",
    outcomeTag: "spring_watch_vindicated",
    outcomeText: "txt_spring_watch_vindicated",
    memoryText: "txt_spring_watch_afterproof",
    delta: 7, item: "item_lantern"
  },
  {
    decision: "act_request_spring_inquiry",
    help: [M("loc_market"), ...H("opt_herbalist_spring_inquiry_herb"), M("loc_village")],
    decisionTag: "spring_inquiry_requested",
    outcomeTag: "spring_inquiry_revised",
    outcomeText: "txt_spring_inquiry_revised",
    memoryText: "txt_spring_inquiry_afterproof",
    delta: 4, item: "item_purifying_herb"
  }
]) {
  const path = [...INTRO, P(scenario.decision), ...scenario.help,
    M("loc_forest_spring"), P("act_search_spring"), M("loc_village")];
  const proof = run(start(), path);
  assert.ok(known(proof.state, "rum_spring_bandits"), "the field proof must be learned in this life");
  assert.ok(tags(proof.state).includes(scenario.decisionTag));
  assert.ok(proof.state.actors[proof.state.player.actorId].inventory[scenario.item] >= 1,
    "NPC support must be obtained before the search");
  assert.equal(proof.state.flags.spring_bandits_told, undefined);
  assert.deepEqual(saved(proof.state), proof.state, "pre-report state survives save/load");

  const before = score(proof.state);
  const report = run(proof.state, E("opt_tell_spring_arrows"));
  const told = report.state;
  assert.equal(told.flags.spring_bandits_told, true);
  assert.equal(score(told), before + scenario.delta, "reappraisal changes the actual elder relation");
  assert.ok(tags(told).includes(scenario.outcomeTag));
  assert.ok(tags(told).includes("spring_arrows_reported"));
  assert.ok(narration(report.logs.at(-1)).includes(scenario.outcomeText));
  assert.deepEqual(told.rng, proof.state.rng, "dialogue reappraisal draws no RNG");
  assert.deepEqual(validateState(told), []);
  assert.deepEqual(saved(told), told, "reappraisal survives save/load");
  assert.deepEqual(run(start(), path.concat(E("opt_tell_spring_arrows"))).state, told,
    "same seed and actions replay identically");

  const later = run(told, E("opt_ask_ruins"));
  assert.ok(narration(later.logs.at(-1)).includes(scenario.memoryText),
    "elder remembers this teller's corrected/confirmed judgment");
  assert.equal(score(later.state), score(told), "later conversation has no repeat reward");
  const repeated = step(step(told, P("act_talk_elder"), worldData).state,
    C("opt_tell_spring_arrows"), worldData);
  assert.ok(repeated.events.some((e) => e.type === "action.rejected"),
    "the one-time report and reappraisal cannot be farmed");

  // The world remembers the public account, but another life must not inherit
  // a private judgment, NPC relationship reward, or reappraisal dialogue.
  const dying = structuredClone(told);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(heir.flags.spring_bandits_told, true);
  assert.equal(tags(heir).includes(scenario.outcomeTag), false);
  assert.equal(known(heir, "rum_spring_bandits"), false);
  const heirDialogue = run(heir, E("opt_ask_ruins"));
  assert.equal(narration(heirDialogue.logs.at(-1)).includes(scenario.memoryText), false);
}

// Existing evidence-first path without a prior judgment retains the +5 report.
const bare = run(start(), [...INTRO, M("loc_forest_spring"), P("act_search_spring"), M("loc_village")]).state;
const bareScore = score(bare);
const bareReport = run(bare, E("opt_tell_spring_arrows"));
assert.equal(score(bareReport.state), bareScore + 5);
assert.equal(tags(bareReport.state).includes("spring_watch_vindicated"), false);
assert.equal(tags(bareReport.state).includes("spring_inquiry_revised"), false);
console.log("J3 field proof -> NPC reappraisal: PASS");
