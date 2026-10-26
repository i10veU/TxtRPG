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
// V2-Core-141 (M2): the spring's herbs picked, a world count the herbalist hears of at the market
const HERBS_PICKED = { op: "signal", key: "spring_herbs_picked", add: 1 };
// V2-Core-66 (#160): the well's case, closed by purifying the spring (world state, D-70)
const WELL_RESOLVED = { op: "case", case: "case_fouled_well", stage: "resolved" };
// V2-Core-68 (#170): handling the carcass records whose arrows killed it (the world's truth); a
// character who knows the bandits' hideout reads them, once
const ARROWS_TOLD = { op: "flag", key: "spring_bandits_told" };
// J3: an unverified two-rumor judgment becomes one irreversible village response.
// The world remembers the response; the teller's own relation tag records authorship.
const SPRING_DECISION_OPEN = { op: "and", of: [
  { op: "rumor", rumor: "rum_ruins_secret" },
  { op: "rumor", rumor: "rum_well_source" },
  { op: "not", of: { op: "rumor", rumor: "rum_spring_bandits" } },
  { op: "not", of: ARROWS_TOLD },
  { op: "not", of: { op: "flag", key: "spring_watch_requested" } },
  { op: "not", of: { op: "flag", key: "spring_inquiry_requested" } }
] };
// J3 #443: a source-scoped, character-owned observation gates the second
// decision. Neither the public patrol nor NPC testimony is firsthand proof.
const TRAP_MARK_FIRSTHAND = { op: "and", of: [
  ARROWS_TOLD,
  { op: "flag", key: "spring_patrol_trap_found" },
  { op: "rumor", rumor: "rum_spring_trap_mark", source: "obs_loc_forest_spring" },
  { op: "eq", left: { rumor: "rum_spring_trap_mark" }, right: "bandit_mark" },
  { op: "signal", key: "spring_trap_followup", max: 0 },
  { op: "not", of: WELL_RESOLVED }
] };
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
// V2-Core-138 (roadmap M4, World Bible WB-0030 MC-03/MC-04, WB-0031): the main thread's second chapter, "across the
// river". Once act one is over and the realm's unrest has come south with the caravans, someone gathers a band across
// the river: the scarred chief if he lives (MC-03), else one of his old band (MC-04). The world records it
// (`band_gathering`, `fact_band_gathers`, `fact_band_leader`); what a character knows of it comes from people, each
// knowing a different part -- the guild's ledger (the leader only to a guard it knows), the ferryman's eyes, the
// waystation board -- and the elder asks who leads them. Told who, the elder warns the frontier (`frontier_warned`,
// the world's: a successor finds it done). No new place, no actor, no value of the road or the trade changes.
const BAND_GATHERING = { op: "signal", key: "band_gathering", min: 1 };
const KNOWS_BAND_SCARRED = { op: "rumor", rumor: "rum_band_led_by_scarred" };
const KNOWS_BAND_LEADER = { op: "or", of: [KNOWS_BAND_SCARRED, { op: "rumor", rumor: "rum_band_led_by_remnant" }] };
const FRONTIER_WARNED = { op: "flag", key: "frontier_warned" };
// V2-Core-139 (roadmap M5, chapter 3 "변경을 지키는 일", docs/v2/main-story-design.md §2): the band grows one step every
// nine days (`band_strength` 1..6, half as fast once the guild keeps its guards); four ways to answer it --
// tell the guild who leads them, watch the band where it gathers, help the village prepare (`frontier_defense`), and
// take or refuse the lord's offer (MC-02, `lord_pact` 1 taken / 2 refused). Nothing south of the river is attacked
// yet (chapter 4, M6); no caravan, road, ledger or trade value changes.
const BAND_AT = (n) => ({ op: "signal", key: "band_strength", min: n });
const GUILD_KEEPS_GUARDS = { op: "flag", key: "guild_keeps_guards" };
// V2-Core-143 (roadmap M8 balance step 1c, D-121, docs/v2/m8-balance-preregistration.md §8.3, §9): the band's growth step. It was a
// caravan's cadence (three days): the band crossed about day 22, before a guard's purse and the guild's trust could fund any
// preparation (the design's "silver with nothing to buy after day 60"). Nine days: it crosses about day 53, or about day 61
// once the guild keeps its guards -- chosen by the pre-registered rule and confirmed on the hold-out sample
const BAND_GROWTH_MINUTES = 12960;
const LORD_UNDECIDED = { op: "signal", key: "lord_pact", max: 0 };
const DEFENSE_UP = [{ op: "signal", key: "frontier_defense", add: 1 }];
const BAND_SIZE_FACT = {
  op: "if",
  when: BAND_AT(5),
  then: [{ op: "fact", fact: "fact_band_size", set: "host" }],
  else: [{ op: "if", when: BAND_AT(3), then: [{ op: "fact", fact: "fact_band_size", set: "many" }], else: [{ op: "fact", fact: "fact_band_size", set: "few" }] }]
};
// V2-Core-140 (roadmap M6, chapters 4 "강을 건너오는 불길" and 5 "마지막 싸움과 그 뒤", main-story-design.md §3): the band
// crosses once it is six strong, or once six growth steps have passed since it gathered (`band_cycles` counts the gathering's
// own step and each one after) -- smaller, then, if the guild kept its guards. It holds the crossroads three days
// (`raid_days`), then strikes the village: the frontier holds if its preparedness is at least half the band, rounded up
// (under the lord's banner if the frontier took his offer); otherwise it falls. Before that, one who stands before the
// band at the crossroads fights whoever leads it -- the scarred chief if he lives, else his right hand (an actor, D-115)
// -- and, winning, breaks the band; the village calls that name (`org_village` -> self, tag `defender`). The fate is the
// world's (`frontier_fate` 1 name / 2 held / 3 lord's banner / 4 fallen, `fact_ending`); the elder tells it to whoever
// asks, a successor too. North of the river, the caravans, the road, the ledger and the trade are untouched.
const BAND_CROSSED = { op: "flag", key: "band_crossed" };
const BAND_BROKEN = { op: "flag", key: "band_broken" };
const FATE = (n) => ({ op: "signal", key: "frontier_fate", eq: n });
const FATE_DECIDED = { op: "signal", key: "frontier_fate", min: 1 };
const BAND_IN_THE_LAND = { op: "and", of: [BAND_CROSSED, { op: "not", of: BAND_BROKEN }, { op: "not", of: FATE_DECIDED }] };
const DEFENSE_AT = (n) => ({ op: "signal", key: "frontier_defense", min: n });
// preparedness at least half the band, rounded up: 5-6 -> 3, else 2 (a band crosses at least four strong: the gathering's
// step and six growth steps grow even a slowed band to four)
const FRONTIER_HOLDS = { op: "or", of: [DEFENSE_AT(3), { op: "and", of: [{ op: "not", of: BAND_AT(5) }, DEFENSE_AT(2)] }] };
const ENDING = (n, claim) => [{ op: "signal", key: "frontier_fate", add: n }, { op: "fact", fact: "fact_ending", set: claim }];
const VILLAGE_DEFENDER = { op: "relation", from: "org_village", to: "self", tag: "defender" };
// V2-Core-141 (roadmap M2, the first region completed): the region's other places take a hand against the band while it
// is still across the river -- the ferryman watches the river (the band strikes a day later), a call for hands on the
// waystation board and a royal writ for a frontier militia (preparedness +1 each, the writ when the band crosses), and
// the band's stores burnt at its camp (the band one smaller). Each is once for the world
const BAND_ACROSS = { op: "and", of: [BAND_GATHERING, { op: "not", of: BAND_CROSSED }] };
const FERRYMAN_WATCHES = { op: "flag", key: "ferryman_watches" };
const CROWN_WRIT = { op: "flag", key: "crown_writ" };
// V2-Core-142 (roadmap M7, the strongest one's curve; World Bible WB-0030 Q3: the 1.0 apex is legend and recognition): the
// frontier's fate travels north with the next caravan cadence (as the bandits' and the well's word); the castle town then
// tells it, and the royal records post the defender of the frontier -- the one who broke the band. That character, reading
// it there, is known to the realm (`unl_realm_renown`: the apex -- the elder, the guild, the town and the royal city all
// call the name). Strength opens a late challenge: the band's remnants regroup in the woods each week; a seasoned sword
// (swordsmanship 2) can hunt them down for the waystation's bounty
const FATE_NORTH = { op: "flag", key: "fate_word_north" };
const RENOWNED = { op: "unlock", id: "unl_realm_renown" };
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
// V2-Core-130 (#318, MG-046.1 step 1): a guard who comes back from a failed danger job has lost the guild's trust (30) --
// measured in step 0 (no trust gate: a gate made blind play safer and shrank what the news is worth). Only a guard who
// lives: one the road kills on the guild's job dies known, as they were, so the guild remembers them (World Memory) and the
// world's own record of the death (the dead actor) is untouched either way. Placed after the wound, which is remembered as
// the guild knew the guard then. Under 10 the guard is no longer one the guild knows: the ledger's word and the +1 close
// by the existing rule (GUILD_KNOWS) until good escorts earn them back. Provisional game value (R-29)
const DANGER_FAIL_TRUST_LOSS = 30;
const DANGER_FAIL_TRUST = {
  op: "if",
  when: { op: "alive", subject: "self" },
  then: [{ op: "relation", from: "npc_guild_clerk", add: -DANGER_FAIL_TRUST_LOSS }, say("txt_danger_fail_trust")]
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
// Post-J3 travel: field camping is a resource/time decision, not a replacement for
// safe village rest or paid castle lodging. Ruins and hostile camps are excluded.
const FIELD_CAMP_SITES = { op: "or", of: [
  "loc_crossroads", "loc_river_ford", "loc_far_bank", "loc_mill_hamlet", "loc_royal_city"
].map((at) => ({ op: "location", at })) };
const FIELD_CAMP_READY = { op: "and", of: [FIELD_CAMP_SITES, { op: "item", item: "item_mill_bread", min: 1 }] };
// Post-J3 expedition contract: a crate belongs to its carrier, but a completed
// supply route belongs to the world. No new state schema or hidden knowledge.
const WAYSTATION_SUPPLY_UNSET = { op: "and", of: [
  { op: "not", of: { op: "flag", key: "waystation_supply_delivered" } },
  { op: "not", of: { op: "flag", key: "waystation_supply_diverted" } }
] };
const WAYSTATION_SUPPLY_CRATE = { op: "item", item: "item_waystation_supply_crate", min: 1 };
const WAYSTATION_SUPPLY_OPEN_SITES = { op: "or", of: [
  "loc_crossroads", "loc_river_ford", "loc_far_bank", "loc_castle_town", "loc_royal_city"
].map((at) => ({ op: "location", at })) };
// The first delivered crate establishes a staffed route between the far bank
// and the lord's town. Travel remains possible without it by the normal road;
// the paid convoy trades silver and food for time and rest. A forced march is
// available independently but costs health and stamina. Neither option reveals
// unknown routes or introduces new RNG/Save fields.
const NORTH_ROAD_CONVOY_READY = { op: "and", of: [
  { op: "flag", key: "waystation_supply_delivered" },
  { op: "money", min: 3 },
  { op: "item", item: "item_mill_bread", min: 1 }
] };
// A personal trailcraft survey reveals a choice, not an omniscient world map.
// Guiding the supply route benefits all future travellers; salvaging its stores
// yields immediate food and silver but forecloses that improvement permanently.
const NORTH_ROAD_SURVEY_UNSET = { op: "and", of: [
  { op: "not", of: { op: "flag", key: "north_road_guided" } },
  { op: "not", of: { op: "flag", key: "north_road_cache_taken" } }
] };
const NORTH_ROAD_GUIDED_READY = { op: "and", of: [
  { op: "flag", key: "waystation_supply_delivered" },
  { op: "flag", key: "north_road_guided" },
  { op: "money", min: 2 },
  { op: "item", item: "item_mill_bread", min: 1 }
] };
// A world-owned merchant circuit begins only when the road has been marked safe.
// Deliveries replenish one bundle per day, up to three. Two player escorts
// establish a permanent public discount; personal merchant trust stays personal.
// The first shipment can be pledged to local relief or sold privately. Both
// choices are public world history; neither is an inherited personal skill.
const NORTH_SUPPLY_PACT_OPEN = { op: "and", of: [
  { op: "not", of: { op: "flag", key: "north_supply_relief_pact" } },
  { op: "not", of: { op: "flag", key: "north_supply_private_sale" } }
] };
const NORTH_SUPPLY_RELIEF = { op: "flag", key: "north_supply_relief_pact" };
const NORTH_WAYSTATION_STOCK = { op: "signal", key: "north_waystation_stock", min: 1 };
const NORTH_MILL_RELIEF_SPACE = { op: "signal", key: "north_mill_relief_stock", max: 1 };
const NORTH_MILL_RELIEF_STOCK = { op: "signal", key: "north_mill_relief_stock", min: 1 };
// A single real wagon may be held up by an unsafe road. Its cargo is no longer
// at the origin and cannot be delivered or seized twice; the world remembers losses.
const NORTH_RELIEF_STALLED = { op: "signal", key: "north_relief_stalled", min: 1 };
const NORTH_RELIEF_CLEAR = { op: "signal", key: "north_relief_stalled", max: 0 };
// Two lost public convoys cause an observable village shortage. Repair is a
// one-time world project, not erasure of the permanent historical loss count.
const NORTH_RELIEF_SHORTAGE = { op: "and", of: [
  NORTH_SUPPLY_RELIEF,
  { op: "signal", key: "north_relief_losses", min: 2 },
  { op: "not", of: { op: "flag", key: "north_relief_shortage_recovered" } }
] };
const NORTH_RELIEF_NORMAL = { op: "not", of: NORTH_RELIEF_SHORTAGE };
// The public road hosts a separate merchant caravan with a world-owned
// position (0 castle, 1 far bank, 2 mill) and finite cargo. Only travellers
// physically present at a stop can trade with it; no global location hints.
const NORTH_TRADE_AT_FAR_BANK = { op: "and", of: [
  { op: "flag", key: "north_road_guided" },
  { op: "signal", key: "north_trade_stage", eq: 1 }
] };
const NORTH_TRADE_AT_MILL = { op: "and", of: [
  { op: "flag", key: "north_road_guided" },
  { op: "signal", key: "north_trade_stage", eq: 2 }
] };
const NORTH_TRADE_HAS_CARGO = { op: "signal", key: "north_trade_stock", min: 1 };
// A caravan driver can teach the hamlet route only while physically at the
// far-bank stop. Knowing that road is character-owned, not a public signal.
const NORTH_TRADE_ROUTE_KNOWN = { op: "rumor", rumor: "rum_road_hamlet" };
const NORTH_TRADE_PATHFINDER = { op: "unlock", id: "unl_caravan_pathfinder" };
const NORTH_TRADE_RIDE_FUNDS = { op: "or", of: [
  { op: "money", min: 2 },
  { op: "and", of: [NORTH_TRADE_PATHFINDER, { op: "money", min: 1 }] }
] };

// A merchant caravan may donate one of its own bundles to an actual village
// shortage; it cannot manufacture public rations or overfill the mill.
// One shared, finite allocation policy for scheduled arrivals and player
// crossings. Paid mill orders take priority; otherwise preserve historical
// shortage relief. No order or cargo is created by a mere time tick.
const NORTH_TRADE_RELIEF_TRANSFER = northTradeReliefTransfer;

// Successful exploration earns a personal pathfinder credential and takes the
// actual caravan to the mill. Failure leaves its world position and cargo intact.
const NORTH_TRADE_SCOUT_CROSSING = [
  { op: "relation", from: "npc_north_caravan_driver", add: 3 },
  { op: "signal", key: "road_trouble", add: -1 },
  { op: "signal", key: "north_trade_stage", add: 1 },
  NORTH_TRADE_RELIEF_TRANSFER,
  { op: "unlock", id: "unl_caravan_pathfinder" },
  { op: "move", to: "loc_mill_hamlet" }
];

const NORTH_WAYSTATION_RELIABLE = { op: "signal", key: "north_waystation_reliability", min: 2 };
const NORTH_WAYSTATION_BUNDLE_FUNDS = { op: "or", of: [
  { op: "money", min: 3 },
  { op: "and", of: [NORTH_WAYSTATION_RELIABLE, { op: "money", min: 2 }] }
] };
const NORTH_ROAD_MARCH_READY = { op: "and", of: [
  { op: "resource", resource: "stamina", min: 4 },
  { op: "gte", left: { hp: "current" }, right: 3 }
] };
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
// V2-Core-132 (#328, MG-045/046, D-113): the ford and the town -- who knows what of the town's want for frontier flour,
// and who carries it. The merchant knows his want today (exact, his own word); a caravan carries his word south to the
// ferryman (dated: the day the caravan passed, D-112) and, on its way back north, takes a sack of the mill's flour when
// the town wants it and the mill has it -- so the want moves without the player, and the word at the ford can be old.
// The carrier's note (X3-A): flour the merchant has asked for crosses on his account -- the ferryman writes the fare down
// and the next caravan brings the merchant's payment. A note shown with nothing to carry is seen: the ferryman doubts
// the merchant's notes until the merchant has answered for it (the next caravan), and the merchant takes his note back
// and thinks less of the carrier. Provisional game values (R-29); the roles are Canon (C-07, C-12, DC-04, DC-06)
const TOWN_WANTS = { op: "signal", key: "town_flour_wanted", min: 1 };
const MILL_HAS_FLOUR = { op: "signal", key: "mill_flour_stock", min: 1 };
const TOWN_FLOUR_FACT = { op: "if", when: TOWN_WANTS, then: [{ op: "fact", fact: "fact_town_flour", set: "wanted" }], else: [{ op: "fact", fact: "fact_town_flour", set: "enough" }] };
const HAS_NOTE = { op: "item", item: "item_merchant_note", min: 1 };
const NOTES_DOUBTED = { op: "signal", key: "ferry_note_doubt", min: 1 };
const NOTE_MISUSED = { op: "relation", from: "npc_ferryman", to: "self", tag: "note_misused" };
// and the ferryman does not forget it: that carrier's notes are refused for good (their own edge, D-71: not a successor's)
const NOTES_REFUSED = { op: "relation", from: "npc_ferryman", to: "self", tag: "note_refused" };
const MERCHANT_KNOWS = { op: "relation", from: "npc_town_merchant", to: "self", min: 10 };
// the merchant's own word about his want, today
const MERCHANT_FLOUR_WORD = {
  op: "if",
  when: TOWN_WANTS,
  then: [{ op: "rumor", rumor: "rum_town_flour_wanted", source: "npc_town_merchant", confidence: 80, about: "now" }],
  else: [{ op: "rumor", rumor: "rum_town_flour_enough", source: "npc_town_merchant", confidence: 80, about: "now" }]
};
// flour carried on the merchant's note (the note is the ferryman's once shown; the merchant remembers the carriage)
const CARRYING = { op: "relation", from: "npc_town_merchant", to: "self", tag: "carrying" };
// a flour sale: the want falls, the fact follows, the merchant knows a supplier (+5); a carriage on his note is done
const FLOUR_SOLD = [
  { op: "item", item: "item_flour_sack", add: -1 },
  { op: "if", when: TOWN_WANTS, then: [{ op: "signal", key: "town_flour_wanted", add: -1 }] },
  TOWN_FLOUR_FACT,
  { op: "relation", from: "npc_town_merchant", add: 5 },
  { op: "if", when: CARRYING, then: [{ op: "relation", from: "npc_town_merchant", untag: "carrying" }, say("txt_town_merchant_note_back")] }
];
// what a caravan does at the ford (only once the settlements trade): the frontier's flour north, then the town's word to the
// ferryman as the caravan leaves it (`town_word_south` 1 wanted / 2 enough), the carrier's account settled, a misused note
// answered for
const CARAVAN_AT_THE_FORD = {
  op: "if",
  when: HAMLET_TRADES,
  then: [
    { op: "signal", key: "caravan_took_flour", add: -9 },
    {
      op: "if",
      when: { op: "and", of: [TOWN_WANTS, MILL_HAS_FLOUR] },
      then: [
        { op: "signal", key: "mill_flour_stock", add: -1 },
        { op: "signal", key: "town_flour_wanted", add: -1 },
        TOWN_FLOUR_FACT,
        { op: "fact", fact: "fact_caravan_flour", set: "north" },
        { op: "rumor", rumor: "rum_caravan_took_flour", subject: "npc_ferryman", source: "obs_loc_river_ford", confidence: 90, about: "now" },
        // V2-Core-135 (D-114): the miller sold it -- his own reading, a guess (50): "the town must want it"
        { op: "rumor", rumor: "rum_town_flour_caravan_bought", subject: "npc_miller", source: "obs_loc_mill_hamlet", confidence: 50, about: "now" },
        { op: "signal", key: "caravan_took_flour", add: 1 }
      ]
    },
    // V2-Core-134 (#333): the town's word is passed on once the step's own changes are done (`evt_town_word_south`)
    { op: "signal", key: "town_word_due", add: -9 },
    { op: "signal", key: "town_word_due", add: 1 },
    { op: "signal", key: "merchant_ferry_account", add: -99 },
    { op: "signal", key: "ferry_note_doubt", add: -9 },
    {
      op: "if",
      when: NOTE_MISUSED,
      then: [
        { op: "relation", from: "npc_ferryman", untag: "note_misused" },
        { op: "relation", from: "npc_town_merchant", add: -15 },
        { op: "if", when: HAS_NOTE, then: [{ op: "item", item: "item_merchant_note", add: -1 }] },
        { op: "if", when: CARRYING, then: [{ op: "relation", from: "npc_town_merchant", untag: "carrying" }] }
      ]
    }
  ]
};
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
const HAS_DRAWN_SWORD = { op: "or", of: [
  { op: "item", item: "item_iron_sword", equipped: true },
  { op: "item", item: "item_steel_sword", equipped: true }
] };
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
// V2-Core-140 (M6): the last fight, at the crossroads -- the first fight's exchanges (the same checks, damage and
// techniques) against whoever leads the band; one choice (`choice_final_battle`), its options for the chief while he
// lives and for his right hand once he is dead (V2-Core-141: one choice, opened by the action itself).
// The scarred chief's old wound is open to one who knows of it -- the elder's word or how he guards his left side
// (C-14); a village that prepared (preparedness 2) surrounds him with the defender. The leader down, the band breaks
const BAND_BREAKS = [
  { op: "flag", key: "band_broken", value: true },
  ...ENDING(1, "name_remembered"),
  { op: "relation", from: "org_village", add: 20, tag: "defender" },
  { op: "rumor", rumor: "rum_ending_name", source: "obs_loc_crossroads", confidence: 100 },
  say("txt_final_victory")
];
const FINAL_CHOICE = "choice_final_battle";
function finalOptions(key, foe, leads) {
  const choice = FINAL_CHOICE;
  const leading = (requires) => (requires === undefined ? leads : { op: "and", of: [leads, requires] });
  const hitFoe = (add) => ({ op: "hp", subject: foe, add });
  const foeHits = (damage) => ({
    op: "if",
    when: { op: "resource", subject: foe, resource: "stamina", min: 3 },
    then: [{ op: "resource", subject: foe, resource: "stamina", add: -3 }, say("txt_final_heavy_blow"), hitSelf(-(damage + 1))],
    else: [hitSelf(-damage)]
  });
  const exchange = (effects) => [
    { op: "proficiency", id: "combat", add: 5 },
    ...effects,
    {
      op: "if",
      when: { op: "not", of: { op: "alive", subject: foe } },
      then: BAND_BREAKS,
      else: [
        {
          op: "if",
          when: { op: "alive" },
          then: [
            { op: "if", when: { op: "lte", left: { hp: "current", subject: foe }, right: 4 }, then: [say("txt_final_foe_reels")] },
            { op: "choice", choice, sourceId: "act_face_band" }
          ]
        }
      ]
    }
  ];
  const check = (base, stat = "str") => ({ stat, skill: "swordsmanship", tags: ["combat"], difficulty: { base, opposed: { subject: foe, stat } } });
  const strike = {
    great: exchange([hitFoe(-7), say("txt_final_strike_great")]),
    success: exchange([hitFoe(-5), say("txt_final_strike_hit")]),
    partial: exchange([hitFoe(-2), hitSelf(-2), say("txt_fight_trade")]),
    fail: exchange([foeHits(3), say("txt_final_struck")])
  };
  const options = [{ id: `opt_final_${key}_strike`, name: "정면으로 맞붙는다", requires: leading(), check: check(11), minutes: 5, outcomes: strike }];
  if (key === "chief") {
    options.push({
      id: `opt_final_${key}_weak_spot`,
      name: "왼쪽 옆구리의 오래된 상처를 노린다",
      requires: leading({ op: "and", of: [{ op: "or", of: [{ op: "rumor", rumor: "rum_leader_old_wound" }, KNOWS_BAND_SCARRED] }, STAMINA_AT_LEAST(2)] }),
      check: check(9),
      minutes: 5,
      outcomes: payStamina(2, strike)
    });
  }
  options.push(
    {
      id: `opt_final_${key}_with_village`,
      name: "마을 사람들과 함께 에워싼다",
      requires: leading(DEFENSE_AT(2)),
      check: check(9),
      minutes: 5,
      outcomes: strike
    },
    {
      id: `opt_final_${key}_sword_cut`,
      name: "손에 든 검으로 베어 든다",
      requires: leading({ op: "or", of: [{ op: "item", item: "item_iron_sword", equipped: true }, { op: "item", item: "item_steel_sword", equipped: true }] }),
      check: check(10),
      minutes: 5,
      outcomes: strike
    },
    {
      id: `opt_final_${key}_guarded_stance`,
      name: "방어 자세로 틈을 노린다 (기력 2)",
      requires: leading({ op: "and", of: [{ op: "unlock", id: "unl_guarded_stance" }, STAMINA_AT_LEAST(2)] }),
      check: check(11, "dex"),
      minutes: 5,
      outcomes: payStamina(2, {
        great: exchange([hitFoe(-5), say("txt_guarded_stance_hit")]),
        success: exchange([hitFoe(-3), say("txt_guarded_stance_hit")]),
        partial: exchange([hitSelf(-1), say("txt_guarded_stance_block")]),
        fail: exchange([hitSelf(-2), say("txt_guarded_stance_block")])
      })
    },
    {
      id: `opt_final_${key}_breakthrough`,
      name: "돌파 검술로 빈틈을 찌른다 (기력 3)",
      requires: leading({ op: "and", of: [{ op: "unlock", id: "unl_breakthrough_cut" }, HAS_DRAWN_SWORD, STAMINA_AT_LEAST(3)] }),
      check: check(13),
      minutes: 5,
      outcomes: payStamina(3, {
        great: exchange([hitFoe(-11), say("txt_breakthrough_cut_hit")]),
        success: exchange([hitFoe(-8), say("txt_breakthrough_cut_hit")]),
        partial: exchange([hitFoe(-3), hitSelf(-3), say("txt_breakthrough_cut_trade")]),
        fail: exchange([foeHits(5), say("txt_breakthrough_cut_fail")])
      })
    },
    {
      id: `opt_final_${key}_counter`,
      name: "그의 공격을 읽고 받아친다",
      requires: leading({ op: "and", of: [{ op: "unlock", id: "unl_keen_eye" }, STAMINA_AT_LEAST(3)] }),
      check: check(12, "dex"),
      minutes: 5,
      outcomes: payStamina(3, {
        great: exchange([hitFoe(-10), say("txt_fight_counter_great")]),
        success: exchange([hitFoe(-7), say("txt_fight_counter_hit")]),
        partial: exchange([hitSelf(-1), say("txt_fight_counter_graze")]),
        fail: exchange([foeHits(4), say("txt_final_counter_miss")])
      })
    },
    // breaking off: back to the village; the band still holds the crossroads and its days still run
    {
      id: `opt_final_${key}_flee`,
      name: "물러서서 마을로 달아난다",
      requires: leading(),
      minutes: 45,
      effects: [{ op: "relation", from: foe, add: -10 }, { op: "move", to: "loc_village" }, say("txt_final_flee")]
    }
  );
  return options;
}

import { ruinsExpedition } from './ruins-expedition.js';
import { ruinsWatchpost } from './ruins-watchpost.js';
import { ruinsRaider } from './ruins-raider.js';
import { ruinsGuideConvoy, northTradeReliefTransfer, northTradeCharterDepotAllocation, northTradeCharterProcurement, northTradeCharterReturn } from './ruins-guide-convoy.js';

export const worldData = {
  formatVersion: 1,
  id: "frontier_village_pack",
  version: "0.3.0",
  world: {
    id: "frontier_village",
    growthSystemId: "growth_wanderer",
    startTemplateId: "start_wanderer",
    // V2-Core-151 (J3, the voice): read by the UI only, never by the engine. The prologue a new character opens with, by
    // background; and what the character means to do now -- the first goal of each track whose `when` holds, from what
    // the character knows (its rumours) and what it has done (cases), never from the world's hidden state
    prologue: {
      start_wanderer: ["txt_prologue_levy", "txt_prologue_south", "txt_prologue_name", "txt_prologue_forest", "txt_prologue_well", "txt_prologue_purse"],
      start_scout: ["txt_prologue_scout_levy", "txt_prologue_south", "txt_prologue_name", "txt_prologue_forest", "txt_prologue_well", "txt_prologue_scout_purse"]
    },
    goals: [
      { track: "main", textId: "goal_after", when: { op: "or", of: ["rum_ending_name", "rum_ending_held", "rum_ending_lord", "rum_ending_fell"].map((rumor) => ({ op: "rumor", rumor })) } },
      { track: "main", textId: "goal_face_band", when: { op: "rumor", rumor: "rum_band_crossed" } },
      { track: "main", textId: "goal_watch_crossing", when: { op: "rumor", rumor: "rum_frontier_warned" } },
      { track: "main", textId: "goal_tell_elder_leader", when: { op: "or", of: [{ op: "rumor", rumor: "rum_band_led_by_scarred" }, { op: "rumor", rumor: "rum_band_led_by_remnant" }] } },
      { track: "main", textId: "goal_who_gathers", when: { op: "rumor", rumor: "rum_elder_asks_band" } },
      { track: "main", textId: "goal_road_open", when: { op: "case", case: "case_ruins_mystery", stage: "resolved" } },
      { track: "main", textId: "goal_settle_bandits", when: { op: "flag", key: "ruins_secret_confirmed" } },
      // First-play guidance: preparation and arrival are visible progress, read only from my own knowledge and kit.
      { track: "main", textId: "goal_search_ruins_here", when: { op: "and", of: [{ op: "rumor", rumor: "rum_ruins_secret" }, { op: "location", at: "loc_ruins" }, { op: "or", of: [{ op: "item", item: "item_lantern", min: 1 }, { op: "trait", trait: "night_vision" }] }] } },
      { track: "main", textId: "goal_leave_market", when: { op: "and", of: [{ op: "rumor", rumor: "rum_ruins_secret" }, { op: "item", item: "item_lantern", min: 1 }, { op: "location", at: "loc_market" }] } },
      { track: "main", textId: "goal_search_ruins_ready", when: { op: "and", of: [{ op: "rumor", rumor: "rum_ruins_secret" }, { op: "item", item: "item_lantern", min: 1 }] } },
      { track: "main", textId: "goal_search_ruins_night", when: { op: "and", of: [{ op: "rumor", rumor: "rum_ruins_secret" }, { op: "trait", trait: "night_vision" }] } },
      { track: "main", textId: "goal_search_ruins", when: { op: "rumor", rumor: "rum_ruins_secret" } },
      { track: "main", textId: "goal_meet_elder", when: { op: "always" } },
      { track: "well", textId: "goal_well_cause", when: { op: "and", of: [{ op: "rumor", rumor: "rum_spring_cause" }, { op: "not", of: { op: "case", case: "case_fouled_well", stage: "resolved" } }] } },
      { track: "well", textId: "goal_well_source", when: { op: "and", of: [{ op: "rumor", rumor: "rum_well_source" }, { op: "not", of: { op: "case", case: "case_fouled_well", stage: "resolved" } }] } },
      { track: "well", textId: "goal_well_sick", when: { op: "and", of: [{ op: "not", of: { op: "rumor", rumor: "rum_well_fate" } }, { op: "not", of: { op: "rumor", rumor: "rum_well_legend" } }, { op: "not", of: { op: "case", case: "case_fouled_well", stage: "resolved" } }] } }
    ],
    // V2-Core-154 (D-132): how each person greets me when I come to talk, by what is between us and the hour -- the
    // first that holds. Read by the UI only
    // V2-Core-156 (D-134): what a life can be remembered for, and how the frontier's story closes -- the chronicle's
    // words, read by the UI only. A deed counts for a life when it comes true during that life
    deeds: [{"id":"deed_ruins_found","when":{"op":"flag","key":"ruins_secret_confirmed"}},{"id":"deed_bandits_gone","when":{"op":"case","case":"case_ruins_mystery","stage":"resolved"}},{"id":"deed_leader_fell","when":{"op":"and","of":[{"op":"case","case":"case_ruins_mystery","stage":"resolved"},{"op":"not","of":{"op":"alive","subject":"npc_bandit_leader"}}]}},{"id":"deed_spring","when":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"id":"deed_honored","when":{"op":"flag","key":"village_honored"}},{"id":"deed_herb_stock","when":{"op":"flag","key":"herbalist_stock_established"}},{"id":"deed_north","when":{"op":"flag","key":"frontier_seen_far_bank"}},{"id":"deed_royal","when":{"op":"flag","key":"frontier_seen_royal"}},{"id":"deed_guard","when":{"op":"relation","from":"npc_guild_clerk","to":"self","min":10}},{"id":"deed_lead","when":{"op":"unlock","id":"unl_road_lead"}},{"id":"deed_warned","when":{"op":"flag","key":"frontier_warned"}},{"id":"deed_prepared","when":{"op":"rumor","rumor":"rum_frontier_prepared"}},{"id":"deed_stores","when":{"op":"flag","key":"band_stores_burnt"}},{"id":"deed_band_broken","when":{"op":"flag","key":"band_broken"}},{"id":"deed_renown","when":{"op":"unlock","id":"unl_realm_renown"}},{"id":"deed_deserter","when":{"op":"flag","key":"deserter_sent_south"}},{"id":"deed_mill","when":{"op":"and","of":[{"op":"flag","key":"enc_mill_wheel_done"},{"op":"relation","from":"npc_miller","to":"self","min":10}]}},{"id":"deed_slipped","when":{"op":"flag","key":"enc_followed_done"}}],
    endings: [{"id":"end_name","rumor":"rum_ending_name"},{"id":"end_held","rumor":"rum_ending_held"},{"id":"end_lord","rumor":"rum_ending_lord"},{"id":"end_fell","rumor":"rum_ending_fell"}],
    greetings: {"choice_elder_dialogue":[{"when":{"op":"rumor","rumor":"rum_ending_fell"},"textId":"greet_elder_fell"},{"when":{"op":"or","of":[{"op":"flag","key":"village_honored"},{"op":"relation","from":"org_village","to":"self","tag":"trusted"}]},"textId":"greet_elder_honored"},{"when":{"op":"and","of":[{"op":"day","hourFrom":22,"hourTo":4},{"op":"relation","from":"npc_elder","to":"self","tag":"confidant"}]},"textId":"greet_elder_night_confidant"},{"when":{"op":"day","hourFrom":22,"hourTo":4},"textId":"greet_elder_night"},{"when":{"op":"relation","from":"npc_elder","to":"self","tag":"confidant"},"textId":"greet_elder_confidant"},{"when":{"op":"relation","from":"npc_elder","to":"self","min":1},"textId":"greet_elder_known"},{"when":{"op":"always"},"textId":"greet_elder_stranger"}],"choice_herbalist_dialogue":[{"when":{"op":"relation","from":"org_village","to":"self","tag":"trusted"},"textId":"greet_herbalist_trusted"},{"when":{"op":"relation","from":"npc_herbalist","to":"self","tag":"purifier"},"textId":"greet_herbalist_purifier"},{"when":{"op":"day","hourFrom":22,"hourTo":4},"textId":"greet_herbalist_night"},{"when":{"op":"relation","from":"npc_herbalist","to":"self","tag":"consulted"},"textId":"greet_herbalist_known"},{"when":{"op":"always"},"textId":"greet_herbalist_stranger"}],"choice_miller_dialogue":[{"when":{"op":"relation","from":"npc_miller","to":"self","tag":"welcomed"},"textId":"greet_miller_welcomed"},{"when":{"op":"always"},"textId":"greet_miller_stranger"}],"choice_ferryman_dialogue":[{"when":{"op":"relation","from":"npc_ferryman","to":"self","tag":"note_misused"},"textId":"greet_ferryman_misused"},{"when":{"op":"flag","key":"ferryman_watches"},"textId":"greet_ferryman_watching"},{"when":{"op":"relation","from":"npc_ferryman","to":"self","min":1},"textId":"greet_ferryman_known"},{"when":{"op":"always"},"textId":"greet_ferryman_stranger"}],"choice_town_merchant_dialogue":[{"when":{"op":"relation","from":"npc_town_merchant","to":"self","tag":"carrying"},"textId":"greet_town_merchant_carrying"},{"when":{"op":"relation","from":"npc_town_merchant","to":"self","min":10},"textId":"greet_town_merchant_supplier"},{"when":{"op":"always"},"textId":"greet_town_merchant_stranger"}],"choice_guild_clerk_dialogue":[{"when":{"op":"relation","from":"npc_guild_clerk","to":"self","tag":"renowned"},"textId":"greet_guild_clerk_renowned"},{"when":{"op":"relation","from":"npc_guild_clerk","to":"self","min":10},"textId":"greet_guild_clerk_known"},{"when":{"op":"always"},"textId":"greet_guild_clerk_stranger"}]}
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
    ...ruinsRaider.events,
    ...ruinsGuideConvoy.events,
    // J3 (#426): the elder needs a full day after hearing first-hand arrows
    // before villagers can mark the worst miasma pockets. This is a public,
    // world-owned follow-up, not an inherited personal guess. One tick begins
    // on the report step; a second tick 1440 minutes later deploys the patrol.
    // Purifying the spring first cancels the remaining work. No extra RNG.
    evt_spring_a_patrol_progress: {
      trigger: { op: "and", of: [
        ARROWS_TOLD,
        { op: "not", of: WELL_RESOLVED },
        { op: "not", of: { op: "flag", key: "spring_patrol_deployed" } },
        { op: "signal", key: "spring_patrol_progress", max: 1 }
      ] },
      cooldown: 1440,
      catchUp: true,
      effects: [
        { op: "signal", key: "spring_patrol_progress", add: 1 },
        { op: "if", when: { op: "signal", key: "spring_patrol_progress", eq: 2 },
          then: [
            { op: "flag", key: "spring_patrol_deployed", value: true },
            // The villagers can discover the existing snare only while it
            // remains in place. The lead is public; no player learns it yet.
            { op: "if", when: { op: "not", of: { op: "flag", key: "enc_spring_trap_done" } },
              then: [
                { op: "fact", fact: "fact_spring_trap", set: "bandit_mark" },
                { op: "flag", key: "spring_patrol_trap_found", value: true }
              ] }
          ] }
      ]
    },
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
        ...CLAMP_OWED,
        // V2-Core-132 (#328, D-113): what the caravan carries past the ford
        CARAVAN_AT_THE_FORD
      ]
    },
    // Post-J3: merchants respond autonomously to the marked public road.
    // The cadence keeps running at full capacity so an old backlog cannot
    // refill the entire store instantly after a single purchase.
    evt_north_waystation_merchant: {
      trigger: { op: "flag", key: "north_road_guided" },
      cooldown: 1440,
      catchUp: true,
      effects: [
        // The millers' public relief pact draws an additional shared ration
        // shipment when space allows. The three-bundle warehouse cap remains.
        { op: "if", when: { op: "signal", key: "north_waystation_stock", max: 2 },
          then: [
            { op: "signal", key: "north_waystation_stock", add: 1 },
            { op: "if", when: { op: "and", of: [NORTH_SUPPLY_RELIEF,
              { op: "signal", key: "north_waystation_stock", max: 2 }] },
              then: [{ op: "signal", key: "north_waystation_stock", add: 1 }] }
          ] },
        // A real three-stop merchant route, advanced by the same daily tick:
        // castle -> far bank -> mill -> castle. Dangerous roads hold the wagon
        // at the far bank until a player escorts it or the road clears.
        { op: "if", when: { op: "signal", key: "north_trade_stage", eq: 0 },
          then: [
            { op: "signal", key: "north_trade_stage", add: 1 },
            // Each REAL new departure brings a bounded six-silver operating
            // allocation. Old saves default to zero until the next departure.
            // Once a chartered route returns, it purchases actual castle
            // grain using finite merchant capital. Unchartered and first-trip
            // legacy routes retain their historical operating allocation.
            { op: "if", when: { op: "not", of: { op: "flag", key: "ruins_guide_procurement_active" } },
              then: [
                { op: "if", when: { op: "signal", key: "ruins_guide_caravan_treasury", max: 6 },
                  then: [{ op: "signal", key: "ruins_guide_caravan_treasury", add: 6 }] },
                { op: "if", when: { op: "signal", key: "north_trade_stock", max: 0 },
                  then: [{ op: "signal", key: "north_trade_stock", add: 2 }] }
              ] },
            northTradeCharterProcurement,
            // A signed regional charter governs the REAL newly loaded cargo.
            // This is after replenishment, so old Saves and unchartered routes
            // retain their previous behavior.
            northTradeCharterDepotAllocation
          ], else: [
            { op: "if", when: { op: "signal", key: "north_trade_stage", eq: 1 },
              then: [
                { op: "if", when: { op: "signal", key: "road_trouble", max: 1 },
                  then: [
                    { op: "signal", key: "north_trade_stage", add: 1 },
                    NORTH_TRADE_RELIEF_TRANSFER
                  ] }
              ], else: [
                { op: "if", when: { op: "signal", key: "north_trade_stage", eq: 2 },
                  then: [
                    { op: "signal", key: "north_trade_stage", add: -2 },
                    northTradeCharterReturn,
                    { op: "if", when: { op: "not", of: { op: "flag", key: "ruins_guide_procurement_active" } },
                      then: [{ op: "if", when: { op: "signal", key: "north_trade_stock", max: 1 },
                        then: [
                          { op: "signal", key: "north_trade_stock", add: 1 },
                          { op: "if", when: { op: "signal", key: "north_trade_stock", eq: 1 },
                            then: [{ op: "signal", key: "north_trade_stock", add: 1 }] }
                        ] }] }
                  ] }
              ] }
          ] }
      ]
    },
    // The village's miller organizes a real, bounded daily relief wagon, even
    // when the player is elsewhere. It draws from public waystation inventory
    // rather than conjuring food; full village storage halts deliveries.
    evt_north_waystation_relief_delivery: {
      trigger: NORTH_SUPPLY_RELIEF,
      cooldown: 1440,
      catchUp: true,
      effects: [
        // Exactly one wagon can be in transit. If it is already stalled,
        // recover that same cargo on a safer day before dispatching more.
        { op: "if", when: NORTH_RELIEF_STALLED,
          then: [
            { op: "if", when: { op: "and", of: [
              { op: "signal", key: "road_trouble", max: 1 }, NORTH_MILL_RELIEF_SPACE
            ] }, then: [
              { op: "signal", key: "north_relief_stalled", add: -1 },
              { op: "signal", key: "north_mill_relief_stock", add: 1 }
            ] }
          ],
          else: [
            { op: "if", when: { op: "and", of: [NORTH_WAYSTATION_STOCK, NORTH_MILL_RELIEF_SPACE] },
              then: [
                { op: "signal", key: "north_waystation_stock", add: -1 },
                { op: "if", when: { op: "signal", key: "road_trouble", min: 2 },
                  then: [{ op: "signal", key: "north_relief_stalled", add: 1 }],
                  else: [{ op: "signal", key: "north_mill_relief_stock", add: 1 }] }
              ] }
          ] }
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
      effects: [{ op: "signal", key: "town_flour_wanted", add: 2 }, TOWN_FLOUR_FACT]
    },
    // V2-Core-134 (#333): the town's want as the caravan leaves it, to the ferryman -- after the caravan's own sack and after
    // the want's return (`evt_town_flour_demand`, earlier in the id-ascending pass), so the word is the want the step ends with
    evt_town_word_south: {
      trigger: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "town_word_due", min: 1 }] },
      effects: [
        { op: "signal", key: "town_word_south", add: -9 },
        {
          op: "if",
          when: TOWN_WANTS,
          then: [{ op: "rumor", rumor: "rum_town_flour_wanted", subject: "npc_ferryman", source: "npc_town_merchant", confidence: 70, about: "now" }, { op: "signal", key: "town_word_south", add: 1 }],
          else: [{ op: "rumor", rumor: "rum_town_flour_enough", subject: "npc_ferryman", source: "npc_town_merchant", confidence: 70, about: "now" }, { op: "signal", key: "town_word_south", add: 2 }]
        },
        { op: "signal", key: "town_word_due", add: -9 }
      ]
    },
    evt_mill_flour_stock: {
      trigger: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "mill_flour_stock", max: 0 }] },
      cooldown: 1440,
      effects: [{ op: "signal", key: "mill_flour_stock", add: 2 }]
    },
    // After the frontier's fate, the herbalist can keep a shared supply. A submitted batch begins its own clock;
    // one salve is ready on each of the next two days, whether this character stays nearby or lives to collect it.
    evt_herbalist_brews: {
      trigger: { op: "and", of: [{ op: "flag", key: "herbalist_stock_established" }, { op: "signal", key: "herbalist_brew_due", min: 1 }] },
      restartWhen: { op: "signal", key: "herbalist_brew_due", eq: 3 },
      cooldown: 1440,
      catchUp: true,
      effects: [
        {
          op: "if",
          when: { op: "and", of: [{ op: "signal", key: "herbalist_brew_due", max: 2 }, { op: "signal", key: "herbalist_salve_stock", max: 1 }] },
          then: [{ op: "signal", key: "herbalist_salve_stock", add: 1 }]
        },
        { op: "signal", key: "herbalist_brew_due", add: -1 }
      ]
    },
    // V2-Core-88 (#217): the first time anyone reaches the royal city (narration, once for the world)
    evt_royal_city_first: {
      trigger: { op: "location", at: "loc_royal_city" },
      once: true,
      // V2-Core-141 (M2): the first traveller from the frontier in years is noticed here -- the world's record of it
      effects: [say("txt_royal_city_first"), { op: "flag", key: "frontier_seen_royal", value: true }, { op: "fact", fact: "fact_frontier_seen_royal", set: "noticed" }]
    },
    // V2-Core-76 (#189): the first time anyone reaches the castle town (narration, once for the world)
    evt_castle_town_first: {
      trigger: { op: "location", at: "loc_castle_town" },
      once: true,
      // V2-Core-141 (M2): the first traveller from the frontier in years is noticed here -- the world's record of it
      effects: [say("txt_castle_town_first"), { op: "flag", key: "frontier_seen_town", value: true }, { op: "fact", fact: "fact_frontier_seen_town", set: "noticed" }]
    },
    evt_far_bank_first: {
      trigger: { op: "location", at: "loc_far_bank" },
      once: true,
      // V2-Core-141 (M2): the first traveller from the frontier in years is noticed here -- the world's record of it
      effects: [say("txt_far_bank_first"), { op: "flag", key: "frontier_seen_far_bank", value: true }, { op: "fact", fact: "fact_frontier_seen_far_bank", set: "noticed" }]
    },
    // V2-Core-73 (#180): the hamlet's carts reach the market (narration, once for the world)
    evt_hamlet_carts: {
      trigger: { op: "and", of: [{ op: "location", at: "loc_market" }, HAMLET_TRADES] },
      once: true,
      // V2-Core-141 (M2): the carts come in by the east road -- the way to the hamlet, seen at the market
      effects: [say("txt_hamlet_carts"), { op: "rumor", rumor: "rum_road_hamlet", source: "obs_loc_market", confidence: 70 }]
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
        // The herbalist's own gift and a still-carried herb soften a failed
        // exposure, not the CON roll itself. Other characters still take 2 HP.
        fail: [{
          op: "if",
          when: { op: "and", of: [
            { op: "relation", from: "npc_herbalist", to: "self", tag: "spring_inquiry_herb_given" },
            { op: "item", item: "item_purifying_herb", min: 1 }
          ] },
          then: [{ op: "hp", add: -1 }, say("txt_spring_miasma_prepared")],
          // After a full day the village patrol's marked path gives the
          // same bounded mitigation to anyone, including a successor. A
          // personal herbalist gift takes precedence; the two do not stack.
          else: [{
            op: "if",
            when: { op: "flag", key: "spring_patrol_deployed" },
            then: [{ op: "if", when: { op: "signal", key: "spring_trap_followup", eq: 1 },
              then: [say("txt_spring_miasma_route_reinforced")],
              else: [{ op: "hp", add: -1 }, say("txt_spring_miasma_patrol")] }],
            else: [{ op: "hp", add: -2 }, say("txt_spring_miasma")]
          }]
        }]
      }
    },
    evt_ruins_hazard: {
      trigger: { op: "location", at: "loc_ruins" },
      cooldown: 30,
      // The watch's loan includes advice about a safer approach to the
      // unstable walls. A purchased lantern alone does not imply that advice.
      effects: [{
        op: "if",
        when: { op: "and", of: [
          { op: "relation", from: "npc_elder", to: "self", tag: "spring_watch_lantern_loaned" },
          { op: "item", item: "item_lantern", min: 1 }
        ] },
        then: [{ op: "hp", add: -2 }, say("txt_ruins_watch_safe_path")],
        else: [{ op: "hp", add: -4 }, say("txt_ruins_hazard")]
      }]
    },
    // V2-Core-138 (M4): act one over, the realm's unrest heard (the third caravan) -- across the river a band gathers. Its id
    // sorts after evt_caravan, so it fires in the very step the third caravan brings the unrest (D-51 order)
    evt_unrest_band_gathers: {
      trigger: { op: "and", of: [BANDITS_GONE, { op: "signal", key: "caravan_visits", min: 3 }] },
      once: true,
      effects: [
        { op: "signal", key: "band_gathering", add: 1 },
        { op: "fact", fact: "fact_band_gathers", set: "gathering" },
        { op: "if", when: LEADER_LIVES, then: [{ op: "fact", fact: "fact_band_leader", set: "scarred_chief" }], else: [{ op: "fact", fact: "fact_band_leader", set: "chief_right_hand" }] }
      ]
    },
    // V2-Core-139 (M5): the band grows a step every growth step (nine days since V2-Core-143, D-121), to six; once the guild
    // keeps its guards, every other step (`band_growth_skip` alternates). Its id sorts after the gathering, so the first
    // step is the gathering's own (strength 1)
    evt_unrest_band_grows: {
      trigger: { op: "and", of: [BAND_GATHERING, { op: "not", of: BAND_AT(6) }, { op: "not", of: BAND_CROSSED }] },
      cooldown: BAND_GROWTH_MINUTES,
      catchUp: true,
      effects: [
        // V2-Core-140 (M6): the growth steps since the gathering, its own step the first
        { op: "signal", key: "band_cycles", add: 1 },
        {
          op: "if",
          when: { op: "and", of: [GUILD_KEEPS_GUARDS, { op: "signal", key: "band_growth_skip", min: 1 }] },
          then: [{ op: "signal", key: "band_growth_skip", add: -9 }],
          else: [
            { op: "signal", key: "band_strength", add: 1 },
            { op: "if", when: GUILD_KEEPS_GUARDS, then: [{ op: "signal", key: "band_growth_skip", add: 1 }] }
          ]
        },
        BAND_SIZE_FACT
      ]
    },
    // V2-Core-140 (M6): the band crosses -- six strong, or the gathering and six growth steps on. Its id sorts before the
    // gathering's and the growth's, so it reads the band as the step before left it
    evt_unrest_band_crosses: {
      trigger: { op: "and", of: [BAND_GATHERING, { op: "or", of: [BAND_AT(6), { op: "signal", key: "band_cycles", min: 7 }] }] },
      once: true,
      effects: [
        { op: "flag", key: "band_crossed", value: true },
        { op: "fact", fact: "fact_band_crossed", set: "crossed" },
        { op: "fact", fact: "fact_raid", set: "coming" },
        // V2-Core-141: the royal writ -- the frontier raises its militia as the band comes
        { op: "if", when: CROWN_WRIT, then: DEFENSE_UP }
      ]
    },
    // the days the band holds the crossroads: the crossing's own step the first (its id sorts after the crossing's)
    evt_unrest_raid_day: {
      trigger: BAND_IN_THE_LAND,
      cooldown: 1440,
      catchUp: true,
      effects: [{ op: "signal", key: "raid_days", add: 1 }]
    },
    // three days on, the band strikes the village; the frontier's fate (sorts after the day's count)
    // V2-Core-142 (M7): the frontier's fate goes north -- a caravan cadence after it is decided (its own step the first)
    evt_unrest_word_north: {
      trigger: { op: "and", of: [FATE_DECIDED, { op: "flag", key: "road_walked" }, { op: "signal", key: "fate_word_age", max: 1 }] },
      cooldown: 4320,
      catchUp: true,
      effects: [
        { op: "signal", key: "fate_word_age", add: 1 },
        {
          op: "if",
          when: { op: "signal", key: "fate_word_age", eq: 2 },
          then: [
            { op: "flag", key: "fate_word_north", value: true },
            // V2-Core-149 (D-127, #371): the world's fact of it (as the first arrivals' flag and fact, V2-Core-141), and the
            // ferryman's own word -- the caravans that carried it crossed at his ford; he passes it on when asked
            { op: "fact", fact: "fact_fate_word", set: "north" },
            { op: "rumor", rumor: "rum_fate_word_north", subject: "npc_ferryman", source: "obs_loc_river_ford", confidence: 80, about: "now" }
          ]
        }
      ]
    },
    // V2-Core-142 (M7): the remnants regroup -- a day at a time, from the hunt's week
    evt_unrest_remnants_regroup: {
      trigger: { op: "signal", key: "remnants_quiet", min: 1 },
      restartWhen: { op: "signal", key: "remnants_quiet", eq: 8 },
      cooldown: 1440,
      catchUp: true,
      effects: [
        { op: "signal", key: "remnants_quiet", add: -1 },
        // V2-Core-149 (D-127, #371): back in the woods -- the world's fact, which the waystation's board posts
        { op: "if", when: { op: "signal", key: "remnants_quiet", max: 0 }, then: [{ op: "fact", fact: "fact_remnants", set: "regrouped" }] }
      ]
    },
    evt_unrest_raid_strikes: {
      trigger: {
        op: "and",
        of: [BAND_IN_THE_LAND, { op: "signal", key: "raid_days", min: 4 }, { op: "or", of: [{ op: "not", of: FERRYMAN_WATCHES }, { op: "signal", key: "raid_days", min: 5 }] }]
      },
      once: true,
      effects: [
        { op: "fact", fact: "fact_raid", set: "struck" },
        {
          op: "if",
          when: FRONTIER_HOLDS,
          then: [{ op: "if", when: { op: "signal", key: "lord_pact", eq: 1 }, then: ENDING(3, "lord_banner"), else: ENDING(2, "frontier_held") }],
          else: ENDING(4, "frontier_fell")
        }
      ]
    }
  },

  locations: {
    ...ruinsExpedition.locations,
    ...ruinsWatchpost.locations,
    loc_village: {
      name: "변경 마을",
      links: [
        { to: "loc_market", minutes: 15 },
        { to: "loc_ruins_watchpost", minutes: 25, requires: { op: "flag", key: "ruins_watchpost_restored" } },
        // V2-Core-53 (D-82): a lantern, or night vision (the scout's trait)
        { to: "loc_ruins", minutes: 45, requires: LIGHT_OR_NIGHT_VISION },
        { to: 'loc_ruins_cellar', minutes: 20, requires: { op: 'flag', key: 'ruins_cellar_refuge' } },
        { to: 'loc_ruins_lower_vault', minutes: 30, requires: { op: 'flag', key: 'ruins_lower_public' } },
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
      links: [
        { to: "loc_village", minutes: 45 },
        { to: 'loc_ruins_cellar', minutes: 20, requires: {
          op: 'and', of: [{ op: 'unlock', id: 'unl_ruins_cellar_route' }, LIGHT_OR_NIGHT_VISION]
        } }
      ]
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
        { to: "loc_royal_city", minutes: 7200, requires: { op: "rumor", rumor: "rum_royal_city" } },
        // V2-Core-139 (M5): up the north woods' path, where the band gathers -- for one who has heard of it
        { to: "loc_band_camp", minutes: 240, requires: { op: "rumor", rumor: "rum_band_camp_way" } }
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
    },
    // V2-Core-139 (M5): the woods beyond the waystation where the band across the river gathers (no name)
    loc_band_camp: {
      name: "북쪽 숲 너머",
      links: [{ to: "loc_far_bank", minutes: 240 }]
    }
  },

  actions: {
    ...ruinsExpedition.actions,
    ...ruinsWatchpost.actions,
    ...ruinsRaider.actions,
    ...ruinsGuideConvoy.actions,
    act_observe_village: {
      name: "마을 사람들 사이에 섞여 귀를 기울인다",
      requires: { op: "location", at: "loc_village" },
      effects: [
        { op: "proficiency", id: "investigation", add: 15 },
        { op: "narrate", textId: "txt_observe_village" },
        // V2-Core-141 (M2): what was found in the ruins is the village's talk until the case is closed
        {
          op: "if",
          when: { op: "and", of: [{ op: "flag", key: "ruins_secret_confirmed" }, { op: "not", of: { op: "case", case: "case_ruins_mystery", stage: "resolved" } }] },
          then: [say("txt_village_whispers_ruins")]
        }
      ]
    },
    // J3 post-RC1: a *real* decision before proof, not a saved UI guess.
    // Both actions use the ordinary engine, are mutually exclusive for the world,
    // and have different elder trust and later dialogue. Neither declares the truth.
    act_request_spring_watch: {
      name: "폐허와 샘의 연관성을 의심하며 원로에게 경계를 청한다",
      requires: { op: "and", of: [{ op: "location", at: "loc_village" }, SPRING_DECISION_OPEN] },
      minutes: 10,
      effects: [
        { op: "flag", key: "spring_watch_requested", value: true },
        { op: "relation", from: "npc_elder", add: -2, tag: "spring_watch_requested" },
        say("txt_spring_watch_requested")
      ]
    },
    act_request_spring_inquiry: {
      name: "두 사건을 단정하지 말고 조사하자고 원로에게 말한다",
      requires: { op: "and", of: [{ op: "location", at: "loc_village" }, SPRING_DECISION_OPEN] },
      minutes: 10,
      effects: [
        { op: "flag", key: "spring_inquiry_requested", value: true },
        { op: "relation", from: "npc_elder", add: 2, tag: "spring_inquiry_requested" },
        say("txt_spring_inquiry_requested")
      ]
    },
    // J3 #428: the player may spend two hours and stamina helping the villagers
    // mark the spring route now, instead of waiting a full day for the same
    // world-owned mitigation. The event above will not fire again afterward.
    // A legacy save with a public report but no progress signal also works.
    act_help_mark_spring_route: {
      name: "마을 사람들과 샘길 표식을 놓는다 (2시간, 기력 2)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_village" }, ARROWS_TOLD,
        { op: "not", of: WELL_RESOLVED },
        { op: "not", of: { op: "flag", key: "spring_patrol_deployed" } },
        STAMINA_AT_LEAST(2)
      ] },
      minutes: 120,
      effects: [
        { op: "resource", resource: "stamina", add: -2 },
        // Both old and new saves finish with progress 2. This is a record
        // of completed work, not a new independent scheduler.
        { op: "if", when: { op: "signal", key: "spring_patrol_progress", max: 0 },
          then: [{ op: "signal", key: "spring_patrol_progress", add: 2 }],
          else: [{ op: "signal", key: "spring_patrol_progress", add: 1 }] },
        { op: "flag", key: "spring_patrol_deployed", value: true },
        { op: "flag", key: "spring_patrol_helped", value: true },
        // Helping now and waiting a day yield the same causal discovery.
        { op: "if", when: { op: "not", of: { op: "flag", key: "enc_spring_trap_done" } },
          then: [
            { op: "fact", fact: "fact_spring_trap", set: "bandit_mark" },
            { op: "flag", key: "spring_patrol_trap_found", value: true }
          ] },
        say("txt_spring_patrol_helped")
      ]
    },
    // V2-Core-64 (#160): the well -- PER (what one notices) with the investigation skill. A success
    // records where the water comes from (the world's fact) and the character sees it first-hand
    act_inspect_well: {
      name: "우물물을 길어 냄새를 맡아 본다",
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
      name: "약초꾼에게 말을 건다",
      requires: { op: "location", at: "loc_market" },
      effects: [{ op: "choice", choice: "choice_herbalist_dialogue", sourceId: "act_talk_herbalist" }]
    },
    // V2-Core-64 (#160): searching the spring -- PER with the investigation skill, under the miasma
    act_search_spring: {
      name: "샘 주변을 뒤져 본다",
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
      name: "정화제를 샘에 붓는다",
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
      name: "물가에서 정화초를 찾는다",
      requires: { op: "and", of: [{ op: "location", at: "loc_forest_spring" }, KNOWS_WELL_SOURCE, STAMINA_AT_LEAST(2)] },
      check: { stat: "wis", skill: "herbalism", tags: ["herbalism"], difficulty: "normal" },
      minutes: 30,
      outcomes: payStamina(2, {
        great: [{ op: "item", item: "item_purifying_herb", add: 2 }, { op: "proficiency", id: "herbalism", add: 10 }, HERBS_PICKED, say("txt_gather_herbs_great")],
        success: [{ op: "item", item: "item_purifying_herb", add: 1 }, { op: "proficiency", id: "herbalism", add: 10 }, HERBS_PICKED, say("txt_gather_herbs_success")],
        fail: [{ op: "proficiency", id: "herbalism", add: 5 }, say("txt_gather_herbs_fail")]
      })
    },
    // Post-J3 exploration specialisation. A character learns to read tracks and
    // terrain, then takes short routes ONLY after learning the ordinary roads.
    // The unlock is personal; no hidden destination is exposed by the action view.
    act_survey_trailcraft: {
      name: "갈림길 주변을 측량해 샛길을 익힌다 (기력 2, 90분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_crossroads" },
        { op: "skill", skill: "investigation", min: 1 },
        { op: "not", of: { op: "unlock", id: "unl_trailcraft" } },
        STAMINA_AT_LEAST(2)
      ] },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 90,
      outcomes: {
        great: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 15 }, { op: "unlock", id: "unl_trailcraft" }, say("txt_trailcraft_success")],
        success: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 10 }, { op: "unlock", id: "unl_trailcraft" }, say("txt_trailcraft_success")],
        partial: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 5 }, say("txt_trailcraft_retry")],
        fail: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 5 }, { op: "hp", add: -1 }, say("txt_trailcraft_retry")]
      }
    },
    // Existing 50/40-minute road links remain available for cautious travellers.
    // Shortcut actions trade one stamina for 20/15 minutes, in either direction.
    act_trailcraft_ford_north: {
      name: "발자국이 적은 강나루 샛길로 간다 (기력 1, 30분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_crossroads" }, { op: "unlock", id: "unl_trailcraft" },
        { op: "rumor", rumor: "rum_road_ford" }, STAMINA_AT_LEAST(1)
      ] },
      minutes: 30,
      effects: [{ op: "resource", resource: "stamina", add: -1 }, { op: "move", to: "loc_river_ford" }, say("txt_trailcraft_ford")]
    },
    act_trailcraft_ford_south: {
      name: "강나루에서 숲의 샛길로 갈림길에 돌아간다 (기력 1, 30분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_river_ford" }, { op: "unlock", id: "unl_trailcraft" },
        { op: "rumor", rumor: "rum_road_ford" }, STAMINA_AT_LEAST(1)
      ] },
      minutes: 30,
      effects: [{ op: "resource", resource: "stamina", add: -1 }, { op: "move", to: "loc_crossroads" }, say("txt_trailcraft_ford")]
    },
    act_trailcraft_hamlet_east: {
      name: "물레방아 물길을 따라 마을로 간다 (기력 1, 25분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_crossroads" }, { op: "unlock", id: "unl_trailcraft" },
        { op: "rumor", rumor: "rum_road_hamlet" }, STAMINA_AT_LEAST(1)
      ] },
      minutes: 25,
      effects: [{ op: "resource", resource: "stamina", add: -1 }, { op: "move", to: "loc_mill_hamlet" }, say("txt_trailcraft_hamlet")]
    },
    act_trailcraft_hamlet_west: {
      name: "물레방아 물길을 거슬러 갈림길에 돌아간다 (기력 1, 25분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, { op: "unlock", id: "unl_trailcraft" },
        { op: "rumor", rumor: "rum_road_hamlet" }, STAMINA_AT_LEAST(1)
      ] },
      minutes: 25,
      effects: [{ op: "resource", resource: "stamina", add: -1 }, { op: "move", to: "loc_crossroads" }, say("txt_trailcraft_hamlet")]
    },
    // V2-Core-72 (#180): the milestone -- INT (the worn letters) with the investigation skill. A success
    // records the region's roads (the world's truth) and the character reads them first-hand
    act_read_milestone: {
      name: "닳은 이정표의 글씨를 읽는다",
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
      name: "갈림길 주변의 흔적을 살핀다",
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
      name: "뱃사공에게 말을 건다",
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
        // V2-Core-142 (M7): once the defender's deed has come north, the realm's written word names the frontier at last
        {
          op: "if",
          when: { op: "and", of: [FATE_NORTH, FATE(1)] },
          then: [
            say("txt_royal_records_defender"),
            { op: "rumor", rumor: "rum_ending_name", source: "src_royal_records", confidence: 90 },
            { op: "if", when: { op: "and", of: [VILLAGE_DEFENDER, { op: "not", of: RENOWNED }] }, then: [{ op: "unlock", id: "unl_realm_renown" }, say("txt_royal_records_you")] }
          ],
          else: [say("txt_royal_records_no_frontier")]
        }
      ]
    },
    act_read_castle_notices: {
      name: "성읍의 포고판을 읽는다",
      requires: { op: "location", at: "loc_castle_town" },
      minutes: 20,
      effects: [
        // V2-Core-139 (M5, MC-02): once the band across the river is many, the lord offers the frontier protection --
        // for its men and its tax; until the frontier answers
        {
          op: "if",
          when: { op: "and", of: [BAND_AT(3), LORD_UNDECIDED] },
          then: [{ op: "fact", fact: "fact_lord_offer", set: "posted" }, { op: "rumor", rumor: "rum_lord_offer", observe: true, source: "obs_loc_castle_town", confidence: 90, about: "now" }, say("txt_castle_lord_offer")]
        },
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
        },
        // V2-Core-141 (M2): the first arrivals, remembered -- the frontier road walked again, noted at this gate; and word
        // back from the royal city that a frontier traveller passed its gate (the records there name no frontier, N-06)
        { op: "if", when: { op: "flag", key: "frontier_seen_town" }, then: [{ op: "rumor", rumor: "rum_frontier_seen_town", source: "obs_loc_castle_town", confidence: 80 }, say("txt_castle_frontier_seen")] },
        { op: "if", when: { op: "flag", key: "frontier_seen_royal" }, then: [{ op: "rumor", rumor: "rum_frontier_seen_royal", source: "src_castle_town_talk", confidence: 60 }, say("txt_castle_royal_seen")] },
        // V2-Core-142 (M7): the frontier's fate, as the town tells it once the caravans brought it
        {
          op: "if",
          when: FATE_NORTH,
          then: [
            {
              op: "if",
              when: FATE(1),
              then: [{ op: "rumor", rumor: "rum_ending_name", source: "src_castle_town_talk", confidence: 60 }, say("txt_castle_fate_name")],
              else: [
                {
                  op: "if",
                  when: FATE(3),
                  then: [{ op: "rumor", rumor: "rum_ending_lord", source: "src_castle_town_talk", confidence: 60 }, say("txt_castle_fate_lord")],
                  else: [
                    {
                      op: "if",
                      when: FATE(2),
                      then: [{ op: "rumor", rumor: "rum_ending_held", source: "src_castle_town_talk", confidence: 60 }, say("txt_castle_fate_held")],
                      else: [{ op: "rumor", rumor: "rum_ending_fell", source: "src_castle_town_talk", confidence: 60 }, say("txt_castle_fate_fell")]
                    }
                  ]
                }
              ]
            },
            { op: "if", when: RENOWNED, then: [say("txt_castle_known_you")] }
          ]
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
      name: "성읍의 상인에게 말을 건다",
      requires: { op: "location", at: "loc_castle_town" },
      effects: [{ op: "choice", choice: "choice_town_merchant_dialogue", sourceId: "act_talk_town_merchant" }]
    },
    // V2-Core-78 (#189): the merchants' guild clerk (a dialogue NPC, no actor: D-92)
    act_talk_guild_clerk: {
      name: "상단 조합의 서기를 찾아간다",
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
    // V2-Core-139 (M5): watching the band from the trees -- how many they are now; near the end, that they mean to cross.
    // V2-Core-146 (#365, D-124): only while the band is still there (BAND_ACROSS, as the stores' burning) -- a watch of the
    // empty camp after the crossing used to report a host "about to cross", a warning that was already false
    act_watch_band_camp: {
      name: "숲에 숨어 무리를 지켜본다",
      requires: { op: "and", of: [{ op: "location", at: "loc_band_camp" }, BAND_ACROSS] },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 60,
      outcomes: {
        success: [
          { op: "proficiency", id: "investigation", add: 10 },
          { op: "rumor", rumor: "rum_band_size", observe: true, source: "obs_loc_band_camp", confidence: 90, about: "now" },
          { op: "if", when: BAND_AT(5), then: [say("txt_band_camp_host")], else: [{ op: "if", when: BAND_AT(3), then: [say("txt_band_camp_many")], else: [say("txt_band_camp_few")] }] },
          { op: "if", when: BAND_AT(5), then: [{ op: "fact", fact: "fact_band_crossing", set: "soon" }, { op: "rumor", rumor: "rum_band_crossing_soon", observe: true, source: "obs_loc_band_camp", confidence: 80, about: "now" }, say("txt_band_camp_crossing")] }
        ],
        fail: [{ op: "proficiency", id: "investigation", add: 5 }, { op: "hp", add: -3 }, say("txt_band_camp_spotted")]
      }
    },
    // V2-Core-146 (#365, D-124): the camp after the crossing -- cold fires and tracks to the river. What one sees there is that
    // the band has gone south (read from the tracks: plausible, not seen at the crossroads); while it is in the land -- after
    // the fate the remnants regroup there (act_hunt_band_remnants)
    act_search_empty_camp: {
      name: "버려진 진터를 살핀다",
      requires: { op: "and", of: [{ op: "location", at: "loc_band_camp" }, BAND_IN_THE_LAND] },
      minutes: 30,
      effects: [{ op: "rumor", rumor: "rum_band_crossed", observe: true, source: "obs_loc_band_camp", confidence: 70, about: "now" }, say("txt_band_camp_empty")]
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
        // V2-Core-141 (M2): the waystation's talk of a southerner
        { op: "if", when: { op: "flag", key: "frontier_seen_far_bank" }, then: [{ op: "rumor", rumor: "rum_frontier_seen_far_bank", source: "obs_loc_far_bank", confidence: 80 }, say("txt_board_southerner")] },
        // V2-Core-149 (D-127, #371): the remnants back in the woods -- the waystation's merchants post their bounty again
        {
          op: "if",
          when: { op: "fact", fact: "fact_remnants", eq: "regrouped" },
          then: [{ op: "rumor", rumor: "rum_remnants_regrouped", observe: true, source: "obs_loc_far_bank", confidence: 80 }, say("txt_board_remnants")]
        },
        // V2-Core-138 (M4): a band gathering across the river posts for hands; scrawled under it, whose men they are
        {
          op: "if",
          when: BAND_GATHERING,
          then: [
            say("txt_board_band"),
            { op: "rumor", rumor: "rum_band_recruits", source: "obs_loc_far_bank", confidence: 80, about: "now" },
            { op: "if", when: LEADER_LIVES, then: [], else: [say("txt_board_band_remnant"), { op: "rumor", rumor: "rum_band_led_by_remnant", source: "obs_loc_far_bank", confidence: 50 }] }
          ]
        },
        { op: "proficiency", id: "investigation", add: 5 }
      ]
    },
    // V2-Core-73 (#180): the miller (a dialogue NPC, like the elder and the herbalist)
    act_talk_miller: {
      name: "방앗간 주인에게 말을 건다",
      requires: { op: "location", at: "loc_mill_hamlet" },
      effects: [{ op: "choice", choice: "choice_miller_dialogue", sourceId: "act_talk_miller" }]
    },
    // V2-Core-73 (#180): the hamlet's bread, once the two settlements trade
    act_buy_mill_bread: {
      name: "물레방아 빵을 산다 (은화 1)",
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
    // Post-J3 survival choice: pack a bread ration for the road. A quick halt
    // preserves daylight but restores less than a full night. Neither removes
    // road wounds; hazards and world events still advance with elapsed time.
    act_camp_quick: {
      name: "길가에서 짧게 야영한다 (빵 1개, 2시간)",
      requires: FIELD_CAMP_READY,
      minutes: 120,
      effects: [
        { op: "item", item: "item_mill_bread", add: -1 },
        { op: "hp", add: 2 },
        { op: "resource", resource: "stamina", add: 5 },
        say("txt_camp_quick")
      ]
    },
    act_camp_full: {
      name: "길가에서 밤을 지새운다 (빵 1개, 8시간)",
      requires: FIELD_CAMP_READY,
      minutes: 480,
      effects: [
        { op: "item", item: "item_mill_bread", add: -1 },
        { op: "hp", add: 4 },
        { op: "resource", resource: "stamina", add: 6 },
        say("txt_camp_full")
      ]
    },
    // Post-J3 expedition loop: once the hamlet and village trade, the miller
    // offers one sealed ration crate for the far-bank waystation. The carrier
    // can establish a permanent resupply stop, or break the seal to survive.
    // The crate is character-owned (not inherited); the outcome is world-owned.
    act_accept_waystation_supply: {
      name: "길목 보급 의뢰를 맡는다 (물레방아 마을)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, HAMLET_TRADES,
        WAYSTATION_SUPPLY_UNSET,
        { op: "not", of: WAYSTATION_SUPPLY_CRATE }
      ] },
      minutes: 30,
      effects: [
        { op: "item", item: "item_waystation_supply_crate", add: 1 },
        say("txt_waystation_supply_accepted")
      ]
    },
    act_deliver_waystation_supply: {
      name: "길목의 보급품을 전달한다 (은화 6, 빵 1개)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, WAYSTATION_SUPPLY_CRATE,
        WAYSTATION_SUPPLY_UNSET
      ] },
      minutes: 45,
      effects: [
        { op: "item", item: "item_waystation_supply_crate", add: -1 },
        { op: "flag", key: "waystation_supply_delivered", value: true },
        { op: "money", add: 6 },
        { op: "item", item: "item_mill_bread", add: 1 },
        say("txt_waystation_supply_delivered")
      ]
    },
    act_open_waystation_supply: {
      name: "봉인을 뜯고 보급품을 식량으로 쓴다 (빵 2개)",
      requires: { op: "and", of: [
        WAYSTATION_SUPPLY_OPEN_SITES, WAYSTATION_SUPPLY_CRATE,
        WAYSTATION_SUPPLY_UNSET
      ] },
      minutes: 15,
      effects: [
        { op: "item", item: "item_waystation_supply_crate", add: -1 },
        { op: "item", item: "item_mill_bread", add: 2 },
        { op: "flag", key: "waystation_supply_diverted", value: true },
        say("txt_waystation_supply_opened")
      ]
    },
    // A public, persistent market at the far bank exists only in the history
    // where someone delivered the crate. Bread is dearer than in the village.
    act_buy_waystation_bread: {
      name: "길목 보급소에서 빵을 산다 (은화 2)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "waystation_supply_delivered" },
        { op: "money", min: 2 }
      ] },
      effects: [
        { op: "money", add: -2 },
        { op: "item", item: "item_mill_bread", add: 1 },
        say("txt_buy_waystation_bread")
      ]
    },
    // Exploration specialisation: learn the far-bank road's visible tracks.
    // The survey unlock belongs to this character, not to world memory.
    act_survey_north_road: {
      name: "길목 북부 도로를 정찰한다 (기력 2, 90분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "waystation_supply_delivered" },
        { op: "unlock", id: "unl_trailcraft" },
        { op: "not", of: { op: "unlock", id: "unl_north_road_survey" } },
        NORTH_ROAD_SURVEY_UNSET, STAMINA_AT_LEAST(2)
      ] },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 90,
      outcomes: {
        great: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 15 }, { op: "unlock", id: "unl_north_road_survey" }, say("txt_north_survey_found")],
        success: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 10 }, { op: "unlock", id: "unl_north_road_survey" }, say("txt_north_survey_found")],
        partial: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 5 }, say("txt_north_survey_retry")],
        fail: [{ op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "investigation", add: 5 }, { op: "hp", add: -1 }, say("txt_north_survey_retry")]
      }
    },
    // One survey, two exclusive consequences: a lasting public road improvement
    // or an immediate private cache. The world flag survives succession.
    act_mark_north_road_pass: {
      name: "보급 마차에 안전한 우회로를 표시한다 (기력 2, 90분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "waystation_supply_delivered" },
        { op: "unlock", id: "unl_north_road_survey" },
        NORTH_ROAD_SURVEY_UNSET, STAMINA_AT_LEAST(2)
      ] },
      minutes: 90,
      effects: [
        { op: "resource", resource: "stamina", add: -2 },
        { op: "flag", key: "north_road_guided", value: true },
        say("txt_north_road_guided")
      ]
    },
    act_salvage_north_road_cache: {
      name: "도로 옆 버려진 보급품을 회수한다 (기력 2, 60분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "waystation_supply_delivered" },
        { op: "unlock", id: "unl_north_road_survey" },
        NORTH_ROAD_SURVEY_UNSET, STAMINA_AT_LEAST(2)
      ] },
      minutes: 60,
      effects: [
        { op: "resource", resource: "stamina", add: -2 },
        { op: "money", add: 5 },
        { op: "item", item: "item_mill_bread", add: 2 },
        { op: "flag", key: "north_road_cache_taken", value: true },
        say("txt_north_road_cache_taken")
      ]
    },
    // A genuine repeatable economy loop: public convoy stock arrives with
    // elapsed world time, can be bought at a bulk rate, or consumed by an
    // escort job. Two escorts earn a lasting public discount for all lives.
    act_buy_waystation_bulk_rations: {
      name: "정기 보급 마차의 빵 3개를 산다 (은화 3, 교역 신뢰 시 2)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "north_road_guided" },
        NORTH_WAYSTATION_STOCK, NORTH_WAYSTATION_BUNDLE_FUNDS
      ] },
      minutes: 15,
      effects: [
        { op: "signal", key: "north_waystation_stock", add: -1 },
        { op: "if", when: NORTH_WAYSTATION_RELIABLE,
          then: [{ op: "money", add: -2 }, say("txt_waystation_bulk_discount")],
          else: [{ op: "money", add: -3 }, say("txt_waystation_bulk_standard")] },
        { op: "item", item: "item_mill_bread", add: 3 }
      ]
    },
    // The first available shipment forces a lasting economic choice. Giving
    // the millers a share establishes a second daily delivery, while a private
    // sale funds the current expedition but keeps the public route at one.
    act_pledge_north_relief: {
      name: "첫 보급품을 물레방아 마을 구휼에 배정한다 (재고 1, 60분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "north_road_guided" },
        NORTH_WAYSTATION_STOCK, NORTH_SUPPLY_PACT_OPEN
      ] },
      minutes: 60,
      effects: [
        { op: "signal", key: "north_waystation_stock", add: -1 },
        { op: "flag", key: "north_supply_relief_pact", value: true },
        { op: "relation", from: "org_mill_hamlet", add: 4 },
        say("txt_north_supply_relief_pact")
      ]
    },
    act_sell_north_private_contract: {
      name: "첫 보급품을 성읍의 사설 계약에 넘긴다 (재고 1, 은화 8, 60분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "north_road_guided" },
        NORTH_WAYSTATION_STOCK, NORTH_SUPPLY_PACT_OPEN
      ] },
      minutes: 60,
      effects: [
        { op: "signal", key: "north_waystation_stock", add: -1 },
        { op: "money", add: 8 },
        { op: "flag", key: "north_supply_private_sale", value: true },
        { op: "relation", from: "npc_town_merchant", add: 4 },
        say("txt_north_supply_private_sale")
      ]
    },
    // The player can pay for a wagon now instead of waiting for the miller's
    // daily courier. The stock is transferred, never duplicated.
    act_dispatch_north_relief_wagon: {
      name: "구휼 마차를 마을로 먼저 보낸다 (보급 1, 은화 2, 1시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_SUPPLY_RELIEF,
        NORTH_WAYSTATION_STOCK, NORTH_MILL_RELIEF_SPACE, { op: "money", min: 2 }
      ] },
      minutes: 60,
      effects: [
        { op: "money", add: -2 },
        { op: "signal", key: "north_waystation_stock", add: -1 },
        { op: "signal", key: "north_mill_relief_stock", add: 1 },
        { op: "relation", from: "npc_miller", add: 2 },
        say("txt_north_relief_wagon_dispatch")
      ]
    },
    // The shared store is accessible only at the mill. Rations cost a small
    // contribution, and cannot be bought from an empty warehouse.
    // The delayed wagon is visible at the far-bank road. A player can spend
    // stamina to bring its public cargo through, or divert it for private food.
    // Both options consume the same single world-owned bundle.
    act_escort_stalled_relief: {
      name: "멈춰 선 구휼 마차를 호위해 마을로 보낸다 (기력 2, 2시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_SUPPLY_RELIEF,
        NORTH_RELIEF_STALLED, NORTH_MILL_RELIEF_SPACE, STAMINA_AT_LEAST(2)
      ] },
      minutes: 120,
      effects: [
        { op: "resource", resource: "stamina", add: -2 },
        { op: "signal", key: "north_relief_stalled", add: -1 },
        { op: "signal", key: "north_mill_relief_stock", add: 1 },
        { op: "relation", from: "npc_miller", add: 3 },
        say("txt_north_relief_stalled_escort")
      ]
    },
    act_seize_stalled_relief: {
      name: "멈춘 마차의 식량을 가져간다 (기력 1, 빵 3개, 1시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_SUPPLY_RELIEF,
        NORTH_RELIEF_STALLED, STAMINA_AT_LEAST(1)
      ] },
      minutes: 60,
      effects: [
        { op: "resource", resource: "stamina", add: -1 },
        { op: "signal", key: "north_relief_stalled", add: -1 },
        { op: "signal", key: "north_relief_losses", add: 1 },
        { op: "item", item: "item_mill_bread", add: 3 },
        { op: "relation", from: "npc_miller", add: -3 },
        say("txt_north_relief_stalled_seized")
      ]
    },
    act_buy_mill_relief_rations: {
      name: "공동 창고에서 빵 2개를 배급받는다 (은화 1, 15분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, NORTH_SUPPLY_RELIEF,
        NORTH_MILL_RELIEF_STOCK, NORTH_RELIEF_NORMAL, { op: "money", min: 1 }
      ] },
      minutes: 15,
      effects: [
        { op: "money", add: -1 },
        { op: "signal", key: "north_mill_relief_stock", add: -1 },
        { op: "item", item: "item_mill_bread", add: 2 },
        say("txt_north_relief_rations")
      ]
    },
    // Repeated convoy losses reduce the village's available ration per bundle
    // and double its price until the public warehouse is repaired.
    act_buy_mill_relief_rations_crisis: {
      name: "구휼 식량 부족분을 배급받는다 (은화 2, 빵 1개, 15분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, NORTH_RELIEF_SHORTAGE,
        NORTH_MILL_RELIEF_STOCK, { op: "money", min: 2 }
      ] },
      minutes: 15,
      effects: [
        { op: "money", add: -2 },
        { op: "signal", key: "north_mill_relief_stock", add: -1 },
        { op: "item", item: "item_mill_bread", add: 1 },
        say("txt_north_relief_crisis_rations")
      ]
    },
    // Two distinct recovery routes: give up personal provisions at the mill,
    // or pay the castle merchant to replace one lost public shipment.
    // Neither erases the losses that caused the shortage. Both are one-time,
    // world-owned outcomes that survive succession without new Save fields.
    act_donate_north_relief_bread: {
      name: "공동 창고에 빵 3개를 기부해 배급을 복구한다 (1시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, NORTH_RELIEF_SHORTAGE,
        NORTH_MILL_RELIEF_SPACE, { op: "item", item: "item_mill_bread", min: 3 }
      ] },
      minutes: 60,
      effects: [
        { op: "item", item: "item_mill_bread", add: -3 },
        { op: "signal", key: "north_mill_relief_stock", add: 1 },
        { op: "flag", key: "north_relief_shortage_recovered", value: true },
        { op: "relation", from: "npc_miller", add: 4 },
        say("txt_north_relief_bread_donated")
      ]
    },
    act_fund_north_relief_caravan: {
      name: "성읍 상인에게 구휼 마차 재조달을 맡긴다 (은화 6, 2시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_castle_town" }, NORTH_RELIEF_SHORTAGE,
        NORTH_MILL_RELIEF_SPACE, { op: "money", min: 6 }
      ] },
      minutes: 120,
      effects: [
        { op: "money", add: -6 },
        { op: "signal", key: "north_mill_relief_stock", add: 1 },
        { op: "flag", key: "north_relief_shortage_recovered", value: true },
        { op: "relation", from: "npc_town_merchant", add: 4 },
        say("txt_north_relief_caravan_funded")
      ]
    },
    // Unlike the stationary waystation, this merchant can be met only where
    // its scheduled wagon actually is. Buying and selling use the same finite
    // cargo, so a player cannot buy and resell indefinitely for a profit.
    act_sell_bread_to_north_caravan: {
      name: "길목에 도착한 북부 상단에 빵 2개를 판다 (은화 +2, 20분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_TRADE_AT_FAR_BANK,
        { op: "item", item: "item_mill_bread", min: 2 },
        { op: "signal", key: "north_trade_stock", max: 2 }
      ] },
      minutes: 20,
      effects: [
        { op: "item", item: "item_mill_bread", add: -2 },
        { op: "money", add: 2 },
        { op: "signal", key: "north_trade_stock", add: 1 },
        say("txt_north_trade_caravan_sold")
      ]
    },
    act_buy_bread_from_north_caravan: {
      name: "마을에 도착한 북부 상단에서 빵 2개를 산다 (은화 3, 20분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_mill_hamlet" }, NORTH_TRADE_AT_MILL,
        NORTH_TRADE_HAS_CARGO, { op: "money", min: 3 }
      ] },
      minutes: 20,
      effects: [
        { op: "money", add: -3 },
        { op: "signal", key: "north_trade_stock", add: -1 },
        { op: "item", item: "item_mill_bread", add: 2 },
        say("txt_north_trade_caravan_bought")
      ]
    },
    // A meeting with a real, present caravan teaches a road without leaking
    // its destination to travellers who have not spoken with the driver.
    act_ask_north_caravan_route: {
      name: "북부 상단 마부에게 운행 경로를 묻는다 (10분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_TRADE_AT_FAR_BANK,
        { op: "not", of: NORTH_TRADE_ROUTE_KNOWN }
      ] },
      minutes: 10,
      effects: [
        { op: "rumor", rumor: "rum_road_hamlet", source: "npc_north_caravan_driver", confidence: 70 },
        say("txt_north_caravan_route_learned")
      ]
    },
    // The merchant's safe passage offers an actual one-way travel option.
    // A character who personally earned the pathfinder credential pays half.
    act_ride_north_caravan: {
      name: "북부 상단 마차에 동행한다 (은화 2, 길잡이 1, 90분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_TRADE_AT_FAR_BANK,
        NORTH_TRADE_ROUTE_KNOWN, { op: "signal", key: "road_trouble", max: 1 },
        NORTH_TRADE_RIDE_FUNDS
      ] },
      minutes: 90,
      effects: [
        { op: "if", when: NORTH_TRADE_PATHFINDER,
          then: [{ op: "money", add: -1 }],
          else: [{ op: "money", add: -2 }] },
        { op: "signal", key: "north_trade_stage", add: 1 },
        NORTH_TRADE_RELIEF_TRANSFER,
        { op: "move", to: "loc_mill_hamlet" },
        say("txt_north_caravan_ride")
      ]
    },
    // Exploration career alternative to the guaranteed but stationary escort:
    // a PER+investigation check can guide the caravan AND player through a
    // dangerous road. On a failed read neither cargo nor world route advances.
    act_scout_north_caravan: {
      name: "위험한 길에서 상단의 우회로를 정찰한다 (기력 2, 2시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_TRADE_AT_FAR_BANK,
        NORTH_TRADE_ROUTE_KNOWN, { op: "signal", key: "road_trouble", min: 2 },
        { op: "unlock", id: "unl_trailcraft" },
        { op: "skill", skill: "investigation", min: 1 }, STAMINA_AT_LEAST(2)
      ] },
      check: { stat: "per", skill: "investigation", tags: ["investigation"], difficulty: "normal" },
      minutes: 120,
      outcomes: {
        great: [
          { op: "resource", resource: "stamina", add: -2 },
          { op: "proficiency", id: "investigation", add: 15 },
          { op: "money", add: 3 }, ...NORTH_TRADE_SCOUT_CROSSING,
          say("txt_north_caravan_scout_success")
        ],
        success: [
          { op: "resource", resource: "stamina", add: -2 },
          { op: "proficiency", id: "investigation", add: 10 },
          { op: "money", add: 2 }, ...NORTH_TRADE_SCOUT_CROSSING,
          say("txt_north_caravan_scout_success")
        ],
        partial: [
          { op: "resource", resource: "stamina", add: -2 },
          { op: "proficiency", id: "investigation", add: 5 },
          { op: "hp", add: -1 }, say("txt_north_caravan_scout_retry")
        ],
        fail: [
          { op: "resource", resource: "stamina", add: -2 },
          { op: "proficiency", id: "investigation", add: 5 },
          { op: "hp", add: -2 }, say("txt_north_caravan_scout_retry")
        ]
      }
    },
    act_escort_north_trade_caravan: {
      name: "위험한 길에서 북부 상단을 호위해 마을로 보낸다 (기력 2, 2시간, 은화 +4)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" }, NORTH_TRADE_AT_FAR_BANK,
        { op: "signal", key: "road_trouble", min: 2 }, STAMINA_AT_LEAST(2)
      ] },
      minutes: 120,
      effects: [
        { op: "resource", resource: "stamina", add: -2 },
        { op: "money", add: 4 },
        { op: "relation", from: "npc_town_merchant", add: 3 },
        { op: "signal", key: "road_trouble", add: -1 },
        { op: "signal", key: "north_trade_stage", add: 1 },
        NORTH_TRADE_RELIEF_TRANSFER,
        say("txt_north_trade_caravan_escorted")
      ]
    },
    act_escort_north_merchant: {
      name: "보급 마차의 길목 왕복 호위를 맡는다 (기력 2, 3시간, 은화 3)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_far_bank" },
        { op: "flag", key: "north_road_guided" },
        NORTH_WAYSTATION_STOCK, STAMINA_AT_LEAST(2)
      ] },
      minutes: 180,
      effects: [
        { op: "signal", key: "north_waystation_stock", add: -1 },
        { op: "resource", resource: "stamina", add: -2 },
        { op: "money", add: 3 },
        { op: "relation", from: "npc_town_merchant", add: 3 },
        { op: "if", when: { op: "signal", key: "north_waystation_reliability", max: 1 },
          then: [
            { op: "signal", key: "north_waystation_reliability", add: 1 },
            { op: "if", when: { op: "signal", key: "north_waystation_reliability", min: 2 },
              then: [say("txt_waystation_merchants_trust")],
              else: [say("txt_waystation_merchants_first")] }
          ],
          else: [say("txt_waystation_merchants_steady")] }
      ]
    },
    // The improved route replaces, rather than duplicates, the old convoy.
    // It saves one hour and one silver each way; bread is still required.
    act_north_road_guided_convoy: {
      name: "안전한 보급 마차로 성읍에 간다 (빵 1개, 은화 2, 9시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_far_bank" }, NORTH_ROAD_GUIDED_READY] },
      minutes: 540,
      effects: [
        { op: "money", add: -2 }, { op: "item", item: "item_mill_bread", add: -1 },
        { op: "resource", resource: "stamina", add: 3 },
        { op: "move", to: "loc_castle_town" }, say("txt_north_road_guided_convoy")
      ]
    },
    act_south_road_guided_convoy: {
      name: "안전한 보급 마차로 길목에 돌아간다 (빵 1개, 은화 2, 9시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_castle_town" }, NORTH_ROAD_GUIDED_READY] },
      minutes: 540,
      effects: [
        { op: "money", add: -2 }, { op: "item", item: "item_mill_bread", add: -1 },
        { op: "resource", resource: "stamina", add: 3 },
        { op: "move", to: "loc_far_bank" }, say("txt_south_road_guided_convoy")
      ]
    },
    // Long-road expedition tactics: four explicit actions, so the player can
    // compare the existing 720-minute free road with paid convoy (600 min,
    // restores stamina) and a damaging forced march (480 min). The convoy is
    // a lasting consequence of the delivered waystation supply contract.
    act_north_road_convoy: {
      name: "보급 마차로 성읍에 간다 (빵 1개, 은화 3, 10시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_far_bank" }, NORTH_ROAD_CONVOY_READY, { op: "not", of: { op: "flag", key: "north_road_guided" } }] },
      minutes: 600,
      effects: [
        { op: "money", add: -3 },
        { op: "item", item: "item_mill_bread", add: -1 },
        { op: "resource", resource: "stamina", add: 3 },
        { op: "move", to: "loc_castle_town" },
        say("txt_north_road_convoy")
      ]
    },
    act_south_road_convoy: {
      name: "보급 마차로 길목에 돌아간다 (빵 1개, 은화 3, 10시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_castle_town" }, NORTH_ROAD_CONVOY_READY, { op: "not", of: { op: "flag", key: "north_road_guided" } }] },
      minutes: 600,
      effects: [
        { op: "money", add: -3 },
        { op: "item", item: "item_mill_bread", add: -1 },
        { op: "resource", resource: "stamina", add: 3 },
        { op: "move", to: "loc_far_bank" },
        say("txt_south_road_convoy")
      ]
    },
    act_north_road_march: {
      name: "성읍까지 강행군한다 (기력 4, 체력 2, 8시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_far_bank" }, NORTH_ROAD_MARCH_READY] },
      minutes: 480,
      effects: [
        { op: "resource", resource: "stamina", add: -4 },
        { op: "hp", add: -2 },
        { op: "move", to: "loc_castle_town" },
        say("txt_north_road_march")
      ]
    },
    act_south_road_march: {
      name: "길목까지 강행군한다 (기력 4, 체력 2, 8시간)",
      requires: { op: "and", of: [{ op: "location", at: "loc_castle_town" }, NORTH_ROAD_MARCH_READY] },
      minutes: 480,
      effects: [
        { op: "resource", resource: "stamina", add: -4 },
        { op: "hp", add: -2 },
        { op: "move", to: "loc_far_bank" },
        say("txt_south_road_march")
      ]
    },
    // Post-J3 combat academy: safe, paid repetition raises swordsmanship through
    // the existing combat proficiency. The higher-stakes spar is a one-time
    // personal certification; it does not change world flags or Save schema.
    act_castle_guard_drill: {
      name: "성읍 검술 연습장에서 방어 훈련한다 (은화 2, 기력 2, 2시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_castle_town" },
        { op: "money", min: 2 }, STAMINA_AT_LEAST(2)
      ] },
      minutes: 120,
      effects: [
        { op: "money", add: -2 },
        { op: "resource", resource: "stamina", add: -2 },
        { op: "proficiency", id: "combat", add: 10 },
        say("txt_castle_guard_drill")
      ]
    },
    act_castle_spar_trial: {
      name: "성읍 검술 사범과 실전 대련한다 (은화 3, 기력 2, 90분)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_castle_town" },
        { op: "skill", skill: "swordsmanship", min: 1 },
        { op: "not", of: { op: "unlock", id: "unl_guarded_stance" } },
        { op: "money", min: 3 }, STAMINA_AT_LEAST(2)
      ] },
      check: { stat: "dex", skill: "swordsmanship", tags: ["combat"], difficulty: "normal" },
      minutes: 90,
      outcomes: {
        great: [{ op: "money", add: -3 }, { op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "combat", add: 15 }, { op: "unlock", id: "unl_guarded_stance" }, say("txt_castle_spar_pass")],
        success: [{ op: "money", add: -3 }, { op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "combat", add: 10 }, { op: "unlock", id: "unl_guarded_stance" }, say("txt_castle_spar_pass")],
        partial: [{ op: "money", add: -3 }, { op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "combat", add: 5 }, { op: "hp", add: -1 }, say("txt_castle_spar_retry")],
        fail: [{ op: "money", add: -3 }, { op: "resource", resource: "stamina", add: -2 }, { op: "proficiency", id: "combat", add: 5 }, { op: "hp", add: -2 }, say("txt_castle_spar_retry")]
      }
    },
    // A distinct offensive specialisation: the player must already have trained
    // to rank 2 and wield a sword. Unlike the safe guard stance, this one risks
    // a severe counterattack for a chance to end a fight sooner.
    act_castle_breakthrough_trial: {
      name: "성읍 사범에게 돌파 검술을 배운다 (은화 4, 기력 3, 2시간)",
      requires: { op: "and", of: [
        { op: "location", at: "loc_castle_town" },
        { op: "skill", skill: "swordsmanship", min: 2 },
        { op: "not", of: { op: "unlock", id: "unl_breakthrough_cut" } },
        HAS_DRAWN_SWORD, { op: "money", min: 4 }, STAMINA_AT_LEAST(3)
      ] },
      check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "hard" },
      minutes: 120,
      outcomes: {
        great: [{ op: "money", add: -4 }, { op: "resource", resource: "stamina", add: -3 }, { op: "proficiency", id: "combat", add: 15 }, { op: "unlock", id: "unl_breakthrough_cut" }, say("txt_castle_breakthrough_pass")],
        success: [{ op: "money", add: -4 }, { op: "resource", resource: "stamina", add: -3 }, { op: "proficiency", id: "combat", add: 10 }, { op: "unlock", id: "unl_breakthrough_cut" }, say("txt_castle_breakthrough_pass")],
        partial: [{ op: "money", add: -4 }, { op: "resource", resource: "stamina", add: -3 }, { op: "proficiency", id: "combat", add: 5 }, { op: "hp", add: -1 }, say("txt_castle_breakthrough_retry")],
        fail: [{ op: "money", add: -4 }, { op: "resource", resource: "stamina", add: -3 }, { op: "proficiency", id: "combat", add: 5 }, { op: "hp", add: -2 }, say("txt_castle_breakthrough_retry")]
      }
    },
    act_buy_lantern: {
      name: "등불을 산다",
      requires: { op: "and", of: [{ op: "location", at: "loc_market" }, { op: "money", min: 5 }] },
      effects: [
        { op: "money", add: -5 },
        { op: "item", item: "item_lantern", add: 1 },
        { op: "narrate", textId: "txt_buy_lantern" }
      ]
    },
    // V2-Core-70 (#170): the merchants' price for one the village honoured
    act_buy_lantern_trusted: {
      name: "등불을 산다 (마을의 호의, 은화 2)",
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
      name: "철검을 산다",
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
      name: "원로를 찾아간다",
      requires: { op: "location", at: "loc_village" },
      showWhenLocked: true,
      effects: [{ op: "choice", choice: "choice_elder_dialogue", sourceId: "act_talk_elder" }]
    },
    act_investigate_ruins: {
      name: "폐허 안을 살핀다",
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
      name: "마을 어귀에서 쉬며 상처를 돌본다",
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
      name: "도적 두목 앞에 나선다",
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
          // V2-Core-141 (M2): told of the arrows in the spring, he looks away
          { op: "if", when: ARROWS_TOLD, then: [say("txt_confront_arrows")] },
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
      name: "칼을 뽑아 두목과 맞선다",
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
    },
    // V2-Core-140 (M6): the band holds the crossroads -- seen there; standing before it is the last fight
    act_face_band: {
      name: "갈림길을 막은 무리 앞에 선다",
      requires: { op: "and", of: [{ op: "location", at: "loc_crossroads" }, BAND_IN_THE_LAND] },
      effects: [
        { op: "rumor", rumor: "rum_band_crossed", observe: true, source: "obs_loc_crossroads", confidence: 90, about: "now" },
        // V2-Core-141 (M2): the one who leads them speaks -- the chief of the crossing (his old wound stays something one must
        // have been told: seeing him is not knowing it, as in the first fight), his right hand of himself
        {
          op: "if",
          when: LEADER_LIVES,
          then: [say("txt_face_band_chief"), { op: "rumor", rumor: "rum_band_crossed", source: "npc_bandit_leader", confidence: 100, about: "now" }],
          else: [say("txt_face_band_right_hand"), { op: "rumor", rumor: "rum_band_led_by_remnant", source: "npc_band_lieutenant", confidence: 100 }]
        },
        { op: "choice", choice: FINAL_CHOICE, sourceId: "act_face_band" }
      ]
    },
    // V2-Core-142 (M7): the band's remnants in the woods -- for a seasoned sword, once the frontier's fate is decided; won,
    // the waystation's bounty and a quiet week; lost, a beating
    act_hunt_band_remnants: {
      name: "숲 너머에 남은 무리를 뒤쫓는다",
      requires: {
        op: "and",
        of: [{ op: "location", at: "loc_band_camp" }, FATE_DECIDED, { op: "skill", skill: "swordsmanship", min: 2 }, { op: "signal", key: "remnants_quiet", max: 0 }]
      },
      check: { stat: "str", skill: "swordsmanship", tags: ["combat"], difficulty: "hard" },
      minutes: 240,
      outcomes: {
        success: [
          { op: "proficiency", id: "combat", add: 5 },
          // a week: the countdown takes its first day on this very step
          { op: "signal", key: "remnants_quiet", add: 8 },
          { op: "fact", fact: "fact_remnants", set: "scattered" },
          { op: "money", add: 12 },
          { op: "relation", from: "org_village", add: 2 },
          say("txt_remnants_hunted")
        ],
        fail: [{ op: "proficiency", id: "combat", add: 5 }, { op: "hp", add: -6 }, say("txt_remnants_ambush")]
      }
    },
    // V2-Core-141 (M2): a call for hands on the waystation board, paid by one the elder has warned
    act_post_frontier_notice: {
      name: "길목 게시판에 변경을 지킬 일손을 구하는 글을 붙인다 (은화 15)",
      requires: {
        op: "and",
        of: [{ op: "location", at: "loc_far_bank" }, BAND_ACROSS, FRONTIER_WARNED, { op: "not", of: { op: "flag", key: "frontier_notice_posted" } }, { op: "money", min: 15 }]
      },
      minutes: 60,
      effects: [
        { op: "money", add: -15 },
        { op: "flag", key: "frontier_notice_posted", value: true },
        ...DEFENSE_UP,
        { op: "fact", fact: "fact_frontier_prepared", set: "helped" },
        { op: "rumor", rumor: "rum_frontier_prepared", source: "obs_loc_far_bank", confidence: 90 },
        say("txt_post_frontier_notice")
      ]
    },
    // V2-Core-141 (M2): the frontier's plight told at the royal court by one who knows who leads the band -- a writ for a
    // frontier militia, or the clerk's door closed to the frontier for good
    act_petition_crown: {
      name: "왕궁 서기에게 변경의 사정을 아뢴다",
      requires: {
        op: "and",
        of: [{ op: "location", at: "loc_royal_city" }, BAND_ACROSS, KNOWS_BAND_LEADER, { op: "not", of: CROWN_WRIT }, { op: "not", of: { op: "flag", key: "crown_refused" } }]
      },
      check: { stat: "wis", tags: ["social"], difficulty: "normal" },
      minutes: 120,
      outcomes: {
        success: [
          { op: "flag", key: "crown_writ", value: true },
          { op: "fact", fact: "fact_crown_writ", set: "granted" },
          { op: "rumor", rumor: "rum_crown_writ", source: "obs_loc_royal_city", confidence: 90 },
          say("txt_crown_writ")
        ],
        fail: [{ op: "flag", key: "crown_refused", value: true }, say("txt_crown_refused")]
      }
    },
    // V2-Core-141 (M2): the band's stores, burnt where it gathers -- the band one smaller; caught, the burner is beaten.
    // Once either way: the band guards its stores after
    act_burn_band_stores: {
      name: "무리의 식량 더미에 불을 놓는다",
      requires: { op: "and", of: [{ op: "location", at: "loc_band_camp" }, BAND_ACROSS, BAND_AT(2), { op: "not", of: { op: "flag", key: "band_stores_burnt" } }] },
      check: { stat: "dex", tags: ["stealth"], difficulty: "hard" },
      minutes: 120,
      outcomes: {
        success: [
          { op: "flag", key: "band_stores_burnt", value: true },
          { op: "signal", key: "band_strength", add: -1 },
          BAND_SIZE_FACT,
          { op: "fact", fact: "fact_band_stores", set: "burnt" },
          { op: "rumor", rumor: "rum_band_stores_burnt", source: "obs_loc_band_camp", confidence: 100 },
          say("txt_band_stores_burnt")
        ],
        fail: [{ op: "flag", key: "band_stores_burnt", value: true }, { op: "hp", add: -5 }, say("txt_band_stores_caught")]
      }
    },
    // V2-Core-155 (D-133): things that happen on the way -- each appears where and when its conditions hold (nothing rolls
    // to open it) and is gone once one of its ways is taken; the UI shows its scene (`encounter`) above its ways
    act_enc_well_child_carry: {"name":"아이를 업고 장터의 약초꾼에게 간다","encounter":"enc_well_child_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_village"},{"op":"not","of":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"op":"day","hourFrom":7,"hourTo":19},{"op":"not","of":{"op":"flag","key":"enc_well_child_done"}}]},"minutes":30,"effects":[{"op":"move","to":"loc_market"},{"op":"rumor","rumor":"rum_well_source","source":"npc_herbalist","confidence":70},{"op":"relation","from":"org_village","add":3},{"op":"flag","key":"enc_well_child_done","value":true},{"op":"narrate","textId":"enc_well_child_carry"}]},
    act_enc_well_child_ask: {"name":"곁의 어른에게 무슨 일인지 묻는다","encounter":"enc_well_child_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_village"},{"op":"not","of":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"op":"day","hourFrom":7,"hourTo":19},{"op":"not","of":{"op":"flag","key":"enc_well_child_done"}}]},"minutes":15,"effects":[{"op":"rumor","rumor":"rum_well_source","source":"src_well_folk","confidence":50},{"op":"flag","key":"enc_well_child_done","value":true},{"op":"narrate","textId":"enc_well_child_ask"}]},
    act_enc_well_child_bread: {"name":"가진 빵을 쪼개 나눠 준다","encounter":"enc_well_child_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_village"},{"op":"not","of":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"op":"day","hourFrom":7,"hourTo":19},{"op":"not","of":{"op":"flag","key":"enc_well_child_done"}},{"op":"item","item":"item_mill_bread","min":1}]},"effects":[{"op":"item","item":"item_mill_bread","add":-1},{"op":"relation","from":"org_village","add":5},{"op":"flag","key":"enc_well_child_done","value":true},{"op":"narrate","textId":"enc_well_child_bread"}]},
    act_enc_spring_trap_disarm: {"name":"덫의 이빨을 벌려 치운다","encounter":"enc_spring_trap_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_forest_spring"},{"op":"not","of":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"op":"not","of":{"op":"flag","key":"enc_spring_trap_done"}}]},"check":{"stat":"dex","tags":["investigation"],"difficulty":"normal"},"minutes":15,"outcomes":{"great":[{"op":"fact","fact":"fact_spring_trap","set":"bandit_mark"},{"op":"rumor","rumor":"rum_spring_trap_mark","observe":true,"source":"obs_loc_forest_spring","confidence":90},{"op":"proficiency","id":"investigation","add":10},{"op":"flag","key":"enc_spring_trap_done","value":true},{"op":"narrate","textId":"enc_spring_trap_disarm"}],"success":[{"op":"fact","fact":"fact_spring_trap","set":"bandit_mark"},{"op":"rumor","rumor":"rum_spring_trap_mark","observe":true,"source":"obs_loc_forest_spring","confidence":90},{"op":"proficiency","id":"investigation","add":5},{"op":"flag","key":"enc_spring_trap_done","value":true},{"op":"narrate","textId":"enc_spring_trap_disarm"}],"partial":[{"op":"fact","fact":"fact_spring_trap","set":"bandit_mark"},{"op":"rumor","rumor":"rum_spring_trap_mark","observe":true,"source":"obs_loc_forest_spring","confidence":70},{"op":"hp","add":-1},{"op":"flag","key":"enc_spring_trap_done","value":true},{"op":"narrate","textId":"enc_spring_trap_graze"}],"fail":[{"op":"hp","add":-2},{"op":"flag","key":"enc_spring_trap_done","value":true},{"op":"narrate","textId":"enc_spring_trap_bite"}]}},
    act_enc_spring_trap_mark: {"name":"고리의 표식만 눈에 새겨 둔다","encounter":"enc_spring_trap_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_forest_spring"},{"op":"not","of":{"op":"case","case":"case_fouled_well","stage":"resolved"}},{"op":"not","of":{"op":"flag","key":"enc_spring_trap_done"}}]},"minutes":5,"effects":[{"op":"fact","fact":"fact_spring_trap","set":"bandit_mark"},{"op":"rumor","rumor":"rum_spring_trap_mark","observe":true,"source":"obs_loc_forest_spring","confidence":50},{"op":"flag","key":"enc_spring_trap_done","value":true},{"op":"narrate","textId":"enc_spring_trap_mark"}]},
    act_enc_toll_post_ledger: {"name":"흩어진 장부를 주워 읽는다","encounter":"enc_toll_post_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_crossroads"},{"op":"case","case":"case_ruins_mystery","stage":"resolved"},{"op":"not","of":{"op":"flag","key":"enc_toll_post_done"}}]},"check":{"stat":"int","skill":"investigation","tags":["investigation"],"difficulty":"normal"},"minutes":30,"outcomes":{"great":[{"op":"money","add":6},{"op":"proficiency","id":"investigation","add":10},{"op":"rumor","rumor":"rum_bandit_toll","observe":true,"source":"obs_loc_crossroads","confidence":80},{"op":"flag","key":"enc_toll_post_done","value":true},{"op":"narrate","textId":"enc_toll_post_ledger"}],"success":[{"op":"money","add":4},{"op":"proficiency","id":"investigation","add":10},{"op":"rumor","rumor":"rum_bandit_toll","observe":true,"source":"obs_loc_crossroads","confidence":80},{"op":"flag","key":"enc_toll_post_done","value":true},{"op":"narrate","textId":"enc_toll_post_ledger"}],"partial":[{"op":"proficiency","id":"investigation","add":5},{"op":"flag","key":"enc_toll_post_done","value":true},{"op":"narrate","textId":"enc_toll_post_names"}],"fail":[{"op":"proficiency","id":"investigation","add":5},{"op":"flag","key":"enc_toll_post_done","value":true},{"op":"narrate","textId":"enc_toll_post_names"}]}},
    act_enc_toll_post_floor: {"name":"마루 밑을 뜯어 본다","encounter":"enc_toll_post_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_crossroads"},{"op":"case","case":"case_ruins_mystery","stage":"resolved"},{"op":"not","of":{"op":"flag","key":"enc_toll_post_done"}},{"op":"resource","resource":"stamina","min":2}]},"minutes":60,"effects":[{"op":"resource","resource":"stamina","add":-2},{"op":"money","add":2},{"op":"flag","key":"enc_toll_post_done","value":true},{"op":"narrate","textId":"enc_toll_post_floor"}]},
    act_enc_ford_traveller_listen: {"name":"말없이 이야기를 듣는다","encounter":"enc_ford_traveller_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_river_ford"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":17,"hourTo":23},{"op":"not","of":{"op":"flag","key":"enc_ford_traveller_done"}}]},"minutes":30,"effects":[{"op":"rumor","rumor":"rum_realm_levy","source":"src_ford_traveller","confidence":70},{"op":"flag","key":"enc_ford_traveller_done","value":true},{"op":"narrate","textId":"enc_ford_traveller_listen"}]},
    act_enc_ford_traveller_confess: {"name":"나도 북쪽에서 왔다고 털어놓는다","encounter":"enc_ford_traveller_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_river_ford"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":17,"hourTo":23},{"op":"not","of":{"op":"flag","key":"enc_ford_traveller_done"}}]},"minutes":30,"effects":[{"op":"rumor","rumor":"rum_realm_levy","source":"src_ford_traveller","confidence":70},{"op":"relation","from":"npc_ferryman","add":5},{"op":"flag","key":"levy_warned","value":true},{"op":"flag","key":"enc_ford_traveller_done","value":true},{"op":"narrate","textId":"enc_ford_traveller_confess"}]},
    act_enc_ford_traveller_leave: {"name":"불을 쬐다 말없이 일어선다","encounter":"enc_ford_traveller_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_river_ford"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":17,"hourTo":23},{"op":"not","of":{"op":"flag","key":"enc_ford_traveller_done"}}]},"minutes":15,"effects":[{"op":"flag","key":"enc_ford_traveller_done","value":true},{"op":"narrate","textId":"enc_ford_traveller_leave"}]},
    act_enc_mill_wheel_push: {"name":"물에 뛰어들어 함께 통나무를 민다","encounter":"enc_mill_wheel_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_mill_hamlet"},{"op":"day","hourFrom":6,"hourTo":20},{"op":"not","of":{"op":"flag","key":"enc_mill_wheel_done"}},{"op":"resource","resource":"stamina","min":2}]},"check":{"stat":"str","tags":["labour"],"difficulty":"normal"},"minutes":30,"outcomes":{"great":[{"op":"resource","resource":"stamina","add":-2},{"op":"relation","from":"npc_miller","add":10},{"op":"item","item":"item_flour_sack","add":1},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_turns"}],"success":[{"op":"resource","resource":"stamina","add":-2},{"op":"relation","from":"npc_miller","add":10},{"op":"item","item":"item_flour_sack","add":1},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_turns"}],"partial":[{"op":"resource","resource":"stamina","add":-2},{"op":"hp","add":-1},{"op":"relation","from":"npc_miller","add":5},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_bruised"}],"fail":[{"op":"resource","resource":"stamina","add":-2},{"op":"hp","add":-1},{"op":"relation","from":"npc_miller","add":3},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_bruised"}]}},
    act_enc_mill_wheel_rope: {"name":"밧줄을 걸어 비스듬히 당기자고 한다","encounter":"enc_mill_wheel_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_mill_hamlet"},{"op":"day","hourFrom":6,"hourTo":20},{"op":"not","of":{"op":"flag","key":"enc_mill_wheel_done"}}]},"check":{"stat":"int","tags":["labour"],"difficulty":"normal"},"minutes":30,"outcomes":{"great":[{"op":"relation","from":"npc_miller","add":10},{"op":"item","item":"item_flour_sack","add":1},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_rope"}],"success":[{"op":"relation","from":"npc_miller","add":10},{"op":"item","item":"item_flour_sack","add":1},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_rope"}],"partial":[{"op":"relation","from":"npc_miller","add":3},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_slow"}],"fail":[{"op":"relation","from":"npc_miller","add":3},{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_slow"}]}},
    act_enc_mill_wheel_watch: {"name":"둑에 서서 지켜본다","encounter":"enc_mill_wheel_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_mill_hamlet"},{"op":"day","hourFrom":6,"hourTo":20},{"op":"not","of":{"op":"flag","key":"enc_mill_wheel_done"}}]},"minutes":15,"effects":[{"op":"flag","key":"enc_mill_wheel_done","value":true},{"op":"narrate","textId":"enc_mill_wheel_watch"}]},
    act_enc_levy_officer_peek: {"name":"곁을 지나며 장부를 훔쳐본다","encounter":"enc_levy_officer_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_far_bank"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":8,"hourTo":18},{"op":"not","of":{"op":"flag","key":"enc_levy_officer_done"}}]},"check":{"stat":"per","tags":["investigation"],"difficulty":"hard"},"minutes":15,"outcomes":{"great":[{"op":"rumor","rumor":"rum_realm_levy","source":"obs_loc_far_bank","confidence":90},{"op":"proficiency","id":"investigation","add":10},{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_ledger"}],"success":[{"op":"rumor","rumor":"rum_realm_levy","source":"obs_loc_far_bank","confidence":90},{"op":"proficiency","id":"investigation","add":10},{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_ledger"}],"partial":[{"op":"flag","key":"levy_noticed","value":true},{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_noticed"}],"fail":[{"op":"flag","key":"levy_noticed","value":true},{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_noticed"}]}},
    act_enc_levy_officer_warned: {"name":"나그네의 말대로 게시판 반대편 길로 돈다","encounter":"enc_levy_officer_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_far_bank"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":8,"hourTo":18},{"op":"not","of":{"op":"flag","key":"enc_levy_officer_done"}},{"op":"flag","key":"levy_warned"}]},"minutes":30,"effects":[{"op":"proficiency","id":"investigation","add":5},{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_warned"}]},
    act_enc_levy_officer_away: {"name":"고개를 숙이고 멀찍이 돌아간다","encounter":"enc_levy_officer_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_far_bank"},{"op":"signal","key":"caravan_visits","min":1},{"op":"day","hourFrom":8,"hourTo":18},{"op":"not","of":{"op":"flag","key":"enc_levy_officer_done"}}]},"minutes":15,"effects":[{"op":"flag","key":"enc_levy_officer_done","value":true},{"op":"narrate","textId":"enc_levy_officer_away"}]},
    act_enc_followed_slip: {"name":"골목으로 꺾어 따돌린다","encounter":"enc_followed_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_castle_town"},{"op":"flag","key":"levy_noticed"},{"op":"not","of":{"op":"flag","key":"enc_followed_done"}}]},"check":{"stat":"dex","tags":["stealth"],"difficulty":"normal"},"minutes":30,"outcomes":{"great":[{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_slip"}],"success":[{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_slip"}],"partial":[{"op":"money","add":-3},{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_caught"}],"fail":[{"op":"money","add":-3},{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_caught"}]}},
    act_enc_followed_pay: {"name":"은화를 쥐여 주고 돌려보낸다 (은화 3)","encounter":"enc_followed_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_castle_town"},{"op":"flag","key":"levy_noticed"},{"op":"not","of":{"op":"flag","key":"enc_followed_done"}},{"op":"money","min":3}]},"minutes":5,"effects":[{"op":"money","add":-3},{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_pay"}]},
    act_enc_followed_face: {"name":"돌아서서 정면으로 마주 선다","encounter":"enc_followed_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_castle_town"},{"op":"flag","key":"levy_noticed"},{"op":"not","of":{"op":"flag","key":"enc_followed_done"}}]},"check":{"stat":"wis","tags":["social"],"difficulty":"hard"},"minutes":15,"outcomes":{"great":[{"op":"flag","key":"levy_noticed","value":false},{"op":"proficiency","id":"combat","add":5},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_face"}],"success":[{"op":"flag","key":"levy_noticed","value":false},{"op":"proficiency","id":"combat","add":5},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_face"}],"partial":[{"op":"hp","add":-2},{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_beaten"}],"fail":[{"op":"hp","add":-2},{"op":"flag","key":"levy_noticed","value":false},{"op":"flag","key":"enc_followed_done","value":true},{"op":"narrate","textId":"enc_followed_beaten"}]}},
    act_enc_mourner_silver: {"name":"은화를 건넨다 (은화 3)","encounter":"enc_mourner_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_castle_town"},{"op":"signal","key":"guards_fallen","min":1},{"op":"day","hourFrom":7,"hourTo":19},{"op":"not","of":{"op":"flag","key":"enc_mourner_done"}},{"op":"money","min":3}]},"minutes":5,"effects":[{"op":"money","add":-3},{"op":"relation","from":"npc_guild_clerk","add":3},{"op":"flag","key":"enc_mourner_done","value":true},{"op":"narrate","textId":"enc_mourner_silver"}]},
    act_enc_mourner_listen: {"name":"곁에 서서 이야기를 들어 준다","encounter":"enc_mourner_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_castle_town"},{"op":"signal","key":"guards_fallen","min":1},{"op":"day","hourFrom":7,"hourTo":19},{"op":"not","of":{"op":"flag","key":"enc_mourner_done"}}]},"minutes":30,"effects":[{"op":"relation","from":"npc_guild_clerk","add":2},{"op":"flag","key":"enc_mourner_done","value":true},{"op":"narrate","textId":"enc_mourner_listen"}]},
    act_enc_deserter_ask: {"name":"무리의 사정을 캐묻는다","encounter":"enc_deserter_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_band_camp"},{"op":"signal","key":"band_gathering","min":1},{"op":"not","of":{"op":"flag","key":"band_crossed"}},{"op":"not","of":{"op":"flag","key":"enc_deserter_done"}}]},"minutes":15,"effects":[{"op":"rumor","rumor":"rum_band_size","observe":true,"source":"src_deserter","confidence":70,"about":"now"},{"op":"rumor","rumor":"rum_band_crossing_soon","observe":true,"source":"src_deserter","confidence":70,"about":"now"},{"op":"flag","key":"enc_deserter_done","value":true},{"op":"narrate","textId":"enc_deserter_ask"}]},
    act_enc_deserter_south: {"name":"변경 마을로 가는 길을 일러 준다","encounter":"enc_deserter_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_band_camp"},{"op":"signal","key":"band_gathering","min":1},{"op":"not","of":{"op":"flag","key":"band_crossed"}},{"op":"not","of":{"op":"flag","key":"enc_deserter_done"}}]},"minutes":15,"effects":[{"op":"signal","key":"frontier_defense","add":1},{"op":"flag","key":"deserter_sent_south","value":true},{"op":"flag","key":"enc_deserter_done","value":true},{"op":"narrate","textId":"enc_deserter_south"}]},
    act_enc_deserter_hand_over: {"name":"붙잡아 성읍의 조합에 넘긴다","encounter":"enc_deserter_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_band_camp"},{"op":"signal","key":"band_gathering","min":1},{"op":"not","of":{"op":"flag","key":"band_crossed"}},{"op":"not","of":{"op":"flag","key":"enc_deserter_done"}}]},"minutes":960,"effects":[{"op":"move","to":"loc_castle_town"},{"op":"money","add":5},{"op":"relation","from":"npc_guild_clerk","add":3},{"op":"flag","key":"enc_deserter_done","value":true},{"op":"narrate","textId":"enc_deserter_hand_over"}]},
    act_enc_storyteller_frontier: {"name":"동전을 던지고 남쪽 변경의 이야기를 청한다","encounter":"enc_storyteller_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_royal_city"},{"op":"money","min":1},{"op":"not","of":{"op":"flag","key":"enc_storyteller_done"}}]},"minutes":30,"effects":[{"op":"money","add":-1},{"op":"if","when":{"op":"unlock","id":"unl_realm_renown"},"then":[{"op":"narrate","textId":"enc_storyteller_my_tale"}],"else":[{"op":"if","when":{"op":"flag","key":"bandits_truth_north"},"then":[{"op":"narrate","textId":"enc_storyteller_truth"}],"else":[{"op":"narrate","textId":"enc_storyteller_legend"}]}]},{"op":"flag","key":"enc_storyteller_done","value":true}]},
    act_enc_storyteller_fled: {"name":"동전을 던지고 강을 건너 달아난 이들의 이야기를 청한다","encounter":"enc_storyteller_intro","requires":{"op":"and","of":[{"op":"location","at":"loc_royal_city"},{"op":"money","min":1},{"op":"not","of":{"op":"flag","key":"enc_storyteller_done"}}]},"minutes":30,"effects":[{"op":"money","add":-1},{"op":"narrate","textId":"enc_storyteller_fled"},{"op":"flag","key":"enc_storyteller_done","value":true}]}
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
          name: "폐허에 대해 묻는다",
          // V2-Core-55 (D-84): the +5 is for the first telling only -- once per character (their own
          // knowledge), so asking again is not a way to earn trust
          effects: [
            { op: "if", when: { op: "not", of: { op: "rumor", rumor: "rum_ruins_secret" } }, then: [{ op: "relation", from: "npc_elder", add: 5 }] },
            { op: "rumor", rumor: "rum_ruins_secret", source: "npc_elder", confidence: 60 },
            { op: "narrate", textId: "txt_ask_ruins" },
            // V2-Core-68: once he has heard of the arrows, the ruins and the spring are one story to him
            { op: "if", when: ARROWS_TOLD, then: [say("txt_ask_ruins_spring")] },
            // The marked route is a public consequence of the report, not
            // the earlier teller's private hypothesis. A successor may hear it.
            { op: "if", when: { op: "and", of: [
              ARROWS_TOLD,
              { op: "not", of: { op: "flag", key: "spring_patrol_deployed" } },
              { op: "not", of: WELL_RESOLVED }
            ] }, then: [say("txt_spring_patrol_pending")] },
            { op: "if", when: { op: "and", of: [
              { op: "flag", key: "spring_patrol_deployed" },
              { op: "not", of: WELL_RESOLVED }
            ] }, then: [
              { op: "if", when: { op: "flag", key: "spring_patrol_helped" },
                then: [say("txt_spring_patrol_helped_public")],
                else: [say("txt_spring_patrol_deployed")] }
            ] },
            // Patrol findings become a *new second-hand lead* only when this
            // character asks. A predecessor's report is not inherited, and
            // firsthand evidence already held by this life is never overwritten.
            { op: "if", when: { op: "and", of: [
              { op: "flag", key: "spring_patrol_trap_found" },
              { op: "not", of: { op: "rumor", rumor: "rum_spring_trap_mark" } }
            ] }, then: [
              // A public notice improves hearsay, never converts it to an observation.
              { op: "if", when: { op: "signal", key: "spring_trap_followup", eq: 2 },
                then: [{ op: "rumor", rumor: "rum_spring_trap_mark", source: "npc_elder", confidence: 80 }],
                else: [{ op: "rumor", rumor: "rum_spring_trap_mark", source: "npc_elder", confidence: 55 }] },
              say("txt_spring_patrol_trap_news")
            ] },
            { op: "if", when: { op: "signal", key: "spring_trap_followup", eq: 1 },
              then: [say("txt_spring_trap_route_followup")] },
            { op: "if", when: { op: "signal", key: "spring_trap_followup", eq: 2 },
              then: [say("txt_spring_trap_notice_followup")] },
            // The elder's later account changes with the public response, without
            // disclosing the unseen spring cause or an earlier life’s private knowledge.
            { op: "if", when: { op: "and", of: [{ op: "flag", key: "spring_watch_requested" }, { op: "not", of: ARROWS_TOLD }] },
              then: [say("txt_spring_watch_followup")] },
            { op: "if", when: { op: "and", of: [{ op: "flag", key: "spring_inquiry_requested" }, { op: "not", of: ARROWS_TOLD }] },
              then: [say("txt_spring_inquiry_followup")] },
            // Reappraisal is personal: another life hears the public arrows account,
            // but not this teller's earlier guess or the elder's private response.
            { op: "if", when: { op: "relation", from: "npc_elder", to: "self", tag: "spring_watch_vindicated" },
              then: [say("txt_spring_watch_afterproof")] },
            { op: "if", when: { op: "relation", from: "npc_elder", to: "self", tag: "spring_inquiry_revised" },
              then: [say("txt_spring_inquiry_afterproof")] }
          ]
        },
        // J3 #443: two mutually exclusive decisions after firsthand verification.
        // The world keeps one bounded signal; no private knowledge is inherited.
        {
          id: "opt_elder_trap_reinforce_route",
          name: "확인한 덫 주변의 샘길 표식을 보강한다 (2시간, 기력 2)",
          requires: { op: "and", of: [TRAP_MARK_FIRSTHAND, STAMINA_AT_LEAST(2)] },
          minutes: 120,
          effects: [
            { op: "resource", resource: "stamina", add: -2 },
            { op: "signal", key: "spring_trap_followup", add: 1 },
            { op: "relation", from: "npc_elder", tag: "spring_trap_route_reinforced" },
            say("txt_spring_trap_route_reinforced")
          ]
        },
        {
          id: "opt_elder_trap_publish_warning",
          name: "확인한 덫 표식을 마을 장부에 공고한다 (30분, 은화 1)",
          requires: { op: "and", of: [TRAP_MARK_FIRSTHAND, { op: "money", min: 1 }] },
          minutes: 30,
          effects: [
            { op: "money", add: -1 },
            { op: "signal", key: "spring_trap_followup", add: 2 },
            { op: "relation", from: "npc_elder", add: 4, tag: "spring_trap_notice_published" },
            say("txt_spring_trap_warning_published")
          ]
        },
        // J3: the village's watch now helps the player prepare, without claiming the rumor is true.
        // The grant is personal (relation tag), while the decision remains world-owned.
        {
          id: "opt_elder_spring_watch_lantern",
          name: "샘길을 지키던 마을의 등불을 받는다",
          requires: { op: "and", of: [
            { op: "flag", key: "spring_watch_requested" },
            { op: "rumor", rumor: "rum_ruins_secret" },
            KNOWS_WELL_SOURCE,
            { op: "not", of: WELL_RESOLVED },
            { op: "not", of: { op: "item", item: "item_lantern", min: 1 } },
            { op: "not", of: { op: "relation", from: "npc_elder", to: "self", tag: "spring_watch_lantern_loaned" } }
          ] },
          minutes: 10,
          effects: [
            { op: "item", item: "item_lantern", add: 1 },
            { op: "relation", from: "npc_elder", tag: "spring_watch_lantern_loaned" },
            say("txt_spring_watch_lantern")
          ]
        },
        {
          id: "opt_small_talk",
          name: "안부만 묻는다",
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
        // V2-Core-138 (M4): the elder asks who gathers the band; told, he warns the frontier (once, for the world)
        {
          id: "opt_elder_band_word",
          name: "강 건너 소문을 나눈다",
          requires: BAND_GATHERING,
          effects: [
            {
              op: "if",
              when: FRONTIER_WARNED,
              then: [say("txt_elder_band_warned"), { op: "rumor", rumor: "rum_frontier_warned", source: "npc_elder", confidence: 90 }],
              else: [
                {
                  op: "if",
                  when: KNOWS_BAND_LEADER,
                  then: [
                    { op: "if", when: KNOWS_BAND_SCARRED, then: [say("txt_elder_band_scarred")], else: [say("txt_elder_band_remnant")] },
                    { op: "flag", key: "frontier_warned", value: true },
                    { op: "fact", fact: "fact_frontier_warned", set: "warned" },
                    { op: "relation", from: "npc_elder", add: 5 },
                    { op: "rumor", rumor: "rum_frontier_warned", source: "npc_elder", confidence: 90 }
                  ],
                  else: [
                    say("txt_elder_band_ask"),
                    { op: "fact", fact: "fact_elder_request", set: "who_leads" },
                    { op: "rumor", rumor: "rum_elder_asks_band", source: "npc_elder", confidence: 90 }
                  ]
                }
              ]
            }
          ]
        },
        // V2-Core-139 (M5): the village prepares -- silver (three times at most), an iron sword, two salves (once each)
        {
          id: "opt_elder_give_silver",
          name: "마을의 대비에 은화 10을 보탠다",
          requires: { op: "and", of: [FRONTIER_WARNED, { op: "money", min: 10 }, { op: "signal", key: "frontier_silver", max: 2 }] },
          effects: [{ op: "money", add: -10 }, { op: "signal", key: "frontier_silver", add: 1 }, ...DEFENSE_UP, { op: "fact", fact: "fact_frontier_prepared", set: "helped" }, { op: "rumor", rumor: "rum_frontier_prepared", source: "npc_elder", confidence: 90 }, say("txt_elder_given_silver")]
        },
        {
          id: "opt_elder_give_sword",
          name: "철검을 마을에 내놓는다",
          requires: { op: "and", of: [FRONTIER_WARNED, { op: "item", item: "item_iron_sword", min: 1 }, { op: "not", of: { op: "item", item: "item_iron_sword", equipped: true } }, { op: "not", of: { op: "flag", key: "frontier_got_sword" } }] },
          effects: [{ op: "item", item: "item_iron_sword", add: -1 }, { op: "flag", key: "frontier_got_sword", value: true }, ...DEFENSE_UP, { op: "fact", fact: "fact_frontier_prepared", set: "helped" }, { op: "rumor", rumor: "rum_frontier_prepared", source: "npc_elder", confidence: 90 }, say("txt_elder_given_sword")]
        },
        {
          id: "opt_elder_give_salve",
          name: "약초 연고 둘을 내놓는다",
          requires: { op: "and", of: [FRONTIER_WARNED, { op: "item", item: "item_herbal_salve", min: 2 }, { op: "not", of: { op: "flag", key: "frontier_got_salve" } }] },
          effects: [{ op: "item", item: "item_herbal_salve", add: -2 }, { op: "flag", key: "frontier_got_salve", value: true }, ...DEFENSE_UP, { op: "fact", fact: "fact_frontier_prepared", set: "helped" }, { op: "rumor", rumor: "rum_frontier_prepared", source: "npc_elder", confidence: 90 }, say("txt_elder_given_salve")]
        },
        // V2-Core-139 (M5, MC-02): the lord's offer, brought to the elder -- he asks this character's counsel, and the
        // frontier answers once, for the world
        {
          id: "opt_elder_lord_accept",
          name: "영주의 보호를 받아들이자고 한다",
          requires: { op: "and", of: [{ op: "rumor", rumor: "rum_lord_offer" }, LORD_UNDECIDED] },
          effects: [
            { op: "signal", key: "lord_pact", add: 1 },
            { op: "fact", fact: "fact_lord_pact", set: "accepted" },
            ...DEFENSE_UP,
            ...DEFENSE_UP,
            { op: "rumor", rumor: "rum_lord_pact_accepted", source: "npc_elder", confidence: 90 },
            say("txt_elder_lord_accepted")
          ]
        },
        {
          id: "opt_elder_lord_refuse",
          name: "변경이 스스로 지키자고 한다",
          requires: { op: "and", of: [{ op: "rumor", rumor: "rum_lord_offer" }, LORD_UNDECIDED] },
          effects: [
            { op: "signal", key: "lord_pact", add: 2 },
            { op: "fact", fact: "fact_lord_pact", set: "refused" },
            { op: "relation", from: "npc_elder", add: 5 },
            { op: "rumor", rumor: "rum_lord_pact_refused", source: "npc_elder", confidence: 90 },
            say("txt_elder_lord_refused")
          ]
        },
        // V2-Core-140 (M6): the band across -- the elder tells when it will strike and how the village stands
        {
          id: "opt_elder_band_crossed",
          name: "건너온 무리에 대해 묻는다",
          requires: BAND_IN_THE_LAND,
          effects: [
            { op: "rumor", rumor: "rum_band_crossed", source: "npc_elder", confidence: 90, about: "now" },
            { op: "rumor", rumor: "rum_raid_coming", source: "npc_elder", confidence: 80, about: "now" },
            say("txt_elder_band_crossed"),
            { op: "if", when: FERRYMAN_WATCHES, then: [say("txt_elder_ferryman_word")] },
            { op: "if", when: CROWN_WRIT, then: [say("txt_elder_crown_writ")] },
            { op: "if", when: FRONTIER_HOLDS, then: [say("txt_elder_raid_ready")], else: [say("txt_elder_raid_thin")] }
          ]
        },
        // V2-Core-140 (M6): after -- what became of the frontier, and what the world remembers (Q3)
        {
          id: "opt_elder_aftermath",
          name: "그날의 일을 듣는다",
          requires: FATE_DECIDED,
          effects: [
            {
              op: "if",
              when: FATE(1),
              then: [{ op: "rumor", rumor: "rum_ending_name", source: "npc_elder", confidence: 90 }, say("txt_elder_after_name")],
              else: [
                {
                  op: "if",
                  when: FATE(2),
                  then: [{ op: "rumor", rumor: "rum_ending_held", source: "npc_elder", confidence: 90 }, say("txt_elder_after_held")],
                  else: [
                    {
                      op: "if",
                      when: FATE(3),
                      then: [{ op: "rumor", rumor: "rum_ending_lord", source: "npc_elder", confidence: 90 }, say("txt_elder_after_lord")],
                      else: [{ op: "rumor", rumor: "rum_ending_fell", source: "npc_elder", confidence: 90 }, say("txt_elder_after_fell")]
                    }
                  ]
                }
              ]
            },
            { op: "if", when: VILLAGE_DEFENDER, then: [say("txt_elder_after_defender")] },
            { op: "if", when: GUILD_KEEPS_GUARDS, then: [say("txt_elder_after_guild")] },
            { op: "if", when: FRONTIER_WARNED, then: [say("txt_elder_after_warned")] },
            // V2-Core-150 (D-128, #373): and the guard who did not come back, once the village has heard it (World Memory,
            // V2-Core-103) -- no name and no more than the village heard (D-71, N-06)
            { op: "if", when: { op: "flag", key: "guard_fall_word_south" }, then: [say("txt_elder_after_fallen")] }
          ]
        },
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
            // The teller remembers this public act on their own relationship edge.
            // Successors cannot inherit it, and the UI need not read world flags.
            { op: "relation", from: "npc_elder", add: 5, tag: "spring_arrows_reported" },
            say("txt_tell_spring_arrows"),
            // J3: only the reporting character's earlier committed judgment can
            // be re-evaluated. A bare world flag or another life's choice cannot
            // award either consequence. The report is world-once; both branches
            // use existing relation effects and consume no additional RNG.
            { op: "if", when: { op: "relation", from: "npc_elder", to: "self", tag: "spring_watch_requested" },
              then: [{ op: "relation", from: "npc_elder", add: 2, tag: "spring_watch_vindicated" },
                say("txt_spring_watch_vindicated")] },
            { op: "if", when: { op: "relation", from: "npc_elder", to: "self", tag: "spring_inquiry_requested" },
              then: [{ op: "relation", from: "npc_elder", add: -1, tag: "spring_inquiry_revised" },
                say("txt_spring_inquiry_revised")] },
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
      // V2-Core-132 (#328): what this choice bears on, for the knowledge list (UI metadata)
      relevantFacts: ["fact_town_flour", "fact_caravan_flour"],
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
            },
            // V2-Core-132 (#328, D-113): the town's want as the last caravan brought it, and what that caravan took north --
            // his own knowledge passed on, dated by the day the caravan passed (D-112), not by today
            {
              op: "if",
              when: { op: "signal", key: "town_word_south", min: 1 },
              then: [
                {
                  op: "if",
                  when: { op: "signal", key: "town_word_south", eq: 1 },
                  then: [{ op: "rumor", rumor: "rum_town_flour_wanted", from: "npc_ferryman" }, say("txt_ferryman_town_wants")],
                  else: [{ op: "rumor", rumor: "rum_town_flour_enough", from: "npc_ferryman" }, say("txt_ferryman_town_enough")]
                },
                { op: "if", when: { op: "signal", key: "caravan_took_flour", min: 1 }, then: [{ op: "rumor", rumor: "rum_caravan_took_flour", from: "npc_ferryman" }, say("txt_ferryman_caravan_took")] },
                { op: "if", when: NOTES_DOUBTED, then: [say("txt_ferryman_doubts_notes")] }
              ]
            },
            // V2-Core-149 (D-127, #371): the frontier's story gone north with the caravans -- his own word, passed on
            {
              op: "if",
              when: { op: "fact", fact: "fact_fate_word", eq: "north" },
              then: [{ op: "rumor", rumor: "rum_fate_word_north", from: "npc_ferryman" }, say("txt_ferryman_fate_north")]
            }
          ]
        },
        // V2-Core-138 (M4): what the river saw -- armed men crossing at night; the leader, if he is the man he ferried before
        {
          id: "opt_ferryman_watch",
          name: "무리가 건너오면 마을에 알려 달라고 부탁한다 (은화 5)",
          requires: { op: "and", of: [BAND_ACROSS, { op: "rumor", rumor: "rum_band_recruits" }, { op: "not", of: FERRYMAN_WATCHES }, { op: "money", min: 5 }] },
          effects: [
            { op: "money", add: -5 },
            { op: "flag", key: "ferryman_watches", value: true },
            { op: "relation", from: "npc_ferryman", add: 3 },
            { op: "fact", fact: "fact_ferryman_watch", set: "watching" },
            { op: "rumor", rumor: "rum_ferryman_watches", source: "npc_ferryman", confidence: 90 },
            say("txt_ferryman_watch")
          ]
        },
        {
          id: "opt_ferryman_band",
          name: "강 건너 무리에 대해 묻는다",
          requires: BAND_GATHERING,
          effects: [
            say("txt_ferryman_band"),
            { op: "rumor", rumor: "rum_band_recruits", source: "npc_ferryman", confidence: 70, about: "now" },
            // V2-Core-139 (M5): the north woods' path they took
            { op: "fact", fact: "fact_band_camp", set: "north_woods" },
            { op: "rumor", rumor: "rum_band_camp_way", source: "npc_ferryman", confidence: 70 },
            {
              op: "if",
              when: LEADER_LIVES,
              then: [say("txt_ferryman_band_scarred"), { op: "rumor", rumor: "rum_band_led_by_scarred", source: "npc_ferryman", confidence: 60 }],
              else: [say("txt_ferryman_band_unknown")]
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
        },
        // V2-Core-132 (#328, D-113): the merchant's flour crosses on his account
        {
          id: "opt_ferryman_cross_note",
          name: "상인의 짐표를 보이고 밀가루를 싣는다",
          requires: { op: "and", of: [HAS_NOTE, { op: "item", item: "item_flour_sack", min: 1 }, { op: "not", of: NOTES_DOUBTED }, { op: "not", of: NOTES_REFUSED }] },
          minutes: 30,
          effects: [
            { op: "item", item: "item_merchant_note", add: -1 },
            { op: "relation", from: "npc_town_merchant", tag: "carrying" },
            { op: "signal", key: "merchant_ferry_account", add: 3 },
            { op: "relation", from: "npc_ferryman", add: 2 },
            { op: "move", to: "loc_far_bank" },
            say("txt_ferryman_cross_note")
          ]
        },
        // and the note shown with nothing to carry -- it works once, and is seen
        {
          id: "opt_ferryman_cross_note_empty",
          name: "짐 없이 상인의 짐표를 내민다",
          requires: { op: "and", of: [HAS_NOTE, { op: "not", of: { op: "item", item: "item_flour_sack", min: 1 } }, { op: "not", of: NOTES_DOUBTED }, { op: "not", of: NOTES_REFUSED }] },
          minutes: 30,
          effects: [
            { op: "item", item: "item_merchant_note", add: -1 },
            { op: "signal", key: "merchant_ferry_account", add: 3 },
            { op: "signal", key: "ferry_note_doubt", add: 1 },
            { op: "relation", from: "npc_ferryman", add: -10, tag: "note_misused" },
            { op: "relation", from: "npc_ferryman", tag: "note_refused" },
            { op: "move", to: "loc_far_bank" },
            say("txt_ferryman_note_misused")
          ]
        }
      ]
    },
    // V2-Core-73 (#180): the miller of the hamlet
    // V2-Core-77 (#189): the castle town's market -- the same goods are worth differently here (World Bible
    // W-04/W-05, Draft working assumptions; the prices are gameplay values, the merchant's reasons his claim)
    choice_town_merchant_dialogue: {
      // V2-Core-132 (#328): what this choice bears on, for the knowledge list (UI metadata)
      relevantFacts: ["fact_town_flour"],
      options: [
        {
          id: "opt_town_merchant_ask",
          name: "강 남쪽 물건에 대해 묻는다",
          effects: [
            say("txt_town_merchant_south_goods"),
            { op: "if", when: NORTH_WAYSTATION_RELIABLE,
              then: [say("txt_town_merchant_safe_route")] },
            { op: "if", when: NORTH_SUPPLY_RELIEF,
              then: [say("txt_town_merchant_relief_pact"),
                { op: "if", when: NORTH_RELIEF_SHORTAGE,
                  then: [say("txt_town_merchant_relief_shortage")],
                  else: [{ op: "if", when: { op: "flag", key: "north_relief_shortage_recovered" },
                    then: [say("txt_town_merchant_relief_recovered")] }] }],
              else: [{ op: "if", when: { op: "flag", key: "north_supply_private_sale" },
                then: [say("txt_town_merchant_private_contract")] }] },
            // V2-Core-85 (#207): whether the town wants flour now
            {
              op: "if",
              when: HAMLET_TRADES,
              then: [
                { op: "if", when: { op: "signal", key: "town_flour_wanted", min: 1 }, then: [say("txt_town_merchant_flour_wanted")], else: [say("txt_town_merchant_flour_enough")] },
                // V2-Core-132 (#328, D-113): and the word is the character's to keep -- today's, from the one who knows
                MERCHANT_FLOUR_WORD,
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
          name: "밀가루 자루를 판다 (은화 6)",
          // V2-Core-148 (D-126): not while a carriage on his note is under way -- its sack goes at the note's price first
          requires: { op: "and", of: [HAMLET_TRADES, { op: "item", item: "item_flour_sack", min: 1 }, { op: "signal", key: "town_flour_wanted", min: 1 }, { op: "not", of: FAIR_TIME }, { op: "not", of: CARRYING }] },
          // V2-Core-133 (#331): 6 (was 4) -- a sack carried north pays for the fare (3) and leaves a silver (mill 2)
          effects: [{ op: "money", add: 6 }, ...FLOUR_SOLD, say("txt_town_merchant_buy_flour")]
        },
        // V2-Core-86 (#207): the fair's price -- the same want, the same sack, more silver
        {
          id: "opt_town_merchant_sell_flour_fair",
          name: "밀가루 자루를 판다 (은화 8)",
          requires: { op: "and", of: [HAMLET_TRADES, { op: "item", item: "item_flour_sack", min: 1 }, { op: "signal", key: "town_flour_wanted", min: 1 }, FAIR_TIME, { op: "not", of: CARRYING }] },
          // V2-Core-133 (#331): 8 (was 6) -- the fair's +2 over the plain price kept
          effects: [{ op: "money", add: 8 }, ...FLOUR_SOLD, say("txt_town_merchant_buy_flour_fair")]
        },
        // V2-Core-132 (#328, D-113): the carrier's note -- a supplier the merchant knows (10) is given a note for the next
        // carriage (one crossing on his account); the sack it brings is bought even if the town's want has been met by then.
        // V2-Core-148 (D-126, M8 step 3 K1, WB-0030 Q9 E1): and at the note's price (4) even while the town wants -- the note
        // is the steady way (no fare, a sure buyer), the market's price the free trader's; the carrier's second sack sells
        // as any other once the note's is sold
        {
          id: "opt_town_merchant_order",
          name: "밀가루를 대 주기로 하고 짐표를 받는다",
          requires: { op: "and", of: [HAMLET_TRADES, MERCHANT_KNOWS, { op: "not", of: HAS_NOTE }, { op: "not", of: CARRYING }] },
          effects: [{ op: "item", item: "item_merchant_note", add: 1 }, say("txt_town_merchant_order")]
        },
        {
          id: "opt_town_merchant_sell_flour_note",
          name: "짐표대로 밀가루를 넘긴다 (은화 4)",
          requires: { op: "and", of: [HAMLET_TRADES, CARRYING, { op: "item", item: "item_flour_sack", min: 1 }] },
          effects: [
            { op: "money", add: 4 },
            { op: "if", when: TOWN_WANTS, then: [say("txt_town_merchant_buy_flour_note_wanted")], else: [say("txt_town_merchant_buy_flour_note")] },
            ...FLOUR_SOLD
          ]
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
            // V2-Core-142 (M7): the realm's name -- the guild greets it once (its `renowned` tag)
            {
              op: "if",
              when: { op: "and", of: [RENOWNED, { op: "not", of: { op: "relation", from: "npc_guild_clerk", to: "self", tag: "renowned" } }] },
              then: [{ op: "relation", from: "npc_guild_clerk", add: 10, tag: "renowned" }, say("txt_guild_clerk_renowned")]
            },
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
        // V2-Core-138 (M4): the ledger -- guards lost to a better wage across the river; who leads, only to a guard it knows
        {
          id: "opt_guild_clerk_band",
          name: "강 건너 무리에 대해 묻는다",
          requires: BAND_GATHERING,
          effects: [
            say("txt_guild_clerk_band"),
            { op: "rumor", rumor: "rum_band_recruits", source: "npc_guild_clerk", confidence: 80, about: "now" },
            {
              op: "if",
              when: GUILD_KNOWS,
              then: [
                {
                  op: "if",
                  when: LEADER_LIVES,
                  then: [say("txt_guild_clerk_band_scarred"), { op: "rumor", rumor: "rum_band_led_by_scarred", source: "npc_guild_clerk", confidence: 70 }],
                  else: [say("txt_guild_clerk_band_remnant"), { op: "rumor", rumor: "rum_band_led_by_remnant", source: "npc_guild_clerk", confidence: 70 }]
                }
              ],
              else: [say("txt_guild_clerk_band_closed")]
            }
          ]
        },
        // V2-Core-139 (M5): a guard the guild knows tells who leads them -- the guild raises its wage and keeps its guards
        {
          id: "opt_guild_clerk_warn",
          name: "무리를 이끄는 자를 알린다",
          requires: { op: "and", of: [BAND_GATHERING, KNOWS_BAND_LEADER, GUILD_KNOWS, { op: "not", of: GUILD_KEEPS_GUARDS }] },
          effects: [
            { op: "flag", key: "guild_keeps_guards", value: true },
            { op: "fact", fact: "fact_guild_keeps_guards", set: "kept" },
            { op: "relation", from: "npc_guild_clerk", add: 5 },
            { op: "rumor", rumor: "rum_guild_keeps_guards", source: "npc_guild_clerk", confidence: 90 },
            say("txt_guild_clerk_warned")
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
              ...WOUND_ON_FAIL,
              DANGER_FAIL_TRUST
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
            { op: "if", when: NORTH_SUPPLY_RELIEF,
              then: [say("txt_miller_relief_arrives"),
                { op: "if", when: NORTH_RELIEF_STALLED,
                  then: [say("txt_miller_relief_stalled")] },
                { op: "if", when: { op: "signal", key: "north_relief_losses", min: 1 },
                  then: [say("txt_miller_relief_losses")] },
                { op: "if", when: NORTH_RELIEF_SHORTAGE,
                  then: [say("txt_miller_relief_shortage")],
                  else: [{ op: "if", when: { op: "flag", key: "north_relief_shortage_recovered" },
                    then: [say("txt_miller_relief_recovered")] }] },
                { op: "if", when: NORTH_MILL_RELIEF_STOCK,
                  then: [say("txt_miller_relief_stocked")],
                  else: [say("txt_miller_relief_empty")] }],
              else: [{ op: "if", when: { op: "flag", key: "north_supply_private_sale" },
                then: [say("txt_miller_private_shortage")] }] },
            // V2-Core-141 (M2): the band across the river buys flour -- the miller hears who pays
            { op: "if", when: BAND_GATHERING, then: [{ op: "rumor", rumor: "rum_band_recruits", source: "npc_miller", confidence: 60, about: "now" }, say("txt_miller_band")] },
            // V2-Core-135 (D-114): what he made of the caravan's last purchase -- told as the day it happened (a seller's guess)
            {
              op: "if",
              when: { op: "rumor", subject: "npc_miller", rumor: "rum_town_flour_caravan_bought" },
              then: [{ op: "rumor", rumor: "rum_town_flour_caravan_bought", from: "npc_miller" }, say("txt_miller_caravan_bought")]
            },
            // V2-Core-85 (#207): the day's flour to spare already gone
            { op: "if", when: { op: "and", of: [HAMLET_TRADES, { op: "signal", key: "mill_flour_stock", max: 0 }] }, then: [say("txt_miller_flour_gone")] }
          ]
        },
        {
          id: "opt_miller_sell_herb",
          name: "정화초를 판다 (은화 2)",
          requires: { op: "item", item: "item_purifying_herb", min: 1 },
          effects: [{ op: "item", item: "item_purifying_herb", add: -1 }, { op: "money", add: 2 }, { op: "relation", from: "npc_miller", add: 1 }, say("txt_miller_buy_herb")]
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
            { op: "if", when: ARROWS_TOLD, then: [say("txt_herbalist_bandit_rumor")] },
            // The market remembers concrete aid, not the player's private proof.
            { op: "if", when: { op: "flag", key: "spring_trap_herbalist_route_supplied" },
              then: [say("txt_herbalist_trap_safe_harvest_followup")] },
            { op: "if", when: { op: "flag", key: "spring_trap_herbalist_notice_shared" },
              then: [say("txt_herbalist_trap_share_notice_followup")] }
          ]
        },
        // J3: evidence-first inquiry changes the herbalist's actual help, not the hidden spring truth.
        {
          id: "opt_herbalist_spring_inquiry_herb",
          name: "샘 조사에 쓸 정화초를 받는다",
          requires: { op: "and", of: [
            { op: "flag", key: "spring_inquiry_requested" },
            { op: "rumor", rumor: "rum_ruins_secret" },
            KNOWS_WELL_SOURCE,
            { op: "not", of: WELL_RESOLVED },
            { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "spring_inquiry_herb_given" } }
          ] },
          minutes: 10,
          effects: [
            { op: "item", item: "item_purifying_herb", add: 1 },
            { op: "relation", from: "npc_herbalist", tag: "spring_inquiry_herb_given" },
            say("txt_spring_inquiry_herb")
          ]
        },
        // J3: the elder's verified trap decision changes what the herbalist
        // can safely do. The rumor requirement is this character's own heard
        // account; the public flags persist but do not grant private proof.
        {
          id: "opt_herbalist_trap_safe_harvest",
          name: "보강된 샘길 표식을 따라 약초꾼의 채집을 돕는다 (90분, 기력 2)",
          requires: { op: "and", of: [
            { op: "signal", key: "spring_trap_followup", eq: 1 },
            { op: "rumor", rumor: "rum_spring_trap_mark" },
            KNOWS_WELL_SOURCE,
            STAMINA_AT_LEAST(2),
            { op: "not", of: { op: "flag", key: "spring_trap_herbalist_route_supplied" } }
          ] },
          minutes: 90,
          effects: [
            { op: "resource", resource: "stamina", add: -2 },
            { op: "item", item: "item_purifying_herb", add: 2 },
            { op: "flag", key: "spring_trap_herbalist_route_supplied", value: true },
            { op: "relation", from: "npc_herbalist", add: 3, tag: "spring_trap_herbalist_route_supplied" },
            say("txt_herbalist_trap_safe_harvest")
          ]
        },
        {
          id: "opt_herbalist_trap_share_notice",
          name: "덫의 경고문을 장터 약초꾼에게 전달한다 (30분)",
          requires: { op: "and", of: [
            { op: "signal", key: "spring_trap_followup", eq: 2 },
            { op: "rumor", rumor: "rum_spring_trap_mark" },
            KNOWS_WELL_SOURCE,
            { op: "not", of: { op: "flag", key: "spring_trap_herbalist_notice_shared" } }
          ] },
          minutes: 30,
          effects: [
            { op: "item", item: "item_herbal_salve", add: 1 },
            { op: "flag", key: "spring_trap_herbalist_notice_shared", value: true },
            { op: "relation", from: "npc_herbalist", add: 3, tag: "spring_trap_herbalist_notice_shared" },
            say("txt_herbalist_trap_share_notice")
          ]
        },
        {
          id: "opt_herbalist_small_talk",
          name: "약초 이야기만 나눈다",
          effects: [
            say("txt_herbalist_small_talk"),
            // V2-Core-141 (M2): the herbs that come from the spring again -- once, to one who talks with her (her `herb_friend` tag)
            {
              op: "if",
              when: { op: "and", of: [{ op: "signal", key: "spring_herbs_picked", min: 3 }, { op: "not", of: { op: "relation", from: "npc_herbalist", to: "self", tag: "herb_friend" } }] },
              then: [{ op: "relation", from: "npc_herbalist", add: 3, tag: "herb_friend" }, say("txt_herbalist_herbs_back")]
            }
          ]
        },
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
          // V2-Core-141 (M2): the brewing takes its time
          minutes: 30,
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
          // V2-Core-141 (M2): she has heard from the village that the well runs clear -- the spring's fate, confirmed
          effects: [{ op: "relation", from: "npc_herbalist", add: 10, tag: "thanked" }, { op: "rumor", rumor: "rum_well_fate", source: "npc_herbalist", confidence: 90 }, say("txt_herbalist_thanks")]
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
        // After the frontier's fate, an experienced herbalist can help her set up work that continues without them.
        // The flour and herbs are supplied by the player; the salves stay in the world until someone collects them.
        {
          id: "opt_herbalist_establish_stock",
          name: "약초꾼의 마을 연고 일을 돕는다 (밀가루 한 자루)",
          requires: {
            op: "and",
            of: [
              FATE_DECIDED,
              { op: "skill", skill: "herbalism", min: 2 },
              { op: "relation", from: "npc_herbalist", to: "self", min: 10 },
              { op: "item", item: "item_flour_sack", min: 1 },
              { op: "not", of: { op: "flag", key: "herbalist_stock_established" } }
            ]
          },
          minutes: 120,
          effects: [
            { op: "item", item: "item_flour_sack", add: -1 },
            { op: "flag", key: "herbalist_stock_established", value: true },
            { op: "fact", fact: "fact_herbalist_stock", set: "established" },
            { op: "rumor", rumor: "rum_herbalist_stock", source: "npc_herbalist", confidence: 90 },
            say("txt_herbalist_establish_stock")
          ]
        },
        {
          id: "opt_herbalist_stock_status",
          name: "약초꾼이 맡은 연고 일에 대해 묻는다",
          requires: FATE_DECIDED,
          effects: [
            {
              op: "if",
              when: { op: "flag", key: "herbalist_stock_established" },
              then: [
                { op: "rumor", rumor: "rum_herbalist_stock", source: "npc_herbalist", confidence: 90 },
                {
                  op: "if",
                  when: { op: "signal", key: "herbalist_salve_stock", min: 1 },
                  then: [
                    { op: "if", when: { op: "signal", key: "herbalist_brew_due", min: 1 }, then: [say("txt_herbalist_stock_ready_working")], else: [say("txt_herbalist_stock_ready")] }
                  ],
                  else: [
                    { op: "if", when: { op: "signal", key: "herbalist_brew_due", min: 1 }, then: [say("txt_herbalist_stock_working")], else: [say("txt_herbalist_stock_empty")] }
                  ]
                }
              ],
              else: [say("txt_herbalist_stock_guidance")]
            }
          ]
        },
        {
          id: "opt_herbalist_supply_batch",
          name: "정화초 두 묶음을 약초꾼의 연고 일에 맡긴다",
          requires: {
            op: "and",
            of: [
              { op: "flag", key: "herbalist_stock_established" },
              { op: "rumor", rumor: "rum_herbalist_stock" },
              { op: "item", item: "item_purifying_herb", min: 2 },
              { op: "signal", key: "herbalist_brew_due", max: 0 },
              { op: "signal", key: "herbalist_salve_stock", max: 0 }
            ]
          },
          minutes: 30,
          effects: [
            { op: "item", item: "item_purifying_herb", add: -2 },
            { op: "signal", key: "herbalist_brew_due", add: 3 },
            say("txt_herbalist_supply_batch")
          ]
        },
        {
          id: "opt_herbalist_collect_salve",
          name: "약초꾼이 만든 연고를 찾아간다",
          requires: { op: "and", of: [{ op: "flag", key: "herbalist_stock_established" }, { op: "rumor", rumor: "rum_herbalist_stock" }, { op: "signal", key: "herbalist_salve_stock", min: 1 }] },
          minutes: 10,
          effects: [
            { op: "signal", key: "herbalist_salve_stock", add: -1 },
            { op: "item", item: "item_herbal_salve", add: 1 },
            say("txt_herbalist_collect_salve")
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
        // A personally learned defensive stance: lower damage than a strike,
        // but avoids the leader's heavy-blow retaliation on a failed guard.
        {
          id: "opt_fight_guarded_stance",
          name: "방어 자세로 틈을 노린다 (기력 2)",
          requires: { op: "and", of: [{ op: "unlock", id: "unl_guarded_stance" }, STAMINA_AT_LEAST(2)] },
          check: { stat: "dex", skill: "swordsmanship", tags: ["combat"], difficulty: FIGHT_DIFFICULTY(11, "dex") },
          minutes: 5,
          outcomes: payStamina(2, {
            great: fightExchange([hitLeader(-5), say("txt_guarded_stance_hit")]),
            success: fightExchange([hitLeader(-3), say("txt_guarded_stance_hit")]),
            partial: fightExchange([hitSelf(-1), say("txt_guarded_stance_block")]),
            fail: fightExchange([hitSelf(-2), say("txt_guarded_stance_block")])
          })
        },
        // Offensive sword technique: stronger than a normal strike but expensive
        // and dangerous on a missed opening. Personal unlock + equipped weapon.
        {
          id: "opt_fight_breakthrough",
          name: "돌파 검술로 빈틈을 찌른다 (기력 3)",
          requires: { op: "and", of: [{ op: "unlock", id: "unl_breakthrough_cut" }, HAS_DRAWN_SWORD, STAMINA_AT_LEAST(3)] },
          check: STRIKE_CHECK(13),
          minutes: 5,
          outcomes: payStamina(3, {
            great: fightExchange([hitLeader(-11), say("txt_breakthrough_cut_hit")]),
            success: fightExchange([hitLeader(-8), say("txt_breakthrough_cut_hit")]),
            partial: fightExchange([hitLeader(-3), hitSelf(-3), say("txt_breakthrough_cut_trade")]),
            fail: fightExchange([leaderHits(5), say("txt_breakthrough_cut_fail")])
          })
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
    },
    [FINAL_CHOICE]: { options: [...finalOptions("chief", "npc_bandit_leader", LEADER_LIVES), ...finalOptions("right_hand", "npc_band_lieutenant", LEADER_DOWN)] }
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
      // V2-Core-142 (M7): the realm's name -- the apex (a title: it opens nothing, the world answers it)
      unlocks: [{ id: "unl_north_road_survey", kind: "action" }, { id: "unl_trailcraft", kind: "action" }, { id: "unl_caravan_pathfinder", kind: "action" }, { id: "unl_ruins_cellar_route", kind: "action" }, { id: "unl_ruins_lower_route", kind: "action" }, { id: "unl_ruins_raider_tracked", kind: "action" }, { id: "unl_keen_eye", kind: "action" }, { id: "unl_road_lead", kind: "action" }, { id: "unl_guarded_stance", kind: "action" }, { id: "unl_breakthrough_cut", kind: "action" }, { id: "unl_realm_renown", kind: "title" }],
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
    item_waystation_supply_crate: { name: "길목 보급 상자 (봉인됨)" },
    item_castle_grain_crate: { name: "성읍 구휼 곡물 꾸러미" },
    // V2-Core-74 (#180): the elder's letter for the ferry (kept, not spent)
    item_passage_letter: { name: "원로의 통행 편지" },
    item_merchant_note: { name: "상인의 짐표" }
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
    // V2-Core-138 (M4): the band across the river, who leads it, the elder's request, the frontier warned
    fact_band_gathers: {},
    fact_band_leader: {},
    fact_elder_request: {},
    fact_frontier_warned: {},
    // V2-Core-139 (M5): the band's size, the way to it, its crossing; the guild's answer; the lord's offer and the frontier's
    fact_band_size: {},
    fact_spring_trap: {},
    fact_frontier_prepared: {},
    fact_herbalist_stock: {},
    fact_band_camp: {},
    fact_band_crossing: {},
    fact_guild_keeps_guards: {},
    fact_lord_offer: {},
    fact_lord_pact: {},
    // V2-Core-140 (M6)
    fact_band_crossed: {},
    fact_raid: {},
    fact_ending: {},
    // V2-Core-141 (M2)
    fact_ferryman_watch: {},
    fact_crown_writ: {},
    fact_band_stores: {},
    fact_frontier_seen_royal: {},
    fact_frontier_seen_town: {},
    fact_frontier_seen_far_bank: {},
    // Witnessed visits: the route event records observation flags; these
    // rumor subjects are not omniscient live NPC location facts.
    fact_raider_watchpost_sighting: {},
    fact_raider_village_sighting: {},
    fact_raider_mill_sighting: {},
    fact_royal_city: {},
    // V2-Core-149 (D-127): the word north arrived; the remnants regrouped / scattered
    fact_fate_word: {},
    fact_remnants: {},
    // V2-Core-125 (#307): the road to the ford -- quiet / uneasy / dangerous, set at each turn (a save from before has none) --
    // and the world's place on the road's course, drawn at creation from its own stream (a save from before has none: the first)
    fact_road_north: {},
    fact_town_flour: {},
    fact_caravan_flour: {},
    fact_road_course: { initial: { pickFrom: Array.from({ length: ROAD_CYCLE }, (_, i) => i) } }
  },

  rumors: {
    ...ruinsRaider.rumors,
    rum_ruins_secret: { factId: "fact_ruins_secret", claim: "bandit_hideout" },
    // V2-Core-45: the same history told two ways -- the elder's news, and the legend it becomes
    // V2-Core-138 (M4, D-116): `story` -- the main thread's chapter a word belongs to, shown in the story panel
    rum_bandits_fate: { factId: "fact_bandits_fate", claim: "dispersed", story: { chapter: 1 } },
    rum_bandits_legend: { factId: "fact_bandits_fate", claim: "slain", story: { chapter: 1 } },
    // V2-Core-55 (D-84): what the elder tells a character he trusts
    rum_leader_old_wound: { factId: "fact_leader_wound", claim: "old_wound" },
    // V2-Core-64 (#160): the fouled well
    rum_well_source: { factId: "fact_well_source", claim: "forest_spring" },
    rum_spring_cause: { factId: "fact_spring_cause", claim: "rotting_carcass" },
    // V2-Core-68 (#170): the arrows, read by a character who knows the hideout
    rum_spring_bandits: { factId: "fact_spring_fouler", claim: "bandits" },
    // V2-Core-69 (#170): the same history told two ways -- the herbalist's news, and the market's legend
    rum_well_fate: { factId: "fact_well_fate", claim: "purified", story: { chapter: 1 } },
    rum_well_legend: { factId: "fact_well_fate", claim: "spirit_appeased", story: { chapter: 1 } },
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
    // V2-Core-135 (#335, D-114): `validDays` -- the road turns once a caravan's cadence (3 days), so a word of it may no longer hold
    rum_road_quiet: { factId: "fact_road_north", claim: "quiet", validDays: 3 },
    rum_road_uneasy: { factId: "fact_road_north", claim: "uneasy", validDays: 3 },
    rum_road_dangerous: { factId: "fact_road_north", claim: "dangerous", validDays: 3 },
    rum_road_talk_quiet: { factId: "fact_road_north", claim: "quiet", validDays: 3 },
    rum_road_talk_unsettled: { factId: "fact_road_north", claim: "unsettled", validDays: 3 },
    // V2-Core-132 (#328): the town's want for frontier flour, and the caravan that took some north
    // (the town's want moves with every sale and caravan; a word of it holds a caravan's cadence at most -- D-114)
    rum_town_flour_wanted: { factId: "fact_town_flour", claim: "wanted", validDays: 3 },
    rum_town_flour_enough: { factId: "fact_town_flour", claim: "enough", validDays: 3 },
    rum_caravan_took_flour: { factId: "fact_caravan_flour", claim: "north" },
    // V2-Core-135 (#335, D-114): the miller's reading of the caravan's purchase -- the town wanted flour *before* the sack
    // went north; whether it still does after, he cannot see (the ferryman, who hears the caravan's step out, can)
    rum_town_flour_caravan_bought: { factId: "fact_town_flour", claim: "wanted", validDays: 3 },
    // V2-Core-138 (M4): chapter 2, across the river -- the elder's request, the band, who leads it, the frontier warned
    rum_elder_asks_band: { factId: "fact_elder_request", claim: "who_leads", story: { chapter: 2 } },
    rum_band_recruits: { factId: "fact_band_gathers", claim: "gathering", story: { chapter: 2 } },
    rum_band_led_by_scarred: { factId: "fact_band_leader", claim: "scarred_chief", story: { chapter: 2 } },
    rum_band_led_by_remnant: { factId: "fact_band_leader", claim: "chief_right_hand", story: { chapter: 2 } },
    rum_frontier_warned: { factId: "fact_frontier_warned", claim: "warned", story: { chapter: 2 } },
    // V2-Core-139 (M5): chapter 3, keeping the frontier
    rum_band_camp_way: { factId: "fact_band_camp", claim: "north_woods", story: { chapter: 3 } },
    rum_spring_trap_mark: { factId: "fact_spring_trap", claim: "bandit_mark" },
    rum_band_size: { factId: "fact_band_size", claim: "observed", validDays: 3, story: { chapter: 3 } },
    rum_band_crossing_soon: { factId: "fact_band_crossing", claim: "soon", validDays: 3, story: { chapter: 3 } },
    rum_guild_keeps_guards: { factId: "fact_guild_keeps_guards", claim: "kept", story: { chapter: 3 } },
    rum_frontier_prepared: { factId: "fact_frontier_prepared", claim: "helped", story: { chapter: 3 } },
    rum_herbalist_stock: { factId: "fact_herbalist_stock", claim: "established" },
    rum_lord_offer: { factId: "fact_lord_offer", claim: "posted", validDays: 6, story: { chapter: 3 } },
    rum_lord_pact_accepted: { factId: "fact_lord_pact", claim: "accepted", story: { chapter: 3 } },
    rum_lord_pact_refused: { factId: "fact_lord_pact", claim: "refused", story: { chapter: 3 } },
    // V2-Core-140 (M6): chapters 4 and 5
    rum_band_crossed: { factId: "fact_band_crossed", claim: "crossed", story: { chapter: 4 } },
    rum_raid_coming: { factId: "fact_raid", claim: "coming", validDays: 3, story: { chapter: 4 } },
    rum_ending_name: { factId: "fact_ending", claim: "name_remembered", story: { chapter: 5 } },
    rum_ending_held: { factId: "fact_ending", claim: "frontier_held", story: { chapter: 5 } },
    rum_ending_lord: { factId: "fact_ending", claim: "lord_banner", story: { chapter: 5 } },
    rum_ending_fell: { factId: "fact_ending", claim: "frontier_fell", story: { chapter: 5 } },
    // V2-Core-149 (D-127)
    rum_fate_word_north: { factId: "fact_fate_word", claim: "north", story: { chapter: 5 } },
    rum_remnants_regrouped: { factId: "fact_remnants", claim: "regrouped" },
    // V2-Core-141 (M2)
    rum_ferryman_watches: { factId: "fact_ferryman_watch", claim: "watching", story: { chapter: 3 } },
    rum_crown_writ: { factId: "fact_crown_writ", claim: "granted", story: { chapter: 3 } },
    rum_band_stores_burnt: { factId: "fact_band_stores", claim: "burnt", story: { chapter: 3 } },
    rum_frontier_seen_royal: { factId: "fact_frontier_seen_royal", claim: "noticed" },
    rum_frontier_seen_town: { factId: "fact_frontier_seen_town", claim: "noticed" },
    rum_frontier_seen_far_bank: { factId: "fact_frontier_seen_far_bank", claim: "noticed" }
  },

  // Relation-edge/rumor-source IDs (§7.1/§8.3). An entry without `actor` is
  // inert authored metadata (validateData checks its key format, D-56); one
  // with `actor` is also seeded as `state.actors[id]` by createInitialState
  // (D-77, V2-Core-47). A full NPC scheduler is still out of scope (Issue #74).
  npcs: {
    ...ruinsRaider.npcs,
    npc_elder: { name: "마을 원로" },
    // V2-Core-64 (#160): dialogue only (no actor: a new actor would not be in a 0.3.0 save)
    npc_herbalist: { name: "약초꾼" },
    // V2-Core-73 (#180): dialogue only (no actor: D-92)
    npc_miller: { name: "방앗간 주인" },
    npc_ferryman: { name: "뱃사공" },
    // V2-Core-77 (#189): dialogue only (no actor: D-92)
    npc_town_merchant: { name: "성읍의 상인" },
    npc_north_caravan_driver: { name: "북부 상단 마부" },
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
    },
    // V2-Core-140 (M6, WB-0033): the chief's right hand, who leads the band if the chief is dead (MC-04) -- an actor so
    // the last fight is opposed against him; a save from before is given him on load (D-115)
    npc_band_lieutenant: {
      name: "두목의 오른팔",
      actor: {
        locationId: "loc_band_camp",
        hp: { max: 12 },
        growth: { growth_wanderer: { stats: { str: 11, dex: 11, con: 11, int: 10, wis: 10, per: 10 }, resources: { stamina: { current: 6, max: 6 } } } }
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
    ...ruinsExpedition.texts,
    ...ruinsWatchpost.texts,
    ...ruinsRaider.texts,
    ...ruinsGuideConvoy.texts,
    txt_observe_village: "사람들 틈에 섞여 귀를 연다. 낯선 얼굴을 흘끔거리긴 해도 어디서 왔느냐고 묻는 이는 없다. 다들 제 걱정이 더 크다.",
    txt_buy_lantern: "상인에게 은화를 건네고 낡은 등불을 받는다. 심지는 짧아도 폐허 안을 비추기엔 충분하다.",
    txt_buy_iron_sword: "상인에게 은화 세 닢을 건네고 손때 묻은 철검을 받는다.",
    txt_equip_iron_sword: "철검을 뽑아 손에 쥔다.",
    txt_unequip_iron_sword: "철검을 칼집에 넣고 허리에 찬다.",
    txt_ask_ruins: "원로가 목소리를 낮춘다. \"마을 바깥 폐허에 사람이 드나드네. 밤마다 불빛이 보여.\" 갈림길을 막은 도적들이 그 안에 숨어 있다는 말이다.",
    txt_small_talk: "원로와 짧게 안부를 나눈다. 노인은 내 행색을 한 번 훑어보고는 아무것도 묻지 않는다.",
    txt_elder_band_ask: "원로가 이마를 짚는다. \"강 건너에서 사람을 모은다는 말이 상단 편에 왔네. 품삯을 후하게 준다더군. 누가 모으는지 알아봐 주게. 그걸 알아야 마을이 무엇을 대비할지 정하지.\"",
    txt_elder_band_scarred: "옆구리를 감싸는 사내 이야기를 듣자 원로의 얼굴이 굳는다. \"그 버릇을 아는 이는 많지 않네. 그가 돌아올 셈이로군.\" 원로는 마을 사람들에게 밤길과 샘가를 지키게 하겠다고 한다.",
    txt_elder_band_remnant: "폐허의 두목 밑에 있던 자가 사람을 모은다는 말에 원로가 길게 숨을 쉰다. \"머리를 잃은 뱀이 새 머리를 얻었군.\" 원로는 마을 사람들에게 밤길과 샘가를 지키게 하겠다고 한다.",
    txt_elder_band_warned: "원로가 고개를 끄덕인다. \"마을에는 일러두었네. 이제는 그들이 언제 강을 건너오는지 지켜봐야 하네. 나루와 성읍의 말을 모아 주게.\"",
    txt_guild_clerk_band: "서기가 장부를 넘긴다. 지난 상단 둘이 호위를 하나씩 잃었다고 한다. 강 건너에서 품삯을 두 배로 준다는 말에 넘어갔다고.",
    txt_guild_clerk_band_scarred: "서기가 목소리를 낮춘다. 조합이 아는 호위니 말해 준다고 한다. 사람을 모으는 자가 왼쪽 옆구리를 감싸는 버릇이 있다더라고.",
    txt_guild_clerk_band_remnant: "서기가 목소리를 낮춘다. 조합이 아는 호위니 말해 준다고 한다. 사람을 모으는 자는 남쪽 폐허의 도적 두목 밑에 있던 자라고, 넘어갔다가 돌아온 호위가 그랬다고.",
    txt_guild_clerk_band_closed: "더 묻자 서기는 장부를 덮는다. 조합이 모르는 이에게 할 이야기는 아니라고 한다.",
    txt_ferryman_band: "\"요즘 밤에 무장한 사내들을 몇 번 건넸소. 남쪽 말씨였지. 북쪽 숲길로 가더군.\"",
    txt_ferryman_band_scarred: "\"그중 우두머리는 배에 앉을 때마다 옆구리를 감싸더군. 전에 한 번 건넨 사내요.\"",
    txt_ferryman_band_unknown: "\"누가 이끄는지는 모르오. 뱃삯은 꼬박꼬박 냈소.\"",
    txt_board_band: "게시판 구석에 쪽지가 붙어 있다. '칼 쓸 줄 아는 자. 품삯 후함. 길목에서 묻게.'",
    txt_band_camp_few: "나무 사이로 모닥불 두엇과 천막 몇이 보인다. 아직은 한 상단의 호위보다 많지 않다.",
    txt_band_camp_many: "모닥불이 늘었다. 칼을 가는 소리가 숲 가장자리까지 들린다. 마을 하나를 겁줄 만한 수다.",
    txt_band_camp_host: "숲이 사람으로 찼다. 국경 쪽 말씨를 쓰는 낯선 자들도 섞였다. 천막을 걷는 이들이 있다.",
    txt_band_camp_crossing: "누군가 강 쪽을 가리키며 날짜를 센다. 오래 기다리지 않을 셈이다.",
    txt_band_camp_spotted: "마른 가지가 부러진다. 망보던 자가 돌을 던지고 소리친다. 숲을 빠져나오는 길에 몸 여기저기가 긁히고 찢긴다.",
    txt_band_camp_empty: "진터가 비었다. 식은 재와 버린 짐이 흩어져 있고, 발자국은 강 쪽으로 이어진다. 무리는 이미 강을 건넜다.",
    txt_castle_lord_offer: "포고판에 새 글이 붙었다. 강 남쪽 변경에도 영주의 순찰을 보내 지켜 주겠다고 한다. 대신 그 땅에서도 사람을 내고 세를 바치라고.",
    txt_guild_clerk_warned: "서기가 장부에 무언가를 적는다. \"그자가 이끈다면 이야기가 다르지. 조합이 품삯을 올려 호위들을 붙잡아 두겠소.\"",
    txt_elder_given_silver: "원로가 은화를 받아 마을 젊은이들에게 창과 등불을 사게 하겠다고 한다.",
    txt_elder_given_sword: "원로가 철검을 받아 든다. \"이걸 쥘 손은 마을에도 있네.\"",
    txt_elder_given_salve: "원로가 연고를 약초꾼에게 맡기겠다고 한다. 다친 이를 돌볼 준비가 하나 늘었다.",
    txt_elder_lord_accepted: "원로가 오래 생각하다 고개를 끄덕인다. \"영주의 깃발 아래 서는 것이 오늘 마을을 지킨다면.\" 영주의 순찰이 강을 건너올 것이다. 대신 마을의 젊은이 몇이 성읍으로 간다.",
    txt_elder_lord_refused: "원로가 내 손을 잡는다. \"변경은 늘 스스로 서 왔네. 이번에도 그러지.\" 영주의 순찰은 오지 않는다. 나로서는 다행한 일이다.",
    txt_board_band_remnant: "쪽지 아래에 누군가 덧적었다. '폐허 두목 밑에 있던 놈들이 또 모인다.'",
    txt_investigate_success: "등불을 비추자 벽 그늘에 쌓인 짐짝과 꺼진 모닥불 자리가 드러난다. 여기가 도적들의 은신처다.",
    txt_investigate_fail: "폐허 안은 어둡고 흔적은 흐릿하다. 확실한 것을 찾지 못했다.",
    txt_confront_success: "두목과 마주 선다. 내가 본 것을 하나하나 늘어놓자, 그가 부정하기를 그만둔다.",
    txt_confront_fail: "말이 엇나갔다. 두목은 코웃음을 치며 등을 돌린다.",
    txt_report_findings: "폐허에서 본 것을 털어놓자 원로는 오래 말이 없다가 천천히 고개를 끄덕인다.",
    txt_leader_old_wound: "원로는 주위를 살피고 낮게 말한다. 두목은 젊은 시절 왼쪽 옆구리에 깊은 상처를 입었고, 그 뒤로 그쪽을 늘 감싼다고 한다.",
    txt_confront_backed: "내 뒤에 마을 사람들이 서 있다. 두목의 눈이 자꾸 그쪽으로 간다.",
    txt_bandit_news: "원로는 폐허의 도적단이 흩어졌다는 소식을 들려준다. 마을 사람들 사이에서 그 이야기는 오래 회자된다.",
    txt_elder_north_legend: "원로는 덧붙인다. 상단 사람들 말로는 강 건너 성읍에선 아직도 도적들이 모두 쓰러졌다고들 한다고, 고친 이야기가 그곳까지 가려면 아직 멀었다고 한다.",
    txt_bandit_legend: "원로는 이제 마을에서 전해지는 이야기를 들려준다. 폐허의 도적단이 마을 사람들 손에 모두 쓰러졌다는 전설이다.",
    txt_correct_legend: "폐허에서 본 것을 원로에게 그대로 전한다. 원로는 한참 생각하더니, 앞으로는 있었던 그대로 전하겠다고 한다.",
    txt_bandit_news_corrected: "원로는 마을의 전설 대신, 도적단이 쓰러진 것이 아니라 흩어졌다는 사실을 들려준다. 누군가 폐허에서 그것을 직접 보았다고 한다.",
    txt_hideout_after_fight: "은신처에는 두목이 쓰러진 싸움의 흔적이 남아 있다. 남은 도적들은 짐을 챙겨 흩어졌다.",
    txt_fight_start: "은신처 안쪽에서 두목이 나를 본다. 말은 끝났다. 그가 칼을 뽑는다.",
    txt_fight_strike_great: "내 칼이 두목을 깊이 베어 낸다.",
    txt_fight_strike_hit: "내 칼끝이 두목에게 닿는다.",
    txt_fight_trade: "서로의 칼이 스치고, 둘 다 상처를 입는다.",
    txt_fight_struck: "두목의 칼이 나를 벤다.",
    txt_fight_leader_heavy_blow: "두목이 온 힘을 실어 칼을 내려친다.",
    txt_fight_counter_great: "그의 공격을 정확히 읽고 받아친 칼이 깊이 박힌다.",
    txt_fight_counter_hit: "그의 공격을 흘리고 받아친다.",
    txt_fight_counter_graze: "받아치려 했지만 그의 칼끝이 나를 스친다.",
    txt_fight_counter_miss: "그의 칼을 잘못 읽었다. 칼날이 나를 깊이 벤다.",
    txt_fight_leader_reels: "두목이 비틀거린다. 그의 숨이 거칠다.",
    txt_fight_victory: "두목이 쓰러진다. 두목을 잃은 도적들이 내 앞에서 물러선다.",
    txt_fight_flee: "칼을 거두고 폐허를 빠져나와 마을로 달아난다. 두목은 쫓아오지 않는다. 대신 내 얼굴을 기억할 것이다.",
    txt_village_whispers_ruins: "우물가의 사람들이 폐허 쪽을 흘끔거리며 수군거린다. 누가 그 안에서 도적들의 물건을 찾아냈다는 말이 벌써 돌았다.",
    txt_herbalist_herbs_back: "약초꾼이 바구니를 들어 보인다. \"샘가에서 다시 정화초가 올라오더군요. 누가 부지런히 캐 오는 덕에 시장에도 돌기 시작했어요.\" 약초꾼이 고마운 눈으로 나를 본다.",
    txt_ferryman_watch: "뱃사공이 은화를 받아 넣는다. \"강 건너 길목에서 칼 찬 무리가 배를 찾으면, 내가 먼저 건너와 마을에 알리지. 하루는 벌 거요.\"",
    txt_elder_ferryman_word: "\"뱃사공이 밤배로 건너와 알려 주었네. 덕분에 하루를 벌었어.\"",
    txt_elder_crown_writ: "\"왕궁의 글이 왔네. 변경이 스스로 사람을 모아 지켜도 된다는 글이야. 젊은이들이 창을 들었네.\"",
    txt_miller_band: "방앗간 주인이 고개를 갸웃한다. \"요즘 강 건너에서 밀가루를 자루째 사 가는 이들이 있소. 값을 깎지도 않고. 사람을 먹일 데가 많은 모양이오.\"",
    txt_confront_arrows: "샘가에서 찾은 화살 이야기를 꺼내자 두목이 눈을 피한다.",
    txt_post_frontier_notice: "은화 열다섯 닢을 건네고 게시판 한가운데에 글을 붙인다. 변경 마을이 창을 들 손을 구한다고. 길목의 사내 몇이 글을 읽고 남쪽을 바라본다.",
    txt_crown_writ: "왕궁 서기가 오래 듣고 나서 붓을 든다. 변경이 스스로 민병을 세워도 좋다는 짧은 글에 인장이 찍힌다. 글은 다음 상단 편에 남쪽으로 내려간다.",
    txt_crown_refused: "왕궁 서기는 변경이라는 말에 붓을 내려놓는다. 그런 곳의 일은 영주가 맡는다고, 다시 오지 말라고 한다.",
    txt_band_stores_burnt: "밤이 깊어 망보는 자가 조는 틈에 식량 더미에 불씨를 던진다. 숲 너머로 불길이 솟고, 무리가 고함치며 물을 나른다. 며칠 굶을 이들 가운데 몇은 떠날 것이다.",
    txt_band_stores_caught: "불씨를 던지기도 전에 망보던 자에게 들킨다. 몰매를 맞고 간신히 숲을 빠져나온다. 무리는 이제 식량 더미를 밤새 지킨다.",
    txt_castle_royal_seen: "포고판 앞의 상인들이 왕도에서 들은 말을 옮긴다. 남쪽 끝 변경에서 온 이가 왕도의 성문을 지났다더라고.",
    txt_castle_frontier_seen: "포고판 옆 성문지기가 말한다. 변경 쪽 길로 사람이 올라온 것이 몇 해 만이라고.",
    txt_board_southerner: "게시판 앞의 사내들이 남쪽 변경에서 강을 건너온 나그네 이야기를 한다. 그 길이 다시 열렸느냐고 묻는다.",
    txt_royal_records_defender: "새로 내걸린 글 한 장이 사람들을 모은다. 남쪽 끝 변경에서 갈림길을 막은 무리의 우두머리를 한 사람이 쓰러뜨렸고, 무리는 흩어졌다고 한다. 글은 그를 남쪽 변경의 수호자라 부른다.",
    txt_royal_records_you: "글 앞에 선 사람들 가운데 누군가 나를 알아보고 손가락으로 가리킨다. 웅성거림이 퍼진다. 강 북쪽에 두고 온 이름이 아니라 변경이 붙여 준 이름이다. 왕도가 그 이름을 안다.",
    txt_castle_fate_name: "포고판 앞에서 상단 사람들이 남쪽 소식을 전한다. 변경의 갈림길에서 한 사람이 무리의 우두머리를 베었다고. 사람들은 그를 갈림길의 수호자라 부른다.",
    txt_castle_fate_held: "상단 사람들이 남쪽 소식을 전한다. 강을 건너온 무리를 변경 마을이 스스로 막아 냈다고.",
    txt_castle_fate_lord: "포고판에 영주의 글이 붙었다. 영주의 순찰이 남쪽 변경을 무리에게서 지켜 냈다고, 변경은 이제 영주의 깃발 아래 있다고.",
    txt_castle_fate_fell: "상단 사람들이 남쪽 소식을 전하며 고개를 젓는다. 강을 건너온 무리가 변경 마을을 쳤다고, 곳간이 비고 집 몇 채가 탔다고.",
    txt_castle_known_you: "포고판 앞의 사람들이 나를 돌아본다. 누군가 \"수호자다\" 하고 속삭인다. 이 성읍의 징집 장부에서 달아난 사람이라는 것은 아무도 모른다.",
    txt_guild_clerk_renowned: "서기가 장부에서 고개를 들고 한참 나를 본다. \"남쪽 변경의 수호자를 조합 장부에 올린 적이 있다는 게 자랑이 되겠소.\" 서기가 장부에 무언가를 덧적는다.",
    txt_remnants_hunted: "숲 너머 오래된 모닥불 자리에서 다시 모인 무리의 남은 자들을 찾아낸다. 칼이 몇 번 오가고 그들은 흩어진다. 길목의 상인들이 걸어 둔 사례금 열두 닢을 받는다. 한 주는 숲이 조용할 것이다.",
    txt_remnants_ambush: "남은 자들을 쫓다가 오히려 덫에 걸린다. 사방에서 날아든 몽둥이와 칼끝에 크게 다쳐 간신히 빠져나온다.",
    txt_face_band_chief: "갈림길의 이정표 아래에 무리가 진을 쳤다. 그 앞에 왼쪽 옆구리를 감싼 사내가 서 있다. 폐허에서 놓친 두목이다. 그가 나를 알아보고 칼을 뽑는다.",
    txt_face_band_right_hand: "갈림길의 이정표 아래에 무리가 진을 쳤다. 그 앞에 폐허의 두목 밑에 있던 사내가 서 있다. 이제 그가 무리를 이끈다. 그가 칼을 뽑는다.",
    txt_final_strike_great: "내 칼이 그를 크게 베어 낸다. 뒤에 선 무리가 웅성거린다.",
    txt_final_strike_hit: "내 칼끝이 그에게 닿는다.",
    txt_final_struck: "그의 칼이 나를 벤다.",
    txt_final_heavy_blow: "그가 온 힘을 실어 칼을 내려친다.",
    txt_final_counter_miss: "그의 칼을 잘못 읽었다. 칼날이 나를 깊이 벤다.",
    txt_final_foe_reels: "그가 비틀거린다. 뒤에 선 무리가 한 걸음 물러선다.",
    txt_final_victory: "무리를 이끌던 자가 쓰러진다. 이끄는 이를 잃은 무리가 하나둘 칼을 버리고 강 쪽으로 흩어진다. 마을 쪽에서 누군가 나를 부른다. 내가 강 북쪽에 두고 온 이름이 아니다.",
    txt_final_flee: "칼을 거두고 갈림길을 빠져나와 마을로 달아난다. 무리는 쫓아오지 않는다. 아직은.",
    txt_elder_band_crossed: "원로가 지팡이를 짚고 일어선다. \"무리가 강을 건너 갈림길에 진을 쳤네. 사흘이면 마을로 내려올 걸세.\"",
    txt_elder_raid_ready: "원로가 마을 쪽을 돌아본다. \"창과 등불은 갖추었네. 저 수라면 버틸 수 있을 걸세.\"",
    txt_elder_raid_thin: "원로가 고개를 젓는다. \"저 수를 막기에는 마을이 가진 것이 모자라네. 무리를 이끄는 자를 꺾지 못한다면.\"",
    txt_elder_after_name: "원로가 웃는다. \"그날 갈림길에서 그자가 쓰러지자 무리는 흩어졌네. 마을은 칼 한 번 들지 않았지. 아이들이 벌써 그 이야기를 노래로 부르네.\"",
    txt_elder_after_held: "원로가 불탄 울타리를 가리킨다. \"그들이 밤에 내려왔지만 마을이 버텼네. 우리 손으로 지켰지. 변경은 누구의 깃발도 없이 섰네.\"",
    txt_elder_after_lord: "원로가 마을 어귀의 깃발을 올려다본다. \"영주의 순찰이 와서 무리를 쫓아냈네. 마을은 남았지. 이제 저 깃발 아래에서 세금을 내야 하네.\"",
    txt_elder_after_fell: "원로의 목소리가 낮다. \"그날 밤 마을이 무너졌네. 곳간이 비고 집 몇 채가 탔지. 그래도 사람들은 남았고, 다시 지을 걸세. 세상은 계속되니.\"",
    txt_elder_after_defender: "원로가 덧붙인다. \"마을 사람들은 그날 앞장선 이의 이름을 부르네. 우물가에서도, 방앗간에서도.\"",
    txt_elder_after_guild: "\"상단 조합도 그 일을 장부에 적었다더군. 품삯을 올려 호위를 붙잡아 둔 덕에 무리가 더디게 컸다고.\"",
    txt_elder_after_warned: "\"자네가 처음 강 건너 소식을 가져왔을 때 마을에 일러둔 것이 헛되지 않았네.\"",
    txt_elder_after_fallen: "원로가 잠시 말을 멈춘다. \"그 길에서 돌아오지 못한 호위도 있었지. 이름은 모르지만, 마을은 그 일도 기억하네.\"",
    txt_hideout_abandoned: "은신처는 텅 비어 있다. 서둘러 짐을 챙겨 떠난 흔적뿐, 싸움의 자국은 없다. 도적단은 쓰러진 것이 아니라 흩어졌다.",
    txt_bandits_disperse: "원로는 도적단 잔당에게 사람을 보내 해산을 권한다. 두목은 더 이상 도적단의 일원이 아니다.",
    txt_market_reopens: "도적단이 흩어졌다는 소식에 상인들이 안도하며 은화 몇 닢을 사례한다.",
    txt_rest_village: "마을 어귀의 평상에 앉아 숨을 고르고 상처를 돌본다.",
    txt_ruins_hazard: "무너진 벽돌이 머리 위로 쏟아져 내린다.",
    txt_ruins_watch_safe_path: "원로가 등불과 함께 일러 준 안전한 발판을 따라 비켜선다. 무너진 돌에 스쳤지만 큰 낙석은 피했다.",
    txt_succession: "쓰러진 이가 남긴 은화 몇 닢이 새 방랑자의 손에 들어온다.",
    txt_inspect_well_success: "두레박으로 길어 올린 물에서 썩은 풀 냄새가 난다. 우물 벽의 물때가 숲 쪽에서 흘러드는 물길을 가리킨다. 이 물은 숲속 샘에서 온다.",
    txt_inspect_well_fail: "우물물이 조금 탁해 보인다. 무엇이 문제인지는 알 수 없다.",
    txt_herbalist_sickness: "약초꾼은 요즘 배앓이를 하는 사람이 부쩍 늘었다며 혀를 찬다. 마을 우물은 숲속 샘에서 물을 받는데, 그 샘이 탈이 난 게 틀림없다고 한다.",
    txt_herbalist_small_talk: "약초꾼은 말린 약초 다발을 정리하며 계절 이야기를 늘어놓는다.",
    txt_search_spring_success: "샘 위쪽 바위 틈에 짐승의 사체가 걸려 썩어 가고 있다. 샘물을 흐리는 것은 이것이다.",
    txt_search_spring_fail: "샘가는 안개와 악취로 가득하다. 까닭을 찾지 못했다.",
    txt_spring_miasma: "샘에서 피어오르는 독한 기운에 숨이 막히고 속이 뒤집힌다.",
    txt_spring_miasma_prepared: "약초꾼이 준 정화초를 코에 대고 독한 기운을 견딘다. 완전히 막지는 못했지만 피해가 줄었다.",
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
    txt_herbalist_thanks: "샘에서 한 일을 이야기하자 약초꾼이 내 손을 꼭 잡고 고맙다고 한다. 마을 사람들 대신 하는 인사라고 한다.",
    txt_spring_bandit_arrows: "사체에 박힌 화살의 깃이 눈에 익다. 폐허의 은신처에서 본 것과 같은, 도적단의 화살이다.",
    txt_tell_spring_arrows: "샘의 짐승에 박혀 있던 화살 이야기를 하자 원로의 얼굴이 굳는다. 샘을 흐린 것도 도적들이었다는 말이 곧 마을에 퍼질 것이다.",
    txt_spring_bandits_leader_lives: "원로는 덧붙인다. 샘을 흐린 것도 그 도적들이었다고. 그 일을 시킨 두목은 아직 어딘가 살아 있다고 한다.",
    txt_spring_bandits_leader_dead: "원로는 덧붙인다. 샘을 흐린 것도 그 도적들이었다고. 그 일을 시킨 두목은 이미 죽었으니, 적어도 다시는 그런 일이 없을 거라고 한다.",
    txt_ask_ruins_spring: "원로는 폐허의 도적들이 숲속 샘까지 흐려 놓았다는 이야기도 잊지 않고 덧붙인다.",
    txt_herbalist_bandit_rumor: "약초꾼은 목소리를 낮춘다. 샘을 흐린 게 폐허의 도적들이었다는 이야기가 시장에도 돈다고 한다.",
    txt_search_spring_purified: "샘은 맑고 고요하다. 바위 틈 아래 새로 덮은 흙과 정화제의 쌉쌀한 냄새가, 누군가 이곳을 손수 정화했음을 말해 준다.",
    txt_herbalist_well_legend: "약초꾼은 시장에 도는 이야기를 들려준다. 마을 사람들이 제물을 바치자 노한 샘의 정령이 누그러졌다는 것이다.",
    txt_herbalist_correct_legend: "샘에서 본 것을 그대로 전하자 약초꾼이 고개를 끄덕인다. 정령이 아니라 사람이 한 일이었다고, 앞으로는 그렇게 전하겠다고 한다.",
    txt_herbalist_north_legend: "약초꾼은 덧붙인다. 북쪽 성읍에선 아직도 샘의 정령이 제물을 받고 누그러졌다고들 한다더라고.",
    txt_herbalist_well_corrected: "약초꾼은 시장의 정령 이야기 대신, 누군가 샘에서 사체를 치우고 정화제를 부었다는 사실을 들려준다. 직접 본 사람이 있다고 한다.",
    txt_village_honor: "원로가 마을 사람들을 모아 내 앞에 선다. 도적을 몰아내고 샘을 되살린 이에게 마을의 이름으로 감사한다고, 이제 이 마을은 내 편이라고 한다. 어디서 왔는지는 끝내 묻지 않는다.",
    txt_small_talk_honored_memory: "원로는 마을이 이름을 걸고 감사했던 방랑자 이야기를 꺼낸다. 마을 사람들은 아직도 그 이야기를 한다고 한다.",
    txt_buy_lantern_trusted: "상인은 손사래를 치며 은화 두 닢만 받고 등불을 건넨다. 마을을 구한 사람에게 제값을 받을 수는 없다고 한다.",
    txt_herbalist_given_herbs: "약초꾼은 정화초 두 묶음을 받아 들고 환하게 웃는다. 앓는 집들에 나눠 주겠다고 한다.",
    txt_herbalist_establish_stock: "약초꾼은 가져온 밀가루로 일하는 이들의 끼니를 마련한다. 마을에 남아 연고를 만들겠다고 한다.",
    txt_herbalist_supply_batch: "정화초 두 묶음을 맡기자 약초꾼은 내일 연고 하나, 그다음 날 또 하나를 만들어 두겠다고 한다.",
    txt_herbalist_collect_salve: "약초꾼이 만들어 둔 연고 한 단지를 건넨다.",
    txt_herbalist_stock_guidance: "약초꾼은 솜씨와 믿을 만한 손, 일하는 이들이 먹을 밀가루가 있으면 마을에 연고 일을 남길 수 있다고 한다.",
    txt_herbalist_stock_ready: "약초꾼이 만들어 둔 연고가 있다. 직접 와서 가져가라고 한다.",
    txt_herbalist_stock_ready_working: "약초꾼이 만들어 둔 연고 하나가 있고, 다음 단지도 달이고 있다고 한다.",
    txt_herbalist_stock_working: "약초꾼은 맡긴 정화초로 연고를 달이고 있다. 내일 다시 와 달라고 한다.",
    txt_herbalist_stock_empty: "약초꾼은 만들어 둔 연고가 없다고 한다. 정화초 두 묶음을 맡기면 다시 만들 수 있다.",
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
    txt_miller_caravan_bought: "\"지난번 상단이 우리 밀가루를 한 자루 사 갔네. 성읍에서 찾으니 사 갔겠지. 한 자루 더 지고 가 보게.\" 그는 상단이 강을 건넌 뒤의 일은 모른다.",
    txt_miller_news_leader_fell: "그는 폐허의 두목이 쓰러졌다는 이야기를 이곳에서도 들었다고 한다. 이제 짐수레가 다시 길에 나설 수 있겠다며 웃는다.",
    txt_miller_welcome: "변경 마을이 감사했다는 사람이 나냐며, 그는 밀가루 묻은 손으로 내 손을 잡는다.",
    txt_miller_trade_running: "요즘은 변경 마을 장터로 수레가 오간다며 그는 흡족해한다.",
    txt_miller_buy_herb: "방앗간 주인은 정화초를 받아 들고 은화 두 닢을 건넨다. 이 근방에서는 귀한 풀이라고 한다.",
    txt_miller_sell_flour: "방앗간 주인은 밀가루 자루 하나를 내준다. 마을과 거래가 트인 뒤로 밀이 남는다며, 강 건너에선 더 쳐줄지도 모른다고 한다.",
    txt_miller_flour_gone: "오늘 내놓을 밀가루는 벌써 다 나갔다고 한다. 내일이면 또 몇 자루 빻아 두겠다고.",
    txt_miller_flour: "그는 밀가루 한 자루를 내준다. 변경 마을 원로에게 전해 주면, 다시 거래를 트자는 뜻으로 알아들을 거라고 한다.",
    txt_deliver_flour: "원로는 밀가루 자루를 받아 들고 한참을 바라본다. 물레방아 마을과 다시 거래를 하자고, 곧 장터에 수레가 올 거라고 말한다.",
    txt_hamlet_carts: "장터에 물레방아 마을의 수레가 들어와 있다. 갓 구운 빵 냄새가 장터에 퍼진다.",
    txt_buy_mill_bread: "상인에게 은화 한 닢을 건네고 물레방아 마을의 빵을 받는다.",
    txt_eat_mill_bread: "빵을 뜯어 먹자 허기가 가시고 몸에 힘이 돈다.",
    txt_camp_quick: "길가 돌담에 등을 기대고 빵을 나눠 먹는다. 해가 기울기 전에 다시 걸어야 한다. 두 시간쯤 눈을 붙이자 다리가 조금 가벼워진다.",
    txt_camp_full: "길목에서 마른 나뭇가지를 모아 작은 불을 피운다. 빵 한 덩이로 끼니를 때우고 여덟 시간을 쉰다. 먼 길의 피로가 풀렸지만, 다친 곳까지 낫지는 않았다.",
    txt_waystation_supply_accepted: "방앗간 주인이 빵과 말린 식량을 나무 상자에 채우고 봉인을 누른다. 강 건너 길목의 보급소까지 온전히 가져다주면 뱃삯보다 넉넉한 품삯을 주겠다고 한다. 길 위에서 배가 고프면 봉인을 뜯어도 되지만, 그 길목에는 새 보급소가 열리지 않을 것이다.",
    txt_waystation_supply_delivered: "길목의 빈 창고에 보급 상자를 내려놓자 담당자가 장부에 첫 납품을 적는다. 은화 여섯 닢과 돌아갈 길에 먹을 빵 한 덩이를 건네받는다. 이제 이곳에서는 여행자 누구나 값비싼 빵을 살 수 있다.",
    txt_waystation_supply_opened: "봉인을 뜯자 물레방아 빵 두 덩이가 나온다. 당장의 배고픔을 피할 수 있지만 길목으로 가야 할 첫 보급품은 사라졌다. 보급소가 열리기를 기다리는 사람들에게는 아직 아무 소식도 없다.",
    txt_buy_waystation_bread: "강 건너 길목의 보급소에서 은화 두 닢을 내고 빵 한 덩이를 산다. 먼 길에 비싼 값이지만 야영할 식량을 마련했다.",
    txt_north_survey_found: "길목에서 북쪽으로 난 수레바퀴 자국을 따라가자 허물어진 돌담과 비어 있는 보급 꾸러미가 보인다. 우회로를 표시해 앞으로 다닐 상단을 돕거나, 남은 물자를 당장 회수할 수 있다. 두 길을 모두 택할 수는 없다.",
    txt_north_survey_retry: "수레바퀴 자국이 갈라지는 곳에서 길을 놓쳤다. 서두르다 발목을 헛디뎠지만, 다시 조사하면 흔적을 따라갈 수 있을 것이다.",
    txt_north_supply_relief_pact: "첫 보급 마차의 짐 한 묶음을 물레방아 마을 구휼 장부에 배정한다. 방앗간 사람들은 북부 길목에 공동 창고를 마련해 다음 날부터 하루 두 묶음씩 보급품을 모으기로 한다. 이 약속은 나뿐 아니라 뒤따르는 여행자에게도 남는다.",
    txt_north_relief_wagon_dispatch: "내 은화로 마부를 고용해 북부 길목의 보급품 한 묶음을 물레방아 마을 공동 창고로 먼저 보냈다. 방앗간 주인이 이 일을 기억한다.",
    txt_north_relief_stalled_escort: "험한 길에 멈춰 선 마차를 끝까지 호위했다. 실려 있던 식량 한 묶음은 마을 공동 창고로 옮겨지고, 방앗간 주인은 이 일을 기억한다.",
    txt_north_relief_stalled_seized: "멈춰 선 마차에서 빵 세 덩이를 챙겼다. 그 식량은 이제 마을에 도착하지 않는다. 방앗간 장부에는 사라진 짐 한 묶음이 남는다.",
    txt_miller_relief_stalled: "북부 길목의 마차 한 대가 위험한 도로에 멈춰 있다. 그 짐이 오기 전까지는 공동 창고에 새 식량이 들어오지 않는다.",
    txt_miller_relief_losses: "방앗간 주인은 길에서 사라진 구휼 식량의 장부를 보여 준다. 없어진 짐은 후대에도 마을의 기록으로 남는다.",
    txt_north_relief_rations: "방앗간 주인이 공동 창고의 짐 한 묶음을 풀어 빵 두 덩이를 내어 준다. 작은 기부금을 받고 장부에서 재고 한 칸을 지운다.",
    txt_north_trade_caravan_sold: "길목을 지나던 북부 상단에 빵 두 덩이를 넘겼다. 은화 두 닢을 받았고 마차의 실제 식량 재고가 한 묶음 늘었다.",
    txt_north_trade_caravan_bought: "물레방아 마을에 도착한 상단의 마차에서 빵 두 덩이를 샀다. 상단의 짐 한 묶음이 줄었다.",
    txt_north_trade_caravan_escorted: "위험한 북부 도로에서 상단을 호위해 마을까지 데려왔다. 길의 위험이 줄었고, 식량난 중이라면 상단이 자신의 짐 한 묶음을 공동 창고에 내놓았다.",
    txt_north_caravan_route_learned: "길목에서 마부에게 물었다. 그는 상단이 강을 건너 물레방아 마을로 내려가는 길을 설명했다. 직접 들은 경로를 수첩에 남겼다.",
    txt_north_caravan_ride: "안전한 길을 따라 상단 마차에 올라 물레방아 마을까지 이동했다. 짐은 그대로 마차에 실려 있다. 길을 읽는 기술이 있다면 운임이 줄어든다.",
    txt_north_caravan_scout_success: "길잡이로서 위험한 도로의 우회로를 찾아냈다. 상단과 함께 물레방아 마을까지 무사히 건넜고, 마부는 이후 운임을 낮춰 주겠다고 약속했다.",
    txt_north_caravan_scout_retry: "길을 잘못 읽어 우회로가 막혔다. 상단은 아직 길목에 남아 있고, 다시 시도하려면 몸을 추슬러야 한다.",
    txt_north_relief_crisis_rations: "사라진 마차 두 대의 몫을 채우지 못해 구휼 배급이 줄었다. 은화 두 닢을 내고 남은 빵 한 덩이를 받아 든다. 창고의 짐 한 묶음은 줄어든다.",
    txt_north_relief_bread_donated: "내 식량 세 덩이를 공동 창고에 기부했다. 마을은 한 묶음의 구휼 재고를 되찾고, 배급을 정상화한다. 사라진 짐의 장부는 그대로 남는다.",
    txt_north_relief_caravan_funded: "성읍 상인에게 은화 여섯 닢을 맡겨 공동 창고로 보낼 보급 마차를 새로 마련했다. 마을 배급이 회복되지만 옛 손실 기록은 지워지지 않는다.",
    txt_miller_relief_shortage: "구휼 마차 두 대 이상이 사라진 뒤 배급이 줄고 값이 올랐다. 식량을 보태거나 성읍 상인의 재조달을 부탁해야 한다.",
    txt_miller_relief_recovered: "사라진 마차의 장부는 남았지만 새 식량을 마련해 배급을 원래대로 돌렸다. 다음 세대도 공동 창고를 이용할 수 있다.",
    txt_town_merchant_relief_shortage: "북부 구휼 마차가 거듭 사라져 마을 배급이 부족하다. 상인은 은화 여섯 닢이면 새 짐을 공동 창고로 보내겠다고 한다.",
    txt_town_merchant_relief_recovered: "상인은 새 구휼 짐이 마을 창고에 도착했고 배급이 정상화되었다고 전한다. 지난 손실은 여전히 장부에 남아 있다.",
    txt_miller_relief_stocked: "마을 공동 창고에 배급할 빵이 남아 있다. 하루마다 북부 길목에서 마차가 오지만 창고가 가득 차면 다음 짐은 기다려야 한다.",
    txt_miller_relief_empty: "마을 공동 창고의 배급분이 다 떨어졌다. 방앗간 주인은 북부 길목에서 다음 마차가 올 때까지 기다린다고 한다.",
    txt_north_supply_private_sale: "첫 보급 마차의 짐 한 묶음을 성읍의 사설 계약에 넘기고 은화 여덟 닢을 받는다. 마을 공동 창고를 세울 기회는 사라졌고, 길목에는 기존대로 하루 한 묶음씩만 보급품이 도착한다.",
    txt_town_merchant_relief_pact: "상인은 방앗간 사람들이 북부 길목의 공동 창고를 운영한다고 말한다. 이제 하루 두 묶음의 보급이 오지만 창고가 가득 차면 마차는 되돌아간다.",
    txt_town_merchant_private_contract: "상인은 첫 보급품을 사들인 사설 계약이 끝났다고 말한다. 길목의 보급은 하루 한 묶음씩 이어지고, 마을 공동 창고는 열리지 않았다.",
    txt_miller_relief_arrives: "방앗간 주인은 길목에 구휼 창고를 세운 덕에 보급 마차가 하루 두 묶음씩 온다고 말한다. 누가 먼저 계약했는지보다 창고가 오래 버티는 일이 중요하다고 덧붙인다.",
    txt_miller_private_shortage: "방앗간 주인은 길목의 첫 짐이 사설 계약으로 팔려 공동 창고를 마련하지 못했다고 말한다. 이제 길목에 도착하는 하루 한 묶음의 보급품을 서로 기다려야 한다.",
    txt_waystation_bulk_standard: "북쪽에서 도착한 정기 보급 마차가 빵 세 덩이를 묶어 판다. 평소 길목에서 낱개로 살 때보다 값이 싸지만, 마차가 다시 오려면 시간이 걸린다.",
    txt_waystation_bulk_discount: "호위를 맡아 안전해진 길 덕분에 상인들이 빵 세 덩이를 더 싼 값에 내놓는다. 이 값은 뒤따르는 여행자에게도 같다.",
    txt_waystation_merchants_first: "마차를 길목까지 지켜 준 뒤 은화 세 닢을 받는다. 성읍 상인은 호위가 한 번 더 이어지면 정기 보급 값을 낮추겠다고 전한다.",
    txt_waystation_merchants_trust: "두 번째 호위가 끝나자 상단은 이 길을 믿고 정기 보급 값을 낮춘다. 길목 사람들도 후대 여행자도 이 변화를 누릴 것이다.",
    txt_waystation_merchants_steady: "상단의 마차를 다시 지켜 준다. 상인들은 이미 약속한 보급 값을 유지하며 호위 품삯을 건넨다.",
    txt_town_merchant_safe_route: "상인은 북부 우회로의 호위가 안정되자 길목 보급품 가격을 낮췄다고 말한다. 이 변화는 특정 여행자에게만 주는 특혜가 아니다.",
    txt_north_road_guided: "비어 있는 보급품을 손대지 않고 안전한 바퀴 자국을 길목 사람들에게 표시해 준다. 이후 보급 마차는 위험한 돌길을 피하며 한 시간 빨리 움직이고 뱃삯만큼의 은화도 아낀다. 뒤따를 여행자들도 이 길을 쓸 수 있다.",
    txt_north_road_cache_taken: "낡은 꾸러미에서 은화 다섯 닢과 빵 두 덩이를 건졌다. 당장 원정에 도움이 되지만 우회로를 표시할 자취는 흩어졌다. 마차는 예전 길을 계속 달릴 것이다.",
    txt_north_road_guided_convoy: "표시해 둔 우회로를 따라 마차가 빠르게 북상한다. 보급품을 나누어 먹고 쉬는 사이 아홉 시간 만에 성읍이 나타난다.",
    txt_south_road_guided_convoy: "상단은 돌담을 돌아 안전한 우회로로 길목에 내려간다. 아홉 시간 만에 강 건너 길목에 닿았다.",
    txt_trailcraft_success: "이정표가 아닌 흙의 굳기와 물길을 따라 걸음을 옮겨 본다. 발이 닿을 자리를 읽는 법을 익혔다. 다만 어느 길이 어디로 이어지는지는 직접 알아내야 한다.",
    txt_trailcraft_retry: "길을 잘못 읽어 같은 자리를 맴돌았다. 발자국과 바람을 다시 살피면 다음에는 길을 찾아낼 수 있을 것이다.",
    txt_trailcraft_ford: "바위 사이로 난 작은 길을 따라 강나루와 갈림길 사이를 빠르게 지난다. 시간을 벌었지만 기력이 소모됐다.",
    txt_trailcraft_hamlet: "물레방아로 흐르는 물소리를 따라 수레길 대신 좁은 둔덕을 지난다. 걸음은 빨랐지만 기력이 소모됐다.",
    txt_castle_guard_drill: "성읍의 낡은 연습장에서 방패 없는 방어 자세와 발놀림을 반복한다. 은화를 낸 만큼 사범의 지도를 받고, 땀과 기력을 쏟아 검술의 기본을 다진다.",
    txt_castle_spar_pass: "사범의 검끝을 흘려 보내고 빈틈에 검을 멈춰 세운다. 그는 방어 자세를 인정하며 실전에서도 쓸 수 있다고 고개를 끄덕인다.",
    txt_castle_spar_retry: "대련에서 밀려 넘어졌다. 은화와 기력은 돌아오지 않지만 몸이 기억한 실수는 남는다. 다시 준비하면 도전할 수 있다.",
    txt_guarded_stance_hit: "검을 가까이 붙여 공격을 흘리고 짧게 반격한다. 강한 일격은 아니지만 몸을 지키며 빈틈을 찔렀다.",
    txt_guarded_stance_block: "상대의 검이 방어 자세를 흔든다. 반격에는 실패했지만 급소를 피하고 피해를 줄였다.",
    txt_castle_breakthrough_pass: "사범의 검을 밀어내고 빈틈을 파고든다. 위험을 감수한 빠른 돌파를 인정받았다. 이 검술은 검을 쥔 채 기력을 쏟아야 한다.",
    txt_castle_breakthrough_retry: "공격을 서두르다 반격을 허용했다. 비용과 기력은 돌아오지 않지만, 다음 대련에서 파고들 틈은 조금 더 보인다.",
    txt_breakthrough_cut_hit: "검끝을 낮게 숨긴 채 순식간에 파고들어 깊은 상처를 남겼다. 기력을 크게 소모했지만 주도권을 잡았다.",
    txt_breakthrough_cut_trade: "상대의 방어를 뚫었지만 빈틈을 내주어 나도 베였다. 공격적인 검술의 대가다.",
    txt_breakthrough_cut_fail: "무리하게 파고든 순간 반격을 정면으로 받았다. 다음에는 공격과 방어의 균형을 다시 판단해야 한다.",
    txt_north_road_convoy: "보급소의 마차가 북쪽으로 떠난다. 빵을 나눠 먹고 짐칸에서 몸을 쉬는 동안 길이 줄어든다. 열 시간 만에 영주의 성읍이 보인다.",
    txt_south_road_convoy: "성읍을 떠나는 보급 마차에 올라 길목으로 돌아온다. 짐을 싣고 쉬엄쉬엄 가도 혼자 걷는 것보다 빠르다.",
    txt_north_road_march: "잠도 먹을 것도 뒤로 미루고 성읍까지 달리듯 걷는다. 네 시간이 절약되지만 다리와 온몸에 무리가 간다.",
    txt_south_road_march: "성읍을 뒤로하고 강 건너 길목까지 강행군한다. 시간을 벌었지만 발바닥이 쓰리고 숨이 거칠다.",
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
    txt_board_remnants: "새 방이 붙어 있다. 숲 너머 옛 진터에 무리의 남은 자들이 다시 모였다고 한다. 길목의 상인들이 그들을 흩는 이에게 은화 열두 닢을 건다.",
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
    txt_town_merchant_buy_flour: "상인은 자루를 열어 밀가루를 손끝으로 비벼 본다. 강 남쪽 밀은 곱게 빻였다며 은화 여섯 닢을 내준다.",
    txt_town_merchant_flour_wanted: "밀가루도 가져오면 사겠다고 한다. 성읍 빵집들이 강 남쪽 밀을 찾는다고.",
    txt_town_merchant_flour_enough: "밀가루는 지난번에 들어온 것으로 당분간 넉넉하다고 한다. 상단이 몇 번 오가고 나면 다시 찾을 거라고.",
    txt_town_merchant_flour_fair: "요즘은 밀가루 값이 올랐다고 한다. 왕도의 큰 장으로 상단들이 곡식을 실어 올라가는 통에 성읍에는 밀이 귀하다고.",
    txt_town_merchant_buy_flour_fair: "상인은 자루를 반기며 은화 여덟 닢을 세어 준다. 큰 장이 끝나기 전에 더 가져오라고 한다.",
    txt_escort_known_bonus: "서기는 품삯에 은화 한 닢을 더 얹어 준다. 조합이 믿는 호위에게는 그만큼 더 쳐 준다고 한다.",
    txt_guild_clerk_knows_you: "서기가 장부를 넘기다 고개를 든다. 상단 사람들이 내 이야기를 하더라고, 믿을 만한 호위라고 한다.",
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
    txt_guild_clerk_too_hurt: "서기가 나를 위아래로 훑어본다. 그 몸으로 길에 나섰다가 일이 틀어지면 돌아오지 못할 수도 있다고, 먼저 쉬고 오라고 한다.",
    txt_guild_clerk_sees_wound: "서기가 옆구리를 감싼 내 손을 본다. 상처를 안고 칼을 들면 둔해진다고, 하룻밤 쉬고 오라고 한다.",
    txt_guild_clerk_sees_deep_wound: "서기는 내가 걷는 모양만 보고도 고개를 젓는다. 저 상처는 하룻밤으로 낫지 않는다고, 약초 연고를 바르거나 오래 쉬어야 한다고 한다.",
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
    txt_guild_clerk_lead_offer: "서기가 장부에서 눈을 들어 내 칼 솜씨를 새삼 헤아린다. 이만한 솜씨면 호위를 이끄는 자리도 맡을 만하다고, 품삯도 그만큼 다르다고 한다.",
    txt_guild_clerk_danger_offer: "서기는 목소리를 낮춘다. 강철을 걸친 이만 부탁할 수 있는 상단이 있다고 한다 — 길이 험하고 상대가 독하지만 품삯은 두 배에 가깝다고.",
    txt_danger_great: "험한 길목에서 호위들을 이끌어 독한 무리를 단번에 꺾는다. 상단은 짐 하나 잃지 않고 닿고, 상단주는 놀라 은화를 한 움큼 더 얹는다.",
    txt_danger_success: "호위들을 촘촘히 세워 험한 길을 뚫는다. 상단은 무사히 닿고, 위험한 일의 품삯이 넉넉히 치러진다.",
    txt_danger_fail_trust: "서기는 장부에 이번 일을 적으며 고개를 젓는다. 위험한 상단을 맡겼다가 놓친 호위를, 조합은 쉽게 다시 믿지 않는다.",
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
    lbl_unlock_unl_north_road_survey: "북부 도로 정찰",
    lbl_unlock_unl_trailcraft: "길잡이 측량술",
    lbl_unlock_unl_caravan_pathfinder: "상단 길잡이",
    lbl_unlock_unl_ruins_cellar_route: "매몰 창고 길잡이",
    lbl_unlock_unl_ruins_lower_route: "지하 봉인실 길잡이",
    lbl_unlock_unl_ruins_raider_tracked: "떠돌이 약탈자 추적",
    lbl_unlock_unl_keen_eye: "예리한 눈",
    lbl_unlock_unl_road_lead: "상단을 이끌 자격",
    lbl_unlock_unl_guarded_stance: "방어 검술 자세",
    lbl_unlock_unl_breakthrough_cut: "돌파 검술",
    lbl_unlock_unl_realm_renown: "왕국이 아는 이름 (남쪽 변경의 수호자)",
    lbl_res_stamina: "기력",
    lbl_slot_hand: "손",
    lbl_slot_body: "몸",
    lbl_tmpl_start_wanderer: "떠돌이",
    lbl_tmpl_start_scout: "정찰자",
    lbl_rumor_rum_ruins_secret: "폐허는 도적들의 은신처다",
    lbl_rumor_rum_bandits_fate: "도적단은 흩어졌다",
    lbl_rumor_rum_elder_asks_band: "원로의 부탁: 강 건너에서 사람을 모으는 자가 누구인지 알아봐 달라",
    lbl_rumor_rum_band_recruits: "강 건너에서 누군가 품삯을 후하게 주고 사람을 모은다",
    lbl_rumor_rum_band_led_by_scarred: "강 건너 무리를 이끄는 자는 왼쪽 옆구리를 감싸는 사내다",
    lbl_rumor_rum_band_led_by_remnant: "강 건너 무리를 이끄는 자는 폐허 두목 밑에 있던 자다",
    lbl_rumor_rum_frontier_warned: "원로가 변경에 대비를 일렀다. 이제 그들이 언제 강을 건너오는지 지켜볼 때다",
    lbl_story_chapter_1: "1장 변경의 일",
    lbl_story_chapter_2: "2장 강 건너의 그림자",
    lbl_story_chapter_3: "3장 변경을 지키는 일",
    lbl_story_chapter_4: "4장 강을 건너오는 불길",
    lbl_story_chapter_5: "5장 마지막 싸움과 그 뒤",
    lbl_rumor_rum_band_camp_way: "무리는 강 건너 길목에서 북쪽 숲길로 들어갔다",
    lbl_rumor_rum_band_size: "숲 너머에 모인 무리를 직접 보았다",
    lbl_rumor_rum_band_crossing_soon: "무리가 곧 강을 건너올 셈이다",
    lbl_rumor_rum_guild_keeps_guards: "조합이 품삯을 올려 호위들을 붙잡아 두기로 했다",
    lbl_rumor_rum_frontier_prepared: "마을의 대비를 도왔다",
    lbl_rumor_rum_herbalist_stock: "약초꾼이 맡긴 정화초로 연고를 마련해 둔다",
    lbl_rumor_rum_lord_offer: "영주가 변경에 보호를 내주는 대신 사람과 세를 바라는 포고를 붙였다",
    lbl_rumor_rum_lord_pact_accepted: "변경은 영주의 보호를 받아들였다",
    lbl_rumor_rum_lord_pact_refused: "변경은 스스로 지키기로 했다",
    lbl_rumor_rum_band_crossed: "무리가 강을 건너 갈림길에 진을 쳤다",
    lbl_rumor_rum_raid_coming: "무리가 사흘 안에 마을로 내려온다",
    lbl_rumor_rum_ending_name: "갈림길에서 무리를 이끌던 자가 쓰러지고 무리가 흩어졌다",
    lbl_rumor_rum_ending_held: "변경은 스스로 무리를 막아 냈다",
    lbl_rumor_rum_ending_lord: "변경은 영주의 깃발 아래 무리를 막아 냈다",
    lbl_rumor_rum_ending_fell: "무리가 내려온 밤 마을이 무너졌다",
    lbl_rumor_rum_fate_word_north: "변경의 일이 상단 편에 북쪽으로 올라갔다",
    lbl_rumor_rum_remnants_regrouped: "숲 너머에 무리의 잔당이 다시 모였다. 길목에 사례금이 다시 걸렸다",
    lbl_rumor_rum_ferryman_watches: "뱃사공이 무리가 건너오면 마을에 알려 주기로 했다",
    lbl_rumor_rum_crown_writ: "왕궁이 변경에 민병을 세울 글을 내렸다",
    lbl_rumor_rum_band_stores_burnt: "숲 너머 무리의 식량 더미가 불탔다",
    lbl_rumor_rum_frontier_seen_royal: "변경에서 온 이가 왕도의 성문을 지났다고 한다",
    lbl_rumor_rum_frontier_seen_town: "성읍 사람들이 변경 쪽 길로 사람이 올라왔다고 한다",
    lbl_rumor_rum_frontier_seen_far_bank: "길목 사람들이 남쪽 변경에서 온 나그네를 이야기한다",
    lbl_rumor_rum_raider_watchpost_sighting: "감시 초소 경계병이 침입자를 목격했다고 한다",
    lbl_rumor_rum_raider_mill_sighting: "방앗간 주인이 상단 물자를 노린 약탈자를 목격했다고 한다",
    lbl_rumor_rum_raider_village_sighting: "마을 경계병이 창고 근처의 약탈자를 목격했다고 한다",
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
    lbl_rumor_rum_town_flour_wanted: "성읍 상인이 밀가루를 찾는다",
    lbl_rumor_rum_town_flour_enough: "성읍에 밀가루가 넉넉하다",
    lbl_rumor_rum_caravan_took_flour: "상단이 변경의 밀가루를 싣고 북으로 갔다",
    lbl_rumor_rum_town_flour_caravan_bought: "상단이 방앗간 밀가루를 사 갔으니 성읍이 찾는 모양이다",
    txt_ferryman_town_wants: "\"지난번 상단이 그러는데, 성읍 상인이 강 남쪽 밀가루를 찾는다더군.\"",
    txt_ferryman_fate_north: "\"변경 이야기는 상단 편에 북으로 올라갔소. 이제 성읍에서도, 왕도에서도 그 일을 들었을 거요.\"",
    txt_ferryman_town_enough: "\"지난번 상단 말로는 성읍엔 밀가루가 넉넉하다더군. 지금도 그런지는 나도 모르오.\"",
    txt_ferryman_caravan_took: "\"그 상단이 돌아가는 길에 방앗간 밀가루를 한 자루 싣고 건넜소.\"",
    txt_ferryman_doubts_notes: "\"상인 짐표는 당분간 안 받소. 다음 상단 편에 그 양반 대답을 들어 봐야겠소.\"",
    txt_ferryman_cross_note: "뱃사공이 짐표를 보고 장부에 적는다. \"상인 앞으로 달아 두지. 셈은 상단이 치러 줄 거요.\"",
    txt_ferryman_note_misused: "뱃사공이 빈손과 짐표를 번갈아 본다. 말없이 장부에 적고 배를 민다. 상인에게도 이 이야기는 갈 것이다.",
    txt_town_merchant_order: "상인이 짐표 한 장을 써 준다. \"다음에도 밀가루를 가져오시오. 이걸 보이면 뱃삯은 내 앞으로 달아 줄 거요. 그 짐의 한 자루는 그때 사정이 어떻든 은화 넷에 사겠소.\"",
    txt_town_merchant_buy_flour_note: "상인이 장부를 보고 밀가루 값을 치른다. \"지금은 넉넉하지만, 약속은 약속이니.\"",
    txt_town_merchant_buy_flour_note_wanted: "상인이 장부를 보고 짐표에 적은 값을 치른다. \"마침 찾던 참이오. 그래도 값은 짐표대로 넷이오.\"",
    txt_town_merchant_note_back: "상인이 짐표로 실어 온 짐을 장부에서 지운다.",
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
    lbl_src_obs_loc_band_camp: "직접 봄 (북쪽 숲 너머)",
    lbl_src_obs_loc_crossroads: "직접 봄 (갈림길)",
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
    txt_treat_deep_wound: "깊은 상처에 약초 연고를 두텁게 바르고 천으로 단단히 감는다. 쑤시던 것이 가라앉는다.",
    txt_spring_watch_lantern: "원로는 샘길을 살피던 마을 사람에게서 낡은 등불을 받아 건넨다. \"눈으로 확인하기 전에는 소문을 사실이라 말하지 말게.\"",
    txt_spring_inquiry_herb: "약초꾼은 원로에게서 샘을 살펴보자는 이야기를 들었다며 정화초 한 줌을 내민다. \"어디가 더러운지는 직접 살펴야 알 수 있지.\"",
    txt_spring_watch_requested: "두 이야기가 이어진다고 말하자 원로는 증거 없이 마을을 놀라게 해서는 안 된다고 나무란다. 그래도 샘으로 향하는 길을 주의 깊게 살펴보겠다고 한다.",
    txt_spring_inquiry_requested: "두 사건을 섣불리 하나로 엮지 말자고 말하자 원로는 고개를 끄덕인다. 마을에 소문을 퍼뜨리기 전에 샘을 직접 살펴보라고 한다.",
    txt_spring_watch_followup: "원로는 샘으로 향하는 길을 지켜보고 있지만, 도적의 흔적을 직접 확인한 이는 아직 없다고 한다.",
    txt_spring_inquiry_followup: "원로는 샘의 흔적을 확인하기 전까지 폐허와 우물을 같은 사건으로 단정하지 않겠다고 한다.",
    txt_spring_watch_vindicated: "원로는 화살을 확인하고 고개를 숙인다. \"그때 경계를 청한 말을 흘려듣지 말았어야 했네.\" 마을의 신뢰가 조금 돌아온다.",
    txt_spring_inquiry_revised: "원로는 화살을 한참 살핀다. \"섣불리 단정하지 말자던 말도 옳았지만, 이제는 샘길 경계를 늦출 수 없겠군.\" 늦어진 대응의 부담이 남는다.",
    txt_spring_watch_afterproof: "원로는 처음 샘길을 경계하자던 말과 직접 가져온 화살을 함께 기억한다.",
    txt_spring_inquiry_afterproof: "원로는 처음 두 사건을 나누어 보자던 말을 새 증거에 맞춰 고쳐 받아들였다고 말한다.",
    txt_spring_patrol_deployed: "원로는 화살 이야기를 들은 뒤 하루 동안 샘길을 살피게 했다고 한다. 마을 사람들은 독기가 짙은 자리에 표식을 남겨 길을 지나는 이들이 피해 가게 했다.",
    txt_spring_patrol_pending: "원로는 샘길에 표식을 놓을 사람들을 모으고 있다고 한다. 하루는 걸릴 일이지만, 지금 마을 사람들과 함께 나서면 두 시간 안에 마칠 수 있다. 힘이 드는 일이다.",
    txt_spring_patrol_helped: "마을 사람들과 샘길을 오르내리며 독기가 짙은 곳에 표식을 남긴다. 두 시간이 지나자 지나는 이들이 위험한 자리를 피해 갈 길이 생겼다.",
    txt_spring_patrol_helped_public: "원로는 마을 사람들이 힘을 보태 샘길의 위험한 자리를 두 시간 만에 표시했다고 한다. 이제 길을 지나는 이들은 독기가 짙은 곳을 비켜 갈 수 있다.",
    txt_spring_patrol_trap_news: "원로가 덧붙인다. 샘길을 표시하던 사람들이 덤불 속 덫에서 폐허 무리의 표식을 보았다고 한다. 직접 본 것은 아니니, 샘에 가서 고리를 살펴봐야겠다.",
    txt_spring_trap_route_reinforced: "직접 확인한 덫의 위치를 원로에게 짚어 주고 샘길을 다시 오른다. 두 시간 동안 위험한 샛길까지 표시한다. 기력은 들었지만 이제 독기가 짙은 곳을 돌아갈 수 있다.",
    txt_spring_trap_warning_published: "직접 본 덫의 고리와 표식을 원로의 장부에 자세히 적는다. 필사할 은화 한 닢을 내자 원로는 마을 사람들이 읽을 수 있게 경고문을 붙인다.",
    txt_spring_trap_route_followup: "원로는 덫이 있던 샛길까지 표시해 두었다고 말한다. 독기가 짙은 곳을 지나는 사람은 이제 더 안전하게 돌아갈 수 있다.",
    txt_spring_trap_notice_followup: "원로는 덫의 표식을 기록한 경고문을 보여 준다. 직접 확인한 사람이 남긴 기록이라 마을에 전하는 말도 이전보다 분명해졌다.",
    txt_herbalist_trap_safe_harvest: "약초꾼과 함께 보강된 샘길 표식을 따라 안전한 풀밭을 찾는다. 한참을 걸으며 약초를 모은 뒤 정화초 두 묶음을 나누어 받는다. 약초꾼은 다음 채집 때도 표식을 따라가겠다고 한다.",
    txt_herbalist_trap_safe_harvest_followup: "약초꾼은 샘길 표식 덕분에 사람들이 독기를 피하며 약초를 구할 수 있게 되었다고 말한다.",
    txt_herbalist_trap_share_notice: "원로의 경고문을 약초꾼의 노점에도 옮겨 적는다. 약초꾼은 손님들에게 덫이 있는 샛길을 피하라고 알리며, 답례로 약초 연고 한 통을 건넨다.",
    txt_herbalist_trap_share_notice_followup: "약초꾼의 노점에 덫 경고문이 붙었다. 장터를 오가는 사람들도 위험한 샛길을 피해 가게 되었다.",
    txt_spring_miasma_route_reinforced: "덫의 위치까지 새겨 둔 표식을 따라 독기가 짙은 길목을 비켜 간다. 몸에 해로운 기운은 닿지 않았다.",
    txt_spring_miasma_patrol: "샘길에 남겨진 표식을 따라 독기가 짙은 자리를 비켜 간다. 숨이 조금 막히지만 더 깊은 곳으로 들지는 않았다.",
    txt_prologue_levy: "영주의 징집령이 성읍 게시판에 붙던 날 밤, 나는 강을 건넜다. 뱃사공은 뱃삯을 받고 아무것도 묻지 않았다.",
    txt_prologue_scout_levy: "나는 영주의 척후였다. 숲길과 밤길을 읽는 일로 먹고살았다. 징집령이 성읍 게시판에 붙던 날, 그 장부에 내 이름도 있었다. 그날 밤 나는 강을 건넜다.",
    txt_prologue_south: "강 남쪽은 영주의 땅이 아니라고들 한다. 왕국의 지도에는 있지만, 영주의 사람들은 강을 건너오지 않는다고.",
    txt_prologue_name: "내 이름은 강 북쪽에 두고 왔다. 거기서는 그 이름이 징집 장부에 적혀 있을 것이다.",
    txt_prologue_forest: "갈림길은 도적들이 막고 있다고 했다. 길을 버리고 밤새 숲을 돌았다. 자정 무렵 개 짖는 소리가 들리고, 낮은 담장 너머로 우물이 보였다. 원로들이 다스린다는 마을이다.",
    txt_prologue_well: "우물가에 사람은 없었다. 두레박 옆에 엎어 둔 물동이에서 썩은 풀 냄새가 났다.",
    txt_prologue_purse: "은화 여덟 닢. 이름 없는 사내 하나. 여기서부터는 아무도 나를 모른다.",
    txt_prologue_scout_purse: "뱃삯을 치르고 나니 은화 세 닢이 남았다. 이름 없는 사내 하나. 여기서부터는 아무도 나를 모른다.",
    txt_place_loc_village: "변경 마을. 낮은 담장과 함께 쓰는 우물, 원로의 집. 영주의 사람들은 여기까지 내려오지 않는다.",
    txt_place_loc_market: "장터. 상인의 좌판과 약초꾼의 노점이 마주 보고 있다.",
    txt_place_loc_ruins: "폐허. 무너진 벽 사이로 바람이 운다. 발밑을 조심해야 한다.",
    txt_place_loc_forest_spring: "숲속 샘. 마을 우물의 물이 여기서 흘러간다.",
    txt_place_loc_crossroads: "옛 갈림길. 닳은 이정표가 동쪽과 북쪽, 그리고 강 건너를 가리킨다.",
    txt_place_loc_mill_hamlet: "물레방아 마을. 물레 도는 소리와 밀가루 냄새.",
    txt_place_loc_river_ford: "강나루. 내가 건너온 강이다. 뱃사공이 배를 매어 두고 있다.",
    txt_place_loc_far_bank: "강 건너 길목. 다시 영주의 땅이다. 게시판 앞에서는 저절로 고개가 숙여진다.",
    txt_place_loc_castle_town: "영주의 성읍. 성벽 위에 깃발이 보인다. 내가 달아난 곳이다.",
    txt_place_loc_royal_city: "왕도. 사람이 너무 많아서 아무도 나를 보지 않는다.",
    txt_place_loc_band_camp: "북쪽 숲 너머. 나무 사이로 연기 냄새가 난다.",
    lbl_choice_choice_elder_dialogue: "원로에게 무엇을 말할까",
    lbl_choice_choice_ferryman_dialogue: "뱃사공에게 무엇을 말할까",
    lbl_choice_choice_town_merchant_dialogue: "성읍 상인에게 무엇을 말할까",
    lbl_choice_choice_guild_clerk_dialogue: "조합 서기에게 무엇을 말할까",
    lbl_choice_choice_miller_dialogue: "방앗간 주인에게 무엇을 말할까",
    lbl_choice_choice_herbalist_dialogue: "약초꾼에게 무엇을 말할까",
    lbl_choice_choice_fight_leader: "두목의 칼이 온다. 어떻게 맞설까",
    lbl_choice_choice_final_battle: "무리 앞이다. 어떻게 맞설까",
    goal_meet_elder: "이 마을에 자리를 잡는다. 원로들이 다스린다니 먼저 원로를 만나 본다.",
    goal_leave_market: "등불은 준비했다. 변경 마을로 돌아가 폐허로 향한다.",
    goal_search_ruins_ready: "등불은 준비했다. 폐허 안을 살펴 원로의 말을 직접 확인한다.",
    goal_search_ruins_here: "폐허에 도착했다. 안을 살펴 원로의 말을 직접 확인한다.",
    goal_search_ruins: "원로가 말한 폐허를 직접 살핀다. 안이 어둡다니 장터에서 등불부터 구한다.",
    goal_search_ruins_night: "원로가 말한 폐허를 직접 살핀다. 척후 노릇을 하던 눈이라 등불 없이도 어둠은 읽힌다.",
    goal_settle_bandits: "폐허에서 본 것을 원로에게 전하고, 도적 두목과 결판을 낸다.",
    goal_road_open: "갈림길이 다시 열렸다. 물레방아 마을과 강나루로 가서 바깥 소식을 듣는다.",
    goal_who_gathers: "원로의 부탁. 강 건너에서 사람을 모으는 자가 누구인지 알아낸다. 나루와 강 건너 사람들에게 묻는다.",
    goal_tell_elder_leader: "무리를 이끄는 자를 알아냈다. 원로에게 알린다.",
    goal_watch_crossing: "무리가 언제 강을 건너오는지 지켜본다. 그 사이 마을의 대비를 돕고 몸을 갖춘다.",
    goal_face_band: "무리가 강을 건너 갈림길에 진을 쳤다. 마을로 내려오기 전에 갈림길로 간다.",
    goal_after: "변경의 일은 끝났다. 이제 무엇을 할지는 내가 정한다.",
    goal_well_sick: "마을 사람들이 배앓이를 한다. 장터의 약초꾼이라면 까닭을 알지도 모른다.",
    goal_well_source: "우물물은 숲속 샘에서 온다. 샘에 가 본다.",
    goal_well_cause: "샘 위쪽의 사체가 물을 흐린다. 치우고 정화제를 부어야 한다. 정화제는 약초꾼이 정화초로 달여 준다.",
    greet_elder_fell: "무너진 담장 곁에 원로가 앉아 있다. 나를 보고도 한참 아무 말이 없다. 그러다 겨우 손짓으로 곁을 내준다.",
    greet_elder_honored: "원로가 지팡이를 내려놓고 먼저 손을 내민다. \"어서 오게. 이 마을에서 자네를 모르는 이는 이제 없네.\"",
    greet_elder_night_confidant: "늦은 밤인데도 원로는 문을 열어 준다. \"자네라면 깨워도 되네. 들어오게.\"",
    greet_elder_night: "늦은 밤이다. 한참 문을 두드리자 원로가 등잔을 들고 나온다. 잠이 덜 깬 눈으로 나를 살핀다. \"이 밤에 무슨 일인가.\"",
    greet_elder_confidant: "원로가 주위를 한 번 살피고 문을 닫는다. 이제 그는 나에게만 하는 이야기가 있다.",
    greet_elder_known: "원로가 고개를 끄덕여 나를 들인다. 아직 웃지는 않지만, 경계하는 눈빛은 아니다.",
    greet_elder_stranger: "흰머리의 노인이 문간에서 나를 막아선다. 원로다. 낯선 행색을 위아래로 훑고서야 입을 연다. \"어디서 온 누구인지는 묻지 않겠네. 이 마을에선 하는 일로 사람을 보지.\"",
    greet_herbalist_trusted: "약초꾼이 좌판 너머에서 손을 흔든다. \"마을을 살린 분이 오셨네! 오늘은 뭐가 필요해요?\"",
    greet_herbalist_purifier: "약초꾼이 말린 정화초 다발을 들어 보인다. \"샘이 맑아진 뒤로 이게 다시 나요. 다 손님 덕이에요.\"",
    greet_herbalist_night: "등잔 아래서 약초꾼이 하품을 참으며 말린 풀을 고른다. \"이 시간에 오는 사람은 아픈 사람뿐인데. 어디 아파요?\"",
    greet_herbalist_known: "약초꾼이 나를 알아보고 웃는다. \"또 왔네요. 배앓이 이야기는 좀 알아봤어요?\"",
    greet_herbalist_stranger: "쑥 냄새가 짙은 노점이다. 소매를 걷어붙인 사람이 약초를 다듬다 고개를 든다. 약초꾼이다. \"처음 보는 얼굴이네. 요즘 배앓이 약은 찾는 사람이 많아서요.\"",
    greet_miller_welcomed: "방앗간 주인이 밀가루 묻은 손을 앞치마에 닦으며 달려 나온다. \"변경 마을 친구 왔구려! 오늘따라 물레가 잘 돈다오.\"",
    greet_miller_stranger: "물레 소리가 귀를 채운다. 온몸에 밀가루를 뒤집어쓴 사람이 나를 보고 눈을 끔뻑인다. 방앗간 주인이다. \"길이 막힌 뒤로 손님은 처음이구려. 어디서 오셨소?\"",
    greet_ferryman_misused: "뱃사공이 노를 무릎에 걸친 채 나를 본다. 눈이 차갑다. \"짐도 없이 짐표를 내미는 손님은 기억해 두오.\"",
    greet_ferryman_watching: "뱃사공이 고개만 까딱한다. 강 건너를 지켜보겠다던 약속을 잊지 않은 얼굴이다.",
    greet_ferryman_known: "뱃사공이 밧줄을 감다 말고 턱짓을 한다. \"또 오셨소.\"",
    greet_ferryman_stranger: "뱃사공이 나를 알아본다. 그 밤, 아무것도 묻지 않고 나를 건네준 사람이다. 이번에도 묻지 않는다. \"건너든 말든, 뱃삯은 셋이오.\"",
    greet_town_merchant_carrying: "상인이 장부를 펼친 채 나를 맞는다. \"짐표의 밀가루는 오는 중이오?\"",
    greet_town_merchant_supplier: "상인이 반색한다. \"남쪽 밀가루를 대는 분이로군. 앉으시오.\"",
    greet_town_merchant_stranger: "비단 띠를 두른 상인이 주판알을 튕기다 눈만 든다. 내 행색을 값으로 매기는 눈이다. \"남쪽에서 왔소? 남쪽 물건이라면 들어 보지.\"",
    greet_guild_clerk_renowned: "서기가 장부에서 고개를 들더니 붓을 내려놓는다. 이 사람이 자리에서 일어서는 것은 처음 본다.",
    greet_guild_clerk_known: "서기가 장부를 넘기며 내 이름 대신 적어 둔 표식을 찾는다. \"왔군. 일거리가 있소.\"",
    greet_guild_clerk_stranger: "먹 냄새 나는 방이다. 서기가 장부에서 눈을 떼지 않은 채 묻는다. \"이름은?\" 대답하지 않자, 서기는 이름 칸을 비워 둔 채 무언가를 적는다.",
    lbl_rumor_rum_spring_trap_mark: "샘가의 덫에 폐허 도적들의 표식이 있다",
    lbl_src_src_well_folk: "우물가 사람들",
    lbl_src_src_ford_traveller: "나루의 나그네",
    lbl_src_npc_north_caravan_driver: "북부 상단 마부",
    lbl_src_src_deserter: "무리에서 도망친 사내",
    enc_well_child_intro: "우물가에서 아이 하나가 배를 움켜쥐고 웅크려 있다. 곁에 선 어른은 빈 물동이만 들여다본다. 누구도 우물에 두레박을 내리지 않는다.",
    enc_well_child_carry: "아이를 업고 장터로 뛴다. 약초꾼은 아이의 배를 짚어 보고 혀를 찬다. \"우물물이에요. 그 물은 숲속 샘에서 내려오는데, 샘이 탈이 났나 봐요.\" 아이 어미가 내 소매를 붙잡고 고개를 숙인다.",
    enc_well_child_ask: "어른이 물동이를 내려놓는다. \"물에서 썩은 풀 냄새가 나요. 우물물은 숲속 샘에서 오는데, 요즘은 거기 가는 사람이 없어요.\"",
    enc_well_child_bread: "빵을 쪼개 아이 손에 쥐여 준다. 아이는 한참 빵을 바라보다가 조금씩 뜯어 먹는다. 곁의 어른이 말없이 고개를 숙인다. 이 마을에서 처음 받은 인사다.",
    enc_spring_trap_intro: "샘으로 내려가는 덤불 속에 쇠덫이 입을 벌리고 있다. 녹슨 고리에 새긴 표식을 어디서 본 것 같다.",
    enc_spring_trap_disarm: "덫의 이빨을 벌려 덤불 밖으로 던진다. 고리의 표식은 폐허의 도적들이 짐에 찍는 것과 같다. 이 숲에 덫을 놓은 것은 그들이다.",
    enc_spring_trap_graze: "이빨이 튀어 올라 손등을 긁는다. 겨우 덫을 치우고 보니 고리의 표식이 눈에 익다. 도적들의 것이다.",
    enc_spring_trap_bite: "덫이 튀어 올라 정강이를 문다. 이를 악물고 이빨을 벌린다. 피가 신발로 흘러든다.",
    enc_spring_trap_mark: "덫은 건드리지 않는다. 고리의 표식만 눈에 새겨 둔다. 어디서 보았는지는 곧 떠오를 것이다.",
    enc_toll_post_intro: "무너진 통행세 초소의 문짝이 바람에 덜컹거린다. 바닥에 뜯긴 장부가 흩어져 있다. 이 장부에 적힌 이름 가운데 몇은 나처럼 이름을 숨기고 지나갔을 것이다.",
    enc_toll_post_ledger: "장부를 주워 맞춘다. 날짜와 은화의 수, 그리고 이름 대신 적힌 생김새들. 마지막 장 사이에 누군가 숨겨 둔 은화가 끼어 있다.",
    enc_toll_post_names: "장부를 넘겨 보지만 글씨가 번져 읽을 수 없다. 이름 대신 적힌 생김새들만 겨우 알아본다. '키 큰 사내, 왼뺨에 흉.' '말없는 여인, 짐이 무거움.'",
    enc_toll_post_floor: "마루 밑을 뜯는다. 흙먼지 속에서 은화 두 닢이 굴러 나온다. 도적들도 다 챙겨 가지는 못한 모양이다.",
    enc_ford_traveller_intro: "나루의 모닥불 곁에 북쪽 말씨의 나그네가 언 손을 녹이고 있다. 성읍의 징집관이 장부를 들고 마을마다 돈다는 이야기를 하는 중이다.",
    enc_ford_traveller_listen: "나그네의 이야기를 끝까지 듣는다. 열여섯이 넘은 사내는 모두 성으로 불려 간다고, 장부에 이름이 오른 자가 사라지면 그 집에 벌금이 매겨진다고. 불빛이 흔들린다. 나는 아무 말도 하지 않는다.",
    enc_ford_traveller_confess: "\"나도 북쪽에서 왔소.\" 나그네가 나를 오래 본다. \"그럼 길목 게시판 앞은 피하시오. 징집관이 얼굴을 살핀다더군.\" 배를 매던 뱃사공이 우리 쪽은 보지도 않고 고개를 한 번 끄덕인다.",
    enc_ford_traveller_leave: "불을 쬐다 말없이 일어선다. 등 뒤에서 나그네의 이야기가 계속된다. 징집 장부, 벌금, 사라진 사내들.",
    enc_mill_wheel_intro: "물레가 멈춰 있다. 방앗간 주인이 허리까지 물에 들어가 물레에 걸린 통나무를 밀어내려 낑낑댄다.",
    enc_mill_wheel_turns: "둘이 어깨를 대고 밀자 통나무가 빠져나간다. 물레가 삐걱이며 다시 돈다. 방앗간 주인이 물에 젖은 채 껄껄 웃더니, 밀가루 한 자루를 내 어깨에 얹어 준다.",
    enc_mill_wheel_bruised: "발이 미끄러져 통나무에 어깨를 찧는다. 그래도 둘이 몇 번을 더 밀자 물레가 겨우 돈다. 방앗간 주인이 미안한 얼굴로 젖은 내 등을 두드린다.",
    enc_mill_wheel_rope: "밧줄을 통나무에 걸어 물살 비스듬히 당긴다. 통나무가 스르르 빠져나가고 물레가 돈다. \"머리 쓰는 손님이구려!\" 방앗간 주인이 밀가루 한 자루를 내준다.",
    enc_mill_wheel_slow: "밧줄이 자꾸 미끄러진다. 한참을 씨름한 끝에야 통나무가 빠진다. 방앗간 주인은 그래도 고맙다며 손을 흔든다.",
    enc_mill_wheel_watch: "둑에 서서 지켜본다. 한참 만에 통나무가 빠지고 물레가 돈다. 방앗간 주인은 흠뻑 젖은 채 나를 한 번 쳐다볼 뿐이다.",
    enc_levy_officer_intro: "길목 게시판 앞에 영주의 징집관이 서 있다. 지나는 사내들의 얼굴을 장부와 맞춰 본다. 내 이름이 적힌 그 장부일지도 모른다.",
    enc_levy_officer_ledger: "징집관의 등 뒤로 지나며 장부를 곁눈질한다. 강 북쪽 마을들의 이름 아래, 강 남쪽 마을의 이름도 몇 적혀 있다. 영주의 장부는 강에서 멈추지 않을 셈이다.",
    enc_levy_officer_noticed: "징집관이 고개를 든다. 내 얼굴에서 눈을 떼지 않는다. 서둘러 길을 돌리지만, 그가 곁의 사내에게 무언가 속삭이는 것을 보았다.",
    enc_levy_officer_warned: "나그네의 말을 떠올린다. 게시판 반대편 길로 크게 돈다. 징집관의 장부가 바람에 펄럭이는 소리만 멀리서 들린다.",
    enc_levy_officer_away: "고개를 숙이고 멀찍이 돌아간다. 심장이 한참 뒤에야 가라앉는다.",
    enc_followed_intro: "성읍 골목에서 누군가 나를 따라온다. 돌아보지 않아도 안다. 길목에서 본 징집관 곁의 사내다.",
    enc_followed_slip: "골목을 세 번 꺾고 빨래 널린 마당을 가로지른다. 발소리가 멀어진다. 숨을 고르며 벽에 기댄다.",
    enc_followed_caught: "막다른 골목이다. 사내가 내 팔을 붙잡는다. 은화 세 닢을 쥐여 주자 그는 아무것도 못 본 얼굴로 돌아선다.",
    enc_followed_pay: "돌아서서 사내의 손에 은화를 쥐여 준다. 사내는 은화를 세어 보고, 아무것도 못 본 얼굴로 돌아선다.",
    enc_followed_face: "돌아서서 사내를 똑바로 본다. 사내가 먼저 눈을 피한다. \"사람을 잘못 보았소.\" 그는 그 말만 남기고 사라진다.",
    enc_followed_beaten: "돌아서자마자 주먹이 날아든다. 골목 바닥에 나뒹군다. 사내는 침을 뱉고 사라진다. 다시 따라오지는 않을 것 같다.",
    enc_mourner_intro: "조합 마당 어귀에 상복 차림의 사람이 서서 장부 쪽을 오래 바라본다. 길에서 돌아오지 못한 호위의 식구라고, 조합 사람들이 수군댄다.",
    enc_mourner_silver: "은화 세 닢을 건넨다. 상복 입은 사람은 한참 은화를 내려다보다 고개를 숙인다. 창 너머에서 조합 서기가 그것을 보고 있다.",
    enc_mourner_listen: "곁에 서서 이야기를 듣는다. 이름은 장부에만 남았다고 한다. 장부의 이름 칸에 무엇이 적혔는지, 식구들은 읽을 줄 모른다고.",
    enc_deserter_intro: "덤불 속에서 앳된 사내가 튀어나와 무릎을 꿇는다. 무리에서 도망쳤다고, 강을 건너게만 해 달라고 한다. 손이 떨리고 있다.",
    enc_deserter_ask: "사내는 묻는 말에 다 대답한다. 진터에 모인 사람의 수, 쌓아 둔 식량, 언제 강을 건너려 하는지. 다 말하고 나서야 그는 덤불 속으로 사라진다.",
    enc_deserter_south: "변경 마을로 가는 숲길을 일러 준다. 원로를 찾아가 내 이야기를 하라고. 사내는 몇 번이나 고개를 숙인다. \"창을 들 줄은 압니다. 그 마을을 지키겠습니다.\"",
    enc_deserter_hand_over: "사내의 팔을 묶어 성읍으로 끌고 간다. 조합 서기가 은화 다섯 닢을 세어 내준다. 끌려가며 사내가 한 번 나를 돌아본다. 나도 장부에서 도망친 사람이다.",
    enc_storyteller_intro: "큰 시장 한쪽, 빈 술통 위에 이야기꾼이 서 있다. 동전 한 닢이면 어느 지방의 이야기든 해 준다고 외친다.",
    enc_storyteller_my_tale: "이야기꾼이 남쪽 변경의 수호자 이야기를 한다. 이름 없는 사내 하나가 칼 한 자루로 무리를 막았다고. 듣는 이들이 숨을 죽인다. 이야기 속의 사내는 나보다 키가 크고 훨씬 용감하다. 나는 모자를 눌러쓴다.",
    enc_storyteller_truth: "이야기꾼이 남쪽 변경의 도적 이야기를 한다. 도적들은 다 쓰러진 것이 아니라 흩어졌다고, 그걸 직접 본 사람이 있다고. 내가 성읍에 전한 그대로다. 말은 강을 건너 여기까지 왔다.",
    enc_storyteller_legend: "이야기꾼이 남쪽 변경의 도적 이야기를 한다. 마을 사람들이 도적 떼를 모두 베었다고. 듣는 이들이 손뼉을 친다. 내가 아는 것과는 다르다. 이야기는 강을 건너며 부풀었다.",
    enc_storyteller_fled: "이야기꾼이 목소리를 낮춘다. 징집을 피해 강을 건넌 이들은 돌아오지 않는다고. 강 남쪽은 이름을 버린 자들의 땅이라고. 이야기가 끝나자 누군가 나를 흘끔 본다.",
    end_died_title: "이름 없이 쓰러지다",
    end_died_body: "여기서 이 삶은 끝난다. 강 북쪽의 장부에도, 변경의 기억에도 이름은 남지 않는다. 그래도 길 위에 남긴 일은 남는다.",
    end_died_after_body: "이야기가 닫힌 뒤에도 나는 길 위에 있었다. 여기서 이 삶은 끝난다. 남긴 일은 남는다.",
    deed_ruins_found: "폐허의 비밀을 밝혔다",
    deed_ruins_found_desc: "폐허가 도적의 은신처라는 것을 제 눈으로 확인했다.",
    deed_bandits_gone: "갈림길을 다시 열었다",
    deed_bandits_gone_desc: "폐허의 도적단을 몰아내고 막힌 길을 열었다.",
    deed_leader_fell: "폐허의 두목을 베었다",
    deed_leader_fell_desc: "옆구리를 감싸던 사내가 내 칼 아래 쓰러졌다.",
    deed_spring: "샘을 되살렸다",
    deed_spring_desc: "흐려진 숲속 샘을 치우고 우물물을 맑혔다.",
    deed_honored: "마을의 감사를 받았다",
    deed_honored_desc: "원로가 마을의 이름으로 감사했다.",
    deed_herb_stock: "마을에 연고 일을 남겼다",
    deed_herb_stock_desc: "약초꾼이 마을에 남아 연고를 만든다.",
    deed_north: "다시 강을 건넜다",
    deed_north_desc: "도망쳐 온 강을 다시 건너 영주의 땅을 밟았다.",
    deed_royal: "왕도의 성문을 지났다",
    deed_royal_desc: "북쪽으로 닷새, 왕도에 닿았다.",
    deed_guard: "조합이 아는 호위",
    deed_guard_desc: "상단 조합의 장부에 이름 없는 호위로 올랐다.",
    deed_lead: "상단을 이끄는 자",
    deed_lead_desc: "상단 호위를 이끌 만한 솜씨를 인정받았다.",
    deed_warned: "불길을 먼저 알렸다",
    deed_warned_desc: "강 건너에서 모이는 무리를 알아내 변경에 알렸다.",
    deed_prepared: "마을의 대비를 도왔다",
    deed_prepared_desc: "다가오는 무리에 맞설 대비를 보탰다.",
    deed_stores: "무리의 식량에 불을 놓았다",
    deed_stores_desc: "숲 너머 무리의 식량 더미를 태웠다.",
    deed_band_broken: "갈림길에서 무리를 꺾었다",
    deed_band_broken_desc: "갈림길에 진을 친 무리를 이끄는 자를 쓰러뜨렸다.",
    deed_renown: "왕국이 아는 이름",
    deed_renown_desc: "왕도의 기록에 남쪽 변경의 수호자로 올랐다.",
    deed_deserter: "도망친 이를 살려 보냈다",
    deed_deserter_desc: "무리에서 도망친 젊은이에게 남쪽 길을 일러 주었다.",
    deed_mill: "멈춘 물레를 돌렸다",
    deed_mill_desc: "물에 뛰어들어 방앗간의 물레를 다시 돌렸다.",
    deed_slipped: "징집관의 그림자를 떨쳤다",
    deed_slipped_desc: "성읍 골목에서 나를 쫓던 이를 떨쳐 냈다.",
    end_name_title: "이름을 얻은 자",
    end_name_body: "갈림길의 이정표 아래, 무리를 이끌던 자가 쓰러졌다. 마을 사람들이 나를 부른다. 강 북쪽 장부의 이름이 아니라, 이 변경이 붙여 준 이름으로.",
    end_held_title: "스스로 선 변경",
    end_held_body: "무리가 내려온 밤, 변경은 스스로 문을 걸어 잠갔다. 창을 든 손들 가운데 내 손도 있었다. 아침이 오고, 마을은 아직 그 자리에 있다.",
    end_lord_title: "영주의 깃발 아래",
    end_lord_body: "영주의 깃발이 강을 건너왔고, 무리는 막아 냈다. 이제 이 마을에도 징집 장부가 올 것이다. 나는 또 한 번 떠날 채비를 한다.",
    end_fell_title: "무너진 밤",
    end_fell_body: "무리가 내려온 밤, 마을이 무너졌다. 나는 살아남았다. 살아남은 것이 그날 내가 할 수 있었던 일의 전부였다."
  }
};
