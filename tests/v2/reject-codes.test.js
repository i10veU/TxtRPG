// V2-Core-41 (Issue #113): the "invalid action" row of CORE_CONTRACTS §13.2 -- "9개 reason code 각각에서
// state가 입력과 deepEqual이고, rng, time이 변하지 않으며, 이벤트는 `action.rejected` 1개다" -- checked for
// EVERY code and every path that produces it (the step() gate and target lookups of §2.5/D-48), with
// state and data frozen (§13.1). §2.6 fixes the list of codes and the event shape
// `{ type: "action.rejected", visibility: "player", data: { code, detail? } }`; `requirements_not_met`
// must not say which condition failed (§8.4, D-06). The engine's own codes are compared with the
// contract's list, so a new code cannot appear without a contract change. Nothing in the engine changes.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1); abstract-ID synthetic fixture (DEVELOPMENT_RULES §17).

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialState, step } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// §2.6: "reason code 고정 목록"
const CONTRACT_CODES = [
  "invalid_action", "unknown_action", "unknown_option", "unknown_location", "requirements_not_met",
  "pending_choice", "pending_new_character", "actor_dead", "no_pending_choice"
];

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const data = deepFreeze({
  formatVersion: 1,
  id: "reject_pack",
  version: "1.0.0",
  world: { id: "reject_world", growthSystemId: "growth_a", startTemplateId: "tmpl_start" },
  rules: { check: {}, succession: [] },
  characterTemplates: { tmpl_start: { kind: "player", locationId: "loc_start", hp: { max: 5 }, money: 3, inventory: {}, growth: {}, tags: [] } },
  locations: {
    loc_start: {
      links: [
        { to: "loc_market", minutes: 10 },
        { to: "loc_vault", minutes: 10, requires: { op: "never" } },
        { to: "loc_shrine", minutes: 10 }
      ]
    },
    loc_market: { links: [{ to: "loc_start", minutes: 10 }] },
    loc_vault: {},
    loc_shrine: { requires: { op: "never" } },
    loc_island: {}
  },
  actions: {
    act_rest: { effects: [{ op: "money", add: 1 }] },
    act_gated: { requires: { op: "never" }, effects: [{ op: "money", add: 1 }] },
    act_offer: { effects: [{ op: "choice", choice: "choice_a", sourceId: "act_offer" }] },
    act_hurt: { effects: [{ op: "hp", add: -99 }] }
  },
  choices: { choice_a: { options: [{ id: "opt_ok", effects: [{ op: "money", add: 1 }] }, { id: "opt_gated", requires: { op: "never" }, effects: [] }] } }
});
const withoutChoices = deepFreeze({ ...data, choices: {} }); // a pending choice whose definition is gone

// every input sits at minute 30, so "the event's minute is the input time" is not trivially 0
const fresh = step(createInitialState({ worldSeed: "reject-seed", data }).state, { type: "wait", minutes: 30 }, data).state;
const offering = step(fresh, { type: "perform", actionId: "act_offer" }, data).state; // a choice is pending
const dead = step(fresh, { type: "perform", actionId: "act_hurt" }, data).state; // dead, a new character is pending
const withPlayer = (state, actor) => ({ ...structuredClone(state), actors: actor === undefined ? {} : { player_1: actor } });
const deadNotPending = withPlayer(fresh, { ...structuredClone(fresh.actors.player_1), alive: false }); // the gate without a pending (defensive, D-48)
const deadChoosing = withPlayer(offering, { ...structuredClone(offering.actors.player_1), alive: false });
const actorMissing = withPlayer(fresh, undefined); // D-48: "alive===false(또는 존재하지 않음)"
const bare = step(createInitialState({ worldSeed: "reject-bare" }).state, { type: "wait", minutes: 30 }, {}).state; // no actor system (D-48)
assert.deepStrictEqual(validateData(data), []);
assert.strictEqual(offering.pending?.kind, "choice");
assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
assert.strictEqual(bare.player, undefined);
assert.ok([fresh, offering, dead, bare].every((state) => state.time.minute === 30));

