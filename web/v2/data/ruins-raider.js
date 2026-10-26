// Provisional, unnamed hostile scavenger. This is an NPC actor, not a new
// canon faction. Its location is world state and advances only on timed event
// ticks; view() never projects its location, health or private route.
const at = id => ({ op: 'location', at: id });
const npcAt = id => ({ op: 'location', subject: 'npc_ruins_raider', at: id });
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const flag = key => ({ op: 'flag', key });
const signal = (key, args) => ({ op: 'signal', key, ...args });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const light = { op: 'or', of: [{ op: 'item', item: 'item_lantern', min: 1 }, { op: 'trait', trait: 'night_vision' }] };
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const together = { op: 'or', of: ['loc_ruins_gallery', 'loc_ruins_watchpost', 'loc_village']
  .map(id => and(at(id), npcAt(id))) };
const alive = { op: 'alive', subject: 'npc_ruins_raider' };
const active = and(flag('ruins_watchpost_open'), not(flag('ruins_raider_cleared')), alive);
const calmRoad = { op: 'if', when: signal('road_trouble', { min: 1 }),
  then: [{ op: 'signal', key: 'road_trouble', add: -1 }] };
const stopPatrol = [{ op: 'flag', key: 'ruins_raider_cleared', value: true }];
const say = textId => ({ op: 'narrate', textId });

