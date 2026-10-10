// V2-Core-123 (#302 Death & Injury, step 3 -- the world remembers the maimed): through the ordinary step() API and the real pack.
// No engine change, no new state field (a world number, `guards_maimed`). The owner approved it as World Memory, NOT as a personal
// state: the guild remembers a guard it KNEW who came back from the road with a deep wound; the successor is not given it, nor
// trust, skill or belongings -- the successor finds it out (the clerk says it) and is offered the careful way. Pinned:
//   1. what is counted: a known guard (standing 10) who comes back with a deep wound, once per wound (a second deep wound after a
//      cure counts again); not an unknown guard, not a mild wound, not a guard the same blow kills (that one is a fall,
//      counted as before -- never as maimed too);
//   2. what the world does with it: the clerk tells any guard -- a whole one, a successor -- while one is held; the careful way
//      (the world-memory job: an easier check, a failure that costs nothing) is offered when a guard has fallen OR been maimed,
//      with its own word when only a maiming is remembered; a world with neither never offers it;
//   3. not inherited: a successor starts with no deep wound, no standing, and does not carry the number (it is the world's, the
//      same as before); the clerk's word and the careful way reach them anyway;
//   4. old saves: nothing is made for the past -- a save with a fall already counted and no `guards_maimed`, or a character
//      with a mild wound from before, has none; save/load and determinism.
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
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ESCORT = CLERK("opt_guild_clerk_escort");
const ASK = CLERK("opt_guild_clerk_ask");
const TREAT = P("act_treat_road_wound");
const OFFER_FELL = "txt_guild_clerk_careful_offer";
const OFFER_MAIMED = "txt_guild_clerk_careful_offer_maimed";
const WORD_MAIMED = "txt_guild_clerk_maimed";
const WORD_FELL = "txt_guild_clerk_fallen";
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
const deep = (s) => growth(s).traits?.road_wound_deep === true;
const mild = (s) => growth(s).traits?.road_wound === true;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score;
const optionOpen = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !optionOpen(s, "opt_guild_clerk_escort"); h += 1) s = play(s, [HOUR]).state; assert.ok(optionOpen(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };

const town = (() => { const s = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state; me(s).money = 200; return s; })();
// a guard at hp `h` with a convoy waiting; known to the guild (standing 10) or not (5); weak enough that the first bad roll fails
function ready(h, known = true) {
  const s = waitForConvoy(structuredClone(town));
  me(s).hp.current = h;
  growth(s).stats.str = 0;
  growth(s).resources.stamina.current = 6;
  s.relations = { ...s.relations, [`npc_guild_clerk:${s.player.actorId}`]: { score: known ? 10 : 5 } };
  return s;
}
function fails(s) {
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(s);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.said.includes("txt_escort_fail")) return r.state.pending ? r.state : play(r.state, [M("loc_castle_town")]).state;
  }
  throw new Error("no bad roll within 60 rolls");
}
const cured = (s) => { const t = structuredClone(s); me(t).inventory = { ...(me(t).inventory ?? {}), item_herbal_salve: 1 }; return play(t, [TREAT]).state; };

// 1. what is counted
function testCounted() {
  assert.deepStrictEqual(validateData(worldData), []);
  const maimed = fails(ready(5));
  assert.ok(deep(maimed));
  assert.strictEqual(sig(maimed, "guards_maimed"), 1, "a known guard comes back with a deep wound: remembered");
  assert.strictEqual(sig(maimed, "guards_fallen"), 0, "and has not fallen");
  assert.strictEqual(sig(fails(ready(4)), "guards_maimed"), 1, "hp 4 -> 1: still alive, still counted");
  const unknown = fails(ready(5, false));
  assert.ok(deep(unknown));
  assert.strictEqual(sig(unknown, "guards_maimed"), 0, "the guild did not know them: nothing remembered");
  const lightly = fails(ready(8));
  assert.ok(mild(lightly) && !deep(lightly));
  assert.strictEqual(sig(lightly, "guards_maimed"), 0, "a mild wound is not remembered");
  const dead = fails(ready(3));
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(dead, "guards_fallen"), 1, "the blow that kills is a fall, counted as before");
  assert.strictEqual(sig(dead, "guards_maimed"), 0, "and not a maiming too");
  // a second deep wound after a cure is a second thing remembered
  const again = fails(waitForConvoy((() => { const t = cured(maimed); me(t).hp.current = 5; return t; })()));
  assert.ok(deep(again));
  assert.strictEqual(sig(again, "guards_maimed"), 2, "once per wound");
  return maimed;
}

