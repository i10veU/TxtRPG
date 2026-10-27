// Two mutually exclusive, character-owned field careers. Existing chart,
// swordsmanship, physical courier and waterway states supply all prerequisites.
// Neither career changes the World Bible or grants a successor private knowledge.
const at = id => ({ op: 'location', at: id });
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const flag = key => ({ op: 'flag', key });
const unlock = id => ({ op: 'unlock', id });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const say = textId => ({ op: 'narrate', textId });
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const uncommitted = and(not(unlock('unl_ford_surveyor')), not(unlock('unl_ford_vanguard')));
const route = and(at('loc_river_ford'), unlock('unl_ford_flood_route'),
  not(flag('ford_flood_decided')),
  { op: 'location', subject: 'npc_ford_grain_runner', at: 'loc_river_ford' },
  { op: 'item', subject: 'npc_ford_grain_runner', item: 'item_waystation_supply_crate', min: 1 });
const waymarks = and(unlock('unl_ford_surveyor'), unlock('unl_ford_flood_route'),
  flag('ford_flood_beacons'), stamina(1));

export const ruinsFieldDisciplines = {
  actions: {
    act_mill_join_ford_surveyors: {
      name: '물레방아 마을에서 물길 조사관으로 전문화한다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), uncommitted,
        unlock('unl_cistern_flood_chart'), { op: 'skill', skill: 'investigation', min: 1 },
        { op: 'money', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -2 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'unlock', id: 'unl_ford_surveyor' },
        { op: 'proficiency', id: 'investigation', add: 12 }, say('txt_ford_surveyor_joined')]
    },
    act_mill_join_ford_vanguard: {
      name: '물레방아 마을에서 호위 검객으로 전문화한다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), uncommitted,
        { op: 'skill', skill: 'swordsmanship', min: 1 }, sword,
        { op: 'money', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -2 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'unlock', id: 'unl_ford_vanguard' },
        { op: 'proficiency', id: 'combat', add: 12 }, say('txt_ford_vanguard_joined')]
    },
    act_ford_surveyor_mark_safe_current: {
      name: '조사관의 수류 지식으로 안전한 강둑 표식을 세운다 (은화 1, 기력 1, 60분)',
      requires: and(route, unlock('unl_ford_surveyor'),
        unlock('unl_cistern_flood_chart'), { op: 'money', min: 1 }, stamina(1)),
      minutes: 60,
      effects: [{ op: 'money', add: -1 }, { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ford_flood_decided', value: true },
        { op: 'flag', key: 'ford_flood_beacons', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 2 },
        { op: 'proficiency', id: 'investigation', add: 10 }, say('txt_ford_surveyor_marked')]
    },
    act_ford_vanguard_escort_runner: {
      name: '호위 검객으로 급류 옆을 지키며 심부름꾼을 호위한다 (기력 3, 75분)',
      requires: and(route, unlock('unl_ford_vanguard'), sword, stamina(3)),
      minutes: 75,
      effects: [{ op: 'resource', resource: 'stamina', add: -3 },
        { op: 'flag', key: 'ford_flood_decided', value: true },
        { op: 'flag', key: 'ford_flood_guarded', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 2 },
        { op: 'proficiency', id: 'combat', add: 10 }, say('txt_ford_vanguard_escorted')]
    },
    act_ford_surveyor_follow_waymarks: {
      name: '조사관의 경고 표식을 따라 강나루에서 물레방아 마을로 이동한다 (기력 1, 25분)',
      requires: and(at('loc_river_ford'), waymarks), minutes: 25,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'move', to: 'loc_mill_hamlet' }, say('txt_ford_surveyor_crossed')]
    },
    act_mill_surveyor_return_waymarks: {
      name: '조사관의 경고 표식을 따라 물레방아 마을에서 강나루로 이동한다 (기력 1, 25분)',
      requires: and(at('loc_mill_hamlet'), waymarks), minutes: 25,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'move', to: 'loc_river_ford' }, say('txt_ford_surveyor_crossed')]
    }
  },
  texts: {
    txt_ford_surveyor_joined: '배수 기록과 물길 지식을 인정받아 물길 조사관이 되었다. 위험한 강가에서 더 적은 자재로 표식을 세우고, 안전한 표식이 남아 있으면 지름길을 이용할 수 있다.',
    txt_ford_vanguard_joined: '실전 검술을 인정받아 호위 검객이 되었다. 예고된 내려치기를 안정적으로 받아치고, 강가의 심부름꾼을 직접 호위할 수 있다.',
    txt_ford_surveyor_marked: '흐름을 계산해 최소한의 자재로 안전한 물길에 경고 표식을 남겼다. 실제 심부름꾼의 이동은 시간이 흐른 뒤 확인해야 한다.',
    txt_ford_vanguard_escorted: '검을 들고 급류 옆에서 심부름꾼의 이동을 지켰다. 강둑 표식은 세우지 않았으므로 공용 지름길은 남지 않는다.',
    txt_ford_surveyor_crossed: '내가 확인한 물길과 경고 표식을 따라 안전한 얕은 길을 건넜다.'
  }
};
