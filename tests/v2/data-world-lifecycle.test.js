// V2-Core-25 tests: the real world data pack (web/v2/data/world.js) now
// exercises time cost (Resolvable `minutes`), `location`-gated actions,
// a `data.events` trigger, the `hp` Effect's death trigger, the
// `newCharacter` gate, and `rules.succession` (Issue #80). Every mechanic
// used here already existed and was contract-tested with synthetic fixtures
// in core.test.js/effects.test.js -- this file only proves the real pack is
// wired to them. `.test.js`, not `.spec.js`: tests/v2/run.js excludes
// `*.spec.js`. node:assert/strict only (§13.1).
//
// DEVELOPMENT_RULES §17: like data-world.test.js, this is one of the few
// files allowed to import the real content pack.

import assert from "node:assert/strict";
import { createInitialState, step, view, validateState } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const SEED = "lifecycle-seed";

function fresh(seed = SEED) {
  return createInitialState({ worldSeed: seed, data: worldData }).state;
}

// applies one action and returns the full { state, events } result
function apply(state, action) {
  return step(state, action, worldData);
}

function types(events) {
  return events.map((e) => e.type);
}

function actionEntry(state, actionId) {
  return view(state, worldData).actions.find((a) => a.actionId === actionId);
}

// village -> market (buy lantern) -> village -> ruins: arrival at the ruins
// fires the hazard once (hp 10 -> 6). Returns the state right after arrival.
function walkToRuins(state) {
  state = apply(state, { type: "move", to: "loc_market" }).state;
  state = apply(state, { type: "perform", actionId: "act_buy_lantern" }).state;
  state = apply(state, { type: "move", to: "loc_village" }).state;
  return apply(state, { type: "move", to: "loc_ruins" });
}

// 1. the extended pack still validates and actually contains the new wiring
function testDataShape() {
  assert.deepStrictEqual(validateData(worldData), []);
  // the ruins hazard (V2-Core-25), since V2-Core-33 the later market event, and since V2-Core-45 the
  // dispersal's history clock; since V2-Core-64 the forest spring's miasma, since V2-Core-66 the clear well, since
  // V2-Core-69 the spring's history clock, since V2-Core-72 the reopened road's first walker
  assert.deepStrictEqual(Object.keys(worldData.events), ["evt_bandits_tale", "evt_market_reopens", "evt_crossroads_first", "evt_well_tale", "evt_well_clears", "evt_spring_miasma", "evt_ruins_hazard"]);
  assert.ok(Array.isArray(worldData.rules.succession) && worldData.rules.succession.length > 0);
  assert.ok(worldData.actions.act_investigate_ruins.minutes > 0);
  assert.strictEqual(worldData.actions.act_talk_elder.requires.op, "location");
}

testDataShape();

// 2. time cost: actions with `minutes` advance state.time.minute through the
// ordinary Resolvable path (§2.3); actions without it still do not
function testTimeAdvancement() {
  let state = fresh("frontier-canonical-4");
  assert.strictEqual(state.time.minute, 0);

  const observe = apply(state, { type: "perform", actionId: "act_observe_village" });
  assert.strictEqual(observe.state.time.minute, 0, "an action without `minutes` must not advance time");
  assert.ok(!types(observe.events).includes("time.advanced"));

  // same canonical path as data-world.test.js (V2-Core-29/30: every action
  // happens where it belongs, and the elder's rumor comes before the ruins):
  // still a valid playthrough
  const path = [
    { type: "perform", actionId: "act_observe_village" },
    { type: "perform", actionId: "act_observe_village" },
    { type: "perform", actionId: "act_talk_elder" },
    { type: "choose", optionId: "opt_ask_ruins" },
    { type: "move", to: "loc_market" },
    { type: "perform", actionId: "act_buy_lantern" },
    { type: "move", to: "loc_village" },
    { type: "move", to: "loc_ruins" },
    { type: "perform", actionId: "act_investigate_ruins" },
    { type: "move", to: "loc_village" },
    { type: "perform", actionId: "act_rest_village" },
    { type: "perform", actionId: "act_confront_leader" }
  ];
  const log = [];
  for (const action of path) {
    const r = apply(state, action);
    log.push({ action, r });
    state = r.state;
  }
  const stepOf = (actionId) => log.find((l) => l.action.actionId === actionId).r;

  const investigate = stepOf("act_investigate_ruins");
  assert.deepStrictEqual(investigate.events.find((e) => e.type === "time.advanced").data, { minutes: 60 });

  const rest = stepOf("act_rest_village");
  assert.deepStrictEqual(rest.events.find((e) => e.type === "time.advanced").data, { minutes: 60 });

  const confront = stepOf("act_confront_leader");
  assert.deepStrictEqual(confront.events.find((e) => e.type === "time.advanced").data, { minutes: 30 });

  // 15 + 15 (market and back) + 45 (to the ruins) + 60 (investigate) + 45 (back)
  // + 60 (rest) + 30 (confront) = 270
  assert.strictEqual(state.time.minute, 270);

  // fewer than 1440 minutes elapsed, so no day boundary was crossed
  assert.ok(log.every(({ r }) => !types(r.events).includes("day.started")));
  assert.deepStrictEqual(validateState(state), []);
}

