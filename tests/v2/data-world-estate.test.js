// V2-Core-118 (#291 succession legacy 2, step 1 -- the guild holds a fallen guard's share): through the ordinary step()
// API and the real pack. No engine change, no new state field (a world number, `estate_held`). Canon: K-14 as amended by
// WB-0027 -- the successor inherits nothing automatically; the one exception beyond the 3 silver is a bounded share the
// guild holds of a guard it KNEW, found and claimed in the world. What is pinned:
//   1. the share is recorded in the very step that kills a known guard: min(floor(wallet / 2), 12), by the boundaries of
//      the unrolled tiers (23/24, 25/26, ... 47/48 and a veteran's hundreds); a guard the guild did not know, or one
//      with a purse of one, leaves nothing; the fall is counted either way as before;
//   2. nothing is handed over: the successor starts as before (template + 3 silver, no gear, no standing, no skill);
//   3. the clerk mentions the share exactly while one is held; the claim is free, pays up to 12 a claim, moves what it pays
//      out of what is held (conservation: silver is moved from a dead wallet, never made), and is closed when nothing is held;
//   4. shares add up fall by fall (each bounded), and a chain of generations cannot compound: per fall at most 12 comes
//      in, whatever the wallet (an inherited purse included);
//   5. compatibility: a save from before the share (no `estate_held`, a fall already counted) is not given one
//      retroactively; a new game is untouched; save/load and determinism.
// Staged where it must be (the guild's standing set where escorts would have put it; the fall -- a known guard does not die
// by chance). The cap (12) and the half are Provisional game values (R-29), measured (#290).
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
const HOUR = { type: "wait", minutes: 60 };
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const ESCORT = [P("act_talk_guild_clerk"), C("opt_guild_clerk_escort")];
const ASK = [P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")];
const CLAIM = [P("act_talk_guild_clerk"), C("opt_guild_clerk_estate")];
const OFFER = "txt_guild_clerk_estate_offer";
const CLAIMED = "txt_guild_clerk_estate";
const CAP = 12;
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const SUCCESSOR_WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];

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
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const clerkOpen = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { let t = s; for (let h = 0; h < 96 && !clerkOpen(t, "opt_guild_clerk_escort"); h += 1) t = play(t, [HOUR]).state; assert.ok(clerkOpen(t, "opt_guild_clerk_escort"), "a convoy wants a guard"); return t; };
const share = (wallet) => Math.min(Math.floor(wallet / 2), CAP);

const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;
// a guard with a purse; known (standing 10) or not (5)
function guardWith(money, known = true) {
  const s = structuredClone(town);
  me(s).money = money;
  growth(s).stats.str = 14;
  s.relations = { ...s.relations, [`npc_guild_clerk:${s.player.actorId}`]: { score: known ? 10 : 5 } };
  return s;
}
// the fall, staged: the last point of hp, no strength, and a bad roll (the first rng cursor at which the escort's check
// fails -- found deterministically on the staged state)
function falls(s) {
  const c = waitForConvoy(structuredClone(s));
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.state.pending?.kind === "newCharacter") return r;
  }
  throw new Error("no bad roll within 60 rolls");
}
const fallOf = (money, known = true) => falls(guardWith(money, known));

// 1. what the guild holds: the share, by the boundaries of the tiers
function testRecorded() {
  assert.deepStrictEqual(validateData(worldData), []);
  assert.strictEqual(Object.keys(worldData.events).includes("evt_known_guard_fell"), true);
  for (const money of [0, 1, 2, 3, 6, 10, 20, 21, 22, 23, 24, 25, 40, 46, 47, 48, 49, 100, 700]) {
    const fell = fallOf(money);
    const purse = me(fell.state).money; // the dead guard's purse, as the fall left it (the escort's pay included)
    assert.deepStrictEqual(fell.state.pending, { kind: "newCharacter" });
    assert.strictEqual(sig(fell.state, "estate_held"), share(purse), `purse ${purse} (started ${money}): the share is min(floor(purse / 2), ${CAP})`);
    assert.strictEqual(sig(fell.state, "guards_fallen"), 1, "the fall is counted as before");
    assert.ok(fell.log.at(-1).events.some((e) => e.type === "trigger.fired" && e.data.eventId === "evt_known_guard_fell"), "in the very step");
  }
  // the boundaries themselves: find purses either side of a tier by the dead guard's own purse
  const byPurse = new Map();
  for (let money = 0; money <= 60; money += 1) byPurse.set(me(fallOf(money).state).money, sig(fallOf(money).state, "estate_held"));
  assert.strictEqual(byPurse.get(1), 0, "a purse of one holds nothing");
  assert.strictEqual(byPurse.get(2), 1);
  assert.strictEqual(byPurse.get(23), 11, "23 -> 11");
  assert.strictEqual(byPurse.get(24), 12, "24 -> the cap");
  assert.strictEqual(byPurse.get(25), 12, "25 -> still the cap");
  assert.strictEqual(share(me(fallOf(700).state).money), CAP);
  assert.strictEqual(sig(fallOf(700).state, "estate_held"), CAP, "a veteran's hundreds hold no more than the cap");
  // a guard the guild did not know leaves nothing, and is not even counted
  const unknown = fallOf(100, false).state;
  assert.deepStrictEqual([sig(unknown, "estate_held"), sig(unknown, "guards_fallen")], [0, 0], "the guild did not know them");
  // the kit of the fallen is a separate thing: the share does not touch it
  assert.strictEqual(sig(fallOf(100).state, "kit_steel"), 0);
  return fallOf(100).state;
}

