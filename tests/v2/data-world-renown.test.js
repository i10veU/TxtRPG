// V2-Core-142 (roadmap M7, the strongest one's curve; World Bible WB-0030 Q3: the 1.0 apex is legend and recognition), through
// the ordinary step() API and the real pack.
//   1. the frontier's fate goes north a caravan cadence after it is decided -- not before
//   2. the castle town tells each fate once the word came; the royal records name the frontier only for the defender's deed
//   3. the defender, reading the royal records, is known to the realm (`unl_realm_renown`, the apex); a successor reads
//      the same words and is not; the guild greets the name once; the town's crowd knows the face
//   4. the late challenge: the band's remnants, for a seasoned sword once the fate is decided -- the bounty and a quiet week,
//      or a beating
//   5. save/load and determinism
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
const TO_DISPERSAL = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford")
];

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
const tier = (r) => r.log.flatMap((x) => x.events).find((e) => e.type === "check.resolved")?.data.tier;
const mine = (s) => s.knowledge?.[s.player.actorId] ?? {};
const cond = (s, condition) => evaluateCondition(condition, { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const available = (s, actionId) => cond(s, worldData.actions[actionId].requires);
const sig = (s, key) => s.signals?.[key] ?? 0;
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
const me = (s) => s.actors[s.player.actorId];
const renowned = (s) => me(s).growth.growth_wanderer.unlocks?.unl_realm_renown === true;
const at = (s, loc, patch = {}) => {
  const t = structuredClone(s);
  t.actors[t.player.actorId].locationId = loc;
  t.signals = { ...t.signals, ...(patch.signals ?? {}) };
  if (patch.sword !== undefined) t.actors[t.player.actorId].growth.growth_wanderer.skills = { ...t.actors[t.player.actorId].growth.growth_wanderer.skills, swordsmanship: patch.sword };
  return t;
};
function until(s, done, limit = 60) {
  for (let i = 0; i < limit && !done(s); i += 1) s = run(s, [DAY]).state;
  assert.ok(done(s), "reached");
  return s;
}
function rollTo(state, actions, wanted, label) {
  for (let i = 0; i < 300; i += 1) {
    const r = run({ ...state, rng: createInitialState({ worldSeed: `${label}-${i}`, data: worldData }).state.rng }, actions);
    if (tier(r) === wanted || (wanted === "success" && tier(r) === "great")) return r;
  }
  assert.fail(`no ${wanted} for ${JSON.stringify(actions)}`);
}
const north = (s) => s.flags?.fate_word_north === true;

const lives = run(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_DISPERSAL).state;
const crossing = until(lives, (s) => s.flags?.band_crossed === true);
const faced = run(crossing, [M("loc_crossroads"), P("act_face_band")]).state;
const won = rollTo(rollTo(faced, [C("opt_final_chief_strike")], "great", "renown-a").state, [C("opt_final_chief_strike")], "great", "renown-b").state;
const fallen = run(crossing, [DAY, DAY, DAY]).state; // unprepared: the frontier fell

// 1. the word north
function testTheWordGoesNorth() {
  assert.equal(sig(won, "frontier_fate"), 1);
  assert.ok(!north(won));
  assert.ok(!north(run(won, [DAY, DAY]).state), "two days: not yet");
  const three = run(won, [DAY, DAY, DAY]).state;
  assert.ok(north(three), "a cadence on");
  assert.equal(sig(three, "fate_word_age"), 2);
  assert.ok(!north(run(lives, [DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state), "no fate, no word");
}

// 2. the town and the royal city
const wonNorth = until(won, north);
const fellNorth = until(fallen, north);
function testTheTownAndTheRecords() {
  const notices = (s) => said(run(at(s, "loc_castle_town"), [P("act_read_castle_notices")]));
  assert.ok(notices(wonNorth).includes("txt_castle_fate_name"));
  assert.ok(notices(fellNorth).includes("txt_castle_fate_fell"));
  assert.ok(!notices(won).some((t) => t.startsWith("txt_castle_fate_")), "before the word came");
  const held = until(run({ ...structuredClone(crossing), signals: { ...crossing.signals, frontier_defense: 3 } }, [DAY, DAY, DAY]).state, north);
  assert.ok(notices(held).includes("txt_castle_fate_held"));
  const lord = until(run({ ...structuredClone(crossing), signals: { ...crossing.signals, frontier_defense: 3, lord_pact: 1 } }, [DAY, DAY, DAY]).state, north);
  assert.ok(notices(lord).includes("txt_castle_fate_lord"));
  assert.equal(mine(run(at(fellNorth, "loc_castle_town"), [P("act_read_castle_notices")]).state).rum_ending_fell.sources[0], "src_castle_town_talk");
  // the royal records: the frontier named only for the defender's deed
  const records = (s) => said(run(at(s, "loc_royal_city"), [P("act_read_royal_records")]));
  assert.ok(records(wonNorth).includes("txt_royal_records_defender"));
  assert.ok(!records(wonNorth).includes("txt_royal_records_no_frontier"));
  assert.ok(records(fellNorth).includes("txt_royal_records_no_frontier"), "a fallen frontier is still nowhere in the realm's word");
  assert.ok(records(won).includes("txt_royal_records_no_frontier"), "before the word came");
}

// 3. the apex
function testTheApex() {
  const read = run(at(wonNorth, "loc_royal_city"), [P("act_read_royal_records")]);
  assert.ok(said(read).includes("txt_royal_records_you"));
  assert.ok(renowned(read.state), "known to the realm");
  assert.ok(mine(read.state).rum_ending_name.sources.includes("src_royal_records"));
  assert.ok(!said(run(read.state, [P("act_read_royal_records")])).includes("txt_royal_records_you"), "once");
  assert.ok(!renowned(run(at(fellNorth, "loc_royal_city"), [P("act_read_royal_records")]).state), "no deed, no name");
  // a successor reads the same words; the name is not theirs
  const succ = structuredClone(wonNorth);
  succ.actors[succ.player.actorId].alive = false;
  succ.pending = { kind: "newCharacter" };
  const heir = run(at(run(succ, [{ type: "startCharacter", templateId: "start_wanderer" }]).state, "loc_royal_city"), [P("act_read_royal_records")]);
  assert.ok(said(heir).includes("txt_royal_records_defender"));
  assert.ok(!renowned(heir.state));
  // the guild greets the name, once; the town's crowd knows the face
  const guild = run(at(read.state, "loc_castle_town"), [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")]);
  assert.ok(said(guild).includes("txt_guild_clerk_renowned"));
  assert.equal(rel(guild.state, "npc_guild_clerk"), rel(read.state, "npc_guild_clerk") + 10);
  assert.ok(!said(run(guild.state, [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")])).includes("txt_guild_clerk_renowned"), "once");
  assert.ok(said(run(guild.state, [P("act_read_castle_notices")])).includes("txt_castle_known_you"));
  assert.ok(!said(run(at(wonNorth, "loc_castle_town"), [P("act_read_castle_notices")])).includes("txt_castle_known_you"), "not before the realm knows");
  // the elder, the guild, the town, the royal city: all four answer the name
  assert.ok(cond(guild.state, { op: "relation", from: "org_village", to: "self", tag: "defender" }));
  assert.ok(cond(guild.state, { op: "relation", from: "npc_guild_clerk", to: "self", tag: "renowned" }));
}

// 4. the remnants
function testTheRemnants() {
  const woods = at(wonNorth, "loc_band_camp", { sword: 2 });
  assert.ok(available(woods, "act_hunt_band_remnants"));
  assert.ok(!available(at(wonNorth, "loc_band_camp", { sword: 1 }), "act_hunt_band_remnants"), "a seasoned sword");
  assert.ok(!available(at(crossing, "loc_band_camp", { sword: 2 }), "act_hunt_band_remnants"), "not before the fate is decided");
  const hunted = rollTo(woods, [P("act_hunt_band_remnants")], "success", "hunt-yes");
  assert.ok(said(hunted).includes("txt_remnants_hunted"));
  assert.equal(me(hunted.state).money, me(woods).money + 12);
  assert.equal(rel(hunted.state, "org_village"), rel(woods, "org_village") + 2);
  assert.ok(!available(hunted.state, "act_hunt_band_remnants"), "a quiet week");
  const six = run(hunted.state, [DAY, DAY, DAY, DAY, DAY, DAY]).state;
  assert.ok(!available(six, "act_hunt_band_remnants"), "six days on, still quiet");
  const expired = run(six, [DAY]).state;
  assert.ok(available(expired, "act_hunt_band_remnants"), "a week on, regrouped");
  assert.equal(sig(expired, "remnants_quiet"), 0);
  const firstClock = expired.fired.evt_unrest_remnants_regroup;
  const again = rollTo(expired, [P("act_hunt_band_remnants")], "success", "hunt-again");
  assert.equal(again.state.time.minute - expired.time.minute, 240);
  assert.equal(sig(again.state, "remnants_quiet"), 7, "a second hunt starts a full new week inside the old cooldown");
  assert.deepEqual(again.state.fired.evt_unrest_remnants_regroup, { count: firstClock.count + 1, lastMinute: again.state.time.minute });
  assert.ok(!available(again.state, "act_hunt_band_remnants"));

  // Both a long step and a day at a time must reach the same quiet/cadence at the exact boundary.
  const longPack = structuredClone(worldData);
  longPack.actions.act_test_long_wait = { minutes: 10079, effects: [] };
  const almost = step(again.state, P("act_test_long_wait"), longPack);
  assert.ok(!almost.events.some((e) => e.type === "action.rejected"));
  assert.equal(sig(almost.state, "remnants_quiet"), 1);
  assert.ok(!available(almost.state, "act_hunt_band_remnants"), "10079 minutes since the second success");
  const boundary = run(almost.state, [{ type: "wait", minutes: 1 }]).state;
  assert.equal(sig(boundary, "remnants_quiet"), 0);
  assert.ok(available(boundary, "act_hunt_band_remnants"), "10080 minutes since the second success");
  const short = run(again.state, Array(7).fill(DAY)).state;
  assert.equal(sig(short, "remnants_quiet"), sig(boundary, "remnants_quiet"));
  assert.deepEqual(short.fired.evt_unrest_remnants_regroup, boundary.fired.evt_unrest_remnants_regroup);

  // The same restart must discard a much older cadence without catching up all dormant days.
  const dormant = run(hunted.state, Array(30).fill(DAY)).state;
  assert.equal(sig(dormant, "remnants_quiet"), 0);
  const late = rollTo(dormant, [P("act_hunt_band_remnants")], "success", "hunt-late");
  assert.equal(sig(late.state, "remnants_quiet"), 7);
  assert.deepEqual(late.state.fired.evt_unrest_remnants_regroup, {
    count: dormant.fired.evt_unrest_remnants_regroup.count + 1,
    lastMinute: late.state.time.minute
  });
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_hunt", late.state, { savedAt: 1 }))));
  assert.deepEqual(loaded, late.state);
  assert.equal(sig(run(loaded, Array(6).fill(DAY)).state, "remnants_quiet"), 1);
  assert.equal(sig(run(loaded, Array(7).fill(DAY)).state, "remnants_quiet"), 0);
  const ambush = rollTo(woods, [P("act_hunt_band_remnants")], "fail", "hunt-no");
  assert.ok(said(ambush).includes("txt_remnants_ambush"));
  assert.equal(me(ambush.state).hp.current, Math.max(0, me(woods).hp.current - 6));
  assert.equal(me(ambush.state).money, me(woods).money);
}

// 5. save/load and determinism
function testSaveLoadAndDeterminism() {
  const actions = [M("loc_far_bank"), M("loc_royal_city"), P("act_read_royal_records")];
  const start = at(wonNorth, "loc_river_ford");
  start.knowledge[start.player.actorId].rum_royal_city = { factId: "fact_royal_city", claim: "five_days_north", sources: ["obs_loc_far_bank"], confidence: 80 };
  start.actors[start.player.actorId].money = 20;
  const go = [P("act_talk_ferryman"), C("opt_ferryman_cross"), ...actions.slice(1)];
  const a = run(start, go).state;
  const b = run(start, go).state;
  assert.deepEqual(a, b);
  assert.ok(renowned(a), "walked there and read");
  assert.deepEqual(validateState(a), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_renown", a, { savedAt: 1 }))));
  assert.deepEqual(loaded, a);
  assert.deepEqual(run(loaded, [DAY]).state, run(a, [DAY]).state);
}

testTheWordGoesNorth();
testTheTownAndTheRecords();
testTheApex();
testTheRemnants();
testSaveLoadAndDeterminism();
console.log("V2-Core-142 data-world-renown.test.js: all checks passed");
