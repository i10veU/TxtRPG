// V2-Core-27 tests (Issue #84): the save compatibility policy of D-68 -- is a
// saved state usable with the CURRENT data pack? -- and the versionless-pack
// fix. Everything here is a contract test except the one section marked
// CHARACTERIZATION ONLY (an undecided leftover, D-68 C).
//
// The policy under test (D-68): a state is compatible with a pack iff its
// recorded provenance (`dataRef`, `worldId`) equals what createInitialState
// would record for (that pack, the state's own worldSeed). Checked by the
// pure checkDataCompatibility(state, data); nothing is repaired, migrated,
// deleted, or substituted, and migrateState/validateState/the storage adapter
// keep their exact D-63/D-55/D-64 jobs.
//
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only (§13.1). DEVELOPMENT_RULES §17: the real pack is
// used for "the current pack" questions; small variants of it stand in for
// other packs.

import assert from "node:assert/strict";
import { createInitialState, step, validateState, migrateState, checkDataCompatibility } from "../../web/v2/core/engine.js";
import { validateData } from "../../web/v2/core/rules.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const SEED = "policy-seed";

function fresh(seed = SEED, data = worldData) {
  return createInitialState({ worldSeed: seed, data }).state;
}

function saveAndLoad(state, slot = "slot_p") {
  return parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord(slot, state, { savedAt: 1 }))));
}

// variants of the real pack standing in for "some other pack"
const packWith = (overrides) => ({ ...worldData, ...overrides });
const withoutVersion = () => {
  const pack = { ...worldData };
  delete pack.version;
  return pack;
};

// 1. exact match: same pack, same dataRef, same worldId
function testExactMatch() {
  const state = fresh();
  assert.deepStrictEqual(checkDataCompatibility(state, worldData), []);

  // a real save/load round trip keeps it compatible and lossless
  const loaded = saveAndLoad(state);
  assert.deepStrictEqual(loaded, state);
  assert.deepStrictEqual(checkDataCompatibility(loaded, worldData), []);

  // and play continues normally after the check
  const next = step(loaded, { type: "wait", minutes: 5 }, worldData);
  assert.deepStrictEqual(next.events.map((e) => e.type), ["time.advanced"]);

  // a different seed with the same pack is compatible: the state carries its
  // own seed and rng, so seed is not a data-compatibility key
  const otherSeed = fresh("some-other-seed");
  assert.notStrictEqual(otherSeed.worldId, state.worldId);
  assert.deepStrictEqual(checkDataCompatibility(otherSeed, worldData), []);
  assert.deepStrictEqual(checkDataCompatibility(saveAndLoad(otherSeed, "slot_o"), worldData), []);
}

testExactMatch();

// 2. dataRef mismatch: same world, different pack id / version
function testDataRefMismatch() {
  const state = fresh();

  // a later pack version (any other label; V2-Core-47 made the real pack "0.2.0", so the
  // bumped label is no longer spelled as that literal)
  const versionBumped = checkDataCompatibility(state, packWith({ version: "9.9.9" }));
  assert.strictEqual(versionBumped.length, 1);
  assert.match(versionBumped[0], /^dataRef mismatch: /);
  assert.ok(versionBumped[0].includes(JSON.stringify(worldData.version)));
  assert.match(versionBumped[0], /9\.9\.9/);

  const otherId = checkDataCompatibility(state, packWith({ id: "other_pack" }));
  assert.strictEqual(otherId.length, 1);
  assert.match(otherId[0], /^dataRef mismatch: /);

  // exact match only: the version is an opaque label, no ordering/ranges,
  // so even an "older" version is a mismatch
  assert.strictEqual(checkDataCompatibility(state, packWith({ version: "0.0.9" })).length, 1);
}

testDataRefMismatch();

// 3. worldId mismatch: same dataRef, different world
function testWorldIdMismatch() {
  const state = fresh();

  // same pack reference but its world definition id differs
  const otherWorld = checkDataCompatibility(state, packWith({ world: { ...worldData.world, id: "other_world" } }));
  assert.strictEqual(otherWorld.length, 1);
  assert.match(otherWorld[0], /^worldId mismatch: /);

  // a worldId that does not match D-03 for the state's own seed
  assert.strictEqual(checkDataCompatibility({ ...state, worldId: "frontier_village_0" }, worldData).length, 1);
  assert.strictEqual(checkDataCompatibility({ ...state, worldSeed: "edited-seed" }, worldData).length, 1);
}

testWorldIdMismatch();

// 4. different dataRef AND different world: both reported, dataRef first
function testBothMismatch() {
  const other = packWith({ id: "other_pack", version: "9", world: { ...worldData.world, id: "other_world" } });
  const errors = checkDataCompatibility(fresh(), other);
  assert.strictEqual(errors.length, 2);
  assert.match(errors[0], /^dataRef mismatch: /);
  assert.match(errors[1], /^worldId mismatch: /);
}

