// V2-Core-138 (roadmap M4, World Bible WB-0030 MC-03/MC-04, WB-0031): the main thread's second chapter, "across the river",
// through the ordinary step() API and the real pack.
//   1. before act one is over or before the third caravan: no band, no option
//   2. the third caravan brings the realm's unrest and, in the same step, the band across the river: led by the scarred
//      chief where he lives (MC-03), by one of his old band where he fell (MC-04) -- the world's facts
//   3. what each source knows: the ferryman saw armed men and (only if it is the man he ferried before) their leader; the
//      guild's ledger tells the lost guards, and who leads them only to a guard it knows; the waystation board posts for
//      hands, and where the chief fell someone scrawled whose men they are
//   4. the elder asks who leads them; told, he warns the frontier -- once, for the world (+5 once); asked again, he says
//      it is done; a successor finds it done, and learns it from him (no knowledge is inherited, D-71)
//   5. `story` on the rumours: chapter 1 and 2 words; validateData refuses a malformed `story`
//   6. save/load and determinism along the whole path
// node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const FERRY = (o) => [P("act_talk_ferryman"), C(o)];
const CLERK = (o) => [P("act_talk_guild_clerk"), C(o)];
const DAY = { type: "wait", minutes: 1440 };
// history-41: the confrontation and the dispersal -- the leader lives (as data-world-crossroads)
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region")
];
// integrated-36, the scout: the fight -- the leader falls (as data-world-crossroads)
const TO_HIS_FALL = [
  P("act_observe_village"), P("act_observe_village"), P("act_observe_village"),
  M("loc_market"), P("act_buy_iron_sword"), P("act_equip_iron_sword"), M("loc_village"),
  ...E("opt_ask_ruins"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_rest_village"),
  ...E("opt_report_findings"), ...E("opt_ask_about_leader"), M("loc_ruins"), P("act_fight_leader"),
  ...["opt_fight_counter", "opt_fight_weak_spot", "opt_fight_sword_cut", "opt_fight_sword_cut"].map(C),
  M("loc_village"), P("act_rest_village"), P("act_rest_village"), ...E("opt_ask_region")
];
const TO_FORD = [M("loc_crossroads"), M("loc_river_ford")];
const FORD_TO_VILLAGE = [M("loc_crossroads"), M("loc_village")];

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
const said = (r) => r.log.flatMap((x) => x.events.filter((e) => e.type === "narration").map((e) => e.data.textId));
const mine = (s) => s.knowledge?.[s.player.actorId] ?? {};
const offered = (s, choice, id) => {
  const o = worldData.choices[choice].options.find((x) => x.id === id);
  return evaluateCondition(o.requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
};
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
const factOf = (s, id) => s.facts?.[id]?.value;
// wait a day at a time until the third caravan; returns the state of that very step
function untilThirdCaravan(s) {
  for (let i = 0; i < 20 && (s.signals?.caravan_visits ?? 0) < 3; i += 1) {
    s = run(s, [DAY]).state;
    if ((s.signals?.caravan_visits ?? 0) < 3) assert.equal(s.signals?.band_gathering, undefined, "not before the third caravan");
  }
  assert.equal(s.signals.caravan_visits, 3, "the third caravan came");
  return s;
}

const lives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, [...TO_DISPERSAL, ...TO_FORD]).state;
const fell = (() => {
  const s = run(createInitialState({ worldSeed: "integrated-36", data: worldData, templateId: "start_scout" }).state, [...TO_HIS_FALL, ...TO_FORD]).state;
  s.actors[s.player.actorId].money = 20; // staged: the fare and the road (the fight's world is not a rich one)
  return s;
})();

// 1-2. no band before the third caravan; then, in that very step, the band and its leader
function testTheBandGathers() {
  assert.equal(lives.actors.npc_bandit_leader.alive, true);
  assert.equal(fell.actors.npc_bandit_leader.alive, false);
  for (const s of [lives, fell]) {
    assert.ok((s.signals?.caravan_visits ?? 0) < 3);
    assert.equal(s.signals?.band_gathering, undefined);
    assert.ok(!offered(s, "choice_ferryman_dialogue", "opt_ferryman_band"));
    assert.ok(!offered(s, "choice_elder_dialogue", "opt_elder_band_word"));
    assert.ok(!offered(s, "choice_guild_clerk_dialogue", "opt_guild_clerk_band"));
  }
  // act one not over: the caravans may come, the band does not (no road walked, no caravans either)
  const fresh = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, Array(12).fill(DAY)).state;
  assert.equal(fresh.signals?.band_gathering, undefined);
  const a = untilThirdCaravan(lives);
  assert.equal(a.signals.band_gathering, 1, "in the step the unrest came");
  assert.equal(factOf(a, "fact_band_gathers"), "gathering");
  assert.equal(factOf(a, "fact_band_leader"), "scarred_chief", "MC-03: the scarred chief gathers a new band");
  assert.equal(factOf(a, "fact_realm_unrest"), "known");
  const b = untilThirdCaravan(fell);
  assert.equal(factOf(b, "fact_band_leader"), "chief_right_hand", "MC-04: one of his old band takes his place");
  // once: more caravans change nothing of it
  const later = run(a, Array(9).fill(DAY)).state;
  assert.equal(later.signals.band_gathering, 1);
  assert.equal(later.facts.fact_band_gathers.since, a.facts.fact_band_gathers.since);
  return { a, b };
}

