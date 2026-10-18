// V2-Core-140 (roadmap M6, chapters 4 "강을 건너오는 불길" and 5 "마지막 싸움과 그 뒤", docs/v2/main-story-design.md §3),
// through the ordinary step() API and the real pack.
//   1. the band crosses six strong -- or, slowed by the guild, at the gathering and six cadences on (four strong); not
//      a step before either
//   2. it holds the crossroads three days, then strikes the village (the honest clock: the same by the hour)
//   3. the frontier's fate: preparedness at least half the band holds (under the lord's banner if the frontier took his
//      offer); less falls. The world is not stopped: the band's days end, nothing else does
//   4. the last fight at the crossroads -- the scarred chief while he lives (his old wound open to one who knows it),
//      else his right hand (an actor); the village surrounds him with one it has prepared; won, the band breaks, the
//      village calls the name, and the raid never comes. Breaking off sends one to the village, the band still there
//   5. the elder: while the band is in the land, when it will strike and how the village stands; after, what became of
//      the frontier and what the world remembers -- since V2-Core-150 (D-128, #373) the guard who did not come back too,
//      once the village has heard it (World Memory: no name, D-71)
//   6. save/load and determinism
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the confrontation and the dispersal -- the chief lives (as data-world-band-across)
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region")
];
// integrated-36, the scout: the fight -- the chief falls (as data-world-band-across)
const TO_HIS_FALL = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"), ...E("opt_ask_region")
];
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];
const TO_CROSSROADS = [M("loc_crossroads")];

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
const said = (r) => r.log.flatMap((x) => x.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const tier = (r) => r.log.flatMap((x) => x.events).find((e) => e.type === "check.resolved")?.data.tier;
const mine = (s) => s.knowledge?.[s.player.actorId] ?? {};
const cond = (s, condition) => evaluateCondition(condition, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const offered = (s, choice, id) => {
  const o = worldData.choices[choice].options.find((x) => x.id === id);
  return o.requires === undefined || cond(s, o.requires);
};
const available = (s, actionId) => cond(s, worldData.actions[actionId].requires);
const factOf = (s, id) => s.facts?.[id]?.value;
const sig = (s, key) => s.signals?.[key] ?? 0;
const me = (s) => s.actors[s.player.actorId];
const withSignals = (s, signals) => ({ ...structuredClone(s), signals: { ...s.signals, ...signals } });
function until(s, done, limit = 60) {
  for (let i = 0; i < limit && !done(s); i += 1) s = run(s, [DAY]).state;
  assert.ok(done(s), "reached");
  return s;
}
// the first attempt of `actions` whose check comes out `wanted` (or better, for success), rerolling the RNG stream only
function rollTo(state, actions, wanted, label) {
  for (let i = 0; i < 300; i += 1) {
    const r = run({ ...state, rng: createInitialState({ worldSeed: `${label}-${i}`, data: worldData }).state.rng }, actions);
    if (tier(r) === wanted || (wanted === "success" && tier(r) === "great")) return r;
  }
  assert.fail(`no ${wanted} for ${JSON.stringify(actions)}`);
}
const crossed = (s) => s.flags?.band_crossed === true;

// both wait at the ford (the caravans' road is known), as data-world-band-across
const lives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD]).state;
const gathered = until(lives, (s) => sig(s, "band_gathering") >= 1);
const fell = until(run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...TO_HIS_FALL, ...TO_FORD]).state, (s) => sig(s, "band_gathering") >= 1);

