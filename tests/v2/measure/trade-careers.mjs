// MG-045/046 step 2 (#328): flour-trade careers on the real pack -- the mill, the ford, the town -- one JSON row per career on
// stdout. Not a test and not run by CI (see README.md in this folder). The informed policies learn the town's want only the way
// a player does: by asking the ferryman or the merchant (real steps) and reading the character's own knowledge (`aboutDay`,
// D-112, where it is known); they never read the world's signals. The measurement reads the world only to score decisions.
//
// Usage: node trade-careers.mjs <seedFrom> <seedTo> <days> <policy,...> [starts]
//   policies: blind (always carries two sacks, pays the fare, sells what the town takes), ferryInfo (asks the ferryman and the
//   merchant, and holds back while the newest word says the town has enough), noteHonest (ferryInfo, and carries for the
//   merchant on his note when he offers one)
//   PACK_ROOT=<dir> measures the pack under <dir>/web/v2 (the pack before the change: blind only -- it has no word to ask for);
//   SEEDS_FILE=<file in this folder> another set of worlds
//   [starts]: K trading starts per world, the k-th START_STEP minutes (default 60) after the trade opens -- trade has no dice
//   and the act-one path takes every world to the same minute, so the sample is the start against the caravans' cadence
//   (appendix C.5); rows carry k
// Each world: the act-one path to the opened trade (data-world-flour-north's, without the elder's letter -- a letter makes
// every crossing free), then a trader's purse of twenty silver (staged, the same for every policy).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.PACK_ROOT ?? fileURLToPath(new URL("../../..", import.meta.url));
const at = (p) => pathToFileURL(`${ROOT}/web/v2/${p}`).href;
const { createInitialState, step } = await import(at("core/engine.js"));
const { evaluateCondition } = await import(at("core/rules.js"));
const { worldData: d } = await import(at("data/world.js"));
// #335: CANDIDATE=<module,...> patches an in-memory copy of the pack (candidates/ in this folder), as road-news-careers does
for (const c of (process.env.CANDIDATE ?? "").split(",").filter(Boolean)) (await import(new URL(`./candidates/${c}.mjs`, import.meta.url).href)).patch(d);
const SEEDS = JSON.parse(readFileSync(new URL(`./${process.env.SEEDS_FILE ?? "seeds.json"}`, import.meta.url), "utf8")).slice(+process.argv[2], +process.argv[3]);
const DAYS = +process.argv[4], POLS = process.argv[5].split(","), STARTS = +(process.argv[6] ?? 1), START_STEP = +(process.env.START_STEP ?? 60);