testBothMismatch();

// 5. record header vs state: the STATE is authoritative; the header is a
// derived index for list() (D-64) and never decides compatibility
function testStateIsAuthoritative() {
  const state = fresh();
  const record = () => JSON.parse(JSON.stringify(buildSaveRecord("slot_h", state, { savedAt: 1 })));

  // header claims another pack, state matches -> compatible
  const lyingHeader = record();
  lyingHeader.dataRef = { id: "other_pack", version: "9" };
  lyingHeader.worldId = "other_world_1";
  assert.deepStrictEqual(checkDataCompatibility(parseLoadedRecord(lyingHeader), worldData), []);

  // header claims the current pack, state does not -> incompatible
  const lyingState = record();
  lyingState.state.dataRef = { id: "other_pack", version: "9" };
  assert.strictEqual(checkDataCompatibility(parseLoadedRecord(lyingState), worldData).length, 1);

  // the header is derived from the state on save (D-64)
  const fromSave = buildSaveRecord("slot_h", state, { savedAt: 1 });
  assert.deepStrictEqual(fromSave.dataRef, state.dataRef);
  assert.strictEqual(fromSave.worldId, state.worldId);
}

testStateIsAuthoritative();

// 6. schemaVersion is a different axis: migrateState owns it (D-63), the
// compatibility check neither reads nor repeats it, and the two meanings are
// never mixed
function testSchemaVersionIsSeparate() {
  const state = fresh();
  const wrongSchema = { ...state, schemaVersion: 2 };

  // load rejects it in migrateState, exactly as before
  assert.throws(() => migrateState(wrongSchema), /migrateState: .*schemaVersion/);
  assert.throws(
    () => parseLoadedRecord({ slot: "slot_s", schemaVersion: 1, worldId: state.worldId, dataRef: state.dataRef, savedAt: 1, state: wrongSchema }),
    /schemaVersion/
  );

  // the compatibility check judges provenance only: a wrong schemaVersion
  // with matching provenance is not its concern
  assert.deepStrictEqual(checkDataCompatibility(wrongSchema, worldData), []);

  // and a pack `version` is never treated as a schemaVersion
  assert.strictEqual(fresh().schemaVersion, 1);
  assert.deepStrictEqual(checkDataCompatibility(state, packWith({ version: "2" })).length, 1);
}

testSchemaVersionIsSeparate();

// 7. malformed / missing provenance is a mismatch (never a throw)
function testMalformedOrMissingProvenance() {
  const state = fresh();
  const stripped = structuredClone(state);
  delete stripped.dataRef;
  delete stripped.worldId;
  const missing = checkDataCompatibility(stripped, worldData);
  assert.strictEqual(missing.length, 2);
  assert.match(missing[0], /state has none/);

  for (const [name, patch] of [
    ["wrong types", { dataRef: "garbage", worldId: 12345 }],
    ["null provenance", { dataRef: null, worldId: null }],
    ["array dataRef", { dataRef: [], worldId: [] }],
    ["empty-string version", { dataRef: { id: state.dataRef.id, version: "" } }],
    ["extra dataRef field", { dataRef: { ...state.dataRef, extra: 1 } }]
  ]) {
    assert.ok(checkDataCompatibility({ ...state, ...patch }, worldData).length >= 1, `${name} must be a mismatch`);
  }

  const circular = {};
  circular.self = circular;
  assert.strictEqual(checkDataCompatibility({ ...state, dataRef: circular }, worldData).length, 1);

  // never throws, whatever it is given
  for (const bad of [null, undefined, [], "state", 42]) {
    assert.deepStrictEqual(checkDataCompatibility(bad, worldData), ["state must be a plain object"]);
  }
  for (const badData of [undefined, null, 42, "pack", []]) {
    assert.doesNotThrow(() => checkDataCompatibility(state, badData));
  }
}

testMalformedOrMissingProvenance();

// 8. versionless data pack (the V2-Core-26 gap): allowed, and now saveable
function testVersionlessPack() {
  const pack = withoutVersion();
  assert.deepStrictEqual(validateData(pack), []);

  // dataRef is JSON-safe: `version` is simply absent (no undefined, no sentinel)
  const state = fresh(SEED, pack);
  assert.deepStrictEqual(state.dataRef, { id: worldData.id });
  assert.deepStrictEqual(Object.keys(state.dataRef), ["id"]);
  assert.deepStrictEqual(validateState(state), []);

  // it can be saved and loaded losslessly, and is compatible with its own pack
  assert.deepStrictEqual(saveAndLoad(state, "slot_v"), state);
  assert.deepStrictEqual(checkDataCompatibility(state, pack), []);

  // absent is not the same as present: versionless vs versioned is a mismatch both ways
  assert.strictEqual(checkDataCompatibility(state, worldData).length, 1);
  assert.strictEqual(checkDataCompatibility(fresh(), pack).length, 1);

  // null and "" are defined values (opaque labels), distinct from absent and
  // from each other; no format is imposed on `version`
  for (const label of [null, ""]) {
    const labelled = packWith({ version: label });
    const s = fresh(SEED, labelled);
    assert.deepStrictEqual(s.dataRef, { id: worldData.id, version: label });
    assert.deepStrictEqual(validateState(s), []);
    assert.deepStrictEqual(checkDataCompatibility(s, labelled), []);
    assert.strictEqual(checkDataCompatibility(s, pack).length, 1);
  }
  assert.strictEqual(checkDataCompatibility(fresh(SEED, packWith({ version: null })), packWith({ version: "" })).length, 1);

  // a versioned pack is recorded exactly as before this change
  assert.deepStrictEqual(fresh().dataRef, { id: worldData.id, version: worldData.version });
}