// 3. the ferryman, the clerk, the board
function testWhoKnowsWhat({ a, b }) {
  // the ferryman (the player is at the ford)
  const fa = run(a, FERRY("opt_ferryman_band"));
  assert.deepEqual(said(fa).slice(-2), ["txt_ferryman_band", "txt_ferryman_band_scarred"]);
  assert.equal(mine(fa.state).rum_band_recruits.source, "npc_ferryman");
  assert.equal(mine(fa.state).rum_band_led_by_scarred.confidence, 60);
  const fb = run(b, FERRY("opt_ferryman_band"));
  assert.deepEqual(said(fb).slice(-2), ["txt_ferryman_band", "txt_ferryman_band_unknown"]);
  assert.equal(mine(fb.state).rum_band_led_by_remnant, undefined, "he does not know the fallen chief's man");

  // across, the board; then the town and the clerk
  const across = (s) => run(s, [...FERRY("opt_ferryman_cross"), P("act_read_waystation_board")]);
  const ba = across(a);
  assert.ok(said(ba).includes("txt_board_band") && !said(ba).includes("txt_board_band_remnant"));
  assert.equal(mine(ba.state).rum_band_recruits.source, "obs_loc_far_bank");
  const bb = across(b);
  assert.ok(said(bb).includes("txt_board_band_remnant"));
  assert.equal(mine(bb.state).rum_band_led_by_remnant.confidence, 50);

  const town = (s) => run(s, [M("loc_castle_town")]).state;
  const strangerA = run(town(ba.state), CLERK("opt_guild_clerk_band"));
  assert.deepEqual(said(strangerA).slice(-2), ["txt_guild_clerk_band", "txt_guild_clerk_band_closed"]);
  assert.equal(mine(strangerA.state).rum_band_led_by_scarred, undefined, "the ledger's name is for a guard the guild knows");
  const known = (s) => {
    const t = structuredClone(s);
    t.relations = { ...t.relations, [`npc_guild_clerk:${t.player.actorId}`]: { score: 10 } }; // staged: a guard the guild knows
    return t;
  };
  const knownA = run(known(town(ba.state)), CLERK("opt_guild_clerk_band"));
  assert.ok(said(knownA).includes("txt_guild_clerk_band_scarred"));
  assert.equal(mine(knownA.state).rum_band_led_by_scarred.source, "npc_guild_clerk");
  const knownB = run(known(town(bb.state)), CLERK("opt_guild_clerk_band"));
  assert.ok(said(knownB).includes("txt_guild_clerk_band_remnant"));
  // the scrawl read first, the ledger confirms it: one word, two sources (D-14 reconfirmation, not a new belief)
  assert.deepEqual(mine(knownB.state).rum_band_led_by_remnant.sources, ["npc_guild_clerk", "obs_loc_far_bank"]);
  assert.equal(mine(knownB.state).rum_band_led_by_remnant.confirmations, 2);
  return { fa, fb };
}

