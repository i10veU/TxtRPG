// V2-Core-137 (D-115, World Bible WB-0030 Q6): additive actor migration -- adoptNewActors(state, data).
//   1. an NPC actor the pack defines but the state lacks is seeded exactly as a new game seeds it; nothing else moves
//   2. the input is never mutated; a second call adds nothing and returns the same object
//   3. an actor the state already has is never touched, dead or alive
//   4. a state with no actor map (no character yet) is returned as is
//   5. the adopted state is valid, compatible with the pack, saves and loads, and steps deterministically; the RNG
//      cursor is untouched (seeding draws no random number)
//   6. the real pack: its old-save fixture already has every actor -- nothing is added
// Synthetic, abstract data only (§17 fixtures rule). node:assert/strict only (§13.1).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adoptNewActors, checkDataCompatibility, createInitialState, step, validateState } from "../../web/v2/core/engine.js";
import { buildSaveRecord, parseLoadedRecord } from "../../web/v2/storage/idb.js";
import { worldData } from "../../web/v2/data/world.js";

const BASE = {
  formatVersion: 1,
  id: "adopt_pack",
  version: "1.0.0",
  world: { id: "world_a", startTemplateId: "tmpl_a" },
  characterTemplates: { tmpl_a: { kind: "player", locationId: "loc_a", hp: { max: 10 }, money: 1 } },
  npcs: {
    npc_old: { name: "old", actor: { locationId: "loc_a", hp: { max: 5 } } },
    npc_talk: { name: "talker" } // dialogue only, no actor
  },
  locations: { loc_a: { name: "a", links: [] } }
};
// the same pack (same id and version, D-68), one actor added later
const LATER = {
  ...BASE,
  npcs: { ...BASE.npcs, npc_new: { name: "new", actor: { locationId: "loc_a", hp: { max: 7 }, money: 3, inventory: { item_x: 1 }, tags: ["tag_t"] } } }
};
const WAIT = { type: "wait", minutes: 90 };
const run = (s, n, data) => {
  for (let i = 0; i < n; i += 1) s = step(s, WAIT, data).state;
  return s;
};

// 1. a save from before npc_new, played for a while
const old = run(createInitialState({ worldSeed: "seed-a", data: BASE }).state, 5, BASE);
assert.equal(old.actors.npc_new, undefined);
const before = structuredClone(old);
const { state: adopted, added } = adoptNewActors(old, LATER);
assert.deepEqual(added, ["npc_new"]);
assert.deepEqual(adopted.actors.npc_new, createInitialState({ worldSeed: "seed-a", data: LATER }).state.actors.npc_new, "as a new game seeds it");
assert.equal(adopted.actors.npc_new.alive, true);
const { npc_new: _ignored, ...restActors } = adopted.actors;
assert.deepEqual({ ...adopted, actors: restActors }, old, "nothing else moves");

// 2. pure and idempotent
assert.deepEqual(old, before, "the input is not mutated");
const again = adoptNewActors(adopted, LATER);
assert.equal(again.state, adopted, "same object when nothing is added");
assert.deepEqual(again.added, []);
assert.equal(adoptNewActors(old, BASE).state, old, "a pack with nothing new adds nothing");

// 3. an existing actor is never touched, dead or alive
const dead = structuredClone(old);
dead.actors.npc_old.alive = false;
dead.actors.npc_old.hp.current = 0;
dead.actors.npc_old.locationId = "loc_elsewhere";
const kept = adoptNewActors(dead, LATER).state;
assert.deepEqual(kept.actors.npc_old, dead.actors.npc_old);

// 4. no character yet: nothing to adopt into
const bare = { schemaVersion: old.schemaVersion, worldSeed: "seed-a", rng: old.rng, time: { minute: 0 } };
assert.equal(adoptNewActors(bare, LATER).state, bare);
assert.equal(adoptNewActors(null, LATER).state, null);

// 5. valid, compatible, saved and loaded, deterministic; the RNG untouched
assert.deepEqual(validateState(adopted), []);
assert.deepEqual(checkDataCompatibility(adopted, LATER), []);
assert.deepEqual(adopted.rng, old.rng, "seeding draws nothing from the world's RNG");
const loaded = parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord("slot_adopt", adopted, { savedAt: 1 }))));
assert.deepEqual(loaded, adopted);
assert.deepEqual(run(loaded, 3, LATER), run(adopted, 3, LATER), "the same input, the same world");
// adopting later or earlier gives the same actor: it depends on the definition only
const playedLonger = adoptNewActors(run(old, 7, BASE), LATER).state;
assert.deepEqual(playedLonger.actors.npc_new, adopted.actors.npc_new);

// 6. the real pack: its old-save fixture predates the chief's right hand (V2-Core-140) -- adopted as a new game seeds him,
// and nothing else in the save changes
const fixture = JSON.parse(readFileSync(new URL("./fixtures/save-before-ford-and-town.json", import.meta.url), "utf8"));
const realOld = parseLoadedRecord(fixture);
const real = adoptNewActors(realOld, worldData);
assert.deepEqual(real.added, ["npc_band_lieutenant", "npc_cistern_warden", "npc_gallery_brute", "npc_gallery_scout", "npc_ruins_raider"]);
assert.deepEqual(real.state.actors.npc_band_lieutenant, createInitialState({ worldSeed: "any", data: worldData }).state.actors.npc_band_lieutenant);
const { npc_band_lieutenant: _lieutenant, npc_ruins_raider: _raider, npc_gallery_brute: _brute, npc_gallery_scout: _scout, npc_cistern_warden: _warden, ...realActors } = real.state.actors;
assert.deepEqual({ ...real.state, actors: realActors }, realOld);
assert.deepEqual(adoptNewActors(real.state, worldData).added, [], "once");

console.log("V2-Core-137 actor-adoption.test.js: all checks passed");
