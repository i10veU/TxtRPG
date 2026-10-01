// V2-Core-44 (Issue #120, D-71 (3) decided): the world's history in the real pack is not undone by
// investigating again. Once the bandits are dispersed (`opt_bandits_disperse` removes the leader's
// `member` tag), a later successful `act_investigate_ruins` -- by the same character or by a
// successor -- used to write that tag back: the elder's news of the dispersal (a world record,
// offered to successors) stopped, the market's relief became false again, and the dispersal option
// reopened. The membership the ruins reveal is now written only while `case_ruins_mystery` is
// unresolved; the dispersal is only reachable after it is resolved. Data only: no engine change, no
// save migration (a save already in that state is not repaired), pack version unchanged.
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

// rumor -> lantern -> investigation -> report -> confrontation -> dispersal (the decided history)
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings"),
  P("act_confront_leader"), P("act_talk_elder"), CHOOSE("opt_bandits_disperse")
];
// back to full HP, then the ruins again (the hazard hits on arrival and after the hour of searching)
const REINVESTIGATE = [P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_investigate_ruins"), MOVE("loc_village")];
// the predecessor stays in the ruins until the hazard kills them; the successor earns the rumor and a
// lantern of their own and investigates
const DIE_IN_RUINS = [MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))];
const SUCCESSOR_REINVESTIGATES = [
  { type: "startCharacter", templateId: "start_wanderer" }, P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"), MOVE("loc_village")
];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push({ action, result });
    state = result.state;
  }
  return { state, log };
}
const rejected = (entry) => entry.result.events.some((e) => e.type === "action.rejected");
const succeeded = (entry) => ["success", "great"].includes(entry.result.events.find((e) => e.type === "check.resolved")?.data.tier);
const isMember = (state) => (state.relations?.["npc_bandit_leader:org_bandits"]?.tags ?? []).includes("member");
// is this elder option open for the current character? (talk, then try it)
function offered(state, optionId) {
  const talking = step(state, P("act_talk_elder"), worldData).state;
  return !step(talking, CHOOSE(optionId), worldData).events.some((e) => e.type === "action.rejected");
}
function assertHistoryKept(state, label) {
  assert.strictEqual(isMember(state), false, `${label}: the leader is still out of the gang`);
  assert.strictEqual(state.cases.case_ruins_mystery.stage, "resolved", label);
  assert.strictEqual(offered(state, "opt_ask_bandit_news"), true, `${label}: the elder still tells of the dispersal`);
  assert.strictEqual(offered(state, "opt_bandits_disperse"), false, `${label}: the dispersal cannot be decided again`);
  assert.deepStrictEqual(validateState(state), []);
}

// the seeds on which the whole decided history happens (the investigation and the confrontation succeed)
function dispersedRuns() {
  const runs = [];
  for (let i = 0; i < 200; i += 1) {
    const seed = `history-${i}`;
    const { state, log } = run(createInitialState({ worldSeed: seed, data: worldData }).state, TO_DISPERSAL);
    if (log.some(rejected)) continue;
    assert.strictEqual(isMember(state), false, seed);
    runs.push({ seed, state });
  }
  assert.ok(runs.length >= 5, `enough seeds reach the dispersal (${runs.length})`);
  return runs;
}

// 1. the same character investigates again, successfully: the dispersal stands
function testSameCharacter(runs) {
  let successes = 0;
  for (const { seed, state } of runs) {
    const { state: after, log } = run(state, REINVESTIGATE);
    assert.ok(!log.some(rejected), seed);
    assert.strictEqual(after.actors.player_1.alive, true, seed);
    if (succeeded(log[3])) successes += 1;
    assertHistoryKept(after, `${seed} same character`);
  }
  assert.ok(successes >= 2, `the re-investigation succeeds on some seeds (${successes})`);
}

// 2. a successor does the same: the dispersal is the world's, not the predecessor's
function testSuccessor(runs) {
  let successes = 0;
  for (const { seed, state } of runs) {
    const dead = run(state, DIE_IN_RUINS).state;
    assert.deepStrictEqual(dead.pending, { kind: "newCharacter" }, seed);
    const { state: after, log } = run(dead, SUCCESSOR_REINVESTIGATES);
    if (log.some(rejected) || after.actors.player_2?.alive !== true) continue; // the successor did not get that far
    if (succeeded(log[7])) successes += 1;
    assertHistoryKept(after, `${seed} successor`);
  }
  assert.ok(successes >= 1, `a successor's re-investigation succeeds on some seed (${successes})`);
}

// 3. before the case is resolved nothing changes: the first investigation still reveals the
// membership, investigating again before the confrontation keeps it, and the success events are
// the same as before (the guarded Effect sits where the unguarded one was)
function testBeforeResolution() {
  const { state, log } = run(createInitialState({ worldSeed: "history-0", data: worldData }).state, TO_DISPERSAL.slice(0, 9));
  assert.ok(!log.some(rejected));
  assert.ok(succeeded(log.at(-1)));
  assert.strictEqual(isMember(state), true, "the investigation reveals the leader's membership");
  const relationEvents = log.at(-1).result.events.filter((e) => e.type === "relation.changed").map((e) => [e.data.from, e.data.to, e.data.tagAdded]);
  assert.deepStrictEqual(relationEvents, [["npc_bandit_leader", "org_bandits", "member"]]);
  const again = run(state, [MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_investigate_ruins")]).state;
  assert.strictEqual(isMember(again), true);
}

// 4. a save made at the dispersal (same pack id and version) loads, and the history holds after it;
// a save already in the old, revived state is loaded as it is (no repair, no migration)
function testSaveCompatibility(runs) {
  const { state } = runs[0];
  assert.deepStrictEqual(checkDataCompatibility(state, worldData), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_history", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);
  assertHistoryKept(run(loaded, REINVESTIGATE).state, "after save/load");

  const revived = structuredClone(state);
  revived.relations["npc_bandit_leader:org_bandits"].tags = ["member"]; // what the old pack could leave behind
  const revivedLoaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_revived", revived, { savedAt: 1 }))));
  assert.deepStrictEqual(revivedLoaded, revived, "loaded unchanged");
  assert.strictEqual(isMember(run(revivedLoaded, REINVESTIGATE).state), true, "and not repaired by playing on");
}

// 5. deterministic: the same inputs give the same states and events
function testReplay(runs) {
  const { state } = runs[0];
  assert.deepStrictEqual(run(state, REINVESTIGATE).log, run(state, REINVESTIGATE).log);
}

assert.deepStrictEqual(validateData(worldData), []);
const runs = dispersedRuns();
testSameCharacter(runs);
testSuccessor(runs);
testBeforeResolution();
testSaveCompatibility(runs);
testReplay(runs);

console.log("V2-Core-44 data-world-history.test.js: all checks passed");
