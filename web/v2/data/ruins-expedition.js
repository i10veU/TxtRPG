// Optional post-mystery exploration. All rules reuse V2 Condition/Effect semantics.
// The collapsed cellar is an ordinary cache, not a new World Bible canon claim.
const at = (id) => ({ op: 'location', at: id });
const flag = (key) => ({ op: 'flag', key });
const not = (condition) => ({ op: 'not', of: condition });
const and = (...of) => ({ op: 'and', of });
const stamina = (min) => ({ op: 'resource', resource: 'stamina', min });
const light = { op: 'or', of: [
  { op: 'item', item: 'item_lantern', min: 1 },
  { op: 'trait', trait: 'night_vision' }
] };
const mapped = { op: 'unlock', id: 'unl_ruins_cellar_route' };
const unresolved = not(flag('ruins_cellar_resolved'));
const lowerMapped = { op: 'unlock', id: 'unl_ruins_lower_route' };
const lowerUnresolved = not(flag('ruins_lower_resolved'));
const equippedSword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const guardedDamage = (guarded, unguarded) => ({
  op: 'if', when: { op: 'unlock', id: 'unl_guarded_stance' },
  then: [{ op: 'hp', add: guarded }], else: [{ op: 'hp', add: unguarded }]
});
const say = (textId) => ({ op: 'narrate', textId });
// The patrol has three finite world milestones. Failure adds alarm but never
// grants loot; completing the third sortie permanently secures this room.
const patrolOpen = and(flag('ruins_lower_resolved'),
  not(flag('ruins_lower_patrol_safe')), { op: 'signal', key: 'ruins_lower_patrol_progress', max: 2 });
const raiseAlarm = { op: 'if', when: { op: 'signal', key: 'ruins_lower_alarm', max: 1 },
  then: [{ op: 'signal', key: 'ruins_lower_alarm', add: 1 }] };
const easeAlarm = { op: 'if', when: { op: 'signal', key: 'ruins_lower_alarm', min: 1 },
  then: [{ op: 'signal', key: 'ruins_lower_alarm', add: -1 }] };
const finishPatrol = [
  { op: 'signal', key: 'ruins_lower_patrol_progress', add: 1 }, easeAlarm,
  { op: 'if', when: { op: 'signal', key: 'ruins_lower_patrol_progress', min: 3 },
    then: [{ op: 'flag', key: 'ruins_lower_patrol_safe', value: true }, say('txt_ruins_lower_secured')],
    else: [say('txt_ruins_lower_progress')] }
];

