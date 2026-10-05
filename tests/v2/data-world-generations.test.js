// V2-Core-119 (#290 succession legacy 2, step 2 -- generations over time): through the ordinary step() API and the real pack.
// No new rule: V2-Core-118's share is held up against a long run of lives. The question the owner put (#290): does the
// legacy let silver, skill or standing pile up from one life to the next, or make dying a way to get ahead? Pinned:
//   1. a chain of falls and claims is conserving: a fall brings in at most min(floor(purse / 2), 12) and never more than
//      half the dead purse; a claim moves exactly what it pays out of what is held; across four generations the world
//      never holds more than the shares of the falls less what was claimed;
//   2. nothing else accumulates: the fourth successor, before it acts, is the same as the first character of a new game
//      (the 3 silver of the Canon aside): no standing, no practice, no skill, no belongings, no knowledge;
//   3. dying on purpose does not pay (measured, #290: probe_gen): over the same ninety days, a guard who lives is
//      richer -- silver and gear -- than one who, once the guild knows them, dies on the first bad roll (a death that
//      costs nothing but the life) and starts again, however many shares they claim, and the cycler never owns both
//      pieces of kit; what they claim never exceeds 12 per known fall;
//   4. the share on or off is the only difference the legacy makes to that farmer, and it is small and bounded.
// The values (half, 12) are Provisional game values (R-29); this test is the evidence they are not a lever.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const HOUR = { type: "wait", minutes: 60 };
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const talk = (id) => [P("act_talk_guild_clerk"), C(id)];
const buy = (id) => [P("act_talk_town_merchant"), C(id)];
const CAP = 12;

const run = (d, s, list) => list.reduce((x, a) => {
  const r = step(x, a, d);
  assert.ok(!r.events.some((e) => e.type === "action.rejected"), `rejected: ${JSON.stringify(a)}`);
  return r.state;
}, s);
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const sig = (s, k) => s.signals?.[k] ?? 0;
const stamina = (s) => growth(s).resources.stamina.current;
const open = (d, s, id) => evaluateCondition(d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const waitForConvoy = (d, s) => { for (let h = 0; h < 96 && !open(d, s, "opt_guild_clerk_escort"); h += 1) s = run(d, s, [HOUR]); return s; };

function townOf(d, k = 0) {
  const s = run(d, createInitialState({ worldSeed: "history-41", data: d }).state, TO_TOWN);
  s.rng.cursor += k * 7;
  return s;
}
// the fall, staged: the last point of hp, no strength, and the first bad roll
function falls(d, s) {
  const c = waitForConvoy(d, structuredClone(s));
  me(c).hp.current = 1;
  growth(c).stats.str = 0;
  growth(c).skills = { ...growth(c).skills, swordsmanship: 0 };
  growth(c).resources.stamina.current = 6;
  for (let k = 0; k < 60; k += 1) {
    const t = structuredClone(c);
    t.rng.cursor += k;
    const r = run(d, t, talk("opt_guild_clerk_escort"));
    if (r.pending?.kind === "newCharacter") return r;
  }
  return null;
}
const known = (s, money) => {
  const c = structuredClone(s);
  me(c).money = money;
  growth(c).stats.str = 14;
  c.relations = { ...c.relations, [`npc_guild_clerk:${c.player.actorId}`]: { score: 10 } };
  return c;
};

// a successor, before it acts, is the same as the first character of a new game, apart from the Canon's 3 silver
function assertBornAsFresh(born) {
  const fresh = createInitialState({ worldSeed: "history-41", data: worldData }).state;
  const a = structuredClone(me(born));
  const b = structuredClone(me(fresh));
  assert.strictEqual(a.money, b.money + 3, "the template's purse and the Canon's 3 silver, nothing else");
  for (const x of [a, b]) { delete x.money; delete x.id; }
  assert.deepStrictEqual(a, b, "no practice, no skill, no belongings, no traits, no standing carried over");
  assert.strictEqual(born.relations[`npc_guild_clerk:${born.player.actorId}`], undefined, "no standing");
  assert.deepStrictEqual(born.knowledge?.[born.player.actorId] ?? [], [], "no knowledge");
}

// 1-2. four generations of falls and claims, conserving; nothing else piles up
function testChain() {
  let s = townOf(worldData);
  let falls_ = 0;
  let claimedTotal = 0;
  const wallets = [60, 200, 9, 31];
  for (let generation = 1; generation <= 4; generation += 1) {
    const heldBefore = sig(s, "estate_held");
    const purse = wallets[generation - 1];
    const fell = falls(worldData, known(s, purse));
    assert.ok(fell, "a bad roll");
    const dead = me(fell).money;
    const came = sig(fell, "estate_held") - heldBefore;
    assert.strictEqual(came, Math.min(Math.floor(dead / 2), CAP), `generation ${generation}: the share of the dead purse ${dead}`);
    assert.ok(came <= dead / 2, "never more than half of what the dead guard carried");
    assert.ok(came <= CAP, "never more than the cap");
    falls_ += 1;
    const born = run(worldData, fell, [NEW_LIFE]);
    assertBornAsFresh(born);
    assert.strictEqual(sig(born, "estate_held"), heldBefore + came, "nothing is handed over by the succession itself");
    s = run(worldData, born, WALK);
    const m0 = me(s).money;
    const h0 = sig(s, "estate_held");
    const claimed = run(worldData, s, talk("opt_guild_clerk_estate"));
    const paid = me(claimed).money - m0;
    assert.strictEqual(paid, h0 - sig(claimed, "estate_held"), "the claim moves exactly what it pays out of what is held");
    assert.ok(paid <= CAP, "a claim pays at most the cap");
    claimedTotal += paid;
    s = claimed;
    assert.ok(sig(s, "estate_held") + claimedTotal <= falls_ * CAP, "the world never holds more than the shares of the falls less the claims");
  }
  assert.ok(claimedTotal <= falls_ * CAP, "across the chain, no more was claimed than the shares of the falls");
  assert.deepStrictEqual(validateState(s), []);
}

// 3-4. dying on purpose does not pay
const strip = (events) => events.filter((e) => !(e.op === "if" && JSON.stringify(e.then).includes("estate_held")));
const noEstate = structuredClone(worldData);
noEstate.events.evt_known_guard_fell.effects = strip(noEstate.events.evt_known_guard_fell.effects);

function lifeOf(mode, d, k, days) {
  let s = townOf(d, k);
  const t0 = s.time.minute;
  let lives = 1, claimed = 0, knownFalls = 0;
  while ((s.time.minute - t0) / 1440 < days) {
    if (s.pending?.kind === "newCharacter") { s = run(d, s, [NEW_LIFE, ...WALK]); lives += 1; continue; }
    if (open(d, s, "opt_guild_clerk_estate")) { const m = me(s).money; s = run(d, s, talk("opt_guild_clerk_estate")); claimed += me(s).money - m; }
    for (const id of ["opt_guild_clerk_fallen_steel", "opt_guild_clerk_fallen_mail"]) if (open(d, s, id)) s = run(d, s, talk(id));
    if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 24 + 6) s = run(d, s, buy("opt_town_merchant_buy_steel_sword")) // a sensible guard keeps lodging money;
    if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 48 + 6) s = run(d, s, buy("opt_town_merchant_buy_mail_shirt"));
    s = waitForConvoy(d, s);
    const lead = open(d, s, "opt_guild_clerk_escort_lead");
    if ((stamina(s) < (lead ? 3 : 2) || me(s).hp.current <= me(s).hp.max - 3) && me(s).money >= 2) {
      s = run(d, s, [P("act_lodge_castle_town")]); // a night's rest; a convoy may have gone meanwhile, so wait again
      s = waitForConvoy(d, s);
    }
    // the cycler: once the guild knows them, a free death (the first bad roll), and the next life
    if (mode === "cycler" && (s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score ?? 0) >= 10) {
      const died = falls(d, s);
      if (died) { knownFalls += 1; s = died; continue; }
    }
    const pick = open(d, s, "opt_guild_clerk_escort_lead") && stamina(s) >= 3 ? "opt_guild_clerk_escort_lead" : "opt_guild_clerk_escort";
    if (!open(d, s, pick)) { s = run(d, s, [{ type: "wait", minutes: 480 }]); continue; } // too tired and too poor to rest: time passes
    s = run(d, s, talk(pick));
    if (!s.pending && me(s).locationId !== "loc_castle_town") s = run(d, s, [M("loc_castle_town")]);
  }
  const gear = (me(s).inventory?.item_steel_sword ?? 0) + (me(s).inventory?.item_mail_shirt ?? 0);
  const worth = me(s).money + 24 * (me(s).inventory?.item_steel_sword ?? 0) + 48 * (me(s).inventory?.item_mail_shirt ?? 0);
  return { lives, claimed, knownFalls, gear, worth, both: gear === 2, state: s };
}

