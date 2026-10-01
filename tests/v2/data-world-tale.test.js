// V2-Core-45 (Issue #123, the V2 slice of #66 "World History & Discovery"): the bandits' dispersal
// becomes history. Immediate change -> time -> the account changes -> a later character discovers.
// Built only from existing contracts (no engine, state field, save schema or scheduler change):
//   - the dispersal (case resolved, the leader no longer a member -- not reversible since V2-Core-44)
//     starts `evt_bandits_tale` (a `data.events` entry, cooldown 1440): it records the objective
//     fact `fact_bandits_fate = "dispersed"` and counts signal `bandits_tale_age` 1, 2, 3, then stops
//     (D-74's delayed-change pattern)
//   - the elder tells it as news (rumor `rum_bandits_fate`, claim "dispersed", 70) while the age is
//     below 3 -- about two days -- and as the village's legend afterwards (rumor `rum_bandits_legend`,
//     claim "slain", 40)
//   - a successful investigation at the ruins observes the fact (observe mode): the truth, first
//     hand, and a believed legend is corrected (higher confidence wins, D-14); before the dispersal
//     there is no fact, so nothing is observed and the earlier path is unchanged
//   - a successor inherits no knowledge (D-71 (1)) and finds the same history on their own
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const WAIT_DAY = { type: "wait", minutes: 1440 };

