// V2-Core-127 (#311, Road News step 2 of #306 -- does the news change what a guard does, and what comes of it): a small deterministic
// sample of the Step 2 measurement (40 worlds x 8 dice, 120 and 180 days; D-110), through the ordinary step() API and the real
// pack. The informed guard learns the road the way a player does: it asks the clerk (a real step) and reads its OWN knowledge
// (state.knowledge, what view() shows) -- never the world's number or fact. Policies (all rest at hp <= 6, buy and wear steel and
// mail, take the lead or ordinary escort otherwise, treat a deep wound at the herbalist's; none rides the careful way):
//   blind-always  takes the danger job whenever it is offered;          blind-never   never takes it;
//   informed      takes it unless its latest word says dangerous;       informed-whole  on a dangerous word, only when unhurt.
// Pinned on 8 worlds x 2 dice x 120 days (the bandit leader lives in these worlds -- the road is worse):
//   H1  the choice follows the word: the informed guard never takes the danger job on a dangerous road and takes it on the
//       others; the blind one takes it on every road;
//   H2-A same risk, more silver: the informed guard dies no more often than the blind guard who never takes the danger job,
//       and ends with at least 15% more silver (measured, 320 careers: +23-26%, the same deaths);
//   H2-B same silver, fewer deaths: the informed guard ends with at least the blind-always guard's silver and dies less often
//       (measured: -0.21 deaths a career, -31-36%; at 180 days -0.31, -40-45%);
//   H3  what it acts on is what it was told: when it asks before the road, its latest word is the road as it is.
// V2-Core-130 (#318, MG-046.1 step 1) -- a specification change, not a relaxation: a guard who comes back from a failed
// danger job loses 30 of the guild's trust, and under 10 the clerk gives the yard's talk instead of the ledger. So the
// informed guard's word is split by whether the guild knows it when it asks, and each half is pinned strictly:
//   H1  on a quiet road it takes the job; on an uneasy road it takes it exactly when the guild knows it (the yard's
//       "unsettled" makes an unknown guard stay off); on a dangerous road never;
//   H3  a known guard's word is the ledger's, exactly the road; an unknown guard hears the yard's word that day, exactly
//       the road's coarse condition (quiet / unsettled). The sample must contain both.
// Measurement scripts and the full numbers: D-110 step 2 (docs/v2/architecture/CORE_CONTRACTS.md).
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { worldData as d } from "../../web/v2/data/world.js";

