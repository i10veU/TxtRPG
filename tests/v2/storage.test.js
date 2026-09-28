// V2-Core-21 tests for the storage adapter's pure, Node-testable parts
// (docs/v2/architecture/CORE_CONTRACTS.md §10, D-63/D-64).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.
//
// This file deliberately does NOT touch IndexedDB (no npm dependency added
// to mock it in Node, per the issue's constraint) -- it only exercises
// buildSaveRecord/parseLoadedRecord, the pure functions the actual
// save()/load() wrap around IndexedDB calls. Real IndexedDB CRUD is
// verified in the browser smoke spec instead.

import assert from "node:assert/strict";
import {
  buildSaveRecord,
  parseLoadedRecord,
  DB_NAME,
  STORE_NAME
} from "../../web/v2/storage/idb.js";
import { createInitialState, step, validateState, SCHEMA_VERSION } from "../../web/v2/core/engine.js";

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function actionDataFixture(overrides) {
  return {
    formatVersion: 1,
    id: "test_pack",
    version: "0.1.0",
    world: { id: "test_world", growthSystemId: "growth_a", startTemplateId: "start_default" },
    rules: { check: {}, succession: [] },
    characterTemplates: {
      start_default: { kind: "player", locationId: "loc_start", hp: { max: 10 }, money: 5, inventory: {}, growth: {}, tags: [] }
    },
    locations: { loc_start: {} },
    actions: {
      act_rest: { effects: [{ op: "money", add: 1 }] }
    },
    ...overrides
  };
}

function richState() {
  const data = actionDataFixture();
  const { state } = createInitialState({ worldSeed: "storage-check", data });
  return step(state, { type: "perform", actionId: "act_rest" }, data).state;
}

// 1. DB/store name constants match §10/D-64 exactly
function testConstants() {
  assert.strictEqual(DB_NAME, "txtrpg_v2");
  assert.strictEqual(STORE_NAME, "saves");
}

testConstants();

// 2. buildSaveRecord: normal shape, deep copy, savedAt override
function testBuildSaveRecordValid() {
  const state = richState();
  const record = buildSaveRecord("slot_1", state, { savedAt: 12345 });
  assert.strictEqual(record.slot, "slot_1");
  assert.strictEqual(record.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(record.worldId, state.worldId ?? null);
  assert.deepStrictEqual(record.dataRef, state.dataRef ?? null);
  assert.strictEqual(record.savedAt, 12345);
  assert.deepStrictEqual(record.state, state);
  assert.notStrictEqual(record.state, state, "state must be deep-copied, not referenced");

  // no metadata at all -> savedAt still produced (real wall-clock value)
  const withoutMetadata = buildSaveRecord("slot_1", state);
  assert.strictEqual(typeof withoutMetadata.savedAt, "number");
}

testBuildSaveRecordValid();

// 3. buildSaveRecord: slot validation, invalid state, immutability
function testBuildSaveRecordInvalid() {
  const state = richState();
  [null, undefined, 42, "", [], {}].forEach((badSlot) => {
    assert.throws(() => buildSaveRecord(badSlot, state, { savedAt: 1 }), /slot must be a non-empty string/);
  });

  const badState = structuredClone(state);
  badState.actors.player_1.hp.current = 1.5;
  assert.throws(() => buildSaveRecord("slot_1", badState, { savedAt: 1 }), /failed validateState/);

  // input must never be mutated, even a frozen/invalid one
  const frozenBad = deepFreeze(structuredClone(badState));
  const before = snapshot(frozenBad);
  assert.throws(() => buildSaveRecord("slot_1", frozenBad, { savedAt: 1 }));
  assert.deepStrictEqual(snapshot(frozenBad), before);

  const frozenGood = deepFreeze(structuredClone(state));
  const beforeGood = snapshot(frozenGood);
  buildSaveRecord("slot_1", frozenGood, { savedAt: 1 });
  assert.deepStrictEqual(snapshot(frozenGood), beforeGood);
}

testBuildSaveRecordInvalid();

// 4. parseLoadedRecord: normal round-trip via a hand-built stored record
function testParseLoadedRecordValid() {
  const state = richState();
  const record = buildSaveRecord("slot_1", state, { savedAt: 1 });
  const loaded = parseLoadedRecord(record);
  assert.deepStrictEqual(loaded, state);
  assert.notStrictEqual(loaded, state);
  assert.notStrictEqual(loaded, record.state, "load must not hand back the record's own internal copy by reference");
}

testParseLoadedRecordValid();

// 5. parseLoadedRecord: malformed record, unsupported schemaVersion, invalid
// state all reject (throw) -- one policy, no auto-repair, no silent pass
function testParseLoadedRecordInvalid() {
  [null, undefined, 42, "record", []].forEach((bad) => {
    assert.throws(() => parseLoadedRecord(bad), /malformed save record/);
  });
  assert.throws(() => parseLoadedRecord({ schemaVersion: 1, state: {} }), /missing `slot`/);

  const state = richState();
  assert.throws(
    () => parseLoadedRecord({ slot: "slot_1", state: { ...state, schemaVersion: 99 } }),
    /unsupported schemaVersion/
  );
  assert.throws(
    () => parseLoadedRecord({ slot: "slot_1", state: null }),
    /plain object/
  );

  const invalidState = structuredClone(state);
  invalidState.actors.player_1.money = 1.5;
  assert.throws(() => parseLoadedRecord({ slot: "slot_1", state: invalidState }), /invalid state/);
}

testParseLoadedRecordInvalid();

// 6. determinism and JSON round-trip
function testDeterminismAndRoundTrip() {
  const state = richState();
  const record1 = buildSaveRecord("slot_1", state, { savedAt: 42 });
  const record2 = buildSaveRecord("slot_1", state, { savedAt: 42 });
  assert.deepStrictEqual(record1, record2);

  const roundTrippedRecord = JSON.parse(JSON.stringify(record1));
  assert.deepStrictEqual(parseLoadedRecord(roundTrippedRecord), parseLoadedRecord(record1));

  const loaded1 = parseLoadedRecord(record1);
  const loaded2 = parseLoadedRecord(record1);
  assert.deepStrictEqual(loaded1, loaded2);
}

testDeterminismAndRoundTrip();

console.log("V2-Core-21 storage.test.js: all checks passed");
