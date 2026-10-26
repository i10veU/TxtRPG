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
// A successful local defence is remembered by the enemy, up to two. The
// second repulse makes the next attack target the mill's *real* merchant cargo.
const rememberRepulse = { op: 'if', when: signal('ruins_raider_repulsions', { max: 1 }),
  then: [{ op: 'signal', key: 'ruins_raider_repulsions', add: 1 }] };

export const ruinsRaider = {
  npcs: {
    // Dialogue-only witnesses. Reports are available only after a physical
    // NPC visit, and learned only through a face-to-face conversation.
    npc_ruins_watch_guard: { name: '감시 초소 경계병' },
    npc_ruins_village_guard: { name: '마을 창고 경계병' },
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
  rumors: {
    rum_raider_watchpost_sighting: { factId: 'fact_raider_watchpost_sighting', claim: 'seen_watchpost' },
    rum_raider_village_sighting: { factId: 'fact_raider_village_sighting', claim: 'seen_village' },
    rum_raider_mill_sighting: { factId: 'fact_raider_mill_sighting', claim: 'seen_mill' }
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
          { op: 'if', when: flag('ruins_raider_ambush_armed'), then: [
            { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins' },
            { op: 'flag', key: 'ruins_raider_ambush_armed', value: false },
            { op: 'flag', key: 'ruins_raider_ambush_caught', value: true },
            ...stopPatrol, calmRoad, { op: 'relation', from: 'org_village', add: 3 }
          ], else: [
            { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_watchpost' },
            { op: 'flag', key: 'ruins_raider_watchpost_tracks', value: true },
            { op: 'flag', key: 'ruins_raider_watchpost_sighting', value: true },
            { op: 'flag', key: 'ruins_raider_watchpost_recent', value: true },
            { op: 'signal', key: 'ruins_raider_stage', add: 1 }
          ] }
        ], else: [
          { op: 'if', when: signal('ruins_raider_stage', { eq: 1 }), then: [
            { op: 'flag', key: 'ruins_raider_watchpost_recent', value: false },
            { op: 'if', when: flag('ruins_watchpost_restored'), then: [
              // After two genuine repulsions, the raider avoids the guarded
              // village and strikes the mill. A paid mill patrol can protect
              // the next arrival, but never destroys the hostile actor.
              { op: 'if', when: signal('ruins_raider_repulsions', { min: 2 }), then: [
                { op: 'if', when: flag('ruins_raider_mill_patrol_ready'), then: [
                  { op: 'flag', key: 'ruins_raider_mill_patrol_ready', value: false },
                  { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
                  { op: 'signal', key: 'ruins_raider_stage', add: -1 },
                  calmRoad, { op: 'relation', from: 'org_mill_hamlet', add: 2 }
                ], else: [
                  { op: 'move', subject: 'npc_ruins_raider', to: 'loc_mill_hamlet' },
                  { op: 'signal', key: 'ruins_raider_stage', add: 2 },
                  { op: 'flag', key: 'ruins_raider_mill_sighting', value: true },
                  { op: 'flag', key: 'ruins_raider_mill_recent', value: true },
                  { op: 'flag', key: 'ruins_raider_mill_report_current', value: false },
                  { op: 'if', when: and(signal('north_trade_stage', { eq: 2 }),
                    signal('north_trade_stock', { min: 1 })), then: [
                    { op: 'signal', key: 'north_trade_stock', add: -1 },
                    { op: 'if', when: signal('road_trouble', { max: 1 }), then: [
                      { op: 'signal', key: 'road_trouble', add: 1 }
                    ] }
                  ] }
                ] }
              ], else: [
                { op: 'if', when: flag('ruins_raider_sentries_ready'), then: [
                  { op: 'flag', key: 'ruins_raider_sentries_ready', value: false },
                  { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
                  { op: 'signal', key: 'ruins_raider_stage', add: -1 },
                  rememberRepulse, calmRoad, { op: 'relation', from: 'org_village', add: 2 }
                ], else: [
                  { op: 'if', when: flag('ruins_raider_village_warned'), then: [
                    { op: 'flag', key: 'ruins_raider_village_warned', value: false },
                    { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
                    { op: 'signal', key: 'ruins_raider_stage', add: -1 },
                    rememberRepulse
                  ], else: [
                    { op: 'move', subject: 'npc_ruins_raider', to: 'loc_village' },
                    { op: 'flag', key: 'ruins_raider_village_sighting', value: true },
                    { op: 'flag', key: 'ruins_raider_village_recent', value: true },
                    { op: 'flag', key: 'ruins_raider_village_report_current', value: false },
                    { op: 'signal', key: 'ruins_raider_stage', add: 1 },
                    { op: 'if', when: signal('north_mill_relief_stock', { min: 1 }), then: [
                      { op: 'signal', key: 'north_mill_relief_stock', add: -1 },
                      { op: 'if', when: signal('road_trouble', { max: 1 }), then: [
                        { op: 'signal', key: 'road_trouble', add: 1 }
                      ] }
                    ] }
                  ] }
                ] }
              ] }
            ], else: [
              { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
              { op: 'signal', key: 'ruins_raider_stage', add: -1 }
            ] }
          ], else: [
            { op: 'if', when: signal('ruins_raider_stage', { eq: 3 }), then: [
              { op: 'flag', key: 'ruins_raider_mill_recent', value: false },
              { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
              { op: 'signal', key: 'ruins_raider_stage', add: -3 }
            ], else: [
              { op: 'flag', key: 'ruins_raider_village_recent', value: false },
              { op: 'move', subject: 'npc_ruins_raider', to: 'loc_ruins_gallery' },
              { op: 'signal', key: 'ruins_raider_stage', add: -2 }
            ] }
          ] }
        ] }
      ]
    }
  },

  actions: {
    // The clock bounds freshness by the NPC's next actual patrol leg, not
    // the player's time of questioning. Event catch-up must not manufacture
    // an exact observation timestamp (long and short waits must agree).
    // Reports are character knowledge with an explicit NPC source; neither
    // conversation reads the actor's current private location.
    act_ruins_raider_ask_watch_guard: {
      name: '감시 초소 경계병에게 마지막 목격 소식을 듣는다 (15분)',
      requires: and(at('loc_ruins_watchpost'), flag('ruins_raider_watchpost_sighting')),
      minutes: 15,
      effects: [
        { op: 'rumor', rumor: 'rum_raider_watchpost_sighting', source: 'npc_ruins_watch_guard', confidence: 85 },
        { op: 'if', when: flag('ruins_raider_watchpost_recent'),
          then: [say('txt_ruins_raider_watch_report_recent')], else: [say('txt_ruins_raider_watch_report_old')] }
      ]
    },
    act_ruins_raider_ask_village_guard: {
      name: '마을 경계병에게 마지막 약탈자 목격 소식을 듣는다 (15분)',
      requires: and(at('loc_village'), flag('ruins_raider_village_sighting')),
      minutes: 15,
      effects: [
        { op: 'rumor', rumor: 'rum_raider_village_sighting', source: 'npc_ruins_village_guard', confidence: 85 },
        { op: 'if', when: flag('ruins_raider_village_recent'),
          then: [{ op: 'flag', key: 'ruins_raider_village_report_current', value: true },
            say('txt_ruins_raider_village_report_recent')], else: [say('txt_ruins_raider_village_report_old')] }
      ]
    },
    act_ruins_raider_ask_miller: {
      name: '방앗간 주인에게 상단을 덮친 낯선 사람의 소식을 듣는다 (15분)',
      requires: and(at('loc_mill_hamlet'), flag('ruins_raider_mill_sighting')),
      minutes: 15,
      effects: [
        { op: 'rumor', rumor: 'rum_raider_mill_sighting', source: 'npc_miller', confidence: 85 },
        { op: 'if', when: flag('ruins_raider_mill_recent'), then: [
          { op: 'flag', key: 'ruins_raider_mill_report_current', value: true },
          say('txt_ruins_raider_mill_report_recent')
        ], else: [say('txt_ruins_raider_mill_report_old')] }
      ]
    },
    act_ruins_raider_hire_mill_patrol: {
      name: '최근 목격담으로 물레방아 마을의 상단 경비를 고용한다 (은화 2, 기력 1, 60분)',
      requires: and(active, at('loc_mill_hamlet'), flag('ruins_raider_mill_recent'),
        flag('ruins_raider_mill_report_current'),
        { op: 'rumor', rumor: 'rum_raider_mill_sighting', source: 'npc_miller' },
        not(flag('ruins_raider_mill_patrol_ready')), { op: 'money', min: 2 }, stamina(1)),
      minutes: 60,
      effects: [
        { op: 'money', add: -2 }, { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_raider_mill_patrol_ready', value: true },
        { op: 'relation', from: 'org_mill_hamlet', add: 1 },
        say('txt_ruins_raider_mill_patrol_hired')
      ]
    },
    act_ruins_raider_organize_sentries: {
      name: '최근 목격 정보를 근거로 마을 경계대를 고용한다 (은화 3, 기력 1, 60분)',
      requires: and(active, at('loc_village'), flag('ruins_raider_village_recent'),
        flag('ruins_raider_village_report_current'), signal('ruins_raider_repulsions', { max: 1 }),
        { op: 'rumor', rumor: 'rum_raider_village_sighting', source: 'npc_ruins_village_guard' },
        not(flag('ruins_raider_sentries_ready')), { op: 'money', min: 3 }, stamina(1)),
      minutes: 60,
      effects: [
        { op: 'money', add: -3 }, { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_raider_sentries_ready', value: true },
        { op: 'relation', from: 'org_village', add: 1 },
        say('txt_ruins_raider_sentries_hired')
      ]
    },
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
        not(flag('ruins_raider_village_warned')), signal('ruins_raider_repulsions', { max: 1 }), stamina(1)),
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
    txt_ruins_raider_mill_report_recent: '방앗간 주인이 이번 순찰에 상단 물자를 노린 침입자를 봤다고 한다. 다음 귀환에 대비해 상단 경비를 고용할 수 있다.',
    txt_ruins_raider_mill_report_old: '방앗간 주인은 예전 상단 약탈을 기억한다. 지금도 이곳에 있다고 장담할 수는 없다.',
    txt_ruins_raider_mill_patrol_hired: '상단 경비가 물레방아 마을의 짐마차를 지키기로 했다. 다음 우회 습격 한 번을 막을 것이다.',
    txt_ruins_raider_watch_report_recent: '초소 경계병이 이번 순찰 중 본 침입자를 증언한다. 다음 순찰이 시작되기 전의 정보다. 지금 위치를 보장하지는 않는다.',
    txt_ruins_raider_watch_report_old: '초소 경계병은 이전 순찰에서 침입자를 봤다고 한다. 지금도 그곳에 있다는 뜻은 아니다.',
    txt_ruins_raider_village_report_recent: '창고 경계병이 이번 순찰 중 마을에 나타난 약탈자를 증언한다. 경계대를 동원할 수 있는 시점이다.',
    txt_ruins_raider_village_report_old: '창고 경계병은 이전 순찰의 약탈자 목격담을 전한다. 이미 오래된 소식으로는 경계대를 동원할 수 없다.',
    txt_ruins_raider_sentries_hired: '마을이 은화를 모아 경계대를 배치했다. 다음 습격이 오면 식량을 지키고 침입자를 쫓아낼 것이다.',
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
