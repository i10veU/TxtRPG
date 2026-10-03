// V2-Core-47 (Issue #127, Gate 1/2 decided): the bandit leader becomes a real actor. An NPC is the
// same Actor record a player character is (`buildActorFromTemplate`, `kind:"npc"`), created by
// `createInitialState` from `data.npcs[id].actor`, under the same ID its relation edges already
// use. No NPC engine, no new Condition/Effect/selector. The one thing that reads it now is the
// confrontation check: its difficulty is opposed by the leader's own stat (base 14 + the leader's
// stat modifier, 0 at 10 -- the old "hard", so the canonical play is unchanged; the stat was `wit`,
// WIS since V2-Core-51, D-80). The pack
// version is bumped (Gate 2): a save of the previous pack is refused by D-68, never repaired.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips
// `*.spec.js`. node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { checkDataCompatibility, createInitialState, step, validateState, view } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const P = (actionId) => ({ type: "perform", actionId });
const MOVE = (to) => ({ type: "move", to });
const CHOOSE = (optionId) => ({ type: "choose", optionId });

// on this seed the investigation and the confrontation succeed (the other world tests use it too)
const SEED = "history-41";
const TO_CONFRONT = [
  P("act_observe_village"), P("act_observe_village"), P("act_talk_elder"), CHOOSE("opt_ask_ruins"),
  MOVE("loc_market"), P("act_buy_lantern"), MOVE("loc_village"), MOVE("loc_ruins"), P("act_investigate_ruins"),
  MOVE("loc_village"), P("act_rest_village"), P("act_talk_elder"), CHOOSE("opt_report_findings")
];
const CONFRONT = P("act_confront_leader");
const TO_DISPERSAL = [...TO_CONFRONT, CONFRONT, P("act_talk_elder"), CHOOSE("opt_bandits_disperse")];
const DIE_IN_RUINS = [MOVE("loc_ruins"), ...Array.from({ length: 4 }, () => ({ type: "wait", minutes: 30 }))];

const LEADER = {
  id: "npc_bandit_leader",
  kind: "npc",
  alive: true,
  locationId: "loc_ruins",
  hp: { current: 10, max: 10 },
  money: 0,
  inventory: {},
  growth: { growth_wanderer: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, per: 10 } } }, // V2-Core-51
  tags: []
};

function run(state, actions, data = worldData) {
  const log = [];
  for (const action of actions) {
    const result = step(state, action, data);
    log.push(result);
    state = result.state;
  }
  return { state, log };
}
const start = (data = worldData) => createInitialState({ worldSeed: SEED, data }).state;
const rejected = (log) => log.some((r) => r.events.some((e) => e.type === "action.rejected"));
const checkOf = (result) => result.events.find((e) => e.type === "check.resolved")?.data;
// a copy of the pack with one part replaced (the real pack is never mutated)
function packWith(patch) {
  return { ...structuredClone(worldData), ...patch };
}

// 1. a new game has the leader as an actor, built from its template; the player is as before;
// an NPC without an `actor` template (the elder) gets no actor
function testSeeded() {
  const before = structuredClone(worldData);
  const state = start();
  assert.deepStrictEqual(Object.keys(state.actors).sort(), ["npc_bandit_leader", "player_1"]);
  assert.deepStrictEqual(state.actors.npc_bandit_leader, LEADER);
  assert.strictEqual(state.actors.player_1.kind, "player");
  assert.deepStrictEqual(state.player, { actorId: "player_1", characterCount: 1 });
  assert.deepStrictEqual(validateState(state), []);
  state.actors.npc_bandit_leader.growth.growth_wanderer.stats.wis = 99;
  assert.deepStrictEqual(worldData, before, "the state does not share the template's objects");

  // D-48: a world without a start template has no actor system, so no NPC actor either
  const noPlayer = packWith({ world: { ...worldData.world, startTemplateId: undefined } });
  assert.strictEqual(start(noPlayer).actors, undefined);
}

// 2. the actor ID is the relation endpoint the pack already uses: the canonical path writes and
// reads the same `npc_bandit_leader` edges as before
function testSameIdAsRelationEndpoint() {
  const { state, log } = run(start(), TO_DISPERSAL);
  assert.ok(!rejected(log));
  assert.ok("npc_bandit_leader:player_1" in state.relations);
  assert.ok("npc_bandit_leader:org_bandits" in state.relations);
  assert.deepStrictEqual(state.actors.npc_bandit_leader, LEADER, "playing the case does not touch the actor");
}

