import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility, adoptNewActors } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = actionId => ({ type: 'perform', actionId });
const me = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('gallery-foes', s, { savedAt: 1 }))));
function play(s, action) {
  const r = step(s, action, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
}
const initial = createInitialState({ worldSeed: 'gallery-foes-496', data: worldData }).state;
assert.ok(initial.actors.npc_gallery_brute && initial.actors.npc_gallery_scout);
assert.equal(can(initial, 'act_gallery_brute_read'), false, 'unvisited dungeon cannot leak foes');
const base = structuredClone(initial);
me(base).locationId = 'loc_ruins_gallery';
me(base).inventory.item_lantern = 1;
me(base).inventory.item_iron_sword = 1;
me(base).loadout = { hand: 'item_iron_sword' };
me(base).hp = { current: 80, max: 80 };
me(base).growth.growth_wanderer.skills = { swordsmanship: 5 };
me(base).growth.growth_wanderer.stats.str = 20;
me(base).growth.growth_wanderer.stats.dex = 20;
me(base).growth.growth_wanderer.resources.stamina = { current: 80, max: 80 };
base.flags = { ...base.flags, ruins_watch_gallery_open: true };
assert.ok(can(base, 'act_gallery_brute_read'));
assert.equal(can(base, 'act_gallery_brute_first'), false, 'combat requires an in-person read');
const known = play(base, P('act_gallery_brute_read'));
assert.ok(can(known, 'act_gallery_brute_first'));
assert.deepEqual(save(known), known);
const wrong = play(known, P('act_gallery_brute_second'));
assert.equal(me(wrong).hp.current, me(known).hp.current - 2);
assert.equal(wrong.actors.npc_gallery_brute.hp.current, known.actors.npc_gallery_brute.hp.current);
assert.equal(wrong.signals.gallery_brute_stance, 1);
assert.equal(wrong.rng.cursor, known.rng.cursor + 2);
assert.deepEqual(play(save(known), P('act_gallery_brute_second')), wrong);

let s = known;
for (const key of ['brute', 'scout']) {
  if (key === 'scout') s = play(s, P('act_gallery_scout_read'));
  const id = `npc_gallery_${key}`;
  const startMoney = me(s).money;
  let turns = 0;
  while (s.actors[id].alive && turns < 20) {
    const action = `act_gallery_${key}_${(s.signals?.[`gallery_${key}_stance`] ?? 0) === 0 ? 'first' : 'second'}`;
    assert.ok(can(s, action));
    s = play(s, P(action));
    turns++;
  }
  assert.equal(s.actors[id].alive, false, `${key} must be beatable`);
  assert.equal(me(s).money, startMoney + 2, 'finite per-enemy silver');
  assert.equal(s.flags[`gallery_${key}_defeated`], true);
  assert.equal(can(s, `act_gallery_${key}_read`), false);
  assert.equal(can(s, `act_gallery_${key}_first`), false);
}
assert.equal(s.flags.ruins_gallery_secured, true);
assert.deepEqual(save(s), s);
const repeat = step(s, P('act_gallery_scout_first'), worldData);
assert.ok(repeat.events.some(e => e.type === 'action.rejected'));
const heir = structuredClone(s);
me(heir).alive = false;
heir.pending = { kind: 'newCharacter' };
const inherited = play(heir, { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(inherited.flags.ruins_gallery_secured, true, 'world clearing survives succession');
assert.equal(me(inherited).growth.growth_wanderer.unlocks?.unl_gallery_brute_read, undefined);
assert.equal(JSON.stringify(view(initial, worldData)).includes('gallery_brute_stance'), false);
const legacy = structuredClone(initial);
delete legacy.actors.npc_gallery_brute;
delete legacy.actors.npc_gallery_scout;
const migrated = adoptNewActors(legacy, worldData);
assert.ok(migrated.state.actors.npc_gallery_brute && migrated.state.actors.npc_gallery_scout);
console.log('Gallery foes PASS: two physical enemies, distinct tells, finite loot, deterministic combat, Save, heir and legacy actors');
