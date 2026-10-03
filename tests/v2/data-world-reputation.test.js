// V2-Core-55 (Issue #143, Reputation Decision, D-84): the elder's trust, earned once per meaningful
// event and never by repetition, opens information that changes a fight -- in data, with the
// existing `relation` / `rumor` Conditions and Effects.
//   - farming fix (a): each character gains each meaningful increase once -- asking about the ruins
//     +5 only when the character first learns the rumor; reporting +10 (and `confidant`) only when
//     not yet a confidant; small talk and the bandit news give nothing; the dispersal and the
//     legend's correction keep their +5 (each already once)
//   - trust: the elder -> the character edge at 15 or more; no decay; a saved score is not touched
//   - R1: trusted, 「두목에 대해 더 묻는다」 teaches the leader's old wound (a rumor); knowing it opens
//     the fight option 「그의 오래된 상처를 노린다」 -- base 9 (the strike's 11), the strike's outcomes
//   - a successor has their own edge and their own knowledge (D-71 (1)): nothing is inherited
// No Relation Engine, no save/schema change, no version bump.
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
const TALK = P("act_talk_elder");
const ASK = (optionId) => [TALK, CHOOSE(optionId)];
const SEED = "frontier-canonical-4"; // the investigation and the confrontation succeed (data-world.test.js)
const INVESTIGATED = [
  P("act_observe_village"), P("act_observe_village"), ...ASK("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_rest_village")
];
const TRUSTED = [...INVESTIGATED, ...ASK("opt_report_findings")];
const WOUND_KNOWN = [...TRUSTED, ...ASK("opt_ask_about_leader")];
const DISPERSED = [...TRUSTED, P("act_confront_leader"), ...ASK("opt_bandits_disperse")];
const ELDER = (state) => state.relations?.[`npc_elder:${state.player.actorId}`];
const CHOICES = worldData.choices;
const option = (choiceId, optionId) => CHOICES[choiceId].options.find((o) => o.id === optionId);

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (seed = SEED) => createInitialState({ worldSeed: seed, data: worldData }).state;
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const assertNoReject = (log) => log.forEach((r, i) => assert.strictEqual(rejectedCode(r), undefined, `step ${i}`));
const relationEvents = (result) => result.events.filter((e) => e.type === "relation.changed");
const offered = (state, optionId) => rejectedCode(run(state, ASK(optionId)).log[1]) === undefined;
const plantElder = (state, score) => {
  const s = structuredClone(state);
  s.relations = { ...s.relations, [`npc_elder:${s.player.actorId}`]: { score, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: [] } };
  return s;
};

// 1. the data: what reads the trust, what reads the rumor, the rumor itself
function testData() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(worldData.version, "0.3.0", "no version bump");
  const ask = option("choice_elder_dialogue", "opt_ask_about_leader");
  assert.strictEqual(ask.name, "두목에 대해 더 묻는다");
  assert.deepStrictEqual(ask.requires, { op: "relation", from: "npc_elder", to: "self", min: 15 });
  assert.deepStrictEqual(worldData.rumors.rum_leader_old_wound, { factId: "fact_leader_wound", claim: "old_wound" });
  assert.ok("fact_leader_wound" in worldData.facts);
  const weak = option("choice_fight_leader", "opt_fight_weak_spot");
  const strike = option("choice_fight_leader", "opt_fight_strike");
  assert.strictEqual(weak.name, "그의 오래된 상처를 노린다");
  // since V2-Core-56 (D-85) it also costs 2 stamina (tests/v2/data-world-resource.test.js)
  assert.deepStrictEqual(weak.requires, { op: "and", of: [{ op: "rumor", rumor: "rum_leader_old_wound" }, { op: "resource", resource: "stamina", min: 2 }] });
  assert.deepStrictEqual(weak.check, { ...strike.check, difficulty: { base: 9, opposed: { subject: "npc_bandit_leader", stat: "str" } } });
  assert.strictEqual(strike.check.difficulty.base, 11);
  for (const tier of Object.keys(strike.outcomes)) {
    assert.deepStrictEqual(weak.outcomes[tier].slice(1), strike.outcomes[tier], `${tier}: the strike's damage and results, after the stamina (V2-Core-56)`);
  }
  assert.strictEqual(weak.minutes, strike.minutes);
  // small talk and the news no longer touch the edge; the dispersal and the correction keep +5
  const writesElder = (o) => JSON.stringify(o.effects).includes('"op":"relation","from":"npc_elder"');
  assert.ok(!writesElder(option("choice_elder_dialogue", "opt_small_talk")));
  assert.ok(!writesElder(option("choice_elder_dialogue", "opt_ask_bandit_news")));
  for (const id of ["opt_bandits_disperse", "opt_correct_legend"]) {
    assert.ok(option("choice_elder_dialogue", id).effects.some((e) => e.op === "relation" && e.from === "npc_elder" && e.add === 5), id);
  }
}

