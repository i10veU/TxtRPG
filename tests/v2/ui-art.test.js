// V2-Core-158 (D-136): the pictures (web/v2/ui/art.js), pure.
//   1. the light of the hour follows the words of the day: 깊은 밤 and 밤 are night, 새벽 dawn, 아침 to 오후 day, 저녁 dusk
//   2. every place of the pack has its own picture; a place without one falls back to a road; every op is one the
//      painter draws; the same scene is the same picture
//   3. only what can be seen there is drawn: the spring's water, a village burnt or under the lord's banner; the band's
//      camp is the same camp whatever the band's number; the game's roll is never read
//   4. every light has every colour, in both themes; night is darker than day, the dark theme darker than the light
//   5. the last page: each ending of the pack has its picture, a fall has the grave
//
// `.test.js`, not `.spec.js`: tests/v2/run.js runs every `*.js` directly under tests/v2/ and skips `*.spec.js`.
// node:assert/strict only (§13.1).

import assert from "node:assert/strict";
import { BANDS, COVER, PALETTE_KEYS, SCENE_KEYS, endingScene, marksOf, opsOf, paletteOf, sceneOf, timeBand } from "../../web/v2/ui/art.js";
import { DRAWN_OPS } from "../../web/v2/ui/paint.js";
import { createInitialState } from "../../web/v2/core/engine.js";
import { worldData } from "../../web/v2/data/world.js";

// 1. the light
const expected = (hour) => (hour < 5 ? "night" : hour < 7 ? "dawn" : hour < 17 ? "day" : hour < 20 ? "dusk" : "night");
for (let hour = 0; hour < 24; hour += 1) {
  assert.equal(timeBand(hour * 60), expected(hour), `hour ${hour}`);
  assert.equal(timeBand(hour * 60 + 59 + 1440 * 3), expected(hour), `hour ${hour}, a later day`);
}

// 2. every place, every op, the same picture
const start = createInitialState({ worldSeed: "art-1", data: worldData }).state;
const at = (locationId, extra = {}) => {
  const s = structuredClone(start);
  s.actors[s.player.actorId].locationId = locationId;
  return Object.assign(s, extra);
};
for (const locationId of Object.keys(worldData.locations)) {
  assert.ok(SCENE_KEYS.includes(locationId), `${locationId} has its own picture`);
  assert.equal(sceneOf(at(locationId), worldData).key, locationId);
}
assert.equal(sceneOf(at("loc_nowhere"), worldData).key, "road", "a place without a picture is a road");
const allScenes = [];
for (const key of SCENE_KEYS) for (const band of BANDS) for (const marks of [{}, { clear: true }, { fallen: true }, { banner: true }]) allScenes.push({ key, band, marks });
for (const scene of allScenes) {
  const ops = opsOf(scene);
  assert.ok(ops.length > 3, `${scene.key} ${scene.band} draws something`);
  for (const op of ops) assert.ok(DRAWN_OPS.includes(op.op), `${scene.key}: the painter draws ${op.op}`);
  assert.deepEqual(opsOf(structuredClone(scene)), ops, `${scene.key} ${scene.band}: the same scene, the same picture`);
}
assert.ok(opsOf({ key: "loc_village", band: "night", marks: {} }).some((o) => o.op === "moon"));
assert.ok(opsOf({ key: "loc_village", band: "night", marks: {} }).some((o) => o.op === "stars"));
assert.ok(opsOf({ key: "loc_village", band: "day", marks: {} }).some((o) => o.op === "sun"));
assert.ok(!opsOf({ key: "loc_village", band: "night", marks: {} }).some((o) => o.op === "figure"), "nobody by the well at night");

// 3. only what can be seen there
assert.equal(sceneOf(at("loc_forest_spring"), worldData).marks.clear, false, "the spring is fouled at the start");
assert.equal(sceneOf(at("loc_forest_spring", { cases: { case_fouled_well: { stage: "resolved" } } }), worldData).marks.clear, true);
const fell = { facts: { ...start.facts, fact_ending: { value: "frontier_fell", since: 0 } } };
assert.deepEqual(sceneOf(at("loc_village", fell), worldData).marks, { fallen: true });
assert.deepEqual(sceneOf(at("loc_village", { signals: { lord_pact: 1 } }), worldData).marks, { banner: true });
assert.deepEqual(sceneOf(at("loc_village", { ...fell, signals: { lord_pact: 1 } }), worldData).marks, { fallen: true }, "a burnt village flies no banner");
assert.deepEqual(sceneOf(at("loc_market", fell), worldData).marks, {}, "the market does not show the village's fate");
const burnt = opsOf({ key: "loc_village", band: "dusk", marks: { fallen: true } });
assert.ok(burnt.filter((o) => o.op === "house" && o.broken).length >= 3, "the houses burnt");
assert.ok(burnt.some((o) => o.op === "smoke"));
assert.ok(opsOf({ key: "loc_village", band: "day", marks: { banner: true } }).some((o) => o.op === "banner"));
const camp = (band) => sceneOf(at("loc_band_camp", { signals: { band_gathering: 1, band_strength: band }, facts: { ...start.facts, fact_band_size: { value: band > 4 ? "host" : "few", since: 0 } } }), worldData);
assert.deepEqual(camp(1), camp(6), "the camp is the same camp whatever the band's number");
const guarded = new Proxy(at("loc_village"), {
  get(target, key) {
    if (key === "rng") throw new Error("the pictures read the game's roll");
    return target[key];
  }
});
assert.doesNotThrow(() => sceneOf(guarded, worldData));
const before = structuredClone(start);
sceneOf(start, worldData);
marksOf(start, "loc_village");
assert.deepEqual(start, before, "drawing changes nothing");

// 4. the palettes
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
for (const dark of [false, true]) {
  for (const band of BANDS) {
    const P = paletteOf(band, dark);
    assert.deepEqual(Object.keys(P).sort(), [...PALETTE_KEYS].sort(), `${band} ${dark ? "dark" : "light"}: every colour`);
    for (const [k, v] of Object.entries(P)) {
      if (k.endsWith("A")) assert.ok(v >= 0 && v <= 1, `${band} ${k}`);
      else assert.match(v, /^#[0-9a-f]{6}$/, `${band} ${k}`);
    }
    assert.ok(luminance(P.ink) < luminance(P.near), `${band}: ink is darker than the near hills`);
  }
  assert.ok(luminance(paletteOf("night", dark).skyTop) < luminance(paletteOf("day", dark).skyTop), "night is darker than day");
}
for (const band of BANDS) assert.ok(luminance(paletteOf(band, true).skyLow) < luminance(paletteOf(band, false).skyLow), `${band}: the dark theme is darker`);

// 5. the last page
for (const ending of worldData.world.endings) {
  const scene = endingScene(ending.id);
  assert.ok(SCENE_KEYS.includes(scene.key) && scene.key !== "grave", `${ending.id} has its picture`);
}
assert.equal(endingScene("died").key, "grave");
assert.deepEqual(endingScene("end_fell").marks, { fallen: true });
assert.equal(COVER.key, "cover");
assert.equal(COVER.band, "night", "the night I crossed the river");

console.log("V2-Core-158 ui-art.test.js: all checks passed");
