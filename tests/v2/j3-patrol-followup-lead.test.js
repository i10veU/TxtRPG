// J3 #439: NPC patrol consequences return a *reported*, testable lead.
import assert from "node:assert/strict";
import { createInitialState, step, view, validateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const seed = () => createInitialState({ worldSeed: "herb-30", data: worldData }).state;
const clue = (s) => view(s, worldData).knowledge?.rum_spring_trap_mark;
const news = (r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const saveLoad = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-patrol-lead", s, { savedAt: 1 }))));
function run(state, actions) {
  let last;
  for (const action of actions) {
    last = step(state, action, worldData);
    assert.ok(!last.events.some((e) => e.type === "action.rejected"), "rejected " + JSON.stringify(action));
    state = last.state;
  }
  return { state, last };
}
const BEFORE_REPORT = [
  ...E("opt_ask_ruins"), P("act_inspect_well"), M("loc_market"),
  ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"),
  M("loc_village"), M("loc_forest_spring"), P("act_search_spring"), M("loc_village")
];
const REPORT = E("opt_tell_spring_arrows");
const WAIT = Array.from({ length: 24 }, () => P("act_rest_village"));

assert.deepEqual(validateData(worldData), []);
for (const mode of ["wait", "help"]) {
  const reported = run(seed(), [...BEFORE_REPORT, ...REPORT]).state;
  assert.equal(clue(reported), undefined, "report alone does not disclose a trap");
  assert.equal(reported.flags.spring_patrol_trap_found, undefined);
  const early = run(reported, E("opt_ask_ruins"));
  assert.equal(clue(early.state), undefined, "no premature NPC clue");
  assert.ok(!news(early.last).includes("txt_spring_patrol_trap_news"));

  const actions = mode === "wait" ? WAIT : [P("act_help_mark_spring_route")];
  const deployed = run(reported, actions).state;
  assert.equal(deployed.flags.spring_patrol_deployed, true);
  assert.equal(deployed.flags.spring_patrol_trap_found, true, "patrol discovers an uncleared trap");
  assert.equal(deployed.facts.fact_spring_trap.value, "bandit_mark");
  assert.equal(clue(deployed), undefined, "public discovery is not automatically personal knowledge");
  assert.deepEqual(validateState(deployed), []);
  assert.deepEqual(checkDataCompatibility(deployed, worldData), []);
  assert.deepEqual(saveLoad(deployed), deployed);
  assert.deepEqual(run(seed(), [...BEFORE_REPORT, ...REPORT, ...actions]).state, deployed,
    "the same seed and actions reproduce the same public clue");

  const elder = run(deployed, E("opt_ask_ruins"));
  assert.ok(news(elder.last).includes("txt_spring_patrol_trap_news"), "elder relays the new lead");
  const heard = clue(elder.state);
  assert.ok(heard, "elder dialogue adds the existing spring trap rumor");
  assert.deepEqual(heard.sources, ["npc_elder"], "NPC testimony is never field observation");
  assert.equal(heard.confidence, 55);
  assert.equal(heard.claim, worldData.rumors.rum_spring_trap_mark.claim);
  assert.deepEqual(saveLoad(elder.state), elder.state);
  const repeated = run(elder.state, E("opt_ask_ruins"));
  assert.ok(!news(repeated.last).includes("txt_spring_patrol_trap_news"), "one news item per life");
  assert.deepEqual(clue(repeated.state).sources, ["npc_elder"]);

  // The reported lead can be checked by an actual field action, not by
  // injecting a synthetic rumor into the player's state.
  const verified = run(elder.state, [M("loc_forest_spring"), P("act_enc_spring_trap_mark")]);
  assert.ok(clue(verified.state).sources.includes("obs_loc_forest_spring"),
    "field inspection upgrades testimony to firsthand evidence");
  assert.ok(clue(verified.state).sources.includes("npc_elder"),
    "verification retains the earlier source");
  const firsthand = run(verified.state, [M("loc_village"), ...E("opt_ask_ruins")]);
  assert.ok(clue(firsthand.state).sources.includes("obs_loc_forest_spring"),
    "later NPC dialogue cannot downgrade firsthand evidence");
  assert.ok(!news(firsthand.last).includes("txt_spring_patrol_trap_news"));

  const dying = structuredClone(deployed);
  dying.actors[dying.player.actorId].alive = false;
  dying.pending = { kind: "newCharacter" };
  const heir = run(dying, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(clue(heir), undefined, "public patrol does not inherit a predecessor's personal knowledge");
  assert.equal(heir.flags.spring_patrol_trap_found, true);
  assert.deepEqual(clue(run(heir, E("opt_ask_ruins")).state).sources, ["npc_elder"],
    "the successor must ask the elder for the public clue");

  const cleared = structuredClone(reported);
  cleared.flags.enc_spring_trap_done = true;
  const noDiscovery = run(cleared, actions).state;
  assert.equal(noDiscovery.flags.spring_patrol_deployed, true);
  assert.equal(noDiscovery.flags.spring_patrol_trap_found, undefined,
    "a previously cleared trap cannot be rediscovered by the patrol");
  assert.equal(clue(run(noDiscovery, E("opt_ask_ruins")).state), undefined,
    "no fabricated follow-up when the trap was handled");
}
console.log("J3 patrol -> NPC testimony -> field verification lead: PASS");
