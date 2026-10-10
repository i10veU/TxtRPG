// Road News measurement (D-110, steps 2 and 4): escort careers on the real pack, one JSON row per career on stdout. Not a test
// and not run by CI (tests/v2/run.js runs only `*.js` directly under tests/v2/). See README.md in this folder.
//
// The informed policies learn the road only the way a player does: by asking the clerk (a real step) or by having ridden, and
// then reading the character's own knowledge (state.knowledge -- what view() shows); they never read road_trouble or
// fact_road_north. The measurement itself reads the road (`truth`) only to score decisions.
//
// Usage: node road-news-careers.mjs <seedFrom> <seedTo> <dice> <days> <policy,...> [dead]
//   policies: <family>_r<rest hp> -- families below, rest hp 2 / 4 / 6 / 8; `dead`: the leader dead from the start (staged)
//   PACK_ROOT=<dir> measures the pack under <dir>/web/v2 instead of this checkout (e.g. a `git archive` of an older commit)
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.PACK_ROOT ?? fileURLToPath(new URL("../../..", import.meta.url));
const at = (p) => pathToFileURL(`${ROOT}/web/v2/${p}`).href;
const { createInitialState, step } = await import(at("core/engine.js"));
const { evaluateCondition } = await import(at("core/rules.js"));
const { worldData: d } = await import(at("data/world.js"));

