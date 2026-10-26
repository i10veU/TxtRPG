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
          // A prepared watchpost snare catches the returning raider on its
          // next actual visit. No RNG, remote narration, or hidden location UI.
          { op: 'if', when: flag('ruins_raider_ambush_armed'), then: [
            { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins' },
            { op: 'flag', key: 'ruins_raider_ambush_armed', value: false },
            { op: 'flag', key: 'ruins_raider_ambush_caught', value: true },
            ...stopPatrol, calmRoad,
            { op: 'relation', from: 'org_village', add: 3 }
          ], else: [
            { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_watchpost' },
            { op: 'flag', key: 'ruins_raider_watchpost_tracks', value: true },
            { op: 'signal', key: 'ruins_raider_stage', add: 1 }
          ] }
        ], else: [
          { op: 'if', when: signal('ruins_raider_stage', { eq: 1 }), then: [
            { op: 'if', when: flag('ruins_watchpost_restored'), then: [
              // A warning protects exactly one arrival. The raider survives
              // and can try again; the player must choose a lasting solution.
              { op: 'if', when: flag('ruins_raider_village_warned'), then: [
                { op: 'flag', key: 'ruins_raider_village_warned', value: false },
                { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
                { op: 'signal', key: 'ruins_raider_stage', add: -1 }
              ], else: [
                { op: 'move', subject: 'npc_ruins_raider', to: 'loc_village' },
                { op: 'signal', key: 'ruins_raider_stage', add: 1 },
                { op: 'if', when: signal('north_mill_relief_stock', { min: 1 }), then: [
                  { op: 'signal', key: 'north_mill_relief_stock', add: -1 },
                  { op: 'if', when: signal('road_trouble', { max: 1 }), then: [
                    { op: 'signal', key: 'road_trouble', add: 1 }
                  ] }
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
    // Evidence is only observable at the watchpost after the NPC has
    // physically visited it. The action unlocks a personal route inference,
    // not the current private actor position or an omniscient timeline.
    act_ruins_raider_read_tracks: {
      name: '감시 초소에 남은 발자국을 살펴 이동 습관을 추론한다 (기력 1, 45분)',
      requires: and(active, at('loc_ruins_watchpost'), flag('ruins_raider_watchpost_tracks'),
        not(npcAt('loc_ruins_watchpost')),
        not({ op: 'unlock', id: 'unl_ruins_raider_tracked' }), light,
        { op: 'skill', skill: 'investigation', min: 1 }, stamina(1)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 45,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 12 },
          { op: 'unlock', id: 'unl_ruins_raider_tracked' }, say('txt_ruins_raider_tracks_read')],
        success: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 8 },
          { op: 'unlock', id: 'unl_ruins_raider_tracked' }, say('txt_ruins_raider_tracks_read')],
        partial: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -1 }, say('txt_ruins_raider_tracks_unclear')],
        fail: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -2 }, say('txt_ruins_raider_tracks_unclear')]
      }
    },
    act_ruins_raider_set_ambush: {
      name: '약탈자의 귀환 길목에 식량 미끼와 덫을 준비한다 (빵 2, 기력 2, 90분)',
      requires: and(active, at('loc_ruins_watchpost'),
        not(npcAt('loc_ruins_watchpost')),
        { op: 'unlock', id: 'unl_ruins_raider_tracked' },
        not(flag('ruins_raider_ambush_armed')),
        { op: 'item', item: 'item_mill_bread', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [
        { op: 'item', item: 'item_mill_bread', add: -2 },
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ruins_raider_ambush_armed', value: true },
        say('txt_ruins_raider_ambush_armed')
      ]
    },
    act_ruins_raider_warn_village: {
      name: '마을 창고지기에게 다음 약탈에 대비하라고 경고한다 (기력 1, 45분)',
      requires: and(active, at('loc_village'), flag('ruins_watchpost_restored'),
        { op: 'unlock', id: 'unl_ruins_raider_tracked' },
        not(flag('ruins_raider_village_warned')), stamina(1)),
      minutes: 45,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_raider_village_warned', value: true },
        { op: 'relation', from: 'org_village', add: 1 },
        say('txt_ruins_raider_village_warned')
      ]
    },
    act_ruins_raider_claim_ambush: {
      name: '마을에 덫으로 막아낸 약탈 소식을 전하고 사례를 받는다 (30분)',
      requires: and(at('loc_village'), flag('ruins_raider_ambush_caught'),
        not(flag('ruins_raider_ambush_rewarded'))),
      minutes: 30,
      effects: [
        { op: 'flag', key: 'ruins_raider_ambush_rewarded', value: true },
        { op: 'money', add: 5 },
        { op: 'relation', from: 'org_village', add: 2 },
        say('txt_ruins_raider_ambush_rewarded')
      ]
    },
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
    txt_ruins_raider_tracks_read: '흙에 찍힌 자국과 마차 바퀴 흔적을 대조했다. 이 자는 초소를 주기적으로 지나지만 지금 어디 있는지는 알 수 없다. 돌아올 때를 대비해 덫을 놓을 수 있다.',
    txt_ruins_raider_tracks_unclear: '오래된 발자국과 새 발자국을 구별하지 못했다. 다음에는 빛을 더 낮춰 살펴야겠다.',
    txt_ruins_raider_ambush_armed: '빵 두 덩이를 미끼로 삼아 초소의 무너진 기둥 아래 덫을 설치했다. 놈이 다시 이곳을 지나면 걸릴 것이다.',
    txt_ruins_raider_village_warned: '창고지기가 식량을 안쪽으로 옮겼다. 다음 한 번의 습격은 피할 수 있지만 약탈자는 여전히 길을 돌아다닌다.',
    txt_ruins_raider_ambush_rewarded: '초소의 덫이 마을을 지켰다는 소식이 전해졌다. 창고지기가 약속한 사례금을 건넸다.',
    txt_ruins_raider_tracked: '발자국이 회랑과 감시 초소를 오간다. 누군가 마을 식량 창고까지 노리고 있다. 이제 빵으로 다른 곳으로 유인할 수 있다.',
    txt_ruins_raider_track_failed: '희미한 발자국을 따라가다 돌무더기에 발을 헛디뎠다. 아직 이동 습관을 읽지 못했다.',
    txt_ruins_raider_defeated: '떠돌이 약탈자를 제압했다. 길을 지키는 주민들이 빼앗긴 물자의 일부를 되찾아 보수를 건넨다.',
    txt_ruins_raider_fight_failed: '약탈자가 돌기둥 뒤에서 반격했다. 물러서서 다시 기회를 노려야 한다.',
    txt_ruins_raider_diverted: '미끼를 문 약탈자가 마을과 먼 폐허로 향했다. 감시 초소의 길은 다시 조용해졌다.',
    txt_ruins_raider_divert_failed: '약탈자가 미끼를 낚아챘지만 예상한 길로 가지 않았다. 물자만 잃었다.'
  }
};