testTimeAdvancement();

// 3. location gating via the existing `location` Condition (D-15/D-48)
function testLocationGating() {
  let state = fresh();

  // in the village both village activities are offered and executable
  assert.deepStrictEqual(actionEntry(state, "act_observe_village"), { actionId: "act_observe_village", available: true });
  assert.deepStrictEqual(actionEntry(state, "act_talk_elder"), { actionId: "act_talk_elder", available: true });

  state = apply(state, { type: "move", to: "loc_market" }).state;
  assert.strictEqual(state.actors.player_1.locationId, "loc_market");
  assert.strictEqual(state.time.minute, 15, "link `minutes` still advances time");

  // no showWhenLocked -> not listed at all; showWhenLocked:true -> listed as
  // unavailable, and the entry carries no reason field (D-06/D-15)
  assert.strictEqual(actionEntry(state, "act_observe_village"), undefined);
  assert.deepStrictEqual(actionEntry(state, "act_talk_elder"), { actionId: "act_talk_elder", available: false });
  assert.deepStrictEqual(Object.keys(actionEntry(state, "act_talk_elder")).sort(), ["actionId", "available"]);

  // the existing reject semantics: state untouched, requirements_not_met
  for (const actionId of ["act_talk_elder", "act_observe_village"]) {
    const rejected = apply(state, { type: "perform", actionId });
    assert.deepStrictEqual(rejected.state, state);
    assert.deepStrictEqual(rejected.events.map((e) => [e.type, e.data.code]), [["action.rejected", "requirements_not_met"]]);
  }

  // the market's own action (location-gated to the market since V2-Core-29) is
  // offered here
  assert.strictEqual(actionEntry(state, "act_buy_lantern").available, true);

  // back in the village they are offered/executable again
  state = apply(state, { type: "move", to: "loc_village" }).state;
  assert.deepStrictEqual(actionEntry(state, "act_talk_elder"), { actionId: "act_talk_elder", available: true });
  const talked = apply(state, { type: "perform", actionId: "act_talk_elder" });
  assert.deepStrictEqual(types(talked.events), ["choice.offered", "action.resolved"]);
}

testLocationGating();

// 4. event execution + HP decrease + death, all through the real pipeline
function testEventHpAndDeath() {
  const arrival = walkToRuins(fresh());
  let state = arrival.state;

  // §2.5 stage 10: the trigger runs after the move and fires exactly once
  assert.deepStrictEqual(types(arrival.events), [
    "actor.moved",
    "time.advanced",
    "hp.changed",
    "narration",
    "trigger.fired",
    "action.resolved"
  ]);
  assert.deepStrictEqual(arrival.events.find((e) => e.type === "hp.changed").data, { delta: -4 });
  assert.strictEqual(arrival.events.find((e) => e.type === "trigger.fired").visibility, "internal");
  assert.strictEqual(state.actors.player_1.hp.current, 6);
  assert.deepStrictEqual(state.fired.evt_ruins_hazard, { count: 1, lastMinute: 75 });

  // cooldown 30: 29 minutes later it must NOT fire, 1 more minute later it does
  const early = apply(state, { type: "wait", minutes: 29 });
  assert.ok(!types(early.events).includes("trigger.fired"));
  assert.strictEqual(early.state.actors.player_1.hp.current, 6);
  const second = apply(early.state, { type: "wait", minutes: 1 });
  assert.ok(types(second.events).includes("trigger.fired"));
  assert.strictEqual(second.state.actors.player_1.hp.current, 2);
  assert.deepStrictEqual(second.state.fired.evt_ruins_hazard, { count: 2, lastMinute: 105 });

  // third hit: hp clamps at 0 (delta -2, not -4) -> death trigger (D-34)
  const death = apply(second.state, { type: "wait", minutes: 30 });
  assert.deepStrictEqual(death.events.find((e) => e.type === "hp.changed").data, { delta: -2 });
  assert.ok(types(death.events).includes("actor.died"));
  assert.deepStrictEqual(death.state.pending, { kind: "newCharacter" });
  assert.strictEqual(death.state.actors.player_1.alive, false);
  assert.strictEqual(death.state.actors.player_1.hp.current, 0);
  assert.deepStrictEqual(validateState(death.state), []);

  // §9: while pending, everything except startCharacter is rejected
  const performWhilePending = apply(death.state, { type: "perform", actionId: "act_observe_village" });
  assert.deepStrictEqual(performWhilePending.state, death.state);
  assert.strictEqual(performWhilePending.events[0].data.code, "pending_new_character");
  const waitWhilePending = apply(death.state, { type: "wait", minutes: 30 });
  assert.strictEqual(waitWhilePending.events[0].data.code, "pending_new_character");
  const moveWhilePending = apply(death.state, { type: "move", to: "loc_village" });
  assert.strictEqual(moveWhilePending.events[0].data.code, "pending_new_character");

  return death.state;
}

