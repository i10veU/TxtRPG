// V2-Core-125 (#307, Road News step 1a -- the road has a condition, and word of it): through the ordinary step() API and the
// real pack. No engine change, no new state field: a world number (`road_trouble`, 0 quiet / 1 uneasy / 2 dangerous), the
// fact that names it (`fact_road_north`), the world's place on the road's course (`fact_road_course`, a `pickFrom` seeded at
// creation from its own stream, D-76) and its phase (`road_phase`). Pinned:
//   1. the course: one turn per caravan cycle (`catchUp`, D-107), at most one step, between quiet and dangerous; the moves are
//      those of a 2d10 world roll against 10 once the leader is dead (26 / 8 / 6 of forty: ease / hold / worsen) and against 12
//      while he lives (18 / 11 / 11) -- drawn once, so the turn draws none of the world's dice; each world starts at its own
//      place; the same world, the same course;
//   2. what it changes: only the danger job -- a failure costs 2 / 4 / 7 hp by the condition, a success on a dangerous road pays
//      3 more; the ordinary escort, the lead and the careful way cost what they did on every road;
//   3. word of it: the clerk tells a guard the guild knows (10) the exact condition (a rumour per condition, the clerk's,
//      confidence 80, and a line per condition); anyone else hears the yard's talk -- quiet or unsettled, nothing finer
//      (confidence 40) -- and that the ledger is for known guards; a guard who rides sees it (confidence 90); a guard the road
//      kills sees nothing; asking changes nothing in the world; no line says who or why;
//   4. knowledge over time: a word is dated (first / last seen), kept when the road moves on (old word stays, it is not
//      corrected), re-seen when heard again, and two sources of the same word are both kept;
//   5. the character's, not the world's: a successor knows nothing of the road and is not known to the guild -- the road itself
//      goes on;
//   6. old saves: no course, no phase -- the first place, a first turn at the next step, nothing made for the past; save/load
//      and determinism.
// Values and words are Provisional (R-29). No Canon.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const DAY = { type: "wait", minutes: 1440 };
const CYCLE = [DAY, DAY, DAY];
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ASK = CLERK("opt_guild_clerk_ask");
const ESCORT = CLERK("opt_guild_clerk_escort");
const LEAD = CLERK("opt_guild_clerk_escort_lead");
const DANGER = CLERK("opt_guild_clerk_escort_danger");
const CAREFUL = CLERK("opt_guild_clerk_escort_careful");
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const CONDITIONS = ["quiet", "uneasy", "dangerous"];
const EXACT = ["rum_road_quiet", "rum_road_uneasy", "rum_road_dangerous"];
const TALK = ["rum_road_talk_quiet", "rum_road_talk_unsettled"];
const ROAD_TEXTS = ["txt_guild_clerk_road_quiet", "txt_guild_clerk_road_uneasy", "txt_guild_clerk_road_dangerous", "txt_guild_yard_road_quiet",
  "txt_guild_yard_road_unsettled", "txt_guild_clerk_road_for_known", "txt_road_seen_quiet", "txt_road_seen_uneasy", "txt_road_seen_dangerous", "txt_danger_road_bonus"];
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
const day = (s) => Math.floor(s.time.minute / 1440);
const known = (s) => s.knowledge?.[s.player.actorId] ?? {};
const roadWords = (s) => Object.keys(known(s)).filter((id) => id.startsWith("rum_road_") && worldData.rumors[id].factId === "fact_road_north").sort();
const check = (r) => r.log.map((x) => x.events.find((e) => e.type === "check.resolved")).filter(Boolean).at(-1);
const open = (s, id) => evaluateCondition(worldData.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: worldData, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = play(s, [HOUR]).state; assert.ok(open(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };
const leaderLives = (s) => evaluateCondition({ op: "alive", subject: "npc_bandit_leader" }, { state: s, data: worldData, contextKind: "world" });
const edit = (s, f) => { const c = structuredClone(s); f(c); return c; };
const onRoad = (s, trouble) => edit(s, (c) => { c.signals = { ...c.signals, road_trouble: trouble }; c.facts.fact_road_north = { value: CONDITIONS[trouble], since: c.time.minute }; });
const withStanding = (s, score) => edit(s, (c) => { c.relations = { ...c.relations, [`npc_guild_clerk:${c.player.actorId}`]: { score } }; });
// the first rng cursor at which the job lands in the wanted tier(s) -- found on the same state
function landing(s, job, tiers) {
  for (let k = 0; k < 200; k += 1) {
    const t = edit(s, (c) => { c.rng.cursor += k; });
    const r = play(t, job);
    if (tiers.includes(check(r).data.tier)) return { before: t, r };
  }
  throw new Error(`no cursor lands ${JSON.stringify(tiers)}`);
}

const town = play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state;

// the course, read back from the pack: the moves made at each phase, by the leader's fate
function courseOf(lives) {
  const turn = worldData.events.evt_road_north.effects;
  const branch = turn.find((e) => e.op === "if" && e.when?.op === "alive");
  const moves = Array(40).fill("P");
  for (const m of lives ? branch.then : branch.else) moves[m.when.eq] = m.then[0].then[0].add === -1 ? "E" : "F";
  return moves;
}
// the walk the course makes from a place and a condition, step by step
function expectedWalk(place, trouble, lives, turns) {
  const out = [];
  let phase = place;
  for (let i = 0; i < turns; i += 1) {
    const move = courseOf(lives(i))[phase];
    if (move === "E" && trouble > 0) trouble -= 1;
    if (move === "F" && trouble < 2) trouble += 1;
    out.push(trouble);
    phase = (phase + 1) % 40;
  }
  return out;
}

// 1. the course
function testCourse() {
  assert.deepStrictEqual(validateData(worldData), []);
  const evt = worldData.events.evt_road_north;
  assert.strictEqual(evt.check, undefined, "no roll at play time");
  assert.deepStrictEqual([evt.cooldown, evt.catchUp], [4320, true], "the caravans' cadence, caught up");
  const count = (moves) => ["E", "P", "F"].map((m) => moves.filter((x) => x === m).length);
  assert.deepStrictEqual(count(courseOf(false)), [26, 8, 6], "the leader dead: as 2d10 against 10 (64 / 21 / 15)");
  assert.deepStrictEqual(count(courseOf(true)), [18, 11, 11], "the leader alive: as 2d10 against 12 (45 / 27 / 28)");
  // and in an order whose long-run shares of quiet / uneasy / dangerous are the roll's own (a three-state walk: up p, down q)
  const stationary = (p, q) => { const r = p / q, z = 1 + r + r * r; return [1 / z, r / z, (r * r) / z]; };
  const shares = (lives) => {
    const tally = [0, 0, 0];
    for (let place = 0; place < 40; place += 1) expectedWalk(place, 0, () => lives, 80).slice(40).forEach((t) => { tally[t] += 1; });
    return tally.map((n) => n / 1600);
  };
  for (const [lives, target] of [[false, stationary(0.15, 0.64)], [true, stationary(0.28, 0.45)]]) {
    shares(lives).forEach((x, i) => assert.ok(Math.abs(x - target[i]) <= 0.01, `the ${lives ? "watched" : "free"} course's ${CONDITIONS[i]} share ${x.toFixed(3)} is the roll's ${target[i].toFixed(3)}`));
  }
  assert.deepStrictEqual(worldData.facts.fact_road_course.initial.pickFrom, Array.from({ length: 40 }, (_, i) => i));

  // walked: the first turn came with the first walker; the world's place is its course fact
  assert.ok(town.fired.evt_road_north, "the road turned when it was first walked");
  const place = town.facts.fact_road_course.value;
  assert.strictEqual(sig(town, "road_phase"), (place + 1) % 40, "the first turn started at the world's place");
  assert.strictEqual(town.facts.fact_road_north.value, CONDITIONS[sig(town, "road_trouble")]);
  assert.ok(leaderLives(town), "history-41 disperses the bandits; the leader lives");

  // forty cycles in the town: one turn each, at most one step, the fact names the number, and no world dice are drawn
  let s = town;
  const walk = [];
  for (let i = 0; i < 40; i += 1) {
    const before = s;
    s = play(s, CYCLE).state;
    assert.strictEqual(s.rng.cursor, before.rng.cursor, "the turn draws none of the world's dice");
    assert.strictEqual(s.fired.evt_road_north.count - before.fired.evt_road_north.count, 1, "one turn a cycle");
    assert.ok(Math.abs(sig(s, "road_trouble") - sig(before, "road_trouble")) <= 1, "at most one step");
    assert.strictEqual(s.facts.fact_road_north.value, CONDITIONS[sig(s, "road_trouble")]);
    walk.push(sig(s, "road_trouble"));
  }
  assert.deepStrictEqual(walk, expectedWalk((place + 1) % 40, sig(town, "road_trouble"), () => true, 40), "the course, as written");
  assert.ok(new Set(walk).size >= 2, "the road does move");
  assert.strictEqual(sig(s, "road_phase"), sig(town, "road_phase"), "forty turns: back at the same place");

  // the leader's fate changes the course from the next turn: the same world with him dead walks the other course
  const dead = edit(town, (c) => { c.actors.npc_bandit_leader.alive = false; });
  assert.ok(!leaderLives(dead));
  let d = dead;
  const deadWalk = [];
  for (let i = 0; i < 40; i += 1) { d = play(d, CYCLE).state; deadWalk.push(sig(d, "road_trouble")); }
  assert.deepStrictEqual(deadWalk, expectedWalk((place + 1) % 40, sig(town, "road_trouble"), () => false, 40));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(deadWalk) < mean(walk), `quieter once he is dead (${mean(deadWalk)} against ${mean(walk)})`);

  // each world its own place; the same world, the same course
  const places = new Set(["history-41", "history-81", "rn-a", "rn-b", "rn-c", "rn-d"].map((w) => createInitialState({ worldSeed: w, data: worldData }).state.facts.fact_road_course.value));
  assert.ok(places.size >= 4, `worlds start at their own places (${[...places]})`);
  assert.deepStrictEqual(play(town, Array(6).fill(CYCLE).flat()).state, play(town, Array(6).fill(CYCLE).flat()).state);
}

// a lead-holder in steel with a convoy waiting (the unlock is staged: data-world-road-lead walks the road to it)
const geared = (() => {
  const base = edit(town, (c) => {
    me(c).money = 100;
    growth(c).stats.str = 14;
    growth(c).unlocks = { ...(growth(c).unlocks ?? {}), unl_road_lead: true };
  });
  const s = play(base, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword"), P("act_equip_steel_sword")]).state;
  return waitForConvoy(edit(s, (c) => { growth(c).resources.stamina.current = 6; me(c).hp.current = me(c).hp.max; }));
})();

// 2. what the road changes: the danger job only
function testStakes() {
  assert.ok(open(geared, "opt_guild_clerk_escort_danger"));
  for (const trouble of [0, 1, 2]) {
    const g = onRoad(geared, trouble);
    const failed = landing(g, DANGER, ["partial", "fail"]);
    assert.strictEqual(me(failed.before).hp.current - me(failed.r.state).hp.current, [2, 4, 7][trouble], `the danger job fails for ${[2, 4, 7][trouble]} hp on a ${CONDITIONS[trouble]} road`);
    for (const [tier, pay] of [["success", 10], ["great", 14]]) {
      const won = landing(g, DANGER, [tier]);
      assert.strictEqual(me(won.r.state).money - me(won.before).money, pay + (trouble === 2 ? 3 : 0), `${tier} on a ${CONDITIONS[trouble]} road`);
      assert.strictEqual(won.r.said.includes("txt_danger_road_bonus"), trouble === 2);
    }
    // the rest cost what they did, on every road
    const ordinary = landing(edit(g, (c) => { delete growth(c).unlocks.unl_road_lead; }), ESCORT, ["partial", "fail"]);
    assert.strictEqual(me(ordinary.before).hp.current - me(ordinary.r.state).hp.current, 3, "the ordinary escort: 3");
    const lead = landing(g, LEAD, ["partial", "fail"]);
    assert.strictEqual(me(lead.before).hp.current - me(lead.r.state).hp.current, 3, "the lead: 3");
    const remembering = edit(g, (c) => { c.signals.guards_fallen = 1; });
    const careful = landing(remembering, CAREFUL, ["partial", "fail"]);
    assert.strictEqual(me(careful.r.state).hp.current, me(careful.before).hp.current, "the careful way: nothing");
  }
}

// 3. word of it
function testNews() {
  const s = waitForConvoy(town);
  for (const trouble of [0, 1, 2]) {
    // a guard the guild does not know: the yard's talk, quiet or unsettled -- and that the ledger is for known guards
    const stranger = onRoad(withStanding(s, 5), trouble);
    const heard = play(stranger, ASK);
    const talk = trouble === 0 ? "rum_road_talk_quiet" : "rum_road_talk_unsettled";
    assert.deepStrictEqual(roadWords(heard.state), [talk], "the yard's talk only");
    assert.deepStrictEqual(Object.fromEntries(["claim", "source", "confidence"].map((k) => [k, known(heard.state)[talk][k]])),
      { claim: trouble === 0 ? "quiet" : "unsettled", source: "src_guild_hall_talk", confidence: 40 });
    assert.ok(heard.said.includes(trouble === 0 ? "txt_guild_yard_road_quiet" : "txt_guild_yard_road_unsettled"));
    assert.ok(heard.said.includes("txt_guild_clerk_road_for_known"));
    assert.ok(!heard.said.some((t) => t.startsWith("txt_guild_clerk_road_") && t !== "txt_guild_clerk_road_for_known"), "not the ledger's word");
    // a guard the guild knows: the ledger's exact word
    const guard = onRoad(withStanding(s, 10), trouble);
    const told = play(guard, ASK);
    assert.deepStrictEqual(roadWords(told.state), [EXACT[trouble]]);
    assert.deepStrictEqual(Object.fromEntries(["claim", "source", "confidence", "firstSeenDay", "lastSeenDay"].map((k) => [k, known(told.state)[EXACT[trouble]][k]])),
      { claim: CONDITIONS[trouble], source: "npc_guild_clerk", confidence: 80, firstSeenDay: day(guard), lastSeenDay: day(guard) });
    assert.ok(told.said.includes(`txt_guild_clerk_road_${CONDITIONS[trouble]}`));
    assert.ok(!told.said.some((t) => t.startsWith("txt_guild_yard_road") || t === "txt_guild_clerk_road_for_known"), "not the yard's talk");
    // asking is information: the world is as it was, and no dice are drawn
    for (const r of [heard, told]) {
      const before = r === heard ? stranger : guard;
      assert.deepStrictEqual([r.state.signals, r.state.facts, r.state.rng], [before.signals, before.facts, before.rng]);
    }
  }
  // the words are about the road, not who is on it or why
  for (const id of ROAD_TEXTS) {
    assert.ok(typeof worldData.texts[id] === "string" && worldData.texts[id].length > 0, id);
    assert.ok(!/도적|두목|산적|무리/.test(worldData.texts[id]), `${id} names no one`);
  }
}

// 4. what a guard sees, and what a guard knows over time
function testFirsthandAndTime() {
  const s = withStanding(waitForConvoy(town), 10);
  // a guard who rides sees the road as it is
  for (const trouble of [0, 1, 2]) {
    const g = onRoad(edit(s, (c) => { growth(c).stats.str = 14; }), trouble);
    const rode = landing(g, ESCORT, ["success", "great"]);
    const seen = known(rode.r.state)[EXACT[trouble]];
    assert.deepStrictEqual([seen.claim, seen.source, seen.confidence], [CONDITIONS[trouble], "obs_road_north", 90]);
    assert.ok(rode.r.said.includes(`txt_road_seen_${CONDITIONS[trouble]}`));
  }
  // a guard the road kills sees nothing
  const doomed = onRoad(edit(s, (c) => { me(c).hp.current = 1; growth(c).stats.str = 0; }), 2);
  const fell = landing(doomed, ESCORT, ["partial", "fail"]);
  assert.deepStrictEqual(fell.r.state.pending, { kind: "newCharacter" });
  assert.deepStrictEqual(roadWords(fell.r.state), []);
  assert.ok(!fell.r.said.some((t) => t.startsWith("txt_road_seen_")));

  // over time: heard quiet, the road moves on, the old word stays as it was (dated), the new word is another
  const first = play(onRoad(s, 0), ASK).state;
  const later = onRoad(play(first, [...CYCLE, ...CYCLE]).state, 2);
  const second = play(later, ASK).state;
  assert.deepStrictEqual(roadWords(second), ["rum_road_dangerous", "rum_road_quiet"]);
  assert.deepStrictEqual([known(second).rum_road_quiet.firstSeenDay, known(second).rum_road_quiet.lastSeenDay], [day(first), day(first)], "the old word, dated, not corrected");
  assert.deepStrictEqual([known(second).rum_road_dangerous.firstSeenDay, known(second).rum_road_dangerous.lastSeenDay], [day(later), day(later)]);
  assert.ok(day(later) > day(first));
  // heard again: the same word is seen again (last seen moves, first seen stays)
  const again = play(onRoad(play(second, CYCLE).state, 0), ASK).state;
  assert.deepStrictEqual([known(again).rum_road_quiet.firstSeenDay, known(again).rum_road_quiet.lastSeenDay], [day(first), day(again)]);
  // two sources of the same word: both kept
  const rode = landing(onRoad(edit(again, (c) => { growth(c).stats.str = 14; }), 0), ESCORT, ["success", "great"]).r.state;
  assert.deepStrictEqual(known(rode).rum_road_quiet.sources, ["npc_guild_clerk", "obs_road_north"]);
  assert.strictEqual(known(rode).rum_road_quiet.confirmations, 2);
}

// 5. the character's: a successor knows nothing of it and is not known; the road goes on
function testSuccessor() {
  const s = edit(waitForConvoy(town), (c) => { me(c).hp.current = 1; growth(c).stats.str = 0; });
  const told = play(withStanding(onRoad(s, 1), 10), ASK).state;
  assert.deepStrictEqual(roadWords(told), ["rum_road_uneasy"]);
  const fell = landing(told, ESCORT, ["partial", "fail"]).r.state;
  assert.deepStrictEqual(fell.pending, { kind: "newCharacter" });
  const next = play(fell, [NEW_LIFE, ...WALK]).state;
  assert.deepStrictEqual(roadWords(next), [], "the successor has heard nothing");
  assert.strictEqual(next.facts.fact_road_north.value, CONDITIONS[sig(next, "road_trouble")], "the road is the world's and goes on");
  assert.strictEqual(play(next, CYCLE).state.fired.evt_road_north.count, next.fired.evt_road_north.count + 1, "and turns on");
  const asked = play(waitForConvoy(next), ASK);
  assert.ok(asked.said.includes("txt_guild_clerk_road_for_known"), "and the clerk does not know the successor");
  assert.ok(roadWords(asked.state).every((id) => TALK.includes(id)));
}

// 6. old saves; save/load; determinism
function testOldSaveAndDeterminism() {
  // a save from before: no course, no phase, no condition, never turned
  const old = edit(town, (c) => {
    delete c.facts.fact_road_course;
    delete c.facts.fact_road_north;
    for (const k of ["road_trouble", "road_phase", "road_started"]) delete c.signals[k];
    delete c.fired.evt_road_north;
  });
  assert.deepStrictEqual(validateState(old), []);
  assert.deepStrictEqual(checkDataCompatibility(old, worldData), []);
  const hour = play(old, [HOUR]).state;
  assert.strictEqual(hour.fired.evt_road_north.count, 1, "one turn at the next step -- nothing made for the days before");
  assert.strictEqual(sig(hour, "road_phase"), 1, "from the first place");
  assert.strictEqual(sig(hour, "road_trouble"), expectedWalk(0, 0, () => leaderLives(old), 1)[0]);
  assert.strictEqual(hour.facts.fact_road_north.value, CONDITIONS[sig(hour, "road_trouble")]);
  assert.strictEqual(hour.facts.fact_road_course, undefined, "the old world is given no course fact");
  // save/load mid-way; the same input, the same world
  const path = [...CYCLE, ...ASK, ...CYCLE, ...CYCLE, ...ASK];
  const mid = withStanding(waitForConvoy(town), 10);
  const end = play(mid, path).state;
  assert.deepStrictEqual(validateState(end), []);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_road_news", mid, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, mid);
  assert.deepStrictEqual(play(loaded, path).state, end, "loaded, the same end");
  assert.deepStrictEqual(play(createInitialState({ worldSeed: "history-41", data: worldData }).state, TO_TOWN).state, town, "the same input, the same world");
}

testCourse();
testStakes();
testNews();
testFirsthandAndTime();
testSuccessor();
testOldSaveAndDeterminism();
console.log("V2-Core-125 data-world-road-news.test.js: all checks passed");
