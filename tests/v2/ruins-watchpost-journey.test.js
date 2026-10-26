import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { evaluateCondition } from '../../web/v2/core/rules.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const action = actionId => ({ type: 'perform', actionId });
const actor = s => s.actors[s.player.actorId];
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const linkVisible = (s, to) => {
  const path = worldData.locations[actor(s).locationId]?.links.find(l => l.to === to);
  return Boolean(path) && evaluateCondition(path.requires, { state: s, data: worldData, actorId: s.player.actorId, contextKind: 'player' });
};
const roundTrip = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('watchpost', s, { savedAt: 1 }))));
function run(s, a) {
  const result = step(s, a, worldData);
  assert.ok(!result.events.some(e => e.type === 'action.rejected'), JSON.stringify({ action: a, events: result.events }));
  assert.deepEqual(validateState(result.state), []);
  assert.deepEqual(checkDataCompatibility(result.state, worldData), []);
  return result;
}
function successful(s, id, wantSuccess = true) {
  for (let seed = 1; seed < 1000; seed++) {
    const before = structuredClone(s);
    before.rng.seed = seed;
    const result = run(before, action(id));
    const tier = result.events.find(e => e.type === 'check.resolved')?.data.tier;
    if (['great', 'success'].includes(tier) === wantSuccess) return { before, after: result.state, seed, tier };
  }
  assert.fail(`No ${wantSuccess ? 'success' : 'failure'} for ${id}`);
}
const initial = createInitialState({ worldSeed: 'ruins-watchpost-477', data: worldData }).state;
assert.equal(available(initial, 'act_ruins_watch_find_gallery'), false);
assert.equal(linkVisible(initial, 'loc_ruins_watchpost'), false);
const base = structuredClone(initial);
actor(base).locationId = 'loc_ruins_lower_vault';
actor(base).inventory.item_lantern = 1;
actor(base).inventory.item_iron_sword = 1;
actor(base).growth.growth_wanderer.skills = { investigation: 1, swordsmanship: 1 };
actor(base).growth.growth_wanderer.unlocks = { unl_ruins_lower_route: true };
base.flags = { ruins_cellar_resolved: true, ruins_lower_open: true, ruins_lower_resolved: true, ruins_lower_patrol_safe: true, ruins_cellar_refuge: true };
base.signals = { ...(base.signals ?? {}), road_trouble: 1 };
let start = run(base, action('act_equip_iron_sword')).state;
assert.equal(available(start, 'act_ruins_watch_find_gallery'), true);
const found = successful(start, 'act_ruins_watch_find_gallery');
assert.equal(found.after.flags.ruins_watch_gallery_open, true);
assert.deepEqual(successful(found.before, 'act_ruins_watch_find_gallery').after, found.after);
assert.equal(found.after.rng.cursor, found.before.rng.cursor + 2);
assert.equal(linkVisible(found.after, 'loc_ruins_gallery'), true);
const gallery = run(found.after, { type: 'move', to: 'loc_ruins_gallery' }).state;
assert.equal(available(gallery, 'act_ruins_watch_sneak'), true);
assert.equal(available(gallery, 'act_ruins_watch_breach'), true);
assert.equal(linkVisible(gallery, 'loc_ruins_watchpost'), false);
const sneaked = successful(gallery, 'act_ruins_watch_sneak');
const breached = successful(gallery, 'act_ruins_watch_breach');
assert.equal(sneaked.after.flags.ruins_watchpost_open, true);
assert.equal(sneaked.after.flags.ruins_watchpost_noisy, undefined);
assert.equal(breached.after.flags.ruins_watchpost_noisy, true);
assert.deepEqual(roundTrip(sneaked.after), sneaked.after);
const failure = successful(gallery, 'act_ruins_watch_sneak', false);
assert.equal(failure.after.flags.ruins_watchpost_open, undefined);
assert.equal(failure.after.signals.ruins_watch_alarm, 1);
const alarmed = structuredClone(gallery);
alarmed.signals.ruins_watch_alarm = 2;
assert.equal(available(alarmed, 'act_ruins_watch_sneak'), false);
const calmed = run(alarmed, action('act_ruins_watch_wait')).state;
assert.equal(calmed.signals.ruins_watch_alarm, 1);
assert.deepEqual(calmed.rng, alarmed.rng);

const quietPost = run(sneaked.after, { type: 'move', to: 'loc_ruins_watchpost' }).state;
const loudPost = run(breached.after, { type: 'move', to: 'loc_ruins_watchpost' }).state;
assert.equal(available(quietPost, 'act_ruins_watch_restore_quiet'), true);
assert.equal(available(quietPost, 'act_ruins_watch_restore_noisy'), false);
assert.equal(available(loudPost, 'act_ruins_watch_restore_noisy'), true);
assert.equal(available(loudPost, 'act_ruins_watch_restore_quiet'), false);
const quiet = run(quietPost, action('act_ruins_watch_restore_quiet')).state;
const loud = run(loudPost, action('act_ruins_watch_restore_noisy')).state;
assert.equal(quiet.flags.ruins_watchpost_restored, true);
assert.equal(loud.flags.ruins_watchpost_restored, true);
assert.equal(actor(quiet).money - actor(loud).money, 3);
assert.equal(quiet.signals.road_trouble, 0);
assert.equal(linkVisible(quiet, 'loc_village'), true);
assert.equal(available(quiet, 'act_ruins_watch_loot'), false);
assert.deepEqual(roundTrip(quiet), quiet);
const village = run(quiet, { type: 'move', to: 'loc_village' }).state;
assert.equal(available(village, 'act_ruins_watch_report'), true);
const reported = run(village, action('act_ruins_watch_report')).state;
assert.equal(available(reported, 'act_ruins_watch_report'), false);
assert.equal(reported.flags.ruins_watchpost_reported, true);

const loot = run(quietPost, action('act_ruins_watch_loot')).state;
assert.equal(loot.flags.ruins_watchpost_looted, true);
assert.equal(loot.flags.ruins_watchpost_restored, undefined);
assert.equal(loot.signals.road_trouble, 2);
assert.equal(available(loot, 'act_ruins_watch_restore_quiet'), false);
assert.equal(linkVisible(loot, 'loc_village'), false);
assert.deepEqual(roundTrip(loot), loot);
const dead = structuredClone(quiet);
actor(dead).alive = false;
dead.pending = { kind: 'newCharacter' };
const heir = run(dead, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(heir.flags.ruins_watchpost_restored, true);
assert.equal(actor(heir).growth.growth_wanderer.skills?.investigation, undefined);
assert.equal(linkVisible(heir, 'loc_ruins_watchpost'), true); // physical public passage, not private knowledge
assert.equal(available(heir, 'act_ruins_watch_find_gallery'), false);
console.log(`Ruins watchpost: survey=${found.seed}, stealth=${sneaked.seed}, combat=${breached.seed}, failure=${failure.seed}, branch costs, persistent route, Save, RNG, heir PASS`);
