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
    // V2-Core-72 (#180): the first time anyone walks the reopened road (narration, once for the world)
    evt_crossroads_first: {
      trigger: { op: "location", at: "loc_crossroads" },
      once: true,
      effects: [say("txt_crossroads_first")]
    },
    // V2-Core-69 (#170): the purification becomes history -- 1 on the purification's step, then +1 at
    // the first step a full day later, until 3 (as evt_bandits_tale)
    evt_well_tale: {
      trigger: { op: "and", of: [WELL_RESOLVED, { op: "signal", key: "well_tale_age", max: 2 }] },
      cooldown: 1440,
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
      links: [{ to: "loc_village", minutes: 45 }]
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
        { op: "hp", add: 4 },
        // V2-Core-56 (D-85): the rest refills stamina (the only way back; no regeneration over time)
        { op: "resource", resource: "stamina", add: 6 },
        { op: "narrate", textId: "txt_rest_village" }
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
            { op: "if", when: { op: "and", of: [{ op: "flag", key: "village_honored" }, { op: "not", of: VILLAGE_TRUSTED }] }, then: [say("txt_small_talk_honored_memory")] }
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
                }
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
                    { op: "if", when: { op: "flag", key: "well_tale_corrected" }, then: [say("txt_herbalist_well_corrected")], else: [say("txt_herbalist_sickness_passed")] }
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
        { id: "combat", max: 100, thresholds: rankUps("swordsmanship") },
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
      traits: [{ id: "night_vision" }, { id: "investigation_talent", practice: { investigation: 2 } }],
      // V2-Core-53 (D-82): Mastery is a label over the skill rank, for display and classification
      // only -- read by the UI, never by the engine (no state, no modifier). English names, so they
      // never read as the UI's "숙련도" (the practice)
      masteryTiers: [
        { minRank: 0, label: "Untrained" },
        { minRank: 1, label: "Novice" },
        { minRank: 3, label: "Apprentice" },
        { minRank: 5, label: "Adept" }
      ],
      unlocks: [{ id: "unl_keen_eye", kind: "action" }],
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
    // V2-Core-65 (#160): what the spring's remedy is made of, and the remedy
    item_purifying_herb: { name: "정화초" },
    item_spring_remedy: { name: "샘 정화제" },
    // V2-Core-70 (#170): the herbalist's salve (+5 HP)
    item_herbal_salve: { name: "약초 연고" }
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
    fact_bandit_toll: {}
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
    rum_bandit_toll: { factId: "fact_bandit_toll", claim: "abandoned" }
  },

  // Relation-edge/rumor-source IDs (§7.1/§8.3). An entry without `actor` is
  // inert authored metadata (validateData checks its key format, D-56); one
  // with `actor` is also seeded as `state.actors[id]` by createInitialState
  // (D-77, V2-Core-47). A full NPC scheduler is still out of scope (Issue #74).
  npcs: {
    npc_elder: { name: "마을 원로" },
    // V2-Core-64 (#160): dialogue only (no actor: a new actor would not be in a 0.3.0 save)
    npc_herbalist: { name: "약초꾼" },
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
    org_village: { name: "변경 마을 사람들" }
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
    txt_search_crossroads_fail: "갈림길에는 오래된 바퀴 자국과 짐승 발자국뿐이다."
  }
};
