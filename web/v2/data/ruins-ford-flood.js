// A finite courier run driven by a character's recovered drainage chart.
// The record is personal knowledge, the beacon is world-owned infrastructure,
// and the courier carries exactly one physical grain crate. Off-screen movement
// never reveals a hidden actor location or duplicates mill supplies.
const at = id => ({ op: 'location', at: id });
const npcAt = id => ({ op: 'location', subject: 'npc_ford_grain_runner', at: id });
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const flag = key => ({ op: 'flag', key });
const unlock = id => ({ op: 'unlock', id });
const signal = (key, args = {}) => ({ op: 'signal', key, ...args });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const say = textId => ({ op: 'narrate', textId });
const cargo = { op: 'item', subject: 'npc_ford_grain_runner', item: 'item_waystation_supply_crate', min: 1 };
const atFord = at('loc_river_ford');
const choiceReady = and(atFord, unlock('unl_ford_flood_route'),
  not(flag('ford_flood_decided')), npcAt('loc_river_ford'), cargo);

export const ruinsFordFlood = {
  npcs: {
    npc_ford_grain_runner: { name: '강나루의 곡물 심부름꾼', actor: {
      locationId: 'loc_river_ford', hp: { max: 8 },
      inventory: { item_waystation_supply_crate: 1 },
      growth: { growth_wanderer: {
        stats: { str: 9, dex: 10, con: 10, int: 9, wis: 10, per: 10 },
        resources: { stamina: { current: 5, max: 5 } }
      } }
    } }
  },
  events: {
    // The first tick arms the 12-hour clock; the next moves the *physical*
    // courier. A private salvage choice leaves the cargo lost to the flood.
    // A beacon preserves the crate for an in-person delivery at the mill.
    evt_ford_flood_courier: {
      trigger: and(flag('ford_flood_decided'), not(flag('ford_flood_resolved'))),
      cooldown: 720, catchUp: true,
      effects: [{ op: 'if', when: signal('ford_flood_stage', { eq: 0 }),
        then: [{ op: 'signal', key: 'ford_flood_stage', add: 1 }],
        else: [{ op: 'if', when: signal('ford_flood_stage', { eq: 1 }), then: [
          { op: 'if', when: { op: 'or', of: [flag('ford_flood_beacons'), flag('ford_flood_guarded')] }, then: [
            { op: 'move', subject: 'npc_ford_grain_runner', to: 'loc_mill_hamlet' },
            { op: 'flag', key: 'ford_flood_courier_safe', value: true }
          ], else: [
            { op: 'move', subject: 'npc_ford_grain_runner', to: 'loc_crossroads' },
            { op: 'item', subject: 'npc_ford_grain_runner', item: 'item_waystation_supply_crate', add: -1 },
            { op: 'flag', key: 'ford_flood_cargo_lost', value: true }
          ] },
          { op: 'signal', key: 'ford_flood_stage', add: 1 },
          { op: 'flag', key: 'ford_flood_resolved', value: true }
        ] }] }]
    }
  },
  actions: {
    act_cistern_decode_flood_records: {
      name: '회수한 배수 기록으로 강나루의 물길 변화를 해독한다 (30분)',
      requires: and(at('loc_ruins_cistern'), flag('ruins_cistern_warden_records_claimed'),
        not(unlock('unl_cistern_flood_chart')), { op: 'skill', skill: 'investigation', min: 1 }),
      minutes: 30,
      effects: [{ op: 'unlock', id: 'unl_cistern_flood_chart' },
        { op: 'proficiency', id: 'investigation', add: 8 }, say('txt_cistern_flood_chart')]
    },
    act_ford_survey_flood_route: {
      name: '배수 기록을 대조해 강나루의 위험한 물길을 확인한다 (기력 1, 30분)',
      requires: and(atFord, unlock('unl_cistern_flood_chart'),
        not(unlock('unl_ford_flood_route')), stamina(1)),
      minutes: 30,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'unlock', id: 'unl_ford_flood_route' },
        { op: 'proficiency', id: 'investigation', add: 6 }, say('txt_ford_flood_survey')]
    },
    act_ford_build_flood_beacons: {
      name: '강나루에 경고 표식을 세워 곡물 심부름꾼을 돕는다 (은화 3, 기력 2, 90분)',
      requires: and(choiceReady, { op: 'money', min: 3 }, stamina(2)),
      minutes: 90,
      effects: [{ op: 'money', add: -3 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ford_flood_decided', value: true },
        { op: 'flag', key: 'ford_flood_beacons', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 2 }, say('txt_ford_flood_beacons')]
    },
    act_ford_salvage_flood_tools: {
      name: '경고 표식 대신 버려진 도구를 팔아 은화를 챙긴다 (기력 2, 60분)',
      requires: and(choiceReady, stamina(2)),
      minutes: 60,
      effects: [{ op: 'resource', resource: 'stamina', add: -2 },
        { op: 'money', add: 5 },
        { op: 'flag', key: 'ford_flood_decided', value: true },
        { op: 'flag', key: 'ford_flood_tools_taken', value: true },
        say('txt_ford_flood_tools_taken')]
    },
    act_mill_unload_ford_courier: {
      name: '도착한 심부름꾼의 실제 곡물 꾸러미를 마을 창고로 옮긴다 (기력 1, 30분)',
      requires: and(at('loc_mill_hamlet'), npcAt('loc_mill_hamlet'),
        flag('ford_flood_courier_safe'), not(flag('ford_flood_delivered')),
        cargo, signal('north_mill_relief_stock', { max: 2 }), stamina(1)),
      minutes: 30,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'item', subject: 'npc_ford_grain_runner', item: 'item_waystation_supply_crate', add: -1 },
        { op: 'signal', key: 'north_mill_relief_stock', add: 1 },
        { op: 'flag', key: 'ford_flood_delivered', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 2 },
        { op: 'proficiency', id: 'investigation', add: 6 },
        say('txt_ford_flood_delivered')]
    }
  },
  texts: {
    txt_cistern_flood_chart: '도굴꾼의 젖은 장부에서 강나루 수위와 물레방아 마을의 옛 운송길을 맞춰 읽었다. 강나루에 가서 물길을 확인해야 한다.',
    txt_ford_flood_survey: '기록과 강가의 물자국이 일치한다. 곡물 꾸러미를 든 심부름꾼이 건널 길에 급류가 몰려온다. 경고 표식을 세우거나 버려진 도구를 팔 수 있지만 둘 다 할 시간과 자재는 없다.',
    txt_ford_flood_beacons: '강둑에 표식을 세웠다. 심부름꾼이 표식을 따라 안전한 길로 이동할 수 있다. 도착 여부는 현장에서 확인해야 한다.',
    txt_ford_flood_tools_taken: '남겨진 도구를 팔아 은화 5를 얻었다. 강둑에 표식을 세울 자재는 이제 없다.',
    txt_ford_flood_delivered: '물레방아 마을에서 심부름꾼의 꾸러미를 실제 창고로 옮겼다. 그의 짐은 비었고 마을의 식량은 한 묶음 늘었다.'
  }
};
