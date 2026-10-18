// V2-Core-153 (D-131, docs/v2/text-rpg-success-analysis.md A): what a choice asks of me, before I make it.
//   1. checkOdds is the dice over every face, with the difficulty and modifiers `check` itself uses -- an oracle of the
//      sum of 2d10 against check()'s own difficulty and modifiers agrees for every check in the pack, and it never reads
//      the next roll (no rng in the state, same answer)
//   2. a choice tells its time, its sure costs, the check's name and chance; a cost in the name is not said twice; what I
//      have that makes it possible is marked (✓ 등불, ✓ 밤눈)
//   3. a choice I cannot take yet says what of mine is lacking (필요: …); when something not mine stands in the way
//      (a relation, a flag, what I have heard), nothing is said and a dialogue option stays hidden (null) -- D-06 kept
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { check, checkOdds } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";
import { stakesOf, needsOf, costsOf, oddsWord } from "../../web/v2/ui/stakes.js";

const P = (actionId) => ({ type: "perform", actionId });
const M = (to) => ({ type: "move", to });
const C = (optionId) => ({ type: "choose", optionId });
const walk = (state, actions) => actions.reduce((s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some((e) => e.type === "action.rejected"), `accepted: ${JSON.stringify(a)}`);
  return r.state;
}, state);
const start = (templateId) => createInitialState({ worldSeed: "history-41", data: worldData, templateId }).state;

// 1. the odds
const ways2d10 = Array.from({ length: 21 }, (_, s) => (s < 2 ? 0 : Math.min(s - 1, 21 - s)));
const specs = [
  ...Object.values(worldData.actions).filter((a) => a.check).map((a) => a.check),
  ...Object.values(worldData.choices).flatMap((c) => c.options).filter((o) => o.check).map((o) => o.check)
];
assert.ok(specs.length >= 10, "the pack has checks to read");
let s = walk(start(), [P("act_talk_elder"), C("opt_ask_ruins"), M("loc_market"), P("act_buy_lantern")]);
for (const spec of specs) {
  const ctx = { state: s, data: worldData, actorId: s.player.actorId };
  const { result } = check(spec, ctx);
  const modsum = result.modifiers.reduce((sum, m) => sum + m.value, 0);
  const at = (threshold) => ways2d10.reduce((sum, w, roll) => (roll + modsum - result.difficulty >= threshold ? sum + w : sum), 0) / 100;
  const odds = checkOdds(spec, ctx);
  assert.equal(odds.difficulty, result.difficulty);
  assert.equal(odds.modifier, modsum);
  assert.deepEqual(odds.chance, { great: at(6), success: at(0), partial: at(-3) });
  // the future roll is not read
  const { rng, ...noRng } = s;
  assert.deepEqual(checkOdds(spec, { ...ctx, state: noRng }), odds);
}
assert.deepEqual(oddsWord(0.96), { band: "sure", text: "확실함" });
assert.deepEqual(oddsWord(0.5), { band: "even", text: "반반" });
assert.deepEqual(oddsWord(0.1), { band: "desperate", text: "무모함" });

// 2. what a choice asks
const A = worldData.actions;
s = walk(s, [M("loc_village"), M("loc_ruins")]);
const investigate = stakesOf(A.act_investigate_ruins, s, worldData);
assert.match(investigate.note, /^✓ 낡은 등불 · 1시간 · 조사 \d+% · /);
assert.ok(investigate.risk);
assert.match(investigate.title, /해낼 가능성 \d+%/);
assert.deepEqual(costsOf(A.act_buy_lantern, worldData), ["은화 5"]);
assert.deepEqual(costsOf(A.act_gather_herbs, worldData), ["기력 2"], "the stamina every outcome spends");
const teach = worldData.choices.choice_herbalist_dialogue.options.find((o) => o.id === "opt_herbalist_teach");
assert.deepEqual(costsOf(teach, worldData), [], "a price already in the words is not said again");
const scout = walk(start("start_scout"), [P("act_talk_elder"), C("opt_ask_ruins"), M("loc_ruins")]);
assert.match(stakesOf(A.act_investigate_ruins, scout, worldData).note, /^✓ 밤눈 · /);

// 3. what I lack, and what is not mine to be told
const confront = stakesOf(A.act_confront_leader, start(), worldData);
assert.equal(confront.locked, true);
assert.equal(confront.note, `필요: ${worldData.items.item_relic.name} · ${worldData.texts.lbl_unlock_unl_keen_eye}`);
const fresh = start();
const brew = worldData.choices.choice_herbalist_dialogue.options.find((o) => o.id === "opt_herbalist_brew");
assert.equal(stakesOf(brew, fresh, worldData).note, `필요: ${worldData.items.item_purifying_herb.name} 2`);
// behind a relation (consulted) the option says nothing
assert.equal(stakesOf(teach, fresh, worldData), null);
const report = worldData.choices.choice_herbalist_dialogue.options.find((o) => o.id === "opt_herbalist_report_spring");
assert.equal(stakesOf(report, fresh, worldData), null);
// a requirement on what I have heard is not told either
assert.equal(needsOf({ op: "rumor", rumor: "rum_ruins_secret" }, fresh, worldData).hidden, true);
assert.deepEqual(needsOf({ op: "or", of: [{ op: "item", item: "item_lantern", min: 1 }, { op: "trait", trait: "night_vision" }] }, fresh, worldData).needs,
  [{ text: `${worldData.items.item_lantern.name} 또는 ${worldData.texts.lbl_trait_night_vision}`, met: false }]);

console.log("V2-Core-153 ui-stakes.test.js: all checks passed");
