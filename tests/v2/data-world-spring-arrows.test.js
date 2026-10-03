// V2-Core-68 (#170, Fantasy World Vertical Slice 3, step 1 -- the arrows at the spring): the bandits'
// story and the well's meet, through the ordinary step() API and the real pack. No engine change;
// additive content only (D-92):
//   handling the spring's carcass (a successful search, the purification) records the world's truth --
//   bandit arrows (`fact_spring_fouler`); a character who knows the hideout reads them, once
//   (`rum_spring_bandits`); telling the elder, once for the world (`spring_bandits_told`; +5 on the
//   teller's own edge), changes what the village says from then on, to anyone, a successor too -- and
//   the account says whether the leader behind it still lives.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const H = (optionId) => [P("act_talk_herbalist"), C(optionId)];
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
// herb-30 (tests/v2/data-world-herbalism.test.js): the well is missed, the herbalist tells the way, the
// search succeeds; dialogue rolls nothing, so asking the elder first keeps every roll the same
const SEED = "herb-30";
const TO_SPRING = [P("act_inspect_well"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), ...H("opt_herbalist_teach"), M("loc_village"), M("loc_forest_spring")];
const SEARCH = P("act_search_spring");

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)}`);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const rejected = (state, action) => step(state, action, worldData).events.find((e) => e.type === "action.rejected")?.data.code;
const start = (seed = SEED, templateId) => createInitialState({ worldSeed: seed, data: worldData, templateId }).state;
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const knows = (state, rumorId) => evaluateCondition({ op: "rumor", rumor: rumorId }, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
const offered = (state, optionId) => {
  const option = worldData.choices.choice_elder_dialogue.options.find((o) => o.id === optionId);
  return evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};
const elderScore = (state) => state.relations?.[`npc_elder:${state.player.actorId}`]?.score ?? 0;

// 1. the world's truth is recorded by the search; only a character who knows the hideout reads it
function testReadingTheArrows() {
  assert.deepStrictEqual(validateData(worldData), []);
  // without the hideout: the fact, but no reading
  const blind = run(start(), [...TO_SPRING, SEARCH]);
  assert.strictEqual(blind.state.facts.fact_spring_fouler.value, "bandits");
  assert.strictEqual(knows(blind.state, "rum_spring_bandits"), false);
  assert.ok(!texts(blind.log.at(-1)).includes("txt_spring_bandit_arrows"));
  // with the hideout (the elder's rumor): read, first-hand
  const { state, log } = run(start(), [...E("opt_ask_ruins"), ...TO_SPRING, SEARCH]);
  assert.ok(texts(log.at(-1)).includes("txt_spring_bandit_arrows"));
  assert.deepStrictEqual(state.knowledge.player_1.rum_spring_bandits.sources, ["obs_loc_forest_spring"]);
  assert.strictEqual(state.knowledge.player_1.rum_spring_bandits.claim, "bandits");
  // read once: a second successful search does not tell it again (find one)
  for (let i = 0; i < 200; i += 1) {
    const r = step({ ...state, rng: start(`arrow-roll-${i}`).rng }, SEARCH, worldData);
    if (r.events.find((e) => e.type === "check.resolved").data.tier !== "success") continue;
    assert.ok(!texts(r).includes("txt_spring_bandit_arrows"));
    return state;
  }
  assert.fail("no successful search found");
}

// 2. learning of the hideout later: the arrows are read when the carcass is buried
function testReadAtThePurification() {
  const remedy = [
    P("act_gather_herbs"), P("act_gather_herbs"), P("act_gather_herbs"), M("loc_village"),
    ...E("opt_ask_ruins"), M("loc_market"), ...H("opt_herbalist_brew"), M("loc_village"), M("loc_forest_spring")
  ];
  const ready = run(start(), [...TO_SPRING, SEARCH, ...remedy]).state;
  assert.strictEqual(knows(ready, "rum_spring_bandits"), false, "the search came before the hideout");
  const purify = step(ready, P("act_purify_spring"), worldData);
  assert.deepStrictEqual(texts(purify), ["txt_purify_spring", "txt_spring_bandit_arrows"]);
  assert.ok(knows(purify.state, "rum_spring_bandits"));
}

// 3. telling the elder: once for the world, +5 on the teller's edge; the village's account changes
function testTellingTheElder(read) {
  const atElder = run(read, [M("loc_village")]).state;
  assert.ok(offered(atElder, "opt_tell_spring_arrows"));
  const before = elderScore(atElder);
  const { state, log } = run(atElder, E("opt_tell_spring_arrows"));
  assert.deepStrictEqual(texts(log[1]), ["txt_tell_spring_arrows", "txt_spring_bandits_leader_lives"], "the leader still lives on this path");
  assert.strictEqual(state.flags.spring_bandits_told, true);
  assert.strictEqual(elderScore(state), before + 5);
  assert.strictEqual(offered(state, "opt_tell_spring_arrows"), false, "once for the world");
  // the account, told to anyone from now on: the elder about the ruins, the herbalist about the sickness
  const ruins = run(state, E("opt_ask_ruins")).log[1];
  assert.deepStrictEqual(texts(ruins), ["txt_ask_ruins", "txt_ask_ruins_spring"]);
  assert.strictEqual(elderScore(run(state, E("opt_ask_ruins")).state), before + 5, "asking again earns nothing");
  const herbalist = run(state, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]).log[2];
  assert.deepStrictEqual(texts(herbalist), ["txt_herbalist_sickness", "txt_herbalist_bandit_rumor"]);
  // before the telling none of it
  assert.deepStrictEqual(texts(run(atElder, E("opt_ask_ruins")).log[1]), ["txt_ask_ruins"]);
  assert.deepStrictEqual(texts(run(atElder, [M("loc_market"), ...H("opt_herbalist_ask_sickness")]).log[2]), ["txt_herbalist_sickness"]);
  // a character who never read the arrows is not offered the telling
  const blind = run(start(), [...TO_SPRING, SEARCH, M("loc_village")]).state;
  assert.strictEqual(offered(blind, "opt_tell_spring_arrows"), false);
  return state;
}

// 4. the leader's fate is in the account: after the fight he is dead
function testTheLeaderFallen() {
  const ASK = (o) => [P("act_talk_elder"), C(o)];
  const TO_FIGHT = [
    P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
    M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
    ...ASK("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"),
    M("loc_village"), P("act_rest_village"), P("act_rest_village"),
    ...ASK("opt_report_findings"), ...ASK("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
    ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C)
  ];
  let state = run(start("integrated-36", "start_scout"), [...TO_FIGHT, M("loc_village"), P("act_rest_village"), P("act_rest_village"), M("loc_market"), ...H("opt_herbalist_ask_sickness"), M("loc_village"), M("loc_forest_spring")]).state;
  assert.strictEqual(state.actors.npc_bandit_leader.alive, false);
  // search until the arrows are read, resting in the village when HP runs low
  for (let i = 0; i < 20 && !knows(state, "rum_spring_bandits"); i += 1) {
    state = run(state, state.actors.player_1.hp.current <= 4 ? [M("loc_village"), P("act_rest_village"), P("act_rest_village"), M("loc_forest_spring")] : [SEARCH]).state;
  }
  assert.ok(knows(state, "rum_spring_bandits"));
  const told = run(state, [M("loc_village"), ...E("opt_tell_spring_arrows")]);
  assert.deepStrictEqual(texts(told.log[2]), ["txt_tell_spring_arrows", "txt_spring_bandits_leader_dead"]);
  const news = run(told.state, E("opt_ask_bandit_news")).log[1];
  assert.ok(texts(news).at(-1) === "txt_spring_bandits_leader_dead", "the bandits' news carries it too");
}

// 5. a successor: told the village's account, not offered the telling, still able to read the arrows
function testSuccessor(told) {
  let s = run(told, [M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins")]).state;
  for (let i = 0; i < 5 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(knows(next, "rum_spring_bandits"), false, "knowledge is not inherited");
  assert.strictEqual(next.flags.spring_bandits_told, true, "the world's account stays");
  assert.deepStrictEqual(texts(run(next, E("opt_ask_ruins")).log[1]), ["txt_ask_ruins", "txt_ask_ruins_spring"]);
  const heard = run(next, E("opt_ask_ruins")).state;
  assert.strictEqual(elderScore(heard), 5, "the successor's own first telling, nothing of the predecessor's");
  assert.strictEqual(offered(heard, "opt_tell_spring_arrows"), false);
}

// 6. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/spring_fouler|spring_bandits/.test(JSON.stringify(start())), "a new game writes nothing of it");
  const path = [...E("opt_ask_ruins"), ...TO_SPRING, SEARCH, M("loc_village"), ...E("opt_tell_spring_arrows")];
  const end = run(start(), path).state;
  assert.deepStrictEqual(validateState(end), []);
  const mid = run(start(), path.slice(0, -3)).state;
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_arrows", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(run(loaded, path.slice(-3)).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(start(), path).state, end, "the same input, the same result");
}

const read = testReadingTheArrows();
testReadAtThePurification();
const told = testTellingTheElder(read);
testTheLeaderFallen();
testSuccessor(told);
testSaveAndDeterminism();

console.log("V2-Core-68 data-world-spring-arrows.test.js: all checks passed");