// 4. the elder asks; told, he warns the frontier -- once, for the world
function testTheElder({ a }) {
  // asked before anyone knows who leads them
  const home = run(a, FORD_TO_VILLAGE).state;
  const asked = run(home, E("opt_elder_band_word"));
  assert.ok(said(asked).includes("txt_elder_band_ask"));
  assert.equal(factOf(asked.state, "fact_elder_request"), "who_leads");
  assert.ok(mine(asked.state).rum_elder_asks_band);
  assert.equal(asked.state.flags?.frontier_warned, undefined);

  // to the ford, the ferryman's word of the leader, back to the elder
  const learned = run(asked.state, [...TO_FORD, ...FERRY("opt_ferryman_band"), ...FORD_TO_VILLAGE]).state;
  const before = rel(learned, "npc_elder");
  const told = run(learned, E("opt_elder_band_word"));
  assert.ok(said(told).includes("txt_elder_band_scarred"));
  assert.equal(told.state.flags.frontier_warned, true);
  assert.equal(factOf(told.state, "fact_frontier_warned"), "warned");
  assert.equal(rel(told.state, "npc_elder"), before + 5);
  assert.ok(mine(told.state).rum_frontier_warned);
  const again = run(told.state, E("opt_elder_band_word"));
  assert.ok(said(again).includes("txt_elder_band_warned"));
  assert.equal(rel(again.state, "npc_elder"), before + 5, "once");

  // a successor: the world remembers the warning; the knowledge is theirs to hear
  const succ = structuredClone(told.state);
  succ.actors[succ.player.actorId].alive = false;
  succ.pending = { kind: "newCharacter" };
  const next = run(succ, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.equal(mine(next).rum_frontier_warned, undefined, "nothing inherited");
  const heard = run(next, E("opt_elder_band_word"));
  assert.ok(said(heard).includes("txt_elder_band_warned"));
  assert.ok(mine(heard.state).rum_frontier_warned);
  return told.state;
}

// 5. the story chapters, and the check on them
function testStoryData() {
  const chapter = (id) => worldData.rumors[id].story?.chapter;
  for (const id of ["rum_bandits_fate", "rum_bandits_legend", "rum_well_fate", "rum_well_legend"]) assert.equal(chapter(id), 1, id);
  for (const id of ["rum_elder_asks_band", "rum_band_recruits", "rum_band_led_by_scarred", "rum_band_led_by_remnant", "rum_frontier_warned"]) assert.equal(chapter(id), 2, id);
  assert.equal(chapter("rum_road_quiet"), undefined, "the road's condition is not the story");
  for (const id of [1, 2]) assert.ok(worldData.texts[`lbl_story_chapter_${id}`], `chapter ${id} has a title`);
  assert.deepEqual(validateData(worldData), []);
  for (const bad of [{}, { chapter: 0 }, { chapter: 1.5 }, { chapter: "2" }, 2, null]) {
    const copy = { ...worldData, rumors: { ...worldData.rumors, rum_band_recruits: { ...worldData.rumors.rum_band_recruits, story: bad } } };
    assert.ok(validateData(copy).some((e) => e.includes("rumors.rum_band_recruits.story")), `refused: ${JSON.stringify(bad)}`);
  }
}

// 6. save/load and determinism along the path
function testSaveAndDeterminism() {
  const path = [...Array(9).fill(DAY), ...FERRY("opt_ferryman_band"), ...FORD_TO_VILLAGE, ...E("opt_elder_band_word")];
  const end = run(lives, path).state;
  assert.deepEqual(validateState(end), []);
  assert.equal(end.flags.frontier_warned, true);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_band", lives, { savedAt: 1 }))));
  assert.deepEqual(run(loaded, path).state, end, "loaded, the same end");
  assert.deepEqual(run(lives, path).state, end, "the same input, the same world");
}

const thirds = testTheBandGathers();
testWhoKnowsWhat(thirds);
testTheElder(thirds);
testStoryData();
testSaveAndDeterminism();
console.log("V2-Core-138 data-world-band-across.test.js: all checks passed");
