// V2-Core-151 (J3, the voice): the owner's playtest found no game -- no reason to be here, menu words for choices, no voice,
// nothing to aim at. The pack now gives the character a prologue, a first-person voice, places that read as places and a
// goal of the moment (ui/goals.js over `world.goals`). Read-only checks on the real pack:
//   1. every background opens with a prologue, every place has its line, every goal its words -- no missing text id
//   2. one voice: no text speaks to the player as "당신"
//   3. the goal follows chapter 1 as a player walks it (history-41, as tests/v2-ui-ford-and-town-browser.spec.js):
//      meet the elder -> the ruins -> settle the bandits -> the road is open; the well's track beside it until the well is done
//   4. the scout, who sees in the dark, is not sent for a lantern
//   5. the well's track ends with the well's case, whoever closed it (a predecessor, D-71): a clean well is no one's goal
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";
import { currentGoals } from "../../web/v2/ui/goals.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const texts = worldData.texts;

// 1. no missing words
for (const templateId of Object.keys(worldData.characterTemplates)) {
  const prologue = worldData.world.prologue?.[templateId];
  assert.ok(Array.isArray(prologue) && prologue.length > 0, `${templateId} has a prologue`);
  prologue.forEach((id) => assert.equal(typeof texts[id], "string", `prologue text ${id}`));
}
for (const locationId of Object.keys(worldData.locations)) {
  assert.equal(typeof texts[`txt_place_${locationId}`], "string", `place line for ${locationId}`);
}
const tracks = new Set();
for (const goal of worldData.world.goals) {
  assert.equal(typeof texts[goal.textId], "string", `goal text ${goal.textId}`);
  assert.ok(goal.when && typeof goal.when === "object", `${goal.textId} has a condition`);
  tracks.add(goal.track);
}
assert.deepEqual([...tracks].sort(), ["main", "well"]);
// the main track always has something to say
assert.ok(worldData.world.goals.some((g) => g.track === "main" && g.when.op === "always"), "the main track ends in a goal that always holds");

// 2. one voice
const secondPerson = Object.entries(texts).filter(([, v]) => /당신/.test(v)).map(([k]) => k);
assert.deepEqual(secondPerson, [], "no text addresses the player as 당신");

// 3. chapter 1, walked
const goalIds = (state) => currentGoals(state, worldData).map((g) => g.textId);
function walk(state, actions) {
  return actions.reduce((s, a) => {
    const result = step(s, a, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `accepted: ${JSON.stringify(a)}`);
    return result.state;
  }, state);
}
let s = createInitialState({ worldSeed: "history-41", data: worldData }).state;
assert.deepEqual(goalIds(s), ["goal_meet_elder", "goal_well_sick"]);
s = walk(s, [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins")]);
assert.deepEqual(goalIds(s), ["goal_search_ruins", "goal_well_sick"]);
s = walk(s, [M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins")]);
assert.equal(s.flags.ruins_secret_confirmed, true, "the seed's search finds the hideout");
assert.deepEqual(goalIds(s), ["goal_settle_bandits", "goal_well_sick"]);
s = walk(s, [M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"), P("act_confront_leader"), ...E("opt_bandits_disperse")]);
assert.equal(s.cases.case_ruins_mystery.stage, "resolved");
assert.equal(goalIds(s)[0], "goal_road_open");

// 4. the scout
let scout = createInitialState({ worldSeed: "history-41", data: worldData, templateId: "start_scout" }).state;
scout = walk(scout, [...E("opt_ask_ruins")]);
assert.equal(goalIds(scout)[0], "goal_search_ruins_night");

// 5. the well's track ends with the well's case, whoever closed it
const cleared = structuredClone(createInitialState({ worldSeed: "history-41", data: worldData }).state);
cleared.cases = { ...cleared.cases, case_fouled_well: { ...(cleared.cases?.case_fouled_well ?? {}), stage: "resolved" } };
assert.deepEqual(goalIds(cleared), ["goal_meet_elder"]);

console.log("V2-Core-151 data-world-voice.test.js: all checks passed");