// 2. farming fixed: repetition changes nothing; each meaningful increase once
function testNoFarming() {
  const talked = run(start(), [TALK]).state;
  const small = run(talked, [CHOOSE("opt_small_talk"), ...ASK("opt_small_talk"), ...ASK("opt_small_talk")]);
  assertNoReject(small.log);
  assert.ok(small.log.every((r) => relationEvents(r).length === 0), "small talk: no relation change");
  assert.strictEqual(ELDER(small.state), undefined);

  const first = step(talked, CHOOSE("opt_ask_ruins"), worldData);
  assert.deepStrictEqual(relationEvents(first).map((e) => e.data), [{ from: "npc_elder", to: "player_1", delta: 5 }]);
  const again = run(first.state, [...ASK("opt_ask_ruins"), ...ASK("opt_ask_ruins"), ...ASK("opt_ask_ruins")]);
  assertNoReject(again.log);
  assert.ok(again.log.every((r) => relationEvents(r).length === 0), "asking again: the rumor is already known");
  assert.strictEqual(ELDER(again.state).score, 5);
  assert.ok(again.state.knowledge.player_1.rum_ruins_secret, "still told the rumor");

  // reporting: +10 and the tag once; again, nothing
  const trusted = run(start(), TRUSTED);
  assertNoReject(trusted.log);
  assert.deepStrictEqual(relationEvents(trusted.log.at(-1)).map((e) => e.data), [
    { from: "npc_elder", to: "player_1", delta: 10, mode: "cooperation", tagAdded: "confidant" }
  ]);
  assert.strictEqual(ELDER(trusted.state).score, 15);
  const reportAgain = run(trusted.state, [...ASK("opt_report_findings"), ...ASK("opt_report_findings")]);
  assertNoReject(reportAgain.log);
  assert.ok(reportAgain.log.every((r) => relationEvents(r).length === 0));
  assert.deepStrictEqual(ELDER(reportAgain.state), ELDER(trusted.state));
  assert.deepStrictEqual(reportAgain.log[1].events.map((e) => e.type), ["narration", "action.resolved"], "still answered");

  // the canonical history: 5 -> 15 -> 20 (dispersal), and the news adds nothing
  const dispersed = run(start(), DISPERSED);
  assertNoReject(dispersed.log);
  assert.strictEqual(ELDER(dispersed.state).score, 20);
  const news = run(dispersed.state, [...ASK("opt_ask_bandit_news"), ...ASK("opt_ask_bandit_news"), ...ASK("opt_ask_bandit_news")]);
  assertNoReject(news.log);
  assert.ok(news.log.every((r) => relationEvents(r).length === 0), "the news: information only");
  assert.ok(news.state.knowledge.player_1.rum_bandits_fate, "still told");
  assert.strictEqual(ELDER(news.state).score, 20);
  assert.deepStrictEqual(validateState(news.state), []);
}

// 3. the threshold: 15 opens the question, 14 does not; the answer is the old wound
function testTrustOpensTheQuestion() {
  const asked = run(start(), ASK("opt_ask_ruins")).state;
  assert.strictEqual(ELDER(asked).score, 5);
  assert.ok(!offered(asked, "opt_ask_about_leader"));
  const pending = run(asked, [TALK]).state;
  const refused = step(pending, CHOOSE("opt_ask_about_leader"), worldData);
  assert.strictEqual(rejectedCode(refused), "requirements_not_met");
  assert.deepStrictEqual(refused.state, pending, "nothing changes, the dialogue stays open");
  assert.ok(!offered(plantElder(asked, 14), "opt_ask_about_leader"), "14 is not trust");
  assert.ok(offered(plantElder(asked, 15), "opt_ask_about_leader"), "15 is");

  const known = run(start(), WOUND_KNOWN);
  assertNoReject(known.log);
  const answer = known.log.at(-1);
  assert.deepStrictEqual(answer.events.map((e) => e.type), ["rumor.learned", "narration", "action.resolved"]);
  assert.deepStrictEqual(answer.events[0].data, {
    rumor: "rum_leader_old_wound", factId: "fact_leader_wound", claim: "old_wound", confidence: 70, delta: 70
  });
  assert.strictEqual(answer.events[1].data.textId, "txt_leader_old_wound");
  assert.strictEqual(typeof worldData.texts.txt_leader_old_wound, "string");
  assert.deepStrictEqual(relationEvents(answer), [], "the answer is the reward, not more trust");
  assert.strictEqual(known.state.facts.fact_leader_wound, undefined, "learning a rumor never sets its fact");
  assert.deepStrictEqual(validateState(known.state), []);
}