const P = (a) => ({ type: "perform", actionId: a }), M = (to) => ({ type: "move", to }), C = (o) => ({ type: "choose", optionId: o }), E = (o) => [P("act_talk_elder"), C(o)];
const MILLER = (o) => [P("act_talk_miller"), C(o)];
const TO_TRADE = [P("act_observe_village"), P("act_observe_village"), ...E("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), ...E("opt_report_findings"), P("act_confront_leader"), ...E("opt_bandits_disperse"), ...E("opt_ask_region"), M("loc_crossroads"), M("loc_mill_hamlet"), ...MILLER("opt_miller_flour"), M("loc_crossroads"), M("loc_village"), ...E("opt_deliver_flour"), M("loc_crossroads"), M("loc_mill_hamlet")];
const NORTH = [M("loc_crossroads"), M("loc_river_ford")], SOUTH = [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads"), M("loc_mill_hamlet")];
const DAY = { type: "wait", minutes: 1440 };
const POLICIES = {
  blind: {}, ferryInfo: { info: true }, noteHonest: { info: true, note: true },
  // #335 (appendix G, research policies -- player models, not game rules): how a trader reads the same words
  latestOnly: { info: true, ignoreAge: true }, // holds back on the newest "enough" however old
  askAfter: { info: true, askAfter: true }, // asks the merchant after selling, so its newest word is the want it left
  consensus: { info: true, consensus: true }, // holds back only when the ferryman's and the merchant's newest words agree
  sourceTrack: { info: true, track: true }, // trusts the ferryman's "enough" only while his words have matched the merchant's
  abstain: { info: true, abstain: true } // at the ford, holds back also when it has no word under a cadence old
};

const run = (s, l) => l.reduce((x, a) => step(x, a, d).state, s);
const me = (s) => s.actors[s.player.actorId];
const day = (s) => Math.floor(s.time.minute / 1440);
const has = (s, item) => me(s).inventory?.[item] ?? 0;
const can = (s, choice, id) => {
  const o = d.choices[choice]?.options.find((x) => x.id === id);
  return Boolean(o) && evaluateCondition(o.requires, { state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
};
const rel = (s, npc) => s.relations?.[`${npc}:${s.player.actorId}`]?.score ?? 0;
// what the character believes of the town's want: its newest word by the day it is about (or heard, when that is unknown);
// `only` narrows to one teller (diagnostics and the research policies)
function belief(s, only) {
  let words = Object.values(s.knowledge?.[s.player.actorId] ?? {}).filter((k) => k.factId === "fact_town_flour");
  if (only) words = words.filter((k) => (k.sources ?? [k.source]).includes(only));
  if (!words.length) return null;
  const when = (k) => (Number.isInteger(k.aboutDay) ? k.aboutDay : k.lastSeenDay);
  words.sort((a, b) => when(b) - when(a) || b.confidence - a.confidence);
  const src = (words[0].sources ?? [words[0].source]).includes("npc_town_merchant") ? "merchant" : "ferryman";
  return { claim: words[0].claim, age: day(s) - when(words[0]), src, aboutDay: when(words[0]) };
}
// a policy holds back while its newest word, under a caravan's cadence old (3 days), says the town has enough
const holdsBack = (s) => { const b = belief(s); return b !== null && b.claim === "enough" && b.age < 3; };
// #335: the research policies' reading of the same words (the ferryInfo/noteHonest rule above is untouched)
function holdsBackBy(s, Pc, track, atFord) {
  if (Pc.ignoreAge) { const b = belief(s); return b !== null && b.claim === "enough"; }
  if (Pc.consensus) {
    const f = belief(s, "npc_ferryman"), mm = belief(s, "npc_town_merchant");
    return f !== null && mm !== null && f.claim === "enough" && mm.claim === "enough" && f.age < 3 && mm.age < 3;
  }
  if (Pc.track) {
    const b = belief(s);
    if (!(b !== null && b.claim === "enough" && b.age < 3)) return false;
    return b.src !== "ferryman" || track.n < 3 || track.right / track.n >= 0.5;
  }
  // abstain: at the ford (where a word can be had) it also holds back on no word or one a cadence old; at the mill it reads as ferryInfo
  if (Pc.abstain && atFord) { const b = belief(s); return b === null || b.age >= 3 || b.claim === "enough"; }
  return holdsBack(s);
}

function career(pol, seed, k) {
  const Pc = POLICIES[pol];
  if (!Pc) throw new Error(`unknown policy ${pol}`);
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TRADE);
  for (let left = k * START_STEP; left > 0; left -= 1440) s = run(s, [{ type: "wait", minutes: Math.min(1440, left) }]);
  s.actors[s.player.actorId].money = 20;
  const t0 = s.time.minute;
  const m = { trips: 0, bought: 0, sold: 0, fares: 0, noteCrossings: 0, notesTaken: 0, waits: 0, asks: 0, beliefs: 0, beliefRight: 0, arrivedUnsold: 0, heldBack: 0, wantAtArrival: 0 };
  // #335 B3 diagnostics (appendix G; B3 itself is beliefs/beliefRight above, unchanged): at each crossing, the belief's age, whether
  // it was still under a cadence old, who said it, whether it was heard before the trader's own last sale, and what each teller's
  // newest word said against the want
  const dg = { ageSum: 0, valid: 0, stale: 0, beforeOwnSale: 0, src: { merchant: [0, 0], ferryman: [0, 0] }, ferryNewest: [0, 0], merchantNewest: [0, 0], byAge: [[0, 0], [0, 0], [0, 0], [0, 0]] };
  const track = { n: 0, right: 0 };
  let lastSaleDay = -1, ferryWordAtFord = null;
  const sell = () => {
    for (let i = 0; i < 4 && has(s, "item_flour_sack") > 0; i++) {
      const id = ["opt_town_merchant_sell_flour_fair", "opt_town_merchant_sell_flour", "opt_town_merchant_sell_flour_note"].find((o) => can(s, "choice_town_merchant_dialogue", o));
      if (!id) break;
      s = run(s, [P("act_talk_town_merchant"), C(id)]); m.sold++;
    }
  };
  for (let guard = 0; (s.time.minute - t0) / 1440 < DAYS && guard < 400; guard++) {
    // at the mill: hold back on a fresh "enough", else buy what two sacks and the fare allow
    if (Pc.info && holdsBackBy(s, Pc, track) && !has(s, "item_merchant_note")) { s = run(s, [DAY]); m.waits++; m.heldBack++; continue; }
    const fare = has(s, "item_merchant_note") ? 0 : 3;
    for (let i = 0; i < 2 && has(s, "item_flour_sack") < 2 && me(s).money >= 2 + fare && can(s, "choice_miller_dialogue", "opt_miller_buy_flour"); i++) { s = run(s, MILLER("opt_miller_buy_flour")); m.bought++; }
    if (has(s, "item_flour_sack") === 0) { s = run(s, [DAY]); m.waits++; continue; }
    s = run(s, NORTH);
    // at the ford: the ferryman's word (a real step), and the same rule again
    if (Pc.info) {
      s = run(s, [P("act_talk_ferryman"), C("opt_ferryman_news")]); m.asks++;
      if (holdsBackBy(s, Pc, track, true) && !has(s, "item_merchant_note")) { s = run(s, [M("loc_crossroads"), M("loc_mill_hamlet"), DAY]); m.waits++; m.heldBack++; continue; }
    }
    const b = belief(s);
    const truth = (s.signals?.town_flour_wanted ?? 0) >= 1 ? "wanted" : "enough";
    if (b) { m.beliefs++; if (b.claim === truth) m.beliefRight++; }
    if (b) {
      dg.ageSum += b.age; if (b.age < 3) dg.valid++; else dg.stale++;
      if (b.src === "merchant" && b.aboutDay <= lastSaleDay) dg.beforeOwnSale++;
      dg.src[b.src][0]++; if (b.claim === truth) dg.src[b.src][1]++;
      const a = dg.byAge[Math.min(b.age, 3)]; a[0]++; if (b.claim === truth) a[1]++; // ages 0, 1, 2, 3+
    }
    for (const [who, slot] of [["npc_ferryman", "ferryNewest"], ["npc_town_merchant", "merchantNewest"]]) {
      const w = belief(s, who);
      if (w) { dg[slot][0]++; if (w.claim === truth) dg[slot][1]++; }
    }
    ferryWordAtFord = belief(s, "npc_ferryman");
    if (Pc.note && can(s, "choice_ferryman_dialogue", "opt_ferryman_cross_note")) { s = run(s, [P("act_talk_ferryman"), C("opt_ferryman_cross_note")]); m.noteCrossings++; }
    else if (me(s).money >= 3 && can(s, "choice_ferryman_dialogue", "opt_ferryman_cross")) { s = run(s, [P("act_talk_ferryman"), C("opt_ferryman_cross")]); m.fares++; }
    else { s = run(s, [M("loc_crossroads"), M("loc_mill_hamlet"), DAY]); m.waits++; continue; }
    s = run(s, [M("loc_castle_town")]); m.trips++;
    m.wantAtArrival += s.signals?.town_flour_wanted ?? 0;
    if (Pc.info && !Pc.askAfter) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_ask")]);
    // sourceTrack: the ferryman's word heard at the ford against the merchant's own word now
    if (Pc.track && ferryWordAtFord) { const mw = belief(s, "npc_town_merchant"); if (mw && mw.age === 0) { track.n++; if (mw.claim === ferryWordAtFord.claim) track.right++; } }
    const soldBefore = m.sold;
    sell();
    if (m.sold > soldBefore) lastSaleDay = day(s);
    if (Pc.askAfter) s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_ask")]);
    if (has(s, "item_flour_sack") > 0) m.arrivedUnsold++;
    if (Pc.note && can(s, "choice_town_merchant_dialogue", "opt_town_merchant_order")) { s = run(s, [P("act_talk_town_merchant"), C("opt_town_merchant_order")]); m.notesTaken++; }
    s = run(s, SOUTH);
  }
  m.days = (s.time.minute - t0) / 1440;
  m.money = me(s).money;
  m.flour = has(s, "item_flour_sack");
  m.wealth = m.money + 2 * m.flour; // a sack in hand at what it cost
  m.relMerchant = rel(s, "npc_town_merchant");
  m.relFerry = rel(s, "npc_ferryman");
  m.caravanTook = s.facts?.fact_caravan_flour ? 1 : 0;
  m.diag = dg;
  return m;
}

const out = [];
for (const pol of POLS) for (const seed of SEEDS) for (let k = 0; k < STARTS; k++) out.push({ pol, seed, k, ...career(pol, seed, k) });
console.log(JSON.stringify(out));
