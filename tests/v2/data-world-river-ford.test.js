// V2-Core-74 (#180, Fantasy World Vertical Slice 4, step 3 -- the river ford and the outside world):
// through the ordinary step() API and the real pack. No engine change; additive content only (D-92/D-94):
//   the world does not wait -- once the reopened road is in use (its first walker), a caravan comes every
//   three days wherever the player is, leaving the realm's news as the world's facts (the levy, the fair,
//   the unrest); the ferryman (a dialogue NPC) tells the latest and the leader's fate (a scarred man he
//   ferried across, or the tale of his fall); crossing costs 3 silver, or nothing with the elder's letter
//   (an elder who trusts the character, 15+); the far bank's waystation board tells of the royal city,
//   the levy, a bounty on the scarred chief if he lives (or the safe road if he fell), and the village's
//   name if it honoured someone.
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
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const FERRY = (optionId) => [P("act_talk_ferryman"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the dispersal (the leader lives; the elder trusts the character, 15) -- data-world-crossroads
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse")
];
// integrated-36, the scout: the fight (the leader falls)
const TO_HIS_FALL = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), P("act_rest_village"), P("act_rest_village")
];
const TO_FORD = [...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")];

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
const texts = (result) => result.events.filter((e) => e.type === "narration").map((e) => e.data.textId);
const me = (state) => state.actors[state.player.actorId];
const known = (state, fact) => state.facts?.[fact]?.value === "known";
const offered = (state, choiceId, optionId) => {
  const option = worldData.choices[choiceId].options.find((o) => o.id === optionId);
  return option.requires === undefined || evaluateCondition(option.requires, { state, data: worldData, actorId: state.player.actorId, contextKind: "player" });
};

const leaderLives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const leaderFell = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, TO_HIS_FALL).state;
const atFord = run(leaderLives, TO_FORD).state;

// 1. the caravans: only once the road is in use; every three days, wherever the player is; the news in order
function testCaravans() {
  assert.deepStrictEqual(validateData(worldData), []);
  const idle = run(leaderLives, [DAY, DAY, DAY, DAY]).state;
  assert.strictEqual(idle.signals?.caravan_visits, undefined, "nobody walked the road: no caravans");
  assert.strictEqual(atFord.flags.road_walked, true);
  assert.strictEqual(atFord.signals.caravan_visits, 1, "the first caravan, right after the road is walked");
  assert.ok(known(atFord, "fact_realm_levy") && !known(atFord, "fact_realm_fair"));
  const village = run(atFord, [M("loc_crossroads"), M("loc_village")]).state; // the player goes home: the world goes on
  const twoDays = run(village, [DAY, DAY]).state;
  assert.strictEqual(twoDays.signals.caravan_visits, 1, "not yet three days");
  const threeDays = run(twoDays, [DAY]).state;
  assert.strictEqual(threeDays.signals.caravan_visits, 2);
  assert.ok(known(threeDays, "fact_realm_fair") && !known(threeDays, "fact_realm_unrest"));
  const sixDays = run(threeDays, [DAY, DAY, DAY]).state;
  assert.strictEqual(sixDays.signals.caravan_visits, 3);
  assert.ok(known(sixDays, "fact_realm_unrest"));
  // V2-Core-96 (#237): the caravans keep coming, but the realm's news stands after the third
  const later = run(sixDays, [DAY, DAY, DAY, DAY]).state;
  assert.strictEqual(later.signals.caravan_visits, 4, "the road keeps living");
  assert.deepStrictEqual(["fact_realm_levy", "fact_realm_fair", "fact_realm_unrest"].map((f) => later.facts[f]), ["fact_realm_levy", "fact_realm_fair", "fact_realm_unrest"].map((f) => sixDays.facts[f]), "the news stands");
  return { threeDays, sixDays };
}

