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
  reduceDanger, transferRelief
];
const narrate = textId => ({ op: 'narrate', textId });

export const ruinsGuideConvoy = {
  events: {
    // Autonomous caravan travel is not cancelled when the player waits or
    // leaves the region. Event names sort after the merchant's daily tick.
    evt_ruins_guide_convoy_arrive: {
      trigger: and(flag('ruins_guide_on_convoy'), signal('north_trade_stage', { eq: 2 }), npcAt('loc_far_bank')),
      effects: [{ op: 'move', subject: 'npc_ruins_raider', to: 'loc_mill_hamlet' }]
    },
    evt_ruins_guide_convoy_return: {
      trigger: and(flag('ruins_guide_on_convoy'), signal('north_trade_stage', { eq: 0 })),
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
    txt_ruins_guide_boarded: '길잡이와 식량을 나누고 북부 상단의 짐수레에 합류했다. 강 건너 길목에서 어느 방식으로 위험한 도로를 건널지 결정해야 한다.',
    txt_ruins_guide_scout_success: '길잡이가 오래된 발자국을 읽고 나는 새 우회로를 찾았다. 상단이 실제 짐을 싣고 마을에 도착했다.',
    txt_ruins_guide_scout_failed: '갈림길의 흔적을 잘못 읽었다. 상단은 여전히 길목에서 기다리며, 다시 조사할 수 있다.',
    txt_ruins_guide_defend_success: '길잡이가 적의 움직임을 예고하고 나는 길을 지켰다. 상단은 짐을 지킨 채 마을에 도착했고 호위 품삯을 받았다.',
    txt_ruins_guide_defend_failed: '매복을 막느라 진로가 막혔다. 상단은 아직 길목에 있으며 위험은 사라지지 않았다.'
  }
};