// 3. the confrontation is opposed by the leader's own WIS (V2-Core-51; was `wit`): 14 at the template's 10 (the old
// "hard"), and it follows the leader's stat
function testOpposedConfrontation() {
  const before = run(start(), TO_CONFRONT).state;
  const confronted = step(before, CONFRONT, worldData);
  assert.strictEqual(checkOf(confronted).difficulty, 14);

  const withLeaderWit = (wis) => {
    const s = structuredClone(before);
    s.actors.npc_bandit_leader.growth.growth_wanderer.stats.wis = wis;
    return checkOf(step(s, CONFRONT, worldData)).difficulty;
  };
  assert.strictEqual(withLeaderWit(14), 16);
  assert.strictEqual(withLeaderWit(6), 12);
  assert.strictEqual(withLeaderWit(10), 14);

  // the canonical play is unchanged: the same events as the previous pack's fixed "hard" check
  // (the leader actor is kept: since V2-Core-50 the confrontation also requires him alive)
  const previous = packWith({});
  previous.actions.act_confront_leader.check = { ...previous.actions.act_confront_leader.check, difficulty: "hard" };
  const now = run(start(), TO_DISPERSAL).log.map((r) => r.events);
  const then = run(start(previous), TO_DISPERSAL, previous).log.map((r) => r.events);
  assert.deepStrictEqual(now, then);
}

// 4. the leader belongs to the world: a successor does not touch it, and an NPC's death is not the
// player's (existing §9 rule: `actor.died`, internal; no `newCharacter`)
function testWorldOwned() {
  const dead = run(run(start(), TO_DISPERSAL).state, DIE_IN_RUINS).state;
  assert.deepStrictEqual(dead.pending, { kind: "newCharacter" });
  const successor = run(dead, [{ type: "startCharacter", templateId: "start_wanderer" }]).state;
  assert.strictEqual(successor.player.actorId, "player_2");
  assert.deepStrictEqual(successor.actors.npc_bandit_leader, LEADER);

  const strike = packWith({});
  strike.actions.act_strike_leader = { name: "probe", effects: [{ op: "hp", subject: "npc_bandit_leader", add: -99 }] };
  const result = step(start(strike), P("act_strike_leader"), strike);
  const died = result.events.find((e) => e.type === "actor.died");
  assert.deepStrictEqual([died.actorId, died.visibility], ["npc_bandit_leader", "internal"]);
  assert.strictEqual(result.state.actors.npc_bandit_leader.alive, false);
  assert.strictEqual(result.state.actors.player_1.alive, true);
  assert.strictEqual(result.state.pending, null);
}

// 5. the view is the player's: the NPC actor never appears in it
function testView() {
  const shown = view(run(start(), TO_DISPERSAL).state, worldData);
  assert.strictEqual(shown.actor.id, "player_1");
  assert.ok(!("actors" in shown));
  assert.ok(!JSON.stringify(shown).includes('"kind":"npc"'));
}

// 6. save/load and replay keep the actor; a save of the previous pack (0.1.0, no NPC actor) is
// refused by D-68 and is not changed by being checked
function testSaveAndCompatibility() {
  const { state } = run(start(), TO_CONFRONT);
  const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_npc", state, { savedAt: 1 }))));
  assert.deepStrictEqual(loaded, state);
  assert.deepStrictEqual(run(loaded, [CONFRONT]).log, run(state, [CONFRONT]).log);
  assert.deepStrictEqual(checkDataCompatibility(state, worldData), []);

  const old = structuredClone(state);
  old.dataRef = { id: worldData.id, version: "0.1.0" };
  delete old.actors.npc_bandit_leader;
  const oldCopy = structuredClone(old);
  const errors = checkDataCompatibility(old, worldData);
  assert.strictEqual(errors.length, 1);
  assert.match(errors[0], /^dataRef mismatch/);
  assert.deepStrictEqual(old, oldCopy, "checking does not repair");
  assert.notStrictEqual(worldData.version, "0.1.0");
}

// 7. the validator: an NPC actor template follows the characterTemplate rules, is an NPC, and
// cannot take a successor's ID
function testValidator() {
  assert.deepStrictEqual(validateData(worldData), []);
  const withLeader = (actor, id = "npc_bandit_leader") => validateData(packWith({ npcs: { ...worldData.npcs, [id]: { name: "x", actor } } }));
  const good = structuredClone(worldData.npcs.npc_bandit_leader.actor);
  assert.deepStrictEqual(withLeader(good), []);
  assert.strictEqual(withLeader({ ...good, locationId: "loc_nowhere" }).length, 1);
  assert.strictEqual(withLeader({ ...good, locationId: undefined }).length, 1);
  assert.strictEqual(withLeader({ ...good, kind: "player" }).length, 1);
  assert.deepStrictEqual(withLeader({ ...good, kind: "npc" }), []);
  assert.strictEqual(withLeader(good, "player_3").length, 1);
  assert.deepStrictEqual(validateData(packWith({ npcs: { ...worldData.npcs, player_3: { name: "x" } } })), [], "only an actor can collide");
}

testSeeded();
testSameIdAsRelationEndpoint();
testOpposedConfrontation();
testWorldOwned();
testView();
testSaveAndCompatibility();
testValidator();

console.log("V2-Core-47 npc-actor.test.js: all checks passed");