export const ruinsRaider = {
  npcs: {
    npc_ruins_raider: {
      name: '폐허의 떠돌이 약탈자',
      actor: {
        locationId: 'loc_ruins_gallery',
        hp: { max: 8 },
        growth: { growth_wanderer: {
          stats: { str: 9, dex: 11, con: 9, int: 9, wis: 9, per: 11 },
          resources: { stamina: { current: 5, max: 5 } }
        } }
      }
    }
  },
  events: {
    // Patrol: gallery -> watchpost -> village (only if the public passage is
    // restored) -> gallery. A raider entering the village steals one existing
    // ration and increases road risk, both bounded; it never mints supplies.
    // A defeated/diverted actor ends the clock without a hidden respawn.
    evt_ruins_raider_route: {
      trigger: active,
      cooldown: 720,
      catchUp: true,
      effects: [
        { op: 'if', when: signal('ruins_raider_stage', { eq: 0 }), then: [
          { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_watchpost' },
          { op: 'signal', key: 'ruins_raider_stage', add: 1 }
        ], else: [
          { op: 'if', when: signal('ruins_raider_stage', { eq: 1 }), then: [
            { op: 'if', when: flag('ruins_watchpost_restored'), then: [
              { op: 'move', subject: 'npc_ruins_raider', to: 'loc_village' },
              { op: 'signal', key: 'ruins_raider_stage', add: 1 },
              { op: 'if', when: signal('north_mill_relief_stock', { min: 1 }), then: [
                { op: 'signal', key: 'north_mill_relief_stock', add: -1 },
                { op: 'if', when: signal('road_trouble', { max: 1 }), then: [
                  { op: 'signal', key: 'road_trouble', add: 1 }
                ] }
              ] }
            ], else: [
              { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
              { op: 'signal', key: 'ruins_raider_stage', add: -1 }
            ] }
          ], else: [
            { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
            { op: 'signal', key: 'ruins_raider_stage', add: -2 }
          ] }
        ] }
      ]
    }
  },
  actions: {
    act_ruins_raider_track: {
      name: '떠돌이 약탈자의 발자국과 보급 흔적을 읽는다 (기력 1, 45분)',
      requires: and(active, together, not({ op: 'unlock', id: 'unl_ruins_raider_tracked' }),
        light, { op: 'skill', skill: 'investigation', min: 1 }, stamina(1)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 45,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 12 },
          { op: 'unlock', id: 'unl_ruins_raider_tracked' }, say('txt_ruins_raider_tracked')],
        success: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 8 },
          { op: 'unlock', id: 'unl_ruins_raider_tracked' }, say('txt_ruins_raider_tracked')],
        partial: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -1 }, say('txt_ruins_raider_track_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -2 }, say('txt_ruins_raider_track_failed')]
      }
    },
    act_ruins_raider_intercept: {
      name: '떠돌이 약탈자와 정면으로 맞선다 (기력 3, 90분)',
      requires: and(active, together, sword,
        { op: 'skill', skill: 'swordsmanship', min: 1 }, stamina(3)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'proficiency', id: 'combat', add: 15 }, { op: 'hp', subject: 'npc_ruins_raider', add: -8 },
          ...stopPatrol, calmRoad, { op: 'money', add: 4 },
          { op: 'relation', from: 'org_village', add: 4 }, say('txt_ruins_raider_defeated')],
        success: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'proficiency', id: 'combat', add: 10 }, { op: 'hp', subject: 'npc_ruins_raider', add: -8 },
          ...stopPatrol, calmRoad, { op: 'money', add: 3 },
          { op: 'relation', from: 'org_village', add: 4 }, say('txt_ruins_raider_defeated')],
        partial: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'if', when: { op: 'unlock', id: 'unl_guarded_stance' },
            then: [{ op: 'hp', add: -1 }], else: [{ op: 'hp', add: -2 }] },
          say('txt_ruins_raider_fight_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'if', when: { op: 'unlock', id: 'unl_guarded_stance' },
            then: [{ op: 'hp', add: -2 }], else: [{ op: 'hp', add: -4 }] },
          say('txt_ruins_raider_fight_failed')]
      }
    },
    act_ruins_raider_divert: {
      name: '빵을 미끼로 약탈자를 폐허로 유인한다 (빵 1, 기력 2, 1시간)',
      requires: and(active, together, { op: 'unlock', id: 'unl_ruins_raider_tracked' },
        { op: 'item', item: 'item_mill_bread', min: 1 },
        { op: 'skill', skill: 'investigation', min: 1 }, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 60,
      outcomes: {
        great: [{ op: 'item', item: 'item_mill_bread', add: -1 },
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 12 },
          { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins' },
          ...stopPatrol, { op: 'flag', key: 'ruins_raider_diverted', value: true }, calmRoad,
          { op: 'relation', from: 'org_village', add: 3 }, say('txt_ruins_raider_diverted')],
        success: [{ op: 'item', item: 'item_mill_bread', add: -1 },
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 8 },
          { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins' },
          ...stopPatrol, { op: 'flag', key: 'ruins_raider_diverted', value: true }, calmRoad,
          { op: 'relation', from: 'org_village', add: 3 }, say('txt_ruins_raider_diverted')],
        partial: [{ op: 'item', item: 'item_mill_bread', add: -1 },
          { op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -1 },
          say('txt_ruins_raider_divert_failed')],
        fail: [{ op: 'item', item: 'item_mill_bread', add: -1 },
          { op: 'resource', resource: 'stamina', add: -2 }, { op: 'hp', add: -2 },
          say('txt_ruins_raider_divert_failed')]
      }
    }
  },
  texts: {
    txt_ruins_raider_tracked: '발자국이 회랑과 감시 초소를 오간다. 누군가 마을 식량 창고까지 노리고 있다. 이제 빵으로 다른 곳으로 유인할 수 있다.',
    txt_ruins_raider_track_failed: '희미한 발자국을 따라가다 돌무더기에 발을 헛디뎠다. 아직 이동 습관을 읽지 못했다.',
    txt_ruins_raider_defeated: '떠돌이 약탈자를 제압했다. 길을 지키는 주민들이 빼앗긴 물자의 일부를 되찾아 보수를 건넨다.',
    txt_ruins_raider_fight_failed: '약탈자가 돌기둥 뒤에서 반격했다. 물러서서 다시 기회를 노려야 한다.',
    txt_ruins_raider_diverted: '미끼를 문 약탈자가 마을과 먼 폐허로 향했다. 감시 초소의 길은 다시 조용해졌다.',
    txt_ruins_raider_divert_failed: '약탈자가 미끼를 낚아챘지만 예상한 길로 가지 않았다. 물자만 잃었다.'
  }
};
