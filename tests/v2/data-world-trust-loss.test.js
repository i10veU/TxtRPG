// V2-Core-130 (#318, MG-046.1 step 1 -- trust that opens doors): a guard who comes back from a failed danger job has lost 30 of
// the guild's trust, through the ordinary step() API and the real pack. No trust gate (step 0 measured one and rejected it).
// No engine change, no new state field, no Canon. Pinned:
//   1. the rule: a failed danger job costs 30 on every road, and says so; a success still earns 10; the ordinary escort,
//      the lead and the careful way cost no trust when they fail; trust can go below zero (the engine's floor is -100);
//   2. the door that already existed (`GUILD_KNOWS`, 10): a guard who falls under it hears the yard's talk instead of the
//      ledger and loses the known guard's +1; good escorts earn both back at 10;
//   3. what the world records and what the guild knows are two things:
//      - a known guard the failed danger job kills dies known (the loss is for the living): the guild remembers the fall;
//      - a guard who lost the guild's trust and dies later dies unknown to the guild: no fall is counted, no share is held,
//        and the village hears nothing of it -- but the world's own record of the death stays (the dead actor, the count
//        of lives);
//      - a deep wound from the failed job is remembered as the guild knew the guard then;
//   4. old saves: nothing is taken back for the past; save/load and determinism.
// Values and words are Provisional (R-29). No Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const DAY = { type: "wait", minutes: 1440 };
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ASK = CLERK("opt_guild_clerk_ask");
const ESCORT = CLERK("opt_guild_clerk_escort");
const LEAD = CLERK("opt_guild_clerk_escort_lead");
const DANGER = CLERK("opt_guild_clerk_escort_danger");
const CAREFUL = CLERK("opt_guild_clerk_escort_careful");
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const CONDITIONS = ["quiet", "uneasy", "dangerous"];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score ?? 0;
const known = (s) => s.knowledge?.[s.player.actorId] ?? {};
const check = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1);
const open = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const edit = (s, f) => { const c = structuredClone(s); f(c); return c; };
const onRoad = (s, trouble) => edit(s, (c) => { c.signals = { ...c.signals, road_trouble: trouble }; c.facts.fact_road_north = { value: CONDITIONS[trouble], since: c.time.minute }; });
const withStanding = (s, score) => edit(s, (c) => { c.relations = { ...c.relations, [`npc_guild_clerk:${c.player.actorId}`]: { score } }; });
const fresh = (s) => edit(s, (c) => { growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; delete growth(c).traits?.road_wound; delete growth(c).traits?.road_wound_deep; });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = play(s, [HOUR]).state; assert.ok(open(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };
// the first rng cursor at which the job lands in the wanted tier(s) -- found on the same state
function landing(s, job, tiers) {
  for (let k = 0; k < 300; k += 1) {
    const t = edit(s, (c) => { c.rng.cursor += k; });
    const r = play(t, job);
    if (tiers.includes(check(r).data.tier)) return { before: t, r };
  }
  throw new Error(`no cursor lands ${JSON.stringify(tiers)}`);
}

const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
// a lead-holder in steel with a convoy waiting, known to the guild (the unlock is staged: data-world-road-lead walks to it)
const geared = (() => {
  const base = edit(town, (c) => {
    me(c).money = 100;
    growth(c).stats.str = 14;
    growth(c).unlocks = { ...(growth(c).unlocks ?? {}), unl_road_lead: true };
  });
  const s = play(base, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword"), P("act_equip_steel_sword")]).state;
  return fresh(withStanding(waitForConvoy(s), 35));
})();

// 1. the rule
function testRule() {
  assert.ok(open(geared, "opt_guild_clerk_escort_danger"));
  for (const trouble of [0, 1, 2]) {
    const g = onRoad(geared, trouble);
    const failed = landing(g, DANGER, ["partial", "fail"]);
    assert.notStrictEqual(failed.r.state.pending?.kind, "newCharacter", "the guard comes back");
    assert.strictEqual(standing(failed.r.state) - standing(failed.before), -30, `a failed danger job on a ${CONDITIONS[trouble]} road costs 30`);
    assert.ok(failed.r.said.includes("txt_danger_fail_trust"), "and the clerk's ledger says so");
    const won = landing(g, DANGER, ["success", "great"]);
    assert.strictEqual(standing(won.r.state) - standing(won.before), 10, "a success still earns 10");
    assert.ok(!won.r.said.includes("txt_danger_fail_trust"));
  }
  // the other jobs cost no trust when they fail
  const ordinary = landing(edit(geared, (c) => { delete growth(c).unlocks.unl_road_lead; }), ESCORT, ["partial", "fail"]);
  assert.strictEqual(standing(ordinary.r.state), standing(ordinary.before), "the ordinary escort: nothing");
  const lead = landing(geared, LEAD, ["partial", "fail"]);
  assert.strictEqual(standing(lead.r.state), standing(lead.before), "the lead: nothing");
  const careful = landing(edit(geared, (c) => { c.signals.guards_fallen = 1; }), CAREFUL, ["partial", "fail"]);
  assert.strictEqual(standing(careful.r.state), standing(careful.before), "the careful way: nothing");
  for (const r of [ordinary, lead, careful]) assert.ok(!r.r.said.includes("txt_danger_fail_trust"));
  // below zero, down to the engine's floor
  const low = landing(withStanding(geared, 15), DANGER, ["partial", "fail"]);
  assert.strictEqual(standing(low.r.state), -15, "trust can go below zero");
  assert.strictEqual(typeof worldData.texts.txt_danger_fail_trust, "string");
  assert.ok(!/도적|두목|산적|무리/.test(worldData.texts.txt_danger_fail_trust), "the line names no one on the road");
}

// 2. the door that already existed: under 10, the yard's talk and no +1; earned back at 10
function testDoor() {
  const g = onRoad(geared, 2);
  const failed = landing(g, DANGER, ["partial", "fail"]).r.state; // 35 -> 5
  assert.strictEqual(standing(failed), 5);
  const back = fresh(waitForConvoy(play(failed, [M("loc_castle_town")]).state));
  // the ledger is closed: the yard's talk, and the clerk says the ledger is for known guards
  const asked = play(back, ASK);
  assert.ok(asked.said.includes("txt_guild_clerk_road_for_known") && asked.said.includes("txt_guild_yard_road_unsettled"));
  assert.ok(!asked.said.includes("txt_guild_clerk_road_dangerous"), "not the ledger's word");
  assert.ok(!asked.said.includes("txt_guild_clerk_knows_you"));
  const yard = Object.values(known(asked.state)).find((k) => k.source === "src_guild_hall_talk" && k.factId === "fact_road_north");
  assert.deepStrictEqual([yard.claim, yard.confidence], ["unsettled", 40]);
  // a good escort pays the plain wage (no +1) and earns 5: 5 -> 10
  const plain = landing(edit(asked.state, (c) => { delete growth(c).unlocks.unl_road_lead; }), ESCORT, ["success"]);
  assert.ok(!plain.r.said.includes("txt_escort_known_bonus"), "no known guard's +1 under 10");
  assert.strictEqual(me(plain.r.state).money - me(plain.before).money, 4, "the plain wage");
  assert.strictEqual(standing(plain.r.state), 10, "earned back to 10");
  // at 10 the ledger and the +1 are back
  const again = fresh(waitForConvoy(play(plain.r.state, [M("loc_castle_town")]).state));
  const told = play(again, ASK);
  assert.ok(told.said.includes("txt_guild_clerk_knows_you"));
  assert.ok(told.said.some((t) => /^txt_guild_clerk_road_(quiet|uneasy|dangerous)$/.test(t)), "the ledger's word again");
  const paid = landing(edit(told.state, (c) => { delete growth(c).unlocks.unl_road_lead; }), ESCORT, ["success"]);
  assert.ok(paid.r.said.includes("txt_escort_known_bonus"), "and the known guard's +1");
}

// 3. what the world records and what the guild knows
function testMemory() {
  // a known guard the failed danger job kills dies known: the guild remembers, the world records the death
  const doomed = onRoad(edit(geared, (c) => { me(c).hp.current = 5; }), 2);
  const killed = landing(doomed, DANGER, ["partial", "fail"]);
  const dead = killed.r.state;
  const deadId = killed.before.player.actorId;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(dead, "guards_fallen"), sig(doomed, "guards_fallen") + 1, "the guild remembers the guard it knew");
  assert.ok(sig(dead, "estate_held") > 0, "and holds a share");
  assert.strictEqual(standing(dead), standing(killed.before), "the loss is for the living");
  assert.ok(!killed.r.said.includes("txt_danger_fail_trust"));
  assert.strictEqual(dead.actors[deadId].alive, false, "the world records the death");

  // a guard who lost the guild's trust and dies later dies unknown to the guild -- the world still records it
  const lost = landing(onRoad(geared, 2), DANGER, ["partial", "fail"]).r.state; // 35 -> 5, alive
  const later = fresh(waitForConvoy(play(lost, [M("loc_castle_town")]).state));
  const frail = edit(later, (c) => { me(c).hp.current = 1; growth(c).stats.str = 0; delete growth(c).unlocks.unl_road_lead; });
  const fell = landing(frail, ESCORT, ["partial", "fail"]);
  const after = fell.r.state;
  const lostId = fell.before.player.actorId;
  assert.deepStrictEqual(after.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(after, "guards_fallen"), sig(frail, "guards_fallen"), "the guild counts no fall of a guard it does not know");
  assert.strictEqual(sig(after, "estate_held"), sig(frail, "estate_held"), "and holds no share");
  assert.strictEqual(after.actors[lostId].alive, false, "the world's own record of the death stays");
  assert.strictEqual(after.player.characterCount, frail.player.characterCount, "the life is still counted (the next one starts on startCharacter)");
  const next = play(after, [NEW_LIFE]).state;
  assert.strictEqual(next.player.characterCount, frail.player.characterCount + 1);
  assert.strictEqual(next.actors[lostId].alive, false, "the dead guard's record outlives the next life's start");
  const village = play(next, [...WALK, DAY, DAY, DAY, DAY, DAY, DAY, DAY]).state;
  assert.notStrictEqual(village.flags?.guard_fall_word_south, true, "the village hears of no fall the guild did not count");

  // a deep wound from the failed job is remembered as the guild knew the guard then (the loss comes after)
  const hurt = onRoad(edit(geared, (c) => { me(c).hp.current = 9; }), 2); // 9 - 7 = 2: a deep wound, alive
  const maimed = landing(hurt, DANGER, ["partial", "fail"]).r.state;
  assert.strictEqual(growth(maimed).traits?.road_wound_deep, true);
  assert.strictEqual(sig(maimed, "guards_maimed"), sig(hurt, "guards_maimed") + 1, "the guild remembers the maimed guard it knew");
  assert.strictEqual(standing(maimed), 5, "and the trust is lost after");
}

// 4. old saves; save/load; determinism
function testOldSaveAndDeterminism() {
  // a save written before Road News (and so before this rule): nothing is taken back
  const record = JSON.parse(readFileSync(new URL("./fixtures/save-before-road-news.json", import.meta.url), "utf8"));
  const old = parseLoadedRecord(record);
  assert.deepStrictEqual(validateState(old), []);
  const before = JSON.stringify(old.relations);
  assert.strictEqual(JSON.stringify(play(old, [HOUR]).state.relations), before, "loading and living on take no trust");
  // save/load mid-way; the same input, the same world
  const g = onRoad(geared, 2);
  const path = [...DANGER, M("loc_castle_town"), DAY, ...ASK];
  const fail = landing(g, DANGER, ["partial", "fail"]).before;
  const end = play(fail, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_trust_loss", fail, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fail);
  assert.deepStrictEqual(play(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state, town, "the same input, the same world");
}

testRule();
testDoor();
testMemory();
testOldSaveAndDeterminism();
console.log("V2-Core-130 data-world-trust-loss.test.js: all checks passed");
