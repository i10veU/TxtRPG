// Optional post-patrol journey: the watchpost is a local ruin, not a new canon
// settlement or faction. World flags record physical construction; no private
// facts, route hints, or secret nodes are exposed before the player arrives.
const at = id => ({ op: 'location', at: id });
const flag = key => ({ op: 'flag', key });
const not = of => ({ op: 'not', of });
const and = (...of) => ({ op: 'and', of });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const light = { op: 'or', of: [
  { op: 'item', item: 'item_lantern', min: 1 }, { op: 'trait', trait: 'night_vision' }
] };
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const say = textId => ({ op: 'narrate', textId });
const alarm = { op: 'signal', key: 'ruins_watch_alarm' };
const raiseAlarm = { op: 'if', when: { ...alarm, max: 1 },
  then: [{ op: 'signal', key: 'ruins_watch_alarm', add: 1 }] };
const calmAlarm = { op: 'if', when: { ...alarm, min: 1 },
  then: [{ op: 'signal', key: 'ruins_watch_alarm', add: -1 }] };
const openPost = [
  { op: 'flag', key: 'ruins_watchpost_open', value: true }, calmAlarm
];
const restore = [
  { op: 'flag', key: 'ruins_watchpost_resolved', value: true },
  { op: 'flag', key: 'ruins_watchpost_restored', value: true },
  { op: 'relation', from: 'org_village', add: 4 },
  { op: 'relation', from: 'npc_elder', add: 3 },
  { op: 'if', when: { op: 'signal', key: 'road_trouble', min: 1 },
    then: [{ op: 'signal', key: 'road_trouble', add: -1 }] },
  say('txt_ruins_watch_restored')
];

