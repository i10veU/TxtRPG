// V2-Core-52 (Issue #137, Skill Decision = A, D-81): practice grows skills, and checks read skills.
//   Practice/Proficiency (how much one has practised) -> thresholds -> Skill rank (what one can do)
//   -> the check's skill bonus (§5.4: rank x checkBonusPerRank). No check names a proficiency and
//   no proficiency has a `checkStep`, so the same practice is never counted twice.
// Skills: `swordsmanship` (grown by the combat practice) and `investigation` (by the investigation
// practice), max rank 5, +1 per rank, a rank at every 20 practice points -- for any character the rank
// is floor(points / 20), the bonus the practice itself used to give, so every check keeps its
// numbers. Data only (and one status line in the UI). No version bump (a missing rank is rank 0).
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });
const SYSTEM = worldData.growthSystems.growth_wanderer;
const READY = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_rest_village"), MOVE("loc_ruins")
];

function run(state, actions) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, worldData);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (seed = "history-41") => createInitialState({ worldSeed: seed, data: worldData }).state;
const growth = (state) => state.actors.player_1.growth.growth_wanderer;
const points = (state, id) => growth(state).proficiency?.[id] ?? 0;
const rank = (state, id) => growth(state).skills?.[id] ?? 0;
const checksOf = (log) => log.flatMap((r) => r.events.filter((e) => e.type === "check.resolved").map((e) => e.data));
const practiceSources = (check) => check.modifiers.filter((m) => m.source.startsWith("proficiency:") || m.source.startsWith("skill:"));

// every check spec in the pack
function checkSpecs() {
  const specs = [];
  for (const [id, action] of Object.entries(worldData.actions)) if (action.check) specs.push([id, action.check]);
  for (const [id, choice] of Object.entries(worldData.choices)) for (const o of choice.options) if (o.check) specs.push([`${id}.${o.id}`, o.check]);
  return specs;
}

// 1. the schema: two skills; the practices have thresholds and no checkStep
function testSchema() {
  assert.deepStrictEqual(SYSTEM.skills, [
    { id: "swordsmanship", maxRank: 5, checkBonusPerRank: 1 },
    { id: "investigation", maxRank: 5, checkBonusPerRank: 1 }
  ]);
  const byId = Object.fromEntries(SYSTEM.proficiencies.map((p) => [p.id, p]));
  assert.deepStrictEqual(Object.keys(byId), ["investigation", "combat"]);
  for (const p of SYSTEM.proficiencies) assert.ok(!("checkStep" in p), `${p.id}: no checkStep -- practice is not a bonus by itself`);
  const rankUps = (p, skill) => p.thresholds.filter((t) => t.effects.some((e) => e.op === "skill" && e.skill === skill && e.add === 1)).map((t) => t.at);
  assert.deepStrictEqual(rankUps(byId.investigation, "investigation"), [20, 40, 60, 80, 100]);
  assert.deepStrictEqual(rankUps(byId.combat, "swordsmanship"), [20, 40, 60, 80, 100]);
  assert.ok(byId.investigation.thresholds.some((t) => t.at === 50 && t.effects.some((e) => e.op === "unlock" && e.id === "unl_keen_eye")), "the keen eye stays");
}

// 2. checks read skills, never a proficiency
function testChecksReadSkills() {
  const named = Object.fromEntries(checkSpecs().map(([where, spec]) => [where, [spec.skill ?? null, spec.proficiency ?? null]]));
  assert.deepStrictEqual(named, {
    act_investigate_ruins: ["investigation", null],
    act_confront_leader: [null, null],
    "choice_fight_leader.opt_fight_strike": ["swordsmanship", null],
    "choice_fight_leader.opt_fight_counter": ["swordsmanship", null],
    "choice_fight_leader.opt_fight_weak_spot": ["swordsmanship", null] // V2-Core-55
  });
}

// 3. practice raises ranks at its thresholds
function testPracticeRaisesRanks() {
  const observed = run(start(), [P("act_observe_village")]);
  assert.deepStrictEqual([points(observed.state, "investigation"), rank(observed.state, "investigation")], [15, 0]);
  const twice = run(observed.state, [P("act_observe_village")]);
  assert.deepStrictEqual([points(twice.state, "investigation"), rank(twice.state, "investigation")], [30, 1]);
  const rankEvent = twice.log[0].events.find((e) => e.type === "skill.changed");
  assert.deepStrictEqual([rankEvent.actorId, rankEvent.visibility, rankEvent.data.skill], ["player_1", "player", "investigation"]);
  // the successful investigation on this seed: +30 -> 60: ranks at 40 and 60, the keen eye at 50
  const searched = run(start(), READY.slice(0, 9)).state;
  assert.deepStrictEqual([points(searched, "investigation"), rank(searched, "investigation")], [60, 3]);
  assert.strictEqual(growth(searched).unlocks.unl_keen_eye, true);
}

