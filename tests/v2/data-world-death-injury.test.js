// V2-Core-124 (#304 Death & Injury, step 4 -- the three tiers together, across lives): through the ordinary step() API and the real pack.
// No new rule. Steps 1-3 gave the road three outcomes (a mild wound a night closes, a deep wound the world remembers, a death the
// next life inherits only as the world's memory) and the guild a way to act on the middle one. This test puts them in one story and in
// a long run, and asks the owner's question (#297) of the whole: "mild wounds are common but short, deep wounds are rare and make a
// real choice, and a risky act ends somewhere between living and dying". Pinned:
//   1. one guard through every tier, in one life: a mild wound (the lead job untouched, a night closes it); a deep wound (the lead
//      job shut, the clerk says why, the world remembers it and offers the careful way); and then the choice the wound makes -- on the
//      very same dice the ordinary escort kills and the careful way costs nothing;
//   2. the next life: born as a new game's first character does (apart from the Canon's 3 silver), the world's numbers exactly as they
//      were (nothing copied, nothing added), and what the guild kept is found, not handed over -- both words, the careful way, the
//      silver share (claimed), the dead guard's sword (bought at half price);
//   3. accounting over long careers (many lives, five policies, every step checked): a deep wound always carries the mild one; hp and
//      stamina stay in bounds; the world's memory never forgets; every life starts whole; and `guards_maimed` is *exactly* the known,
//      living guards who went from whole to deeply wounded, counted from outside -- no more, no less;
//   4. the careful way is a real choice, not a free pass: a guard who rides it when hurt is (nearly) never killed as a known guard, and
//      one who rides it always pays for it in silver. (Measured on 40 seeds x 8 dice, #304; the sample here is small and fixed.)
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition, validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData as d } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const CLERK = (id) => [P("act_talk_guild_clerk"), C(id)];
const ESCORT = CLERK("opt_guild_clerk_escort");
const CAREFUL = CLERK("opt_guild_clerk_escort_careful");
const ASK = CLERK("opt_guild_clerk_ask");
const LEAD = "opt_guild_clerk_escort_lead";
const LODGE = P("act_lodge_castle_town");
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const BACK = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_market")];
const HOME = [M("loc_village"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
// what the clerk says
const SEES_DEEP = "txt_guild_clerk_sees_deep_wound";
const DEEP_CLOSES_LEAD = "txt_guild_clerk_deep_closes_lead";
const WORD_MAIMED = "txt_guild_clerk_maimed";
const WORD_FELL = "txt_guild_clerk_fallen";
const OFFER_FELL = "txt_guild_clerk_careful_offer";
const OFFER_MAIMED = "txt_guild_clerk_careful_offer_maimed";
const OFFER_ESTATE = "txt_guild_clerk_estate_offer";
const OFFER_KIT = "txt_guild_clerk_kit_offer";

function play(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, d);
    assert.ok(!result.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(action)} at ${state.actors[state.player.actorId].locationId}`);
    log.push(result);
    state = result.state;
  }
  return { state, log, said: log.flatMap((r) => r.events.filter((e) => e.type === "narration").map((e) => e.data.textId)) };
}
const run = (s, list) => play(s, list).state;
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const traits = (s) => growth(s).traits ?? {};
const mild = (s) => traits(s).road_wound === true;
const deep = (s) => traits(s).road_wound_deep === true;
const hp = (s) => me(s).hp.current;
const stamina = (s) => growth(s).resources.stamina.current;
const sig = (s, k) => s.signals?.[k] ?? 0;
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score ?? 0;
const open = (s, id) => evaluateCondition(d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const herbalistOpen = (s, id) => evaluateCondition(d.choices.choice_herbalist_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = run(s, [HOUR]); assert.ok(open(s, "opt_guild_clerk_escort"), "a convoy wants a guard"); return s; };
const waitQuiet = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = run(s, [HOUR]); return s; };
const withDice = (s, k) => { const t = structuredClone(s); t.rng.cursor += k; return t; };

const town = (() => { const s = run(createInitialState({ worldSeed: "history-41", data: d }).state, TO_TOWN); me(s).money = 200; return s; })();
// a known guard (standing 10) with a convoy waiting, at hp `h`; weak enough that the first bad roll fails
function ready(h, { lead = false, steel = false } = {}) {
  const s = waitForConvoy(structuredClone(town));
  me(s).hp.current = h;
  growth(s).stats.str = 0;
  growth(s).resources.stamina.current = 6;
  if (lead) growth(s).unlocks = { ...(growth(s).unlocks ?? {}), unl_road_lead: true };
  if (steel) me(s).inventory = { ...(me(s).inventory ?? {}), item_steel_sword: 1 };
  s.relations = { ...s.relations, [`npc_guild_clerk:${s.player.actorId}`]: { score: 10 } };
  return s;
}
// the escort on the first bad roll; the guard walks back to town (unless the blow ended the life)
function fails(s) {
  for (let k = 0; k < 60; k += 1) {
    const r = play(withDice(s, k), ESCORT);
    if (r.said.includes("txt_escort_fail")) return r.state.pending ? r.state : run(r.state, [M("loc_castle_town")]);
  }
  throw new Error("no bad roll within 60 rolls");
}
// a successor, before it acts, is a new game's first character, apart from the Canon's 3 silver
function assertBornAsFresh(born) {
  const fresh = createInitialState({ worldSeed: "history-41", data: d }).state;
  const a = structuredClone(me(born));
  const b = structuredClone(me(fresh));
  assert.strictEqual(a.money, b.money + 3, "the template's purse and the Canon's 3 silver, nothing else");
  for (const x of [a, b]) { delete x.money; delete x.id; }
  assert.deepStrictEqual(a, b, "no wound, no practice, no skill, no belongings, no traits carried over");
  assert.strictEqual(born.relations[`npc_guild_clerk:${born.player.actorId}`], undefined, "no standing");
}

// 1. one guard through every tier
function testOneLife() {
  assert.deepStrictEqual(validateData(d), []);
  const start = ready(10, { lead: true, steel: true });
  assert.ok(open(start, LEAD), "whole: the lead job is open");
  assert.ok(!open(start, "opt_guild_clerk_escort_careful"), "and the world remembers nothing yet: no careful way");

  // tier 1 -- a mild wound, from full hp: common, and short
  const scratched = fails(start);
  assert.ok(mild(scratched) && !deep(scratched), "a mild wound only");
  assert.strictEqual(hp(scratched), 7);
  assert.strictEqual(sig(scratched, "guards_maimed"), 0, "a mild wound is not remembered");
  const stillLead = waitForConvoy(scratched);
  growth(stillLead).resources.stamina.current = 6;
  assert.ok(open(stillLead, LEAD), "a mild wound closes nothing");
  const night = play(scratched, [LODGE]);
  assert.ok(!mild(night.state) && night.said.includes("txt_rest_wound_closes"), "a night closes it, and says so");
  assert.strictEqual(hp(night.state), 10);

  // tier 2 -- a deep wound: the same guard, careless, out on the road at hp 5
  const careless = waitForConvoy(night.state);
  me(careless).hp.current = 5;
  growth(careless).resources.stamina.current = 6;
  const maimed = fails(careless);
  assert.ok(deep(maimed) && mild(maimed), "a deep wound carries the mild one");
  assert.strictEqual(hp(maimed), 2);
  assert.strictEqual(sig(maimed, "guards_maimed"), 1, "the guild knew them: remembered");
  assert.strictEqual(sig(maimed, "guards_fallen"), 0);
  const wounded = waitForConvoy(maimed);
  growth(wounded).resources.stamina.current = 6;
  assert.ok(!open(wounded, LEAD), "the lead job is shut");
  assert.ok(open(wounded, "opt_guild_clerk_escort"), "the ordinary escort is not");
  assert.ok(open(wounded, "opt_guild_clerk_escort_careful"), "and the world, remembering, offers the careful way");
  const asked = play(wounded, ASK);
  for (const id of [SEES_DEEP, DEEP_CLOSES_LEAD, WORD_MAIMED, OFFER_MAIMED]) assert.ok(asked.said.includes(id), `the clerk says ${id}`);
  assert.ok(!asked.said.includes(WORD_FELL), "and claims no fall");

  // the choice the wound makes: on the very same dice the ordinary escort kills and the careful way costs nothing
  let dice = null;
  for (let k = 0; k < 300 && dice === null; k += 1) {
    if (play(withDice(wounded, k), ESCORT).state.pending?.kind !== "newCharacter") continue;
    if (play(withDice(wounded, k), CAREFUL).said.includes("txt_careful_fail")) dice = k;
  }
  assert.notStrictEqual(dice, null, "dice exist on which the ordinary escort kills and the careful way fails harmlessly");
  const fell = play(withDice(wounded, dice), ESCORT).state;
  assert.strictEqual(fell.pending?.kind, "newCharacter", "the ordinary escort, ridden at hp 2 on a bad roll: the end of the life");
  assert.strictEqual(sig(fell, "guards_fallen"), 1);
  assert.strictEqual(sig(fell, "guards_maimed"), 1, "the earlier maiming stays one; the blow that kills is a fall, never a second maiming");
  const safe = play(withDice(wounded, dice), CAREFUL);
  assert.strictEqual(safe.state.pending ?? null, null, "the careful way, on the same dice: alive");
  assert.strictEqual(hp(safe.state), 2, "no hp lost");
  assert.ok(deep(safe.state), "the wound is where it was");
  assert.strictEqual(me(safe.state).money, me(wounded).money + 1, "the failure pays its one silver");
  assert.strictEqual(sig(safe.state, "guards_maimed"), 1);
  // and the guard who took it can rest the wound shut: four nights, hp 2 -> 10, and the lead job is back
  let healed = run(safe.state, [M("loc_castle_town")]);
  healed = run(healed, [LODGE]);
  assert.ok(deep(healed) && hp(healed) === 4, "a night heals half, and the deep wound stays");
  for (let n = 0; n < 3; n += 1) healed = run(healed, [LODGE]);
  assert.ok(!deep(healed) && !mild(healed) && hp(healed) === 10, "four nights close it");
  healed = waitForConvoy(healed);
  growth(healed).resources.stamina.current = 6;
  assert.ok(open(healed, LEAD), "and the lead job is back");
  return { fell };
}

// 2. the next life finds what the world kept
function testNextLife(fell) {
  const before = structuredClone(fell.signals);
  const born = run(fell, [NEW_LIFE]);
  assertBornAsFresh(born);
  for (const k of ["guards_maimed", "guards_fallen", "estate_held", "kit_steel", "kit_mail"]) assert.strictEqual(sig(born, k), before[k] ?? 0, `${k}: the world's number exactly as it was -- nothing copied, nothing added`);
  assert.strictEqual(sig(born, "guards_maimed"), 1);
  assert.strictEqual(sig(born, "estate_held"), 12, "the guild holds a share of a purse of 200 (the cap)");
  assert.strictEqual(sig(born, "kit_steel"), 1, "and the sword the guard carried");
  assert.ok(!JSON.stringify(me(born)).includes("maim"), "nothing of it on the actor");
  const arrived = waitForConvoy(run(born, WALK));
  const asked = play(arrived, ASK);
  for (const id of [WORD_MAIMED, WORD_FELL, OFFER_FELL, OFFER_ESTATE, OFFER_KIT]) assert.ok(asked.said.includes(id), `the successor is told ${id}`);
  assert.ok(!asked.said.includes(OFFER_MAIMED), "one offer of the careful way, in the fall's words");
  assert.ok(open(arrived, "opt_guild_clerk_escort_careful"), "and is offered the careful way");
  // claims the share, and buys the dead guard's sword with it at half price
  const m0 = me(arrived).money;
  const claimed = run(arrived, CLERK("opt_guild_clerk_estate"));
  assert.strictEqual(me(claimed).money, m0 + 12);
  assert.strictEqual(sig(claimed, "estate_held"), 0);
  assert.ok(open(claimed, "opt_guild_clerk_fallen_steel"), "the sword is for sale");
  const armed = run(claimed, CLERK("opt_guild_clerk_fallen_steel"));
  assert.strictEqual(me(armed).inventory.item_steel_sword, 1);
  assert.strictEqual(sig(armed, "kit_steel"), 0, "and the guild no longer keeps it");
  assert.deepStrictEqual(validateState(armed), []);
  // the memory persists through the whole second life; save/load round-trips it
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_di", armed, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, armed);
  assert.strictEqual(sig(loaded, "guards_maimed"), 1);
}

// 3-4. long careers, instrumented
const SEEDS = ["inj-9", "inj-10", "inj-21", "inj-29", "inj-41", "inj-46", "inj-48", "inj-73"];
const POLICIES = {
  careful: { hpRest: 7, danger: false, herbalist: true, valve: "never" },
  normal: { hpRest: 4, danger: true, herbalist: true, valve: "never" },
  stubborn: { hpRest: 4, danger: true, herbalist: false, valve: "never" },
  risky: { hpRest: 2, danger: true, herbalist: false, valve: "never" },
  // the safety valve: ride the careful way when hurt (hp at or under the line, or a deep wound), or always when it is offered
  riskyValve: { hpRest: 2, danger: true, herbalist: false, valve: "hurt" },
  stubbornValve: { hpRest: 4, danger: true, herbalist: false, valve: "hurt" }
};
function trip(s) { // the way to the herbalist and back: ask, buy a salve, treat
  if (me(s).money < 10) return s;
  let t = run(s, BACK);
  t = run(t, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);
  const trusted = herbalistOpen(t, "opt_herbalist_buy_salve_trusted");
  const plain = herbalistOpen(t, "opt_herbalist_buy_salve");
  if (trusted || plain) t = run(t, [P("act_talk_herbalist"), C(trusted ? "opt_herbalist_buy_salve_trusted" : "opt_herbalist_buy_salve"), P("act_treat_road_wound")]);
  return run(t, HOME);
}
// the invariants that must hold at every state the career passes through
function check(s, memory) {
  if (!s.pending) {
    assert.ok(hp(s) >= 0 && hp(s) <= me(s).hp.max, `hp in bounds (${hp(s)})`);
    assert.ok(stamina(s) >= 0 && stamina(s) <= 6, `stamina in bounds (${stamina(s)})`);
    if (deep(s)) assert.ok(mild(s), "a deep wound always carries the mild one");
  }
  for (const k of ["guards_maimed", "guards_fallen"]) {
    assert.ok(sig(s, k) >= memory[k], `${k}: the world does not forget`);
    memory[k] = sig(s, k);
  }
}
function career(policy, seed, dice, days) {
  const pol = POLICIES[policy];
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TOWN);
  s.rng.cursor += dice * 11;
  const t0 = s.time.minute;
  const memory = { guards_maimed: 0, guards_fallen: 0 };
  const m = { convoys: 0, deepNew: 0, maimedKnown: 0, deaths: 0, known: 0, lives: 1, carefulRides: 0, wounded: 0 };
  for (let guard = 0; (s.time.minute - t0) / 1440 < days && guard < 4000; guard += 1) {
    if (s.pending?.kind === "newCharacter") {
      const before = structuredClone(s.signals);
      s = run(s, [NEW_LIFE, ...WALK]);
      m.lives += 1;
      assert.ok(!mild(s) && !deep(s), "every life starts whole");
      assert.strictEqual(standing(s), 0, "and unknown to the guild");
      for (const k of ["guards_maimed", "guards_fallen", "estate_held", "kit_steel", "kit_mail"]) assert.strictEqual(sig(s, k), before[k] ?? 0, `${k}: succession copies and adds nothing`);
      assert.deepStrictEqual(validateState(s), []);
      continue;
    }
    if (s.pending) break;
    check(s, memory);
    if (open(s, "opt_guild_clerk_estate")) s = run(s, CLERK("opt_guild_clerk_estate"));
    for (const id of ["opt_guild_clerk_fallen_steel", "opt_guild_clerk_fallen_mail"]) if (open(s, id)) s = run(s, CLERK(id));
    if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 30) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword")]);
    if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 54) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_mail_shirt")]);
    if (deep(s) && pol.herbalist) s = trip(s);
    s = waitQuiet(s);
    const need = open(s, LEAD) ? 3 : 2;
    const hurt = deep(s) || hp(s) <= pol.hpRest;
    const goCareful = open(s, "opt_guild_clerk_escort_careful") && (pol.valve === "always" || (pol.valve === "hurt" && hurt));
    if ((stamina(s) < need || (hp(s) <= pol.hpRest && !goCareful)) && me(s).money >= 2) s = waitQuiet(run(s, [LODGE]));
    const pick = goCareful && open(s, "opt_guild_clerk_escort_careful") ? "opt_guild_clerk_escort_careful"
      : pol.danger && open(s, "opt_guild_clerk_escort_danger") ? "opt_guild_clerk_escort_danger"
        : open(s, LEAD) ? LEAD : "opt_guild_clerk_escort";
    if (!open(s, pick)) { s = run(s, [{ type: "wait", minutes: 480 }]); continue; }
    const wasDeep = deep(s), wasKnown = standing(s) >= 10, fallen0 = sig(s, "guards_fallen");
    s = run(s, CLERK(pick));
    m.convoys += 1;
    if (pick === "opt_guild_clerk_escort_careful") m.carefulRides += 1;
    // outside count of the world's number: a known guard who went from whole to deeply wounded AND lived (the blow that kills is a fall)
    if (!wasDeep && deep(s) && !s.pending) { m.deepNew += 1; if (wasKnown) m.maimedKnown += 1; }
    if (s.pending?.kind === "newCharacter") { m.deaths += 1; if (sig(s, "guards_fallen") > fallen0) m.known += 1; }
    if (!s.pending && me(s).locationId !== "loc_castle_town") s = run(s, [M("loc_castle_town")]);
  }
  if (!s.pending) check(s, memory);
  m.maimedWorld = sig(s, "guards_maimed");
  m.wealth = me(s).money + 24 * (me(s).inventory?.item_steel_sword ?? 0) + 48 * (me(s).inventory?.item_mail_shirt ?? 0);
  return m;
}