const deadState = testEventHpAndDeath();

// 5. newCharacter + succession: the new character comes from the template,
// rules.succession runs with the NEW character as subject, the world persists
function testNewCharacterAndSuccession() {
  const unknown = apply(deadState, { type: "startCharacter", templateId: "tmpl_does_not_exist" });
  assert.deepStrictEqual(unknown.state, deadState);
  assert.strictEqual(unknown.events[0].data.code, "unknown_action");

  const started = apply(deadState, { type: "startCharacter", templateId: "start_wanderer" });
  const state = started.state;

  assert.deepStrictEqual(types(started.events), ["character.started", "money.changed", "narration", "action.resolved"]);
  assert.deepStrictEqual(started.events.find((e) => e.type === "character.started").data, { actorId: "player_2" });
  assert.deepStrictEqual(state.player, { actorId: "player_2", characterCount: 2 });
  assert.strictEqual(state.pending, null);

  // fresh actor from the template (hp full, template money) plus the
  // succession stipend -- applied to player_2, not to the dead player_1
  const next = state.actors.player_2;
  assert.strictEqual(next.alive, true);
  assert.deepStrictEqual(next.hp, { current: 10, max: 10 });
  assert.strictEqual(next.locationId, "loc_village");
  assert.strictEqual(next.money, 8 + 3);
  assert.deepStrictEqual(next.inventory, {});
  assert.strictEqual(state.actors.player_1.money, deadState.actors.player_1.money);

  // §9 "세계는 유지된다": the dead character's record, time and fired state stay
  assert.deepStrictEqual(state.actors.player_1, deadState.actors.player_1);
  assert.strictEqual(state.time.minute, deadState.time.minute);
  assert.deepStrictEqual(state.fired, deadState.fired);
  assert.deepStrictEqual(validateState(state), []);

  // the hazard is location-bound to the current player: a new character in
  // the village must not be hit by the dead one's location
  assert.strictEqual(state.fired.evt_ruins_hazard.count, 3);

  // and play continues normally
  assert.deepStrictEqual(actionEntry(state, "act_observe_village"), { actionId: "act_observe_village", available: true });
  assert.ok(view(state, worldData).actor.hp.current === 10);
  assert.strictEqual(apply(state, { type: "perform", actionId: "act_observe_village" }).events.some((e) => e.type === "action.rejected"), false);
}

testNewCharacterAndSuccession();

// 6. save/load regression on the two new states (pending newCharacter, and
// after the new character started): lossless, valid, and the next action
// gives identical results from the original and the reloaded state
function testSaveLoadOfLifecycleStates() {
  const record = buildSaveRecord("slot_dead", deadState, { savedAt: 1 });
  const reloaded = parseLoadedRecord(JSON.parse(JSON.stringify(record)));
  assert.deepStrictEqual(reloaded, deadState);
  assert.deepStrictEqual(reloaded.pending, { kind: "newCharacter" });
  assert.deepStrictEqual(validateState(reloaded), []);

  const action = { type: "startCharacter", templateId: "start_wanderer" };
  const fromOriginal = apply(deadState, action);
  const fromReloaded = apply(reloaded, action);
  assert.deepStrictEqual(fromOriginal, fromReloaded);

  const afterRecord = buildSaveRecord("slot_alive", fromOriginal.state, { savedAt: 2 });
  assert.deepStrictEqual(parseLoadedRecord(JSON.parse(JSON.stringify(afterRecord))), fromOriginal.state);
}

testSaveLoadOfLifecycleStates();

// 7. determinism: same seed + same actions -> byte-identical state/events
function testDeterministicLifecycleReplay() {
  const run = () => {
    const arrival = walkToRuins(fresh());
    let state = arrival.state;
    const events = [...arrival.events];
    for (const minutes of [30, 30]) {
      const r = apply(state, { type: "wait", minutes });
      state = r.state;
      events.push(...r.events);
    }
    const started = apply(state, { type: "startCharacter", templateId: "start_wanderer" });
    return { state: started.state, events: [...events, ...started.events] };
  };
  assert.deepStrictEqual(run(), run());
}

testDeterministicLifecycleReplay();

console.log("V2-Core-25 data-world-lifecycle.test.js: all checks passed");
