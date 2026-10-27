// A finite opponent beyond the opened sluice. The current's safe footing is
// learned in person; no secret stance, location, or NPC HP enters PlayerView.
// One reliable low-damage response competes with risky, stronger swordplay.
const at = { op: 'location', at: 'loc_ruins_cistern' };
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const flag = key => ({ op: 'flag', key });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const say = textId => ({ op: 'narrate', textId });
const alive = { op: 'alive', subject: 'npc_cistern_warden' };
const stance = n => ({ op: 'signal', key: 'cistern_warden_stance', eq: n });
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const light = { op: 'or', of: [
  { op: 'item', item: 'item_lantern', min: 1 },
  { op: 'trait', trait: 'night_vision' }
] };
const encounter = and(at, light, flag('ruins_cistern_sluice_open'), alive);
const ready = and(encounter, sword, { op: 'skill', skill: 'swordsmanship', min: 1 });
const tell = { op: 'if', when: stance(0),
  then: [say('txt_cistern_warden_overhead')], else: [say('txt_cistern_warden_sweep')] };
const rotate = { op: 'if', when: stance(0),
  then: [{ op: 'signal', key: 'cistern_warden_stance', add: 1 }],
  else: [{ op: 'signal', key: 'cistern_warden_stance', add: -1 }] };
const award = { op: 'if', when: not(alive), then: [
  { op: 'flag', key: 'ruins_cistern_warden_defeated', value: true },
  { op: 'money', add: 4 },
  { op: 'proficiency', id: 'combat', add: 12 },
  say('txt_cistern_warden_defeated')
] };
const strike = (amount, textId) => [
  { op: 'hp', subject: 'npc_cistern_warden', add: -amount },
  say(textId), award
];
const resolve = (expected, cost, damage, tier) => [
  { op: 'resource', resource: 'stamina', add: -cost },
  { op: 'if', when: stance(expected), then:
    tier === 'great' ? strike(damage + 1, 'txt_cistern_warden_hit')
      : tier === 'success' ? strike(damage, 'txt_cistern_warden_hit')
      : tier === 'partial' ? [{ op: 'hp', add: -1 }, ...strike(2, 'txt_cistern_warden_graze')]
      : [{ op: 'hp', add: -3 }, say('txt_cistern_warden_miss')],
    else: [{ op: 'hp', add: -2 }, say('txt_cistern_warden_wrong')] },
  { op: 'if', when: alive, then: [rotate, tell] }
];
function attack(name, expected, cost, damage, stat) {
  return {
    name, requires: and(ready, stamina(cost)), minutes: 10,
    check: { stat, skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
    outcomes: {
      great: resolve(expected, cost, damage, 'great'),
      success: resolve(expected, cost, damage, 'success'),
      partial: resolve(expected, cost, damage, 'partial'),
      fail: resolve(expected, cost, damage, 'fail')
    }
  };
}

export const ruinsCisternWarden = {
  npcs: {
    npc_cistern_warden: { name: '침수 수문실의 무장 도굴꾼', actor: {
      locationId: 'loc_ruins_cistern', hp: { max: 12 },
      growth: { growth_wanderer: {
        stats: { str: 12, dex: 11, con: 11, int: 8, wis: 9, per: 10 },
        resources: { stamina: { current: 6, max: 6 } }
      } }
    } }
  },
  actions: {
    act_cistern_warden_observe: {
      name: '수문실 도굴꾼의 다음 검세를 살핀다 (5분)',
      requires: encounter, minutes: 5, effects: [tell]
    },
    act_cistern_warden_heavy: attack(
      '수문실 도굴꾼의 내려치기를 받아쳐 반격한다 (기력 2, 10분)', 0, 2, 4, 'str'),
    act_cistern_warden_quick: attack(
      '수문실 도굴꾼의 횡베기를 피하고 빠르게 반격한다 (기력 1, 10분)', 1, 1, 3, 'dex'),
    act_cistern_warden_flow_counter: {
      name: '배수로 물살에서 배운 발디딤으로 횡베기를 안전하게 피한다 (기력 1, 10분)',
      requires: and(ready, { op: 'unlock', id: 'unl_cistern_side_flow' }, stance(1), stamina(1)),
      minutes: 10,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        ...strike(2, 'txt_cistern_warden_flow_counter'),
        { op: 'if', when: alive, then: [rotate, tell] }
      ]
    },
    act_cistern_warden_salvage: {
      name: '도굴꾼이 지키던 배수 기록과 응급 물자를 회수한다 (기력 1, 30분)',
      requires: and(at, light, flag('ruins_cistern_warden_defeated'),
        not(flag('ruins_cistern_warden_records_claimed')), stamina(1)),
      minutes: 30,
      effects: [
        { op: 'resource', resource: 'stamina', add: -1 },
        { op: 'flag', key: 'ruins_cistern_warden_records_claimed', value: true },
        { op: 'item', item: 'item_herbal_salve', add: 1 },
        { op: 'proficiency', id: 'investigation', add: 8 },
        say('txt_cistern_warden_salvaged')
      ]
    }
  },
  texts: {
    txt_cistern_warden_overhead: '물에 젖은 도굴꾼이 검을 높이 든다. 다음은 무거운 내려치기다.',
    txt_cistern_warden_sweep: '도굴꾼이 발을 넓게 벌리고 검을 낮춘다. 다음은 횡베기다.',
    txt_cistern_warden_hit: '예고된 공격을 읽고 빈틈을 정확히 찔렀다.',
    txt_cistern_warden_graze: '칼끝은 닿았지만 반격에 스쳤다.',
    txt_cistern_warden_miss: '공격의 박자를 놓쳐 도굴꾼의 검에 맞았다.',
    txt_cistern_warden_wrong: '상대의 검세를 잘못 읽어 방어가 무너졌다.',
    txt_cistern_warden_flow_counter: '수문 옆에서 익힌 물살의 발디딤을 떠올렸다. 낮게 디뎌 횡베기를 피하고 반격했다.',
    txt_cistern_warden_defeated: '수문실의 도굴꾼이 쓰러졌다. 빼앗긴 은화 4를 되찾았고 배수 기록을 살펴볼 수 있게 되었다.',
    txt_cistern_warden_salvaged: '젖은 배수 기록과 응급 연고를 회수했다. 남은 물자는 더 이상 없다.'
  }
};