// 2-3. nothing handed over; found and claimed
function testClaimed(fell) {
  assert.strictEqual(sig(fell, "estate_held"), CAP);
  const lived = play(fell, [NEW_LIFE]).state;
  const startMoney = me(createInitialState({ worldSeed: "estate-1", data: worldData }).state).money;
  assert.strictEqual(me(lived).money, startMoney + 3, "the template's purse and the 3 silver of the Canon, nothing else");
  assert.strictEqual(standing(lived), undefined, "no standing");
  assert.ok(!Object.values(growth(lived).proficiency ?? {}).some((v) => v > 0), "no practice");
  assert.strictEqual(growth(lived).skills?.swordsmanship ?? 0, 0, "no skill");
  assert.deepStrictEqual(me(lived).inventory ?? {}, me(createInitialState({ worldSeed: "estate-1", data: worldData }).state).inventory ?? {}, "no belongings");
  assert.strictEqual(sig(lived, "estate_held"), CAP, "the guild still holds it");

  const inTown = play(lived, SUCCESSOR_WALK).state;
  // the clerk says so, once the successor asks, exactly while a share is held
  const asked = play(inTown, ASK);
  assert.ok(asked.said.includes(OFFER), "the clerk mentions what the guild holds");
  const notHeld = structuredClone(inTown);
  notHeld.signals = { ...notHeld.signals, estate_held: 0 };
  assert.ok(!play(notHeld, ASK).said.includes(OFFER), "and does not when nothing is held");
  // the claim: free, moves exactly what it pays out of what is held
  assert.strictEqual(clerkOpen(inTown, "opt_guild_clerk_estate"), true);
  const before = me(inTown).money;
  const took = play(inTown, CLAIM);
  assert.deepStrictEqual(took.said, [CLAIMED]);
  assert.strictEqual(me(took.state).money, before + CAP, "a share of 12 paid");
  assert.strictEqual(sig(took.state, "estate_held"), 0, "and what was paid is no longer held (conservation)");
  assert.strictEqual(clerkOpen(took.state, "opt_guild_clerk_estate"), false, "closed when nothing is held");
  assert.ok(!play(took.state, ASK).said.includes(OFFER), "the clerk no longer mentions it");
  assert.strictEqual(standing(took.state), standing(inTown), "claiming gives no standing");
  // it is claimable once only: a second ask changes nothing
  assert.strictEqual(me(play(took.state, ASK).state).money, me(took.state).money);
  return inTown;
}

// 3b. shares add up, each bounded; a claim pays up to 12 and the rest stays
function testPooled(inTown) {
  for (const [held, first, left] of [[1, 1, 0], [11, 11, 0], [12, 12, 0], [13, 12, 1], [17, 12, 5], [24, 12, 12]]) {
    const s = structuredClone(inTown);
    s.signals = { ...s.signals, estate_held: held };
    const m0 = me(s).money;
    const one = play(s, CLAIM).state;
    assert.strictEqual(me(one).money - m0, first, `held ${held}: the claim pays ${first}`);
    assert.strictEqual(sig(one, "estate_held"), left, `and ${left} stays held`);
    assert.strictEqual(clerkOpen(one, "opt_guild_clerk_estate"), left > 0);
  }
  // the pool is claimed in full by asking again, and never more than was held
  const s = structuredClone(inTown);
  s.signals = { ...s.signals, estate_held: 17 };
  const m0 = me(s).money;
  const all = play(s, [...CLAIM, ...CLAIM]).state;
  assert.strictEqual(me(all).money - m0, 17);
  assert.strictEqual(sig(all, "estate_held"), 0);
  // closed when nothing is held (and the option is the clerk's only: a guard who was never part of a fall is offered nothing)
  const none = structuredClone(inTown);
  none.signals = { ...none.signals };
  delete none.signals.estate_held;
  assert.strictEqual(clerkOpen(none, "opt_guild_clerk_estate"), false);
  assert.strictEqual(clerkOpen(town, "opt_guild_clerk_estate"), false, "a world with no fall holds nothing");
}