// on this seed the investigation, the confrontation and a later investigation all succeed
// (tests/v2/data-world-history.test.js finds the same seeds)
const SEED = "history-41";
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings"),
  P("act_confront_leader"), P("act_talk_elder"), CHOOSE("opt_bandits_disperse")
];
const ASK_NEWS = [P("act_talk_elder"), CHOOSE("opt_ask_bandit_news")];
const REINVESTIGATE = [P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_investigate_ruins"), MOVE("loc_village")];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const noRejects = (log) => log.every((r) => !r.events.some((e) => e.type === "action.rejected"));
const knowledgeOf = (state, actorId) => state.knowledge?.[actorId] ?? {};
const narrations = (log) => log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const tale = (state) => state.signals?.bandits_tale_age ?? 0;
const start = () => createInitialState({ worldSeed: SEED, data: worldData }).state;

// 1. the dispersal step records the history and starts the clock; nothing before it does
function testDispersalStartsHistory() {
  const { state, log } = run(start(), TO_DISPERSAL);
  assert.ok(noRejects(log));
  const before = log.at(-2).state;
  assert.strictEqual(before.facts.fact_bandits_fate, undefined, "no history before the dispersal");
  assert.strictEqual(tale(before), 0);
  const dispersal = log.at(-1);
  assert.ok(dispersal.events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_bandits_tale"));
  assert.deepStrictEqual(state.facts.fact_bandits_fate, { value: "dispersed", since: state.time.minute });
  assert.strictEqual(tale(state), 1);
  assert.ok(!("facts" in view(state, worldData)), "the objective history is not in the view (§8.4)");
  return state;
}

// 2. the clock: one count per day after the dispersal, at the first accepted step, then it stops
function testClock(dispersed) {
  let state = run(dispersed, [{ type: "wait", minutes: 60 }]).state;
  assert.strictEqual(tale(state), 1, "the same day: still 1");
  const ages = [];
  for (let i = 0; i < 4; i += 1) {
    state = run(state, [WAIT_DAY]).state;
    ages.push(tale(state));
  }
  assert.deepStrictEqual(ages, [2, 3, 3, 3]);
  assert.strictEqual(state.fired.evt_bandits_tale.count, 3);
  assert.deepStrictEqual(state.facts.fact_bandits_fate.value, "dispersed");
}

// 3. the account changes with time: news first, the legend later
function testNewsThenLegend(dispersed) {
  const fresh = run(dispersed, ASK_NEWS);
  assert.ok(noRejects(fresh.log));
  assert.deepStrictEqual(narrations(fresh.log), ["txt_bandit_news"]);
  const news = knowledgeOf(fresh.state, "player_1").rum_bandits_fate;
  assert.deepStrictEqual([news.claim, news.source, news.confidence], ["dispersed", "npc_elder", 70]);
  assert.strictEqual(knowledgeOf(fresh.state, "player_1").rum_bandits_legend, undefined);

  const aged = run(dispersed, [WAIT_DAY, WAIT_DAY]).state;
  assert.strictEqual(tale(aged), 3);
  const later = run(aged, ASK_NEWS);
  assert.ok(noRejects(later.log));
  assert.deepStrictEqual(narrations(later.log), ["txt_bandit_legend"]);
  const legend = knowledgeOf(later.state, "player_1").rum_bandits_legend;
  assert.deepStrictEqual([legend.claim, legend.source, legend.confidence], ["slain", "src_village_legend", 40]);
  assert.strictEqual(knowledgeOf(later.state, "player_1").rum_bandits_fate, undefined, "the legend is all the elder tells now");
  return later.state;
}

// 4. exploration finds the truth: the hideout was abandoned, not fought over; a believed legend is
// corrected by the first-hand observation
function testTruthAtTheRuins(believesLegend) {
  const { state, log } = run(believesLegend, REINVESTIGATE);
  assert.ok(noRejects(log));
  assert.ok(["success", "great"].includes(log[3].events.find((e) => e.type === "check.resolved").data.tier));
  assert.ok(narrations(log).includes("txt_hideout_abandoned"));
  const known = knowledgeOf(state, "player_1");
  assert.deepStrictEqual([known.rum_bandits_fate.claim, known.rum_bandits_fate.source, known.rum_bandits_fate.confidence], ["dispersed", "obs_loc_ruins", 80]);
  assert.deepStrictEqual([known.rum_bandits_legend.claim, known.rum_bandits_legend.source, known.rum_bandits_legend.confidence], ["dispersed", "obs_loc_ruins", 80], "the legend is corrected");
  assert.deepStrictEqual(validateState(state), []);
}

// 5. a later life: no inherited knowledge; days later the elder tells the legend, and the ruins tell
// the truth
function testSuccessorDiscovers(dispersed) {
  const dead = run(dispersed, [MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))]).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const successor = run(dead, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.deepStrictEqual(knowledgeOf(successor, "player_2"), {}, "nothing is inherited");
  let state = run(successor, [WAIT_DAY, WAIT_DAY]).state;
  assert.strictEqual(tale(state), 3);
  const heard = run(state, ASK_NEWS);
  assert.ok(noRejects(heard.log));
  assert.strictEqual(knowledgeOf(heard.state, "player_2").rum_bandits_legend.claim, "slain");
  state = heard.state;
  // the successor's own way to the ruins: the elder's rumor about them, a lantern, the investigation
  // (it succeeds on this seed)
  const path = [P("act_talk_elder"), CHOOSE("opt_ask_ruins"), MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins")];
  const { state: after, log } = run(state, path);
  assert.ok(noRejects(log));
  assert.ok(["success", "great"].includes(log.at(-1).events.find((e) => e.type === "check.resolved").data.tier));
  assert.ok(narrations(log).includes("txt_hideout_abandoned"));
  assert.strictEqual(knowledgeOf(after, "player_2").rum_bandits_fate.claim, "dispersed");
  assert.strictEqual(knowledgeOf(after, "player_2").rum_bandits_legend.claim, "dispersed", "the successor's own legend is corrected");
  assert.strictEqual(knowledgeOf(after, "player_1").rum_bandits_legend, undefined, "the predecessor's record is untouched");
}

// 6. persistence and replay; a save made before this change (dispersed, no fact, no clock) loads,
// and the history starts at its next step (no migration)
function testSaveReplayAndOldSave(dispersed) {
  const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_tale", dispersed, { savedAt: 1 }))));
  assert.deepStrictEqual(reloaded, dispersed);
  const path = [WAIT_DAY, WAIT_DAY, ...ASK_NEWS, ...REINVESTIGATE];
  assert.deepStrictEqual(run(reloaded, path).log, run(dispersed, path).log);

  const old = structuredClone(dispersed);
  delete old.facts.fact_bandits_fate;
  delete old.signals.bandits_tale_age;
  delete old.fired.evt_bandits_tale;
  assert.deepStrictEqual(checkDataCompatibility(old, worldData), []);
  assert.deepStrictEqual(validateState(old), []);
  const next = run(old, [{ type: "wait", minutes: 10 }]).state;
  assert.strictEqual(next.facts.fact_bandits_fate.value, "dispersed");
  assert.strictEqual(tale(next), 1);
}

assert.deepStrictEqual(validateData(worldData), []);
const dispersed = testDispersalStartsHistory();
testClock(dispersed);
const believesLegend = testNewsThenLegend(dispersed);
testTruthAtTheRuins(believesLegend);
testSuccessorDiscovers(dispersed);
testSaveReplayAndOldSave(dispersed);
console.log("V2-Core-45 data-world-tale.test.js: all checks passed");
