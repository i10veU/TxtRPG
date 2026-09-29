// V2-Core-26 tests (Issue #82): save provenance (`dataRef`/`worldId`, D-66)
// and the `view()` boundary (D-67). Updated in V2-Core-27 (Issue #84): the
// D-66 pieces V2-Core-26 could only characterize are now decided (D-68), so
// they are contract tests here and in save-compat-policy.test.js.
//
// What is pinned here is ONLY what the contract determines:
//   - what dataRef/worldId mean (§2.1, §2.6 D-03, §10, D-64),
//   - who is responsible for what on load (D-55 validateState, D-63
//     migrateState, §11 validateData, D-68 checkDataCompatibility),
//   - what view() contains and that it survives save/load (D-53, D-15).
// D-67 (the view() boundary) is still undecided (C); its tests only pin the
// current, documented view() contents.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only (§13.1). DEVELOPMENT_RULES §17: the real pack is
// used only where the question is about the real pack.

import assert from "node:assert/strict";
import { createInitialState, step, view, validateState, migrateState, SCHEMA_VERSION } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { hashString } from "../../web/v2/core/rng.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const SEED = "compat-seed";

function fresh(seed = SEED) {
  return createInitialState({ worldSeed: seed, data: worldData }).state;
}

function apply(state, action) {
  return step(state, action, worldData);
}

function roundTrip(state, slot = "slot_t") {
  const record = JSON.parse(JSON.stringify(buildSaveRecord(slot, state, { savedAt: 1 })));
  return parseLoadedRecord(record);
}

// village -> market (lantern) -> village -> ruins, then wait twice: dead,
// pending newCharacter (same path the V2-Core-25 tests use)
function deadState() {
  let s = fresh();
  s = apply(s, { type: "move", to: "loc_market" }).state;
  s = apply(s, { type: "perform", actionId: "act_buy_lantern" }).state;
  s = apply(s, { type: "move", to: "loc_village" }).state;
  s = apply(s, { type: "move", to: "loc_ruins" }).state;
  s = apply(s, { type: "wait", minutes: 30 }).state;
  return apply(s, { type: "wait", minutes: 30 }).state;
}

// ---------------------------------------------------------------- D-66 ---

// 1. what dataRef / worldId ARE (creation-time provenance)
function testProvenanceMeaning() {
  const state = fresh();

  // §2.1 dataRef = {id, version} of the pack the state was created from
  assert.deepStrictEqual(state.dataRef, { id: worldData.id, version: worldData.version });

  // §2.6 / D-03: worldId = `${world.id}_${hex(hashString(worldSeed))}`
  assert.strictEqual(state.worldId, `${worldData.world.id}_${hashString(SEED).toString(16)}`);

  // the two identify different things: same pack + other seed = same dataRef,
  // different worldId; same seed = same worldId (D-03 "같은 seed는 같은 세계")
  const other = fresh("another-seed");
  assert.deepStrictEqual(other.dataRef, state.dataRef);
  assert.notStrictEqual(other.worldId, state.worldId);
  assert.strictEqual(fresh(SEED).worldId, state.worldId);

  // §10 / D-64: the record copies both from the state
  const record = buildSaveRecord("slot_a", state, { savedAt: 1 });
  assert.strictEqual(record.schemaVersion, SCHEMA_VERSION);
  assert.deepStrictEqual(record.dataRef, state.dataRef);
  assert.strictEqual(record.worldId, state.worldId);

  // D-47 bare state (no data at creation): neither field exists, record stores null
  const bare = createInitialState({ worldSeed: SEED }).state;
  assert.strictEqual("dataRef" in bare, false);
  assert.strictEqual("worldId" in bare, false);
  const bareRecord = buildSaveRecord("slot_bare", bare, { savedAt: 1 });
  assert.strictEqual(bareRecord.dataRef, null);
  assert.strictEqual(bareRecord.worldId, null);
  assert.deepStrictEqual(parseLoadedRecord(JSON.parse(JSON.stringify(bareRecord))), bare);
}

testProvenanceMeaning();