// 2. the ferryman: the latest news, and the leader's fate as the river saw it
function testFerryman({ threeDays, sixDays }) {
  assert.strictEqual(rejected(leaderLives, P("act_talk_ferryman")), "requirements_not_met", "the ferryman is at the ford");
  const blind = run(leaderLives, [M("loc_crossroads")]).state;
  assert.strictEqual(rejected(blind, M("loc_river_ford")), "requirements_not_met", "the way north is not known");
  const levy = run(atFord, FERRY("opt_ferryman_news"));
  assert.deepStrictEqual(texts(levy.log[1]), ["txt_ferryman_levy", "txt_ferryman_scarred_man"]);
  assert.deepStrictEqual(levy.state.knowledge.player_1.rum_realm_levy.sources, ["npc_ferryman"]);
  assert.strictEqual(levy.state.facts.fact_leader_crossed.value, "far_bank");
  assert.deepStrictEqual(levy.state.knowledge.player_1.rum_leader_crossed.sources, ["npc_ferryman"]);
  const toFord = (s) => run(s, [M("loc_crossroads"), M("loc_river_ford")]).state;
  assert.strictEqual(texts(run(toFord(threeDays), FERRY("opt_ferryman_news")).log[1])[0], "txt_ferryman_fair");
  assert.strictEqual(texts(run(toFord(sixDays), FERRY("opt_ferryman_news")).log[1])[0], "txt_ferryman_unrest");
  const quiet = structuredClone(atFord);
  delete quiet.facts.fact_realm_levy;
  assert.strictEqual(texts(run(quiet, FERRY("opt_ferryman_news")).log[1])[0], "txt_ferryman_quiet");
  const fellAt = run(leaderFell, TO_FORD).state;
  const fell = run(fellAt, FERRY("opt_ferryman_news"));
  assert.deepStrictEqual(texts(fell.log[1]), ["txt_ferryman_levy", "txt_ferryman_leader_fell"]);
  assert.strictEqual(fell.state.facts?.fact_leader_crossed, undefined);
}

// 3. crossing: the fare, or the elder's letter; the far bank only by the ferry; back is free
function testCrossing() {
  assert.strictEqual(rejected(atFord, M("loc_far_bank")), "requirements_not_met", "no road across the river");
  const paid = run(atFord, FERRY("opt_ferryman_cross"));
  assert.deepStrictEqual(texts(paid.log[1]), ["txt_ferryman_cross", "txt_far_bank_first"]);
  assert.strictEqual(paid.state.actors.player_1.locationId, "loc_far_bank");
  assert.strictEqual(me(paid.state).money, me(atFord).money - 3);
  assert.strictEqual(paid.state.time.minute - atFord.time.minute, 30);
  const back = run(paid.state, [M("loc_river_ford")]);
  assert.strictEqual(back.state.actors.player_1.locationId, "loc_river_ford");
  const again = structuredClone(back.state);
  again.actors.player_1.money = 3;
  assert.ok(!texts(run(again, FERRY("opt_ferryman_cross")).log[1]).includes("txt_far_bank_first"), "the first visit is once");
  const poor = structuredClone(atFord);
  poor.actors.player_1.money = 2;
  assert.strictEqual(offered(poor, "choice_ferryman_dialogue", "opt_ferryman_cross"), false, "3 silver");
  // the letter: from an elder who trusts the character (15), for one who knows the ford
  const home = run(atFord, [M("loc_crossroads"), M("loc_village")]).state;
  assert.strictEqual(home.relations["npc_elder:player_1"].score, 20, "asking, reporting, the dispersal");
  assert.ok(offered(home, "choice_elder_dialogue", "opt_elder_letter"));
  const letter = run(home, E("opt_elder_letter"));
  assert.deepStrictEqual(texts(letter.log[1]), ["txt_elder_letter"]);
  assert.strictEqual(me(letter.state).inventory.item_passage_letter, 1);
  assert.strictEqual(offered(letter.state, "choice_elder_dialogue", "opt_elder_letter"), false, "one letter at a time");
  const lowTrust = structuredClone(home);
  lowTrust.relations["npc_elder:player_1"].score = 14;
  assert.strictEqual(offered(lowTrust, "choice_elder_dialogue", "opt_elder_letter"), false, "trust 15");
  const noRoad = structuredClone(home);
  delete noRoad.knowledge.player_1.rum_road_ford;
  assert.strictEqual(offered(noRoad, "choice_elder_dialogue", "opt_elder_letter"), false, "knowing the ford");
  const withLetter = run(letter.state, [M("loc_crossroads"), M("loc_river_ford")]).state;
  assert.strictEqual(offered(withLetter, "choice_ferryman_dialogue", "opt_ferryman_cross"), false, "with the letter, no fare");
  const free = run(withLetter, FERRY("opt_ferryman_cross_letter"));
  assert.deepStrictEqual(texts(free.log[1]), ["txt_ferryman_cross_letter", "txt_far_bank_first"]);
  assert.strictEqual(me(free.state).money, me(withLetter).money);
  assert.strictEqual(me(free.state).inventory.item_passage_letter, 1, "kept, not spent");
  return paid.state;
}

