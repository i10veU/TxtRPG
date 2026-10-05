// V2-Core-122 (#297 Death & Injury, step 2 -- measure and pin the risk dial): through the ordinary step() API and the real pack.
// No new rule. The owner's success condition for the goal (#297) is a *structure*, not a feature: "mild wounds are common but
// short, deep wounds are rare and make a real choice, and a risky act has consequences between living and dying" -- and, as an
// ordering, careful < normal < risky in deep wounds, deaths, known-guard deaths (the Succession Legacy), while careful play's
// early deaths are not raised. It was measured on 40 world seeds x 15 dice (#300: 600 careers per policy, 120 days, against
// the pre-change pack); this test keeps a small deterministic sample of the same careers so a later change that flattens the
// dial or makes careful play deadlier fails here instead of drifting.
//
// The risk is a dial: the hp at which a guard chooses to rest. Four honest policies play 120 days through the real engine
// (no staging but the dice -- the rng cursor):
//   careful   rests at hp <= 7, never takes the danger road, and goes to the herbalist for a deep wound;
//   normal    rests at hp <= 4, takes every job, and goes to the herbalist for a deep wound (it reacts to what it is told);
//   stubborn  rests at hp <= 4 and ignores wounds;
//   risky     rests at hp <= 2 and ignores wounds.
// What is pinned (bands wide enough to be a decision, narrow enough to catch a drift; the sample is fixed, so no flake):
//   1. mild wounds are common (every career gets many) and short (a careful guard starts a convoy wounded in a few percent);
//   2. deep wounds are rare for careful play and grow with the dial; a reactive guard's deep wound is short, an ignored one long;
//   3. deaths and known-guard deaths do not fall as the dial goes down; careful play's death rate stays at the pre-change level
//      (about 0.4 a career, all of it before the guild knows the guard); reacting to a wound beats ignoring it;
//   4. the lead and danger jobs are lost to ignoring a deep wound (the choice has a price), and a known-guard death is where
//      Succession Legacy comes from;
//   5. deterministic: the same sample twice is the same numbers.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { evaluateCondition } from "../../web/v2/core/rules.js";
import { worldData as d } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const E = (optionId) => [P("act_talk_elder"), C(optionId)];
const TO_TOWN = [
  P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"),
  M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"),
  P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"),
  M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")
];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const BACK = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_market")];
const HOME = [M("loc_village"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const NEW_LIFE = { type: "startCharacter", templateId: "start_wanderer" };
const HOUR = { type: "wait", minutes: 60 };
// world seeds on which the scripted road to the castle town works (found by trying; fixed here)
const SEEDS = ["inj-9", "inj-10", "inj-21", "inj-29", "inj-41", "inj-46", "inj-48", "inj-73"];
const DICE = 3;
const DAYS = 120;
const POLICIES = {
  careful: { hpRest: 7, danger: false, herbalist: true },
  normal: { hpRest: 4, danger: true, herbalist: true },
  stubborn: { hpRest: 4, danger: true, herbalist: false },
  risky: { hpRest: 2, danger: true, herbalist: false }
};

const run = (s, list) => list.reduce((x, a) => step(x, a, d).state, s);
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const stamina = (s) => growth(s).resources.stamina.current;
const clerkOpen = (s, id) => evaluateCondition(d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const herbalistOpen = (s, id) => evaluateCondition(d.choices.choice_herbalist_dialogue.options.find((o) => o.id === id).requires,
  { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const mild = (s) => growth(s).traits?.road_wound === true;
const deep = (s) => growth(s).traits?.road_wound_deep === true;
const standing = (s) => s.relations?.["npc_guild_clerk:" + s.player.actorId]?.score ?? 0;
const talk = (id) => [P("act_talk_guild_clerk"), C(id)];
const waitForConvoy = (s) => { for (let h = 0; h < 96 && !clerkOpen(s, "opt_guild_clerk_escort"); h += 1) s = run(s, [HOUR]); return s; };

function trip(s) { // the way to the herbalist and back: ask, buy a salve, treat
  if (me(s).money < 10) return s;
  let t = run(s, BACK);
  t = run(t, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);
  const trusted = herbalistOpen(t, "opt_herbalist_buy_salve_trusted");
  const plain = herbalistOpen(t, "opt_herbalist_buy_salve");
  if (trusted || plain) t = run(t, [P("act_talk_herbalist"), C(trusted ? "opt_herbalist_buy_salve_trusted" : "opt_herbalist_buy_salve"), P("act_treat_road_wound")]);
  return run(t, HOME);
}

function career(policy, seed, dice) {
  const pol = POLICIES[policy];
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TOWN);
  s.rng.cursor += dice * 11;
  const t0 = s.time.minute;
  const m = { convoys: 0, mildNew: 0, mildConvoys: 0, deepNew: 0, deepConvoys: 0, jobsClosed: 0, deaths: 0, known: 0 };
  for (let guard = 0; (s.time.minute - t0) / 1440 < DAYS && guard < 4000; guard += 1) {
    if (s.pending?.kind === "newCharacter") { s = run(s, [NEW_LIFE, ...WALK]); continue; }
    if (s.pending) break;
    if (clerkOpen(s, "opt_guild_clerk_estate")) s = run(s, talk("opt_guild_clerk_estate"));
    for (const id of ["opt_guild_clerk_fallen_steel", "opt_guild_clerk_fallen_mail"]) if (clerkOpen(s, id)) s = run(s, talk(id));
    if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 30) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_steel_sword")]);
    if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 54) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_buy_mail_shirt")]);
    if (deep(s) && pol.herbalist) s = trip(s);
    s = waitForConvoy(s);
    const need = clerkOpen(s, "opt_guild_clerk_escort_lead") ? 3 : 2;
    if ((stamina(s) < need || me(s).hp.current <= pol.hpRest) && me(s).money >= 2) s = waitForConvoy(run(s, [P("act_lodge_castle_town")]));
    const unlocked = growth(s).unlocks?.unl_road_lead === true;
    const pick = pol.danger && clerkOpen(s, "opt_guild_clerk_escort_danger") ? "opt_guild_clerk_escort_danger"
      : clerkOpen(s, "opt_guild_clerk_escort_lead") ? "opt_guild_clerk_escort_lead" : "opt_guild_clerk_escort";
    if (unlocked && deep(s)) m.jobsClosed += 1;
    if (!clerkOpen(s, pick)) { s = run(s, [{ type: "wait", minutes: 480 }]); continue; }
    const wasMild = mild(s), wasDeep = deep(s), fallen0 = s.signals?.guards_fallen ?? 0;
    if (wasMild) m.mildConvoys += 1;
    if (wasDeep) m.deepConvoys += 1;
    s = run(s, talk(pick));
    m.convoys += 1;
    if (!wasMild && mild(s)) m.mildNew += 1;
    if (!wasDeep && deep(s)) m.deepNew += 1;
    if (s.pending?.kind === "newCharacter") { m.deaths += 1; if ((s.signals?.guards_fallen ?? 0) > fallen0) m.known += 1; }
    if (!s.pending && me(s).locationId !== "loc_castle_town") s = run(s, [M("loc_castle_town")]);
  }
  return m;
}

function sample() {
  const out = {};
  for (const policy of Object.keys(POLICIES)) {
    const total = { careers: 0, convoys: 0, mildNew: 0, mildConvoys: 0, deepNew: 0, deepConvoys: 0, jobsClosed: 0, deaths: 0, known: 0, anyKnown: 0 };
    for (const seed of SEEDS) for (let dice = 0; dice < DICE; dice += 1) {
      const m = career(policy, seed, dice);
      total.careers += 1;
      for (const k of ["convoys", "mildNew", "mildConvoys", "deepNew", "deepConvoys", "jobsClosed", "deaths", "known"]) total[k] += m[k];
      if (m.known > 0) total.anyKnown += 1;
    }
    out[policy] = total;
  }
  return out;
}

const a = sample();
const per = (policy, key) => a[policy][key] / a[policy].careers;
const { careful, normal, stubborn, risky } = a;

// 1. mild wounds: common, and short
for (const policy of Object.keys(POLICIES)) assert.ok(per(policy, "mildNew") >= 5, `${policy}: mild wounds are common (${per(policy, "mildNew").toFixed(1)} a career)`);
assert.ok(careful.mildConvoys / careful.convoys <= 0.05, `a careful guard starts a convoy wounded in a few percent (${(100 * careful.mildConvoys / careful.convoys).toFixed(1)}%)`);
assert.ok(careful.mildConvoys / careful.convoys < stubborn.mildConvoys / stubborn.convoys, "and an ignoring guard far more often");

// 2. deep wounds: rare for careful play, they grow with the dial; a reacted-to wound is short, an ignored one long
assert.ok(per("careful", "deepNew") < 0.7, `deep wounds are rare for careful play (${per("careful", "deepNew").toFixed(2)} a career)`);
assert.ok(per("careful", "deepNew") < per("normal", "deepNew") && per("normal", "deepNew") < per("risky", "deepNew"), "deep wounds grow with the dial");
assert.ok(per("risky", "deepNew") > 1.5 && per("stubborn", "deepNew") > per("careful", "deepNew"));
assert.ok(normal.deepConvoys / Math.max(1, normal.deepNew) <= 1.5, "a deep wound that is reacted to closes within a convoy or two");
assert.ok(stubborn.deepConvoys / stubborn.deepNew >= 4, "an ignored deep wound lasts many convoys");

// 3. deaths do not fall as the dial goes down; careful play is not deadlier than before (the pre-change pack: ~0.4 a career, none of it
//    a known guard's)
assert.ok(per("careful", "deaths") <= 0.55, `careful play's deaths stay at the old level (${per("careful", "deaths").toFixed(2)} a career)`);
assert.strictEqual(careful.known, 0, "a careful guard the guild knew does not fall");
assert.ok(per("careful", "deaths") <= per("normal", "deaths") + 0.05 && per("normal", "deaths") < per("stubborn", "deaths") && per("stubborn", "deaths") < per("risky", "deaths"), "deaths grow with the dial");
assert.ok(careful.known <= normal.known && normal.known < stubborn.known && stubborn.known < risky.known, "known-guard deaths grow with the dial");
assert.ok(a.stubborn.anyKnown < a.risky.anyKnown && a.careful.anyKnown <= a.stubborn.anyKnown, "and so does the share of careers with a Legacy");
assert.ok(stubborn.known / stubborn.careers >= 0.15, "ignoring a deep wound gets a known guard killed in a real share of careers");
assert.ok(normal.known / normal.careers < stubborn.known / stubborn.careers, "reacting to a wound beats ignoring it at the same hp");
assert.ok(per("careful", "deaths") - per("careful", "known") <= 0.55 && per("careful", "deaths") - per("careful", "known") >= 0.2, "the early deaths are what they were: a recruit's, before the guild knows them");

// 4. the lead and danger jobs are the price of ignoring a deep wound
assert.strictEqual(careful.jobsClosed, 0, "a careful guard never works a convoy with the lead closed to them");
assert.ok(stubborn.jobsClosed >= 40, "an ignoring guard loses many lead/danger convoys");
assert.ok(per("stubborn", "jobsClosed") > 10 * Math.max(0.01, per("normal", "jobsClosed")), "far more than one who reacts");

// 5. deterministic (one career replayed; the sample itself is fixed)
assert.deepStrictEqual(career("risky", SEEDS[0], 0), career("risky", SEEDS[0], 0), "the same career twice, the same numbers");
console.log("V2-Core-122 data-world-risk-dial.test.js: all checks passed");