// 1. the crossing
function testTheBandCrosses() {
  assert.ok(!crossed(gathered));
  let s = gathered;
  let before = s;
  while (!crossed(s)) {
    before = s;
    s = run(s, [DAY]).state;
  }
  assert.equal(sig(before, "band_strength"), 6, "six strong the step before");
  assert.equal(sig(s, "band_strength"), 6);
  assert.equal(factOf(s, "fact_band_crossed"), "crossed");
  assert.equal(factOf(s, "fact_raid"), "coming");
  assert.equal(sig(s, "raid_days"), 1, "its first day, the crossing's own step");
  // no crossing at five: the step that made it five did not cross, nor the days after until six
  let five = gathered;
  while (sig(five, "band_strength") < 5) five = run(five, [DAY]).state;
  for (; sig(five, "band_strength") === 5; five = run(five, [DAY]).state) assert.ok(!crossed(five), "not at five");

  // slowed by the guild: the gathering and six cadences on, four strong; not at the sixth cadence
  const kept = structuredClone(gathered);
  kept.flags = { ...kept.flags, guild_keeps_guards: true };
  let k = kept;
  let kBefore = k;
  while (!crossed(k)) {
    kBefore = k;
    k = run(k, [DAY]).state;
  }
  assert.equal(sig(kBefore, "band_cycles"), 7, "the gathering's step and six cadences");
  assert.equal(sig(k, "band_strength"), 4);
  let six = kept;
  while (sig(six, "band_cycles") < 6) six = run(six, [DAY]).state;
  for (; sig(six, "band_cycles") === 6; six = run(six, [DAY]).state) assert.ok(!crossed(six), "not at the sixth cadence");
  // crossed, the band stops growing
  const later = run(k, [DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state;
  assert.equal(sig(later, "band_strength"), 4);
  assert.equal(sig(later, "band_cycles"), sig(k, "band_cycles"));
}

const atCrossing = until(gathered, crossed);

// 2. the days at the crossroads
function testTheRaidClock() {
  const two = run(atCrossing, [DAY, DAY]).state;
  assert.equal(sig(two, "raid_days"), 3);
  assert.equal(sig(two, "frontier_fate"), 0, "not yet");
  assert.equal(factOf(two, "fact_raid"), "coming");
  const three = run(two, [DAY]).state;
  assert.equal(sig(three, "raid_days"), 4);
  assert.ok(sig(three, "frontier_fate") >= 1, "three days on, it strikes");
  assert.equal(factOf(three, "fact_raid"), "struck");
  // the same days walked an hour at a time
  let h = atCrossing;
  for (let i = 0; i < 72; i += 1) h = run(h, [{ type: "wait", minutes: 60 }]).state;
  assert.equal(sig(h, "frontier_fate"), sig(three, "frontier_fate"));
  assert.equal(factOf(h, "fact_ending"), factOf(three, "fact_ending"));
  // decided once: the days stop, the fate stays
  const after = run(three, [DAY, DAY, DAY]).state;
  assert.equal(sig(after, "raid_days"), 4);
  assert.equal(sig(after, "frontier_fate"), sig(three, "frontier_fate"));
}

// 3. the frontier's fate
function testTheFates() {
  const fate = (s, signals) => {
    const t = run(withSignals(s, signals), [DAY, DAY, DAY]).state;
    return [sig(t, "frontier_fate"), factOf(t, "fact_ending")];
  };
  // six strong: three to hold
  assert.equal(sig(atCrossing, "band_strength"), 6);
  assert.deepEqual(fate(atCrossing, {}), [4, "frontier_fell"], "unprepared, it falls");
  assert.deepEqual(fate(atCrossing, { frontier_defense: 2 }), [4, "frontier_fell"]);
  assert.deepEqual(fate(atCrossing, { frontier_defense: 3 }), [2, "frontier_held"]);
  assert.deepEqual(fate(atCrossing, { frontier_defense: 3, lord_pact: 1 }), [3, "lord_banner"], "the lord's patrol");
  assert.deepEqual(fate(atCrossing, { frontier_defense: 3, lord_pact: 2 }), [2, "frontier_held"], "refused: its own");
  assert.deepEqual(fate(atCrossing, { frontier_defense: 2, lord_pact: 1 }), [4, "frontier_fell"], "the banner does not hold by itself");
  // five strong (the guild kept its guards late): still three
  assert.deepEqual(fate(atCrossing, { band_strength: 5, frontier_defense: 2 }), [4, "frontier_fell"]);
  assert.deepEqual(fate(atCrossing, { band_strength: 5, frontier_defense: 3 }), [2, "frontier_held"]);
  // four strong (the guild kept its guards): two to hold
  const kept = structuredClone(gathered);
  kept.flags = { ...kept.flags, guild_keeps_guards: true };
  const small = until(kept, crossed);
  assert.equal(sig(small, "band_strength"), 4);
  assert.deepEqual(fate(small, { frontier_defense: 1 }), [4, "frontier_fell"]);
  assert.deepEqual(fate(small, { frontier_defense: 2 }), [2, "frontier_held"]);
  assert.deepEqual(fate(small, { frontier_defense: 2, lord_pact: 1 }), [3, "lord_banner"]);
  // the world goes on: a fallen frontier's village still takes a rest, its elder still talks
  const fallen = run(atCrossing, [DAY, DAY, DAY]).state;
  const on = run(fallen, [M("loc_crossroads"), M("loc_village"), P("act_rest_village"), DAY]).state;
  assert.ok(offered(on, "choice_elder_dialogue", "opt_elder_aftermath"));
}

// 4. the last fight
const chiefAtCrossroads = run(atCrossing, TO_CROSSROADS).state;
function testTheLastFightTheChief() {
  assert.ok(!available(run(gathered, TO_CROSSROADS).state, "act_face_band"), "no band at the crossroads before it crosses");
  assert.ok(!available(atCrossing, "act_face_band"), "only at the crossroads");
  assert.ok(available(chiefAtCrossroads, "act_face_band"));
  const faced = run(chiefAtCrossroads, [P("act_face_band")]);
  assert.ok(said(faced).includes("txt_face_band_chief"));
  assert.equal(mine(faced.state).rum_band_crossed?.claim, "crossed", "seen at the crossroads");
  assert.ok(offered(faced.state, "choice_final_battle", "opt_final_chief_strike"));
  // the old wound: one who knows how he guards his side (the ferryman's word, chapter 2) or the elder's (act one)
  assert.ok(!offered(faced.state, "choice_final_battle", "opt_final_chief_weak_spot"), "this one knows neither");
  const knows = structuredClone(faced.state);
  knows.knowledge[knows.player.actorId].rum_band_led_by_scarred = { factId: "fact_band_leader", claim: "scarred_chief", sources: ["npc_ferryman"], confidence: 60 };
  assert.ok(offered(knows, "choice_final_battle", "opt_final_chief_weak_spot"));
  const aimed = run(knows, [C("opt_final_chief_weak_spot")]).log[0].events.find((e) => e.type === "check.resolved").data.difficulty;
  assert.equal(aimed, 9, "the old wound: an easier mark");
  // the village surrounds him only with one it has prepared
  assert.ok(!offered(withSignals(faced.state, { frontier_defense: 1 }), "choice_final_battle", "opt_final_chief_with_village"));
  assert.ok(offered(withSignals(faced.state, { frontier_defense: 2 }), "choice_final_battle", "opt_final_chief_with_village"));
  const difficulty = (s, option) => run(s, [C(option)]).log[0].events.find((e) => e.type === "check.resolved").data.difficulty;
  assert.equal(difficulty(faced.state, "opt_final_chief_strike"), 11, "against his STR 10");
  assert.equal(difficulty(withSignals(faced.state, { frontier_defense: 2 }), "opt_final_chief_with_village"), 9, "an easier mark");

  // a clean hit on the player: his heavy blow while he has the stamina
  const struck = rollTo(faced.state, [C("opt_final_chief_strike")], "fail", "final-struck");
  assert.ok(said(struck).includes("txt_final_heavy_blow"));
  assert.equal(me(struck.state).hp.current, me(faced.state).hp.current - 4);
  assert.equal(struck.state.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current, 3);

  // won: two great strikes
  const one = rollTo(faced.state, [C("opt_final_chief_strike")], "great", "final-a");
  assert.ok(!one.state.flags?.band_broken);
  const two = rollTo(one.state, [C("opt_final_chief_strike")], "great", "final-b");
  const won = two.state;
  assert.equal(won.actors.npc_bandit_leader.alive, false);
  assert.ok(said(two).includes("txt_final_victory"));
  assert.equal(won.flags.band_broken, true);
  assert.equal(sig(won, "frontier_fate"), 1);
  assert.equal(factOf(won, "fact_ending"), "name_remembered");
  assert.ok(cond(won, { op: "relation", from: "org_village", to: "self", tag: "defender" }), "the village calls the name");
  assert.ok(mine(won).rum_ending_name);
  assert.ok(!available(won, "act_face_band"), "the band is gone");
  // and the raid never comes
  const days = run(won, [DAY, DAY, DAY, DAY]).state;
  assert.equal(sig(days, "frontier_fate"), 1);
  assert.equal(factOf(days, "fact_raid"), "coming", "it never struck");

  // breaking off: to the village, the band still there and its days running
  const fled = run(faced.state, [C("opt_final_chief_flee")]);
  assert.equal(me(fled.state).locationId, "loc_village");
  assert.ok(said(fled).includes("txt_final_flee"));
  assert.ok(!fled.state.flags?.band_broken);
  assert.ok(available(run(fled.state, TO_CROSSROADS).state, "act_face_band"), "it can be faced again");
}

function testTheLastFightTheRightHand() {
  assert.equal(fell.actors.npc_bandit_leader.alive, false);
  const at = run(until(fell, crossed), TO_CROSSROADS).state;
  const faced = run(at, [P("act_face_band")]);
  assert.ok(said(faced).includes("txt_face_band_right_hand"));
  assert.ok(!worldData.choices.choice_final_battle.options.some((o) => o.id.startsWith("opt_final_right_hand") && o.id.endsWith("_weak_spot")), "no old wound to aim at");
  assert.ok(!offered(faced.state, "choice_final_battle", "opt_final_chief_strike"), "only the one who leads them");
  assert.ok(offered(faced.state, "choice_final_battle", "opt_final_right_hand_strike"));
  assert.equal(mine(faced.state).rum_band_led_by_remnant?.sources.includes("npc_band_lieutenant"), true, "he names himself");
  const fled = run(faced.state, [C("opt_final_right_hand_flee")]).state;
  assert.equal(fled.relations?.[`npc_band_lieutenant:${fled.player.actorId}`]?.score, -10, "he remembers");
  // his own STR opposes the strike
  const strike = rollTo(faced.state, [C("opt_final_right_hand_strike")], "great", "rh-a");
  const check = strike.log[0].events.find((e) => e.type === "check.resolved").data;
  assert.equal(check.difficulty, 11);
  const strong = structuredClone(faced.state);
  strong.actors.npc_band_lieutenant.growth.growth_wanderer.stats.str = 16;
  assert.equal(run(strong, [C("opt_final_right_hand_strike")]).log[0].events.find((e) => e.type === "check.resolved").data.difficulty, 14, "his STR, not the dead chief's");
  assert.equal(strike.state.actors.npc_band_lieutenant.hp.current, 5);
  const won = rollTo(strike.state, [C("opt_final_right_hand_strike")], "great", "rh-b").state;
  assert.equal(won.actors.npc_band_lieutenant.alive, false);
  assert.equal(sig(won, "frontier_fate"), 1);
  assert.equal(won.flags.band_broken, true);
}

// 5. the elder
function testTheElder() {
  const village = run(atCrossing, [M("loc_crossroads"), M("loc_village")]).state;
  assert.ok(!offered(gathered, "choice_elder_dialogue", "opt_elder_band_crossed"), "not before it crosses");
  assert.ok(offered(village, "choice_elder_dialogue", "opt_elder_band_crossed"));
  assert.ok(!offered(village, "choice_elder_dialogue", "opt_elder_aftermath"), "nothing to tell yet");
  const thin = run(village, E("opt_elder_band_crossed"));
  assert.ok(said(thin).includes("txt_elder_band_crossed"));
  assert.ok(said(thin).includes("txt_elder_raid_thin"));
  assert.ok(mine(thin.state).rum_band_crossed);
  assert.ok(mine(thin.state).rum_raid_coming);
  const ready = run(withSignals(village, { frontier_defense: 3 }), E("opt_elder_band_crossed"));
  assert.ok(said(ready).includes("txt_elder_raid_ready"));

  const after = (s) => run(s, E("opt_elder_aftermath"));
  const fallen = run(village, [DAY, DAY, DAY]).state;
  assert.ok(!offered(fallen, "choice_elder_dialogue", "opt_elder_band_crossed"), "the band's days are over");
  const toldFell = after(fallen);
  assert.ok(said(toldFell).includes("txt_elder_after_fell"));
  assert.ok(mine(toldFell.state).rum_ending_fell);
  const held = after(run(withSignals(village, { frontier_defense: 3 }), [DAY, DAY, DAY]).state);
  assert.ok(said(held).includes("txt_elder_after_held"));
  assert.ok(mine(held.state).rum_ending_held);
  const lord = after(run(withSignals(village, { frontier_defense: 3, lord_pact: 1 }), [DAY, DAY, DAY]).state);
  assert.ok(said(lord).includes("txt_elder_after_lord"));
  assert.ok(mine(lord.state).rum_ending_lord);
  // what the world remembers: the guild's ledger, the warning heard
  const remembered = structuredClone(fallen);
  remembered.flags = { ...remembered.flags, guild_keeps_guards: true, frontier_warned: true };
  const r = after(remembered);
  assert.ok(said(r).includes("txt_elder_after_guild"));
  assert.ok(said(r).includes("txt_elder_after_warned"));
  assert.ok(!said(r).includes("txt_elder_after_defender"));
  assert.ok(!said(r).includes("txt_elder_after_fallen"), "no guard lost: nothing to remember");
  // V2-Core-150: a known guard fell before the crossing; the word comes south on its own cadence, and the elder's telling
  // of that day remembers the one who did not come back -- by no name
  const mourning = run(withSignals(village, { guards_fallen: 1 }), [DAY, DAY, DAY, DAY]).state; // counted out, then a cadence on
  assert.equal(mourning.flags?.guard_fall_word_south, true, "the word came south");
  const mourned = after(mourning);
  assert.ok(said(mourned).includes("txt_elder_after_fallen"));
  assert.ok(said(mourned).includes("txt_elder_after_fell"), "and the frontier's fate as before");
  // the name: the defender, told to whoever asks -- a successor too
  const won = rollTo(rollTo(run(chiefAtCrossroads, [P("act_face_band")]).state, [C("opt_final_chief_strike")], "great", "final-a").state, [C("opt_final_chief_strike")], "great", "final-b").state;
  const named = after(run(won, [M("loc_village")]).state);
  assert.ok(said(named).includes("txt_elder_after_name"));
  assert.ok(said(named).includes("txt_elder_after_defender"));
  const successor = structuredClone(won);
  successor.actors[successor.player.actorId].alive = false;
  successor.pending = { kind: "newCharacter" };
  const next = run(successor, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(me(next).locationId, "loc_village");
  const heir = after(next);
  assert.ok(said(heir).includes("txt_elder_after_name"), "the world's, not the character's");
  assert.ok(!said(heir).includes("txt_elder_after_defender"), "the name is the one who stood there");
  assert.ok(mine(heir.state).rum_ending_name);
}

// 6. save/load and determinism
function testSaveLoadAndDeterminism() {
  const actions = [M("loc_crossroads"), P("act_face_band"), C("opt_final_chief_strike"), C("opt_final_chief_flee"), DAY, DAY, DAY, ...E("opt_elder_aftermath")];
  const a = run(atCrossing, actions).state;
  const b = run(atCrossing, actions).state;
  assert.deepEqual(a, b);
  assert.deepEqual(validateState(a), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_final", a, { savedAt: 1 }))));
  assert.deepEqual(loaded, a);
  assert.deepEqual(run(loaded, [DAY]).state, run(a, [DAY]).state);
  assert.equal(rejected(a, P("act_face_band")), "requirements_not_met");
}

testTheBandCrosses();
testTheRaidClock();
testTheFates();
testTheLastFightTheChief();
testTheLastFightTheRightHand();
testTheElder();
testSaveLoadAndDeterminism();
console.log("V2-Core-140 data-world-final-battle.test.js: all checks passed");
