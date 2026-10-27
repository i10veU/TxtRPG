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
const sideMapped = unlock('unl_cistern_side_ledge');
const sideFlowKnown = unlock('unl_cistern_side_flow');
const sideLadderMapped = unlock('unl_cistern_vault_ladder');
const sideLadderOpen = flag('ruins_cistern_side_ladder');
const sideLadderRoute = and(sideLadderOpen, sideLadderMapped);
const sideUnresolved = not(flag('ruins_cistern_side_resolved'));
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
        { to: 'loc_ruins_lower_vault', minutes: 10, requires: sideLadderRoute },
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
    // The opened sluice leaves a narrow side channel. A character who studies
    // the flow can explore it without injury; a hurried crossing risks harm.
    // The knowledge is personal, while the one finite cache is world-owned.
    act_cistern_read_side_current: {
      name: '열린 수문 옆 물살과 안전한 디딤돌의 순서를 읽는다 (25분)',
      requires: and(inRoom, opened, not(sideFlowKnown),
        { op: 'skill', skill: 'investigation', min: 1 }),
      minutes: 25,
      effects: [
        { op: 'unlock', id: 'unl_cistern_side_flow' },
        { op: 'proficiency', id: 'investigation', add: 6 },
        say('txt_cistern_side_flow_read')
      ]
    },
    act_cistern_trace_side_safe: {
      name: '읽어 낸 물살의 틈으로 측면 배수로를 조사한다 (기력 1, 35분)',
      requires: and(inRoom, opened, sideFlowKnown, not(sideMapped), stamina(1)),
      minutes: 35,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'unlock', id: 'unl_cistern_side_ledge' },
        { op: 'proficiency', id: 'investigation', add: 8 },
        say('txt_cistern_side_found')
      ]
    },
    act_cistern_trace_side_risky: {
      name: '물살을 읽지 않고 좁은 배수로를 빠르게 건넌다 (기력 2, 20분)',
      requires: and(inRoom, opened, not(sideMapped), stamina(2)),
      check: { stat: 'dex', skill: 'investigation', tags: ['investigation'], difficulty: 'normal' },
      minutes: 20,
      outcomes: {
        great: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'unlock', id: 'unl_cistern_side_ledge' }, say('txt_cistern_side_found')],
        success: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'unlock', id: 'unl_cistern_side_ledge' }, say('txt_cistern_side_found')],
        partial: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -2 }, say('txt_cistern_side_swept')],
        fail: [{ op: 'resource', resource: 'stamina', add: -2 },
          { op: 'hp', add: -4 }, say('txt_cistern_side_swept')]
      }
    },
    // Building a shared ladder uses the very same finite timber and fittings
    // as taking the cache. The ladder is physical and persists across heirs.
    act_cistern_build_side_ladder: {
      name: '배수로 자재로 봉인실까지 공용 사다리를 잇는다 (은화 3, 기력 2, 90분)',
      requires: and(inRoom, opened, sideMapped, sideUnresolved,
        { op: 'money', min: 3 }, stamina(2)),
      minutes: 90,
      effects: [
        { op: 'money', add: -3 }, { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'flag', key: 'ruins_cistern_side_resolved', value: true },
        { op: 'flag', key: 'ruins_cistern_side_ladder', value: true },
        { op: 'unlock', id: 'unl_cistern_vault_ladder' },
        { op: 'relation', from: 'org_village', add: 2 },
        { op: 'proficiency', id: 'investigation', add: 8 },
        say('txt_cistern_side_ladder_built')
      ]
    },
    act_cistern_take_side_cache: {
      name: '배수로의 남은 은화와 연고를 회수하고 공용길을 포기한다 (기력 2, 60분)',
      requires: and(inRoom, opened, sideMapped, sideUnresolved, stamina(2)),
      minutes: 60,
      effects: [
        { op: 'resource', resource: 'stamina', add: -2 },
        { op: 'money', add: 6 }, { op: 'item', item: 'item_herbal_salve', add: 1 },
        { op: 'flag', key: 'ruins_cistern_side_resolved', value: true },
        { op: 'flag', key: 'ruins_cistern_side_cache_taken', value: true },
        say('txt_cistern_side_cache_taken')
      ]
    },
    act_cistern_retrace_vault_ladder: {
      name: '남아 있는 공용 사다리의 봉인실 출구를 직접 확인한다 (20분)',
      requires: and(inRoom, sideLadderOpen, not(sideLadderMapped)),
      minutes: 20,
      effects: [{ op: 'unlock', id: 'unl_cistern_vault_ladder' },
        say('txt_cistern_side_ladder_traced')]
    },
    act_lower_vault_retrace_cistern_ladder: {
      name: '봉인실의 공용 사다리에서 수문실로 내려가는 길을 확인한다 (20분)',
      requires: and(at('loc_ruins_lower_vault'), light,
        sideLadderOpen, not(sideLadderMapped)),
      minutes: 20,
      effects: [{ op: 'unlock', id: 'unl_cistern_vault_ladder' },
        say('txt_cistern_side_ladder_traced')]
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
    txt_cistern_side_flow_read: '수문 옆 물살이 세 번 갈라진다. 두 번째 바위 뒤에서는 흐름이 약해져 안전하게 건널 수 있다.',
    txt_cistern_side_found: '젖은 돌턱을 건너자 봉인실 쪽으로 이어지는 좁은 틈이 나타난다. 남은 목재와 연고를 챙길 수도, 모두가 쓸 사다리를 만들 수도 있다.',
    txt_cistern_side_swept: '물살에 발을 빼앗겨 돌벽에 부딪혔다. 배수로 입구로 밀려나왔다.',
    txt_cistern_side_ladder_built: '남은 목재를 묶어 봉인실까지 사다리를 걸었다. 지나갈 사람은 많지 않아도 이 길은 남는다.',
    txt_cistern_side_cache_taken: '연고와 은화를 챙겨 돌아왔다. 공용 사다리를 세울 자재는 더 이상 남지 않았다.',
    txt_cistern_side_ladder_traced: '젖은 돌벽을 따라 공용 사다리의 양쪽 출구를 확인했다. 이제 길을 잃지 않는다.',
    txt_cistern_passage_traced: '물 빠진 돌바닥의 흔적을 따라가 출구를 확인했다. 이제 감시 초소로 빠져나갈 수 있다.'
  }
};