// 2. a save from the current pack loads losslessly and continues identically
function testMatchingPackRoundTrip() {
  let state = fresh();
  state = apply(state, { type: "perform", actionId: "act_observe_village" }).state;
  const reloaded = roundTrip(state);
  assert.deepStrictEqual(reloaded, state);
  assert.deepStrictEqual(validateState(reloaded), []);
  const next = { type: "perform", actionId: "act_talk_elder" };
  assert.deepStrictEqual(apply(reloaded, next), apply(state, next));
}

testMatchingPackRoundTrip();

// 3. schemaVersion mismatch is rejected by migrateState (D-63) -- this is the
// one compatibility check the contract does define on load
function testSchemaVersionMismatchRejected() {
  for (const bad of [0, 2, 99, "1", undefined, null]) {
    const state = fresh();
    state.schemaVersion = bad;
    // migrateState is the layer that owns this check (D-63) ...
    assert.throws(() => migrateState(state), /migrateState: .*schemaVersion/, `migrateState must reject schemaVersion ${String(bad)}`);
    // ... and the whole load path therefore rejects it too
    assert.throws(() => parseLoadedRecord(buildSaveRecordUnchecked(state)), /schemaVersion/, `load must reject schemaVersion ${String(bad)}`);
  }
}

// buildSaveRecord itself refuses invalid states, so hand-build the record the
// way a corrupted/old save on disk would look
function buildSaveRecordUnchecked(state) {
  return { slot: "slot_x", schemaVersion: SCHEMA_VERSION, worldId: state.worldId ?? null, dataRef: state.dataRef ?? null, savedAt: 1, state };
}

testSchemaVersionMismatchRejected();

// 4. responsibility boundary between migration, state validation and data
// validation (D-55, D-63, §11): none of them relates a state to a pack
function testResponsibilitySplit() {
  // API level (§1.4): each takes exactly one input, so none can compare a
  // state with a pack
  assert.strictEqual(migrateState.length, 1);
  assert.strictEqual(validateState.length, 1);
  assert.strictEqual(validateData.length, 1);

  // migrateState is about schemaVersion only: foreign/garbage provenance
  // passes through untouched (and as a copy, D-63)
  const state = fresh();
  state.dataRef = { id: "some_other_pack", version: "9.9.9" };
  state.worldId = "some_other_world_deadbeef";
  const migrated = migrateState(state);
  assert.deepStrictEqual(migrated, state);
  assert.notStrictEqual(migrated, state);

  // validateState checks state-internal invariants only (D-55): provenance
  // is checked for JSON-safety, never against a pack
  assert.deepStrictEqual(validateState(state), []);
}

testResponsibilitySplit();

// 5. The storage adapter's load is pack-agnostic BY DESIGN (D-68, decided in
// V2-Core-27; V2-Core-26 had recorded this as an undecided characterization).
// The adapter never knows the current pack, so it does not judge provenance:
// parseLoadedRecord consults only `record.state` (the authoritative copy; the
// record header is a derived index for list(), D-64). Whether a state fits the
// current pack is decided separately by checkDataCompatibility, covered in
// save-compat-policy.test.js.
function testAdapterLoadIsPackAgnostic() {
  const state = fresh();
  const load = (mutate) => {
    const record = JSON.parse(JSON.stringify(buildSaveRecord("slot_c", state, { savedAt: 1 })));
    mutate(record);
    return parseLoadedRecord(record);
  };

  // record-level provenance is never consulted
  assert.doesNotThrow(() => load((r) => { r.dataRef = { id: "other_pack", version: "9.9.9" }; }));
  assert.doesNotThrow(() => load((r) => { r.worldId = "other_world_deadbeef"; }));
  assert.doesNotThrow(() => load((r) => { r.schemaVersion = 99; }));
  assert.doesNotThrow(() => load((r) => { r.dataRef = null; r.worldId = null; }));

  // state-level provenance is not compared with any pack either
  assert.doesNotThrow(() => load((r) => { r.state.dataRef = { id: "other_pack", version: "9.9.9" }; }));
  assert.doesNotThrow(() => load((r) => { r.state.worldId = "tampered"; }));
  assert.doesNotThrow(() => load((r) => { delete r.state.dataRef; delete r.state.worldId; }));
  assert.doesNotThrow(() => load((r) => { r.state.dataRef = "garbage"; r.state.worldId = 12345; }));
  // worldId is recomputable from worldSeed (D-03); that is checked by
  // checkDataCompatibility, not by the adapter
  assert.doesNotThrow(() => load((r) => { r.state.worldSeed = "a-different-seed"; }));

  // the two copies (record header vs state) can disagree; the state is
  // authoritative (D-68), the header never affects the loaded state
  const loaded = load((r) => { r.dataRef = { id: "other_pack", version: "9.9.9" }; });
  assert.deepStrictEqual(loaded.dataRef, state.dataRef);
}