// MG-046.1 step 0 (#318): TRUST_RULE="<T>,<X>" measures a candidate trust rule on an in-memory copy of the pack, not in the
// game: the danger job also needs the guild's standing >= T, and a failed danger job costs X standing. Unset: the pack as it is
const TRUST_RULE = process.env.TRUST_RULE ? process.env.TRUST_RULE.split(",").map(Number) : null;
const DANGER_OPT = d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === "opt_guild_clerk_escort_danger");
const DANGER_AS_IS = structuredClone(DANGER_OPT.requires); // the pack's own condition, to count what the trust gate alone closes
if (TRUST_RULE) {
  const [T, X] = TRUST_RULE;
  // the condition object is shared with the clerk's offer line, so both see the gate
  if (T > 10) DANGER_OPT.requires.of.push({ op: "relation", from: "npc_guild_clerk", to: "self", min: T });
  if (X > 0) DANGER_OPT.outcomes.fail.push({ op: "relation", from: "npc_guild_clerk", add: -X });
}
const SEEDS = JSON.parse(readFileSync(new URL("./seeds.json", import.meta.url), "utf8")).slice(+process.argv[2], +process.argv[3]);
const DICE = +process.argv[4], DAYS = +process.argv[5], POLS = process.argv[6].split(","), LEADER_DEAD = process.argv[7] === "dead";
const P = (a) => ({ type: "perform", actionId: a }), M = (to) => ({ type: "move", to }), C = (o) => ({ type: "choose", optionId: o }), E = (o) => [P("act_talk_elder"), C(o)];
const TO_TOWN = [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"), P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const WALK = [P("act_observe_village"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const BACK = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_village"), M("loc_market")];
const HOME = [M("loc_village"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), C("opt_ferryman_cross"), M("loc_castle_town")];
const NEW = { type: "startCharacter", templateId: "start_wanderer" };
const truth = (s) => s.signals?.road_trouble ?? 0; // measurement only, never read by a policy
// the road's condition after each of its turns, by turn count -- kept for the lagged-ledger counterfactual only
let HIST = null;
// MG-039.1 (#323): the kinds of actions and choices a career performs after day 60 (G4 of docs/v2/first-region-baseline.md)
let LATE = null;
const run = (s, l) => l.reduce((x, a) => {
  if (LATE && (x.time.minute - LATE.t0) / 1440 >= 60 && (a.type === "perform" || a.type === "choose")) LATE.ids.add(a.actionId ?? a.optionId);
  const y = step(x, a, d).state;
  if (HIST) HIST[y.fired?.evt_road_north?.count ?? 0] = truth(y);
  return y;
}, s);
const me = (s) => s.actors[s.player.actorId], g = (s) => me(s).growth.growth_wanderer, stam = (s) => g(s).resources.stamina.current, hp = (s) => me(s).hp.current;
const ok = (s, id) => evaluateCondition(d.choices.choice_guild_clerk_dialogue.options.find((o) => o.id === id).requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const okH = (s, id) => evaluateCondition(d.choices.choice_herbalist_dialogue.options.find((x) => x.id === id).requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const light = (s) => g(s).traits?.road_wound === true, deep = (s) => g(s).traits?.road_wound_deep === true;
const standing = (s) => s.relations?.["npc_guild_clerk:" + s.player.actorId]?.score ?? 0;
const talk = (id) => [P("act_talk_guild_clerk"), C(id)], buy = (id) => [P("act_talk_town_merchant"), C(id)];
const day = (s) => Math.floor(s.time.minute / 1440);
const CLAIM = { quiet: 0, uneasy: 1, dangerous: 2, unsettled: 1.5 };
// what the character believes of the road now: the latest word it holds (ties: the surer word); null if it holds none
function belief(s, coarse) {
  const words = Object.values(s.knowledge?.[s.player.actorId] ?? {}).filter((k) => k.factId === "fact_road_north");
  const use = coarse ? words.map((k) => ({ ...k, claim: k.claim === "quiet" ? "quiet" : "unsettled" })) : words;
  if (!use.length) return null;
  use.sort((a, b) => b.lastSeenDay - a.lastSeenDay || b.confidence - a.confidence);
  return { level: CLAIM[use[0].claim], age: day(s) - use[0].lastSeenDay, source: use[0].source };
}
// the lagged-ledger counterfactual (step 4, not in the game): the clerk's word is the road as it was one turn before; what a
// guard saw on the road is exact (as the game's own sighting). Kept by the harness, since the game writes the exact word
function lagBelief(s, mind) {
  const all = [...mind.told, ...mind.seen].sort((a, b) => b.day - a.day || b.conf - a.conf);
  return all.length ? { level: all[0].level, age: day(s) - all[0].day } : null;
}
// policies: r = rest at hp <= r; dz = which danger-job rule; ask = how often the clerk is asked (days; 0 never)
const BASE = {
  blindD: { dz: "always", ask: 0 }, blindN: { dz: "never", ask: 0 }, infoAvoid: { dz: "avoid", ask: 1 }, infoWhole: { dz: "whole", ask: 1 },
  staleAvoid: { dz: "avoid", ask: 9 }, eyesAvoid: { dz: "avoid", ask: 0 }, coarseAvoid: { dz: "avoid", ask: 1, coarse: true },
  // step 4: the ledger one turn late (counterfactual)
  lagAvoid: { dz: "avoid", ask: 1, lag: 1 }, lagWhole: { dz: "whole", ask: 1, lag: 1 }
};
const POL = {};
for (const [k, v] of Object.entries(BASE)) for (const r of [2, 4, 6, 8]) POL[`${k}_r${r}`] = { ...v, r };
function trip(s) {
  if (me(s).money < 10) return s;
  let t = run(s, BACK);
  t = run(t, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);
  const tr = okH(t, "opt_herbalist_buy_salve_trusted"), pl = okH(t, "opt_herbalist_buy_salve");
  if (tr || pl) t = run(t, [P("act_talk_herbalist"), C(tr ? "opt_herbalist_buy_salve_trusted" : "opt_herbalist_buy_salve"), P("act_treat_road_wound")]);
  return run(t, HOME);
}
const waitConvoy = (s) => { for (let h = 0; h < 96 && !ok(s, "opt_guild_clerk_escort"); h++) s = run(s, [{ type: "wait", minutes: 60 }]); return s; };
function career(pol, seed, k) {
  const Pc = POL[pol];
  if (!Pc) throw new Error(`unknown policy ${pol}`);
  HIST = Pc.lag ? {} : null;
  const mind = { told: [], seen: [] };
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TOWN);
  if (LEADER_DEAD) s.actors.npc_bandit_leader.alive = false; // a staged world: the leader dead (stated in the report)
  s.rng.cursor += k * 11;
  const t0 = s.time.minute;
  LATE = { t0, ids: new Set() };
  const m = { convoys: 0, deaths: 0, known: 0, deepNew: 0, lives: 1, gearDay: null, dz: [0, 0, 0], offered: [0, 0, 0], decisions: 0, beliefKnown: 0, exact: 0, wrongSafe: 0, wrongDanger: 0, ageSum: 0, asks: 0, asksUnknown: 0, dangerUnknown: 0, eligible: 0, gateBlocked: 0, trustLost: 0, lost0: s.signals?.caravans_unguarded ?? 0 };
  let lastAsk = -99;
  for (let guard = 0; (s.time.minute - t0) / 1440 < DAYS && guard < 6000; guard++) {
    if (s.pending?.kind === "newCharacter") { s = run(s, [NEW, ...WALK]); m.lives++; lastAsk = -99; mind.told = []; mind.seen = []; continue; }
    if (s.pending) break;
    if (ok(s, "opt_guild_clerk_estate")) s = run(s, talk("opt_guild_clerk_estate"));
    for (const id of ["opt_guild_clerk_fallen_steel", "opt_guild_clerk_fallen_mail"]) if (ok(s, id)) s = run(s, talk(id));
    if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 30) s = run(s, buy("opt_town_merchant_buy_steel_sword"));
    if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 54) s = run(s, buy("opt_town_merchant_buy_mail_shirt"));
    for (const id of ["act_equip_steel_sword", "act_equip_mail_shirt"]) { const a = d.actions[id]; if (a && evaluateCondition(a.requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" })) s = run(s, [P(id)]); }
    if ((me(s).inventory?.item_steel_sword ?? 0) > 0 && (me(s).inventory?.item_mail_shirt ?? 0) > 0 && m.gearDay === null) m.gearDay = (s.time.minute - t0) / 1440;
    if (deep(s)) s = trip(s);
    s = waitConvoy(s);
    const need = ok(s, "opt_guild_clerk_escort_lead") ? 3 : 2;
    if ((stam(s) < need || hp(s) <= Pc.r) && me(s).money >= 2) s = waitConvoy(run(s, [P("act_lodge_castle_town")]));
    if (!ok(s, "opt_guild_clerk_escort")) { s = run(s, [{ type: "wait", minutes: 480 }]); continue; }
    // the news: asked of the clerk (a real step), at most every `ask` days
    if (Pc.ask > 0 && day(s) - lastAsk >= Pc.ask) {
      if (standing(s) < 10) m.asksUnknown++;
      s = run(s, talk("opt_guild_clerk_ask")); lastAsk = day(s); m.asks++;
      if (Pc.lag && standing(s) >= 10) {
        const turns = s.fired?.evt_road_north?.count ?? 0;
        mind.told.push({ day: day(s), conf: 80, level: HIST[turns - Pc.lag] ?? HIST[turns] ?? truth(s) });
      }
    }
    const dangerOpen = ok(s, "opt_guild_clerk_escort_danger");
    // the trust gate: the pack's own condition holds, the candidate rule's gate closes it
    if (evaluateCondition(DANGER_AS_IS, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" })) { m.eligible++; if (!dangerOpen) m.gateBlocked++; }
    let takeDanger = false;
    if (dangerOpen) {
      const b = Pc.dz === "always" || Pc.dz === "never" ? null : Pc.lag ? lagBelief(s, mind) : belief(s, Pc.coarse);
      const actual = truth(s);
      m.offered[actual]++;
      if (standing(s) < 10) m.dangerUnknown++;
      if (Pc.dz === "always") takeDanger = true;
      else if (Pc.dz === "never") takeDanger = false;
      else {
        m.decisions++;
        if (b) { m.beliefKnown++; m.ageSum += b.age; if (b.level === actual) m.exact++; if (b.level < actual) m.wrongSafe++; if (b.level > actual) m.wrongDanger++; }
        const whole = hp(s) >= me(s).hp.max && !light(s);
        const bad = b !== null && b.level >= 1.5; // believed dangerous (or, from the yard, unsettled)
        takeDanger = Pc.dz === "avoid" ? !bad : (!bad || whole);
      }
      if (takeDanger) m.dz[actual]++;
    }
    const pick = takeDanger ? "opt_guild_clerk_escort_danger" : ok(s, "opt_guild_clerk_escort_lead") ? "opt_guild_clerk_escort_lead" : "opt_guild_clerk_escort";
    if (!ok(s, pick)) { s = run(s, [{ type: "wait", minutes: 480 }]); continue; }
    const wasDeep = deep(s), fallen0 = s.signals?.guards_fallen ?? 0;
    const standing0 = standing(s);
    s = run(s, talk(pick)); m.convoys++;
    if (!s.pending && standing(s) < standing0) m.trustLost += standing0 - standing(s);
    if (!s.pending) { // what the ride showed: the word the game itself wrote, read from the guard's knowledge
      const saw = Object.values(s.knowledge?.[s.player.actorId] ?? {}).find((w) => w.factId === "fact_road_north" && w.source === "obs_road_north" && w.lastSeenDay === day(s));
      if (saw) mind.seen.push({ day: day(s), conf: 90, level: CLAIM[saw.claim] });
    }
    if (!wasDeep && deep(s) && !s.pending) m.deepNew++;
    if (s.pending?.kind === "newCharacter") { m.deaths++; if ((s.signals?.guards_fallen ?? 0) > fallen0) m.known++; }
    if (!s.pending && me(s).locationId !== "loc_castle_town") s = run(s, [M("loc_castle_town")]);
  }
  m.lateKinds = LATE.ids.size;
  m.lateIds = [...LATE.ids].sort();
  LATE = null;
  m.lost = (s.signals?.caravans_unguarded ?? 0) - m.lost0;
  m.wallet = me(s).money;
  m.wealth = me(s).money + 24 * (me(s).inventory?.item_steel_sword ?? 0) + 48 * (me(s).inventory?.item_mail_shirt ?? 0);
  return m;
}
const out = [];
for (const pol of POLS) for (const seed of SEEDS) for (let k = 0; k < DICE; k++) out.push({ pol, seed, k, rule: process.env.TRUST_RULE ?? "", ...career(pol, seed, k) });
console.log(JSON.stringify(out));
