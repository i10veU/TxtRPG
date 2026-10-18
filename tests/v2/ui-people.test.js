// V2-Core-154 (D-132, docs/v2/text-rpg-success-analysis.md B): people greet me by what is between us and by the hour.
//   1. every talk with a person has greetings, each with words, the last always holding (no talk opens in silence)
//   2. the elder at midnight opens the door with a lamp; by day a stranger is stopped at the door; once he has told me
//      something he lets me in; the honoured are met with an outstretched hand
//   3. the herbalist knows me after I asked; the ferryman remembers the night he carried me across
//   4. greetings read only what the UI may (the engine's evaluator, the player's context): the same state gives the same
//      greeting, and nothing in the state changes
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";
import { greetingFor } from "../../web/v2/ui/people.js";

const T = worldData.texts;
const P = (actionId) => ({ type: "perform", actionId });
const C = (optionId) => ({ type: "choose", optionId });
const M = (to) => ({ type: "move", to });
const WAIT = (minutes) => ({ type: "wait", minutes });
const walk = (state, actions) => actions.reduce((s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some((e) => e.type === "action.rejected"), `accepted: ${JSON.stringify(a)}`);
  return r.state;
}, state);

// 1. every person's talk has its greetings
const talks = Object.values(worldData.actions).flatMap((a) => (a.effects ?? []).filter((e) => e.op === "choice").map((e) => e.choice));
const people = talks.filter((c) => /_dialogue$/.test(c));
assert.ok(people.length >= 6);
for (const choiceId of people) {
  const list = worldData.world.greetings[choiceId];
  assert.ok(Array.isArray(list) && list.length >= 2, `${choiceId} has greetings`);
  list.forEach((g) => assert.equal(typeof T[g.textId], "string", `greeting text ${g.textId}`));
  assert.deepEqual(list.at(-1).when, { op: "always" }, `${choiceId}: the last greeting always holds`);
}

// 2. the elder
let s = createInitialState({ worldSeed: "history-41", data: worldData }).state; // 1st day, 00:00
assert.equal(greetingFor("choice_elder_dialogue", s, worldData), T.greet_elder_night);
const byDay = walk(s, [WAIT(8 * 60)]);
assert.equal(greetingFor("choice_elder_dialogue", byDay, worldData), T.greet_elder_stranger);
const told = walk(byDay, [P("act_talk_elder"), C("opt_ask_ruins")]);
assert.equal(greetingFor("choice_elder_dialogue", told, worldData), T.greet_elder_known);
const honoured = structuredClone(told);
honoured.flags = { ...honoured.flags, village_honored: true };
assert.equal(greetingFor("choice_elder_dialogue", honoured, worldData), T.greet_elder_honored);

// 3. the herbalist and the ferryman
const atMarket = walk(byDay, [M("loc_market")]);
assert.equal(greetingFor("choice_herbalist_dialogue", atMarket, worldData), T.greet_herbalist_stranger);
const asked = walk(atMarket, [P("act_talk_herbalist"), C("opt_herbalist_ask_sickness")]);
assert.equal(greetingFor("choice_herbalist_dialogue", asked, worldData), T.greet_herbalist_known);
assert.match(greetingFor("choice_ferryman_dialogue", byDay, worldData), /그 밤/);

// 4. pure: the same state, the same greeting, the state untouched
const before = structuredClone(told);
assert.equal(greetingFor("choice_elder_dialogue", told, worldData), greetingFor("choice_elder_dialogue", told, worldData));
assert.deepEqual(told, before);
assert.equal(greetingFor("choice_fight_leader", told, worldData), null, "a fight has no greeting");

console.log("V2-Core-154 ui-people.test.js: all checks passed");