testAdapterLoadIsPackAgnostic();

// (The "pack with an id but no version" gap that V2-Core-26 reproduced here as
// CHARACTERIZATION ONLY is now decided -- D-68 -- and covered as a contract in
// save-compat-policy.test.js.)

// ---------------------------------------------------------------- D-67 ---

// 7. what view() contains -- exactly D-53's categories. Anything the UI needs
// beyond this comes from state/data directly (local-client model).
function testViewContract() {
  const state = fresh();
  const v = view(state, worldData);

  assert.deepStrictEqual(Object.keys(v), ["actor", "knowledge", "relations", "pending", "actions"]);

  // the player's identity is derivable from view alone
  assert.strictEqual(v.actor.id, state.player.actorId);
  assert.strictEqual(v.actor.locationId, state.actors.player_1.locationId);

  // not part of view (D-53 "새 카테고리 없음"): time, move links, hidden truth
  for (const absent of ["time", "moves", "player", "facts", "cases", "flags", "worldSeed", "rng"]) {
    assert.strictEqual(absent in v, false, `view() must not contain ${absent}`);
  }

  // locked entries expose no reason (D-06/D-15)
  const locked = v.actions.filter((a) => !a.available);
  assert.ok(locked.length > 0);
  for (const entry of locked) assert.deepStrictEqual(Object.keys(entry).sort(), ["actionId", "available"]);

  // a pending choice carries only ids: the options themselves are not in view()
  const choosing = apply(state, { type: "perform", actionId: "act_talk_elder" }).state;
  const pending = view(choosing, worldData).pending;
  assert.deepStrictEqual(pending, { kind: "choice", choiceId: "choice_elder_dialogue", sourceId: "act_talk_elder" });
  assert.deepStrictEqual(Object.keys(pending).sort(), ["choiceId", "kind", "sourceId"]);
}

testViewContract();

// 8. view() is a pure function of (state, data): no mutation, deterministic,
// and identical after a save/load round trip -- for every state kind the UI
// has to render
function testViewSurvivesSaveLoad() {
  const states = {
    fresh: fresh(),
    afterMove: apply(fresh(), { type: "move", to: "loc_market" }).state,
    pendingChoice: apply(fresh(), { type: "perform", actionId: "act_talk_elder" }).state,
    pendingNewCharacter: deadState()
  };
  states.respawned = apply(states.pendingNewCharacter, { type: "startCharacter", templateId: "start_wanderer" }).state;

  for (const [name, state] of Object.entries(states)) {
    const before = JSON.stringify(state);
    const v1 = view(state, worldData);
    const v2 = view(state, worldData);
    assert.strictEqual(JSON.stringify(state), before, `${name}: view() must not mutate state`);
    assert.deepStrictEqual(v1, v2, `${name}: view() must be deterministic`);
    assert.deepStrictEqual(view(roundTrip(state), worldData), v1, `${name}: view() must survive save/load`);
  }
}

testViewSurvivesSaveLoad();

// 9. the death / newCharacter screen is fully expressible from view()
function testDeathScreenFromView() {
  const dead = deadState();
  const v = view(dead, worldData);
  assert.deepStrictEqual(v.pending, { kind: "newCharacter" });
  assert.strictEqual(v.actor.alive, false);
  assert.strictEqual(v.actor.hp.current, 0);
  assert.strictEqual(v.actor.id, dead.player.actorId);

  const respawned = view(apply(dead, { type: "startCharacter", templateId: "start_wanderer" }).state, worldData);
  assert.strictEqual(respawned.pending, null);
  assert.strictEqual(respawned.actor.id, "player_2");
  assert.strictEqual(respawned.actor.alive, true);
  assert.deepStrictEqual(respawned.actor.hp, { current: 10, max: 10 });
}

testDeathScreenFromView();

console.log("V2-Core-26 save-compat-view.test.js: all checks passed");