export const ruinsWatchpost = {
  locations: {
    loc_ruins_gallery: {
      name: '폐허 아래 옛 회랑',
      links: [
        { to: 'loc_ruins_lower_vault', minutes: 30 },
        { to: 'loc_ruins_watchpost', minutes: 35, requires: flag('ruins_watchpost_open') },
        { to: 'loc_ruins_cistern', minutes: 20, requires: { op: 'unlock', id: 'unl_ruins_cistern_route' } }
      ]
    },
    loc_ruins_watchpost: {
      name: '폐허의 오래된 감시 초소',
      links: [
        { to: 'loc_ruins_gallery', minutes: 35 },
        { to: 'loc_ruins_cistern', minutes: 12, requires: { op: 'and', of: [
          flag('ruins_cistern_sluice_open'), { op: 'unlock', id: 'unl_cistern_watch_route' }
        ] } },
        { to: 'loc_village', minutes: 25, requires: flag('ruins_watchpost_restored') },
        { to: 'loc_ruins_signal_chamber', minutes: 15, requires: { op: 'unlock', id: 'unl_ruins_signal_chamber_route' } },
        { to: 'loc_ruins_cellar', minutes: 35, requires: flag('ruins_signal_public_passage') }
      ]
    }
  },
  actions: {
    act_ruins_watch_find_gallery: {
      name: '안전해진 봉인실 뒤쪽 회랑을 조사한다 (기력 1, 1시간)',
      requires: and(at('loc_ruins_lower_vault'), flag('ruins_lower_patrol_safe'),
        not(flag('ruins_watch_gallery_open')), light,
        { op: 'skill', skill: 'investigation', min: 1 }, stamina(1)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 60,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 12 },
          { op: 'flag', key: 'ruins_watch_gallery_open', value: true }, say('txt_ruins_watch_gallery_found')],
        success: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'proficiency', id: 'investigation', add: 8 },
          { op: 'flag', key: 'ruins_watch_gallery_open', value: true }, say('txt_ruins_watch_gallery_found')],
        partial: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -1 }, say('txt_ruins_watch_gallery_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -1 },
          { op: 'hp', add: -2 }, say('txt_ruins_watch_gallery_failed')]
      }
    },
    act_ruins_watch_sneak: {
      name: '감시 초소의 무너진 바닥을 조용히 통과한다 (기력 2, 90분)',
      requires: and(at('loc_ruins_gallery'), flag('ruins_watch_gallery_open'),
        not(flag('ruins_watchpost_open')), { ...alarm, max: 1 }, light,
        { op: 'skill', skill: 'investigation', min: 1 }, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 15 }, ...openPost, say('txt_ruins_watch_sneaked')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 10 }, ...openPost, say('txt_ruins_watch_sneaked')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -1 }, raiseAlarm, say('txt_ruins_watch_blocked')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -2 }, raiseAlarm, say('txt_ruins_watch_blocked')]
      }
    },
    act_ruins_watch_breach: {
      name: '검으로 초소의 낡은 걸쇠를 부순다 (기력 2, 1시간)',
      requires: and(at('loc_ruins_gallery'), flag('ruins_watch_gallery_open'),
        not(flag('ruins_watchpost_open')), sword,
        { op: 'skill', skill: 'swordsmanship', min: 1 }, stamina(2)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 60,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 15 }, ...openPost,
          { op: 'flag', key: 'ruins_watchpost_noisy', value: true }, say('txt_ruins_watch_breached')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 10 }, ...openPost,
          { op: 'flag', key: 'ruins_watchpost_noisy', value: true }, say('txt_ruins_watch_breached')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'if', when: { op: 'unlock', id: 'unl_guarded_stance' },
            then: [{ op: 'hp', add: -1 }], else: [{ op: 'hp', add: -2 }] },
          raiseAlarm, say('txt_ruins_watch_blocked')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'if', when: { op: 'unlock', id: 'unl_guarded_stance' },
            then: [{ op: 'hp', add: -2 }], else: [{ op: 'hp', add: -4 }] },
          raiseAlarm, say('txt_ruins_watch_blocked')]
      }
    },
    act_ruins_watch_wait: {
      name: '회랑에서 추락 소리가 잦아들 때까지 기다린다 (기력 1, 1시간)',
      requires: and(at('loc_ruins_gallery'), not(flag('ruins_watchpost_open')),
        { ...alarm, min: 1 }, stamina(1)),
      minutes: 60,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'signal', key: 'ruins_watch_alarm', add: -1 }, say('txt_ruins_watch_waited')]
    },
    act_ruins_watch_restore_quiet: {
      name: '초소를 마을의 공용 통로로 정비한다 (은화 4, 기력 2, 2시간)',
      requires: and(at('loc_ruins_watchpost'), not(flag('ruins_watchpost_resolved')),
        not(flag('ruins_watchpost_noisy')), { op: 'money', min: 4 }, stamina(2)),
      minutes: 120,
      effects: [{ op: 'money', add: -4 }, { op: 'resource', resource: 'stamina', add: -2 }, ...restore]
    },
    act_ruins_watch_restore_noisy: {
      name: '부서진 초소를 보강해 공용길을 연다 (은화 7, 기력 2, 3시간)',
      requires: and(at('loc_ruins_watchpost'), not(flag('ruins_watchpost_resolved')),
        flag('ruins_watchpost_noisy'), { op: 'money', min: 7 }, stamina(2)),
      minutes: 180,
      effects: [{ op: 'money', add: -7 }, { op: 'resource', resource: 'stamina', add: -2 }, ...restore]
    },
    act_ruins_watch_loot: {
      name: '초소의 물자를 가져가고 통로를 버린다 (기력 2, 1시간)',
      requires: and(at('loc_ruins_watchpost'), not(flag('ruins_watchpost_resolved')), stamina(2)),
      minutes: 60,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'money', add: 8 }, { op: 'item', item: 'item_herbal_salve', add: 1 },
        { op: 'flag', key: 'ruins_watchpost_resolved', value: true },
        { op: 'flag', key: 'ruins_watchpost_looted', value: true },
        { op: 'relation', from: 'org_village', add: -3 },
        { op: 'if', when: { op: 'signal', key: 'road_trouble', max: 1 },
          then: [{ op: 'signal', key: 'road_trouble', add: 1 }] },
        say('txt_ruins_watch_looted')
      ]
    },
    act_ruins_watch_report: {
      name: '마을 원로에게 새 공용길의 안전을 보고한다 (30분)',
      requires: and(at('loc_village'), flag('ruins_watchpost_restored'),
        not(flag('ruins_watchpost_reported'))),
      minutes: 30,
      effects: [
        { op: 'flag', key: 'ruins_watchpost_reported', value: true },
        { op: 'money', add: 3 }, { op: 'relation', from: 'npc_elder', add: 3 },
        say('txt_ruins_watch_reported')
      ]
    }
  },
  texts: {
    txt_place_loc_ruins_gallery: '봉인실 너머로 휘어진 회랑. 금 간 돌바닥 아래 빈 공간이 울린다.',
    txt_place_loc_ruins_watchpost: '돌기둥에 기대 선 오래된 감시 초소. 무너진 출입구 뒤로 마을 방향의 희미한 빛이 보인다.',
    txt_ruins_watch_gallery_found: '낡은 벽돌의 배열에서 사람 발길이 닿았던 회랑을 찾았다. 이제 발을 디딜 수 있다.',
    txt_ruins_watch_gallery_failed: '돌이 무너져 길을 잃었다. 다시 조사해야 한다.',
    txt_ruins_watch_sneaked: '무너진 바닥을 피해 소리 없이 초소에 닿았다. 걸쇠는 그대로 쓸 수 있다.',
    txt_ruins_watch_breached: '낡은 걸쇠를 검으로 밀어 부쉈다. 길은 열렸지만 공용 통로로 고치려면 더 많은 자재가 필요하다.',
    txt_ruins_watch_blocked: '돌과 쇳조각이 쏟아져 물러났다. 회랑 안의 소란이 커졌다.',
    txt_ruins_watch_waited: '발을 멈추고 소리가 가라앉기를 기다렸다. 다시 발 디딜 틈이 보인다.',
    txt_ruins_watch_restored: '초소의 들보를 고치고 마을 쪽 문을 열었다. 통행로가 생기자 주민들이 길을 지키기 시작한다.',
    txt_ruins_watch_looted: '남은 은화와 연고를 챙겼다. 마을로 이어질 수 있던 길은 무너진 채 남는다.',
    txt_ruins_watch_reported: '원로는 새 통로의 위치를 기록하고 길을 지킬 사람을 보낸다. 작은 보수를 건넨다.'
  }
};
