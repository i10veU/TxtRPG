import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const P = actionId => ({ type: 'perform', actionId });
const me = s => s.actors[s.player.actorId];
const can = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const play = (s, a) => {
  const r = step(s, a, worldData);
  assert.ok(!r.events.some(e => e.type === 'action.rejected'), JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r.state;
};
const saved = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('guide-convoy', s, { savedAt: 1 }))));
const start = createInitialState({ worldSeed: 'guide-convoy-483', data: worldData }).state;
start.flags = { north_road_guided: true, ruins_raider_cleared: true, ruins_raider_guide_recruited: true };
start.signals = { ...start.signals, north_trade_stage: 1, north_trade_stock: 2, road_trouble: 2 };
start.actors.npc_ruins_raider.locationId = 'loc_river_ford';
me(start).locationId = 'loc_river_ford';
me(start).inventory.item_mill_bread = 5;
me(start).money = 10;
me(start).growth.growth_wanderer.skills = { investigation: 1, swordsmanship: 1 };
me(start).growth.growth_wanderer.stats = { ...me(start).growth.growth_wanderer.stats, per: 30, str: 30 };
me(start).inventory.item_iron_sword = 1;
me(start).inventory.item_lantern = 1;
me(start).loadout = { slot_hand: 'item_iron_sword' };

assert.equal(can(start, 'act_ruins_guide_board_convoy'), true);
assert.equal(can(start, 'act_ruins_guide_scout_convoy'), false);
assert.equal(can(start, 'act_ruins_guide_defend_convoy'), false);
const boarded = play(start, P('act_ruins_guide_board_convoy'));
assert.equal(me(boarded).locationId, 'loc_far_bank');
assert.equal(boarded.actors.npc_ruins_raider.locationId, 'loc_far_bank');
assert.equal(boarded.flags.ruins_guide_on_convoy, true);
assert.equal(me(boarded).inventory.item_mill_bread, 4);
assert.equal(can(boarded, 'act_ruins_guide_board_convoy'), false);
assert.deepEqual(saved(boarded), boarded);
assert.equal(JSON.stringify(view(boarded, worldData)).includes('npc_ruins_raider'), false);

const scout = play(boarded, P('act_ruins_guide_scout_convoy'));
assert.equal(scout.signals.north_trade_stage, 2, 'investigation path moves the actual wagon');
assert.equal(scout.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(me(scout).locationId, 'loc_mill_hamlet');
assert.equal(scout.signals.road_trouble, 1);
assert.equal(scout.signals.north_trade_stock, 2, 'no cargo is created');
assert.equal(can(scout, 'act_ruins_guide_scout_convoy'), false);
assert.deepEqual(scout, play(boarded, P('act_ruins_guide_scout_convoy')));
assert.deepEqual(saved(scout), scout);

const defend = play(boarded, P('act_ruins_guide_defend_convoy'));
assert.equal(defend.signals.north_trade_stage, 2);
assert.equal(defend.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
assert.equal(me(defend).locationId, 'loc_mill_hamlet');
assert.ok(me(defend).money > me(boarded).money, 'combat path earns a finite caravan wage');
assert.ok(defend.signals.north_trade_stock <= boarded.signals.north_trade_stock);
assert.deepEqual(saved(defend), defend);
assert.notEqual(me(defend).money, me(scout).money, 'career branches have different economic outcomes');
assert.notEqual(me(defend).growth.growth_wanderer.proficiency?.combat ?? 0,
  me(scout).growth.growth_wanderer.proficiency?.combat ?? 0, 'combat route teaches combat');

// Public relief receives one EXISTING cargo bundle, not a free shipment.
const relief = structuredClone(boarded);
relief.flags.north_supply_relief_pact = true;
relief.signals.north_relief_losses = 2;
relief.signals.north_mill_relief_stock = 0;
relief.fired.evt_north_waystation_relief_delivery = { count: 1, lastMinute: relief.time.minute };
const delivered = play(relief, P('act_ruins_guide_scout_convoy'));
assert.equal(delivered.signals.north_trade_stock, 1);
assert.equal(delivered.signals.north_mill_relief_stock, 1);
assert.equal(delivered.signals.north_trade_stock + delivered.signals.north_mill_relief_stock, 2);
assert.deepEqual(saved(delivered), delivered);

// A failed skill check cannot teleport the wagon, duplicate cargo, or mint wages.
let failed;
for (let seed = 1; seed <= 80 && !failed; seed++) {
  const low = structuredClone(boarded);
  low.rng.seed = seed;
  low.rng.cursor = 0;
  me(low).growth.growth_wanderer.stats.per = 0;
  me(low).growth.growth_wanderer.skills.investigation = 1;
  const r = step(low, P('act_ruins_guide_scout_convoy'), worldData);
  if (r.state.signals.north_trade_stage === 1) failed = { before: low, after: r.state };
}
assert.ok(failed, 'at least one deterministic seed must fail a weak investigation');
assert.equal(failed.after.signals.north_trade_stock, failed.before.signals.north_trade_stock);
assert.equal(failed.after.actors.npc_ruins_raider.locationId, 'loc_far_bank');
assert.equal(failed.after.actors[failed.after.player.actorId].locationId, 'loc_far_bank');
assert.deepEqual(saved(failed.after), failed.after);

// A merchant that leaves on its own takes the already-boarded guide along;
// when the real caravan returns to the castle, the guide returns to the ford.
const safe = structuredClone(boarded);
safe.signals.road_trouble = 0;
const autoArrive = play(safe, { type: 'wait', minutes: 1440 });
assert.equal(autoArrive.signals.north_trade_stage, 2);
assert.equal(autoArrive.actors.npc_ruins_raider.locationId, 'loc_mill_hamlet');
const returned = play(autoArrive, { type: 'wait', minutes: 1440 });
assert.equal(returned.signals.north_trade_stage, 0);
assert.equal(returned.actors.npc_ruins_raider.locationId, 'loc_river_ford');
assert.equal(returned.flags.ruins_guide_on_convoy, false);
assert.deepEqual(saved(returned), returned);
const replayFromSave = play(saved(autoArrive), { type: 'wait', minutes: 1440 });
assert.deepEqual(replayFromSave, returned, 'loaded autonomous journey is deterministic');
const splitWait = play(play(safe, { type: 'wait', minutes: 720 }), { type: 'wait', minutes: 720 });
assert.equal(splitWait.signals.north_trade_stage, autoArrive.signals.north_trade_stage);
assert.equal(splitWait.actors.npc_ruins_raider.locationId, autoArrive.actors.npc_ruins_raider.locationId);

// Guide's new career persists for successors, but personal training does not.
const heir = play({ ...structuredClone(returned), pending: { kind: 'newCharacter' } },
  { type: 'startCharacter', templateId: 'start_wanderer' });
assert.equal(heir.flags.ruins_raider_guide_recruited, true);
assert.equal(heir.flags.ruins_guide_on_convoy, false);
assert.equal(heir.actors.npc_ruins_raider.locationId, 'loc_river_ford');
assert.equal(can(heir, 'act_ruins_guide_scout_convoy'), false);
console.log('Guide convoy: embark, investigate/combat route, autonomous travel/return, finite cargo, Save, heir, replay PASS');