// 4. generations cannot compound: each fall brings in at most the cap, whatever the purse
function testChain() {
  let s = fallOf(5000).state; // a purse far beyond what any career makes: the share is still the cap
  assert.strictEqual(sig(s, "estate_held"), CAP);
  let held = sig(s, "estate_held");
  for (let generation = 1; generation <= 3; generation += 1) {
    s = play(play(s, [NEW_LIFE]).state, SUCCESSOR_WALK).state;
    s = play(s, CLAIM).state; // the share is found and paid
    assert.strictEqual(sig(s, "estate_held"), held - CAP + 0, "what was paid is no longer held");
    // the successor, known and rich on what they claimed and a fortune, falls in turn: only the cap comes in again
    const known = structuredClone(s);
    me(known).money = 5000;
    known.relations = { ...known.relations, [`npc_guild_clerk:${known.player.actorId}`]: { score: 10 } };
    growth(known).stats.str = 14;
    const next = falls(known).state;
    assert.strictEqual(sig(next, "estate_held") - sig(s, "estate_held"), CAP, `generation ${generation}: at most ${CAP} comes in`);
    assert.strictEqual(sig(next, "estate_held"), CAP);
    s = next;
    held = CAP;
  }
  // two falls with nothing claimed between them: held shares add, each bounded
  const first = fallOf(100).state;
  const second = (() => {
    const lived = play(play(first, [NEW_LIFE]).state, SUCCESSOR_WALK).state;
    const known = structuredClone(lived);
    me(known).money = 100;
    known.relations = { ...known.relations, [`npc_guild_clerk:${known.player.actorId}`]: { score: 10 } };
    growth(known).stats.str = 14;
    return falls(known).state;
  })();
  assert.strictEqual(sig(second, "estate_held"), 2 * CAP, "two falls hold two shares");
  assert.strictEqual(sig(second, "guards_fallen"), 2);
}

// 5. compatibility
function testCompat() {
  // a save from before the share: a known guard has already fallen (counted), the world holds none, and a pending
  // newCharacter is not given one retroactively
  const old = structuredClone(fallOf(100).state);
  delete old.signals.estate_held;
  assert.deepStrictEqual(validateState(old), []);
  const lived = play(play(old, [NEW_LIFE]).state, SUCCESSOR_WALK).state;
  assert.strictEqual(sig(lived, "estate_held"), 0, "no legacy is made for a fall that was already past");
  assert.strictEqual(clerkOpen(lived, "opt_guild_clerk_estate"), false);
  assert.ok(!play(lived, ASK).said.includes(OFFER));
  assert.strictEqual(sig(lived, "guards_fallen"), 1, "the old count stays");
  // a new game carries no share, and the field is simply absent
  const fresh = createInitialState({ worldSeed: "estate-2", data: worldData }).state;
  assert.strictEqual(fresh.signals?.estate_held, undefined);
  assert.deepStrictEqual(validateState(fresh), []);
}

// save/load and determinism across the lives
function testSaveAndDeterminism() {
  const fell = fallOf(100).state;
  assert.deepStrictEqual(validateState(fell), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_estate_fell", fell, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, fell);
  const rest = [NEW_LIFE, ...SUCCESSOR_WALK, ...CLAIM];
  const end = play(fell, rest).state;
  assert.deepStrictEqual(validateState(end), []);
  assert.deepStrictEqual(play(loaded, rest).state, end, "loaded between the lives, the same end");
  assert.deepStrictEqual(play(fell, rest).state, end, "the same input, the same world");
}

const fell = testRecorded();
const inTown = testClaimed(fell);
testPooled(inTown);
testChain();
testCompat();
testSaveAndDeterminism();
console.log("V2-Core-118 data-world-estate.test.js: all checks passed");
