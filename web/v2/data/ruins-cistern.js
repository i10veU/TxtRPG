// Optional, local ruins exploration. The cistern is physical world state;
// its route and valve markings are learned by individual characters only.
// A quiet valve sequence and a risky sword breach reach the same durable
// shortcut. Neither action creates supplies, new canon, or hidden UI hints.
const at = id => ({ op: 'location', at: id });
const flag = key => ({ op: 'flag', key });
const unlock = id => ({ op: 'unlock', id });
const not = of => ({ op: 'not', of });
const and = (...of) => ({ op: 'and', of });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const say = textId => ({ op: 'narrate', textId });
const light = { op: 'or', of: [
  { op: 'item', item: 'item_lantern', min: 1 }, { op: 'trait', trait: 'night_vision' }
] };
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const entryKnown = unlock('unl_ruins_cistern_route');
const gateKnown = unlock('unl_cistern_watch_route');
const opened = flag('ruins_cistern_sluice_open');
const dryRoute = and(opened, gateKnown);
const inRoom = and(at('loc_ruins_cistern'), light);
const revealGate = [
  { op: 'flag', key: 'ruins_cistern_sluice_open', value: true },
  { op: 'unlock', id: 'unl_cistern_watch_route' }
];

export const ruinsCistern = {
  locations: {
    loc_ruins_cistern: {
      name: '폐허 아래 잠긴 옛 수문실',
      links: [
        { to: 'loc_ruins_gallery', minutes: 20 },
        { to: 'loc_ruins_watchpost', minutes: 12, requires: dryRoute }
      ]
    }
  },
  actions: {
    act_gallery_trace_cistern: {
      name: '안전해진 회랑의 물소리를 따라 숨은 수문실 입구를 찾는다 (기력 1, 40분)',
      requires: and(at('loc_ruins_gallery'), flag('ruins_gallery_secured'),
        flag('ruins_watch_gallery_open'), not(entryKnown), light, stamina(1)),
      minutes: 40,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_cistern_entrance_open', value: true },
        { op: 'unlock', id: 'unl_ruins_cistern_route' },
        { op: 'proficiency', id: 'investigation', add: 5 },
        say('txt_cistern_entrance_found')
      ]
    },
    act_cistern_read_marks: {
      name: '수문 바퀴의 압력 눈금과 추의 순서를 읽는다 (30분)',
      requires: and(inRoom, not(opened), not(unlock('unl_cistern_valve_marks')),
        { op: 'skill', skill: 'investigation', min: 1 }),
      minutes: 30,
      effects: [
        { op: 'unlock', id: 'unl_cistern_valve_marks' },
        { op: 'proficiency', id: 'investigation', add: 5 },
        say('txt_cistern_marks_read')
      ]
    },
    act_cistern_balance_intake: {
      name: '먼저 취수 바퀴를 돌려 압력을 낮춘다 (기력 1, 30분)',
      requires: and(inRoom, not(opened), unlock('unl_cistern_valve_marks'),
        { op: 'signal', key: 'ruins_cistern_balance', eq: 0 }, stamina(1)),
      minutes: 30,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'signal', key: 'ruins_cistern_balance', add: 1 },
        say('txt_cistern_intake_balanced')
      ]
    },
    act_cistern_set_counterweight: {
      name: '압력이 내려간 뒤 반대쪽 평형추를 걸어 고정한다 (기력 1, 30분)',
      requires: and(inRoom, not(opened), unlock('unl_cistern_valve_marks'),
        { op: 'signal', key: 'ruins_cistern_balance', eq: 1 }, stamina(1)),
      minutes: 30,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'signal', key: 'ruins_cistern_balance', add: 1 },
        say('txt_cistern_counterweight_set')
      ]
    },
    act_cistern_open_sluice: {
      name: '압력이 안정된 수문을 열어 감시 초소로 이어지는 길을 낸다 (기력 2, 45분)',
      requires: and(inRoom, not(opened), unlock('unl_cistern_valve_marks'),
        { op: 'signal', key: 'ruins_cistern_balance', eq: 2 }, stamina(2)),
      minutes: 45,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        ...revealGate,
        { op: 'proficiency', id: 'investigation', add: 18 },
        say('txt_cistern_sluice_opened')
      ]
    },
    // Strength offers a second, dangerous path without granting the quiet
    // solution's investigation mastery. Failure never destroys the puzzle.
    act_cistern_force_sluice: {
      name: '검으로 녹슨 수문 걸쇠를 끊어 강제로 연다 (기력 3, 60분)',
      requires: and(inRoom, not(opened), sword,
        { op: 'skill', skill: 'swordsmanship', min: 2 }, stamina(3)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'hard' },
      minutes: 60,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -3 }, ...revealGate,
          { op: 'proficiency', id: 'combat', add: 12 }, say('txt_cistern_forced')],
        success: [{ op: 'resource', resource: 'stamina', add: -3 }, ...revealGate,
          { op: 'proficiency', id: 'combat', add: 8 }, say('txt_cistern_forced')],
        partial: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'hp', add: -1 }, say('txt_cistern_force_failed')],
        fail: [{ op: 'resource', resource: 'stamina', add: -3 },
          { op: 'hp', add: -3 }, say('txt_cistern_force_failed')]
      }
    },
    // The physical gate survives generations, but a successor must inspect
    // it in person to learn the private route. No automatic inherited map.
    act_cistern_retrace_passage: {
      name: '열린 수문 너머의 감시 초소 출구를 직접 확인한다 (20분)',
      requires: and(inRoom, opened, not(gateKnown)),
      minutes: 20,
      effects: [
        { op: 'unlock', id: 'unl_cistern_watch_route' },
        say('txt_cistern_passage_traced')
      ]
    }
  },
  texts: {
    txt_place_loc_ruins_cistern: '물방울이 돌계단을 타고 흐른다. 두 개의 녹슨 바퀴와 평형추가 맞물린 수문이 어둠 속에 서 있다.',
    txt_cistern_entrance_found: '회랑 벽의 물길을 따라가자 돌판 아래 계단이 보인다. 내려가면 오래된 수문실이다.',
    txt_cistern_marks_read: '바퀴에 새겨진 선을 읽었다. 먼저 취수구의 압력을 낮추고, 그다음 평형추를 걸어야 문이 열린다.',
    txt_cistern_intake_balanced: '취수구가 천천히 닫힌다. 수문을 떠받치던 물의 힘이 한결 줄었다.',
    txt_cistern_counterweight_set: '평형추가 걸리며 바퀴가 멈췄다. 이제 수문을 들어 올려도 물살이 덮치지 않는다.',
    txt_cistern_sluice_opened: '수문이 올라가자 물이 빠진 통로가 드러난다. 감시 초소까지 이어지는 짧은 길이다.',
    txt_cistern_forced: '녹슨 걸쇠를 검으로 끊었다. 요란한 물소리 뒤로 초소까지 이어지는 통로가 드러났다.',
    txt_cistern_force_failed: '걸쇠가 버티는 사이 튄 쇳조각과 돌에 맞았다. 수문은 여전히 잠겨 있다.',
    txt_cistern_passage_traced: '물 빠진 돌바닥의 흔적을 따라가 출구를 확인했다. 이제 감시 초소로 빠져나갈 수 있다.'
  }
};