// 4. the waystation board: the outside world, as notices
function testBoard(farBank) {
  assert.strictEqual(rejected(atFord, P("act_read_waystation_board")), "requirements_not_met", "on the far bank");
  const read = run(farBank, [P("act_read_waystation_board")]);
  assert.deepStrictEqual(texts(read.log[0]), ["txt_board_royal_city", "txt_board_levy", "txt_board_bounty"]);
  assert.strictEqual(read.state.facts.fact_royal_city.value, "five_days_north");
  for (const r of ["rum_royal_city", "rum_realm_levy", "rum_leader_bounty"]) assert.deepStrictEqual(read.state.knowledge.player_1[r].sources, ["obs_loc_far_bank"], r);
  assert.strictEqual(read.state.facts.fact_leader_bounty.value, "posted");
  assert.strictEqual(me(read.state).growth.growth_wanderer.proficiency.investigation - me(farBank).growth.growth_wanderer.proficiency.investigation, 5);
  // the village's name, if it honoured someone
  const honoured = structuredClone(farBank);
  honoured.flags.village_honored = true;
  assert.ok(texts(run(honoured, [P("act_read_waystation_board")]).log[0]).includes("txt_board_village_name"));
  // the leader fell: no bounty, the road is safe
  const fellFord = structuredClone(run(leaderFell, TO_FORD).state);
  fellFord.actors.player_1.money = 3; // the scout spent hers on the sword
  const fellBank = run(fellFord, FERRY("opt_ferryman_cross")).state;
  const safe = run(fellBank, [P("act_read_waystation_board")]);
  assert.deepStrictEqual(texts(safe.log[0]), ["txt_board_royal_city", "txt_board_levy", "txt_board_road_safe"]);
  assert.strictEqual(safe.state.facts?.fact_leader_bounty, undefined);
  // no caravan news yet: no levy notice
  const early = structuredClone(farBank);
  delete early.facts.fact_realm_levy;
  assert.ok(!texts(run(early, [P("act_read_waystation_board")]).log[0]).includes("txt_board_levy"));
}

// 5. a successor: the world's news goes on; the letter was the predecessor's
function testSuccessor() {
  const withLetter = run(atFord, [M("loc_crossroads"), M("loc_village"), ...E("opt_elder_letter"), M("loc_ruins")]).state;
  let s = withLetter;
  for (let i = 0; i < 6 && s.pending?.kind !== "newCharacter"; i += 1) s = run(s, [{ type: "wait", minutes: 30 }]).state;
  assert.deepStrictEqual(s.pending, { kind: "newCharacter" });
  const next = run(s, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(next.actors.player_2.inventory.item_passage_letter, undefined, "the letter was the predecessor's");
  assert.ok(known(next, "fact_realm_levy"), "the world's news stays");
  const later = run(next, [DAY, DAY, DAY]).state;
  assert.strictEqual(later.signals.caravan_visits, 2, "and goes on");
}

// 6. save compatibility and determinism
function testSaveAndDeterminism() {
  assert.ok(!/caravan|realm_|ferry|far_bank|royal_city/.test(JSON.stringify(createInitialState({ worldSeed: "x", data: worldData }).state)), "a new game writes nothing of it");
  const path = [...FERRY("opt_ferryman_news"), ...FERRY("opt_ferryman_cross"), P("act_read_waystation_board")];
  const end = run(atFord, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_ford", atFord, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, atFord);
  assert.deepStrictEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(run(run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD]).state, path).state, end, "the same input, the same world");
}

const days = testCaravans();
testFerryman(days);
const farBank = testCrossing();
testBoard(farBank);
testSuccessor();
testSaveAndDeterminism();

console.log("V2-Core-74 data-world-river-ford.test.js: all checks passed");
