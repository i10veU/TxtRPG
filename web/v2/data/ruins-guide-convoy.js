// Provisional guide career: the recruited former raider travels with the REAL
// north merchant caravan. No private actor position is projected to the UI.
// All progress uses existing world flags/signals, not a new Save schema.
const at = id => ({ op: 'location', at: id });
const npcAt = id => ({ op: 'location', subject: 'npc_ruins_raider', at: id });
const flag = key => ({ op: 'flag', key });
const signal = (key, args) => ({ op: 'signal', key, ...args });
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const bread = min => ({ op: 'item', item: 'item_mill_bread', min });
const light = { op: 'or', of: [{ op: 'item', item: 'item_lantern', min: 1 }, { op: 'trait', trait: 'night_vision' }] };
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const wagonWaiting = and(flag('north_road_guided'), signal('north_trade_stage', { eq: 1 }));
const onWagon = and(flag('ruins_raider_guide_recruited'), flag('ruins_guide_on_convoy'),
  wagonWaiting, at('loc_far_bank'), npcAt('loc_far_bank'));
const reduceDanger = { op: 'signal', key: 'road_trouble', add: -1 };
// Career progress belongs to the persistent world and is capped at three
// successful journeys; neither failed checks nor mere boarding count.
const gainExperience = { op: 'if', when: signal('ruins_guide_experience', { max: 2 }),
  then: [{ op: 'signal', key: 'ruins_guide_experience', add: 1 }] };
// Trust is public, inherited merchant standing, not private NPC knowledge.
// Only completed contracts grant it, up to the permanent priority-boarding tier.
const gainTrust = { op: 'if', when: signal('ruins_guide_merchant_trust', { max: 2 }),
  then: [{ op: 'signal', key: 'ruins_guide_merchant_trust', add: 1 }] };
// Preserve the existing north-trade relief contract: the merchant transfers
// one of its OWN finite bundles, and only when a genuine shortage exists.
const transferRelief = { op: 'if', when: and(flag('north_supply_relief_pact'),
  signal('north_relief_losses', { min: 2 }), not(flag('north_relief_shortage_recovered')),
  signal('north_mill_relief_stock', { max: 1 }), signal('north_trade_stock', { min: 1 })),
  then: [{ op: 'signal', key: 'north_trade_stock', add: -1 },
    { op: 'signal', key: 'north_mill_relief_stock', add: 1 }] };
const arrive = [
  { op: 'signal', key: 'north_trade_stage', add: 1 },
  { op: 'move', subject: 'npc_ruins_raider', to: 'loc_mill_hamlet' },
  { op: 'move', to: 'loc_mill_hamlet' },
  reduceDanger, gainExperience, transferRelief
];
// Dedicated relief transfers a finite bundle explicitly. It must NOT also
// run the ordinary arrival transfer, or one contract could move two bundles.
const arriveWithDedicatedRelief = arrive.filter(effect => effect !== transferRelief);
const narrate = textId => ({ op: 'narrate', textId });

