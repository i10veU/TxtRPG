// Story careers (roadmap M7 and M8): whole games on the real pack along the main thread, one JSON array of rows on stdout.
// Not a test and not run by CI (tests/v2/run.js runs only `*.js` directly under tests/v2/). See README.md in this folder.
//
// A career is act one (the confrontation and the dispersal, as the escort careers), then the caravan guard's work in the
// castle town for money, and the main thread the way a player would play it -- by walking to people and places and choosing
// what they offer; a policy never reads a world signal to decide what to do except what the character could see (the band
// at the crossroads, its own purse and wounds). The measurement reads the world to score: the day each stage is reached,
// the deaths, the frontier's fate, the realm's name, and the late career's breadth (G4 of docs/v2/first-region-baseline.md).
//
// Usage: node story-careers.mjs <seedFrom> <seedTo> <dice> <days> <policy,...> [dead]
//   policies: idle (the guard's work only), prepare (the village's silver, the ferryman's watch, the call for hands),
//   lord (the village's silver and the lord's offer taken), fight (the ferryman's watch, then the last fight),
//   hero (every hand the region offers, the last fight, the realm's name, the remnants)
//   `dead`: the chief dead from the start of the guard's work (staged; his right hand leads the band)
//   PACK_ROOT=<dir> measures the pack under <dir>/web/v2 instead of this checkout
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.PACK_ROOT ?? fileURLToPath(new URL("../../..", import.meta.url));
const at = (p) => pathToFileURL(`${ROOT}/web/v2/${p}`).href;
const { createInitialState, step } = await import(at("core/engine.js"));
const { evaluateCondition } = await import(at("core/rules.js"));
const { worldData: d } = await import(at("data/world.js"));

const DIRECT = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const SEEDS = DIRECT ? JSON.parse(readFileSync(new URL(`./${process.env.SEEDS_FILE ?? "seeds.json"}`, import.meta.url), "utf8")).slice(+process.argv[2], +process.argv[3]) : [];
const DICE = +process.argv[4], DAYS = +process.argv[5], POLS = DIRECT ? process.argv[6].split(",") : [], LEADER_DEAD = process.argv[7] === "dead";
const POLICY = {
  idle: {},
  prepare: { silver: 2, watch: true, notice: true },
  lord: { silver: 1, lord: "accept" },
  fight: { watch: true, fight: true },
  hero: { silver: 2, watch: true, notice: true, lord: "refuse", burn: true, crown: true, fight: true, renown: true, remnants: true }
};

