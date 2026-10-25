// Offensive sword training creates a second, riskier combat build without changing Save shape.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';
const P = (actionId) => ({ type: 'perform', actionId });
const C = (optionId) => ({ type: 'choose', optionId });
const me = (s) => s.actors[s.player.actorId];
const growth = (s) => me(s).growth.growth_wanderer;
const offered = (s, id) => view(s, worldData).actions.some((a) => a.actionId === id && a.available);
const rejected = (r) => r.events.some((e) => e.type === 'action.rejected');
const saveRoundtrip = (s) => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('breakthrough', s, { savedAt: 1 }))));
function ready() {
  const s = createInitialState({ worldSeed: 'breakthrough-464', data: worldData }).state;
  me(s).locationId = 'loc_castle_town';
  me(s).money = 40;
  me(s).inventory.item_iron_sword = 1;
  me(s).loadout = { hand: 'item_iron_sword' };
  me(s).hp = { current: 10, max: 10 };
  growth(s).skills = { swordsmanship: 2 };
  growth(s).proficiency = { combat: 40 };
  growth(s).resources.stamina.current = 6;
  return s;
}
const novice = ready();
assert.equal(offered(novice, 'act_castle_breakthrough_trial'), true);
for (const change of [
  (s) => { growth(s).skills.swordsmanship = 1; },
  (s) => { delete me(s).loadout; },
  (s) => { me(s).money = 3; },
  (s) => { growth(s).resources.stamina.current = 2; }
]) {
  const s = structuredClone(novice); change(s);
  assert.equal(offered(s, 'act_castle_breakthrough_trial'), false, 'training gates');
  assert.ok(rejected(step(s, P('act_castle_breakthrough_trial'), worldData)));
}
let learned;
let missed;
for (let i = 1; i < 400 && (!learned || !missed); i++) {
  const s = structuredClone(novice); s.rng.seed = i;
  const r = step(s, P('act_castle_breakthrough_trial'), worldData);
  assert.equal(rejected(r), false);
  assert.equal(me(r.state).money, 36);
  assert.equal(growth(r.state).resources.stamina.current, 3);
  assert.equal(r.state.time.minute - s.time.minute, 120);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  const tier = r.events.find((e) => e.type === 'check.resolved')?.data.tier;
  if (tier === 'great' || tier === 'success') learned = r.state;
  else missed = r.state;
}
assert.ok(learned, 'successful training seed exists');
assert.ok(missed, 'failed training seed exists');
assert.equal(growth(learned).unlocks.unl_breakthrough_cut, true);
assert.equal(offered(learned, 'act_castle_breakthrough_trial'), false, 'no repeat qualification');
assert.notEqual(growth(missed).unlocks?.unl_breakthrough_cut, true);
assert.equal(offered(missed, 'act_castle_breakthrough_trial'), true, 'failure can retry');
assert.deepEqual(saveRoundtrip(learned), learned);
assert.equal(learned.flags?.unl_breakthrough_cut, undefined, 'unlock is personal');
const fight = structuredClone(learned);
me(fight).locationId = 'loc_ruins';
me(fight).hp = { current: 99, max: 99 };
fight.actors.npc_bandit_leader.hp = { current: 99, max: 99 };
growth(fight).resources.stamina.current = 6;
fight.pending = { kind: 'choice', choiceId: 'choice_fight_leader', sourceId: 'act_fight_leader' };
const attack = step(fight, C('opt_fight_breakthrough'), worldData);
assert.equal(rejected(attack), false);
assert.equal(growth(attack.state).resources.stamina.current, 3);
assert.equal(attack.state.time.minute - fight.time.minute, 5);
assert.deepEqual(step(fight, C('opt_fight_breakthrough'), worldData).state, attack.state, 'same seed and choice');
assert.deepEqual(saveRoundtrip(attack.state), attack.state);
const unarmed = structuredClone(fight); delete me(unarmed).loadout;
assert.ok(rejected(step(unarmed, C('opt_fight_breakthrough'), worldData)), 'must wield sword');
const noSkill = structuredClone(fight); delete growth(noSkill).unlocks.unl_breakthrough_cut;
assert.ok(rejected(step(noSkill, C('opt_fight_breakthrough'), worldData)), 'personal unlock');
const tired = structuredClone(fight); growth(tired).resources.stamina.current = 2;
assert.ok(rejected(step(tired, C('opt_fight_breakthrough'), worldData)), 'stamina gate');
for (const key of ['chief', 'right_hand']) {
  const option = worldData.choices.choice_final_battle.options.find((o) => o.id === `opt_final_${key}_breakthrough`);
  assert.ok(option, `final ${key} offensive technique`);
  assert.equal(option.outcomes.success[0].add, -3);
}
console.log('Castle breakthrough: gated training, success/failure, risky combat, deterministic Save: PASS');