export const ruinsGuideConvoy = {
  events: {
    // Autonomous caravan travel is not cancelled when the player waits or
    // leaves the region. Event names sort after the merchant's daily tick.
    evt_ruins_guide_convoy_arrive: {
      trigger: and(flag('ruins_guide_on_convoy'), signal('north_trade_stage', { eq: 2 }), npcAt('loc_far_bank')),
      cooldown: 720,
      effects: [{ op: 'move', subject: 'npc_ruins_raider', to: 'loc_mill_hamlet' }, gainExperience]
    },
    evt_ruins_guide_convoy_return: {
      trigger: and(flag('ruins_guide_on_convoy'), signal('north_trade_stage', { eq: 0 })),
      cooldown: 720,
      effects: [{ op: 'move', subject: 'npc_ruins_raider', to: 'loc_river_ford' },
        { op: 'flag', key: 'ruins_guide_on_convoy', value: false }]
    }
  },
  actions: {
    act_ruins_guide_board_convoy: {
      name: '길잡이와 북부 상단에 합류한다 (빵 1, 기력 1, 45분)',
      requires: and(flag('ruins_raider_guide_recruited'), not(flag('ruins_guide_on_convoy')),
        at('loc_river_ford'), npcAt('loc_river_ford'), wagonWaiting, bread(1), stamina(1)),
      minutes: 45,
      effects: [
        { op: 'item', item: 'item_mill_bread', add: -1 },
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_guide_on_convoy', value: true },
        { op: 'move', subject: 'npc_ruins_raider', to: 'loc_far_bank' },
        { op: 'move', to: 'loc_far_bank' }, narrate('txt_ruins_guide_boarded')
      ]
    },
    // Three mutually exclusive contracts for ONE actual caravan crossing:
    // safe wages, hazardous high pay, or finite famine relief. The shared
    // north_trade_stage advances once, so rewards cannot be claimed twice.
    act_ruins_guide_priority_boarding: {
      name: '상단의 신뢰를 이용해 식량 부담 없이 우선 승차한다 (기력 1, 30분)',
      requires: and(flag('ruins_raider_guide_recruited'), not(flag('ruins_guide_on_convoy')),
        at('loc_river_ford'), npcAt('loc_river_ford'), wagonWaiting,
        signal('ruins_guide_merchant_trust', { min: 3 }), stamina(1)),
      minutes: 30,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_guide_on_convoy', value: true },
        { op: 'move', subject: 'npc_ruins_raider', to: 'loc_far_bank' },
        { op: 'move', to: 'loc_far_bank' }, narrate('txt_ruins_guide_priority_boarded')
      ]
    },
    act_ruins_guide_safe_freight: {
      name: '표지석 길로 상단의 안전 운송 계약을 완수한다 (기력 1, 60분, 은화 2)',
      requires: and(onWagon, flag('ruins_guide_waymarks'),
        signal('ruins_guide_experience', { min: 2 }),
        signal('north_trade_stock', { min: 1 }), signal('road_trouble', { min: 1 }), stamina(1)),
      minutes: 60,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'money', add: 2 }, { op: 'relation', from: 'npc_north_caravan_driver', add: 2 },
        gainTrust, ...arrive, narrate('txt_ruins_guide_safe_freight')]
    },
    act_ruins_guide_urgent_freight: {
      name: '위험한 길로 긴급 화물 호위 계약을 맡는다 (기력 2, 90분, 은화 5~7)',
      requires: and(onWagon, signal('road_trouble', { min: 2 }),
        signal('north_trade_stock', { min: 1 }),
        { op: 'skill', skill: 'swordsmanship', min: 1 }, sword, stamina(2)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'hard' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 15 }, { op: 'money', add: 7 },
          gainTrust, ...arrive, narrate('txt_ruins_guide_urgent_success')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 10 }, { op: 'money', add: 5 },
          gainTrust, ...arrive, narrate('txt_ruins_guide_urgent_success')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -1 },
          { op: 'signal', key: 'north_trade_stock', add: -1 },
          narrate('txt_ruins_guide_urgent_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -2 },
          { op: 'signal', key: 'north_trade_stock', add: -1 },
          narrate('txt_ruins_guide_urgent_failed')]
      }
    },
    act_ruins_guide_relief_freight: {
      name: '상단의 실제 식량 한 묶음을 구휼 창고에 긴급 수송한다 (기력 1, 75분)',
      requires: and(onWagon, flag('north_supply_relief_pact'),
        signal('north_relief_losses', { min: 2 }), not(flag('north_relief_shortage_recovered')),
        signal('north_mill_relief_stock', { max: 1 }),
        signal('north_trade_stock', { min: 1 }), signal('road_trouble', { min: 1 }), stamina(1)),
      minutes: 75,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'signal', key: 'north_trade_stock', add: -1 },
        { op: 'signal', key: 'north_mill_relief_stock', add: 1 },
        { op: 'relation', from: 'org_mill_hamlet', add: 3 },
        gainTrust, ...arriveWithDedicatedRelief, narrate('txt_ruins_guide_relief_freight')]
    },
    // Two completed journeys unlock a costly, permanent piece of road
    // infrastructure. This is a world consequence, not a private NPC leak.
    act_ruins_guide_establish_waymarks: {
      name: '길잡이와 물레방아 우회로에 표지석을 세운다 (은화 4, 빵 2, 기력 1, 90분)',
      requires: and(flag('ruins_raider_guide_recruited'), at('loc_mill_hamlet'),
        npcAt('loc_mill_hamlet'), signal('ruins_guide_experience', { min: 2 }),
        not(flag('ruins_guide_waymarks')), { op: 'money', min: 4 }, bread(2), stamina(1)),
      minutes: 90,
      effects: [
        { op: 'money', add: -4 }, { op: 'item', item: 'item_mill_bread', add: -2 },
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_guide_waymarks', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 3 },
        { op: 'if', when: signal('road_trouble', { min: 1 }),
          then: [{ op: 'signal', key: 'road_trouble', add: -1 }] },
        { op: 'if', when: signal('road_trouble', { min: 1 }),
          then: [{ op: 'signal', key: 'road_trouble', add: -1 }] },
        narrate('txt_ruins_guide_waymarks_built')
      ]
    },
    // The established route trades high-risk wages and training for a
    // deterministic, faster crossing on the actual merchant wagon.
    act_ruins_guide_veteran_crossing: {
      name: '길잡이가 익힌 표지석 우회로로 상단을 안전하게 이끈다 (기력 1, 60분)',
      requires: and(onWagon, flag('ruins_guide_waymarks'),
        signal('ruins_guide_experience', { min: 2 }), signal('road_trouble', { min: 1 }), stamina(1)),
      minutes: 60,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'proficiency', id: 'investigation', add: 5 },
        ...arrive, narrate('txt_ruins_guide_veteran_crossing')]
    },
    act_ruins_guide_scout_convoy: {
      name: '길잡이와 우회로를 탐색해 상단을 이끈다 (기력 2, 120분)',
      requires: and(onWagon, signal('road_trouble', { min: 1 }),
        { op: 'skill', skill: 'investigation', min: 1 }, light, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 120,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 15 }, ...arrive, narrate('txt_ruins_guide_scout_success')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 10 }, ...arrive, narrate('txt_ruins_guide_scout_success')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -1 },
          narrate('txt_ruins_guide_scout_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -2 },
          narrate('txt_ruins_guide_scout_failed')]
      }
    },
    act_ruins_guide_defend_convoy: {
      name: '길잡이와 무장 호위로 상단을 통과시킨다 (기력 2, 90분)',
      requires: and(onWagon, signal('road_trouble', { min: 1 }),
        { op: 'skill', skill: 'swordsmanship', min: 1 }, sword, stamina(2)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 15 }, { op: 'money', add: 4 },
          ...arrive, narrate('txt_ruins_guide_defend_success')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 10 }, { op: 'money', add: 3 },
          ...arrive, narrate('txt_ruins_guide_defend_success')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -1 },
          narrate('txt_ruins_guide_defend_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -3 },
          narrate('txt_ruins_guide_defend_failed')]
      }
    }
  },
  texts: {
    txt_ruins_guide_priority_boarded: '상단 마부가 오랜 호위 계약을 기억하고 짐칸에 자리를 내주었다. 식량을 추가로 내지 않고 길잡이와 강 건너 길목에 도착했다.',
    txt_ruins_guide_safe_freight: '표지석을 따라 화물을 안전하게 인도했다. 마부가 정해진 품삯을 지불하고 다음 운송도 맡기겠다고 약속했다.',
    txt_ruins_guide_urgent_success: '위험한 지름길에서 화물을 지켜냈다. 상단은 큰 품삯을 지불하고 길잡이의 계약 이력을 높이 평가했다.',
    txt_ruins_guide_urgent_failed: '급한 길목에서 습격을 막지 못했다. 실제 상단 화물 한 묶음을 잃었고 운송은 중단되었다.',
    txt_ruins_guide_relief_freight: '상단의 실제 화물 한 묶음을 물레방아 마을 구휼 창고로 옮겼다. 마을의 신뢰는 얻었지만 운송 품삯은 받지 않았다.',
    txt_ruins_guide_waymarks_built: '두 차례의 원정에서 익힌 위험한 굽이를 표지석으로 표시했다. 마을은 길잡이의 경험을 신뢰하고 도로의 위험이 줄었다.',
    txt_ruins_guide_veteran_crossing: '길잡이는 자신이 세운 표지석을 따라 상단을 안전하게 이끌었다. 품삯은 없지만 도로를 빠르게 건넜다.',
    txt_ruins_guide_boarded: '길잡이와 식량을 나누고 북부 상단의 짐수레에 합류했다. 강 건너 길목에서 어느 방식으로 위험한 도로를 건널지 결정해야 한다.',
    txt_ruins_guide_scout_success: '길잡이가 오래된 발자국을 읽고 나는 새 우회로를 찾았다. 상단이 실제 짐을 싣고 마을에 도착했다.',
    txt_ruins_guide_scout_failed: '갈림길의 흔적을 잘못 읽었다. 상단은 여전히 길목에서 기다리며, 다시 조사할 수 있다.',
    txt_ruins_guide_defend_success: '길잡이가 적의 움직임을 예고하고 나는 길을 지켰다. 상단은 짐을 지킨 채 마을에 도착했고 호위 품삯을 받았다.',
    txt_ruins_guide_defend_failed: '매복을 막느라 진로가 막혔다. 상단은 아직 길목에 있으며 위험은 사라지지 않았다.'
  }
};
