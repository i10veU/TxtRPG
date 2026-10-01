// V2-Core-42 (Issue #115): the "immutability" row of CORE_CONTRACTS §13.2 -- "동결된 입력으로 step, view,
// check를 호출해도 예외가 없고, 입력은 호출 전과 deepEqual이다". Other tests show view() and check() leave
// their input deepEqual, which an implementation that writes and then restores would still pass; here
// state and data are frozen recursively (§13.1), so any write throws (ES modules are strict). Every state
// of the golden sequence (tests/v2/fixtures/golden-path.json: every action type, checks, events, growth,
// death and succession) and the real pack's start are used. Nothing in the engine changes.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialState, step, view } from "../../web/v2/core/engine.js";
import { check } from "../../web/v2/core/rules.js";
import { worldData } from "../../web/v2/data/world.js";

const fixture = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "golden-path.json"), "utf8"));

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}
const frozenCopy = (value) => deepFreeze(structuredClone(value));

// every check spec the data defines (actions and events), with the target an action of that id uses
function checkSpecs(data, actions) {
  const targetOf = (actionId) => actions.find((a) => a?.actionId === actionId)?.targetId;
  return [
    ...Object.entries(data.actions ?? {}).filter(([, a]) => a.check).map(([id, a]) => [a.check, targetOf(id)]),
    ...Object.values(data.events ?? {}).filter((e) => e.check).map((e) => [e.check, undefined])
  ];
}

// step, view and check on frozen state and data: no exception, the inputs unchanged, and step gives
// what the unfrozen inputs give
function assertFrozenCalls(label, state, action, data, specs) {
  const frozenState = frozenCopy(state);
  const frozenData = frozenCopy(data);
  const stateBefore = structuredClone(frozenState);
  const dataBefore = structuredClone(frozenData);

  if (action !== undefined) {
    assert.deepStrictEqual(step(frozenState, action, frozenData), step(structuredClone(state), action, data), `${label}: step`);
  }
  assert.deepStrictEqual(view(frozenState, frozenData), view(structuredClone(state), data), `${label}: view`);
  if (frozenState.player) {
    for (const [spec, targetId] of specs) {
      const ctx = deepFreeze({ state: frozenState, data: frozenData, actorId: frozenState.player.actorId, targetId });
      check(frozenCopy(spec), ctx);
    }
  }
  assert.deepStrictEqual(frozenState, stateBefore, `${label}: state`);
  assert.deepStrictEqual(frozenData, dataBefore, `${label}: data`);
}

// 1. every state of the golden sequence, with the action that follows it
function testGoldenSequence() {
  const specs = checkSpecs(fixture.data, fixture.actions);
  assert.strictEqual(specs.length, 3, "the fixture's check specs (incl. opposed and an event's)");
  let state = createInitialState({ worldSeed: fixture.worldSeed, data: fixture.data }).state;
  fixture.actions.forEach((action, i) => {
    assertFrozenCalls(`before action ${i} ${JSON.stringify(action)}`, state, action, fixture.data, specs);
    state = step(state, action, fixture.data).state;
  });
  assertFrozenCalls("final state", state, undefined, fixture.data, specs);
}

// 2. the real pack's start, with every action it defines
function testRealPack() {
  const specs = checkSpecs(worldData, []);
  assert.ok(specs.length > 0, "the real pack has checks");
  const state = createInitialState({ worldSeed: "immutability-real", data: worldData }).state;
  for (const actionId of Object.keys(worldData.actions)) {
    assertFrozenCalls(`real pack ${actionId}`, state, { type: "perform", actionId }, worldData, specs);
  }
}

testGoldenSequence();
testRealPack();

console.log("V2-Core-42 immutability.test.js: all checks passed");