testVersionlessPack();

// 9. responsibility split: three different questions, three different functions
function testResponsibilitySplit() {
  // API shape: only the compatibility check sees both a state and a pack
  assert.strictEqual(migrateState.length, 1);
  assert.strictEqual(validateState.length, 1);
  assert.strictEqual(validateData.length, 1);
  assert.strictEqual(checkDataCompatibility.length, 2);

  const state = fresh();

  // validateState ignores which pack the state belongs to (D-55)
  const foreign = { ...state, dataRef: { id: "other_pack", version: "9" }, worldId: "other_world_1" };
  assert.deepStrictEqual(validateState(foreign), []);
  assert.strictEqual(checkDataCompatibility(foreign, worldData).length, 2);

  // migrateState leaves provenance untouched and never repairs it (D-63)
  assert.deepStrictEqual(migrateState(foreign), foreign);

  // the compatibility check ignores state shape: that is validateState's job
  const junk = { ...state, time: { minute: 1.5 } }; // D-55: non-integer time.minute
  assert.notDeepStrictEqual(validateState(junk), []);
  assert.deepStrictEqual(checkDataCompatibility(junk, worldData), []);

  // the storage adapter stays pack-agnostic: it neither knows the pack nor judges provenance
  assert.doesNotThrow(() => saveAndLoad(foreign, "slot_f"));

  // step() does not check either: enforcement is at the load boundary, by the
  // caller that owns the current pack (D-68)
  assert.deepStrictEqual(step(foreign, { type: "wait", minutes: 5 }, worldData).events.map((e) => e.type), ["time.advanced"]);
}

testResponsibilitySplit();

// 10. createInitialState and the check share ONE provenance rule: whatever a
// pack produces at creation must be judged compatible with that same pack, for
// any seed and any pack shape
function testCreationAndCheckNeverDrift() {
  const packs = [
    worldData,
    withoutVersion(),
    packWith({ version: null }),
    packWith({ version: "" }),
    { world: worldData.world, characterTemplates: worldData.characterTemplates }, // no pack id
    { id: "id_only_pack" }, // no world
    undefined // no pack at all (D-47 bare state)
  ];
  for (const pack of packs) {
    for (const seed of [SEED, "", "0", 123, "한글-seed"]) {
      const state = createInitialState({ worldSeed: seed, data: pack }).state;
      assert.deepStrictEqual(checkDataCompatibility(state, pack), [], `pack ${JSON.stringify(pack?.id)} seed ${JSON.stringify(seed)}`);
    }
  }
}

testCreationAndCheckNeverDrift();

// 11. purity: inputs are never mutated
function testPurity() {
  const state = fresh();
  const pack = packWith({ version: "9.9.9" });
  const stateBefore = JSON.stringify(state);
  const packBefore = JSON.stringify(pack);
  checkDataCompatibility(state, pack);
  checkDataCompatibility(state, worldData);
  assert.strictEqual(JSON.stringify(state), stateBefore);
  assert.strictEqual(JSON.stringify(pack), packBefore);
  assert.deepStrictEqual(checkDataCompatibility(state, pack), checkDataCompatibility(state, pack));
}

testPurity();

// 12. CHARACTERIZATION ONLY -- NOT A CONTRACT (D-68 C).
// `version` is an opaque label: validateData does not constrain it and the
// provenance rule does not either. A value that is not JSON-safe (NaN,
// Infinity) therefore still yields a state that validateState rejects, so
// that game cannot be saved. Whether validateData should constrain `version`
// (type/format) is a versioning-semantics decision the contract does not make.
function testNonJsonSafeVersionStillUnsaveable() {
  const pack = packWith({ version: Number.NaN });
  assert.deepStrictEqual(validateData(pack), []);
  const state = fresh(SEED, pack);
  assert.ok(validateState(state).length > 0);
  assert.throws(() => buildSaveRecord("slot_n", state, { savedAt: 1 }), /validateState/);
}

testNonJsonSafeVersionStillUnsaveable();

console.log("V2-Core-27 save-compat-policy.test.js: all checks passed");