// 4. the rumor opens the weak spot: base 9 against the strike's 11, the same roll and modifiers
function testRumorOpensTheWeakSpot() {
  const toFight = [MOVE("loc_ruins"), P("act_fight_leader")];
  const without = run(start(), [...TRUSTED, ...toFight]);
  assertNoReject(without.log);
  assert.strictEqual(rejectedCode(step(without.state, CHOOSE("opt_fight_weak_spot"), worldData)), "requirements_not_met");

  const withIt = run(start(), [...WOUND_KNOWN, ...toFight]);
  assertNoReject(withIt.log);
  assert.deepStrictEqual(withIt.state.pending, { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" });
  const weak = step(withIt.state, CHOOSE("opt_fight_weak_spot"), worldData);
  const strike = step(withIt.state, CHOOSE("opt_fight_strike"), worldData);
  assert.strictEqual(rejectedCode(weak), undefined);
  const checkOf = (r) => r.events.find((e) => e.type === "check.resolved").data;
  assert.strictEqual(checkOf(weak).difficulty, 9);
  assert.strictEqual(checkOf(strike).difficulty, 11);
  assert.strictEqual(checkOf(weak).total, checkOf(strike).total, "the same roll and modifiers");
  assert.deepStrictEqual(checkOf(weak).modifiers, checkOf(strike).modifiers);
  assert.strictEqual(weak.state.actors.player_1.growth.growth_wanderer.proficiency.combat, 5, "an exchange like any other");

  // fought out with the weak spot only: the existing victory (the leader falls, the case closes)
  let s = withIt.state;
  for (let i = 0; i < 30 && s.pending?.choiceId === "choice_fight_leader"; i += 1) s = step(s, CHOOSE("opt_fight_weak_spot"), worldData).state;
  assert.ok(s.actors.npc_bandit_leader.alive === false || s.actors.player_1.alive === false, "the fight ends");
  if (s.actors.npc_bandit_leader.alive === false) assert.strictEqual(s.cases.case_ruins_mystery.stage, "resolved");
}

// 5. a successor: their own edge from 0, their own knowledge; the +5 again for them, no question yet
function testSuccessor() {
  let dead = run(start(), [...WOUND_KNOWN, MOVE("loc_ruins")]).state;
  for (let i = 0; i < 12 && dead.pending?.kind !== "newCharacter"; i += 1) dead = step(dead, { type: "wait", minutes: 30 }, worldData).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const heir = run(dead, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(heir.player.actorId, "player_2");
  assert.strictEqual(ELDER(heir), undefined, "no inherited trust");
  assert.strictEqual(heir.relations["npc_elder:player_1"].score, 15, "the first character's edge stays theirs");
  assert.ok(!offered(heir, "opt_ask_about_leader"));
  const asked = step(run(heir, [TALK]).state, CHOOSE("opt_ask_ruins"), worldData);
  assert.deepStrictEqual(relationEvents(asked).map((e) => e.data), [{ from: "npc_elder", to: "player_2", delta: 5 }]);
  assert.strictEqual(asked.state.knowledge.player_2.rum_leader_old_wound, undefined, "no inherited knowledge");
}

// 6. a saved high score (farmed before this change) is kept as it is: not lowered, not repaired
function testSavedScoreKept() {
  const farmed = plantElder(run(start(), ASK("opt_ask_ruins")).state, 55);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_old", farmed, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, farmed);
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);
  const later = run(loaded, [...ASK("opt_small_talk"), ...ASK("opt_ask_ruins"), ...Array.from({ length: 5 }, () => ({ type: "wait", minutes: 1440 }))]);
  assertNoReject(later.log);
  assert.strictEqual(ELDER(later.state).score, 55, "no decay, no correction");
  assert.ok(offered(later.state, "opt_ask_about_leader"), "and it counts as trust");
}

testData();
testNoFarming();
testTrustOpensTheQuestion();
testRumorOpensTheWeakSpot();
testSuccessor();
testSavedScoreKept();

console.log("V2-Core-55 data-world-reputation.test.js: all checks passed");
