// J3: canonical multi-source evidence must override stale legacy `source`.
import assert from 'node:assert/strict';
import { linkedCaseLedger, linkedCasePatrolLead } from '../../web/v2/ui/linked-case-ledger.js';
import { worldData } from '../../web/v2/data/world.js';

const known = (rumorId, source) => ({
  rumorId, factId: worldData.rumors[rumorId].factId,
  claim: worldData.rumors[rumorId].claim,
  source, sources: [source], confidence: 60,
  firstSeenDay: 0, lastSeenDay: 0, aboutDay: 0
});
const base = {
  rum_ruins_secret: known('rum_ruins_secret', 'npc_elder'),
  rum_well_source: known('rum_well_source', 'npc_herbalist')
};
const observed = known('rum_spring_bandits', 'obs_loc_forest_spring');
const staleLegacy = { ...observed, sources: ['npc_herbalist'] };
const ledger = linkedCaseLedger({ ...base, rum_spring_bandits: staleLegacy }, worldData);
assert.equal(ledger.observed, false,
  'a stale legacy source must not grant field observation when sources[] says hearsay');
assert.equal(linkedCaseLedger({ ...base, rum_spring_bandits: observed }, worldData).observed, true);
const singleSource = { ...observed };
delete singleSource.sources;
assert.equal(linkedCaseLedger({ ...base, rum_spring_bandits: singleSource }, worldData).observed, true,
  'historical single-source saves must still work');

const trap = known('rum_spring_trap_mark', 'npc_elder');
const fakeElder = { ...trap, sources: ['obs_loc_forest_spring'] };
const playerView = {
  actor: { id: 'player_1', locationId: 'loc_forest_spring' },
  relations: { 'npc_elder:player_1': { tags: ['spring_arrows_reported'] } },
  knowledge: { rum_spring_trap_mark: fakeElder },
  actions: [{ actionId: 'act_enc_spring_trap_mark', available: true }]
};
const confirmedLedger = linkedCaseLedger({ ...base, rum_spring_bandits: observed }, worldData);
assert.equal(linkedCasePatrolLead(confirmedLedger, playerView, worldData, 0), null,
  'stale legacy elder source must not grant an elder-told patrol lead');
assert.equal(linkedCasePatrolLead(confirmedLedger, {
  ...playerView, knowledge: { rum_spring_trap_mark: trap }
}, worldData, 0)?.verified, false);
console.log('J3 canonical source consistency and legacy fallback: PASS');