// 3. accounting: the world's number is the outside count, over many lives and every policy
function testAccounting() {
  // the edge a sample may not reach: a known guard at hp 3 whose blow kills is a fall, never a maiming too
  const edge = fails(ready(3));
  assert.deepStrictEqual(edge.pending, { kind: "newCharacter" });
  assert.strictEqual(sig(edge, "guards_fallen"), 1);
  assert.strictEqual(sig(edge, "guards_maimed"), 0, "the blow that kills is counted once, as a fall");
  const total = { careers: 0, lives: 0, maimed: 0, deaths: 0, carefulRides: 0, fellKnown: 0 };
  for (const policy of ["careful", "normal", "stubborn", "risky", "riskyValve"]) for (const seed of SEEDS.slice(0, 4)) for (let dice = 0; dice < 2; dice += 1) {
    const m = career(policy, seed, dice, 90);
    assert.strictEqual(m.maimedWorld, m.maimedKnown, `${policy} ${seed}/${dice}: guards_maimed is exactly the known, living guards who went from whole to deeply wounded (${m.maimedWorld} against ${m.maimedKnown})`);
    total.careers += 1;
    total.lives += m.lives;
    total.maimed += m.maimedKnown;
    total.deaths += m.deaths;
    total.carefulRides += m.carefulRides;
    total.fellKnown += m.known;
  }
  // not vacuous: many lives, real maimings, real deaths, and the careful way actually ridden
  assert.ok(total.lives > total.careers, `the sample spans lives (${total.lives} lives in ${total.careers} careers)`);
  assert.ok(total.maimed >= 8, `the sample has real maimings (${total.maimed})`);
  assert.ok(total.deaths >= 8 && total.fellKnown >= 1, `and real deaths (${total.deaths}), some of known guards (${total.fellKnown})`);
  assert.ok(total.carefulRides >= 1, "and the careful way is ridden");
}

