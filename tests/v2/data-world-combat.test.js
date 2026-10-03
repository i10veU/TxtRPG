// V2-Core-50 (Issue #133, Master Spec Milestone F): the first fight -- the character against the
// bandit leader, in the real pack, with the existing contracts only (§5.7: a `choice` per
// exchange, an option `check` opposed by the leader's wit, `outcomes` that hit one side or both;
// `alive`/`hp` from D-78; no combat engine, no turn queue, no resource cost -- Gate 4 = C).
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const FIGHT = P("act_fight_leader");
const STRIKE = CHOOSE("opt_fight_strike");
const COUNTER = CHOOSE("opt_fight_counter");
const FLEE = CHOOSE("opt_fight_flee");

// the rumor, a lantern, a successful investigation (the relic; 60 investigation points with the two
// observations -> the keen eye), rest to full HP, and back to the ruins (the hazard: 10 -> 6)
const TO_RELIC = [
  P("act_talk_elder"), CHOOSE("opt_ask_ruins"), MOVE("loc_market"), P("act_buy_lantern"),
  MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins")
];
const BACK_READY = [MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins")];
const READY = [P("act_observe_village"), P("act_observe_village"), ...TO_RELIC, ...BACK_READY];
const DIE_IN_RUINS = [MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (seed) => createInitialState({ worldSeed: seed, data: worldData }).state;
const rejectedCode = (result) => result.events.find((e) => e.type === "action.rejected")?.data.code;
const anyRejected = (log) => log.some((r) => rejectedCode(r) !== undefined);
const narrations = (log) => log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const tierOf = (result) => result.events.find((e) => e.type === "check.resolved")?.data.tier;
const leader = (state) => state.actors.npc_bandit_leader;
const player = (state) => state.actors[state.player.actorId];
const combatPoints = (state) => player(state).growth.growth_wanderer.proficiency?.combat ?? 0;
const inFight = (state) => state.pending?.kind === "choice" && state.pending.choiceId === "choice_fight_leader";

// a ready character on `seed` (or undefined when the investigation fails there)
function ready(seed, actions = READY) {
  const { state, log } = run(start(seed), actions);
  if (anyRejected(log) || !(player(state).inventory.item_relic > 0)) return undefined;
  return state;
}
// fight with one option until the fight ends; the result of every exchange
function fightOut(state, option) {
  let s = step(state, FIGHT, worldData).state;
  const exchanges = [];
  while (inFight(s) && exchanges.length < 30) {
    const result = step(s, option, worldData);
    exchanges.push(result);
    s = result.state;
  }
  return { state: s, exchanges };
}
const readySeeds = (() => {
  const found = [];
  for (let i = 0; i < 80; i += 1) {
    const state = ready(`history-${i}`);
    if (state) found.push({ seed: `history-${i}`, state });
  }
  assert.ok(found.length >= 30, `enough seeds reach the fight (${found.length})`);
  return found;
})();

// 1. who may start the fight: at the ruins where the leader is, with the character's own proof,
// while the leader lives and the case is open
function testWhoMayFight() {
  const { seed, state } = readySeeds[0];
  const started = step(state, FIGHT, worldData);
  assert.strictEqual(rejectedCode(started), undefined);
  assert.deepStrictEqual(started.state.pending, { kind: "choice", choiceId: "choice_fight_leader", sourceId: "act_fight_leader" });
  assert.deepStrictEqual(narrations([started]), ["txt_fight_start"]);
  assert.ok(view(state, worldData).actions.some((a) => a.actionId === "act_fight_leader"), "offered when it can be done");

  const noRelic = run(start(seed), [P("act_talk_elder"), CHOOSE("opt_ask_ruins"), MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins")]).state;
  assert.strictEqual(rejectedCode(step(noRelic, FIGHT, worldData)), "requirements_not_met", "no proof");
  assert.ok(!view(noRelic, worldData).actions.some((a) => a.actionId === "act_fight_leader"), "not offered");
  const inVillage = run(state, [MOVE("loc_village")]).state;
  assert.strictEqual(rejectedCode(step(inVillage, FIGHT, worldData)), "requirements_not_met", "not where he is");
  const leaderAway = structuredClone(state);
  leader(leaderAway).locationId = "loc_market";
  assert.strictEqual(rejectedCode(step(leaderAway, FIGHT, worldData)), "requirements_not_met", "he is not there");
  const fallen = structuredClone(state);
  Object.assign(leader(fallen), { alive: false, hp: { current: 0, max: 10 } });
  assert.strictEqual(rejectedCode(step(fallen, FIGHT, worldData)), "requirements_not_met", "he has fallen (whatever felled him)");
  const resolved = structuredClone(state);
  resolved.cases = { case_ruins_mystery: { stage: "resolved", since: 0 } };
  assert.strictEqual(rejectedCode(step(resolved, FIGHT, worldData)), "requirements_not_met", "the case is over");
}

// 2. one exchange: the tier decides who is hit; 5 minutes; the combat practice grows; the next
// exchange follows while both stand
function testExchangeRules() {
  // a first exchange: the leader has his full stamina, so a clean hit (`fail`) is his heavy blow, +1
  // (V2-Core-59, D-88; tests/v2/data-world-npc-capability.test.js has the plain hit below 3)
  const expected = {
    opt_fight_strike: { great: [-7, 0], success: [-5, 0], partial: [-2, -2], fail: [0, -4] },
    opt_fight_counter: { great: [-10, 0], success: [-7, 0], partial: [0, -1], fail: [0, -5] }
  };
  const seen = new Set();
  for (const { state } of readySeeds) {
    const fighting = step(state, FIGHT, worldData).state;
    for (const option of [STRIKE, COUNTER]) {
      const result = step(fighting, option, worldData);
      assert.strictEqual(rejectedCode(result), undefined);
      const tier = tierOf(result);
      const [toLeader, toPlayer] = expected[option.optionId][tier];
      const after = result.state;
      assert.strictEqual(leader(after).hp.current - leader(fighting).hp.current, toLeader, `${option.optionId} ${tier}`);
      assert.strictEqual(player(after).hp.current - player(fighting).hp.current, toPlayer, `${option.optionId} ${tier}`);
      assert.strictEqual(after.time.minute - fighting.time.minute, 5);
      assert.strictEqual(combatPoints(after) - combatPoints(fighting), 5);
      assert.strictEqual(inFight(after), leader(after).alive && player(after).alive);
      assert.deepStrictEqual(validateState(after), []);
      seen.add(`${option.optionId}:${tier}`);
    }
  }
  for (const key of ["opt_fight_strike:success", "opt_fight_strike:fail", "opt_fight_strike:partial", "opt_fight_counter:success", "opt_fight_counter:fail"]) {
    assert.ok(seen.has(key), `exchange outcome seen: ${key}`);
  }
}

// 3. victory: the leader falls; the case is over, his gang has no leader and is cowed before the
// victor; the existing world follows (the confrontation and the fight close, the market pays the
// victor, the dispersal becomes history)
function testVictory() {
  const win = readySeeds.map(({ seed, state }) => ({ seed, ...fightOut(state, STRIKE) })).find((r) => !leader(r.state).alive && player(r.state).alive);
  assert.ok(win, "some seed is a victory");
  const { state, exchanges } = win;
  assert.ok(narrations(exchanges).includes("txt_fight_victory"));
  assert.strictEqual(leader(state).hp.current, 0);
  assert.strictEqual(state.pending, null, "the fight is over");
  assert.strictEqual(state.cases.case_ruins_mystery.stage, "resolved");
  assert.deepStrictEqual(state.relations["npc_bandit_leader:org_bandits"].tags, []);
  assert.ok(state.relations["org_bandits:player_1"].tags.includes("cowed"));
  assert.ok(exchanges.at(-1).events.some((e) => e.type === "actor.died" && e.actorId === "npc_bandit_leader"));
  assert.strictEqual(rejectedCode(step(state, FIGHT, worldData)), "requirements_not_met");
  const atVillage = run(state, [MOVE("loc_village")]).state;
  assert.strictEqual(rejectedCode(step(atVillage, P("act_confront_leader"), worldData)), "requirements_not_met", "a fallen leader cannot be confronted");
  const market = run(atVillage, [MOVE("loc_market")]);
  assert.ok(narrations(market.log).includes("txt_market_reopens"), "the market pays the victor");
  assert.ok(state.facts.fact_bandits_fate?.value === "dispersed", "the gang scatters: the history starts");
  assert.deepStrictEqual(validateState(state), []);
}

// 4. defeat: the character falls; nothing more is offered (a new character, §9); the leader keeps
// his wounds -- a successor meets the wounded leader, and fights him only with their own proof
function testDefeat() {
  const loss = readySeeds.map(({ seed, state }) => ({ seed, ...fightOut(state, STRIKE) })).find((r) => leader(r.state).alive && !player(r.state).alive && leader(r.state).hp.current < 10);
  assert.ok(loss, "some seed is a defeat with the leader wounded");
  const { state } = loss;
  assert.deepStrictEqual(state.pending, { kind: "newCharacter" });
  assert.notStrictEqual(state.cases?.case_ruins_mystery?.stage, "resolved");
  const wounds = leader(state).hp.current;
  const successor = run(state, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(leader(successor).hp.current, wounds, "the wounds stay in the world");
  const atRuins = run(successor, [MOVE("loc_ruins")]);
  assert.strictEqual(rejectedCode(step(atRuins.state, FIGHT, worldData)), "requirements_not_met", "the successor has no proof of their own");
}

// 5. both fall in one exchange: the leader's fall still ends the case, and the character's asks
// for a new one
function testBothFall() {
  const both = readySeeds.map(({ state }) => fightOut(state, STRIKE)).find((r) => !leader(r.state).alive && !player(r.state).alive);
  assert.ok(both, "some seed ends with both fallen");
  assert.strictEqual(both.state.cases.case_ruins_mystery.stage, "resolved");
  assert.deepStrictEqual(both.state.pending, { kind: "newCharacter" });
}

// 6. fleeing: back to the village, 45 minutes; the leader lives, keeps his wounds and remembers;
// the fight can be taken up again
function testFlee() {
  const { state } = readySeeds[0];
  const fighting = step(state, FIGHT, worldData).state;
  const struck = step(fighting, STRIKE, worldData).state;
  if (!inFight(struck)) return assert.fail("the first exchange ended the fight on this seed");
  const fled = step(struck, FLEE, worldData);
  assert.strictEqual(rejectedCode(fled), undefined);
  assert.deepStrictEqual(narrations([fled]), ["txt_fight_flee"]);
  const after = fled.state;
  assert.strictEqual(after.pending, null);
  assert.strictEqual(player(after).locationId, "loc_village");
  assert.strictEqual(after.time.minute - struck.time.minute, 45);
  assert.strictEqual(leader(after).hp.current, leader(struck).hp.current);
  assert.strictEqual(after.relations["npc_bandit_leader:player_1"].score - (struck.relations["npc_bandit_leader:player_1"]?.score ?? 0), -10);
  const again = run(after, [MOVE("loc_ruins"), FIGHT]);
  assert.ok(!anyRejected(again.log) && inFight(again.state), "the fight can be taken up again");
}

// 7. the technique needs the keen eye: a character with the relic but without it (no observation:
// 30 investigation points) cannot counter, and the exchange is still pending
function testCounterNeedsKeenEye() {
  let state;
  for (let i = 0; i < 80 && !state; i += 1) state = ready(`history-${i}`, [...TO_RELIC, ...BACK_READY]);
  assert.ok(state, "some seed gives the relic without the keen eye");
  assert.strictEqual(player(state).growth.growth_wanderer.unlocks?.unl_keen_eye, undefined);
  const fighting = step(state, FIGHT, worldData).state;
  const refused = step(fighting, COUNTER, worldData);
  assert.strictEqual(rejectedCode(refused), "requirements_not_met");
  assert.ok(inFight(refused.state));
  assert.strictEqual(rejectedCode(step(fighting, STRIKE, worldData)), undefined);
}

// 8. save/load in the middle of the fight, and replay
function testSaveMidFight() {
  const { state } = readySeeds[0];
  const fighting = step(state, FIGHT, worldData).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_fight", fighting, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fighting);
  assert.deepStrictEqual(fightOut(loaded, STRIKE).exchanges.length > 0, true);
  const direct = run(fighting, [STRIKE, STRIKE]).log;
  assert.deepStrictEqual(run(loaded, [STRIKE, STRIKE]).log, direct);
}

// 9. after a fight the hideout tells it: re-investigating once the tale exists shows the traces of
// the fight, not the abandoned hideout
function testHideoutAfterFight() {
  let shown = 0;
  for (const { state } of readySeeds) {
    const won = fightOut(state, STRIKE).state;
    if (leader(won).alive || !player(won).alive) continue;
    const { log } = run(won, [MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins"), P("act_investigate_ruins")]);
    if (anyRejected(log) || !player(log.at(-1).state).alive) continue;
    const texts = narrations(log);
    assert.ok(!texts.includes("txt_hideout_abandoned"));
    if (texts.includes("txt_hideout_after_fight")) shown += 1;
  }
  assert.ok(shown >= 1, `the traces of the fight are seen on some seed (${shown})`);
}

assert.deepStrictEqual(validateData(worldData), []);
testWhoMayFight();
testExchangeRules();
testVictory();
testDefeat();
testBothFall();
testFlee();
testCounterNeedsKeenEye();
testSaveMidFight();
testHideoutAfterFight();

console.log("V2-Core-50 data-world-combat.test.js: all checks passed");