// 2. what the world does with it
function testWorld(maimed) {
  // a whole guard (the wound cured, hp back, a convoy waiting) hears of it: it is the world's, not the wounded guard's
  const whole = waitForConvoy(cured(maimed));
  me(whole).hp.current = me(whole).hp.max;
  assert.ok(!deep(whole) && !mild(whole));
  const asked = play(whole, ASK);
  assert.ok(asked.said.includes(WORD_MAIMED), "the clerk tells any guard");
  assert.ok(!asked.said.includes(WORD_FELL), "and does not claim a fall");
  assert.ok(asked.said.includes(OFFER_MAIMED), "the careful way, said for a maiming");
  assert.ok(!asked.said.includes(OFFER_FELL));
  assert.ok(optionOpen(whole, "opt_guild_clerk_escort_careful"), "a world that remembers a maiming offers the careful way");
  // the wounded guard too: the careful way is what a guard who would rather not risk the road takes (no hp, no wound)
  const hurt = waitForConvoy(structuredClone(maimed));
  growth(hurt).resources.stamina.current = 6;
  assert.ok(optionOpen(hurt, "opt_guild_clerk_escort_careful"));
  const careful = play(hurt, CLERK("opt_guild_clerk_escort_careful"));
  assert.ok(hp(careful.state) >= hp(hurt), "the careful way costs no hp");
  // both memories: both words; the fall's offer text, not the maiming's
  const both = structuredClone(whole);
  both.signals = { ...both.signals, guards_fallen: 1 };
  const bothAsked = play(both, ASK);
  assert.ok(bothAsked.said.includes(WORD_MAIMED) && bothAsked.said.includes(WORD_FELL));
  assert.ok(bothAsked.said.includes(OFFER_FELL) && !bothAsked.said.includes(OFFER_MAIMED), "one offer, not two");
  // no convoy waiting (right after the escort): the clerk still tells it, and offers no way through a job that is not there
  assert.ok(!optionOpen(maimed, "opt_guild_clerk_escort"), "no convoy waits right after one");
  const idle = play(maimed, ASK);
  assert.ok(idle.said.includes(WORD_MAIMED), "the word does not wait on a convoy");
  assert.ok(!idle.said.includes(OFFER_MAIMED), "but a way through a job that is not there is not offered");
  // a world with neither remembers nothing
  const none = waitForConvoy(structuredClone(town));
  assert.ok(!optionOpen(none, "opt_guild_clerk_escort_careful"), "no memory, no careful way");
  const noneAsked = play(none, ASK);
  assert.ok(!noneAsked.said.includes(WORD_MAIMED) && !noneAsked.said.includes(OFFER_MAIMED));
}
const hp = (s) => me(s).hp.current;

// 3. not inherited: the successor is not given it, and finds it out
function testSuccessor() {
  const maimed = fails(ready(5));
  // the same guard later falls (a known guard, a bad roll at hp 1)
  const doomed = (() => {
    const s = waitForConvoy(cured(maimed));
    me(s).hp.current = 1;
    growth(s).stats.str = 0;
    growth(s).resources.stamina.current = 6;
    return s;
  })();
  let fell;
  for (let k = 0; k < 60 && !fell; k += 1) {
    const t = structuredClone(doomed);
    t.rng.cursor += k;
    const r = play(t, ESCORT);
    if (r.state.pending?.kind === "newCharacter") fell = r.state;
  }
  assert.ok(fell, "a bad roll");
  assert.strictEqual(sig(fell, "guards_maimed"), 1);
  assert.strictEqual(sig(fell, "guards_fallen"), 1);
  const born = play(fell, [NEW_LIFE]).state;
  assert.ok(!deep(born) && !mild(born), "the wound is the character's: a successor starts whole");
  assert.strictEqual(standing(born), undefined, "no standing");
  assert.strictEqual(sig(born, "guards_maimed"), 1, "the number is the world's, as it was -- not copied, not added to");
  assert.ok(!Object.keys(me(born)).some((k) => /maim/i.test(k)) && !JSON.stringify(me(born)).includes("guards_maimed"), "nothing of it on the actor");
  const inTown = play(born, SUCCESSOR_WALK).state;
  const asked = play(waitForConvoy(inTown), ASK);
  assert.ok(asked.said.includes(WORD_MAIMED), "the successor finds it out: the clerk says it");
  assert.ok(asked.said.includes(WORD_FELL));
  assert.ok(optionOpen(waitForConvoy(inTown), "opt_guild_clerk_escort_careful"), "and is offered the careful way");
}

// 4. old saves
function testOldSave() {
  // a save with a fall already counted and no maimed number (the pack before): nothing is made for the past
  const old = ready(10);
  old.signals = { ...old.signals, guards_fallen: 1 };
  assert.strictEqual(old.signals.guards_maimed, undefined);
  assert.deepStrictEqual(validateState(old), []);
  const asked = play(old, ASK);
  assert.ok(asked.said.includes(WORD_FELL) && !asked.said.includes(WORD_MAIMED));
  assert.ok(optionOpen(old, "opt_guild_clerk_escort_careful"), "as before");
  // a character who carries a mild wound from the old pack: no memory made of it
  const mildOld = structuredClone(old);
  growth(mildOld).traits = { road_wound: true };
  const night = play(mildOld, [P("act_lodge_castle_town")]);
  assert.ok(!mild(night.state));
  assert.strictEqual(sig(night.state, "guards_maimed"), 0, "nothing remembered of the past");
  // a fresh world: the number is simply absent
  assert.strictEqual(createInitialState({ worldSeed: "maimed-1", data: worldData }).state.signals?.guards_maimed, undefined);
}

// save/load and determinism
function testSaveAndDeterminism() {
  const maimed = fails(ready(5));
  assert.deepStrictEqual(validateState(maimed), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_maimed", maimed, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, maimed);
  const path = [P("act_lodge_castle_town"), P("act_lodge_castle_town"), ...ASK];
  const end = play(maimed, path).state;
  assert.deepStrictEqual(play(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(maimed, path).state, end, "the same input, the same world");
  assert.strictEqual(sig(end, "guards_maimed"), 1, "remembered across the nights");
}

const maimed = testCounted();
testWorld(maimed);
testSuccessor();
testOldSave();
testSaveAndDeterminism();
console.log("V2-Core-123 data-world-guards-maimed.test.js: all checks passed");