// [code, state, action, data] -- every path that produces each code
const CASES = [
  ["invalid_action", fresh, { type: "wait", minutes: 0 }, data],
  ["invalid_action", fresh, { type: "wait", minutes: 1441 }, data],
  ["invalid_action", fresh, { type: "teleport" }, data],
  ["invalid_action", fresh, null, data],
  ["invalid_action", fresh, { type: "startCharacter", templateId: "tmpl_start" }, data], // nothing pending
  ["invalid_action", bare, { type: "perform", actionId: "act_rest" }, {}],
  ["invalid_action", bare, { type: "move", to: "loc_market" }, {}],
  ["invalid_action", bare, { type: "choose", optionId: "opt_ok" }, {}],
  ["invalid_action", bare, { type: "startCharacter", templateId: "tmpl_start" }, {}],
  ["unknown_action", fresh, { type: "perform", actionId: "act_missing" }, data],
  ["unknown_action", dead, { type: "startCharacter", templateId: "tmpl_missing" }, data],
  ["unknown_option", offering, { type: "choose", optionId: "opt_missing" }, data],
  ["unknown_option", offering, { type: "choose", optionId: "opt_ok" }, withoutChoices],
  ["unknown_location", fresh, { type: "move", to: "loc_missing" }, data],
  ["requirements_not_met", fresh, { type: "perform", actionId: "act_gated" }, data],
  ["requirements_not_met", fresh, { type: "move", to: "loc_vault" }, data], // the link's requires is false
  ["requirements_not_met", fresh, { type: "move", to: "loc_shrine" }, data], // the destination's requires is false
  ["requirements_not_met", fresh, { type: "move", to: "loc_island" }, data], // no link at all
  ["requirements_not_met", offering, { type: "choose", optionId: "opt_gated" }, data],
  ["pending_choice", offering, { type: "wait", minutes: 10 }, data],
  ["pending_choice", offering, { type: "perform", actionId: "act_rest" }, data],
  ["pending_choice", offering, { type: "move", to: "loc_market" }, data],
  ["pending_choice", offering, { type: "startCharacter", templateId: "tmpl_start" }, data],
  ["pending_new_character", dead, { type: "wait", minutes: 10 }, data],
  ["pending_new_character", dead, { type: "perform", actionId: "act_rest" }, data],
  ["pending_new_character", dead, { type: "move", to: "loc_market" }, data],
  ["pending_new_character", dead, { type: "choose", optionId: "opt_ok" }, data],
  ["actor_dead", deadNotPending, { type: "perform", actionId: "act_rest" }, data],
  ["actor_dead", deadNotPending, { type: "move", to: "loc_market" }, data],
  ["actor_dead", deadChoosing, { type: "choose", optionId: "opt_ok" }, data],
  ["actor_dead", actorMissing, { type: "perform", actionId: "act_rest" }, data],
  ["no_pending_choice", fresh, { type: "choose", optionId: "opt_ok" }, data]
];

// 1. every code, every path: the frozen input comes back deepEqual, rng and time do not move, and the
// only event is one player-visible action.rejected carrying that code at the input's minute
function testEveryCodeEveryPath() {
  for (const [code, state, action, pack] of CASES) {
    const input = deepFreeze(structuredClone(state));
    const before = structuredClone(input);
    const result = step(input, action, deepFreeze(pack));
    const label = `${code} <- ${JSON.stringify(action)}`;
    assert.deepStrictEqual(result.state, before, `${label}: state`);
    assert.deepStrictEqual(result.state.rng, before.rng, `${label}: rng`);
    assert.strictEqual(result.state.time.minute, before.time.minute, `${label}: time`);
    assert.strictEqual(result.events.length, 1, `${label}: one event`);
    const [event] = result.events;
    assert.strictEqual(event.type, "action.rejected", label);
    assert.strictEqual(event.visibility, "player", label);
    assert.strictEqual(event.data.code, code, label);
    assert.strictEqual(event.minute, before.time.minute, `${label}: event minute`);
    if (code === "requirements_not_met") assert.deepStrictEqual(Object.keys(event.data), ["code"], `${label}: says nothing about the failed condition`);
  }
  assert.deepStrictEqual([...new Set(CASES.map(([code]) => code))].sort(), [...CONTRACT_CODES].sort(), "every contract code is exercised");
}

// 2. the engine produces exactly the contract's codes (a static scan of its reject sites, like the
// forbidden-API scan of tests/v2/core.test.js)
function testEngineCodesEqualContract() {
  const source = fs.readFileSync(path.join(repoRoot, "web/v2/core/engine.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  // call sites only, not the `function rejectAction(state, code)` definition
  const calls = [...source.matchAll(/(?<!function )\brejectAction\(([^()]*)\)/g)].map((match) => match[1]);
  assert.ok(calls.length >= CONTRACT_CODES.length, "found the engine's reject sites");
  const codes = calls.map((args) => /,\s*"([a-z_]+)"\s*$/.exec(args)?.[1]);
  assert.ok(codes.every((code) => code !== undefined), "every reject site names its code literally: " + JSON.stringify(calls));
  assert.deepStrictEqual([...new Set(codes)].sort(), [...CONTRACT_CODES].sort());
}

testEveryCodeEveryPath();
testEngineCodesEqualContract();

console.log("V2-Core-41 reject-codes.test.js: all checks passed");
