// V2-Core-46 (Issue #125): the truth a character finds becomes something they can act on, and the
// act changes what the world tells later generations. A character who heard the village's legend
// (`rum_bandits_legend` "slain") and then saw at the ruins that the bandits scattered (the legend
// corrected to "dispersed", V2-Core-45) can tell the elder (`opt_correct_legend`). That writes the
// world flag `bandits_tale_corrected`; from then on the elder tells everyone -- a successor too --
// the true account instead of the legend. Existing contracts only: a choice option's `requires`
// (the `rumor` selector with `eq`, `signal`, `flag`), a world `flag` Effect, and `if` in the elder's
// news. No inheritance (D-71 (1)): what changes is the world's record, not anyone's knowledge; no
// reward (D-71 (2)): a one-time +5 with the elder.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const WAIT_DAY = { type: "wait", minutes: 1440 };

// on this seed the investigation, the confrontation and the later investigations succeed
const SEED = "history-41";
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings"),
  P("act_confront_leader"), P("act_talk_elder"), CHOOSE("opt_bandits_disperse")
];
const ASK_NEWS = [P("act_talk_elder"), CHOOSE("opt_ask_bandit_news")];
const REINVESTIGATE = [P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_investigate_ruins"), MOVE("loc_village")];
const CORRECT = [P("act_talk_elder"), CHOOSE("opt_correct_legend")];
const DIE_IN_RUINS = [MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))];
const START_SUCCESSOR = { type: "startCharacter", templateId: "start_wanderer" };

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const noRejects = (log) => log.every((r) => rejectedCode(r) === undefined);
const narrations = (log) => log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const knowledgeOf = (state, actorId) => state.knowledge?.[actorId] ?? {};
const elderScore = (state, actorId) => state.relations[`npc_elder:${actorId}`]?.score ?? 0;
// is the option open for the current character? (talk, then try it; the try's code if refused)
function tryCorrect(state) {
  const talking = step(state, P("act_talk_elder"), worldData).state;
  return rejectedCode(step(talking, CHOOSE("opt_correct_legend"), worldData)) ?? "accepted";
}

const dispersed = run(createInitialState({ worldSeed: SEED, data: worldData }).state, TO_DISPERSAL).state;
const aged = run(dispersed, [WAIT_DAY, WAIT_DAY]).state; // the legend's time
const heardLegend = run(aged, ASK_NEWS).state;
const sawTruth = run(heardLegend, REINVESTIGATE).state; // the legend, corrected by the ruins

// 1. who may correct the legend: only a character who heard it and then saw the truth, while it
// is still uncorrected (the legend is heard only in its time, so not before it exists)
function testWhoMayCorrect() {
  assert.strictEqual(knowledgeOf(sawTruth, "player_1").rum_bandits_legend.claim, "dispersed");
  assert.strictEqual(tryCorrect(sawTruth), "accepted");

  assert.strictEqual(tryCorrect(dispersed), "requirements_not_met", "not before the legend exists");
  assert.strictEqual(tryCorrect(heardLegend), "requirements_not_met", "hearing the legend is not seeing the truth");
  const newsOnly = run(run(dispersed, ASK_NEWS).state, [WAIT_DAY, WAIT_DAY]).state;
  assert.strictEqual(knowledgeOf(newsOnly, "player_1").rum_bandits_fate.claim, "dispersed");
  assert.strictEqual(tryCorrect(newsOnly), "requirements_not_met", "the elder's own news is not a correction of his legend");
}

// 2. correcting it: the world's record changes once, the elder is pleased once, the option closes
function testCorrecting() {
  const { state, log } = run(sawTruth, CORRECT);
  assert.ok(noRejects(log));
  assert.deepStrictEqual(narrations(log), ["txt_correct_legend"]);
  assert.strictEqual(state.flags.bandits_tale_corrected, true);
  assert.strictEqual(elderScore(state, "player_1"), elderScore(sawTruth, "player_1") + 5);
  assert.strictEqual(tryCorrect(state), "requirements_not_met", "the tale is corrected: nothing left to correct");
  assert.deepStrictEqual(validateState(state), []);
  return state;
}

// 3. new information: after the correction the elder tells the true account, and the legend is gone
// from his telling -- for the same character and for anyone after them
function testTheElderNowTellsTheTruth(corrected) {
  const asked = run(corrected, ASK_NEWS);
  assert.ok(noRejects(asked.log));
  assert.deepStrictEqual(narrations(asked.log), ["txt_bandit_news_corrected"]);

  const successor = run(run(corrected, DIE_IN_RUINS).state, [START_SUCCESSOR]).state;
  assert.deepStrictEqual(knowledgeOf(successor, "player_2"), {}, "no knowledge is inherited (D-71 (1))");
  const heard = run(successor, ASK_NEWS);
  assert.ok(noRejects(heard.log));
  assert.deepStrictEqual(narrations(heard.log), ["txt_bandit_news_corrected"]);
  const known = knowledgeOf(heard.state, "player_2");
  assert.deepStrictEqual(Object.keys(known), ["rum_bandits_fate"], "the truth, and no legend");
  assert.deepStrictEqual([known.rum_bandits_fate.claim, known.rum_bandits_fate.source], ["dispersed", "npc_elder"]);
}

// 4. an uncorrected world is unchanged: a successor still hears the legend
function testUncorrectedWorldUnchanged() {
  const successor = run(run(sawTruth, DIE_IN_RUINS).state, [START_SUCCESSOR]).state;
  const heard = run(successor, ASK_NEWS);
  assert.deepStrictEqual(narrations(heard.log), ["txt_bandit_legend"]);
  assert.strictEqual(knowledgeOf(heard.state, "player_2").rum_bandits_legend.claim, "slain");
}

// 5. save/load, replay, and a save made before this change (no flag: an uncorrected world)
function testPersistence(corrected) {
  for (const state of [sawTruth, corrected]) {
    const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_legend", state, { savedAt: 1 }))));
    assert.deepStrictEqual(loaded, state);
    assert.deepStrictEqual(run(loaded, [...CORRECT, ...ASK_NEWS]).log, run(state, [...CORRECT, ...ASK_NEWS]).log);
  }
  assert.deepStrictEqual(checkDataCompatibility(sawTruth, worldData), []);
  assert.strictEqual(sawTruth.flags.bandits_tale_corrected, undefined, "a world before the correction has no flag, as an older save");
}

assert.deepStrictEqual(validateData(worldData), []);
testWhoMayCorrect();
const corrected = testCorrecting();
testTheElderNowTellsTheTruth(corrected);
testUncorrectedWorldUnchanged();
testPersistence(corrected);

console.log("V2-Core-46 data-world-legend-correction.test.js: all checks passed");
