// V2-Core-22: the first real V2 world data pack (docs/v2/architecture/
// CORE_CONTRACTS.md §11, Issue #74). A small "frontier village" scenario
// built entirely from already-implemented Condition/Effect/Resolvable/
// Growth/Relation/Rumor/Fact mechanics -- no new engine semantics were
// invented to build this content (see D-65 for the one genuine contract/
// code gap this pack deliberately works around instead of relying on).
//
// Minimal playable loop (canonical path, V2-Core-29/30 -- each step happens
// where it makes sense, enforced by `location` and `rumor` Conditions):
//   village: observe (grow `investigation` proficiency)
//   -> village: talk to the elder (a real `choice`: ask about the ruins, which
//      teaches the `rum_ruins_secret` rumor, or just small talk)
//   -> market: buy a lantern (spends money, gates the ruins link)
//   -> ruins: investigate -- only once the rumor is known (a real check()
//      against INT since V2-Core-51, decided by RNG); a success confirms the rumor from a
//      second, first-hand source; the ruins hazard costs HP on arrival and
//      again while you stay
//   -> village: rest (the recovery action)
//   -> village: talk to the elder again; once the investigation is confirmed a
//      third option appears -- report what you found (optional, V2-Core-31)
//   -> enough accumulated investigation unlocks `unl_keen_eye`, which
//      together with what the investigation confirmed gates a final
//      confrontation action (a second check(), tags:["social"]); if you
//      reported to the elder, the village stands behind you and the leader is
//      shaken further, and the bandits as a group are cowed
//   -> village: talk to the elder once more; a confrontation the village stood
//      behind opens one more option -- leave the bandits' fate to the elder
//   -> market (any later step): once the bandits are cowed and the leader is no
//      longer one of them, the merchants show their relief -- once
//   -> village, any character, any time later: the elder can be asked for news of
//      the bandits once the village's history says they dispersed
//   (reporting to the elder and confronting the leader take the character's own proof
//   -- the relic only their own successful investigation yields -- not the world's flag)
//
// V2-Core-25 wires already-implemented mechanics into this same pack (no new
// engine semantics): `minutes` on the two long actions, `location`-gated
// village activities, one `data.events` hazard at the ruins whose `hp`
// Effect can kill the player, and `rules.succession` for the replacement
// character. See CORE_CONTRACTS.md D-66's follow-up note.
//
// V2-Core-29 again adds no engine semantics: `act_buy_lantern` (market) and
// `act_investigate_ruins` (ruins) are now location-gated with the same
// `location` Condition, and `act_rest_village` heals through the existing `hp`
// Effect. `version` stays "0.1.0" on purpose: the change adds one action and
// restricts where two run, with no state-shape change, so saves made before it
// stay valid (D-68 leaves bumping to the pack author).
//
// V2-Core-30 also adds no engine semantics: `act_investigate_ruins` now needs
// the elder's rumor (the existing `rumor` Condition, allowed in player context
// -- only `fact` is restricted, §8.4) and its success re-learns that rumor in
// observe mode (existing `rumor` Effect: the claim is copied from the fact the
// investigation just set, from the new source `obs_loc_ruins`). No
// `data.rules.rumor` gains are set: nothing reads confidence, so the
// confirmation shows up as `confirmations`/`sources` only. `version` stays
// "0.1.0" for the same reason as above (no state-shape change; D-68).
//
// V2-Core-31 also adds no engine semantics: a third elder option is gated by the
// confirmed-investigation flag (choice-option `requires`, the existing `flag`
// Condition) and writes the elder's relation edge (existing `relation` Effect:
// score, mode and a `confidant` tag); the confrontation's success outcome reads
// that edge with the existing `relation` Condition inside an `if` Effect. The tag,
// not the score, is what counts: talking to the elder is free and repeatable, so a
// score threshold could be farmed without ever learning anything. `act_confront_
// leader`'s own requirements and its check are unchanged. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-32 also adds no engine semantics: the same backed branch now writes the
// bandit organisation's edge towards the player (`org_bandits` -> self, a `cowed`
// tag -- organisations are ordinary relation edge ends, told apart from NPCs only
// by their ID prefix, §7.1), and a fourth elder option reads it, together with the
// leader's `member` tag that the investigation wrote, with the existing `relation`
// Condition; using it removes that membership (`untag`), so the option closes itself.
// Nothing changes for a player who never reported: the unbacked confrontation is
// exactly what it was. `data.events` could read the same edges (a trigger sees a
// same-step tag change) but nothing here needs an event. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-33 also adds no engine semantics: that result now outlives the moment it
// was made. `evt_market_reopens` (a `data.events` entry, `once`) reads the same two
// edges -- the bandits are cowed and the leader is no longer a member -- and fires in
// whichever later step the player is standing in the market. Nothing decays those
// edges (there are no relation rules), so the event sees them however much time and
// travel has passed; `state.fired` keeps it from paying twice. The `cowed` edge is
// the acting character's (`org_bandits` -> `player_<n>`): a successor does not inherit
// it, and the event is simply false for them. `version` stays "0.1.0" (no state-shape
// change; D-68).
//
// V2-Core-34 also adds no engine semantics; it draws the line between what belongs to
// a character and what belongs to the world (CORE_CONTRACTS D-70). `state.actors[id]`
// (items, money, hp, growth), `state.knowledge[id]` and every relation edge that has a
// `player_<n>` at one end belong to that character; `flags`, `cases`, `facts`, `fired`,
// `time` and the edges between world entities belong to the world, and a successor
// inherits none of the first kind (`rules.succession` above is the only bridge, and it
// grants money only). `opt_ask_bandit_news` reads nothing but the second kind -- the
// `ruins_mystery` case is resolved and the leader is no longer a member -- so it is
// offered to whoever is asking, the acting character or their successor, and to nobody
// on any other history. What a successor should inherit, and who a world-level reward
// belongs to, are design decisions this pack does not make. `version` stays "0.1.0"
// (no state-shape change; D-68).
//
// V2-Core-35 also adds no engine semantics; it fixes one mismatch V2-Core-34 recorded.
// `flags` are world-unit (§4.1: no subject), yet the report option and the confrontation
// read `ruins_secret_confirmed` as if the CHARACTER had confirmed the secret, so a successor
// who never investigated could report and confront. Both now require `item_relic`
// (`item` Condition, character-anchored): only a successful investigation writes it, into
// the investigating character's own inventory, so a successor has none until they earn one,
// and a failed investigation leaves none. The flag is still written -- it is the world's
// record that the secret was confirmed -- it just no longer stands in for a character's own
// proof. The rumor's confidence was the other candidate marker and was rejected: it needs a
// `data.rules.rumor` gain, and a save made before the change (already at confidence 60 with
// its observe source recorded) could then never reach the threshold. The relic is already in
// such a save, so nobody is stranded. `version` stays "0.1.0" (no state-shape change; D-68).
//
// V2-Core-44 also adds no engine semantics; it applies the human decision on D-71 (3): a world
// edge the story has settled is not reversed by a character's later action. `act_investigate_ruins`
// can be repeated, and its success wrote the leader's `member` tag every time -- so investigating
// again after `opt_bandits_disperse` brought the dispersed gang back (the elder's news stopped, the
// market's relief became false, the dispersal reopened), for the same character and for a successor.
// The membership is now written only while `case_ruins_mystery` is unresolved (an `if` Effect in
// the same position, so every earlier path keeps its events); the dispersal is only reachable after
// the case is resolved. A save already in the revived state is not repaired (no migration).
// `version` stays "0.1.0" (no state-shape change; D-68).
//
// V2-Core-45 also adds no engine semantics; it is the V2 slice of #66 (world history & discovery):
// an immediate change -> time -> the account changes -> a later character discovers. The dispersal
// (case resolved, the leader no longer a member) starts `evt_bandits_tale`, which records the
// objective `fact_bandits_fate` and counts `bandits_tale_age` 1..3 a day apart (`cooldown`, D-74's
// pattern -- no scheduler, no new state field). While it is fresh the elder tells the news (rumor
// `rum_bandits_fate`, "dispersed"); after about two days the same option tells the village's legend
// (`rum_bandits_legend`, "slain", lower confidence). A successful investigation at the ruins then
// observes the fact: the truth first-hand, and a believed legend corrected (D-14). Before the
// dispersal there is no fact, so the earlier path is unchanged. A successor inherits no knowledge
// (D-71 (1)) and finds both on their own. `version` stays "0.1.0" (no state-shape change; D-68):
// a save made before this change starts the clock at its next step.
//
// V2-Core-46 also adds no engine semantics; it closes the information loop of that slice. A
// character who heard the legend and then saw the truth at the ruins (their legend corrected) can
// tell the elder (`opt_correct_legend`, once): the world flag `bandits_tale_corrected` is written,
// and from then on the elder tells everyone the true account instead of the legend -- a successor
// included, without inheriting anyone's knowledge (D-71 (1)); no reward beyond a one-time +5 with
// the elder (D-71 (2)). Information -> judgment -> action -> world change -> new information for
// the next generation. `version` stays "0.1.0" (no state-shape change; D-68).
//
// V2-Core-74 (#180 Slice 4, step 3 -- the river ford and the outside world): north of the crossroads
// the river ford, for a character who knows the way (`rum_road_ford`). The world does not wait: once the
// reopened road is in use (`road_walked`, set by its first walker) a caravan comes every three days (`evt_caravan`, `caravan_visits` 1..3,
// wherever the player is) and leaves the realm's news as the world's facts -- the lord's levy, then the
// royal fair, then unrest on the border. The ferryman (a dialogue NPC, no actor) tells the latest of it,
// and the leader's fate: a scarred man he ferried across (`fact_leader_crossed`), or the tale of his fall
// already told on the far bank. Crossing costs 3 silver, or nothing with the elder's letter of passage
// (asked of an elder who trusts the character, 15+). The far bank is the threshold of the outside world:
// its waystation board tells of the royal city beyond, the realm's notices, a bounty on the scarred
// bandit chief if he lives, and -- if the village honoured someone -- the village's name. Additive only.
//
// V2-Core-73 (#180 Slice 4, step 2 -- the mill hamlet): the region's second settlement, east of the
// crossroads, reached by a character who knows the way (`rum_road_hamlet`). Its miller (a dialogue NPC,
// no actor) tells the region's news -- coloured by the leader's fate (a scarred man asking for boats at
// the ford, or the tale of his fall) -- and greets one the village honoured, once (+5). He buys purifying
// herbs (2 silver each: the herbalism of Slice 2 becomes a trade), and asks for a sack of flour to be
// carried to the elder: delivered, it opens trade between the two settlements -- a world edge between
// world entities (`org_mill_hamlet -> org_village`, `trading`), for everyone after, a successor too: the
// market sells the hamlet's bread (+2 HP, +3 stamina). +5 with the elder for the carrier. Additive only.
//
// V2-Core-72 (#180 Slice 4, step 1 -- the old crossroads): the world beyond the village begins. The
// bandits held the road; once their case is resolved the village links to the old crossroads (first
// arrival narrated once for the world). The milestone (INT with the investigation skill) or the elder
// tells where the mill hamlet and the river ford lie, and that the royal road runs on past the ford --
// the region's geography is the world's truth (`fact_road_*`), what a character knows of it is theirs
// (`rum_road_*`; the next steps open their links by that knowledge). Searching the crossroads (PER)
// reads the bandit leader's fate in the land: a trail toward the ford if he lives, the bandits'
// abandoned toll post if he fell. Additive only (D-92/D-94).
//
// V2-Core-70 (#170 Slice 3, step 3 -- the village's trust): the two stories add up. A character the
// elder and the herbalist both trust (15 or more on each one's edge towards them) once both cases are
// resolved is honoured in the village's name, once (`org_village -> self`, `trusted` -- their own edge,
// D-71 (2)); the world remembers that someone was (`village_honored`, narration only). The standing
// changes what is offered afterwards: the merchants sell the lantern for 2 instead of 5, the herbalist
// her salve for 1 instead of 3. Giving the herbalist two purifying herbs earns +10 once (`helped`) -- a
// real choice before the purification (the remedy needs the same two), and a way for a successor, who
// can no longer be thanked for the spring, to earn her trust. Additive only.
//
// V2-Core-69 (#170 Slice 3, step 2 -- the spring's tale): the purification becomes history, as the
// bandits' dispersal did (V2-Core-45/46, D-74's day-clock pattern). `evt_well_tale` records the
// objective `fact_well_fate` ("purified") and counts `well_tale_age` 1..3 a day apart. While it is
// fresh the herbalist tells the news (`rum_well_fate`); after about two days the market's legend
// (`rum_well_legend`, "the spring's spirit was appeased", low confidence). A successful search at the
// purified spring sees the truth first-hand and corrects a believed legend (D-14); a character whose
// legend was corrected so can tell the herbalist, once for the world (`well_tale_corrected`; +5 on
// their own edge): from then on she tells everyone the true account, a successor too. Additive only.
//
// V2-Core-68 (#170 Slice 3, step 1 -- the arrows at the spring): the two stories meet. The carcass
// in the spring was shot with bandit arrows (`fact_spring_fouler`, the world's truth, set wherever the
// carcass is handled: a successful search, the purification). Only a character who knows the bandits'
// hideout (`rum_ruins_secret`, their knowledge) reads the arrows for what they are (`rum_spring_bandits`).
// Telling the elder, once for the world (`spring_bandits_told`, a world flag; +5 on the teller's own
// edge, D-71 (2)), changes what the village says from then on, to anyone, a successor too: the elder's
// account of the ruins and of the bandits' fate, and the herbalist's of the sickness -- and whether
// the one behind it still lives (the leader's `alive`, gap 5). Additive only (D-92).
//
// V2-Core-66 (#160 Slice 2, step 3 -- resolution and its world): at the spring, a character who found
// the cause with their own eyes (`rum_spring_cause`, their knowledge) and carries a remedy purifies it:
// `case_fouled_well` is resolved (the world's), the miasma stops for everyone, and the herbalist's edge
// towards that character records it (`purifier`, a personal edge, D-70). What follows: the village
// sees its well clear (a `data.events` entry, once, narration only); the well and the herbalist tell
// the changed world to whoever asks (a successor too, no knowledge inherited); the purifier -- only
// them -- can tell her, once (+10, `thanked`). No reward beyond trust (D-71 (2)). Additive only.
//
// V2-Core-65 (#160 Slice 2, step 2 -- herbalism): the remedy the spring needs. Gathering purifying
// herbs at the spring is WIS with a new skill, `herbalism` (its own practice -> rank at every 20, the
// mastery labels as every skill), and costs 2 stamina whatever comes of it (the resource outside a
// fight; the miasma goes on meanwhile). The herbalist teaches the basics once, for 2 silver, to a
// character she has talked with (+20 practice: rank 1), and brews a remedy from two herbs. Additive
// only (D-92): a proficiency and a skill (lazy, rank 0), two items, one action, two options.
//
// V2-Core-64 (#160 Slice 2, step 1 -- discovery): a second case, 흐려진 우물, built from what exists.
// The village well (PER, the first check to read it) points to the forest spring; the market herbalist
// (a dialogue-only NPC, no actor) tells the same, and earns +5 trust once (her own `consulted` tag,
// D-84's pattern); knowing the source opens the way to the spring (a link `requires`, as the dark
// ruins); there the miasma is a checked `data.events` entry (CON, the first check to read it) while
// the case is open, and searching the spring (PER) finds what fouls it. Additive only -- a new place,
// actions, a choice, an event, facts without `initial`, rumors, texts, a dialogue NPC -- so a 0.3.0
// save loads and plays it unchanged (no version bump, no new actor).
//
// V2-Core-59 (#147 Phase D, D-88): an NPC capability. The leader's actor declares the growth
// system's stamina (6/6); on a clean hit (`fail`) with 3 of it he lands a heavy blow (1 more damage, 3
// of his stamina) -- twice a fight at most, never recovered. The same Condition/Effect language as
// the player's techniques, with `subject`. No engine change, no version bump.
//
// V2-Core-58 (#147 Phase B, D-87): the first equipment. The iron sword (slot `hand`, 3 silver at the
// market) is owned by buying it and wielded by "철검을 든다" (the `equip` Effect; "철검을 내려놓는다"
// unequips). While it is in hand the fight offers "철검으로 베어 든다" -- the strike at base 10.
// Owning it is not enough; it has no modifier. No NPC equipment, no version bump.
//
// V2-Core-57 (#147 Phase A, D-86): the first talent. The scout background keeps night vision and
// gains `investigation_talent` -- a trait whose `practice` adds 2 to every investigation practice
// gain (the engine applies it where practice grows). The wanderer is unchanged; a scout saved
// before it has none. No new background, no version bump.
//
// V2-Core-56 (Gate 4 = C, D-85): the first resource, stamina (max 6), defined by the growth system
// and kept by each character (`growth.growth_wanderer.resources.stamina = {current, max}`; both
// backgrounds start full, so does a successor; a save without it is full). The counter costs 3 and
// the old wound 2 (the option requires it, every outcome pays it); the strike and fleeing are free;
// the village rest refills it. No NPC resources, no version bump.
//
// V2-Core-55 (Reputation Decision, D-84): the elder's trust is earned once per meaningful event, per
// character -- asking about the ruins +5 only on the first telling (the character's own knowledge),
// reporting +10 only to a non-confidant (his own tag), the dispersal and the correction +5 as before
// (each already once); small talk and the news are dialogue and information only. At 15 (the
// `relation` Condition, no decay) the elder tells of the leader's old wound (a rumor), and knowing it
// opens a fight option: the strike at base 9 instead of 11, the same damage. A successor has their
// own edge and knowledge. No engine change, no version bump: a saved score is kept as it is.
//
// V2-Core-53 (Trait / Talent / Mastery Decision, D-82): a starting background, `start_scout`, gives
// the trait `night_vision`, and the trait changes a rule in data: the dark ruins ask for a lantern
// OR night vision (the link and the search). Mastery is a label over the skill rank
// (`masteryTiers`: Untrained / Novice / Apprentice / Adept), display only. No Talent. No engine
// change, no version bump (no existing actor changes shape).
//
// V2-Core-52 (Skill Decision = A, D-81): practice -> threshold -> skill rank -> the check's bonus.
// `swordsmanship` (grown by the combat practice) and `investigation` (by the investigation practice),
// a rank at every 20 points, +1 per rank: the same numbers the practice gave directly before, now
// from the skill; no check names a proficiency, no proficiency has a `checkStep` (never counted
// twice). No version bump: a missing rank is rank 0 (a save already past thresholds starts at 0).
//
// V2-Core-51 (Stats Decision, D-80): the fantasy prototype's common stats STR / DEX / CON / INT /
// WIS / PER replace `wit`: the investigation reads INT, the confrontation WIS (against the leader's
// WIS), the strike STR and the counter DEX (each against the leader's own). CON and PER are defined
// only. The player is 8 and the leader 10 in every stat, so every check keeps its numbers (the old
// wit's). Damage stays tier-fixed. `version` is "0.3.0": a "0.2.0" save is refused by D-68 (not
// repaired, not migrated, not deleted).
//
// V2-Core-50: the first fight (Master Spec Milestone F, Gate 3 = C / Gate 4 = C, D-78). At the
// ruins, with the character's own proof, while the leader lives and the case is open: exchanges of
// one opposed check each (STR or DEX since V2-Core-51) (§5.7: choice -> option check -> outcomes, no combat engine), the tier
// deciding who is hit; the technique (counter) needs the keen eye; fleeing returns to the village.
// The leader's death (`alive`) ends the case: his gang loses him and is cowed before the victor, so
// the existing history (the tale, the market's relief, the elder's news) follows. A wounded leader
// keeps his wounds (his actor's hp). A new `combat` proficiency grows with every exchange. Data
// only; `version` stays "0.2.0" (no state-shape change: proficiencies are lazy).
//
// V2-Core-48: the investigation proficiency, until now only the way to `unl_keen_eye`, also takes part
// in the ruins investigation's check (+floor(points / 20), §5.4) -- practice is execution quality.
// Data only; `version` stays "0.2.0" (no state-shape change).
//
// V2-Core-47 (D-77, Gate 1/2 decided): the bandit leader is an actor (`npcs.*.actor`, seeded
// by createInitialState, `kind:"npc"`), and the confrontation is opposed by his stat (`wit`, WIS since V2-Core-51). The
// canonical play is unchanged (base 14 + 0 = the old "hard"). `version` is "0.2.0": a save of
// "0.1.0" has no leader actor and is refused by D-68 (not repaired, not migrated, not deleted).
//
// This is deliberately small (Ponytail): one data module, one growth
// system, three locations, two NPCs (the elder only a relation/rumor
// participant ID; the leader also an actor since V2-Core-47 -- an NPC
// scheduler or NPC autonomy is still out of scope).