const P = (a) => ({ type: "perform", actionId: a }), M = (to) => ({ type: "move", to }), C = (o) => ({ type: "choose", optionId: o });
const FERRY = C("opt_ferryman_cross");
const TO_TOWN = [P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), C("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern"), M("loc_village"), M("loc_ruins"), P("act_investigate_ruins"), M("loc_village"), P("act_rest_village"), P("act_talk_elder"), C("opt_report_findings"), P("act_confront_leader"), P("act_talk_elder"), C("opt_bandits_disperse"), P("act_talk_elder"), C("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), FERRY, M("loc_castle_town")];
const WALK = [P("act_observe_village"), P("act_talk_elder"), C("opt_ask_region"), M("loc_crossroads"), M("loc_river_ford"), P("act_talk_ferryman"), FERRY, M("loc_castle_town")];
const NEW = { type: "startCharacter", templateId: "start_wanderer" };

const ctx = (s) => ({ state: s, data: d, actorId: s.player.actorId, contextKind: "player" });
const can = (s, id) => evaluateCondition(d.actions[id].requires, ctx(s));
const offer = (s, choice, id) => { const o = d.choices[choice].options.find((x) => x.id === id); return o.requires === undefined || evaluateCondition(o.requires, ctx(s)); };
const me = (s) => s.actors[s.player.actorId], g = (s) => me(s).growth.growth_wanderer, hp = (s) => me(s).hp.current, stam = (s) => g(s).resources.stamina.current;
const day = (s, t0) => (s.time.minute - t0) / 1440;
const knows = (s, r) => Boolean(s.knowledge?.[s.player.actorId]?.[r]);
const dead = (s) => s.pending?.kind === "newCharacter";
let LATE = null;
let STUCK = new Set(); // the days a career spent without an available passage back north
// one step at a time; a rejected step is skipped (a policy's plan meeting the world as it is)
function run(s, list) {
  for (const a of list) {
    if (dead(s)) return s;
    if (LATE && LATE.t0 !== null && day(s, LATE.t0) >= 60 && (a.type === "perform" || a.type === "choose")) LATE.ids.add(a.actionId ?? a.optionId);
    const r = step(s, a, d);
    if (r.events.some((e) => e.type === "action.rejected")) return s;
    s = r.state;
  }
  return s;
}
// a look at what a dialogue would offer, not counted as something the character did
const probe = (s, a) => step(s, a, d).state;
const talk = (s, npc, choice, id) => (offer(probe(s, P(npc)), choice, id) ? run(s, [P(npc), C(id)]) : s);
const elder = (s, id) => talk(s, "act_talk_elder", "choice_elder_dialogue", id);
const ferryman = (s, id) => talk(s, "act_talk_ferryman", "choice_ferryman_dialogue", id);
const clerk = (s, id) => talk(s, "act_talk_guild_clerk", "choice_guild_clerk_dialogue", id);
const merchant = (s, id) => talk(s, "act_talk_town_merchant", "choice_town_merchant_dialogue", id);
// walking: a move to where one already is is no step at all
const go = (s, ...locs) => { for (const l of locs) if (!dead(s) && me(s).locationId !== l) s = run(s, [M(l)]); return s; };
// back to the town from anywhere in the region, using passage the character can actually claim
function toTown(s) {
  const here = me(s).locationId;
  if (here === "loc_castle_town" || dead(s)) return s;
  if (["loc_far_bank", "loc_band_camp", "loc_royal_city"].includes(here)) return go(s, "loc_far_bank", "loc_castle_town");
  if (["loc_market", "loc_ruins", "loc_forest_spring"].includes(here)) s = go(s, "loc_village");
  s = go(s, "loc_crossroads", "loc_river_ford");
  const hasLetter = (state) => (me(state).inventory?.item_passage_letter ?? 0) > 0;
  // A trusted character who knows the ford can ask the elder; a successor without that trust cannot.
  if (!hasLetter(s) && me(s).money < 3 && offer(s, "choice_elder_dialogue", "opt_elder_letter")) {
    s = go(s, "loc_crossroads", "loc_village");
    s = elder(s, "opt_elder_letter");
    s = go(s, "loc_crossroads", "loc_river_ford");
  }
  const crossing = hasLetter(s) ? "opt_ferryman_cross_letter" : me(s).money >= 3 ? "opt_ferryman_cross" : null;
  return crossing ? go(ferryman(s, crossing), "loc_castle_town") : s;
}
const restVillage = (s) => { for (let i = 0; i < 6 && !dead(s) && hp(s) < me(s).hp.max; i++) s = run(s, [P("act_rest_village")]); return s; };

// the guard's work: one convoy (or a lodging night when spent), as the escort careers' blind no-danger guard
function guardWork(s) {
  s = toTown(s);
  if (me(s).locationId !== "loc_castle_town") { STUCK.add(Math.floor(s.time.minute / 1440)); return run(s, [{ type: "wait", minutes: 480 }]); } // no available passage
  s = clerk(s, "opt_guild_clerk_estate");
  if ((me(s).inventory?.item_steel_sword ?? 0) < 1 && me(s).money >= 30) s = merchant(s, "opt_town_merchant_buy_steel_sword");
  if ((me(s).inventory?.item_mail_shirt ?? 0) < 1 && me(s).money >= 54) s = merchant(s, "opt_town_merchant_buy_mail_shirt");
  for (const id of ["act_equip_steel_sword", "act_equip_mail_shirt"]) if (can(s, id)) s = run(s, [P(id)]);
  for (let h = 0; h < 96 && !offer(s, "choice_guild_clerk_dialogue", "opt_guild_clerk_escort"); h++) s = run(s, [{ type: "wait", minutes: 60 }]);
  const lead = offer(s, "choice_guild_clerk_dialogue", "opt_guild_clerk_escort_lead");
  if ((stam(s) < (lead ? 3 : 2) || hp(s) <= 6) && me(s).money >= 2) return run(s, [P("act_lodge_castle_town")]);
  if (!offer(s, "choice_guild_clerk_dialogue", "opt_guild_clerk_escort")) return run(s, [{ type: "wait", minutes: 480 }]);
  s = clerk(s, lead ? "opt_guild_clerk_escort_lead" : "opt_guild_clerk_escort");
  return dead(s) || me(s).locationId === "loc_castle_town" ? s : run(s, [M("loc_castle_town")]);
}

// a journey south from the town: what the policy does for the frontier, then back to the town
function southTrip(s, pol, mem) {
  const reserve = 8; // the fares and a night's lodging kept back
  s = go(s, "loc_far_bank");
  s = run(s, [P("act_read_waystation_board")]);
  if (pol.notice && can(s, "act_post_frontier_notice") && me(s).money >= 15 + reserve) s = run(s, [P("act_post_frontier_notice")]);
  if (pol.burn && !mem.burnt && knows(s, "rum_band_camp_way") && s.flags?.band_crossed !== true) {
    s = go(s, "loc_band_camp");
    if (can(s, "act_burn_band_stores")) { s = run(s, [P("act_burn_band_stores")]); mem.burnt = true; }
    if (!dead(s)) s = go(s, "loc_far_bank");
  }
  if (pol.crown && !mem.crown && knows(s, "rum_royal_city") && (knows(s, "rum_band_led_by_scarred") || knows(s, "rum_band_led_by_remnant")) && s.flags?.band_crossed !== true && me(s).money >= reserve) {
    s = go(s, "loc_royal_city");
    if (can(s, "act_petition_crown")) s = run(s, [P("act_petition_crown")]);
    mem.crown = true;
    if (!dead(s)) s = go(s, "loc_far_bank");
  }
  if (dead(s)) return s;
  s = go(s, "loc_river_ford");
  s = ferryman(s, "opt_ferryman_band");
  if (pol.watch && me(s).money >= 5 + reserve) s = ferryman(s, "opt_ferryman_watch");
  s = go(s, "loc_crossroads", "loc_village");
  s = elder(s, "opt_elder_band_word"); // asked, or told who leads them
  s = elder(s, "opt_elder_band_word");
  for (let i = 0; i < (pol.silver ?? 0); i++) if (me(s).money >= 10 + reserve) s = elder(s, "opt_elder_give_silver");
  if (pol.lord === "accept") s = elder(s, "opt_elder_lord_accept");
  if (pol.lord === "refuse") s = elder(s, "opt_elder_lord_refuse");
  return toTown(s);
}

// the last fight: the best exchange the character can take; break off when hurt, rest in the village, come back
const ORDER = ["weak_spot", "with_village", "sword_cut", "strike"];
function lastFight(s) {
  for (let round = 0; round < 12 && !dead(s); round++) {
    if (!can(go(s, "loc_crossroads"), "act_face_band")) return s;
    s = run(go(s, "loc_crossroads"), [P("act_face_band")]);
    while (s.pendingChoice || s.pending?.kind === "choice") {
      if (hp(s) <= 4) { s = run(s, [C(`opt_final_${s.actors.npc_bandit_leader.alive ? "chief" : "right_hand"}_flee`)]); break; }
      const key = s.actors.npc_bandit_leader.alive ? "chief" : "right_hand";
      const pick = ORDER.map((o) => `opt_final_${key}_${o}`).find((id) => d.choices.choice_final_battle.options.some((x) => x.id === id) && offer(s, "choice_final_battle", id));
      const before = s;
      s = run(s, [C(pick)]);
      if (s === before) break;
    }
    if (dead(s) || s.flags?.band_broken) return s;
    s = restVillage(go(s, "loc_village"));
  }
  return s;
}

function career(name, seed, k) {
  const pol = POLICY[name];
  if (!pol) throw new Error(`unknown policy ${name}`);
  LATE = { t0: null, ids: new Set() };
  STUCK = new Set();
  let s = run(createInitialState({ worldSeed: seed, data: d }).state, TO_TOWN);
  if (LEADER_DEAD) s.actors.npc_bandit_leader.alive = false; // staged, before the band gathers (stated in the report)
  s.rng.cursor += k * 11;
  const t0 = s.time.minute;
  LATE.t0 = t0;
  const m = { deaths: 0, deathDays: [], deathsAfterGather: 0, lives: 1, dayLead: null, dayGather: null, dayCross: null, dayFate: null, fate: 0, dayDefender: null, dayRenown: null, hunts: 0 };
  const mem = { trips: 0, fought: false, burnt: false, crown: false };
  const stamp = (key, cond) => { if (m[key] === null && cond) m[key] = Math.round(day(s, t0) * 10) / 10; };
  for (let guard = 0; day(s, t0) < DAYS && guard < 8000; guard++) {
    if (dead(s)) {
      m.deaths++; m.deathDays.push(Math.round(day(s, t0) * 10) / 10); if (m.dayGather !== null) m.deathsAfterGather++;
      s = run(step(s, NEW, d).state, WALK); m.lives++; mem.fought = false; continue;
    }
    if (s.pending) { m.stalled = true; break; } // a dialogue left open: the policy's plan met a choice it could not finish
    stamp("dayLead", g(s).unlocks?.unl_road_lead);
    stamp("dayGather", (s.signals?.band_gathering ?? 0) >= 1);
    stamp("dayCross", s.flags?.band_crossed === true);
    stamp("dayFate", (s.signals?.frontier_fate ?? 0) >= 1);
    stamp("dayDefender", evaluateCondition({ op: "relation", from: "org_village", to: "self", tag: "defender" }, ctx(s)));
    stamp("dayRenown", g(s).unlocks?.unl_realm_renown);
    const gathered = m.dayGather !== null, crossed = s.flags?.band_crossed === true, decided = (s.signals?.frontier_fate ?? 0) >= 1;
    // the town's notices: once the band is talked of, now and then (the lord's offer is posted there)
    if (gathered && !decided && (pol.lord || pol.renown) && mem.notices !== Math.floor(day(s, t0) / 6)) { mem.notices = Math.floor(day(s, t0) / 6); s = run(s, [P("act_read_castle_notices")]); }
    // journeys south: once after the band gathers, once more when the lord's offer is known (if the policy answers it)
    // the first, once the purse covers the plan (or ten days after the band was first talked of, whatever it holds)
    const plan = 10 * (pol.silver ?? 0) + (pol.watch ? 5 : 0) + (pol.notice ? 15 : 0) + 8 + 6;
    const ready = me(s).money >= plan || day(s, t0) - m.dayGather >= 10;
    const wantSouth = (gathered && !crossed && mem.trips === 0 && Object.keys(pol).length > 0 && ready) || (pol.lord && knows(s, "rum_lord_offer") && (s.signals?.lord_pact ?? 0) === 0 && mem.trips < 2 && !crossed);
    if (wantSouth) { s = southTrip(s, pol, mem); mem.trips++; continue; }
    // the band across: the fighter goes to meet it (a successor too, while it is in the land)
    if (pol.fight && crossed && !decided && !s.flags?.band_broken && !mem.fought) { s = toTown(lastFight(run(s, [M("loc_far_bank"), M("loc_river_ford"), M("loc_crossroads")]))); mem.fought = true; continue; }
    // the realm's name: the defender walks to the royal city once the word has gone north
    if (pol.renown && s.flags?.fate_word_north && evaluateCondition({ op: "relation", from: "org_village", to: "self", tag: "defender" }, ctx(s)) && !g(s).unlocks?.unl_realm_renown && !mem.royal) {
      mem.royal = true; s = run(s, [M("loc_far_bank"), P("act_read_waystation_board"), M("loc_royal_city"), P("act_read_royal_records"), M("loc_far_bank"), M("loc_castle_town"), P("act_talk_guild_clerk"), C("opt_guild_clerk_ask")]); continue;
    }
    // the remnants: a week's hunt for a seasoned sword, once the fate is decided
    if (pol.remnants && decided && (g(s).skills?.swordsmanship ?? 0) >= 2 && (s.signals?.remnants_quiet ?? 0) === 0 && hp(s) >= me(s).hp.max && knows(s, "rum_band_camp_way")) {
      s = run(s, [M("loc_far_bank"), M("loc_band_camp")]);
      if (can(s, "act_hunt_band_remnants")) { const before = me(s).money; s = run(s, [P("act_hunt_band_remnants")]); if (!dead(s) && me(s).money > before) m.hunts++; }
      if (!dead(s)) s = run(s, [M("loc_far_bank"), M("loc_castle_town")]);
      continue;
    }
    s = guardWork(s);
  }
  m.fate = s.signals?.frontier_fate ?? 0;
  m.bandAtCross = m.dayCross === null ? null : s.signals?.band_strength ?? null;
  m.defense = s.signals?.frontier_defense ?? 0;
  m.lateKinds = LATE.ids.size;
  m.lateIds = [...LATE.ids].sort();
  m.wallet = me(s).money;
  m.stuckSouthDays = STUCK.size;
  m.stalled = m.stalled ?? false;
  LATE = null;
  return m;
}
const out = [];
for (const pol of POLS) for (const seed of SEEDS) for (let k = 0; k < DICE; k++) out.push({ pol, seed, k, dead: LEADER_DEAD, ...career(pol, seed, k) });
if (DIRECT) console.log(JSON.stringify(out));
export { toTown, run, TO_TOWN };