// 4. the careful way is a choice, not a free pass
function testValve() {
  const sample = {};
  for (const policy of ["risky", "riskyValve", "stubborn", "stubbornValve"]) {
    sample[policy] = { careers: 0, deaths: 0, known: 0, deepNew: 0, wealth: 0, carefulRides: 0, convoys: 0 };
    for (const seed of SEEDS) for (let dice = 0; dice < 3; dice += 1) {
      const m = career(policy, seed, dice, 120);
      const t = sample[policy];
      t.careers += 1;
      for (const k of ["deaths", "known", "deepNew", "wealth", "carefulRides", "convoys"]) t[k] += m[k];
    }
  }
  const per = (p, k) => sample[p][k] / sample[p].careers;
  assert.ok(sample.riskyValve.carefulRides > 0 && sample.stubbornValve.carefulRides > 0, "a guard who is hurt does ride it");
  // when hurt, riding the careful way keeps a known guard alive
  assert.ok(sample.risky.known >= 4, `without it, risky play loses known guards (${sample.risky.known})`);
  assert.ok(sample.riskyValve.known * 2 <= sample.risky.known, `with it, almost none (${sample.riskyValve.known} against ${sample.risky.known})`);
  assert.ok(sample.stubbornValve.known <= sample.stubborn.known, "and so for a guard who rests earlier");
  assert.ok(per("riskyValve", "deaths") < per("risky", "deaths"), "deaths fall with it");
  // the dial still turns: the more reckless, the more deaths, with the valve in hand
  assert.ok(per("stubbornValve", "deaths") < per("riskyValve", "deaths"), "the dial still turns with the valve");
  // and it is not free: it takes a whole day where the ordinary escort takes half, and a success on it pays less. (Measured, #304: a
  // guard who rides it *always* makes fewer rides -- a few days behind in kit and 7% (reacting) to 29% (reckless) less silver at day
  // 120 -- so the cost is the time, and the data is what is pinned here.)
  const strong = ready(10);
  growth(strong).stats.str = 14;
  strong.signals = { ...strong.signals, guards_maimed: 1 }; // a world that remembers, so the careful way is open
  let compared = 0;
  for (let k = 0; k < 40; k += 1) {
    const a = play(withDice(strong, k), ESCORT);
    const b = play(withDice(strong, k), CAREFUL);
    assert.strictEqual(a.state.time.minute - strong.time.minute, 720, "the ordinary escort: half a day");
    assert.strictEqual(b.state.time.minute - strong.time.minute, 1440, "the careful way: a whole one");
    if (a.said.includes("txt_escort_success") && b.said.includes("txt_careful_success")) {
      assert.ok(me(b.state).money < me(a.state).money, "the same success pays less on the careful way");
      compared += 1;
    }
  }
  assert.ok(compared >= 5, `enough dice compared (${compared})`);
}

const { fell } = testOneLife();
testNextLife(fell);
testAccounting();
testValve();
console.log("V2-Core-124 data-world-death-injury.test.js: all checks passed");