function testDyingDoesNotPay() {
  const days = 90;
  let compared = 0;
  for (let k = 0; k < 14 && compared < 6; k += 1) {
    const honest = lifeOf("honest", worldData, k, days);
    // about two in five honest first lives end at the second convoy, before the guild knows them (#290): that is the dice, not
    // the legacy; the comparison is between a guard who lives and one who cycles
    if (honest.lives !== 1) continue;
    const cyclerOn = lifeOf("cycler", worldData, k, days);
    const cyclerOff = lifeOf("cycler", noEstate, k, days);
    assert.ok(cyclerOn.lives >= 3 && cyclerOn.knownFalls >= 2, `dice ${k}: the cycler really cycles (${cyclerOn.lives} lives, ${cyclerOn.knownFalls} known falls)`);
    assert.strictEqual(cyclerOn.both, false, `dice ${k}: the cycler does not get both pieces of kit in ${days} days`);
    assert.strictEqual(cyclerOff.both, false);
    assert.ok(cyclerOn.claimed <= CAP * cyclerOn.knownFalls, `dice ${k}: what the cycler claims never exceeds the cap per known fall (${cyclerOn.claimed} of ${CAP * cyclerOn.knownFalls})`);
    assert.strictEqual(cyclerOff.claimed, 0, "with the legacy off nothing is held to claim");
    assert.ok(honest.worth > cyclerOn.worth, `dice ${k}: the living guard is richer (${honest.worth} against ${cyclerOn.worth})`);
    assert.ok(honest.worth > cyclerOff.worth);
    compared += 1;
  }
  assert.strictEqual(compared, 6, "six dice compared");
}

testChain();
testDyingDoesNotPay();
console.log("V2-Core-119 data-world-generations.test.js: all checks passed");
