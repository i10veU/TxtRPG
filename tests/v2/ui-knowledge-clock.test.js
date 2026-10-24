// J3 RC1: the band clock is only a projection of what this life knows.
// No world truth, signals, RNG cursor, or prior-life chronicle may be consulted.
import assert from "node:assert/strict";
import { createInitialState, view } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";
import { knowledgeClock } from "../../web/v2/ui/knowledge-clock.js";

const fresh = () => createInitialState({ worldSeed: "j3-clock-seed", data: worldData }).state;
const add = (state, rumorId, { day = Math.floor(state.time.minute / 1440), heard = day, confidence = 70 } = {}) => {
  const def = worldData.rumors[rumorId];
  assert.ok(def, rumorId);
  const actorId = state.player.actorId;
  state.knowledge ??= {};
  state.knowledge[actorId] ??= {};
  state.knowledge[actorId][rumorId] = {
    rumorId, factId: def.factId, claim: def.claim,
    source: "npc_elder", sources: ["npc_elder"],
    confidence, confirmations: 1, firstSeenDay: heard, lastSeenDay: heard, aboutDay: day
  };
  return state;
};
const project = (s) => knowledgeClock(view(s, worldData).knowledge, worldData, s.time.minute);

const initial = fresh();
assert.equal(project(initial), null, "the opening must not spoil an unknown band");
assert.equal(project(fresh()), null, "a successor with no knowledge sees no clock");

const ask = add(fresh(), "rum_elder_asks_band");
assert.equal(project(ask).stage, 0, "an elder's request is not evidence of a crossing");
assert.match(project(ask).text, /확인하지 못했다/);
const gathering = add(fresh(), "rum_band_recruits");
assert.equal(project(gathering).stage, 1);
const crossing = add(fresh(), "rum_band_crossing_soon");
assert.equal(project(crossing).stage, 2);
assert.equal(project(crossing).stale, false);
const crossed = add(fresh(), "rum_band_crossed");
assert.equal(project(crossed).stage, 3);
const raid = add(fresh(), "rum_raid_coming");
assert.equal(project(raid).stage, 4);
assert.equal(project(raid).stale, false);

const old = add(fresh(), "rum_raid_coming", { day: 0, heard: 0 });
old.time.minute = 5 * 1440;
assert.equal(project(old).stale, true, "validDays is based on the day reported, not the day heard");
assert.equal(project(old).ageDays, 5);
assert.equal(project(old).heardAgeDays, 5);

const delayed = add(fresh(), "rum_band_crossing_soon", { day: 0, heard: 4 });
delayed.time.minute = 4 * 1440;
assert.equal(project(delayed).stale, true, "late news can already be expired when heard");
assert.equal(project(delayed).heardAgeDays, 0);

const mixed = add(add(fresh(), "rum_band_crossed", { day: 0, heard: 0 }), "rum_band_recruits", { day: 2, heard: 2 });
mixed.time.minute = 3 * 1440;
assert.equal(project(mixed).stage, 1, "most recent observation takes precedence over an older, more dramatic report");
assert.equal(project(mixed).rumorId, "rum_band_recruits");
const tie = add(add(fresh(), "rum_band_recruits", { day: 1, heard: 1 }), "rum_band_crossing_soon", { day: 1, heard: 1 });
tie.time.minute = 1440; // Both same-day reports have actually been heard.
assert.equal(project(tie).stage, 2, "equal-day reports prefer the stronger known warning");

// An entry filed under another rumor's key is not a report this character
// knows. Nor may a future-dated entry replace an already heard warning.
const validWarning = add(fresh(), "rum_band_recruits");
const owner = validWarning.player.actorId;
const mismatched = structuredClone(validWarning);
const raidDef = worldData.rumors.rum_raid_coming;
mismatched.knowledge[owner].wrong_key = {
  rumorId: "rum_raid_coming", factId: raidDef.factId, claim: raidDef.claim,
  source: "npc_elder", sources: ["npc_elder"], confidence: 95,
  firstSeenDay: 0, lastSeenDay: 0, aboutDay: 0
};
assert.equal(project(mismatched).stage, 1, "mis-keyed report cannot invent a raid warning");
const futureObserved = add(structuredClone(validWarning), "rum_raid_coming", { day: 7, heard: 0 });
assert.equal(project(futureObserved).stage, 1, "future observation cannot outrank current knowledge");
const futureHeard = add(structuredClone(validWarning), "rum_raid_coming", { day: 0, heard: 7 });
assert.equal(project(futureHeard).stage, 1, "unreceived future report cannot outrank current knowledge");
assert.equal(knowledgeClock({ wrong_key: mismatched.knowledge[owner].wrong_key }, worldData, 0), null,
  "mis-keyed rumor alone must not reveal a danger clock");

const hidden = structuredClone(crossing);
hidden.facts.fact_band_crossed = { value: "crossed", since: 1 };
hidden.signals ??= {};
hidden.signals.band_crossed = 999;
hidden.rng = { ...hidden.rng, state: 123, cursor: 987 };
const before = JSON.stringify(hidden);
assert.deepEqual(project(hidden), project(crossing), "same character knowledge must yield the same UI despite different hidden truth");
assert.equal(JSON.stringify(hidden), before, "clock must not mutate state or consume RNG");
assert.equal(JSON.stringify(project(hidden)), JSON.stringify(project(hidden)), "projection is byte stable");

const corrupted = structuredClone(crossing);
corrupted.knowledge[corrupted.player.actorId].rum_band_crossing_soon.claim = "invented";
assert.equal(project(corrupted), null, "unmatched claim is not a legitimate observed report");

const poisoned = fresh();
poisoned.knowledge = { [poisoned.player.actorId]: JSON.parse('{"__proto__":{"rumorId":"__proto__","confidence":70,"lastSeenDay":0}}') };
assert.equal(project(poisoned), null, "inherited Object keys must never become valid reports");

const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("j3-clock", crossing, { savedAt: 1 }))));
assert.deepEqual(project(loaded), project(crossing), "save/load retains the exact same knowledge clock");
assert.deepEqual(loaded, crossing, "the UI-only clock requires no Save migration");

console.log("J3 observer-only knowledge clock: all checks passed");
