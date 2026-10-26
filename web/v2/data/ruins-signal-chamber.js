// Provisional optional dungeon after the watchpost. The room's physical
// opening belongs to the world; knowing how to enter is character knowledge.
// A finite cache offers a permanent public shortcut OR a steel weapon, never
// both. No new engine, Save schema, faction, or World Bible canon is required.
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
const roomOpen = flag('ruins_signal_chamber_open');
const roomUnknown = not({ op: 'unlock', id: 'unl_ruins_signal_chamber_route' });
const unresolved = not(flag('ruins_signal_chamber_resolved'));
const open = [
  { op: 'flag', key: 'ruins_signal_chamber_open', value: true },
  { op: 'unlock', id: 'unl_ruins_signal_chamber_route' }
];
const publicRoute = [
  { op: 'flag', key: 'ruins_signal_chamber_resolved', value: true },
  { op: 'flag', key: 'ruins_signal_public_passage', value: true },
  { op: 'relation', from: 'org_village', add: 3 },
  { op: 'proficiency', id: 'investigation', add: 15 },
  say('txt_ruins_signal_passage_marked')
];

export const ruinsSignalChamber = {
  locations: {
    loc_ruins_signal_chamber: {
      name: '감시 초소 아래 폐쇄된 신호실',
      links: [{ to: 'loc_ruins_watchpost', minutes: 15 }]
    }
  },
  actions: {
    act_ruins_signal_survey_entrance: {
      name: '초소 바닥의 숨은 신호실 입구를 조사한다 (기력 2, 90분)',
      requires: and(at('loc_ruins_watchpost'), flag('ruins_watchpost_resolved'),
        not(roomOpen), light, { op: 'skill', skill: 'investigation', min: 1 }, stamina(2)),
      check: { stat: 'per', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 90,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 15 }, ...open, say('txt_ruins_signal_found')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'investigation', add: 10 }, ...open, say('txt_ruins_signal_found')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -1 }, say('txt_ruins_signal_search_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -2 }, say('txt_ruins_signal_search_failed')]
      }
    },
    act_ruins_signal_break_entrance: {
      name: '검으로 신호실의 봉인된 뚜껑을 부순다 (기력 2, 1시간)',
      requires: and(at('loc_ruins_watchpost'), flag('ruins_watchpost_resolved'),
        not(roomOpen), sword, { op: 'skill', skill: 'swordsmanship', min: 1 }, stamina(2)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 60,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 15 }, ...open,
          { op: 'flag', key: 'ruins_signal_chamber_noisy', value: true }, say('txt_ruins_signal_breached')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'proficiency', id: 'combat', add: 10 }, ...open,
          { op: 'flag', key: 'ruins_signal_chamber_noisy', value: true }, say('txt_ruins_signal_breached')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -2 }, say('txt_ruins_signal_break_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -3 }, say('txt_ruins_signal_break_failed')]
      }
    },
    // An heir can inspect the open hatch in person, but does not inherit the
    // predecessor's private map. Merely seeing the world flag reveals no UI link.
    act_ruins_signal_follow_tracks: {
      name: '이미 열린 신호실의 흔적을 따라 출입구를 익힌다 (30분)',
      requires: and(at('loc_ruins_watchpost'), roomOpen, roomUnknown),
      minutes: 30,
      effects: [{ op: 'unlock', id: 'unl_ruins_signal_chamber_route' }, say('txt_ruins_signal_tracked')]
    },
    // Quiet entry avoids a damaged lintel; breaking in makes the public
    // passage more expensive to repair. A looted cache cannot fund both paths.
    act_ruins_signal_mark_passage: {
      name: '신호실의 옛 통로를 표지해 마을 공용 지름길로 연다 (은화 3, 기력 2, 2시간)',
      requires: and(at('loc_ruins_signal_chamber'), unresolved,
        not(flag('ruins_signal_chamber_noisy')), flag('ruins_cellar_resolved'),
        { op: 'skill', skill: 'investigation', min: 1 }, light,
        { op: 'money', min: 3 }, stamina(2)),
      minutes: 120,
      effects: [{ op: 'money', add: -3 }, { op: 'resource', resource: 'stamina', add: -2 }, ...publicRoute]
    },
    act_ruins_signal_repair_passage: {
      name: '부서진 신호실 통로를 보강해 마을 공용길로 연다 (은화 5, 기력 2, 3시간)',
      requires: and(at('loc_ruins_signal_chamber'), unresolved,
        flag('ruins_signal_chamber_noisy'), flag('ruins_cellar_resolved'),
        { op: 'skill', skill: 'investigation', min: 1 }, light,
        { op: 'money', min: 5 }, stamina(2)),
      minutes: 180,
      effects: [{ op: 'money', add: -5 }, { op: 'resource', resource: 'stamina', add: -2 }, ...publicRoute]
    },
    // The chamber's worn stone timing marks teach a personal, non-canonical
    // sword technique. It is available after either physical ending; the
    // public route and the private armory remain mutually exclusive.
    act_ruins_signal_learn_tempo_break: {
      name: '신호실의 검흔을 따라 상대의 호흡을 끊는 검술을 익힌다 (은화 2, 기력 2, 90분)',
      requires: and(at('loc_ruins_signal_chamber'), roomOpen,
        flag('ruins_signal_chamber_resolved'),
        not({ op: 'unlock', id: 'unl_tempo_break' }),
        sword, { op: 'skill', skill: 'swordsmanship', min: 1 },
        { op: 'money', min: 2 }, stamina(2)),
      minutes: 90,
      effects: [
        { op: 'money', add: -2 },
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'proficiency', id: 'combat', add: 10 },
        { op: 'unlock', id: 'unl_tempo_break' },
        say('txt_ruins_signal_tempo_learned')
      ]
    },
    act_ruins_signal_salvage_armory: {
      name: '신호실의 남은 무기와 연고를 챙기고 통로를 닫는다 (기력 2, 90분)',
      requires: and(at('loc_ruins_signal_chamber'), unresolved, stamina(2)),
      minutes: 90,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'item', item: 'item_steel_sword', add: 1 },
        { op: 'item', item: 'item_herbal_salve', add: 1 },
        { op: 'proficiency', id: 'combat', add: 15 },
        { op: 'flag', key: 'ruins_signal_chamber_resolved', value: true },
        { op: 'flag', key: 'ruins_signal_armory_looted', value: true },
        say('txt_ruins_signal_salvaged')
      ]
    }
  },
  texts: {
    txt_place_loc_ruins_signal_chamber: '감시 초소 아래 작은 신호실. 무너진 돌벽 너머로 오래된 통로가 이어지고, 벽 한편에는 닫힌 무기함이 남아 있다.',
    txt_ruins_signal_found: '바닥의 돌눈을 맞추자 잠겨 있던 판이 열린다. 어둠 속에 오래된 신호실이 드러났다.',
    txt_ruins_signal_search_failed: '틈새의 돌가루가 쏟아졌다. 길을 찾지 못한 채 손등에 상처만 남았다.',
    txt_ruins_signal_breached: '검으로 돌뚜껑의 걸쇠를 끊었다. 신호실은 열렸지만 통로의 받침도 부서졌다.',
    txt_ruins_signal_break_failed: '검이 돌틈에 걸리고 무너진 돌이 어깨를 친다. 뚜껑은 아직 닫혀 있다.',
    txt_ruins_signal_tracked: '열려 있는 판 아래 발자국과 손때를 확인했다. 이제 신호실의 출입구를 기억한다.',
    txt_ruins_signal_passage_marked: '돌을 걷어내고 길 표식을 세웠다. 초소와 매몰 창고 사이에 마을 사람도 다닐 수 있는 길이 생겼다.',
    txt_ruins_signal_tempo_learned: '돌벽의 끊긴 검흔을 따라 발을 옮겼다. 상대가 힘을 모으는 순간 칼등으로 리듬을 끊는 법을 깨달았다.',
    txt_ruins_signal_salvaged: '무기함에서 강철 검과 약초 연고를 꺼냈다. 돌문을 닫자 지름길을 정비할 자재는 더 이상 남지 않았다.'
  }
};
