// A personally learned sword tempo break exhausts a living foe's finite stamina.
// The chamber's physical discovery persists, but the technique never passes to an heir.
import assert from 'node:assert/strict';
import { createInitialState, step, view, validateState, checkDataCompatibility } from '../../web/v2/core/engine.js';
import { buildSaveRecord, parseLoadedRecord } from '../../web/v2/storage/idb.js';
import { worldData } from '../../web/v2/data/world.js';

const actor = s => s.actors[s.player.actorId];
const growth = s => actor(s).growth.growth_wanderer;
const perform = actionId => ({ type: 'perform', actionId });
const choose = optionId => ({ type: 'choose', optionId });
const rejected = r => r.events.some(e => e.type === 'action.rejected');
const available = (s, id) => view(s, worldData).actions.some(a => a.actionId === id && a.available);
const save = s => parseLoadedRecord(JSON.parse(JSON.stringify(buildSaveRecord('tempo-break', s, { savedAt: 1 }))));
function run(s, action) {
  const r = step(s, action, worldData);
  assert.equal(rejected(r), false, JSON.stringify(r.events));
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(checkDataCompatibility(r.state, worldData), []);
  return r;
}
const start = createInitialState({ worldSeed: 'tempo-break-493', data: worldData }).state;
actor(start).locationId = 'loc_ruins_signal_chamber';
actor(start).money = 10;
actor(start).inventory.item_iron_sword = 1;
actor(start).loadout = { hand: 'item_iron_sword' };
growth(start).skills = { swordsmanship: 1 };
start.flags = { ...start.flags, ruins_signal_chamber_open: true, ruins_signal_chamber_resolved: true };
const trainingId = 'act_ruins_signal_learn_tempo_break';
assert.equal(available(start, trainingId), true, 'a resolved chamber teaches a new sword tactic');
for (const modify of [
  s => { s.flags.ruins_signal_chamber_resolved = false; },
  s => { delete actor(s).loadout; },
  s => { growth(s).skills.swordsmanship = 0; },
  s => { growth(s).resources.stamina.current = 1; },
  s => { actor(s).money = 1; }
]) {
  const s = structuredClone(start); modify(s);
  assert.equal(available(s, trainingId), false, 'no free or premature mastery');
  assert.ok(rejected(step(s, perform(trainingId), worldData)));
}
const learned = run(start, perform(trainingId)).state;
assert.equal(growth(learned).unlocks.unl_tempo_break, true);
assert.equal(actor(learned).money, 8);
assert.equal(growth(learned).resources.stamina.current, 4);
assert.equal(learned.time.minute - start.time.minute, 90);
assert.equal(available(learned, trainingId), false, 'training cannot be farmed');
assert.deepEqual(learned.rng, start.rng, 'learning does not consume random numbers');
assert.deepEqual(save(learned), learned);
const heirStart = structuredClone(learned);
actor(heirStart).alive = false;
heirStart.pending = { kind: 'newCharacter' };
const heir = run(heirStart, { type: 'startCharacter', templateId: 'start_wanderer' }).state;
assert.equal(growth(heir).unlocks?.unl_tempo_break, undefined);
assert.equal(heir.flags.ruins_signal_chamber_resolved, true, 'world history persists');

const fight = structuredClone(learned);
actor(fight).locationId = 'loc_ruins';
actor(fight).hp = { current: 50, max: 50 };
growth(fight).resources.stamina.current = 6;
fight.actors.npc_bandit_leader.hp = { current: 50, max: 50 };
fight.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current = 3;
fight.pending = { kind: 'choice', choiceId: 'choice_fight_leader', sourceId: 'act_fight_leader' };
const optionId = 'opt_fight_tempo_break';
assert.ok(worldData.choices.choice_fight_leader.options.some(o => o.id === optionId));
for (const modify of [
  s => { delete growth(s).unlocks.unl_tempo_break; },
  s => { delete actor(s).loadout; },
  s => { growth(s).resources.stamina.current = 1; },
  s => { s.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current = 2; }
]) {
  const s = structuredClone(fight); modify(s);
  assert.ok(rejected(step(s, choose(optionId), worldData)), 'technique requires mastery, sword and both combatants stamina');
}
let won;
for (let seed = 1; seed <= 80; seed++) {
  const s = structuredClone(fight); s.rng.seed = seed;
  const r = run(s, choose(optionId));
  const tier = r.events.find(e => e.type === 'check.resolved')?.data.tier;
  if (['great', 'success'].includes(tier)) { won = { before: s, after: r.state, tier, seed }; break; }
}
assert.ok(won, 'at least one successful tempo break');
assert.equal(won.after.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current, 0);
assert.equal(growth(won.after).resources.stamina.current, 4);
assert.equal(won.after.rng.cursor, won.before.rng.cursor + 2);
assert.ok(won.after.actors.npc_bandit_leader.hp.current < 50);
assert.deepEqual(run(won.before, choose(optionId)).state, won.after);
assert.deepEqual(save(won.after), won.after);

// Exhausting the opponent matters on a later exchange: identical failed strikes
// deal one less HP loss when the enemy can no longer afford a heavy blow.
let failSeed;
for (let seed = 1; seed <= 150; seed++) {
  const s = structuredClone(won.after); s.rng.seed = seed; s.rng.cursor = 0;
  const r = run(s, choose('opt_fight_strike'));
  if (r.events.find(e => e.type === 'check.resolved')?.data.tier === 'fail') { failSeed = seed; break; }
}
assert.ok(failSeed, 'a failed follow-up strike exists');
const exhausted = structuredClone(won.after);
exhausted.rng.seed = failSeed; exhausted.rng.cursor = 0;
const readyFoe = structuredClone(exhausted);
readyFoe.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current = 3;
const afterExhausted = run(exhausted, choose('opt_fight_strike')).state;
const afterReady = run(readyFoe, choose('opt_fight_strike')).state;
assert.equal(actor(afterExhausted).hp.current, actor(afterReady).hp.current + 1,
  'enemy cannot perform heavy blow after stamina disruption');
assert.equal(afterExhausted.actors.npc_bandit_leader.growth.growth_wanderer.resources.stamina.current, 0);

for (const key of ['chief', 'right_hand']) {
  const option = worldData.choices.choice_final_battle.options.find(o => o.id === `opt_final_${key}_tempo_break`);
  assert.ok(option, `the ${key} can be exhausted in the final battle`);
  assert.ok(option.requires, 'personal unlock and stamina gates apply');
  assert.equal(option.outcomes.success[0].add, -2);
}
assert.equal(JSON.stringify(view(learned, worldData)).includes('npc_ruins_raider'), false, 'hidden NPC identity not projected');
console.log(`Tempo break: training, heir separation, combat stamina ${3}->0, heavy blow prevention, RNG, Save PASS (seed ${won.seed})`);
