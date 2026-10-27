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
const noSchool = and(not(flag('ford_survey_school')), not(flag('ford_guard_school')));
const route = and(at('loc_river_ford'), unlock('unl_ford_flood_route'),
  not(flag('ford_flood_decided')),
  { op: 'location', subject: 'npc_ford_grain_runner', at: 'loc_river_ford' },
  { op: 'item', subject: 'npc_ford_grain_runner', item: 'item_waystation_supply_crate', min: 1 });
const signal = (key, bounds = {}) => ({ op: 'signal', key, ...bounds });
const waymarks = and(unlock('unl_ford_surveyor'), unlock('unl_ford_flood_route'),
  flag('ford_flood_beacons'), stamina(1));

export const ruinsFieldDisciplines = {
  events: {
    // A single physical commission per 24 hours, shared by the two mutually
    // exclusive careers. The first tick arms the rest; the next clears it.
    evt_ford_master_contract_rota: {
      trigger: signal('ford_master_contract_used', { min: 1 }),
      restartWhen: and(signal('ford_master_contract_used', { min: 1 }),
        signal('ford_master_contract_resting', { max: 0 })),
      cooldown: 1440,
      effects: [{ op: 'if', when: signal('ford_master_contract_resting', { max: 0 }),
        then: [{ op: 'signal', key: 'ford_master_contract_resting', add: 1 }],
        else: [{ op: 'signal', key: 'ford_master_contract_used', add: -1 },
          { op: 'signal', key: 'ford_master_contract_resting', add: -1 }] }]
    }
  },
  actions: {
    // A master can establish exactly one public school for the world. The
    // building persists across succession; each pupil must personally train.
    // Neither school teaches the cistern's private flood-chart knowledge.
    act_mill_found_survey_school: {
      name: '상급 조사관으로 마을의 공용 물길 학교를 설립한다 (밀가루 1, 은화 5, 기력 3, 150분)',
      requires: and(at('loc_mill_hamlet'), noSchool, unlock('unl_ford_master_surveyor'),
        { op: 'item', item: 'item_flour_sack', min: 1 }, { op: 'money', min: 5 }, stamina(3)),
      minutes: 150,
      effects: [{ op: 'item', item: 'item_flour_sack', add: -1 }, { op: 'money', add: -5 },
        { op: 'resource', resource: 'stamina', add: -3 },
        { op: 'flag', key: 'ford_survey_school', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 3 }, say('txt_ford_survey_school_built')]
    },
    act_mill_found_guard_school: {
      name: '상급 호위 검객으로 마을의 공용 검술 교습장을 설립한다 (빵 2, 은화 5, 기력 3, 150분)',
      requires: and(at('loc_mill_hamlet'), noSchool, unlock('unl_ford_master_vanguard'),
        { op: 'item', item: 'item_mill_bread', min: 2 }, { op: 'money', min: 5 }, stamina(3)),
      minutes: 150,
      effects: [{ op: 'item', item: 'item_mill_bread', add: -2 }, { op: 'money', add: -5 },
        { op: 'resource', resource: 'stamina', add: -3 },
        { op: 'flag', key: 'ford_guard_school', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 3 }, say('txt_ford_guard_school_built')]
    },
    act_mill_study_survey_school: {
      name: '공용 물길 학교에서 기초 조사를 배운다 (은화 1, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), flag('ford_survey_school'),
        not(unlock('unl_ford_school_survey')),
        not({ op: 'skill', skill: 'investigation', min: 1 }), { op: 'money', min: 1 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -1 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'skill', skill: 'investigation', add: 1 },
        { op: 'proficiency', id: 'investigation', add: 12 },
        { op: 'unlock', id: 'unl_ford_school_survey' }, say('txt_ford_survey_school_trained')]
    },
    act_mill_study_guard_school: {
      name: '공용 검술 교습장에서 기초 호위를 배운다 (은화 1, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), flag('ford_guard_school'),
        not(unlock('unl_ford_school_guard')), sword,
        not({ op: 'skill', skill: 'swordsmanship', min: 1 }),
        { op: 'money', min: 1 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -1 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'skill', skill: 'swordsmanship', add: 1 },
        { op: 'proficiency', id: 'combat', add: 12 },
        { op: 'unlock', id: 'unl_ford_school_guard' }, say('txt_ford_guard_school_trained')]
    },
    act_mill_join_ford_surveyors: {
      name: '물레방아 마을에서 물길 조사관으로 전문화한다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), uncommitted,
        { op: 'or', of: [unlock('unl_cistern_flood_chart'), unlock('unl_ford_school_survey')] },
        { op: 'skill', skill: 'investigation', min: 1 },
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
    // Mastery requires completed world service AND a developed personal skill.
    // Both unlocks are character-owned; the causeway built afterward is not.
    act_mill_surveyor_master_route: {
      name: '실제 곡물 배송 경험으로 상급 물길 조사관 자격을 얻는다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), unlock('unl_ford_surveyor'),
        not(unlock('unl_ford_master_surveyor')), flag('ford_flood_delivered'),
        { op: 'skill', skill: 'investigation', min: 2 },
        { op: 'money', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -2 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'unlock', id: 'unl_ford_master_surveyor' },
        { op: 'proficiency', id: 'investigation', add: 15 }, say('txt_ford_master_surveyor')]
    },
    act_mill_vanguard_master_guard: {
      name: '상급 검세와 강나루 호위 경험으로 수비 검술을 완성한다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_mill_hamlet'), unlock('unl_ford_vanguard'),
        not(unlock('unl_ford_master_vanguard')), flag('ford_flood_guarded'),
        unlock('unl_watchpost_pursuit'), { op: 'skill', skill: 'swordsmanship', min: 2 },
        sword, { op: 'money', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -2 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'unlock', id: 'unl_ford_master_vanguard' },
        { op: 'proficiency', id: 'combat', add: 15 }, say('txt_ford_master_vanguard')]
    },
    // Repeatable world-service work uses inventory actually held by the
    // character. Flour becomes one real unit of mill relief (bounded to 3),
    // while a bread-funded guard patrol lowers existing road danger and can
    // intercept the existing raider on its next physical route tick.
    act_mill_master_survey_relief: {
      name: '상급 조사관으로 밀가루 자루를 구호 창고에 납품한다 (밀가루 1, 기력 2, 75분)',
      requires: and(at('loc_mill_hamlet'), unlock('unl_ford_master_surveyor'),
        signal('ford_master_contract_used', { max: 0 }),
        signal('north_mill_relief_stock', { max: 2 }),
        { op: 'item', item: 'item_flour_sack', min: 1 }, stamina(2)),
      minutes: 75,
      effects: [{ op: 'item', item: 'item_flour_sack', add: -1 },
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'signal', key: 'north_mill_relief_stock', add: 1 },
        { op: 'signal', key: 'ford_master_contract_used', add: 1 },
        { op: 'relation', from: 'org_mill_hamlet', add: 1 },
        { op: 'proficiency', id: 'investigation', add: 12 },
        say('txt_ford_master_relief_delivered')]
    },
    act_mill_master_guard_caravan: {
      name: '상급 호위 검객으로 빵을 지참해 위험한 상단 길을 순찰한다 (빵 1, 기력 2, 75분)',
      requires: and(at('loc_mill_hamlet'), unlock('unl_ford_master_vanguard'), sword,
        signal('ford_master_contract_used', { max: 0 }),
        signal('road_trouble', { min: 1 }),
        { op: 'item', item: 'item_mill_bread', min: 1 }, stamina(2)),
      minutes: 75,
      effects: [{ op: 'item', item: 'item_mill_bread', add: -1 },
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'signal', key: 'road_trouble', add: -1 },
        { op: 'signal', key: 'ford_master_contract_used', add: 1 },
        { op: 'if', when: and(flag('ruins_watchpost_open'),
          not(flag('ruins_raider_cleared')), { op: 'alive', subject: 'npc_ruins_raider' },
          signal('ruins_raider_repulsions', { min: 2 }),
          not(flag('ruins_raider_mill_patrol_ready'))),
          then: [{ op: 'flag', key: 'ruins_raider_mill_patrol_ready', value: true }] },
        { op: 'relation', from: 'org_mill_hamlet', add: 1 },
        { op: 'proficiency', id: 'combat', add: 12 },
        say('txt_ford_master_guard_patrol')]
    },
    // The world owns the crossing; each traveller must still learn the way
    // in person. This keeps private maps out of successors and PlayerView.
    act_ford_build_public_causeway: {
      name: '상급 조사관이 강나루의 공용 둑길을 놓는다 (은화 4, 기력 2, 120분)',
      requires: and(at('loc_river_ford'), unlock('unl_ford_master_surveyor'),
        flag('ford_flood_beacons'), not(flag('ford_public_causeway')),
        { op: 'money', min: 4 }, stamina(2)),
      minutes: 120,
      effects: [{ op: 'money', add: -4 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ford_public_causeway', value: true },
        { op: 'unlock', id: 'unl_ford_public_causeway_read' },
        { op: 'relation', from: 'org_mill_hamlet', add: 3 },
        { op: 'proficiency', id: 'investigation', add: 10 }, say('txt_ford_public_causeway_built')]
    },
    act_ford_inspect_public_causeway: {
      name: '강나루에서 공용 둑길의 실제 통행 표식을 확인한다 (15분)',
      requires: and(at('loc_river_ford'), flag('ford_public_causeway'),
        not(unlock('unl_ford_public_causeway_read'))),
      minutes: 15,
      effects: [{ op: 'unlock', id: 'unl_ford_public_causeway_read' },
        say('txt_ford_public_causeway_read')]
    },
    act_ford_public_causeway_to_mill: {
      name: '확인한 공용 둑길로 물레방아 마을에 건넌다 (기력 1, 30분)',
      requires: and(at('loc_river_ford'), flag('ford_public_causeway'),
        unlock('unl_ford_public_causeway_read'), stamina(1)),
      minutes: 30,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'move', to: 'loc_mill_hamlet' }, say('txt_ford_public_causeway_crossed')]
    },
    act_mill_public_causeway_to_ford: {
      name: '확인한 공용 둑길로 강나루에 돌아간다 (기력 1, 30분)',
      requires: and(at('loc_mill_hamlet'), flag('ford_public_causeway'),
        unlock('unl_ford_public_causeway_read'), stamina(1)),
      minutes: 30,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'move', to: 'loc_river_ford' }, say('txt_ford_public_causeway_crossed')]
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
    txt_ford_survey_school_built: '곡물과 은화를 내어 물길 학교를 열었다. 이곳의 표식과 교재는 후대에도 남지만, 배움은 각자가 직접 얻어야 한다.',
    txt_ford_guard_school_built: '마을에 공용 검술 교습장을 세웠다. 다음 세대도 검을 쥐고 이곳에서 기초 호위를 배울 수 있다.',
    txt_ford_survey_school_trained: '공용 물길 학교에서 흐름과 측량의 기초를 배웠다. 직접 발견하지 않은 수문실의 비밀은 알게 되지 않는다.',
    txt_ford_guard_school_trained: '교습장의 검술 연습으로 호위의 기초를 익혔다. 이 경험은 이 캐릭터의 것이며 후계자에게 자동으로 전해지지 않는다.',
    txt_ford_master_relief_delivered: '실제로 운반한 밀가루 자루를 구호 창고에 넘겼다. 창고의 물자는 하나 늘었고 조사 실적이 쌓였다. 다음 의뢰는 하루 뒤에 맡을 수 있다.',
    txt_ford_master_guard_patrol: '빵을 지참해 상단 길을 순찰했다. 길의 위험이 낮아지고, 적의 습격 징후가 있으면 기존 경계망이 다음 이동 때 대응한다. 다음 의뢰는 하루 뒤에 맡을 수 있다.',
    txt_ford_master_surveyor: '곡물 배송과 물길 조사의 실적을 인정받아 상급 조사관이 되었다. 강나루의 공용 둑길을 직접 놓을 수 있다.',
    txt_ford_master_vanguard: '강나루의 실제 호위와 초소의 상급 검세를 결합했다. 최후의 전투에서 무리한 공격 대신 대형을 지키며 반격할 수 있다.',
    txt_ford_public_causeway_built: '강둑을 보강하고 통행 표식을 세웠다. 누구든 현장에서 둑길을 확인하면 건널 수 있다. 이 시설은 후대에도 남는다.',
    txt_ford_public_causeway_read: '강나루에서 둑길의 표식과 안전한 발판을 직접 확인했다. 이제 물레방아 마을과 왕복할 수 있다.',
    txt_ford_public_causeway_crossed: '직접 확인한 공용 둑길을 따라 물살을 피해 건넜다.',
    txt_ford_surveyor_joined: '배수 기록과 물길 지식을 인정받아 물길 조사관이 되었다. 위험한 강가에서 더 적은 자재로 표식을 세우고, 안전한 표식이 남아 있으면 지름길을 이용할 수 있다.',
    txt_ford_vanguard_joined: '실전 검술을 인정받아 호위 검객이 되었다. 예고된 내려치기를 안정적으로 받아치고, 강가의 심부름꾼을 직접 호위할 수 있다.',
    txt_ford_surveyor_marked: '흐름을 계산해 최소한의 자재로 안전한 물길에 경고 표식을 남겼다. 실제 심부름꾼의 이동은 시간이 흐른 뒤 확인해야 한다.',
    txt_ford_vanguard_escorted: '검을 들고 급류 옆에서 심부름꾼의 이동을 지켰다. 강둑 표식은 세우지 않았으므로 공용 지름길은 남지 않는다.',
    txt_ford_surveyor_crossed: '내가 확인한 물길과 경고 표식을 따라 안전한 얕은 길을 건넜다.'
  }
};