// V2-Core-50: one exchange of the fight with the bandit leader (§5.7: a Resolvable chain, the same
// check() and choice -- no combat engine, no turn queue). Practice first, then the exchange's own
// effects (who is hit is the check's tier: the leader's answer is part of the resolution), then
// what follows: the leader fallen -> the fight is won (`alive`, D-78); both standing -> the next
// exchange (a wounded leader is narrated from his `hp`); the player fallen -> nothing more (§9 has
// already asked for a new character).
const LEADER_DOWN = { op: "not", of: { op: "alive", subject: "npc_bandit_leader" } };
function fightExchange(effects) {
  return [
    { op: "proficiency", id: "combat", add: 5 },
    ...effects,
    {
      op: "if",
      when: LEADER_DOWN,
      then: [
        // the leader fell: the case is over, his gang has no leader and is cowed before the victor
        { op: "case", case: "case_ruins_mystery", stage: "resolved" },
        { op: "relation", from: "npc_bandit_leader", to: "org_bandits", untag: "member" },
        { op: "relation", from: "org_bandits", to: "self", add: -10, tag: "cowed" },
        { op: "narrate", textId: "txt_fight_victory" }
      ],
      else: [
        {
          op: "if",
          when: { op: "alive" },
          then: [
            {
              op: "if",
              when: { op: "lte", left: { hp: "current", subject: "npc_bandit_leader" }, right: 4 },
              then: [{ op: "narrate", textId: "txt_fight_leader_reels" }]
            },
            { op: "choice", choice: "choice_fight_leader", sourceId: "act_fight_leader" }
          ]
        }
      ]
    }
  ];
}
const hitLeader = (add) => ({ op: "hp", subject: "npc_bandit_leader", add });
const hitSelf = (add) => ({ op: "hp", add });
// V2-Core-59 (D-88, #147 Phase D): the leader's technique -- the same capability language as the
// player's (the growth system's stamina, a cost, a Condition on it). On a clean hit (`fail`), with 3
// of his stamina he puts his weight behind the blow: 1 more damage. Below 3, the plain hit
const LEADER = "npc_bandit_leader";
const leaderHits = (damage) => ({
  op: "if",
  when: { op: "resource", subject: LEADER, resource: "stamina", min: 3 },
  then: [{ op: "resource", subject: LEADER, resource: "stamina", add: -3 }, { op: "narrate", textId: "txt_fight_leader_heavy_blow" }, hitSelf(-(damage + 1))],
  else: [hitSelf(-damage)]
});
const say = (textId) => ({ op: "narrate", textId });
// V2-Core-53 (D-82): the ruins are dark: a lantern, or the night vision a background gives (a rule
// the trait changes, not a bonus -- the lantern's +1 to the search stays the lantern's)
const LIGHT_OR_NIGHT_VISION = {
  op: "or",
  of: [
    { op: "item", item: "item_lantern", min: 1 },
    { op: "trait", trait: "night_vision" }
  ]
};
// V2-Core-64 (#160): the way to the forest spring is known only from the well or the herbalist
const KNOWS_WELL_SOURCE = { op: "rumor", rumor: "rum_well_source" };
// V2-Core-66 (#160): the well's case, closed by purifying the spring (world state, D-70)
const WELL_RESOLVED = { op: "case", case: "case_fouled_well", stage: "resolved" };
// V2-Core-68 (#170): handling the carcass records whose arrows killed it (the world's truth); a
// character who knows the bandits' hideout reads them, once
const ARROWS_TOLD = { op: "flag", key: "spring_bandits_told" };
const EXAMINE_CARCASS = [
  { op: "fact", fact: "fact_spring_fouler", set: "bandits" },
  {
    op: "if",
    when: { op: "and", of: [{ op: "rumor", rumor: "rum_ruins_secret" }, { op: "not", of: { op: "rumor", rumor: "rum_spring_bandits" } }] },
    then: [{ op: "rumor", rumor: "rum_spring_bandits", observe: true, source: "obs_loc_forest_spring", confidence: 80 }, say("txt_spring_bandit_arrows")]
  }
];
// V2-Core-69 (#170): the spring's tale -- the legend's time (about two days on) unless someone corrected it
const WELL_LEGEND_TIME = { op: "and", of: [{ op: "signal", key: "well_tale_age", min: 3 }, { op: "not", of: { op: "flag", key: "well_tale_corrected" } }] };
// V2-Core-72 (#180): the road out -- the bandits who held it are gone; the leader's fate in the land
const BANDITS_GONE = { op: "case", case: "case_ruins_mystery", stage: "resolved" };
const LEADER_LIVES = { op: "alive", subject: "npc_bandit_leader" };
// V2-Core-74 (#180): the realm's news the caravans have brought so far (the world's facts)
const NEWS = (fact) => ({ op: "fact", fact, eq: "known" });
// V2-Core-76 (#189): the frontier's news travels north only with the caravans (World Bible WB-0019)
const CARAVANS_WENT_NORTH = { op: "signal", key: "caravan_visits", min: 1 };
// V2-Core-86 (#207): while the royal fair is the realm's latest news -- the second caravan brought it, the third
// brings the unrest -- flour fetches more in the castle town (a world count, as GUARD_WANTED reads; a fact
// Condition may not gate a player's option, D-06)
const FAIR_TIME = { op: "signal", key: "caravan_visits", eq: 2 };
// V2-Core-82 (#198): and the town's talk comes back south with the next caravan (a round trip)
const NORTH_TALK_BACK = { op: "signal", key: "caravan_visits", min: 2 };
// what the north says of a frontier story: the corrected account once it reached the town, the legend
// while the town still tells it (low confidence; it never overwrites what a character saw, D-14)
const NORTH_ECHO = (story, fate, legend, truthText, taleText) => ({
  op: "if",
  when: { op: "flag", key: `${story}_truth_north` },
  then: [{ op: "rumor", rumor: fate, source: "npc_ferryman", confidence: 50 }, say(truthText)],
  else: [{ op: "if", when: { op: "signal", key: `${story}_tale_age`, min: 3 }, then: [{ op: "rumor", rumor: legend, source: "npc_ferryman", confidence: 30 }, say(taleText)] }]
});
// the village corrected a story the town still tells as the legend
const NORTH_STILL_TELLS = (story) => ({
  op: "and",
  of: [NORTH_TALK_BACK, { op: "flag", key: `${story}_tale_corrected` }, { op: "not", of: { op: "flag", key: `${story}_truth_north` } }]
});
// V2-Core-78 (#189): one guard per caravan -- the world has hired fewer guards than caravans have come
// over the first three caravans (V2-Core-78) -- kept as it was, so a save from before V2-Core-96 means what it meant
const FIRST_CARAVANS_WANT = {
  op: "or",
  of: [1, 2, 3].map((n) => ({ op: "and", of: [{ op: "signal", key: "caravan_visits", min: n }, { op: "signal", key: "guards_hired", max: n - 1 }] }))
};
// V2-Core-96 (#237): caravans keep coming after the third; each later one is owed a guard (`guards_owed`)
const GUARD_WANTED = { op: "or", of: [FIRST_CARAVANS_WANT, { op: "signal", key: "guards_owed", min: 1 }] };
// V2-Core-108/109/116 (#265, #282): the caravans do not wait. Owed shares are capped at THREE (nine days of caravans): a
// caravan not guarded by the time the cap is passed has left with another guard (counted in the world's
// `caravans_unguarded`). Set at three, tightened to one on measurements made on a clock that counted a long step's
// caravans as one, and set back to three on the honest clock (`catchUp`, D-107; measured, V2-Core-116): a steady
// career -- staying in town or walking home to rest -- loses none under any cap, the royal journey (eleven days, four
// caravans) loses ONE at three (three at one), and a guard whose backlog is full who walks home while a convoy has
// waited two days loses the caravan where one who sleeps in town does not. Each `if` drops one, and every caravan's
// firing clamps by itself, so a save already over the cap is brought down by up to 12 at each caravan (one holding
// more comes down over the next ones). The first three caravans' rule is untouched
const OWED_CAP = 3;
const CLAMP_OWED = Array.from({ length: 12 }, () => ({
  op: "if",
  when: { op: "signal", key: "guards_owed", min: OWED_CAP + 1 },
  then: [{ op: "signal", key: "guards_owed", add: -1 }, { op: "signal", key: "caravans_unguarded", add: 1 }]
}));
const GUARD_PAID = (pay, extra) => [
  // the first three caravans' shortfall first, then the later caravans' (decided before the count moves)
  { op: "if", when: FIRST_CARAVANS_WANT, then: [], else: [{ op: "signal", key: "guards_owed", add: -1 }] },
  { op: "signal", key: "guards_hired", add: 1 },
  { op: "money", add: pay },
  ...extra,
  // V2-Core-125 (#307): what the road was like
  ROAD_SEEN,
  { op: "move", to: "loc_far_bank" }
];
// V2-Core-92 (#226): the guild knows a guard -- the clerk's standing with this character (their own edge, D-71:
// not inherited); a good escort adds to it, and a known guard is paid a little more
const GUILD_KNOWS = { op: "relation", from: "npc_guild_clerk", to: "self", min: 10 };
const GUILD_REMEMBERS = [
  { op: "if", when: GUILD_KNOWS, then: [{ op: "money", add: 1 }, say("txt_escort_known_bonus")] },
  { op: "relation", from: "npc_guild_clerk", add: 5 }
];
// V2-Core-105 (#258): leading the convoy earns the guild's regard twice as fast; the known guard's bonus is the same
const LEAD_REMEMBERS = [
  { op: "if", when: GUILD_KNOWS, then: [{ op: "money", add: 1 }, say("txt_escort_known_bonus")] },
  { op: "relation", from: "npc_guild_clerk", add: 10 }
];
// V2-Core-125 (#307, Road News step 1a): the road to the ford has a condition -- a world number `road_trouble`, 0 quiet /
// 1 uneasy / 2 dangerous, and the fact `fact_road_north` that names it. Each caravan cycle it moves at most one step: it
// eases, holds or worsens as a 2d10 world roll would against 10 once the bandit leader is dead (64% / 21% / 15%) and against
// 12 while he lives (45% / 27% / 28%). The rolls are drawn once, not at play time: two courses of forty cycles in exactly
// those proportions, in an order whose long-run shares of quiet / uneasy / dangerous are the roll's own (within a point: 78 / 18
// / 4 and 50 / 31 / 19 %), fixed here; each world starts its course at its own place (`fact_road_course`, seeded
// at creation from its own stream, D-76). A roll at play time would draw the world's dice and move every later roll in the
// world (tried, #307: the escorts of eight pinned scenarios and their browser twins, and the Death & Injury samples). A save
// from before has no course fact and starts at the first place. Nothing says who or why. Only the danger job feels it: what a failed one costs (2 / 4 / 7) and,
// on a dangerous road, what it pays (+3). The ordinary escort, the lead and the careful way cost what they did -- measured
// (#307): a +1 on the ordinary and lead jobs' dangerous road cut what the careful way saves a guard who rides it only when
// hurt from 55% to 39% of the known guards' deaths (Death & Injury, #297), where the danger job alone leaves it as it was
// and the news worth as much. Provisional game values (R-29), set on the Step 0 measurements (#306)
const ROAD = (n) => ({ op: "signal", key: "road_trouble", eq: n });
const byRoad = (quiet, uneasy, dangerous) => ({ op: "if", when: ROAD(2), then: dangerous, else: [{ op: "if", when: ROAD(1), then: uneasy, else: quiet }] });
const ROAD_FACT = byRoad(
  [{ op: "fact", fact: "fact_road_north", set: "quiet" }],
  [{ op: "fact", fact: "fact_road_north", set: "uneasy" }],
  [{ op: "fact", fact: "fact_road_north", set: "dangerous" }]
);
const ROAD_EASES = [{ op: "if", when: { op: "signal", key: "road_trouble", min: 1 }, then: [{ op: "signal", key: "road_trouble", add: -1 }] }];
const ROAD_WORSENS = [{ op: "if", when: { op: "signal", key: "road_trouble", max: 1 }, then: [{ op: "signal", key: "road_trouble", add: 1 }] }];
const ROAD_CYCLE = 40;
const ROAD_COURSE_FREE = "PEPEEEEEEEFFEEFFEEPEEEFEEEEPEPEPEEPEEPEF"; // 26 E / 8 P / 6 F: 78 / 18 / 5 % quiet / uneasy / dangerous over the cycle
const ROAD_COURSE_WATCHED = "FFPPFFEPPEEEEEFPPEPEEEFEEPFEFEEPEPFEFFPE"; // 18 E / 11 P / 11 F: 50 / 30 / 20 %
const ROAD_PHASE = (k) => ({ op: "signal", key: "road_phase", eq: k });
const roadMoves = (course) => [...course].flatMap((move, k) => (move === "P" ? [] : [{ op: "if", when: ROAD_PHASE(k), then: move === "E" ? ROAD_EASES : ROAD_WORSENS }]));
const ROAD_TURN = [
  // the first turn finds the world's place on the course (a save from before: the first place)
  {
    op: "if",
    when: { op: "signal", key: "road_started", max: 0 },
    then: [
      ...Array.from({ length: ROAD_CYCLE - 1 }, (_, i) => ({ op: "if", when: { op: "fact", fact: "fact_road_course", min: i + 1 }, then: [{ op: "signal", key: "road_phase", add: 1 }] })),
      { op: "signal", key: "road_started", add: 1 }
    ]
  },
  { op: "if", when: LEADER_LIVES, then: roadMoves(ROAD_COURSE_WATCHED), else: roadMoves(ROAD_COURSE_FREE) },
  ROAD_FACT,
  { op: "signal", key: "road_phase", add: 1 },
  { op: "if", when: { op: "signal", key: "road_phase", min: ROAD_CYCLE }, then: [{ op: "signal", key: "road_phase", add: -ROAD_CYCLE }] }
];
// the road's condition as a character hears or sees it: one rumour per condition (a different claim under one rumour id
// would be ignored at equal confidence, D-14), from the given source
const ROAD_NEWS = (source, confidence) => byRoad(
  [{ op: "rumor", rumor: "rum_road_quiet", source, confidence }],
  [{ op: "rumor", rumor: "rum_road_uneasy", source, confidence }],
  [{ op: "rumor", rumor: "rum_road_dangerous", source, confidence }]
);
// a guard who rides the road sees it (after the escort's own outcome; a guard the road killed sees nothing)
const ROAD_SEEN = {
  op: "if",
  when: { op: "alive", subject: "self" },
  then: [ROAD_NEWS("obs_road_north", 90), byRoad([say("txt_road_seen_quiet")], [say("txt_road_seen_uneasy")], [say("txt_road_seen_dangerous")])]
};
// the danger job, done on a dangerous road, is paid for it (+3)
const DANGER_ROAD_BONUS = { op: "if", when: ROAD(2), then: [{ op: "money", add: 3 }, say("txt_danger_road_bonus")] };
const ROAD_HURT = (quiet, uneasy, dangerous) => byRoad([{ op: "hp", add: -quiet }], [{ op: "hp", add: -uneasy }], [{ op: "hp", add: -dangerous }]);
// V2-Core-118 (#291): the guild's held share of a fallen guard's purse (WB-0027). `if`s are unrolled (the pack has no
// arithmetic Effect): the share recorded is min(floor(wallet / 2), 12); a claim moves up to 12 of what is held to the claimant
const ESTATE_SHARE_CAP = 12;
const ESTATE_HELD_TIERS = Array.from({ length: ESTATE_SHARE_CAP }, (_, i) => (
  { op: "if", when: { op: "money", min: 2 * (i + 1) }, then: [{ op: "signal", key: "estate_held", add: 1 }] }
));
const ESTATE_CLAIM_TIERS = Array.from({ length: ESTATE_SHARE_CAP }, () => (
  { op: "if", when: { op: "signal", key: "estate_held", min: 1 }, then: [{ op: "money", add: 1 }, { op: "signal", key: "estate_held", add: -1 }] }
));
// V2-Core-93 (#226): the character carries a wound from the road (their growth, not inherited)
const ROAD_WOUND = { op: "trait", trait: "road_wound" };
// V2-Core-121 (#298, Death & Injury step 1, M1'): a hard road leaves a mild wound that a night's rest closes, and -- when a failed
// escort leaves hp this low -- a DEEP wound: a further check penalty, a night heals half as much, the lead and danger jobs
// are closed, and it closes with the herbalist's salve or when rest brings hp back to full. Provisional game values (R-29),
// set on measurements (#297): hp <= 2, not 4 (normal play would meet ~2.8 deep wounds a career), not 3 (careful play's early deaths rise)
const ROAD_WOUND_DEEP = { op: "trait", trait: "road_wound_deep" };
const DEEP_WOUND_HP = 2;
// what a failed escort leaves behind (after its hp is paid): a deep wound if hp is at or under the line, else the mild one
const WOUND_ON_FAIL = [
  {
    op: "if",
    when: { op: "and", of: [{ op: "lte", left: { hp: "current" }, right: DEEP_WOUND_HP }, { op: "not", of: ROAD_WOUND_DEEP }] },
    then: [
      { op: "trait", trait: "road_wound_deep" },
      { op: "trait", trait: "road_wound" },
      say("txt_escort_deep_wound"),
      // V2-Core-123 (#302, Death & Injury step 3): and the guild remembers a guard it knew who came back with one -- a world
      // number, not a person (a guard who did not survive the blow is counted as fallen, not maimed); nothing a successor
      // inherits (D-71)
      { op: "if", when: { op: "and", of: [GUILD_KNOWS, { op: "alive", subject: "self" }] }, then: [{ op: "signal", key: "guards_maimed", add: 1 }] }
    ],
    else: [{ op: "if", when: { op: "not", of: ROAD_WOUND }, then: [{ op: "trait", trait: "road_wound" }, say("txt_escort_wound")] }]
  }
];
// what a night's rest does to the wounds (after its hp): a deep wound heals half as much and closes once hp is full again; the mild one
// closes with the night unless a deep one is still open
const REST_HEAL = [
  { op: "if", when: ROAD_WOUND_DEEP, then: [{ op: "hp", add: 2 }], else: [{ op: "hp", add: 4 }] }
];
const REST_WOUNDS = [
  {
    op: "if",
    when: ROAD_WOUND_DEEP,
    then: [{
      op: "if",
      when: { op: "lt", left: { hp: "current" }, right: { hp: "max" } },
      then: [say("txt_rest_deep_wound_stays")],
      else: [{ op: "trait", trait: "road_wound_deep", remove: true }, { op: "trait", trait: "road_wound", remove: true }, say("txt_rest_deep_wound_closes")]
    }],
    else: [{ op: "if", when: ROAD_WOUND, then: [{ op: "trait", trait: "road_wound", remove: true }, say("txt_rest_wound_closes")] }]
  }
];
// V2-Core-73 (#180): the two settlements trade (a world edge between world entities, D-70)
const HAMLET_TRADES = { op: "relation", from: "org_mill_hamlet", to: "org_village", tag: "trading" };
// V2-Core-70 (#170): the village's standing towards this character (their own edge)
const VILLAGE_TRUSTED = { op: "relation", from: "org_village", to: "self", tag: "trusted" };
// what the village says once the elder has been told -- and whether the one behind it still lives
const ARROWS_IN_THE_ACCOUNT = {
  op: "if",
  when: ARROWS_TOLD,
  then: [{ op: "if", when: { op: "alive", subject: "npc_bandit_leader" }, then: [say("txt_spring_bandits_leader_lives")], else: [say("txt_spring_bandits_leader_dead")] }]
};
// V2-Core-52: a skill rank at every 20 practice points (thresholds are applied in `at` order, D-42)
const rankUps = (skill) => [20, 40, 60, 80, 100].map((at) => ({ at, effects: [{ op: "skill", skill, add: 1 }] }));
const FIGHT_DIFFICULTY = (base, stat) => ({ base, opposed: { subject: "npc_bandit_leader", stat } });
// the strike (V2-Core-50/51) and, since V2-Core-55, the weak spot: one blow, one damage table
const STRIKE_CHECK = (base) => ({ stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: FIGHT_DIFFICULTY(base, "str") });
// V2-Core-56 (D-85, Gate 4 = C): a technique's stamina cost -- the option requires it, and every
// outcome of its exchange pays it first (an option with a check runs only its tier's outcome)
const STAMINA_AT_LEAST = (n) => ({ op: "resource", resource: "stamina", min: n });
// V2-Core-112 (#275): the hard convoy is open to a lead-holder wearing steel or mail
const DANGER_OPEN = { op: "and", of: [GUARD_WANTED, { op: "unlock", id: "unl_road_lead" }, { op: "not", of: ROAD_WOUND_DEEP }, STAMINA_AT_LEAST(3),
  { op: "or", of: [{ op: "item", item: "item_steel_sword", equipped: true }, { op: "item", item: "item_mail_shirt", equipped: true }] }] };
const payStamina = (n, outcomes) =>
  Object.fromEntries(Object.entries(outcomes).map(([tier, effects]) => [tier, [{ op: "resource", resource: "stamina", add: -n }, ...effects]]));
const STRIKE_OUTCOMES = {
  great: fightExchange([hitLeader(-7), say("txt_fight_strike_great")]),
  success: fightExchange([hitLeader(-5), say("txt_fight_strike_hit")]),
  partial: fightExchange([hitLeader(-2), hitSelf(-2), say("txt_fight_trade")]),
  fail: fightExchange([leaderHits(3), say("txt_fight_struck")])
};