export const ruinsExpedition = {
  locations: {
    loc_ruins_cellar: {
      name: '폐허 아래 매몰 창고',
      links: [
        { to: 'loc_ruins', minutes: 20 },
        // A public refuge survives its founder; no successor inherits the private map.
        { to: 'loc_village', minutes: 20, requires: flag('ruins_cellar_refuge') },
        { to: 'loc_ruins_lower_vault', minutes: 25, requires: { op: 'or', of: [lowerMapped, flag('ruins_lower_public')] } }
      ]
    },
    loc_ruins_lower_vault: {
      name: '매몰 창고 아래 봉인된 방',
      links: [
        { to: 'loc_ruins_cellar', minutes: 25 },
        { to: 'loc_village', minutes: 30, requires: flag('ruins_lower_public') },
        { to: 'loc_ruins_gallery', minutes: 30, requires: flag('ruins_watch_gallery_open') }
      ]
    }
  },
  actions: {
    act_trace_ruins_cellar: {
      name: '폐허 유물의 흔적을 따라 매몰 창고 입구를 찾는다 (기력 2, 1시간)',
      requires: and(at('loc_ruins'), light, { op: 'item', item: 'item_relic', min: 1 },
        { op: 'skill', skill: 'investigation', min: 1 }, not(mapped), stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 60,
      outcomes: {
        great: [
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 15 },
          { op: 'unlock', id: 'unl_ruins_cellar_route' }, say('txt_ruins_cellar_found')
        ],
        success: [
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 10 },
          { op: 'unlock', id: 'unl_ruins_cellar_route' }, say('txt_ruins_cellar_found')
        ],
        partial: [
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 5 },
          { op: 'hp', add: -1 }, say('txt_ruins_cellar_search_fail')
        ],
        fail: [
          { op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 5 },
          { op: 'hp', add: -2 }, say('txt_ruins_cellar_search_fail')
        ]
      }
    },
    // Both endings consume the same finite cache: private windfall OR public shelter.
    act_ruins_cellar_take_cache: {
      name: '매몰 창고의 남은 물자를 가져간다 (기력 2, 1시간)',
      requires: and(at('loc_ruins_cellar'), unresolved, stamina(2)),
      minutes: 60,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'money', add: 8 },
        { op: 'item', item: 'item_mill_bread', add: 2 },
        { op: 'flag', key: 'ruins_cellar_resolved', value: true },
        { op: 'flag', key: 'ruins_cellar_looted', value: true },
        say('txt_ruins_cellar_taken')
      ]
    },
    act_ruins_cellar_make_refuge: {
      name: '매몰 창고를 마을의 피난처로 정비한다 (은화 4, 기력 2, 3시간)',
      requires: and(at('loc_ruins_cellar'), unresolved, { op: 'money', min: 4 }, stamina(2)),
      minutes: 180,
      effects: [
        { op: 'money', add: -4 },
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ruins_cellar_resolved', value: true },
        { op: 'flag', key: 'ruins_cellar_refuge', value: true },
        { op: 'relation', from: 'org_village', add: 4 },
        say('txt_ruins_cellar_refuge_built')
      ]
    },
    // Two ways into the same optional room: careful investigation or a noisy
    // sword breach. A failed check never creates an entrance or reward.
    act_ruins_lower_scout: {
      name: '창고 아래 틈을 조사해 조용히 봉인된 방을 연다 (기력 2, 90분)',
      requires: and(at('loc_ruins_cellar'), flag('ruins_cellar_resolved'),
        not(flag('ruins_lower_open')), light,
        { op: 'skill', skill: 'investigation', min: 1 }, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'proficiency', id: 'investigation', add: 15 },
          { op: 'flag', key: 'ruins_lower_open', value: true }, { op: 'unlock', id: 'unl_ruins_lower_route' }, say('txt_ruins_lower_scout_success')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'proficiency', id: 'investigation', add: 10 },
          { op: 'flag', key: 'ruins_lower_open', value: true }, { op: 'unlock', id: 'unl_ruins_lower_route' }, say('txt_ruins_lower_scout_success')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'proficiency', id: 'investigation', add: 5 },
          { op: 'hp', add: -1 }, say('txt_ruins_lower_scout_fail')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 }, { op: 'proficiency', id: 'investigation', add: 5 },
          { op: 'hp', add: -2 }, say('txt_ruins_lower_scout_fail')]
      }
    },
    act_ruins_lower_breach: {
      name: '검으로 봉인된 철문을 강제로 연다 (기력 3, 90분)',
      requires: and(at('loc_ruins_cellar'), flag('ruins_cellar_resolved'),
        not(flag('ruins_lower_open')), equippedSword,
        { op: 'skill', skill: 'swordsmanship', min: 1 }, stamina(3)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -3 }, { op: 'proficiency', id: 'combat', add: 15 },
          { op: 'flag', key: 'ruins_lower_open', value: true }, { op: 'flag', key: 'ruins_lower_noisy', value: true },
          { op: 'unlock', id: 'unl_ruins_lower_route' }, say('txt_ruins_lower_breach_success')],
        success: [{ op: 'resource', resource: 'stamina', add: -3 }, { op: 'proficiency', id: 'combat', add: 10 },
          { op: 'flag', key: 'ruins_lower_open', value: true }, { op: 'flag', key: 'ruins_lower_noisy', value: true },
          { op: 'unlock', id: 'unl_ruins_lower_route' }, say('txt_ruins_lower_breach_success')],
        partial: [{ op: 'resource', resource: 'stamina', add: -3 }, { op: 'proficiency', id: 'combat', add: 5 },
          guardedDamage(0, -1), say('txt_ruins_lower_breach_fail')],
        fail: [{ op: 'resource', resource: 'stamina', add: -3 }, { op: 'proficiency', id: 'combat', add: 5 },
          guardedDamage(-1, -3), say('txt_ruins_lower_breach_fail')]
      }
    },
    // An opened entrance is an observable physical change, but an heir still
    // needs to learn its location unless the public route was built.
    act_ruins_lower_follow_tracks: {
      name: '먼저 열린 지하 통로의 흔적을 따라 길을 익힌다 (30분)',
      requires: and(at('loc_ruins_cellar'), flag('ruins_lower_open'),
        not(flag('ruins_lower_public')), not(lowerMapped), light),
      minutes: 30,
      effects: [{ op: 'unlock', id: 'unl_ruins_lower_route' }, say('txt_ruins_lower_tracks')]
    },
    act_ruins_lower_salvage: {
      name: '봉인된 방에서 남은 무기와 연고를 챙긴다 (기력 2, 90분)',
      requires: and(at('loc_ruins_lower_vault'), lowerUnresolved, stamina(2)),
      minutes: 90,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'item', item: 'item_iron_sword', add: 1 },
        { op: 'item', item: 'item_herbal_salve', add: 1 },
        { op: 'proficiency', id: 'combat', add: 10 },
        { op: 'flag', key: 'ruins_lower_resolved', value: true },
        { op: 'flag', key: 'ruins_lower_salvaged', value: true }, say('txt_ruins_lower_salvaged')
      ]
    },
    // A quiet opening costs less to turn into a village route. A forced breach
    // is viable but requires extra repairs: combat and scouting matter.
    act_ruins_lower_public_passage: {
      name: '조용한 지하 통로를 마을 공용길로 정비한다 (은화 3, 기력 2, 2시간)',
      requires: and(at('loc_ruins_lower_vault'), lowerUnresolved,
        not(flag('ruins_lower_noisy')), { op: 'money', min: 3 }, stamina(2)),
      minutes: 120,
      effects: [
        { op: 'money', add: -3 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ruins_lower_resolved', value: true },
        { op: 'flag', key: 'ruins_lower_public', value: true },
        { op: 'relation', from: 'org_village', add: 4 }, say('txt_ruins_lower_public')
      ]
    },
    act_ruins_lower_repair_breach: {
      name: '부서진 철문을 수리해 마을 공용길로 연다 (은화 6, 기력 3, 3시간)',
      requires: and(at('loc_ruins_lower_vault'), lowerUnresolved,
        flag('ruins_lower_noisy'), { op: 'money', min: 6 }, stamina(3)),
      minutes: 180,
      effects: [
        { op: 'money', add: -6 }, { op: 'resource', resource: 'stamina', add: -3 },
        { op: 'flag', key: 'ruins_lower_resolved', value: true },
        { op: 'flag', key: 'ruins_lower_public', value: true },
        { op: 'relation', from: 'org_village', add: 4 }, say('txt_ruins_lower_public')
      ]
    },
    // A short, finite three-sortie expedition. Investigation trades speed
    // for safety, swordsmanship trades injury risk for silver. Repeated failed
    // checks cannot mint resources, and the world remembers completed sorties.
    act_ruins_lower_silent_patrol: {
      name: '불빛을 낮추고 봉인실의 남은 통로를 정찰한다 (기력 2, 2시간)',
      requires: and(at('loc_ruins_lower_vault'), patrolOpen, light,
        { op: 'skill', skill: 'investigation', min: 1 },
        { op: 'signal', key: 'ruins_lower_alarm', max: 1 }, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 120,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 15 },
          { op: 'item', item: 'item_herbal_salve', add: 1 }, ...finishPatrol],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 10 }, ...finishPatrol],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 3 },
          { op: 'hp', add: -1 }, raiseAlarm, say('txt_ruins_lower_patrol_fail')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -2 }, raiseAlarm, say('txt_ruins_lower_patrol_fail')]
      }
    },
    act_ruins_lower_armed_patrol: {
      name: '검을 뽑아 봉인실의 잔당을 몰아낸다 (기력 3, 90분)',
      requires: and(at('loc_ruins_lower_vault'), patrolOpen, equippedSword,
        { op: 'skill', skill: 'swordsmanship', min: 1 }, stamina(3)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'proficiency', id: 'combat', add: 15 },
          { op: 'money', add: 4 }, ...finishPatrol],
        success: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'proficiency', id: 'combat', add: 10 },
          { op: 'money', add: 3 }, ...finishPatrol],
        partial: [{ op: 'resource', resource: 'stamina', add: -3 },
          guardedDamage(-1, -3), raiseAlarm, say('txt_ruins_lower_patrol_fail')],
        fail: [{ op: 'resource', resource: 'stamina', add: -3 },
          guardedDamage(-2, -5), raiseAlarm, say('txt_ruins_lower_patrol_fail')]
      }
    },
    act_ruins_lower_calm_alarm: {
      name: '소란이 가라앉을 때까지 몸을 숨긴다 (기력 1, 90분)',
      requires: and(at('loc_ruins_lower_vault'), patrolOpen,
        { op: 'signal', key: 'ruins_lower_alarm', min: 1 }, stamina(1)),
      minutes: 90,
      effects: [{ op: 'resource', resource: 'stamina', add: -1 },
        { op: 'signal', key: 'ruins_lower_alarm', add: -1 }, say('txt_ruins_lower_alarm_eased')]
    },
    act_ruins_lower_rest_safe: {
      name: '안전해진 지하 방에서 몸을 추스른다 (1시간)',
      requires: and(at('loc_ruins_lower_vault'), flag('ruins_lower_patrol_safe')),
      minutes: 60,
      effects: [{ op: 'hp', add: 3 }, { op: 'resource', resource: 'stamina', add: 4 },
        say('txt_ruins_lower_rest_safe')]
    },
    act_ruins_lower_report_watch: {
      name: '마을에 지하 통로의 안전 확보를 알린다 (30분)',
      requires: and(at('loc_village'), flag('ruins_lower_patrol_safe'),
        not(flag('ruins_lower_patrol_reported'))),
      minutes: 30,
      effects: [{ op: 'flag', key: 'ruins_lower_patrol_reported', value: true },
        { op: 'money', add: 5 }, { op: 'relation', from: 'org_village', add: 5 },
        { op: 'if', when: { op: 'signal', key: 'road_trouble', min: 1 },
          then: [{ op: 'signal', key: 'road_trouble', add: -1 }] },
        say('txt_ruins_lower_report_watch')]
    },
    act_rest_ruins_cellar_refuge: {
      name: '정비된 피난처에서 쉬며 회복한다 (1시간)',
      requires: and(at('loc_ruins_cellar'), flag('ruins_cellar_refuge')),
      minutes: 60,
      effects: [
        { op: 'hp', add: 4 },
        { op: 'resource', resource: 'stamina', add: 6 },
        say('txt_ruins_cellar_rest')
      ]
    }
  },
  texts: {
    txt_place_loc_ruins_cellar: '부서진 들보 아래 낮은 창고가 이어진다. 마른 흙냄새와 오래된 나무 상자만 남았다.',
    txt_ruins_cellar_found: '유물에 남은 긁힌 자국과 무너진 돌 틈이 맞아떨어진다. 폐허 아래로 이어지는 창고 입구를 찾아냈다.',
    txt_ruins_cellar_search_fail: '허물어진 돌더미가 쏟아진다. 상처를 입고 물러나지만 벽의 이음새는 조금 더 읽을 수 있게 됐다.',
    txt_ruins_cellar_taken: '창고의 남은 은화와 빵을 챙긴다. 이곳을 마을의 피난처로 쓸 기회는 사라졌다.',
    txt_ruins_cellar_refuge_built: '무너진 들보를 고치고 출입구를 밝힌다. 마을 사람들이 이용할 피난처와 짧은 통로가 생겼다.',
    txt_ruins_cellar_rest: '피난처의 마른 바닥에서 몸을 추스른다. 마을 사람들이 남겨 둔 물과 불씨가 있다.',
    txt_place_loc_ruins_lower_vault: '매몰 창고 아래 좁은 방. 뒤틀린 철문과 낡은 도구 자국이 남아 있다.',
    txt_ruins_lower_scout_success: '돌 틈의 결을 따라 힘을 나눠 주자 봉인이 조용히 열린다. 다른 이들은 아직 이 길을 모른다.',
    txt_ruins_lower_scout_fail: '돌이 흔들려 물러난다. 틈의 방향을 더 익혔지만 아직 들어갈 수 없다.',
    txt_ruins_lower_breach_success: '검끝으로 걸쇠를 비틀어 문을 연다. 철문이 크게 찢겨 나중에 공용길로 고치려면 손이 더 간다.',
    txt_ruins_lower_breach_fail: '철문이 튕겨 나온다. 방어 자세가 무너지면 더 크게 다친다.',
    txt_ruins_lower_tracks: '이전에 열렸던 문틈과 발자국을 따라 지하로 내려가는 길을 기억한다.',
    txt_ruins_lower_salvaged: '녹슨 선반에서 쓸 만한 철검과 연고를 챙긴다. 마을의 새 통로로 정비할 물자는 남지 않는다.',
    txt_ruins_lower_public: '통로를 보강하고 마을 쪽 출구를 정리한다. 이후 이곳은 누구나 지날 수 있는 공용길이 된다.',
    txt_ruins_lower_progress: '봉인실의 남은 길목 하나를 확보했다. 아직 위험한 통로가 남아 있다.',
    txt_ruins_lower_secured: '마지막 어둠 속 통로까지 정리했다. 이제 이 방에서 쉬어도 기습당할 염려가 줄었다.',
    txt_ruins_lower_patrol_fail: '통로 안쪽에서 돌이 굴러 떨어진다. 흔적을 놓쳤고 소란만 커졌다.',
    txt_ruins_lower_alarm_eased: '벽 뒤에 숨은 채 발소리가 멀어질 때까지 기다렸다. 다시 조용히 움직일 수 있다.',
    txt_ruins_lower_rest_safe: '확보한 방의 구석에서 상처를 씻고 잠시 눈을 붙였다.',
    txt_ruins_lower_report_watch: '마을에 안전해진 지하 통로를 알렸다. 사람들은 보수를 모아 주고, 북쪽 길목에도 한결 안심하고 나선다.'
  }
};