const SEEDS = ["inj-9", "inj-10", "inj-21", "inj-29", "inj-41", "inj-46", "inj-48", "inj-73"];
const DICE = 2;
const DAYS = 120;
const REST = 6;
const P = (a) => ({ type: "perform", actionId: a }), M = (to) => ({ type: "move", to }), C = (o) => ({ type: "choose", optionId: o }), E = (o) => [P("act_talk_elder"), C(o)];
const TO_TOWN = [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"), P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const BACK = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_market")];
const HOME = [M("loc_village"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const HOUR = { type: "wait", minutes: 60 };
const run = (s, list) => list.reduce((x, a) => step(x, a, d).state, s);
const me = (s) => s.actors[s.player.actorId], g = (s) => me(s).growth.growth_wanderer, hp = (s) => me(s).hp.current;
const can = (s, req) => req === undefined || evaluateCondition(req, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const open = (s, id) => can(s, d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires);
const herbOpen = (s, id) => can(s, d.choices.choice_herbalist_dialogue.options.find((o) => o.id === id).requires);
const clerk = (id) => [P("act_talk_guild_clerk"), C(id)];
const buy = (id) => [P("act_talk_town_merchant"), C(id)];
const day = (s) => Math.floor(s.time.minute / 1440);
const standing = (s) => s.relations?.[`npc_guild_clerk:${s.player.actorId}`]?.score ?? 0;
const LEVEL = { quiet: 0, uneasy: 1, dangerous: 2, unsettled: 1.5 };
// what the character believes of the road: its latest word (ties: the surer one) -- from its own knowledge only
function belief(s) {
  const words = Object.values(s.knowledge?.[s.player.actorId] ?? {}).filter((k) => k.factId === "fact_road_north");
  if (!words.length) return null;
  words.sort((a, b) => b.lastSeenDay - a.lastSeenDay || b.confidence - a.confidence);
  return LEVEL[words[0].claim];
}
function treat(s) {
  if (me(s).money < 10) return s;
  let t = run(s, [...BACK, P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);
  const salve = herbOpen(t, "opt_herbalist_buy_salve_trusted") ? "opt_herbalist_buy_salve_trusted" : herbOpen(t, "opt_herbalist_buy_salve") ? "opt_herbalist_buy_salve" : null;
  if (salve) t = run(t, [P("act_talk_herbalist"), C(salve), P("act_treat_road_wound")]);
  return run(t, HOME);
}
const waitConvoy = (s) => { for (let h = 0; h < 96 && !open(s, "opt_guild_clerk_escort"); h += 1) s = run(s, [HOUR]); return s; };

function career(policy, seed, dice) {
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TOWN);
  s.rng.cursor += dice * 11;
  const t0 = s.time.minute;
  const m = { deaths: 0, offered: [0, 0, 0], taken: [0, 0, 0], told: 0, toldTrue: 0, yard: 0, yardTrue: 0, unknownOffered: [0, 0, 0] };
  for (let guard = 0; (s.time.minute - t0) / 1440 < DAYS && guard < 6000; guard += 1) {
    if (s.pending?.kind === "newCharacter") { s = run(s, [NEW_LIFE, ...WALK]); continue; }
    if (open(s, "opt_guild_clerk_estate")) s = run(s, clerk("opt_guild_clerk_estate"));
    for (const id of ["opt_guild_clerk_fallen_steel", "opt_guild_clerk_fallen_mail"]) if (open(s, id)) s = run(s, clerk(id));
    if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 30) s = run(s, buy("opt_town_merchant_buy_steel_sword"));
    if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 54) s = run(s, buy("opt_town_merchant_buy_mail_shirt"));
    for (const id of ["act_equip_steel_sword", "act_equip_mail_shirt"]) if (can(s, d.actions[id].requires)) s = run(s, [P(id)]);
    if (g(s).traits?.road_wound_deep) s = treat(s);
    s = waitConvoy(s);
    const need = open(s, "opt_guild_clerk_escort_lead") ? 3 : 2;
    if ((g(s).resources.stamina.current < need || hp(s) <= REST) && me(s).money >= 2) s = waitConvoy(run(s, [P("act_lodge_castle_town")]));
    if (!open(s, "opt_guild_clerk_escort")) { s = run(s, [{ type: "wait", minutes: 480 }]); continue; }
    let danger = false;
    if (open(s, "opt_guild_clerk_escort_danger")) {
      const road = s.signals.road_trouble ?? 0; // for the record only: no policy reads it
      m.offered[road] += 1;
      if (policy === "blind-always") danger = true;
      else if (policy !== "blind-never") {
        const known = standing(s) >= 10; // as the clerk sees the guard when it asks (asking changes nothing)
        s = run(s, clerk("opt_guild_clerk_ask"));
        const word = belief(s);
        if (known) {
          m.told += 1;
          if (word === road) m.toldTrue += 1;
        } else {
          m.yard += 1;
          m.unknownOffered[road] += 1;
          const yardWord = Object.values(s.knowledge[s.player.actorId]).find((k) => k.source === "src_guild_hall_talk" && k.factId === "fact_road_north" && k.lastSeenDay === day(s));
          if (yardWord?.claim === (road === 0 ? "quiet" : "unsettled")) m.yardTrue += 1;
        }
        const whole = hp(s) >= me(s).hp.max && !g(s).traits?.road_wound;
        danger = !(word !== null && word >= 1.5) || (policy === "informed-whole" && whole);
      }
      if (danger) m.taken[road] += 1;
    }
    const job = danger ? "opt_guild_clerk_escort_danger" : open(s, "opt_guild_clerk_escort_lead") ? "opt_guild_clerk_escort_lead" : "opt_guild_clerk_escort";
    s = run(s, clerk(job));
    if (s.pending?.kind === "newCharacter") m.deaths += 1;
    else if (me(s).locationId !== "loc_castle_town") s = run(s, [M("loc_castle_town")]);
  }
  m.silver = me(s).money + 24 * (me(s).inventory?.item_steel_sword ?? 0) + 48 * (me(s).inventory?.item_mail_shirt ?? 0);
  return m;
}
function sample(policy) {
  const t = { careers: 0, deaths: 0, silver: 0, offered: [0, 0, 0], taken: [0, 0, 0], told: 0, toldTrue: 0, yard: 0, yardTrue: 0, unknownOffered: [0, 0, 0] };
  for (const seed of SEEDS) for (let k = 0; k < DICE; k += 1) {
    const m = career(policy, seed, k);
    t.careers += 1;
    t.deaths += m.deaths;
    t.silver += m.silver;
    t.told += m.told;
    t.toldTrue += m.toldTrue;
    t.yard += m.yard;
    t.yardTrue += m.yardTrue;
    for (let i = 0; i < 3; i += 1) { t.offered[i] += m.offered[i]; t.taken[i] += m.taken[i]; t.unknownOffered[i] += m.unknownOffered[i]; }
  }
  t.silver /= t.careers;
  return t;
}

const always = sample("blind-always");
const never = sample("blind-never");
const informed = sample("informed");
const whole = sample("informed-whole");
const show = (t) => `${t.deaths} deaths, ${t.silver.toFixed(1)} silver`;

// H1: the choice follows the word
assert.ok(always.offered.every((n) => n > 0), "every road condition comes up in the sample");
assert.deepStrictEqual(always.taken, always.offered, "the blind guard takes the danger job on every road");
assert.deepStrictEqual(never.taken, [0, 0, 0]);
assert.strictEqual(informed.taken[2], 0, "the informed guard never takes it on a dangerous road");
assert.strictEqual(informed.taken[0], informed.offered[0], "and takes it on a quiet one");
assert.strictEqual(informed.taken[1], informed.offered[1] - informed.unknownOffered[1], "and on an uneasy one exactly when the guild knows it");
assert.ok(whole.taken[2] > 0 && whole.taken[2] < whole.offered[2], "the informed-whole guard takes a dangerous road only when unhurt");

// H2-A: the same risk as never taking it, more silver
assert.ok(informed.deaths <= never.deaths, `informed ${show(informed)} against never ${show(never)}`);
assert.ok(informed.silver >= 1.15 * never.silver, `at least 15% more silver (${show(informed)} against ${show(never)})`);

// H2-B: at least the blind risk-taker's silver, fewer deaths
assert.ok(informed.silver >= always.silver, `informed ${show(informed)} against always ${show(always)}`);
assert.ok(informed.deaths < always.deaths, `fewer deaths (${informed.deaths} against ${always.deaths})`);
assert.ok(whole.silver > always.silver && whole.deaths < always.deaths, `informed-whole dominates (${show(whole)} against ${show(always)})`);

// H3: asked before the road, the word it acts on is the road as it is
assert.ok(informed.told > 0);
assert.strictEqual(informed.toldTrue, informed.told, "the ledger's word, asked on the day by a known guard, is the road's condition");
assert.ok(informed.yard > 0, "the sample has guards the guild no longer knows (trust lost on a failed danger job)");
assert.strictEqual(informed.yardTrue, informed.yard, "an unknown guard hears the yard's word that day: the road's coarse condition");

console.log(`V2-Core-127 data-world-road-news-measure.test.js: all checks passed (always ${show(always)}; never ${show(never)}; informed ${show(informed)}; informed-whole ${show(whole)})`);