export const worldData = {
  formatVersion: 1,
  id: "frontier_village_pack",
  version: "0.3.0",
  world: {
    id: "frontier_village",
    growthSystemId: "growth_wanderer",
    startTemplateId: "start_wanderer"
  },

  characterTemplates: {
    start_wanderer: {
      kind: "player",
      locationId: "loc_village",
      hp: { max: 10 },
      money: 8,
      inventory: {},
      // V2-Core-51 (D-80): the six common stats, 8 each (the old `wit`); V2-Core-56 (D-85): full stamina
      growth: { growth_wanderer: { stats: { str: 8, dex: 8, con: 8, int: 8, wis: 8, per: 8 }, resources: { stamina: { current: 6, max: 6 } } } },
      tags: []
    },
    // V2-Core-53 (D-82): the first starting background with a trait. The same stats; less money (no
    // spare coin for a lantern) but night vision, which the dark ruins ask for instead of a lantern.
    // Chosen where a template is chosen today -- a successor's start (the first character is the
    // world's startTemplateId, D-47)
    start_scout: {
      kind: "player",
      locationId: "loc_village",
      hp: { max: 10 },
      money: 3,
      inventory: {},
      growth: {
        growth_wanderer: {
          stats: { str: 8, dex: 8, con: 8, int: 8, wis: 8, per: 8 },
          // V2-Core-57 (D-86): and an investigation talent (a growth tendency, not a check bonus)
          traits: { night_vision: true, investigation_talent: true },
          resources: { stamina: { current: 6, max: 6 } }
        }
      },
      tags: []
    }
  },

  // V2-Core-25: applied by engine.js's resolveStartCharacter right after a
  // post-death `startCharacter` (D-47) with ctx {actorId: new character,
  // targetId: previous character} -- `money` therefore defaults its subject
  // to the NEW character. Uses only already-implemented Effects.
  rules: {
    succession: [
      { op: "money", add: 3 },
      { op: "narrate", textId: "txt_succession" }
    ]
  },

  // V2-Core-25: the one data.events entry, evaluated by §2.5 stage 10 after
  // every resolved action (D-51, world context). While the player stands in
  // the ruins it fires at most once per `cooldown` minutes and costs 4 HP --
  // three hits take the 10-HP wanderer to 0, which is the existing `hp`
  // Effect's own death trigger (D-34), not a new mechanic.
  events: {
    // V2-Core-45 (#66 slice): the dispersal becomes history. Once the bandits are dispersed (the
    // case is resolved and the leader is no longer a member -- not reversible since V2-Core-44),
    // this records the objective fact and counts the days: 1 on the dispersal step, then +1 at the
    // first step a full day later, until 3 (D-74's delayed-change pattern; no scheduler). The
    // elder's account reads the count.
    evt_bandits_tale: {
      trigger: {
        op: "and",
        of: [
          { op: "case", case: "case_ruins_mystery", stage: "resolved" },
          { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } },
          { op: "signal", key: "bandits_tale_age", max: 2 }
        ]
      },
      cooldown: 1440,
      catchUp: true,
      effects: [
        { op: "fact", fact: "fact_bandits_fate", set: "dispersed" },
        { op: "signal", key: "bandits_tale_age", add: 1 }
      ]
    },
    // V2-Core-33: a consequence that shows up later, elsewhere. Read through `relation`
    // Conditions only; `once` (state.fired) keeps it from paying twice.
    evt_market_reopens: {
      trigger: {
        op: "and",
        of: [
          { op: "location", at: "loc_market" },
          { op: "relation", from: "org_bandits", to: "self", tag: "cowed" },
          { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } }
        ]
      },
      once: true,
      effects: [
        { op: "money", add: 3 },
        { op: "narrate", textId: "txt_market_reopens" }
      ]
    },
    // V2-Core-74 (#180): the world does not wait -- once the reopened road is in use (someone has walked
    // it), a caravan every three days, wherever the player is, brings the realm's news: the levy, then the
    // fair, then the unrest
    evt_caravan: {
      // V2-Core-96 (#237): the caravans keep coming -- the realm's news is the first three's; each later caravan is owed a guard
      trigger: { op: "flag", key: "road_walked" },
      cooldown: 4320,
      catchUp: true,
      effects: [
        { op: "signal", key: "caravan_visits", add: 1 },
        { op: "if", when: { op: "signal", key: "caravan_visits", eq: 1 }, then: [{ op: "fact", fact: "fact_realm_levy", set: "known" }] },
        { op: "if", when: { op: "signal", key: "caravan_visits", eq: 2 }, then: [{ op: "fact", fact: "fact_realm_fair", set: "known" }] },
        { op: "if", when: { op: "signal", key: "caravan_visits", eq: 3 }, then: [{ op: "fact", fact: "fact_realm_unrest", set: "known" }] },
        { op: "if", when: { op: "signal", key: "caravan_visits", min: 4 }, then: [{ op: "signal", key: "guards_owed", add: 1 }] },
        ...CLAMP_OWED
      ]
    },
    // V2-Core-125 (#307, Road News step 1a): the road's condition moves with the caravans' cadence -- one turn per cycle,
    // a worse course while the leader lives. A save from before starts quiet and turns at its next step (a first firing)
    evt_road_north: { trigger: { op: "flag", key: "road_walked" }, cooldown: 4320, catchUp: true, effects: ROAD_TURN },
    // V2-Core-102 (#251): the guild remembers a guard it knew who did not come back. Fires in the very step that
    // kills the player (the trigger pass runs before the game asks for a new character); it counts a world number,
    // not a person -- no name, no fate, nothing a successor inherits (D-71)
    evt_known_guard_fell: {
      trigger: { op: "and", of: [{ op: "not", of: { op: "alive", subject: "self" } }, GUILD_KNOWS] },
      effects: [
        { op: "signal", key: "guards_fallen", add: 1 },
        // V2-Core-114 (#280, succession legacy): what a guard the guild knew leaves behind stays with the guild -- a
        // world count per kind, found by the next life and paid for, never handed over (Canon K-14, WB-0005)
        { op: "if", when: { op: "item", item: "item_steel_sword", min: 1 }, then: [{ op: "signal", key: "kit_steel", add: 1 }] },
        { op: "if", when: { op: "item", item: "item_mail_shirt", min: 1 }, then: [{ op: "signal", key: "kit_mail", add: 1 }] },
        // V2-Core-118 (#291, succession legacy 2, K-14 as amended by WB-0027): and the guild holds a share of the purse --
        // one silver for each two the guard carried, twelve at most, counted in the dying step (so a world that never saw
        // the fall holds nothing). Silver is moved from a dead wallet, never made: ESTATE_SHARE_CAP is a Provisional game
        // value (R-29), set against the price of the life (rank five again: ~45 days, ~40 silver)
        ...ESTATE_HELD_TIERS
      ]
    },
    // V2-Core-103 (#251): the road's talk carries it south, late (World Bible N-06: news travels with the caravans) --
    // the first firing counts it out, the next one a caravan's cadence later brings it to the village, only once the
    // road is in use; what the village hears is that a guard did not come back, nothing more
    evt_fallen_word_south: {
      trigger: { op: "and", of: [{ op: "flag", key: "road_walked" }, { op: "signal", key: "guards_fallen", min: 1 }, { op: "signal", key: "fallen_word_age", max: 1 }] },
      cooldown: 4320,
      catchUp: true,
      effects: [
        { op: "signal", key: "fallen_word_age", add: 1 },
        { op: "if", when: { op: "signal", key: "fallen_word_age", eq: 2 }, then: [{ op: "flag", key: "guard_fall_word_south", value: true }] }
      ]
    },
    // V2-Core-74 (#180): the first time anyone sets foot on the far bank (narration, once for the world)
    // V2-Core-80 (#198): a correction made in the village travels north with the road's traffic -- the
    // first firing counts it out (1), the next one, a caravan's cadence later, brings it to the town (2)
    evt_bandits_word_north: {
      trigger: { op: "and", of: [{ op: "flag", key: "road_walked" }, { op: "flag", key: "bandits_tale_corrected" }, { op: "signal", key: "bandits_word_age", max: 1 }] },
      cooldown: 4320,
      catchUp: true,
      effects: [
        { op: "signal", key: "bandits_word_age", add: 1 },
        { op: "if", when: { op: "signal", key: "bandits_word_age", eq: 2 }, then: [{ op: "flag", key: "bandits_truth_north", value: true }] }
      ]
    },
    evt_well_word_north: {
      trigger: { op: "and", of: [{ op: "flag", key: "road_walked" }, { op: "flag", key: "well_tale_corrected" }, { op: "signal", key: "well_word_age", max: 1 }] },
      cooldown: 4320,
      catchUp: true,
      effects: [
        { op: "signal", key: "well_word_age", add: 1 },
        { op: "if", when: { op: "signal", key: "well_word_age", eq: 2 }, then: [{ op: "flag", key: "well_truth_north", value: true }] }
      ]
    },
    // V2-Core-85 (#207): the town takes only so much flour -- once its want is met, it comes back a caravan's
    // cadence after it last came (two sacks); the mill has two sacks to spare a day. World counts, not a
    // character's; amounts and cadences are gameplay values (W-05)
    evt_town_flour_demand: {
      trigger: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "town_flour_wanted", max: 0 }] },
      cooldown: 4320,
      effects: [{ op: "signal", key: "town_flour_wanted", add: 2 }]
    },
    evt_mill_flour_stock: {
      trigger: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "mill_flour_stock", max: 0 }] },
      cooldown: 1440,
      effects: [{ op: "signal", key: "mill_flour_stock", add: 2 }]
    },
    // V2-Core-88 (#217): the first time anyone reaches the royal city (narration, once for the world)
    evt_royal_city_first: {
      trigger: { op: "location", at: "loc_royal_city" },
      once: true,
      effects: [say("txt_royal_city_first")]
    },
    // V2-Core-76 (#189): the first time anyone reaches the castle town (narration, once for the world)
    evt_castle_town_first: {
      trigger: { op: "location", at: "loc_castle_town" },
      once: true,
      effects: [say("txt_castle_town_first")]
    },
    evt_far_bank_first: {
      trigger: { op: "location", at: "loc_far_bank" },
      once: true,
      effects: [say("txt_far_bank_first")]
    },
    // V2-Core-73 (#180): the hamlet's carts reach the market (narration, once for the world)
    evt_hamlet_carts: {
      trigger: { op: "and", of: [{ op: "location", at: "loc_market" }, HAMLET_TRADES] },
      once: true,
      effects: [say("txt_hamlet_carts")]
    },
    // V2-Core-72 (#180): the first time anyone walks the reopened road (narration, once for the world)
    evt_crossroads_first: {
      trigger: { op: "location", at: "loc_crossroads" },
      once: true,
      // V2-Core-74: the road is in use again -- the caravans start coming
      effects: [say("txt_crossroads_first"), { op: "flag", key: "road_walked", value: true }]
    },
    // V2-Core-69 (#170): the purification becomes history -- 1 on the purification's step, then +1 at
    // the first step a full day later, until 3 (as evt_bandits_tale)
    evt_well_tale: {
      trigger: { op: "and", of: [WELL_RESOLVED, { op: "signal", key: "well_tale_age", max: 2 }] },
      cooldown: 1440,
      catchUp: true,
      effects: [
        { op: "fact", fact: "fact_well_fate", set: "purified" },
        { op: "signal", key: "well_tale_age", add: 1 }
      ]
    },
    // V2-Core-66 (#160): the village sees its well clear -- once, for whoever stands in the village
    // after the spring is purified (narration only: the world changed, nobody is paid)
    evt_well_clears: {
      trigger: { op: "and", of: [{ op: "location", at: "loc_village" }, WELL_RESOLVED] },
      once: true,
      effects: [say("txt_well_clears")]
    },
    // V2-Core-64 (#160): the spring's miasma -- a checked trigger (CON): resisted, or 2 HP. Only while
    // the well's case is open; at most once per 30 minutes, like the ruins' hazard
    evt_spring_miasma: {
      trigger: {
        op: "and",
        of: [
          { op: "location", at: "loc_forest_spring" },
          { op: "not", of: WELL_RESOLVED }
        ]
      },
      cooldown: 30,
      check: { stat: "con", tags: ["endurance"], difficulty: "normal" },
      outcomes: {
        success: [say("txt_spring_miasma_resisted")],
        fail: [{ op: "hp", add: -2 }, say("txt_spring_miasma")]
      }
    },
    evt_ruins_hazard: {
      trigger: { op: "location", at: "loc_ruins" },
      cooldown: 30,
      effects: [
        { op: "hp", add: -4 },
        { op: "narrate", textId: "txt_ruins_hazard" }
      ]
    }
  },

  locations: {
    loc_village: {
      name: "변경 마을",
      links: [
        { to: "loc_market", minutes: 15 },
        // V2-Core-53 (D-82): a lantern, or night vision (the scout's trait)
        { to: "loc_ruins", minutes: 45, requires: LIGHT_OR_NIGHT_VISION },
        // V2-Core-64 (#160): the spring the well's water comes from -- once the character knows it
        { to: "loc_forest_spring", minutes: 60, requires: KNOWS_WELL_SOURCE },
        // V2-Core-72 (#180): the road out, once the bandits who held it are gone
        { to: "loc_crossroads", minutes: 45, requires: BANDITS_GONE }
      ]
    },
    loc_market: {
      name: "시장",
      links: [{ to: "loc_village", minutes: 15 }]
    },
    loc_ruins: {
      name: "폐허",
      links: [{ to: "loc_village", minutes: 45 }]
    },
    loc_forest_spring: {
      name: "숲속 샘",
      links: [{ to: "loc_village", minutes: 60 }]
    },
    // V2-Core-72 (#180): the first place beyond the village
    loc_crossroads: {
      name: "옛 갈림길",
      links: [
        { to: "loc_village", minutes: 45 },
        // V2-Core-73 (#180): east, for a character who knows the way
        { to: "loc_mill_hamlet", minutes: 40, requires: { op: "rumor", rumor: "rum_road_hamlet" } },
        // V2-Core-74 (#180): north, for a character who knows the way
        { to: "loc_river_ford", minutes: 50, requires: { op: "rumor", rumor: "rum_road_ford" } }
      ]
    },
    loc_mill_hamlet: {
      name: "물레방아 마을",
      links: [{ to: "loc_crossroads", minutes: 40 }]
    },
    // V2-Core-74 (#180): the far bank is reached only by the ferryman (no link that way); back is free
    loc_river_ford: {
      name: "강나루",
      links: [{ to: "loc_crossroads", minutes: 50 }]
    },
    loc_far_bank: {
      name: "강 건너 길목",
      links: [
        { to: "loc_river_ford", minutes: 30 },
        // V2-Core-76 (#189): the wide road north to the lord's castle town (World Bible N-02, WB-0019)
        { to: "loc_castle_town", minutes: 720 },
        // V2-Core-88 (#217): five days north along the wide road to the royal city (World Bible WB-0011/C-20) --
        // for one who has read the way on the waystation board
        { to: "loc_royal_city", minutes: 7200, requires: { op: "rumor", rumor: "rum_royal_city" } }
      ]
    },
    // V2-Core-76 (#189, Slice 5): the nearest urban sphere -- descriptive name only (World Bible WB-0013/G-05)
    loc_castle_town: {
      name: "영주의 성읍",
      links: [{ to: "loc_far_bank", minutes: 720 }]
    },
    // V2-Core-88 (#217, Slice 8): the seat of royal power and the realm's greatest market (WB-0011) -- descriptive
    // name only; its name, dynasty, powers, size, history and inner structure are the owner's to decide (WB-0023)
    loc_royal_city: {
      name: "왕도",
      links: [{ to: "loc_far_bank", minutes: 7200 }]
    }
  },

  actions: {
    act_observe_village: {
      name: "마을 살피기",
      requires: { op: "location", at: "loc_village" },
      effects: [
        { op: "proficiency", id: "investigation", add: 15 },
        { op: "narrate", textId: "txt_observe_village" }
      ]
    },
    // V2-Core-64 (#160): the well -- PER (what one notices) with the investigation skill. A success
    // records where the water comes from (the world's fact) and the character sees it first-hand
    act_inspect_well: {
      name: "우물 살피기",
      requires: { op: "location", at: "loc_village" },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 20,
      outcomes: {
        success: [
          { op: "fact", fact: "fact_well_source", set: "forest_spring" },
          { op: "rumor", rumor: "rum_well_source", observe: true, source: "obs_village_well", confidence: 70 },
          { op: "proficiency", id: "investigation", add: 10 },
          // V2-Core-66: after the spring is purified, the same water runs clear
          { op: "if", when: WELL_RESOLVED, then: [say("txt_inspect_well_clear")], else: [say("txt_inspect_well_success")] }
        ],
        fail: [{ op: "proficiency", id: "investigation", add: 5 }, say("txt_inspect_well_fail")]
      }
    },
    // V2-Core-64 (#160): the herbalist keeps a stall at the market (a dialogue NPC, like the elder)
    act_talk_herbalist: {
      name: "약초꾼과 대화",
      requires: { op: "location", at: "loc_market" },
      effects: [{ op: "choice", choice: "choice_herbalist_dialogue", sourceId: "act_talk_herbalist" }]
    },
    // V2-Core-64 (#160): searching the spring -- PER with the investigation skill, under the miasma
    act_search_spring: {
      name: "샘 조사",
      requires: { op: "and", of: [{ op: "location", at: "loc_forest_spring" }, KNOWS_WELL_SOURCE] },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 40,
      outcomes: {
        success: [
          { op: "fact", fact: "fact_spring_cause", set: "rotting_carcass" },
          { op: "rumor", rumor: "rum_spring_cause", observe: true, source: "obs_loc_forest_spring", confidence: 80 },
          { op: "proficiency", id: "investigation", add: 20 },
          {
            op: "if",
            when: WELL_RESOLVED,
            // V2-Core-69: the purified spring shows what was done -- first-hand, correcting a believed legend
            then: [
              say("txt_search_spring_purified"),
              { op: "rumor", rumor: "rum_well_fate", observe: true, source: "obs_loc_forest_spring", confidence: 80 },
              { op: "if", when: { op: "rumor", rumor: "rum_well_legend" }, then: [{ op: "rumor", rumor: "rum_well_legend", observe: true, source: "obs_loc_forest_spring", confidence: 80 }] }
            ],
            else: [say("txt_search_spring_success"), ...EXAMINE_CARCASS] // V2-Core-68
          }
        ],
        fail: [{ op: "proficiency", id: "investigation", add: 5 }, say("txt_search_spring_fail")]
      }
    },
    // V2-Core-66 (#160): purifying the spring -- the character's own finding (their knowledge of the
    // cause, not the world's fact) and a remedy, while the case is open
    act_purify_spring: {
      name: "샘을 정화한다",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_forest_spring" },
          { op: "rumor", rumor: "rum_spring_cause" },
          { op: "item", item: "item_spring_remedy", min: 1 },
          { op: "not", of: WELL_RESOLVED }
        ]
      },
      minutes: 30,
      effects: [
        { op: "item", item: "item_spring_remedy", add: -1 },
        { op: "case", case: "case_fouled_well", stage: "resolved" },
        { op: "relation", from: "npc_herbalist", tag: "purifier" },
        { op: "proficiency", id: "herbalism", add: 10 },
        say("txt_purify_spring"),
        ...EXAMINE_CARCASS // V2-Core-68: burying it, the arrows are in hand
      ]
    },
    // V2-Core-65 (#160): gathering purifying herbs -- WIS with the herbalism skill, 2 stamina whatever
    // comes of it (the option requires it, every outcome pays it, as the fight's techniques)
    act_gather_herbs: {
      name: "정화초 채집",
      requires: { op: "and", of: [{ op: "location", at: "loc_forest_spring" }, KNOWS_WELL_SOURCE, STAMINA_AT_LEAST(2)] },
      check: { stat: "wis", skill: "herbalism", tags: ["herbalism"], difficulty: "normal" },
      minutes: 30,
      outcomes: payStamina(2, {
        great: [{ op: "item", item: "item_purifying_herb", add: 2 }, { op: "proficiency", id: "herbalism", add: 10 }, say("txt_gather_herbs_great")],
        success: [{ op: "item", item: "item_purifying_herb", add: 1 }, { op: "proficiency", id: "herbalism", add: 10 }, say("txt_gather_herbs_success")],
        fail: [{ op: "proficiency", id: "herbalism", add: 5 }, say("txt_gather_herbs_fail")]
      })
    },
    // V2-Core-72 (#180): the milestone -- INT (the worn letters) with the investigation skill. A success
    // records the region's roads (the world's truth) and the character reads them first-hand
    act_read_milestone: {
      name: "이정표 읽기",
      requires: { op: "location", at: "loc_crossroads" },
      check: { stat: "int", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 20,
      outcomes: {
        success: [
          { op: "fact", fact: "fact_road_hamlet", set: "east" },
          { op: "fact", fact: "fact_road_ford", set: "north" },
          { op: "fact", fact: "fact_road_royal", set: "beyond_ford" },
          { op: "rumor", rumor: "rum_road_hamlet", observe: true, source: "obs_loc_crossroads", confidence: 80 },
          { op: "rumor", rumor: "rum_road_ford", observe: true, source: "obs_loc_crossroads", confidence: 80 },
          { op: "rumor", rumor: "rum_road_royal", observe: true, source: "obs_loc_crossroads", confidence: 80 },
          { op: "proficiency", id: "investigation", add: 10 },
          say("txt_read_milestone_success")
        ],
        fail: [{ op: "proficiency", id: "investigation", add: 5 }, say("txt_read_milestone_fail")]
      }
    },
    // V2-Core-72 (#180): the crossroads remember who used the road -- PER with the investigation skill;
    // what is found depends on whether the bandit leader lives
    act_search_crossroads: {
      name: "갈림길 살피기",
      requires: { op: "location", at: "loc_crossroads" },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 30,
      outcomes: {
        success: [
          { op: "proficiency", id: "investigation", add: 10 },
          {
            op: "if",
            when: LEADER_LIVES,
            then: [
              { op: "fact", fact: "fact_leader_trail", set: "toward_ford" },
              { op: "rumor", rumor: "rum_leader_trail", observe: true, source: "obs_loc_crossroads", confidence: 70 },
              say("txt_crossroads_leader_trail")
            ],
            else: [
              { op: "fact", fact: "fact_bandit_toll", set: "abandoned" },
              { op: "rumor", rumor: "rum_bandit_toll", observe: true, source: "obs_loc_crossroads", confidence: 80 },
              say("txt_crossroads_toll_post")
            ]
          }
        ],
        fail: [{ op: "proficiency", id: "investigation", add: 5 }, say("txt_search_crossroads_fail")]
      }
    },
    // V2-Core-74 (#180): the ferryman (a dialogue NPC)
    act_talk_ferryman: {
      name: "뱃사공과 대화",
      requires: { op: "location", at: "loc_river_ford" },
      effects: [{ op: "choice", choice: "choice_ferryman_dialogue", sourceId: "act_talk_ferryman" }]
    },
    // V2-Core-74 (#180): the waystation board on the far bank -- the outside world, as notices
    // V2-Core-76 (#189): the lord's notice board -- the decree at its source; the frontier's news only once
    // caravans have carried it north, only as the legend it became, uncorrected, and its hero without a name
    // (World Bible N-06 information gradient, G-04 epithets; the tales are in-world belief, not truth)
    // V2-Core-89 (#217): the realm's greatest market (WB-0011) -- observed, not traded: the centre's scale, and, in
    // the fair's window, the fair the ferryman spoke of seen at its source (heard -> seen, D-14). No prices.
    act_walk_royal_market: {
      name: "왕도의 큰 시장을 둘러본다",
      requires: { op: "location", at: "loc_royal_city" },
      minutes: 60,
      effects: [
        say("txt_royal_market"),
        {
          op: "if",
          when: FAIR_TIME,
          then: [{ op: "rumor", rumor: "rum_realm_fair", observe: true, source: "obs_loc_royal_city", confidence: 90 }, say("txt_royal_market_fair")],
          else: [{ op: "if", when: NEWS("fact_realm_fair"), then: [say("txt_royal_market_after_fair")] }]
        }
      ]
    },
    // V2-Core-90 (#217): the centre's written word (World Bible N-06; WB-0024 DC-07: the realm's news is posted in
    // writing in the royal city -- who keeps it stays open). The border's unrest is written many ways (its truth is
    // the owner's, WB-0012); the frontier is in none of it -- the far end of the information gradient
    act_read_royal_records: {
      name: "왕도에 내걸린 글을 읽는다",
      requires: { op: "location", at: "loc_royal_city" },
      minutes: 40,
      effects: [
        say("txt_royal_records"),
        {
          op: "if",
          when: NEWS("fact_realm_unrest"),
          then: [{ op: "rumor", rumor: "rum_realm_unrest", source: "src_royal_records", confidence: 50 }, say("txt_royal_records_unrest")]
        },
        say("txt_royal_records_no_frontier")
      ]
    },
    act_read_castle_notices: {
      name: "성읍의 포고판을 읽는다",
      requires: { op: "location", at: "loc_castle_town" },
      minutes: 20,
      effects: [
        { op: "rumor", rumor: "rum_realm_levy", source: "obs_loc_castle_town", confidence: 80 },
        say("txt_castle_levy_decree"),
        {
          op: "if",
          when: CARAVANS_WENT_NORTH,
          then: [
            // V2-Core-80 (#198): once the village's correction has travelled north, the town tells it instead
            {
              op: "if",
              when: { op: "flag", key: "bandits_truth_north" },
              then: [{ op: "rumor", rumor: "rum_bandits_fate", source: "src_castle_town_talk", confidence: 50 }, say("txt_castle_bandits_truth")],
              else: [{ op: "if", when: { op: "signal", key: "bandits_tale_age", min: 3 }, then: [{ op: "rumor", rumor: "rum_bandits_legend", source: "src_castle_town_talk", confidence: 30 }, say("txt_castle_bandits_tale")] }]
            },
            {
              op: "if",
              when: { op: "flag", key: "well_truth_north" },
              then: [{ op: "rumor", rumor: "rum_well_fate", source: "src_castle_town_talk", confidence: 50 }, say("txt_castle_well_truth")],
              else: [{ op: "if", when: { op: "signal", key: "well_tale_age", min: 3 }, then: [{ op: "rumor", rumor: "rum_well_legend", source: "src_castle_town_talk", confidence: 30 }, say("txt_castle_well_tale")] }]
            },
            { op: "if", when: { op: "flag", key: "village_honored" }, then: [say("txt_castle_epithet")] }
          ],
          else: [say("txt_castle_no_frontier_news")]
        }
      ]
    },
    // V2-Core-81 (#198): the carrier -- one who heard the legend and saw the truth (their legend corrected,
    // the same test as the village's own corrections) tells it at the town's board: the correction is in
    // the town at once, ahead of the caravans
    act_tell_town_ruins: {
      name: "포고판 앞 사람들에게 폐허에서 본 것을 전한다",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_castle_town" },
          { op: "not", of: { op: "flag", key: "bandits_truth_north" } },
          { op: "eq", left: { rumor: "rum_bandits_legend" }, right: "dispersed" }
        ]
      },
      minutes: 20,
      effects: [{ op: "flag", key: "bandits_truth_north", value: true }, say("txt_town_told_ruins")]
    },
    act_tell_town_spring: {
      name: "포고판 앞 사람들에게 샘에서 본 것을 전한다",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_castle_town" },
          { op: "not", of: { op: "flag", key: "well_truth_north" } },
          { op: "eq", left: { rumor: "rum_well_legend" }, right: "purified" }
        ]
      },
      minutes: 20,
      effects: [{ op: "flag", key: "well_truth_north", value: true }, say("txt_town_told_spring")]
    },
    // V2-Core-77 (#189): the castle town's merchant (a dialogue NPC, no actor: D-92)
    act_talk_town_merchant: {
      name: "성읍의 상인과 대화",
      requires: { op: "location", at: "loc_castle_town" },
      effects: [{ op: "choice", choice: "choice_town_merchant_dialogue", sourceId: "act_talk_town_merchant" }]
    },
    // V2-Core-78 (#189): the merchants' guild clerk (a dialogue NPC, no actor: D-92)
    act_talk_guild_clerk: {
      name: "상단 조합의 서기와 대화",
      requires: { op: "location", at: "loc_castle_town" },
      effects: [{ op: "choice", choice: "choice_guild_clerk_dialogue", sourceId: "act_talk_guild_clerk" }]
    },
    // V2-Core-100 (#244): a bed in the castle town -- the village's rest for two silver and a night (the village stays
    // free: it is home). A night does not close a road wound; only the salve does
    act_lodge_castle_town: {
      name: "성읍에서 묵는다",
      requires: { op: "and", of: [{ op: "location", at: "loc_castle_town" }, { op: "money", min: 2 }] },
      minutes: 480,
      effects: [
        { op: "money", add: -2 },
        ...REST_HEAL,
        { op: "resource", resource: "stamina", add: 6 },
        say("txt_lodge_castle_town"),
        ...REST_WOUNDS
      ]
    },
    act_read_waystation_board: {
      name: "길목의 게시판을 읽는다",
      requires: { op: "location", at: "loc_far_bank" },
      minutes: 20,
      effects: [
        { op: "fact", fact: "fact_royal_city", set: "five_days_north" },
        { op: "rumor", rumor: "rum_royal_city", observe: true, source: "obs_loc_far_bank", confidence: 80 },
        say("txt_board_royal_city"),
        { op: "if", when: NEWS("fact_realm_levy"), then: [{ op: "rumor", rumor: "rum_realm_levy", observe: true, source: "obs_loc_far_bank", confidence: 80 }, say("txt_board_levy")] },
        // the leader's fate reaches the outside world
        {
          op: "if",
          when: LEADER_LIVES,
          then: [
            { op: "fact", fact: "fact_leader_bounty", set: "posted" },
            { op: "rumor", rumor: "rum_leader_bounty", observe: true, source: "obs_loc_far_bank", confidence: 80 },
            say("txt_board_bounty")
          ],
          else: [say("txt_board_road_safe")]
        },
        // the village's name, if it honoured someone
        { op: "if", when: { op: "flag", key: "village_honored" }, then: [say("txt_board_village_name")] },
        { op: "proficiency", id: "investigation", add: 5 }
      ]
    },
    // V2-Core-73 (#180): the miller (a dialogue NPC, like the elder and the herbalist)
    act_talk_miller: {
      name: "방앗간 주인과 대화",
      requires: { op: "location", at: "loc_mill_hamlet" },
      effects: [{ op: "choice", choice: "choice_miller_dialogue", sourceId: "act_talk_miller" }]
    },
    // V2-Core-73 (#180): the hamlet's bread, once the two settlements trade
    act_buy_mill_bread: {
      name: "물레방아 빵 구입 (은화 1)",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, HAMLET_TRADES, { op: "money", min: 1 }] },
      effects: [{ op: "money", add: -1 }, { op: "item", item: "item_mill_bread", add: 1 }, say("txt_buy_mill_bread")]
    },
    act_eat_mill_bread: {
      name: "물레방아 빵을 먹는다",
      requires: { op: "item", item: "item_mill_bread", min: 1 },
      effects: [
        { op: "item", item: "item_mill_bread", add: -1 },
        { op: "hp", add: 2 },
        { op: "resource", resource: "stamina", add: 3 },
        say("txt_eat_mill_bread")
      ]
    },
    act_buy_lantern: {
      name: "등불 구입",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, { op: "money", min: 5 }] },
      effects: [
        { op: "money", add: -5 },
        { op: "item", item: "item_lantern", add: 1 },
        { op: "narrate", textId: "txt_buy_lantern" }
      ]
    },
    // V2-Core-70 (#170): the merchants' price for one the village honoured
    act_buy_lantern_trusted: {
      name: "등불 구입 (마을의 호의, 은화 2)",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, VILLAGE_TRUSTED, { op: "money", min: 2 }] },
      effects: [
        { op: "money", add: -2 },
        { op: "item", item: "item_lantern", add: 1 },
        { op: "narrate", textId: "txt_buy_lantern_trusted" }
      ]
    },
    // V2-Core-70 (#170): the herbalist's salve -- anywhere, while hurt
    act_apply_salve: {
      name: "약초 연고를 바른다",
      requires: { op: "and", of: [{ op: "item", item: "item_herbal_salve", min: 1 }, { op: "lt", left: { hp: "current" }, right: { hp: "max" } }] },
      effects: [{ op: "item", item: "item_herbal_salve", add: -1 }, { op: "hp", add: 5 }, say("txt_apply_salve")]
    },
    // V2-Core-93 (#226): the herbalist's salve closes a road wound (rest restores hp, never the wound)
    act_treat_road_wound: {
      name: "길에서 얻은 상처에 연고를 바른다",
      requires: { op: "and", of: [{ op: "or", of: [ROAD_WOUND, ROAD_WOUND_DEEP] }, { op: "item", item: "item_herbal_salve", min: 1 }] },
      minutes: 30,
      effects: [
        { op: "item", item: "item_herbal_salve", add: -1 },
        { op: "if", when: ROAD_WOUND_DEEP, then: [{ op: "trait", trait: "road_wound_deep", remove: true }, say("txt_treat_deep_wound")], else: [say("txt_treat_road_wound")] },
        { op: "trait", trait: "road_wound", remove: true }
      ]
    },
    // V2-Core-58 (D-87): the sword is sold where the lantern is; wielding it is a choice of its own
    act_buy_iron_sword: {
      name: "철검 구입",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, { op: "money", min: 3 }] },
      effects: [
        { op: "money", add: -3 },
        { op: "item", item: "item_iron_sword", add: 1 },
        { op: "narrate", textId: "txt_buy_iron_sword" }
      ]
    },
    act_equip_iron_sword: {
      name: "철검을 든다",
      requires: {
        op: "and",
        of: [
          { op: "item", item: "item_iron_sword", min: 1 },
          { op: "not", of: { op: "item", item: "item_iron_sword", equipped: true } }
        ]
      },
      effects: [{ op: "equip", item: "item_iron_sword" }, { op: "narrate", textId: "txt_equip_iron_sword" }]
    },
    act_unequip_iron_sword: {
      name: "철검을 내려놓는다",
      requires: { op: "item", item: "item_iron_sword", equipped: true },
      effects: [{ op: "unequip", item: "item_iron_sword" }, { op: "narrate", textId: "txt_unequip_iron_sword" }]
    },
    // V2-Core-94 (#226): wearing the jerkin is a choice of its own, as wielding the sword is
    act_equip_leather_jerkin: {
      name: "가죽 조끼를 입는다",
      requires: { op: "and", of: [{ op: "item", item: "item_leather_jerkin", min: 1 }, { op: "not", of: { op: "item", item: "item_leather_jerkin", equipped: true } }] },
      effects: [{ op: "equip", item: "item_leather_jerkin" }, say("txt_equip_leather_jerkin")]
    },
    act_unequip_leather_jerkin: {
      name: "가죽 조끼를 벗는다",
      requires: { op: "item", item: "item_leather_jerkin", equipped: true },
      effects: [{ op: "unequip", item: "item_leather_jerkin" }, say("txt_unequip_leather_jerkin")]
    },
    // V2-Core-111 (#273): wearing and wielding are choices of their own, as with the jerkin and the iron sword
    act_equip_steel_sword: {
      name: "강철 검을 든다",
      requires: { op: "and", of: [{ op: "item", item: "item_steel_sword", min: 1 }, { op: "not", of: { op: "item", item: "item_steel_sword", equipped: true } }] },
      effects: [{ op: "equip", item: "item_steel_sword" }, say("txt_equip_steel_sword")]
    },
    act_unequip_steel_sword: {
      name: "강철 검을 내려놓는다",
      requires: { op: "item", item: "item_steel_sword", equipped: true },
      effects: [{ op: "unequip", item: "item_steel_sword" }, say("txt_unequip_steel_sword")]
    },
    act_equip_mail_shirt: {
      name: "사슬 갑옷을 입는다",
      requires: { op: "and", of: [{ op: "item", item: "item_mail_shirt", min: 1 }, { op: "not", of: { op: "item", item: "item_mail_shirt", equipped: true } }] },
      effects: [{ op: "equip", item: "item_mail_shirt" }, say("txt_equip_mail_shirt")]
    },
    act_unequip_mail_shirt: {
      name: "사슬 갑옷을 벗는다",
      requires: { op: "item", item: "item_mail_shirt", equipped: true },
      effects: [{ op: "unequip", item: "item_mail_shirt" }, say("txt_unequip_mail_shirt")]
    },
    act_talk_elder: {
      name: "원로와 대화",
      requires: { op: "location", at: "loc_village" },
      showWhenLocked: true,
      effects: [{ op: "choice", choice: "choice_elder_dialogue", sourceId: "act_talk_elder" }]
    },
    act_investigate_ruins: {
      name: "폐허 조사",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_ruins" },
          LIGHT_OR_NIGHT_VISION, // V2-Core-53 (D-82)
          { op: "rumor", rumor: "rum_ruins_secret" }
        ]
      },
      // V2-Core-51: searching the ruins is INT (D-80). V2-Core-52 (D-81): the investigation skill's
      // rank is the bonus (the practice grows the rank; the practice itself adds nothing -- V2-Core-48's
      // direct proficiency bonus is replaced, the same number)
      check: { stat: "int", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 60,
      outcomes: {
        success: [
          { op: "fact", fact: "fact_ruins_secret", set: "bandit_hideout" },
          // observe mode copies the fact set just above as the claim; `confidence`
          // only matters if the claim ever conflicted with a believed one
          { op: "rumor", rumor: "rum_ruins_secret", observe: true, source: "obs_loc_ruins", confidence: 80 },
          { op: "flag", key: "ruins_secret_confirmed", value: true },
          { op: "proficiency", id: "investigation", add: 30 },
          { op: "item", item: "item_relic", add: 1 },
          // V2-Core-44 (D-71 (3) decided): the ruins reveal the membership only while the
          // mystery is open -- once it is resolved (and possibly the bandits dispersed),
          // investigating again does not write the world's history back
          {
            op: "if",
            when: { op: "not", of: { op: "case", case: "case_ruins_mystery", stage: "resolved" } },
            then: [{ op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" }]
          },
          { op: "narrate", textId: "txt_investigate_success" },
          // V2-Core-45: after the dispersal the hideout itself tells what happened -- first-hand,
          // and it corrects a believed legend (higher confidence wins, D-14). Before the dispersal
          // there is no fact to observe, so none of this happens
          { op: "rumor", rumor: "rum_bandits_fate", observe: true, source: "obs_loc_ruins", confidence: 80 },
          {
            op: "if",
            when: { op: "rumor", rumor: "rum_bandits_legend" },
            then: [{ op: "rumor", rumor: "rum_bandits_legend", observe: true, source: "obs_loc_ruins", confidence: 80 }]
          },
          {
            op: "if",
            when: { op: "fact", fact: "fact_bandits_fate", eq: "dispersed" },
            // V2-Core-50: where the leader fell in a fight, the hideout shows it
            then: [
              {
                op: "if",
                when: { op: "alive", subject: "npc_bandit_leader" },
                then: [{ op: "narrate", textId: "txt_hideout_abandoned" }],
                else: [{ op: "narrate", textId: "txt_hideout_after_fight" }]
              }
            ]
          }
        ],
        fail: [
          { op: "proficiency", id: "investigation", add: 10 },
          { op: "narrate", textId: "txt_investigate_fail" }
        ]
      }
    },
    // V2-Core-29: the one recovery action. Only the existing `hp` Effect (positive
    // add, clamped at max HP by the engine); it is a `perform`, so the engine's
    // pending/dead gate rejects it for a dead player -- it can never revive anyone.
    act_rest_village: {
      name: "마을에서 쉬기",
      requires: { op: "location", at: "loc_village" },
      minutes: 60,
      effects: [
        ...REST_HEAL,
        // V2-Core-56 (D-85): the rest refills stamina (the only way back; no regeneration over time)
        { op: "resource", resource: "stamina", add: 6 },
        { op: "narrate", textId: "txt_rest_village" },
        ...REST_WOUNDS
      ]
    },
    act_confront_leader: {
      name: "도적 두목과 대면",
      requires: {
        op: "and",
        of: [
          // V2-Core-35: the character's own proof, not the world's flag
          { op: "item", item: "item_relic", min: 1 },
          { op: "unlock", id: "unl_keen_eye" },
          // V2-Core-50: a fallen leader cannot be confronted
          { op: "alive", subject: "npc_bandit_leader" }
        ]
      },
      showWhenLocked: true,
      // V2-Core-47: opposed by the leader -- 14 + his stat modifier (0 at 10, the old "hard"); a
      // leader with a different stat makes it harder or easier. V2-Core-51 (D-80): pressing him with
      // the evidence is a contest of will and insight, WIS against his WIS
      check: { stat: "wis", tags: ["social"], difficulty: { base: 14, opposed: { subject: "npc_bandit_leader", stat: "wis" } } },
      minutes: 30,
      outcomes: {
        success: [
          { op: "case", case: "case_ruins_mystery", stage: "resolved" },
          { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
          { op: "narrate", textId: "txt_confront_success" },
          // V2-Core-31: only a player who reported to the elder has the village behind them
          {
            op: "if",
            when: { op: "relation", from: "npc_elder", to: "self", tag: "confidant" },
            then: [
              { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
              { op: "narrate", textId: "txt_confront_backed" },
              // V2-Core-32: the organisation is cowed too (its own edge towards the player)
              { op: "relation", from: "org_bandits", to: "self", add: -10, tag: "cowed" }
            ]
          }
        ],
        fail: [
          { op: "relation", from: "npc_bandit_leader", to: "self", add: -20 },
          { op: "narrate", textId: "txt_confront_fail" }
        ]
      }
    },
    // V2-Core-50: the first fight. Where the leader is (his actor's location, D-77), with the
    // character's own proof that the hideout is his, while he lives and the case is open. It
    // opens the fight's choice; each exchange is an option of it (choice_fight_leader)
    act_fight_leader: {
      name: "도적 두목과 싸운다",
      requires: {
        op: "and",
        of: [
          { op: "location", at: "loc_ruins" },
          { op: "location", subject: "npc_bandit_leader", at: "loc_ruins" },
          { op: "item", item: "item_relic", min: 1 },
          { op: "alive", subject: "npc_bandit_leader" },
          { op: "not", of: { op: "case", case: "case_ruins_mystery", stage: "resolved" } }
        ]
      },
      effects: [say("txt_fight_start"), { op: "choice", choice: "choice_fight_leader", sourceId: "act_fight_leader" }]
    }
  },

  // `choose` never carries a targetId (engine.js's resolveChoose builds no
  // targetId into its ctx) -- so unlike act_investigate_ruins/
  // act_confront_leader above, these options give `relation`'s `from`
  // explicitly instead of relying on the "target" default (which would
  // silently resolve to undefined and skip, D-29).
  choices: {
    choice_elder_dialogue: {
      options: [
        {
          id: "opt_ask_ruins",
          name: "폐허에 대해 묻기",
          // V2-Core-55 (D-84): the +5 is for the first telling only -- once per character (their own
          // knowledge), so asking again is not a way to earn trust
          effects: [
            { op: "if", when: { op: "not", of: { op: "rumor", rumor: "rum_ruins_secret" } }, then: [{ op: "relation", from: "npc_elder", add: 5 }] },
            { op: "rumor", rumor: "rum_ruins_secret", source: "npc_elder", confidence: 60 },
            { op: "narrate", textId: "txt_ask_ruins" },
            // V2-Core-68: once he has heard of the arrows, the ruins and the spring are one story to him
            { op: "if", when: ARROWS_TOLD, then: [say("txt_ask_ruins_spring")] }
          ]
        },
        {
          id: "opt_small_talk",
          name: "안부만 묻기",
          // V2-Core-55 (D-84): dialogue only -- repeatable, so it earns no trust
          effects: [
            { op: "narrate", textId: "txt_small_talk" },
            // V2-Core-70: the village remembers whom it honoured -- told to anyone else, a successor too
            { op: "if", when: { op: "and", of: [{ op: "flag", key: "village_honored" }, { op: "not", of: VILLAGE_TRUSTED }] }, then: [say("txt_small_talk_honored_memory")] },
            // V2-Core-103 (#251): the village has heard, late, that a guard did not come back -- told to anyone, a successor too
            { op: "if", when: { op: "flag", key: "guard_fall_word_south" }, then: [say("txt_small_talk_fallen_guard")] }
          ]
        },
        // V2-Core-70 (#170): the elder and the herbalist both trust this character, and both stories are
        // over -- the village's thanks, once (their own edge); the world remembers that someone was honoured
        {
          id: "opt_village_honor",
          name: "마을의 이름으로 감사를 받는다",
          requires: {
            op: "and",
            of: [
              { op: "case", case: "case_ruins_mystery", stage: "resolved" },
              WELL_RESOLVED,
              { op: "relation", from: "npc_elder", to: "self", min: 15 },
              { op: "relation", from: "npc_herbalist", to: "self", min: 15 },
              { op: "not", of: VILLAGE_TRUSTED }
            ]
          },
          effects: [
            { op: "relation", from: "org_village", add: 20, tag: "trusted" },
            { op: "flag", key: "village_honored", value: true },
            say("txt_village_honor")
          ]
        },
        // V2-Core-31: only offered once the investigation is confirmed -- since V2-Core-35
        // by the CHARACTER's own proof (the relic), the same one the confrontation takes.
        // Rejected with requirements_not_met otherwise, leaving the choice pending like any
        // other rejected `choose`.
        {
          id: "opt_report_findings",
          name: "조사에서 알아낸 것을 전한다",
          requires: { op: "item", item: "item_relic", min: 1 },
          // V2-Core-55 (D-84): +10 and the tag once -- reporting again to a confidant earns nothing
          effects: [
            {
              op: "if",
              when: { op: "not", of: { op: "relation", from: "npc_elder", to: "self", tag: "confidant" } },
              then: [{ op: "relation", from: "npc_elder", add: 10, mode: "cooperation", tag: "confidant" }]
            },
            { op: "narrate", textId: "txt_report_findings" }
          ]
        },
        // V2-Core-74 (#180): a letter of passage for the ferry -- from an elder who trusts this character
        {
          id: "opt_elder_letter",
          name: "강을 건널 통행 편지를 청한다",
          requires: {
            op: "and",
            of: [
              { op: "rumor", rumor: "rum_road_ford" },
              { op: "relation", from: "npc_elder", to: "self", min: 15 },
              { op: "not", of: { op: "item", item: "item_passage_letter", min: 1 } }
            ]
          },
          effects: [{ op: "item", item: "item_passage_letter", add: 1 }, say("txt_elder_letter")]
        },
        // V2-Core-73 (#180): the miller's flour, carried to the elder -- trade opens between the two
        // settlements (the world's), +5 on the carrier's own edge
        {
          id: "opt_deliver_flour",
          name: "물레방아 마을의 밀가루를 전한다",
          requires: { op: "and", of: [{ op: "item", item: "item_flour_sack", min: 1 }, { op: "not", of: HAMLET_TRADES }] },
          effects: [
            { op: "item", item: "item_flour_sack", add: -1 },
            { op: "relation", from: "org_mill_hamlet", to: "org_village", tag: "trading" },
            { op: "relation", from: "npc_elder", add: 5 },
            say("txt_deliver_flour")
          ]
        },
        // V2-Core-72 (#180): once the road is open, the elder tells of the region -- told, not seen
        {
          id: "opt_ask_region",
          name: "마을 바깥의 길에 대해 묻는다",
          requires: BANDITS_GONE,
          effects: [
            { op: "rumor", rumor: "rum_road_hamlet", source: "npc_elder", confidence: 60 },
            { op: "rumor", rumor: "rum_road_ford", source: "npc_elder", confidence: 60 },
            say("txt_elder_region")
          ]
        },
        // V2-Core-55 (D-84): the elder's trust (his edge towards this character at 15 or more -- in the
        // canonical play, asking about the ruins and reporting) opens what he knows of the leader: an
        // old wound (a rumor of this character's own), which opens a weaker spot in the fight
        {
          id: "opt_ask_about_leader",
          name: "두목에 대해 더 묻는다",
          requires: { op: "relation", from: "npc_elder", to: "self", min: 15 },
          effects: [
            { op: "rumor", rumor: "rum_leader_old_wound", source: "npc_elder", confidence: 70 },
            { op: "narrate", textId: "txt_leader_old_wound" }
          ]
        },
        // V2-Core-32: only offered while the bandits are cowed AND the leader is still a
        // member (both edges are read with the `relation` Condition). Using it removes
        // the membership, so it cannot be chosen twice; a player whose confrontation the
        // village did not back never sees it.
        // V2-Core-34: reads WORLD state only (a resolved case and the leader's membership
        // edge, neither of which has a character at either end), so it is offered to a
        // successor exactly as it is to the character who made it true.
        {
          id: "opt_ask_bandit_news",
          name: "도적단의 소식을 묻는다",
          requires: {
            op: "and",
            of: [
              { op: "case", case: "case_ruins_mystery", stage: "resolved" },
              { op: "not", of: { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" } }
            ]
          },
          // V2-Core-45: news while it is fresh (about two days), the village's legend afterwards;
          // V2-Core-46: once someone has corrected the legend, the true account again, for anyone
          // V2-Core-55 (D-84): information only (it is repeatable, so it earns no trust)
          effects: [
            {
              op: "if",
              when: {
                op: "and",
                of: [
                  { op: "signal", key: "bandits_tale_age", min: 3 },
                  { op: "not", of: { op: "flag", key: "bandits_tale_corrected" } }
                ]
              },
              then: [
                { op: "rumor", rumor: "rum_bandits_legend", source: "src_village_legend", confidence: 40 },
                { op: "narrate", textId: "txt_bandit_legend" }
              ],
              else: [
                { op: "rumor", rumor: "rum_bandits_fate", source: "npc_elder", confidence: 70 },
                {
                  op: "if",
                  when: { op: "flag", key: "bandits_tale_corrected" },
                  then: [{ op: "narrate", textId: "txt_bandit_news_corrected" }],
                  else: [{ op: "narrate", textId: "txt_bandit_news" }]
                },
                // V2-Core-82 (#198): the north still tells the legend the village has corrected
                { op: "if", when: NORTH_STILL_TELLS("bandits"), then: [say("txt_elder_north_legend")] }
              ]
            },
            ARROWS_IN_THE_ACCOUNT // V2-Core-68
          ]
        },
        // V2-Core-68 (#170): a character who read the arrows tells the elder -- once for the world (the
        // flag), +5 on the teller's own edge
        {
          id: "opt_tell_spring_arrows",
          name: "샘의 짐승에 박힌 도적단의 화살을 전한다",
          requires: { op: "and", of: [{ op: "rumor", rumor: "rum_spring_bandits" }, { op: "not", of: ARROWS_TOLD }] },
          effects: [
            { op: "flag", key: "spring_bandits_told", value: true },
            { op: "relation", from: "npc_elder", add: 5 },
            say("txt_tell_spring_arrows"),
            ARROWS_IN_THE_ACCOUNT
          ]
        },
        // V2-Core-46: the truth a character found becomes something they can act on. Only a
        // character who heard the legend and then saw at the ruins that it was wrong (their
        // legend corrected to "dispersed"; the ruins correct only a legend already heard, and it
        // is told only in the legend's time), while it is uncorrected. It
        // changes the world's record (a world flag), not anyone's knowledge -- the elder tells
        // the true account from then on, to a successor too -- and closes itself
        {
          id: "opt_correct_legend",
          name: "폐허에서 본 것을 바로잡아 전한다",
          requires: {
            op: "and",
            of: [
              { op: "not", of: { op: "flag", key: "bandits_tale_corrected" } },
              { op: "eq", left: { rumor: "rum_bandits_legend" }, right: "dispersed" }
            ]
          },
          effects: [
            { op: "flag", key: "bandits_tale_corrected", value: true },
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "narrate", textId: "txt_correct_legend" }
          ]
        },
        {
          id: "opt_bandits_disperse",
          name: "도적단 잔당의 처분을 원로에게 맡긴다",
          requires: {
            op: "and",
            of: [
              { op: "relation", from: "org_bandits", to: "self", tag: "cowed" },
              { op: "relation", from: "npc_bandit_leader", to: "org_bandits", tag: "member" }
            ]
          },
          effects: [
            { op: "relation", from: "npc_bandit_leader", to: "org_bandits", untag: "member" },
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "narrate", textId: "txt_bandits_disperse" }
          ]
        }
      ]
    },
    // V2-Core-74 (#180): the ferryman -- the outside world's news, the leader's fate, the crossing
    choice_ferryman_dialogue: {
      options: [
        {
          id: "opt_ferryman_news",
          name: "강 건너 소식을 묻는다",
          effects: [
            // the latest the caravans brought
            {
              op: "if",
              when: NEWS("fact_realm_unrest"),
              then: [{ op: "rumor", rumor: "rum_realm_unrest", source: "npc_ferryman", confidence: 60 }, say("txt_ferryman_unrest")],
              else: [
                {
                  op: "if",
                  when: NEWS("fact_realm_fair"),
                  then: [{ op: "rumor", rumor: "rum_realm_fair", source: "npc_ferryman", confidence: 60 }, say("txt_ferryman_fair")],
                  else: [
                    {
                      op: "if",
                      when: NEWS("fact_realm_levy"),
                      then: [{ op: "rumor", rumor: "rum_realm_levy", source: "npc_ferryman", confidence: 60 }, say("txt_ferryman_levy")],
                      else: [say("txt_ferryman_quiet")]
                    }
                  ]
                }
              ]
            },
            // the leader's fate, as the river saw it
            {
              op: "if",
              when: LEADER_LIVES,
              then: [
                { op: "fact", fact: "fact_leader_crossed", set: "far_bank" },
                { op: "rumor", rumor: "rum_leader_crossed", source: "npc_ferryman", confidence: 70 },
                say("txt_ferryman_scarred_man")
              ],
              else: [say("txt_ferryman_leader_fell")]
            },
            // V2-Core-82 (#198): the echo -- what the castle town says of the frontier, back with the caravans
            {
              op: "if",
              when: NORTH_TALK_BACK,
              then: [
                NORTH_ECHO("bandits", "rum_bandits_fate", "rum_bandits_legend", "txt_ferryman_north_bandits_truth", "txt_ferryman_north_bandits_tale"),
                NORTH_ECHO("well", "rum_well_fate", "rum_well_legend", "txt_ferryman_north_well_truth", "txt_ferryman_north_well_tale")
              ]
            }
          ]
        },
        {
          id: "opt_ferryman_cross",
          name: "강을 건넌다 (뱃삯 은화 3)",
          requires: { op: "and", of: [{ op: "money", min: 3 }, { op: "not", of: { op: "item", item: "item_passage_letter", min: 1 } }] },
          minutes: 30,
          effects: [{ op: "money", add: -3 }, { op: "move", to: "loc_far_bank" }, say("txt_ferryman_cross")]
        },
        {
          id: "opt_ferryman_cross_letter",
          name: "원로의 통행 편지를 보이고 강을 건넌다",
          requires: { op: "item", item: "item_passage_letter", min: 1 },
          minutes: 30,
          effects: [{ op: "move", to: "loc_far_bank" }, say("txt_ferryman_cross_letter")]
        }
      ]
    },
    // V2-Core-73 (#180): the miller of the hamlet
    // V2-Core-77 (#189): the castle town's market -- the same goods are worth differently here (World Bible
    // W-04/W-05, Draft working assumptions; the prices are gameplay values, the merchant's reasons his claim)
    choice_town_merchant_dialogue: {
      options: [
        {
          id: "opt_town_merchant_ask",
          name: "강 남쪽 물건에 대해 묻는다",
          effects: [
            say("txt_town_merchant_south_goods"),
            // V2-Core-85 (#207): whether the town wants flour now
            {
              op: "if",
              when: HAMLET_TRADES,
              then: [
                { op: "if", when: { op: "signal", key: "town_flour_wanted", min: 1 }, then: [say("txt_town_merchant_flour_wanted")], else: [say("txt_town_merchant_flour_enough")] },
                // V2-Core-86 (#207): and why it is dear now
                { op: "if", when: FAIR_TIME, then: [say("txt_town_merchant_flour_fair")] }
              ]
            }
          ]
        },
        {
          id: "opt_town_merchant_sell_herb",
          name: "정화초를 판다 (은화 4)",
          requires: { op: "item", item: "item_purifying_herb", min: 1 },
          effects: [{ op: "item", item: "item_purifying_herb", add: -1 }, { op: "money", add: 4 }, say("txt_town_merchant_buy_herb")]
        },
        {
          id: "opt_town_merchant_buy_sword",
          name: "철검을 산다 (은화 2)",
          requires: { op: "money", min: 2 },
          effects: [{ op: "money", add: -2 }, { op: "item", item: "item_iron_sword", add: 1 }, say("txt_town_merchant_sell_sword")]
        },
        // V2-Core-94 (#226): a jerkin for the road -- one is enough
        {
          id: "opt_town_merchant_buy_jerkin",
          name: "가죽 조끼를 산다 (은화 3)",
          requires: { op: "and", of: [{ op: "money", min: 3 }, { op: "not", of: { op: "item", item: "item_leather_jerkin", min: 1 } }] },
          effects: [{ op: "money", add: -3 }, { op: "item", item: "item_leather_jerkin", add: 1 }, say("txt_town_merchant_sell_jerkin")]
        },
        // V2-Core-111 (#273): what silver buys -- steel and mail, one of each is enough
        {
          id: "opt_town_merchant_buy_steel_sword",
          name: "강철 검을 산다 (은화 24)",
          requires: { op: "and", of: [{ op: "money", min: 24 }, { op: "not", of: { op: "item", item: "item_steel_sword", min: 1 } }] },
          effects: [{ op: "money", add: -24 }, { op: "item", item: "item_steel_sword", add: 1 }, say("txt_town_merchant_sell_steel_sword")]
        },
        {
          id: "opt_town_merchant_buy_mail_shirt",
          name: "사슬 갑옷을 산다 (은화 48)",
          requires: { op: "and", of: [{ op: "money", min: 48 }, { op: "not", of: { op: "item", item: "item_mail_shirt", min: 1 } }] },
          effects: [{ op: "money", add: -48 }, { op: "item", item: "item_mail_shirt", add: 1 }, say("txt_town_merchant_sell_mail_shirt")]
        },
        // V2-Core-84 (#207): frontier flour sells in the town too (World Bible WB-0022 DC-06) -- the hamlet's
        // trade flour only (an errand's sack for the elder exists only before the settlements trade)
        {
          id: "opt_town_merchant_sell_flour",
          name: "밀가루 자루를 판다 (은화 4)",
          requires: { op: "and", of: [HAMLET_TRADES, { op: "item", item: "item_flour_sack", min: 1 }, { op: "signal", key: "town_flour_wanted", min: 1 }, { op: "not", of: FAIR_TIME }] },
          effects: [{ op: "item", item: "item_flour_sack", add: -1 }, { op: "money", add: 4 }, { op: "signal", key: "town_flour_wanted", add: -1 }, say("txt_town_merchant_buy_flour")]
        },
        // V2-Core-86 (#207): the fair's price -- the same want, the same sack, more silver
        {
          id: "opt_town_merchant_sell_flour_fair",
          name: "밀가루 자루를 판다 (은화 6)",
          requires: { op: "and", of: [HAMLET_TRADES, { op: "item", item: "item_flour_sack", min: 1 }, { op: "signal", key: "town_flour_wanted", min: 1 }, FAIR_TIME] },
          effects: [{ op: "item", item: "item_flour_sack", add: -1 }, { op: "money", add: 6 }, { op: "signal", key: "town_flour_wanted", add: -1 }, say("txt_town_merchant_buy_flour_fair")]
        }
      ]
    },
    // V2-Core-78 (#189): the caravan guard (World Bible WB-0021) -- STR with swordsmanship, 2 stamina whatever
    // comes of it; the escort goes south with the caravan and ends at the far bank. One guard per caravan
    // (GUARD_WANTED); pay, difficulty and costs are gameplay values
    choice_guild_clerk_dialogue: {
      // V2-Core-126 (#309): what this choice bears on, for the knowledge list (UI metadata; the engine does not read it)
      relevantFacts: ["fact_road_north"],
      options: [
        {
          id: "opt_guild_clerk_ask",
          name: "일거리를 묻는다",
          effects: [
            { op: "if", when: GUARD_WANTED, then: [say("txt_guild_clerk_work")], else: [say("txt_guild_clerk_no_work")] },
            // V2-Core-92 (#226): a guard the guild knows
            { op: "if", when: GUILD_KNOWS, then: [say("txt_guild_clerk_knows_you")] },
            // V2-Core-108 (#265): the caravans that did not wait
            { op: "if", when: { op: "and", of: [GUARD_WANTED, { op: "signal", key: "caravans_unguarded", min: 1 }] }, then: [say("txt_guild_clerk_left_without")] },
            // V2-Core-106 (#258): and where a guard has fallen, the careful way
            { op: "if", when: { op: "and", of: [GUARD_WANTED, { op: "signal", key: "guards_fallen", min: 1 }] }, then: [say("txt_guild_clerk_careful_offer")] },
            // V2-Core-123 (#302): and where a guard came back maimed but none has fallen, the same way, said otherwise
            { op: "if", when: { op: "and", of: [GUARD_WANTED, { op: "signal", key: "guards_maimed", min: 1 }, { op: "not", of: { op: "signal", key: "guards_fallen", min: 1 } }] }, then: [say("txt_guild_clerk_careful_offer_maimed")] },
            // V2-Core-105 (#258): a guard whose practice is full is offered the lead of the convoy
            { op: "if", when: { op: "and", of: [GUARD_WANTED, { op: "unlock", id: "unl_road_lead" }, { op: "not", of: ROAD_WOUND_DEEP }] }, then: [say("txt_guild_clerk_lead_offer")] },
            { op: "if", when: DANGER_OPEN, then: [say("txt_guild_clerk_danger_offer")] },
            // V2-Core-102 (#251): what the guild remembers of the guards who did not come back -- told to any guard
            { op: "if", when: { op: "signal", key: "guards_fallen", min: 1 }, then: [say("txt_guild_clerk_fallen")] },
            // V2-Core-123 (#302): and of the guards who came back with a wound that would not close -- told to any guard
            { op: "if", when: { op: "signal", key: "guards_maimed", min: 1 }, then: [say("txt_guild_clerk_maimed")] },
            // V2-Core-114 (#280): and what the guild kept of what they carried
            { op: "if", when: { op: "or", of: [{ op: "signal", key: "kit_steel", min: 1 }, { op: "signal", key: "kit_mail", min: 1 }] }, then: [say("txt_guild_clerk_kit_offer")] },
            // V2-Core-118 (#291): and what the guild kept of what they carried in silver
            { op: "if", when: { op: "signal", key: "estate_held", min: 1 }, then: [say("txt_guild_clerk_estate_offer")] },
            // V2-Core-125 (#307, Road News step 1a): the road's condition -- the exact word from the guild's ledger for a guard
            // the guild knows (10), the yard's talk (quiet or unsettled, nothing finer) for anyone else
            {
              op: "if",
              when: GUILD_KNOWS,
              then: [ROAD_NEWS("npc_guild_clerk", 80), byRoad([say("txt_guild_clerk_road_quiet")], [say("txt_guild_clerk_road_uneasy")], [say("txt_guild_clerk_road_dangerous")])],
              else: [
                {
                  op: "if",
                  when: { op: "signal", key: "road_trouble", min: 1 },
                  then: [{ op: "rumor", rumor: "rum_road_talk_unsettled", source: "src_guild_hall_talk", confidence: 40 }, say("txt_guild_yard_road_unsettled")],
                  else: [{ op: "rumor", rumor: "rum_road_talk_quiet", source: "src_guild_hall_talk", confidence: 40 }, say("txt_guild_yard_road_quiet")]
                },
                say("txt_guild_clerk_road_for_known")
              ]
            },
            // V2-Core-97 (#237): the clerk sizes up a guard before the road -- what the player can judge by; the risk
            // itself is unchanged (a failed escort costs 3 hp and may wound; the danger job, since V2-Core-125, what the road does)
            {
              op: "if",
              when: GUARD_WANTED,
              then: [
                { op: "if", when: { op: "lte", left: { hp: "current" }, right: 3 }, then: [say("txt_guild_clerk_too_hurt")] },
                { op: "if", when: ROAD_WOUND_DEEP, then: [say("txt_guild_clerk_sees_deep_wound")], else: [{ op: "if", when: ROAD_WOUND, then: [say("txt_guild_clerk_sees_wound")] }] },
                { op: "if", when: { op: "and", of: [ROAD_WOUND_DEEP, { op: "unlock", id: "unl_road_lead" }] }, then: [say("txt_guild_clerk_deep_closes_lead")] },
                { op: "if", when: { op: "not", of: { op: "or", of: [{ op: "item", item: "item_leather_jerkin", equipped: true }, { op: "item", item: "item_mail_shirt", equipped: true }] } }, then: [say("txt_guild_clerk_no_leather")] }
              ]
            }
          ]
        },
        {
          id: "opt_guild_clerk_escort",
          name: "상단 호위를 맡는다",
          requires: { op: "and", of: [GUARD_WANTED, STAMINA_AT_LEAST(2)] },
          check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "normal" },
          minutes: 720,
          // V2-Core-99 (#244): the practice that ranks swordsmanship is `combat` (D-81). Until now this wrote
          // `swordsmanship` -- the skill's name, a proficiency with no definition -- so the road taught nothing.
          outcomes: payStamina(2, {
            great: GUARD_PAID(6, [{ op: "proficiency", id: "combat", add: 10 }, say("txt_escort_great"), ...GUILD_REMEMBERS]),
            success: GUARD_PAID(4, [{ op: "proficiency", id: "combat", add: 10 }, say("txt_escort_success"), ...GUILD_REMEMBERS]),
            fail: GUARD_PAID(1, [
              { op: "hp", add: -3 },
              { op: "proficiency", id: "combat", add: 5 },
              say("txt_escort_fail"),
              // V2-Core-93 (#226): and a wound that rest does not close
              ...WOUND_ON_FAIL
            ])
          })
        },
        // V2-Core-105 (#258): the road's top job, for a guard whose practice is full (`unl_road_lead`): the same check
        // and the same road, but the guard leads the convoy -- more stamina (3), more pay, and the guild's regard
        // grows twice as fast. The fail costs what the ordinary escort's does
        {
          id: "opt_guild_clerk_escort_lead",
          name: "상단 호위를 이끈다",
          requires: { op: "and", of: [GUARD_WANTED, { op: "unlock", id: "unl_road_lead" }, { op: "not", of: ROAD_WOUND_DEEP }, STAMINA_AT_LEAST(3)] },
          check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "normal" },
          minutes: 720,
          outcomes: payStamina(3, {
            great: GUARD_PAID(8, [say("txt_lead_great"), ...LEAD_REMEMBERS]),
            success: GUARD_PAID(6, [say("txt_lead_success"), ...LEAD_REMEMBERS]),
            fail: GUARD_PAID(2, [
              { op: "hp", add: -3 },
              say("txt_lead_fail"),
              ...WOUND_ON_FAIL
            ])
          })
        },
        // V2-Core-114 (#280): the fallen's kit, held by the guild and let go at half the merchant's price to a guard who
        // does not already own that kind -- the clerk's own, since the guild kept it
        {
          id: "opt_guild_clerk_fallen_steel",
          name: "쓰러진 호위가 남긴 강철 검을 받는다 (은화 12)",
          requires: { op: "and", of: [{ op: "signal", key: "kit_steel", min: 1 }, { op: "money", min: 12 }, { op: "not", of: { op: "item", item: "item_steel_sword", min: 1 } }] },
          effects: [{ op: "signal", key: "kit_steel", add: -1 }, { op: "money", add: -12 }, { op: "item", item: "item_steel_sword", add: 1 }, say("txt_guild_clerk_kit_steel")]
        },
        {
          id: "opt_guild_clerk_fallen_mail",
          name: "쓰러진 호위가 남긴 사슬 갑옷을 받는다 (은화 24)",
          requires: { op: "and", of: [{ op: "signal", key: "kit_mail", min: 1 }, { op: "money", min: 24 }, { op: "not", of: { op: "item", item: "item_mail_shirt", min: 1 } }] },
          effects: [{ op: "signal", key: "kit_mail", add: -1 }, { op: "money", add: -24 }, { op: "item", item: "item_mail_shirt", add: 1 }, say("txt_guild_clerk_kit_mail")]
        },
        // V2-Core-118 (#291, WB-0027): the share the guild holds of a fallen guard's purse, found and claimed -- the clerk's
        // own, free, up to twelve a claim (what is left is claimed with the next ask); never handed over by itself
        {
          id: "opt_guild_clerk_estate",
          name: "조합이 맡아 둔 몫을 찾아간다",
          requires: { op: "signal", key: "estate_held", min: 1 },
          effects: [...ESTATE_CLAIM_TIERS, say("txt_guild_clerk_estate")]
        },
        // V2-Core-112 (#275, RPG Depth 4 step 2): the hard convoy, above the lead job -- for a lead-holder in steel or mail.
        // A hard check (a +3 guard fails it as often as an ungeared one fails an ordinary escort), the lead's stamina, and
        // 14/10/2 against the lead's 8/6/2: measured +17% silver a job for about +8 points of partial-or-fail (#275)
        {
          id: "opt_guild_clerk_escort_danger",
          name: "위험한 상단 호위를 이끈다",
          requires: DANGER_OPEN,
          check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "hard" },
          minutes: 720,
          outcomes: payStamina(3, {
            great: GUARD_PAID(14, [say("txt_danger_great"), DANGER_ROAD_BONUS, ...LEAD_REMEMBERS]),
            success: GUARD_PAID(10, [say("txt_danger_success"), DANGER_ROAD_BONUS, ...LEAD_REMEMBERS]),
            // V2-Core-125 (#307): the hard convoy takes the road's condition hardest (2 / 4 / 7)
            fail: GUARD_PAID(2, [
              ROAD_HURT(2, 4, 7),
              say("txt_danger_fail"),
              ...WOUND_ON_FAIL
            ])
          })
        },
        // V2-Core-106 (#258): a choice only a world that remembers offers (`guards_fallen`, V2-Core-102; since V2-Core-123 also
        // `guards_maimed`: a guard came back with a wound that would not close). The careful way: an easier check and a
        // failure that costs nothing (no hp, no wound), for a whole day on the road instead of half and a smaller purse. It is
        // the world's memory, not the character's: anyone is offered it, a successor too, and a world where no known guard has
        // fallen or been maimed never offers it
        {
          id: "opt_guild_clerk_escort_careful",
          name: "길을 조심스레 간다",
          requires: { op: "and", of: [GUARD_WANTED, { op: "or", of: [{ op: "signal", key: "guards_fallen", min: 1 }, { op: "signal", key: "guards_maimed", min: 1 }] }, STAMINA_AT_LEAST(2)] },
          check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "easy" },
          minutes: 1440,
          outcomes: payStamina(2, {
            great: GUARD_PAID(4, [{ op: "proficiency", id: "combat", add: 10 }, say("txt_careful_great"), ...GUILD_REMEMBERS]),
            success: GUARD_PAID(3, [{ op: "proficiency", id: "combat", add: 10 }, say("txt_careful_success"), ...GUILD_REMEMBERS]),
            fail: GUARD_PAID(1, [{ op: "proficiency", id: "combat", add: 5 }, say("txt_careful_fail")])
          })
        }
      ]
    },
    choice_miller_dialogue: {
      options: [
        {
          id: "opt_miller_news",
          name: "이 근방의 소식을 묻는다",
          effects: [
            say("txt_miller_news"),
            // the leader's fate, as the region tells it
            { op: "if", when: LEADER_LIVES, then: [say("txt_miller_news_scarred_man")], else: [say("txt_miller_news_leader_fell")] },
            // one the village honoured is known here -- greeted once (his `welcomed` tag on his edge)
            {
              op: "if",
              when: { op: "and", of: [VILLAGE_TRUSTED, { op: "not", of: { op: "relation", from: "npc_miller", to: "self", tag: "welcomed" } }] },
              then: [{ op: "relation", from: "npc_miller", add: 5, tag: "welcomed" }, say("txt_miller_welcome")]
            },
            { op: "if", when: HAMLET_TRADES, then: [say("txt_miller_trade_running")] },
            // V2-Core-85 (#207): the day's flour to spare already gone
            { op: "if", when: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "mill_flour_stock", max: 0 }] }, then: [say("txt_miller_flour_gone")] }
          ]
        },
        {
          id: "opt_miller_sell_herb",
          name: "정화초를 판다 (은화 2)",
          requires: { op: "item", item: "item_purifying_herb", min: 1 },
          effects: [{ op: "item", item: "item_purifying_herb", add: -1 }, { op: "money", add: 2 }, say("txt_miller_buy_herb")]
        },
        // while the settlements do not trade: a sack of flour for the elder (one in hand at a time)
        {
          id: "opt_miller_flour",
          name: "원로에게 밀가루를 전해 주겠다고 한다",
          requires: { op: "and", of: [{ op: "not", of: HAMLET_TRADES }, { op: "not", of: { op: "item", item: "item_flour_sack", min: 1 } }] },
          effects: [{ op: "item", item: "item_flour_sack", add: 1 }, say("txt_miller_flour")]
        },
        // V2-Core-84 (#207): once the settlements trade, the mill has flour to spare for the road north
        {
          id: "opt_miller_buy_flour",
          name: "밀가루 자루를 산다 (은화 2)",
          requires: { op: "and", of: [HAMLET_TRADES, { op: "money", min: 2 }, { op: "signal", key: "mill_flour_stock", min: 1 }] },
          effects: [{ op: "money", add: -2 }, { op: "item", item: "item_flour_sack", add: 1 }, { op: "signal", key: "mill_flour_stock", add: -1 }, say("txt_miller_sell_flour")]
        }
      ]
    },
    // V2-Core-64 (#160): the herbalist. Asking about the sickness tells where the water comes from;
    // the +5 is once (her `consulted` tag on her edge towards this character, D-84's pattern)
    choice_herbalist_dialogue: {
      options: [
        {
          id: "opt_herbalist_ask_sickness",
          name: "마을의 배앓이에 대해 묻는다",
          effects: [
            {
              op: "if",
              when: { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "consulted" } },
              then: [{ op: "relation", from: "npc_herbalist", add: 5, tag: "consulted" }]
            },
            { op: "rumor", rumor: "rum_well_source", source: "npc_herbalist", confidence: 50 },
            // V2-Core-66: once the spring is purified she tells that the sickness has passed
            {
              op: "if",
              when: WELL_RESOLVED,
              // V2-Core-69: news while it is fresh, the market's legend afterwards, the truth once corrected
              then: [
                {
                  op: "if",
                  when: WELL_LEGEND_TIME,
                  then: [{ op: "rumor", rumor: "rum_well_legend", source: "src_market_legend", confidence: 40 }, say("txt_herbalist_well_legend")],
                  else: [
                    { op: "rumor", rumor: "rum_well_fate", source: "npc_herbalist", confidence: 70 },
                    { op: "if", when: { op: "flag", key: "well_tale_corrected" }, then: [say("txt_herbalist_well_corrected")], else: [say("txt_herbalist_sickness_passed")] },
                    // V2-Core-82 (#198): the north still tells the legend the market has corrected
                    { op: "if", when: NORTH_STILL_TELLS("well"), then: [say("txt_herbalist_north_legend")] }
                  ]
                }
              ],
              else: [say("txt_herbalist_sickness")]
            },
            // V2-Core-68: the village's account reaches her stall too
            { op: "if", when: ARROWS_TOLD, then: [say("txt_herbalist_bandit_rumor")] }
          ]
        },
        { id: "opt_herbalist_small_talk", name: "약초 이야기만 나눈다", effects: [say("txt_herbalist_small_talk")] },
        // V2-Core-65 (#160): once, for 2 silver, to a character she has talked with (her `taught` tag
        // closes it); +20 herbalism practice -- the first rank
        {
          id: "opt_herbalist_teach",
          name: "약초 고르는 법을 배운다 (은화 2)",
          requires: {
            op: "and",
            of: [
              { op: "relation", from: "npc_herbalist", to: "self", tag: "consulted" },
              { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "taught" } },
              { op: "money", min: 2 }
            ]
          },
          effects: [
            { op: "money", add: -2 },
            { op: "relation", from: "npc_herbalist", tag: "taught" },
            { op: "proficiency", id: "herbalism", add: 20 },
            say("txt_herbalist_teach")
          ]
        },
        // V2-Core-65 (#160): two herbs make one remedy
        {
          id: "opt_herbalist_brew",
          name: "정화초로 정화제를 달여 달라고 한다",
          requires: { op: "item", item: "item_purifying_herb", min: 2 },
          effects: [
            { op: "item", item: "item_purifying_herb", add: -2 },
            { op: "item", item: "item_spring_remedy", add: 1 },
            say("txt_herbalist_brew")
          ]
        },
        // V2-Core-66 (#160): only the character who purified the spring (her `purifier` tag on her
        // edge towards them), once (`thanked`)
        {
          id: "opt_herbalist_report_spring",
          name: "샘을 정화했다고 전한다",
          requires: {
            op: "and",
            of: [
              { op: "relation", from: "npc_herbalist", to: "self", tag: "purifier" },
              { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "thanked" } }
            ]
          },
          effects: [{ op: "relation", from: "npc_herbalist", add: 10, tag: "thanked" }, say("txt_herbalist_thanks")]
        },
        // V2-Core-69 (#170): a character who heard the legend and saw the truth at the spring (their
        // legend corrected to "purified") tells her, once for the world; +5 on their own edge
        {
          id: "opt_herbalist_correct_legend",
          name: "샘에서 본 것을 바로잡아 전한다",
          requires: {
            op: "and",
            of: [
              { op: "not", of: { op: "flag", key: "well_tale_corrected" } },
              { op: "eq", left: { rumor: "rum_well_legend" }, right: "purified" }
            ]
          },
          effects: [
            { op: "flag", key: "well_tale_corrected", value: true },
            { op: "relation", from: "npc_herbalist", add: 5 },
            say("txt_herbalist_correct_legend")
          ]
        },
        // V2-Core-70 (#170): two purifying herbs for her stock -- +10 once (`helped`)
        {
          id: "opt_herbalist_give_herbs",
          name: "정화초 두 묶음을 나눠 준다",
          requires: {
            op: "and",
            of: [
              { op: "item", item: "item_purifying_herb", min: 2 },
              { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "helped" } }
            ]
          },
          effects: [
            { op: "item", item: "item_purifying_herb", add: -2 },
            { op: "relation", from: "npc_herbalist", add: 10, tag: "helped" },
            say("txt_herbalist_given_herbs")
          ]
        },
        // V2-Core-70 (#170): her salve -- 3 silver to one she has talked with, 1 to one the village honoured
        {
          id: "opt_herbalist_buy_salve",
          name: "약초 연고를 산다 (은화 3)",
          requires: {
            op: "and",
            of: [{ op: "relation", from: "npc_herbalist", to: "self", tag: "consulted" }, { op: "not", of: VILLAGE_TRUSTED }, { op: "money", min: 3 }]
          },
          effects: [{ op: "money", add: -3 }, { op: "item", item: "item_herbal_salve", add: 1 }, say("txt_herbalist_salve")]
        },
        {
          id: "opt_herbalist_buy_salve_trusted",
          name: "약초 연고를 산다 (마을의 호의, 은화 1)",
          requires: { op: "and", of: [VILLAGE_TRUSTED, { op: "money", min: 1 }] },
          effects: [{ op: "money", add: -1 }, { op: "item", item: "item_herbal_salve", add: 1 }, say("txt_herbalist_salve_trusted")]
        }
      ]
    },
    // V2-Core-50: one exchange of the fight per choice. Each is an opposed check against the
    // leader (V2-Core-51, D-80: the strike STR against his STR, the counter DEX against his DEX)
    // with the combat proficiency; the tier
    // decides who is hit (fightExchange above). No resource cost (Gate 4 = C)
    choice_fight_leader: {
      options: [
        {
          id: "opt_fight_strike",
          name: "정면으로 맞붙는다",
          check: STRIKE_CHECK(11),
          minutes: 5,
          outcomes: STRIKE_OUTCOMES
        },
        // V2-Core-55 (D-84): the old wound the elder told of -- the strike's blow at an easier mark
        {
          id: "opt_fight_weak_spot",
          name: "그의 오래된 상처를 노린다",
          // V2-Core-56 (D-85): 2 stamina
          requires: { op: "and", of: [{ op: "rumor", rumor: "rum_leader_old_wound" }, STAMINA_AT_LEAST(2)] },
          check: STRIKE_CHECK(9),
          minutes: 5,
          outcomes: payStamina(2, STRIKE_OUTCOMES)
        },
        // V2-Core-58 (D-87): with the iron sword in hand -- the strike's blow at an easier mark (10).
        // Unequipped, it is not offered: what is wielded, not what is owned, decides
        {
          id: "opt_fight_sword_cut",
          name: "철검으로 베어 든다",
          requires: { op: "item", item: "item_iron_sword", equipped: true },
          check: STRIKE_CHECK(10),
          minutes: 5,
          outcomes: STRIKE_OUTCOMES
        },
        // the technique: only for a character whose keen eye reads the leader's attacks
        {
          id: "opt_fight_counter",
          name: "그의 공격을 읽고 받아친다",
          // V2-Core-56 (D-85): 3 stamina
          requires: { op: "and", of: [{ op: "unlock", id: "unl_keen_eye" }, STAMINA_AT_LEAST(3)] },
          check: { stat: "dex", skill: "swordsmanship", tags: ["combat"], difficulty: FIGHT_DIFFICULTY(12, "dex") },
          minutes: 5,
          outcomes: payStamina(3, {
            great: fightExchange([hitLeader(-10), say("txt_fight_counter_great")]),
            success: fightExchange([hitLeader(-7), say("txt_fight_counter_hit")]),
            partial: fightExchange([hitSelf(-1), say("txt_fight_counter_graze")]),
            fail: fightExchange([leaderHits(4), say("txt_fight_counter_miss")])
          })
        },
        // breaking off: back to the village; the leader lives, keeps his wounds and remembers
        {
          id: "opt_fight_flee",
          name: "물러서서 달아난다",
          minutes: 45,
          effects: [
            { op: "relation", from: "npc_bandit_leader", to: "self", add: -10 },
            { op: "move", to: "loc_village" },
            say("txt_fight_flee")
          ]
        }
      ]
    }
  },

  growthSystems: {
    growth_wanderer: {
      id: "growth_wanderer",
      // V2-Core-51 (D-80): the fantasy prototype's common stats. Read by checks today: INT (the
      // investigation), WIS (the confrontation), STR (the strike), DEX (the counter); since V2-Core-64 PER
      // (the well, the spring) and CON (the miasma). No derived values: HP is not computed from CON
      stats: [
        { id: "str", min: 0, max: 20, base: 8 },
        { id: "dex", min: 0, max: 20, base: 8 },
        { id: "con", min: 0, max: 20, base: 8 },
        { id: "int", min: 0, max: 20, base: 8 },
        { id: "wis", min: 0, max: 20, base: 8 },
        { id: "per", min: 0, max: 20, base: 8 }
      ],
      // V2-Core-52 (Skill Decision = A, D-81): practice (a proficiency: how much one has practised)
      // grows a skill (what one can do) at thresholds; checks read only the skill's rank. No
      // `checkStep`: practice is never a bonus by itself, so it is never counted twice. A rank at
      // every 20 points (+1 per rank) keeps every check's number: rank = floor(points / 20)
      proficiencies: [
        {
          id: "investigation",
          max: 100,
          thresholds: [
            ...rankUps("investigation"),
            { at: 50, effects: [{ op: "unlock", id: "unl_keen_eye" }] }
          ]
        },
        // V2-Core-50: grown by every exchange of a fight; V2-Core-52: it grows swordsmanship
        // V2-Core-105 (#258): the last of the practice opens the road's top job (the `unl_keen_eye` pattern: a
        // threshold, an unlock, an option that asks for it). Thresholds fire only on crossing: a save already past 100 has none
        { id: "combat", max: 100, thresholds: [...rankUps("swordsmanship"), { at: 100, effects: [{ op: "unlock", id: "unl_road_lead" }] }] },
        // V2-Core-65 (#160): grown by gathering herbs and the herbalist's lesson
        { id: "herbalism", max: 100, thresholds: rankUps("herbalism") }
      ],
      skills: [
        { id: "swordsmanship", maxRank: 5, checkBonusPerRank: 1 },
        { id: "investigation", maxRank: 5, checkBonusPerRank: 1 },
        { id: "herbalism", maxRank: 5, checkBonusPerRank: 1 }
      ],
      // V2-Core-53 (D-82): a trait that changes a rule (the ruins' light requirement), no modifier.
      // V2-Core-57 (D-86, #147 Phase A): a talent is a trait with `practice` -- every investigation
      // practice gain of whoever holds it is 2 more (observing 17, a search 32 / 12); no modifier
      traits: [
        { id: "night_vision" },
        { id: "investigation_talent", practice: { investigation: 2 } },
        // V2-Core-93 (#226): a wound a hard road leaves -- it weighs on every combat check until treated
        { id: "road_wound", modifiers: [{ tags: ["combat"], value: -2 }] },
        // V2-Core-121 (#298): a deep wound weighs on every combat check as well (on top of the mild one it comes with)
        { id: "road_wound_deep", modifiers: [{ tags: ["combat"], value: -1 }] }
      ],
      // V2-Core-53 (D-82): Mastery is a label over the skill rank, for display and classification
      // only -- read by the UI, never by the engine (no state, no modifier). English names, so they
      // never read as the UI's "숙련도" (the practice)
      masteryTiers: [
        { minRank: 0, label: "Untrained" },
        { minRank: 1, label: "Novice" },
        { minRank: 3, label: "Apprentice" },
        { minRank: 5, label: "Adept" }
      ],
      unlocks: [{ id: "unl_keen_eye", kind: "action" }, { id: "unl_road_lead", kind: "action" }],
      // V2-Core-56 (Gate 4 = C, D-85): resources belong to the growth system. Stamina pays for the
      // fight's techniques (the counter 3, the old wound 2); a character without the entry is full
      resources: [{ id: "stamina", max: 6 }]
    }
  },

  items: {
    item_lantern: { name: "낡은 등불", modifiers: [{ tags: ["investigation"], value: 1 }] },
    item_relic: { name: "폐허의 유물" },
    // V2-Core-58 (D-87, #147 Phase B): equipment -- an item with a slot. It counts only while
    // equipped (the lantern and the relic have no slot: held is enough, D-10). No modifier: what
    // wielding it changes is a technique (choice_fight_leader.opt_fight_sword_cut)
    item_iron_sword: { name: "철검", slot: "hand" },
    // V2-Core-94 (#226): gear for the road -- worn, it steadies every combat check (counts only while equipped)
    item_leather_jerkin: { name: "가죽 조끼", slot: "body", modifiers: [{ tags: ["combat"], value: 1 }] },
    // V2-Core-111 (#273, RPG Depth 4): what silver buys -- steel in the hand slot (replaces the iron sword, and so its
    // fight technique) and mail in the body slot (replaces the jerkin). Each +1 is about 8 points less partial-or-fail
    // for an honest guard (measured, #272): prices are gameplay values (R-29)
    item_steel_sword: { name: "강철 검", slot: "hand", modifiers: [{ tags: ["combat"], value: 1 }] },
    item_mail_shirt: { name: "사슬 갑옷", slot: "body", modifiers: [{ tags: ["combat"], value: 2 }] },
    // V2-Core-65 (#160): what the spring's remedy is made of, and the remedy
    item_purifying_herb: { name: "정화초" },
    item_spring_remedy: { name: "샘 정화제" },
    // V2-Core-70 (#170): the herbalist's salve (+5 HP)
    item_herbal_salve: { name: "약초 연고" },
    // V2-Core-73 (#180): the hamlet's goods
    item_flour_sack: { name: "밀가루 자루" },
    item_mill_bread: { name: "물레방아 빵" },
    // V2-Core-74 (#180): the elder's letter for the ferry (kept, not spent)
    item_passage_letter: { name: "원로의 통행 편지" }
  },

  // `initial` is seeded by createInitialState since V2-Core-43 (D-76): every new
  // game starts with this fact at "unknown". Nothing reads that value; the truth
  // is set by act_investigate_ruins's own `fact` Effect, as before.
  facts: {
    fact_ruins_secret: { initial: "unknown" },
    // V2-Core-45: what really happened to the bandits -- set by evt_bandits_tale, never in the view
    fact_bandits_fate: {},
    // V2-Core-55: the leader's old wound -- only ever told (nothing sets it)
    fact_leader_wound: {},
    // V2-Core-64 (#160): no `initial` (a 0.3.0 save would not have it) -- set where it is found
    fact_well_source: {},
    fact_spring_cause: {},
    // V2-Core-68 (#170): whose arrows were in the carcass -- set where it is handled
    fact_spring_fouler: {},
    // V2-Core-69 (#170): what happened to the spring -- set by evt_well_tale
    fact_well_fate: {},
    // V2-Core-72 (#180): the region's roads, and what the crossroads remember
    fact_road_hamlet: {},
    fact_road_ford: {},
    fact_road_royal: {},
    fact_leader_trail: {},
    fact_bandit_toll: {},
    // V2-Core-74 (#180): the realm's news the caravans bring, the leader beyond the river, the royal city
    fact_realm_levy: {},
    fact_realm_fair: {},
    fact_realm_unrest: {},
    fact_leader_crossed: {},
    fact_leader_bounty: {},
    fact_royal_city: {},
    // V2-Core-125 (#307): the road to the ford -- quiet / uneasy / dangerous, set at each turn (a save from before has none) --
    // and the world's place on the road's course, drawn at creation from its own stream (a save from before has none: the first)
    fact_road_north: {},
    fact_road_course: { initial: { pickFrom: Array.from({ length: ROAD_CYCLE }, (_, i) => i) } }
  },

  rumors: {
    rum_ruins_secret: { factId: "fact_ruins_secret", claim: "bandit_hideout" },
    // V2-Core-45: the same history told two ways -- the elder's news, and the legend it becomes
    rum_bandits_fate: { factId: "fact_bandits_fate", claim: "dispersed" },
    rum_bandits_legend: { factId: "fact_bandits_fate", claim: "slain" },
    // V2-Core-55 (D-84): what the elder tells a character he trusts
    rum_leader_old_wound: { factId: "fact_leader_wound", claim: "old_wound" },
    // V2-Core-64 (#160): the fouled well
    rum_well_source: { factId: "fact_well_source", claim: "forest_spring" },
    rum_spring_cause: { factId: "fact_spring_cause", claim: "rotting_carcass" },
    // V2-Core-68 (#170): the arrows, read by a character who knows the hideout
    rum_spring_bandits: { factId: "fact_spring_fouler", claim: "bandits" },
    // V2-Core-69 (#170): the same history told two ways -- the herbalist's news, and the market's legend
    rum_well_fate: { factId: "fact_well_fate", claim: "purified" },
    rum_well_legend: { factId: "fact_well_fate", claim: "spirit_appeased" },
    // V2-Core-72 (#180): the region, as a character knows it
    rum_road_hamlet: { factId: "fact_road_hamlet", claim: "east" },
    rum_road_ford: { factId: "fact_road_ford", claim: "north" },
    rum_road_royal: { factId: "fact_road_royal", claim: "beyond_ford" },
    rum_leader_trail: { factId: "fact_leader_trail", claim: "toward_ford" },
    rum_bandit_toll: { factId: "fact_bandit_toll", claim: "abandoned" },
    // V2-Core-74 (#180): the outside world, as a character knows it
    rum_realm_levy: { factId: "fact_realm_levy", claim: "known" },
    rum_realm_fair: { factId: "fact_realm_fair", claim: "known" },
    rum_realm_unrest: { factId: "fact_realm_unrest", claim: "known" },
    rum_leader_crossed: { factId: "fact_leader_crossed", claim: "far_bank" },
    rum_leader_bounty: { factId: "fact_leader_bounty", claim: "posted" },
    rum_royal_city: { factId: "fact_royal_city", claim: "five_days_north" },
    // V2-Core-125 (#307): the road's condition, one rumour per condition (the clerk's ledger, or a guard's own eyes) --
    // and the yard's talk, which tells only quiet from unsettled
    rum_road_quiet: { factId: "fact_road_north", claim: "quiet" },
    rum_road_uneasy: { factId: "fact_road_north", claim: "uneasy" },
    rum_road_dangerous: { factId: "fact_road_north", claim: "dangerous" },
    rum_road_talk_quiet: { factId: "fact_road_north", claim: "quiet" },
    rum_road_talk_unsettled: { factId: "fact_road_north", claim: "unsettled" }
  },

  // Relation-edge/rumor-source IDs (§7.1/§8.3). An entry without `actor` is
  // inert authored metadata (validateData checks its key format, D-56); one
  // with `actor` is also seeded as `state.actors[id]` by createInitialState
  // (D-77, V2-Core-47). A full NPC scheduler is still out of scope (Issue #74).
  npcs: {
    npc_elder: { name: "마을 원로" },
    // V2-Core-64 (#160): dialogue only (no actor: a new actor would not be in a 0.3.0 save)
    npc_herbalist: { name: "약초꾼" },
    // V2-Core-73 (#180): dialogue only (no actor: D-92)
    npc_miller: { name: "방앗간 주인" },
    npc_ferryman: { name: "뱃사공" },
    // V2-Core-77 (#189): dialogue only (no actor: D-92)
    npc_town_merchant: { name: "성읍의 상인" },
    // V2-Core-78 (#189): dialogue only (no actor: D-92)
    npc_guild_clerk: { name: "상단 조합의 서기" },
    // V2-Core-47 (D-77): the leader is an actor -- the same record a player character is,
    // `kind:"npc"`, seeded by createInitialState under this ID (the ID his relation edges
    // already use). What reads it: the opposed difficulties of the confrontation and the fight
    // (his WIS / STR / DEX, V2-Core-51). His
    // `locationId` is where the hideout was; nothing moves NPCs (no scheduler) and nothing reads it
    npc_bandit_leader: {
      name: "도적 두목",
      actor: {
        locationId: "loc_ruins",
        hp: { max: 10 },
        // V2-Core-59 (D-88): the growth system's stamina, declared -- he pays for his heavy blow with it
        growth: { growth_wanderer: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, per: 10 }, resources: { stamina: { current: 6, max: 6 } } } }
      }
    }
  },
  orgs: {
    org_bandits: { name: "폐허의 도적단" },
    // V2-Core-70 (#170): the village as a whole -- its standing towards a character is an ordinary edge
    org_village: { name: "변경 마을 사람들" },
    // V2-Core-73 (#180): the region's second settlement
    org_mill_hamlet: { name: "물레방아 마을 사람들" }
  },

  texts: {
    txt_observe_village: "당신은 마을 곳곳을 둘러보며 사람들의 표정과 대화를 살핀다.",
    txt_buy_lantern: "상인에게 은화를 건네고 낡은 등불을 받는다.",
    txt_buy_iron_sword: "상인에게 은화 세 닢을 건네고 손때 묻은 철검을 받는다.",
    txt_equip_iron_sword: "철검을 뽑아 손에 쥔다.",
    txt_unequip_iron_sword: "철검을 칼집에 넣고 허리에 찬다.",
    txt_ask_ruins: "원로는 목소리를 낮추며 마을 외곽의 폐허에 대해 이야기한다.",
    txt_small_talk: "원로와 짧은 안부를 나눈다.",
    txt_investigate_success: "등불 아래 드러난 흔적은 도적들의 은신처를 가리키고 있었다.",
    txt_investigate_fail: "폐허는 어둡고 흔적은 모호하다. 확실한 것을 찾지 못했다.",
    txt_confront_success: "당신은 도적 두목과 마주하고 진실을 밝혀낸다.",
    txt_confront_fail: "대치는 뜻대로 풀리지 않았다.",
    txt_report_findings: "당신이 알아낸 것을 전하자 원로는 오래 침묵하다 천천히 고개를 끄덕인다.",
    txt_leader_old_wound: "원로는 주위를 살피고 낮게 말한다. 두목은 젊은 시절 왼쪽 옆구리에 깊은 상처를 입었고, 그 뒤로 그쪽을 늘 감싼다고 한다.",
    txt_confront_backed: "마을 사람들이 당신 뒤에 서 있다는 사실이 도적 두목을 더욱 흔든다.",
    txt_bandit_news: "원로는 폐허의 도적단이 흩어졌다는 소식을 들려준다. 마을 사람들 사이에서 그 이야기는 오래 회자된다.",
    txt_elder_north_legend: "원로는 덧붙인다. 상단 사람들 말로는 강 건너 성읍에선 아직도 도적들이 모두 쓰러졌다고들 한다고, 고친 이야기가 그곳까지 가려면 아직 멀었다고 한다.",
    txt_bandit_legend: "원로는 이제 마을에서 전해지는 이야기를 들려준다. 폐허의 도적단이 마을 사람들 손에 모두 쓰러졌다는 전설이다.",
    txt_correct_legend: "당신은 폐허에서 본 것을 원로에게 전한다. 원로는 한참을 생각하더니, 앞으로는 있었던 그대로 전하겠다고 말한다.",
    txt_bandit_news_corrected: "원로는 마을의 전설 대신, 도적단이 쓰러진 것이 아니라 흩어졌다는 사실을 들려준다. 누군가 폐허에서 그것을 직접 보았다고 한다.",
    txt_hideout_after_fight: "은신처에는 두목이 쓰러진 싸움의 흔적이 남아 있다. 남은 도적들은 짐을 챙겨 흩어졌다.",
    txt_fight_start: "당신은 은신처의 도적 두목 앞에 선다. 그가 칼을 뽑는다.",
    txt_fight_strike_great: "당신의 일격이 두목을 크게 베어 낸다.",
    txt_fight_strike_hit: "당신의 공격이 두목에게 닿는다.",
    txt_fight_trade: "서로의 칼이 스치고, 둘 다 상처를 입는다.",
    txt_fight_struck: "두목의 칼이 당신을 벤다.",
    txt_fight_leader_heavy_blow: "두목이 온 힘을 실어 칼을 내려친다.",
    txt_fight_counter_great: "그의 공격을 정확히 읽고 받아친 칼이 깊이 박힌다.",
    txt_fight_counter_hit: "그의 공격을 흘리고 받아친다.",
    txt_fight_counter_graze: "받아치려 했지만 그의 칼끝이 당신을 스친다.",
    txt_fight_counter_miss: "공격을 잘못 읽었다. 두목의 칼이 당신을 깊이 벤다.",
    txt_fight_leader_reels: "두목이 비틀거린다. 그의 숨이 거칠다.",
    txt_fight_victory: "도적 두목이 쓰러진다. 두목을 잃은 도적들이 당신 앞에서 물러선다.",
    txt_fight_flee: "당신은 칼을 거두고 폐허를 빠져나와 마을로 달아난다. 두목은 쫓아오지 않지만, 당신을 기억할 것이다.",
    txt_hideout_abandoned: "은신처는 텅 비어 있다. 서둘러 짐을 챙겨 떠난 흔적뿐, 싸움의 자국은 없다. 도적단은 쓰러진 것이 아니라 흩어졌다.",
    txt_bandits_disperse: "원로는 도적단 잔당에게 사람을 보내 해산을 권한다. 두목은 더 이상 도적단의 일원이 아니다.",
    txt_market_reopens: "도적단이 흩어졌다는 소식에 상인들이 안도하며 은화 몇 닢을 사례한다.",
    txt_rest_village: "마을 어귀의 평상에 앉아 숨을 고르며 상처를 돌본다.",
    txt_ruins_hazard: "무너진 벽돌이 머리 위로 쏟아져 내린다.",
    txt_succession: "쓰러진 이가 남긴 은화 몇 닢이 새 방랑자의 손에 들어온다.",
    txt_inspect_well_success: "두레박으로 길어 올린 물에서 썩은 풀 냄새가 난다. 우물 벽의 물때가 숲 쪽에서 흘러드는 물길을 가리킨다. 이 물은 숲속 샘에서 온다.",
    txt_inspect_well_fail: "우물물은 조금 탁해 보이지만, 무엇이 문제인지는 알 수 없다.",
    txt_herbalist_sickness: "약초꾼은 요즘 배앓이를 하는 사람이 부쩍 늘었다며 혀를 찬다. 마을 우물은 숲속 샘에서 물을 받는데, 그 샘이 탈이 난 게 틀림없다고 한다.",
    txt_herbalist_small_talk: "약초꾼은 말린 약초 다발을 정리하며 계절 이야기를 늘어놓는다.",
    txt_search_spring_success: "샘 위쪽 바위 틈에 짐승의 사체가 걸려 썩어 가고 있다. 샘물을 흐리는 것은 이것이다.",
    txt_search_spring_fail: "샘가는 안개와 악취로 가득하다. 원인을 찾지 못했다.",
    txt_spring_miasma: "샘에서 피어오르는 독한 기운에 숨이 막히고 속이 뒤집힌다.",
    txt_spring_miasma_resisted: "샘의 독한 기운이 밀려오지만, 숨을 고르며 버텨 낸다.",
    txt_gather_herbs_great: "물가 바위 그늘에서 싱싱한 정화초 무더기를 찾아 두 묶음을 거둔다.",
    txt_gather_herbs_success: "독한 풀들 사이에서 정화초 한 묶음을 가려 거둔다.",
    txt_gather_herbs_fail: "비슷하게 생긴 풀만 한 아름이다. 정화초는 찾지 못했다.",
    txt_herbalist_teach: "약초꾼은 은화를 받아 넣고, 잎맥과 향으로 정화초를 가려내는 법을 차근차근 일러 준다.",
    txt_herbalist_brew: "약초꾼은 정화초 두 묶음을 달여 맑은 정화제 한 병을 만들어 준다. 샘의 원인을 치운 뒤 부으라고 한다.",
    txt_purify_spring: "바위 틈의 사체를 끌어내 묻고, 샘에 정화제를 붓는다. 독한 안개가 천천히 걷히고 물빛이 맑아진다.",
    txt_well_clears: "마을 우물가에 사람들이 모여 있다. 길어 올린 물이 다시 맑다며, 배앓이하던 아이들도 일어났다고 한다.",
    txt_inspect_well_clear: "두레박으로 길어 올린 물이 맑고 차다. 물길은 여전히 숲속 샘에서 흘러오지만, 이제 썩은 냄새는 없다.",
    txt_herbalist_sickness_passed: "약초꾼은 배앓이가 잦아들었다며 웃는다. 누군가 숲속 샘을 정화했다는 소문이 돈다고 한다.",
    txt_herbalist_thanks: "당신이 샘에서 한 일을 듣자 약초꾼은 손을 꼭 잡고 고맙다고 말한다. 마을 사람들 대신 하는 인사라고 한다.",
    txt_spring_bandit_arrows: "사체에 박힌 화살의 깃이 눈에 익다. 폐허의 은신처에서 본 것과 같은, 도적단의 화살이다.",
    txt_tell_spring_arrows: "당신이 샘의 짐승에 박혀 있던 화살 이야기를 하자 원로의 얼굴이 굳는다. 샘을 흐린 것도 도적들이었다는 말이 곧 마을에 퍼질 것이다.",
    txt_spring_bandits_leader_lives: "원로는 덧붙인다. 샘을 흐린 것도 그 도적들이었다고. 그 일을 시킨 두목은 아직 어딘가 살아 있다고 한다.",
    txt_spring_bandits_leader_dead: "원로는 덧붙인다. 샘을 흐린 것도 그 도적들이었다고. 그 일을 시킨 두목은 이미 죽었으니, 적어도 다시는 그런 일이 없을 거라고 한다.",
    txt_ask_ruins_spring: "원로는 폐허의 도적들이 숲속 샘까지 흐려 놓았다는 이야기도 잊지 않고 덧붙인다.",
    txt_herbalist_bandit_rumor: "약초꾼은 목소리를 낮춘다. 샘을 흐린 게 폐허의 도적들이었다는 이야기가 시장에도 돈다고 한다.",
    txt_search_spring_purified: "샘은 맑고 고요하다. 바위 틈 아래 새로 덮은 흙과 정화제의 쌉쌀한 냄새가, 누군가 이곳을 손수 정화했음을 말해 준다.",
    txt_herbalist_well_legend: "약초꾼은 시장에 도는 이야기를 들려준다. 마을 사람들이 제물을 바치자 노한 샘의 정령이 누그러졌다는 것이다.",
    txt_herbalist_correct_legend: "당신이 샘에서 본 것을 전하자 약초꾼은 고개를 끄덕인다. 정령이 아니라 사람이 한 일이었다고, 앞으로는 그렇게 전하겠다고 한다.",
    txt_herbalist_north_legend: "약초꾼은 덧붙인다. 북쪽 성읍에선 아직도 샘의 정령이 제물을 받고 누그러졌다고들 한다더라고.",
    txt_herbalist_well_corrected: "약초꾼은 시장의 정령 이야기 대신, 누군가 샘에서 사체를 치우고 정화제를 부었다는 사실을 들려준다. 직접 본 사람이 있다고 한다.",
    txt_village_honor: "원로는 마을 사람들을 모아 당신 앞에 선다. 도적을 몰아내고 샘을 되살린 이에게 마을의 이름으로 감사한다고, 이제 이 마을은 당신의 편이라고 말한다.",
    txt_small_talk_honored_memory: "원로는 마을이 이름을 걸고 감사했던 방랑자 이야기를 꺼낸다. 마을 사람들은 아직도 그 이야기를 한다고 한다.",
    txt_buy_lantern_trusted: "상인은 손사래를 치며 은화 두 닢만 받고 등불을 건넨다. 마을을 구한 사람에게 제값을 받을 수는 없다고 한다.",
    txt_herbalist_given_herbs: "약초꾼은 정화초 두 묶음을 받아 들고 환하게 웃는다. 앓는 집들에 나눠 주겠다고 한다.",
    txt_herbalist_salve: "약초꾼은 은화 세 닢을 받고 작은 연고 단지를 건넨다.",
    txt_herbalist_salve_trusted: "약초꾼은 은화 한 닢만 받고 연고 단지를 쥐여 준다. 마을이 감사한 사람에게서 더 받을 수는 없다고 한다.",
    txt_apply_salve: "상처에 약초 연고를 바르자 쓰라림이 가라앉는다.",
    txt_crossroads_first: "도적들이 막고 있던 길이 다시 트였다. 잡초가 무성한 옛 갈림길에 오랜만에 사람의 발자국이 찍힌다.",
    txt_read_milestone_success: "닳은 이정표의 글자를 더듬어 읽는다. 동쪽은 물레방아 마을, 북쪽은 강나루. 그 아래 희미하게, 강을 건너 왕도로 이어지는 길이라고 새겨져 있다.",
    txt_read_milestone_fail: "이정표의 글자는 이끼와 비바람에 닳아 알아보기 어렵다.",
    txt_elder_region: "원로는 지팡이로 땅에 길을 그린다. 갈림길에서 동쪽으로 가면 물레방아 마을이 있고, 북쪽으로 가면 강나루가 나온다고 한다. 도적들 때문에 몇 해나 끊겼던 길이다.",
    txt_crossroads_leader_trail: "진흙에 찍힌 발자국 하나가 눈에 띈다. 한쪽 옆구리를 감싸 안은 듯 무게가 기운 걸음, 도적 두목의 것이다. 발자국은 강나루 쪽으로 이어진다.",
    txt_crossroads_toll_post: "길가에 무너진 초소가 있다. 도적들이 지나는 이들에게 통행세를 뜯던 곳이다. 두목이 쓰러진 뒤로 아무도 돌아오지 않았다.",
    txt_search_crossroads_fail: "갈림길에는 오래된 바퀴 자국과 짐승 발자국뿐이다.",
    txt_miller_news: "방앗간 주인은 물레방아 소리 너머로 목소리를 높인다. 길이 막혀 있던 몇 해 동안 밀을 내다 팔 곳이 없었다고 한다.",
    txt_miller_news_scarred_man: "그는 목소리를 낮춘다. 며칠 전 옆구리를 감싼 사내가 강나루에서 배를 찾더라는 소문이 있다고, 그 뒤로 사람들이 밤길을 꺼린다고 한다.",
    txt_miller_news_leader_fell: "그는 폐허의 두목이 쓰러졌다는 이야기를 이곳에서도 들었다고 한다. 이제 짐수레가 다시 길에 나설 수 있겠다며 웃는다.",
    txt_miller_welcome: "변경 마을이 감사했다는 사람이 당신이냐며, 그는 밀가루 묻은 손으로 당신의 손을 잡는다.",
    txt_miller_trade_running: "요즘은 변경 마을 장터로 수레가 오간다며 그는 흡족해한다.",
    txt_miller_buy_herb: "방앗간 주인은 정화초를 받아 들고 은화 두 닢을 건넨다. 이 근방에서는 귀한 풀이라고 한다.",
    txt_miller_sell_flour: "방앗간 주인은 밀가루 자루 하나를 내준다. 마을과 거래가 트인 뒤로 밀이 남는다며, 강 건너에선 더 쳐줄지도 모른다고 한다.",
    txt_miller_flour_gone: "오늘 내놓을 밀가루는 벌써 다 나갔다고 한다. 내일이면 또 몇 자루 빻아 두겠다고.",
    txt_miller_flour: "그는 밀가루 한 자루를 내준다. 변경 마을 원로에게 전해 주면, 다시 거래를 트자는 뜻으로 알아들을 거라고 한다.",
    txt_deliver_flour: "원로는 밀가루 자루를 받아 들고 한참을 바라본다. 물레방아 마을과 다시 거래를 하자고, 곧 장터에 수레가 올 거라고 말한다.",
    txt_hamlet_carts: "장터에 물레방아 마을의 수레가 들어와 있다. 갓 구운 빵 냄새가 장터에 퍼진다.",
    txt_buy_mill_bread: "상인에게 은화 한 닢을 건네고 물레방아 마을의 빵을 받는다.",
    txt_eat_mill_bread: "빵을 뜯어 먹자 허기가 가시고 몸에 힘이 돈다.",
    txt_ferryman_quiet: "뱃사공은 노를 손질하며 고개를 젓는다. 길이 막혀 있던 동안 강 건너 소식도 끊겼다고 한다.",
    txt_ferryman_levy: "뱃사공은 지난번 상단이 전한 소식을 들려준다. 영주가 징집령을 내려 강 건너 마을마다 젊은이들을 모으고 있다고 한다.",
    txt_ferryman_fair: "뱃사공은 새 소식을 들려준다. 왕도에서 큰 장이 열려 상단들이 앞다투어 북쪽으로 올라간다고 한다.",
    txt_ferryman_unrest: "뱃사공은 얼굴을 찌푸린다. 국경이 소란스럽다는 소식이 상단을 따라 내려왔다고, 강 건너 분위기가 예전 같지 않다고 한다.",
    txt_ferryman_scarred_man: "그는 목소리를 낮춘다. 도적들이 흩어진 뒤 옆구리를 감싼 사내 하나를 건네 주었다고, 은화를 두 배로 쳐주며 아무것도 묻지 말라 했다고 한다.",
    txt_ferryman_leader_fell: "그는 폐허의 두목이 쓰러졌다는 이야기를 강 건너 사람들도 벌써 안다고 한다. 소문은 배보다 빨리 강을 건넌다며 웃는다.",
    txt_ferryman_north_bandits_tale: "돌아온 상단이 성읍에서 들은 말도 전해 준다. 그쪽에선 폐허의 도적 떼가 마을 사람들 손에 모두 쓰러졌다고들 한단다.",
    txt_ferryman_north_bandits_truth: "돌아온 상단 말로는 성읍에서도 이제 고쳐 말한다고 한다. 폐허의 도적들은 다 쓰러진 게 아니라 흩어졌다고.",
    txt_ferryman_north_well_tale: "샘 이야기도 북쪽에선 정령이 노했다가 제물을 받고 누그러졌다는 말로 돈다고 한다.",
    txt_ferryman_north_well_truth: "샘 이야기도 성읍에선 바로잡혔다고 한다. 정령이 아니라 누군가 사체를 치우고 정화제를 부어 살렸다고.",
    txt_ferryman_cross: "은화 세 닢을 건네자 뱃사공이 밧줄을 푼다. 잿빛 강물을 가르며 배가 건너편으로 나아간다.",
    txt_ferryman_cross_letter: "원로의 편지를 읽은 뱃사공은 뱃삯을 받지 않고 밧줄을 푼다. 변경 마을 원로의 부탁이라면 얼마든지라고 한다.",
    txt_elder_letter: "원로는 낡은 양피지에 몇 줄을 적고 인장을 눌러 건넨다. 강나루의 뱃사공은 이 편지를 알아볼 거라고 한다.",
    txt_far_bank_first: "강 건너 길목에 발을 딛는다. 처음 보는 땅, 북쪽으로 곧게 뻗은 넓은 길이 지평선 너머로 사라진다.",
    txt_royal_market: "한 시간을 걸어도 시장의 끝이 나오지 않는다. 처음 보는 천과 그릇과 연장이 끝없이 늘어서 있고, 변경에서는 귀한 정화초도 여러 지방의 약초 더미 사이에 섞여 있다. 사방에서 값을 부르는 소리가 그치지 않는다.",
    txt_royal_market_fair: "뱃사공이 말하던 큰 장이 바로 눈앞에 서 있다. 상단들이 줄지어 짐을 풀고, 사람의 물결이 길을 메운다. 들은 소식이 이제 본 것이 된다.",
    txt_royal_market_after_fair: "큰 장은 끝났다. 장꾼들이 떠난 자리에 빈 수레 자국과 밟힌 짚만 남아 있다.",
    txt_royal_records: "벽마다 글이 빽빽이 내걸려 있다. 변경에서는 원로의 인장 하나가 귀했는데, 이곳에서는 글이 글 위에 덧붙어 있고 사람들은 그것을 읽으며 지나간다.",
    txt_royal_records_unrest: "먼 국경의 소란을 적은 글이 여럿 있다. 그런데 글마다 적힌 내용이 다르다. 누가 무엇 때문에 다투는지, 어느 글도 같은 말을 하지 않는다.",
    txt_royal_records_no_frontier: "남쪽 변경에 관한 글은 한 줄도 찾을 수 없다. 폐허의 도적도, 숲속 샘도, 그곳에서 있었던 일은 이 벽에 닿지 않았다.",
    txt_royal_city_first: "닷새를 걸은 끝에 넓은 길이 끝없는 지붕들 사이로 빨려 들어간다. 변경 마을 사람을 다 모아도 이 거리 하나를 채우지 못할 것 같다. 길을 묻는 사람마다 이곳이 왕권의 자리이고, 왕국에서 가장 큰 시장이 서는 곳이라고 말한다.",
    txt_board_royal_city: "길목의 게시판에는 이정표가 그려져 있다. 이 길을 따라 북쪽으로 닷새를 걸으면 왕도라고 한다.",
    txt_board_levy: "영주의 징집령이 나붙어 있다. 열여섯 살이 넘은 남자는 성으로 오라는 내용이다.",
    txt_board_bounty: "빛바랜 수배서 한 장이 눈에 띈다. 옆구리에 오래된 상처가 있는 도적 두목, 현상금 은화 쉰 닢.",
    txt_board_road_safe: "남쪽 변경의 길이 다시 안전해졌다는 상단 조합의 공고가 붙어 있다.",
    txt_board_village_name: "게시판 귀퉁이에 누군가 적어 놓았다. 남쪽 변경 마을에서 도적을 몰아내고 샘을 살린 이가 있다고.",
    txt_castle_town_first: "넓은 길이 끝나는 곳, 언덕 위에 돌로 쌓은 성이 보인다. 성 아래로 지붕들이 빼곡히 모여 있다. 영주의 성읍이다.",
    txt_castle_levy_decree: "성문 옆 포고판에 영주의 징집령이 붙어 있다. 인장이 찍힌 글은 길고 자세하다. 이곳에서는 글로 붙은 것이 곧 소식이다.",
    txt_castle_no_frontier_news: "포고판 앞 사람들에게 남쪽 변경의 일을 물어도 고개를 젓는다. 강 남쪽 소식은 아직 이곳까지 올라오지 않았다.",
    txt_castle_bandits_tale: "포고판 앞에서 누군가 남쪽 변경 이야기를 한다. 폐허의 도적 떼가 모두 쓰러졌다고, 상단 사람들에게 들었다고 한다.",
    txt_castle_well_tale: "다른 이는 강 남쪽 어느 마을의 샘에 정령이 노했다가 제물을 받고 누그러졌다는 이야기를 늘어놓는다.",
    txt_castle_epithet: "남쪽 변경에 도적을 몰아내고 샘을 살린 떠돌이가 있었다는 말도 돈다. 그 이름을 아는 사람은 아무도 없다.",
    txt_castle_bandits_truth: "포고판 앞에서 누군가 남쪽 변경 이야기를 고쳐 말한다. 폐허의 도적들이 다 쓰러진 게 아니라 흩어졌다고, 그 마을 원로가 그렇게 전하더라고 한다.",
    txt_castle_well_truth: "다른 이는 강 남쪽 마을의 샘 이야기를 바로잡는다. 정령이 아니라 누군가 사체를 치우고 정화제를 부어 살렸다고 한다.",
    txt_town_told_ruins: "포고판 앞에 모인 사람들에게 폐허에서 본 것을 들려준다. 도적들은 다 쓰러진 게 아니라 흩어졌다고. 사람들은 웅성거리다 고개를 끄덕인다. 직접 본 사람의 말이다.",
    txt_town_told_spring: "샘에서 본 것을 들려준다. 정령이 아니라 사람이 사체를 치우고 정화제를 부었다고. 듣던 이들이 그 이야기를 서로에게 옮기기 시작한다.",
    txt_town_merchant_south_goods: "상인은 강 남쪽 약초는 이곳에서 보기 드물어 값을 잘 쳐 준다고 한다. 대신 철물은 북쪽에서 내려오니 성읍이 강 남쪽보다 싸다고 덧붙인다.",
    txt_town_merchant_buy_herb: "상인은 정화초를 이리저리 살피더니 은화 네 닢을 내준다.",
    txt_town_merchant_buy_flour: "상인은 자루를 열어 밀가루를 손끝으로 비벼 본다. 강 남쪽 밀은 곱게 빻였다며 은화 네 닢을 내준다.",
    txt_town_merchant_flour_wanted: "밀가루도 가져오면 사겠다고 한다. 성읍 빵집들이 강 남쪽 밀을 찾는다고.",
    txt_town_merchant_flour_enough: "밀가루는 지난번에 들어온 것으로 당분간 넉넉하다고 한다. 상단이 몇 번 오가고 나면 다시 찾을 거라고.",
    txt_town_merchant_flour_fair: "요즘은 밀가루 값이 올랐다고 한다. 왕도의 큰 장으로 상단들이 곡식을 실어 올라가는 통에 성읍에는 밀이 귀하다고.",
    txt_town_merchant_buy_flour_fair: "상인은 자루를 반기며 은화 여섯 닢을 세어 준다. 큰 장이 끝나기 전에 더 가져오라고 한다.",
    txt_escort_known_bonus: "서기는 품삯에 은화 한 닢을 더 얹어 준다. 조합이 믿는 호위에게는 그만큼 더 쳐 준다고 한다.",
    txt_guild_clerk_knows_you: "서기는 장부를 넘기다 고개를 든다. 상단 사람들이 당신 이야기를 하더라고, 믿을 만한 호위라고 한다.",
    txt_escort_wound: "옆구리에 상처를 입었다. 칼을 들 때마다 당기지만, 하룻밤 푹 쉬면 가라앉을 것 같다.",
    txt_escort_deep_wound: "상처가 깊다. 숨이 찰 때마다 옆구리가 찢어지는 듯하다. 쉬어서 몸을 추스르거나 약초 연고를 바르지 않으면 이 몸으로는 길을 이끌 수 없을 것 같다.",
    txt_treat_road_wound: "약초 연고를 상처에 두텁게 바르고 천으로 감는다. 며칠 동안 당기던 것이 풀린다.",
    txt_town_merchant_sell_jerkin: "상인은 두꺼운 가죽 조끼를 내민다. 상단 호위들이 즐겨 입는 것이라며, 칼끝 하나쯤은 막아 준다고 한다.",
    txt_equip_leather_jerkin: "가죽 조끼를 입고 끈을 단단히 조인다. 몸이 조금 무거워지는 대신 든든하다.",
    txt_unequip_leather_jerkin: "가죽 조끼를 벗어 둔다.",
    txt_town_merchant_sell_steel_sword: "상인은 기름 먹인 천을 풀어 강철 검을 내민다. 철검보다 한참 믿음직하다며, 값은 은화 스물네 닢이라고 한다.",
    txt_town_merchant_sell_mail_shirt: "상인은 궤에서 쇠고리를 촘촘히 엮은 사슬 갑옷을 꺼낸다. 가죽 조끼와는 비교도 안 된다며, 은화 마흔여덟 닢을 부른다.",
    txt_equip_steel_sword: "강철 검을 뽑아 손에 쥔다. 철검보다 묵직하고 날이 곧다.",
    txt_unequip_steel_sword: "강철 검을 칼집에 넣고 허리에 찬다.",
    txt_equip_mail_shirt: "사슬 갑옷을 머리부터 뒤집어쓰고 허리끈을 조인다. 철 소리가 나지만 몸이 든든하다.",
    txt_unequip_mail_shirt: "사슬 갑옷을 벗어 개어 둔다.",
    txt_guild_clerk_too_hurt: "서기는 당신을 위아래로 훑어본다. 그 몸으로 길에 나섰다가 일이 틀어지면 돌아오지 못할 수도 있다고, 먼저 쉬고 오라고 한다.",
    txt_guild_clerk_sees_wound: "서기는 옆구리를 감싼 당신의 손을 본다. 상처를 안고 칼을 들면 둔해진다고, 하룻밤 쉬고 오라고 한다.",
    txt_guild_clerk_sees_deep_wound: "서기는 당신이 걷는 모양만 보고도 고개를 젓는다. 저 상처는 하룻밤으로 낫지 않는다고, 약초 연고를 바르거나 오래 쉬어야 한다고 한다.",
    txt_guild_clerk_deep_closes_lead: "그 몸으로는 상단을 이끄는 일을 맡길 수 없다고 한다. 평범한 호위라면 맡아도 좋지만, 몸이 나을 때까지 이끄는 일은 없다.",
    txt_guild_clerk_no_leather: "상단 호위들은 대개 가죽 조끼를 걸친다고 서기가 덧붙인다. 성읍 상인에게 가면 구할 수 있다고.",
    txt_town_merchant_sell_sword: "상인에게 은화 두 닢을 건네고 새로 벼린 철검을 받는다.",
    txt_guild_clerk_work: "서기는 장부를 넘기며 말한다. 강나루로 내려가는 상단이 호위를 구한다고, 길이 험하니 칼을 쓸 줄 알면 좋겠다고 한다.",
    txt_guild_clerk_no_work: "서기는 고개를 젓는다. 지금 길에 오를 상단은 이미 호위를 구했으니 다음 상단을 기다리라고 한다.",
    txt_escort_great: "길에서 덤벼든 좀도둑들을 단숨에 쫓아낸다. 상단은 무사히 강 건너 길목에 닿고, 상단주는 품삯에 웃돈을 얹어 준다.",
    txt_escort_success: "길은 길었지만 상단은 무사히 강 건너 길목에 닿는다. 서기가 약속한 품삯을 받는다.",
    txt_escort_fail: "길에서 덤벼든 좀도둑들과 엉켜 상처를 입는다. 상단은 간신히 강 건너 길목에 닿고, 품삯은 깎인다.",
    txt_lodge_castle_town: "은화 두 닢을 내고 성읍의 지붕 아래에서 하룻밤을 묵는다. 길에서 쌓인 피로가 풀린다.",
    txt_small_talk_fallen_guard: "원로는 목소리를 낮춘다. 상단 사람들 사이에서 길에서 돌아오지 못한 호위 이야기가 돈다고, 그 길이 쉬운 길은 아니라고 한다.",
    txt_guild_clerk_left_without: "서기는 장부를 덮으며 말한다. 호위를 오래 못 구한 상단은 기다려 주지 않는다고, 다른 호위를 사서 떠난 상단이 벌써 여럿이라고 한다.",
    txt_guild_clerk_careful_offer: "서기가 목소리를 낮춘다. 얼마 전 호위 하나가 길에서 돌아오지 못했으니, 서두르지 말고 날을 넘겨 천천히 길을 가는 방법도 있다고, 품삯은 적어도 다칠 일은 덜하다고 한다.",
    txt_careful_great: "하루를 꼬박 들여 길목마다 살피며 간다. 좀도둑들은 낌새를 채고 비켜 가고, 상단은 아무 일 없이 강 건너 길목에 닿는다. 서기는 적은 품삯에 웃돈을 조금 얹는다.",
    txt_careful_success: "해가 지기 전에 멈추고 날이 밝으면 다시 걷는다. 느린 길이었지만 상단은 무사히 강 건너 길목에 닿는다.",
    txt_careful_fail: "길을 살피다 덤벼들 틈을 보인다. 그러나 서두르지 않은 덕에 상단을 돌려세울 수 있었고, 다친 사람 없이 강 건너 길목에 닿는다. 품삯은 거의 없다.",
    txt_guild_clerk_lead_offer: "서기는 장부에서 눈을 들어 당신의 칼 솜씨를 새삼 헤아린다. 이만한 솜씨면 호위를 이끄는 자리도 맡을 만하다고, 품삯도 그만큼 다르다고 한다.",
    txt_guild_clerk_danger_offer: "서기는 목소리를 낮춘다. 강철을 걸친 이만 부탁할 수 있는 상단이 있다고 한다 — 길이 험하고 상대가 독하지만 품삯은 두 배에 가깝다고.",
    txt_danger_great: "험한 길목에서 호위들을 이끌어 독한 무리를 단번에 꺾는다. 상단은 짐 하나 잃지 않고 닿고, 상단주는 놀라 은화를 한 움큼 더 얹는다.",
    txt_danger_success: "호위들을 촘촘히 세워 험한 길을 뚫는다. 상단은 무사히 닿고, 위험한 일의 품삯이 넉넉히 치러진다.",
    txt_danger_fail: "독한 무리에게 호위가 밀린다. 상단은 간신히 닿지만 앞장선 몫만큼 크게 다치고, 품삯은 형편없이 깎인다.",
    // V2-Core-125 (#307, Road News step 1a): the road's condition -- what the ledger says, what the yard says, what a guard saw.
    // Provisional wording (R-29); nothing says who is on the road or why
    txt_guild_clerk_road_quiet: "서기가 장부의 마지막 줄을 짚는다. 지난 상단들이 남긴 말로는 요즘 강나루 길이 조용하다고 한다. 장부에 적힌 것일 뿐, 다음 길까지 그렇다는 약속은 아니라고 덧붙인다.",
    txt_guild_clerk_road_uneasy: "서기가 장부의 마지막 줄을 짚는다. 지난 상단들이 남긴 말로는 요즘 강나루 길이 어수선하다고 한다. 장부에 적힌 것일 뿐, 다음 길까지 그렇다는 약속은 아니라고 덧붙인다.",
    txt_guild_clerk_road_dangerous: "서기가 장부의 마지막 줄을 짚는다. 지난 상단들이 남긴 말로는 요즘 강나루 길이 험하다고 한다. 장부에 적힌 것일 뿐, 다음 길까지 그렇다는 약속은 아니라고 덧붙인다.",
    txt_guild_yard_road_quiet: "마당의 짐꾼들 사이에서는 요즘 강나루 길이 그럭저럭 괜찮다는 이야기가 오간다. 누가 직접 보고 한 말인지는 알 수 없다.",
    txt_guild_yard_road_unsettled: "마당의 짐꾼들 사이에서는 요즘 강나루 길이 심상치 않다는 수군거림이 돈다. 얼마나 나쁜지, 누가 직접 보고 한 말인지는 알 수 없다.",
    txt_guild_clerk_road_for_known: "길 사정을 더 물으니 서기는 고개를 젓는다. 장부에 적힌 길 사정은 조합이 아는 호위에게만 일러 준다고 한다.",
    txt_road_seen_quiet: "오가는 내내 길섶은 조용했다. 적어도 이번 길에서는.",
    txt_road_seen_uneasy: "길 곳곳에 누군가 머물다 간 흔적이 있었다. 이번 길은 어수선했다.",
    txt_road_seen_dangerous: "길목마다 부서진 짐과 핏자국이 보였다. 이번 길은 험했다.",
    txt_danger_road_bonus: "길이 험했던 만큼 조합이 웃돈으로 은화 세 닢을 얹어 준다.",
    // V2-Core-126 (#309, Road News step 1b): the words the UI shows for the pack's ids (`lbl_*`) -- what a status line, a
    // menu and the knowledge list say instead of an id. Provisional wording (R-29); a rumour's label is the claim as told
    lbl_stat_str: "힘",
    lbl_stat_dex: "민첩",
    lbl_stat_con: "체력",
    lbl_stat_int: "지능",
    lbl_stat_wis: "지혜",
    lbl_stat_per: "감각",
    lbl_prof_investigation: "조사",
    lbl_prof_combat: "전투",
    lbl_prof_herbalism: "약초",
    lbl_skill_swordsmanship: "검술",
    lbl_skill_investigation: "조사",
    lbl_skill_herbalism: "약초학",
    lbl_tier_untrained: "미숙",
    lbl_tier_novice: "초심",
    lbl_tier_apprentice: "수련",
    lbl_tier_adept: "숙달",
    lbl_trait_night_vision: "밤눈",
    lbl_trait_investigation_talent: "조사의 재능",
    lbl_trait_road_wound: "길에서 입은 상처",
    lbl_trait_road_wound_deep: "깊은 상처",
    lbl_unlock_unl_keen_eye: "예리한 눈",
    lbl_unlock_unl_road_lead: "상단을 이끌 자격",
    lbl_res_stamina: "기력",
    lbl_slot_hand: "손",
    lbl_slot_body: "몸",
    lbl_tmpl_start_wanderer: "떠돌이",
    lbl_tmpl_start_scout: "정찰자",
    lbl_rumor_rum_ruins_secret: "폐허는 도적들의 은신처다",
    lbl_rumor_rum_bandits_fate: "도적단은 흩어졌다",
    lbl_rumor_rum_bandits_legend: "도적 떼가 모두 베어졌다",
    lbl_rumor_rum_leader_old_wound: "두목의 옆구리에 오래된 상처가 있다",
    lbl_rumor_rum_well_source: "우물 물은 숲의 샘에서 온다",
    lbl_rumor_rum_spring_cause: "샘에 썩은 짐승 사체가 있다",
    lbl_rumor_rum_spring_bandits: "샘을 흐린 것은 도적들이다",
    lbl_rumor_rum_well_fate: "샘이 정화되었다",
    lbl_rumor_rum_well_legend: "노한 샘의 정령이 누그러졌다",
    lbl_rumor_rum_road_hamlet: "물레방아 마을은 동쪽에 있다",
    lbl_rumor_rum_road_ford: "강나루는 북쪽에 있다",
    lbl_rumor_rum_road_royal: "왕도는 강나루 너머에 있다",
    lbl_rumor_rum_leader_trail: "두목의 발자국이 강나루 쪽으로 간다",
    lbl_rumor_rum_bandit_toll: "도적의 통행세 초소는 버려졌다",
    lbl_rumor_rum_realm_levy: "영주의 징집령이 내렸다",
    lbl_rumor_rum_realm_fair: "왕도에서 큰 장이 열린다",
    lbl_rumor_rum_realm_unrest: "국경이 소란스럽다",
    lbl_rumor_rum_leader_crossed: "옆구리를 감싼 사내가 강을 건넜다",
    lbl_rumor_rum_leader_bounty: "도적 두목에게 현상금이 걸렸다",
    lbl_rumor_rum_royal_city: "왕도는 북쪽으로 닷새 길이다",
    lbl_rumor_rum_road_quiet: "강나루 길이 조용하다",
    lbl_rumor_rum_road_uneasy: "강나루 길이 어수선하다",
    lbl_rumor_rum_road_dangerous: "강나루 길이 험하다",
    lbl_rumor_rum_road_talk_quiet: "강나루 길이 그럭저럭 괜찮다",
    lbl_rumor_rum_road_talk_unsettled: "강나루 길이 심상치 않다",
    lbl_src_src_castle_town_talk: "성읍 사람들의 이야기",
    lbl_src_src_guild_hall_talk: "조합 마당의 이야기",
    lbl_src_src_market_legend: "시장에 도는 이야기",
    lbl_src_src_royal_records: "왕도의 기록",
    lbl_src_src_village_legend: "마을에 도는 이야기",
    lbl_src_obs_village_well: "직접 봄 (마을 우물)",
    lbl_src_obs_road_north: "직접 봄 (강나루 길)",
    txt_lead_great: "길 위에서 호위들을 부려 좀도둑들을 단번에 몰아낸다. 상단은 흠 하나 없이 강 건너 길목에 닿고, 상단주는 두둑한 웃돈을 얹는다.",
    txt_lead_success: "호위들을 앞뒤로 세워 길을 지킨다. 상단은 무사히 강 건너 길목에 닿고, 서기가 이끈 몫까지 쳐서 품삯을 내준다.",
    txt_lead_fail: "호위들을 이끌었으나 길에서 덤벼든 좀도둑들에게 밀린다. 상단은 간신히 닿지만 앞장선 몫만큼 상처를 입고, 품삯은 크게 깎인다.",
    txt_guild_clerk_estate_offer: "서기는 장부 한쪽을 손가락으로 짚는다. 돌아오지 못한 호위가 지녔던 은화 일부를 조합이 맡아 두었고, 이어 가는 이가 찾아오면 내준다고 한다.",
    txt_guild_clerk_estate: "서기는 맡아 둔 은화를 세어 건넨다. 누구의 몫이었는지는 말하지 않고, 장부의 한 줄을 지운다.",
    txt_guild_clerk_kit_offer: "서기는 뒤편 궤짝을 턱으로 가리킨다. 돌아오지 못한 호위가 지녔던 물건을 조합이 거두어 두었고, 이어 가는 이에게는 반값에 내준다고 한다.",
    txt_guild_clerk_kit_steel: "서기는 궤짝에서 기름 먹인 강철 검을 꺼내 건넨다. 주인이 누구였는지는 말하지 않고, 은화 열두 닢을 받아 장부에 적는다.",
    txt_guild_clerk_kit_mail: "서기는 궤짝에서 사슬 갑옷을 꺼내 건넨다. 주인이 누구였는지는 말하지 않고, 은화 스물네 닢을 받아 장부에 적는다.",
    txt_guild_clerk_careful_offer_maimed: "서기가 목소리를 낮춘다. 얼마 전 호위 하나가 깊은 상처를 안고 길에서 돌아왔으니, 서두르지 말고 날을 넘겨 천천히 길을 가는 방법도 있다고, 품삯은 적어도 다칠 일은 덜하다고 한다.",
    txt_guild_clerk_maimed: "서기는 장부의 다른 줄을 손가락으로 짚는다. 조합이 믿던 호위 하나가 길에서 깊은 상처를 입고 돌아왔다고, 그런 상처는 하룻밤으로 낫지 않으니 몸부터 챙기라고 한다.",
    txt_guild_clerk_fallen: "서기는 장부의 한 줄을 손가락으로 짚는다. 조합이 믿던 호위 하나가 길에서 돌아오지 못했다고, 이 일은 그만큼 위험하다고 한다.",
    txt_rest_wound_closes: "하룻밤 쉬고 나니 옆구리의 상처가 가라앉았다.",
    txt_rest_deep_wound_stays: "깊은 상처는 쉬어도 더디게 아문다. 약초 연고가 있으면 한결 빠를 것 같다.",
    txt_rest_deep_wound_closes: "며칠을 쉰 끝에 깊은 상처가 마침내 아물었다.",
    txt_treat_deep_wound: "깊은 상처에 약초 연고를 두텁게 바르고 천으로 단단히 감는다. 쑤시던 것이 가라앉는다."
  }
};