// 4. no double counting: the practice itself gives nothing, the rank gives its bonus
function testNoDoubleCounting() {
  const atRuins = run(start(), READY.slice(2, 8)).state; // the rumor, a lantern, the ruins: no practice yet
  const investigateWith = (practice, skillRank) => {
    const s = structuredClone(atRuins);
    growth(s).proficiency = { investigation: practice };
    growth(s).skills = skillRank ? { investigation: skillRank } : {};
    const check = checksOf([step(s, P("act_investigate_ruins"), worldData)])[0];
    return practiceSources(check);
  };
  assert.deepStrictEqual(investigateWith(100, 0), [], "practice without a rank: no bonus");
  assert.deepStrictEqual(investigateWith(0, 3), [{ source: "skill:investigation", value: 3 }], "a rank without practice: its bonus");
  assert.deepStrictEqual(investigateWith(60, 3), [{ source: "skill:investigation", value: 3 }], "both: the rank's bonus once");

  // over real play (investigations and fights on many seeds) no check ever reads a proficiency, and
  // a new character's rank always equals floor(points / 20) -- the bonus the practice used to give
  let checks = 0;
  for (let i = 0; i < 40; i += 1) {
    let { state, log } = run(start(`history-${i}`), READY);
    for (const r of log) {
      assert.strictEqual(rank(r.state, "investigation"), Math.floor(points(r.state, "investigation") / 20));
    }
    if (state.actors.player_1.alive && state.actors.player_1.inventory.item_relic) {
      let fight = step(state, P("act_fight_leader"), worldData);
      log = [...log, fight];
      state = fight.state;
      for (let n = 0; n < 12 && state.pending?.choiceId === "choice_fight_leader"; n += 1) {
        fight = step(state, CHOOSE("opt_fight_strike"), worldData);
        log.push(fight);
        state = fight.state;
        assert.strictEqual(rank(state, "swordsmanship"), Math.floor(points(state, "combat") / 20));
      }
    }
    for (const check of checksOf(log)) {
      checks += 1;
      assert.ok(check.modifiers.every((m) => !m.source.startsWith("proficiency:")), "never a proficiency bonus");
    }
  }
  assert.ok(checks > 40);
}

// 5. a swordsmanship rank is the fight's bonus
function testSwordsmanshipInTheFight() {
  const ready = run(start("history-0"), READY).state;
  const fighting = step(ready, P("act_fight_leader"), worldData).state;
  const strikeWith = (skillRank) => {
    const s = structuredClone(fighting);
    growth(s).skills = { ...growth(s).skills, swordsmanship: skillRank };
    return checksOf([step(s, CHOOSE("opt_fight_strike"), worldData)])[0];
  };
  assert.deepStrictEqual(practiceSources(strikeWith(0)).filter((m) => m.source === "skill:swordsmanship"), []);
  assert.deepStrictEqual(practiceSources(strikeWith(2)).filter((m) => m.source === "skill:swordsmanship"), [{ source: "skill:swordsmanship", value: 2 }]);
  assert.strictEqual(strikeWith(2).margin - strikeWith(0).margin, 2, "the same roll, +2");
}

// 6. a 0.3.0 save made before this change (practice already past thresholds, no skills) is still
// compatible (no version bump): its rank starts at 0 and only later thresholds raise it (thresholds
// fire on crossing, D-42) -- the decided consequence of not bumping, pinned here
function testOldSave() {
  const s = run(start(), READY.slice(0, 9)).state;
  const old = structuredClone(s);
  delete growth(old).skills;
  assert.strictEqual(points(old, "investigation"), 60);
  assert.deepStrictEqual(checkDataCompatibility(old, worldData), []);
  assert.strictEqual(rank(old, "investigation"), 0);
  // two more observations: 60 -> 90 crosses 80 only: one rank
  const later = run(old, [MOVE("loc_village"), P("act_observe_village"), P("act_observe_village")]).state;
  assert.deepStrictEqual([points(later, "investigation"), rank(later, "investigation")], [90, 1]);
}

assert.deepStrictEqual(validateData(worldData), []);
testSchema();
testChecksReadSkills();
testPracticeRaisesRanks();
testNoDoubleCounting();
testSwordsmanshipInTheFight();
testOldSave();

console.log("V2-Core-52 data-world-skills.test.js: all checks passed");
