// Two finite, physical gallery opponents. Their next attacks are revealed
// by local observation; no private actor location/HP is projected to the UI.
const at = { op: 'location', at: 'loc_ruins_gallery' };
const and = (...of) => ({ op: 'and', of });
const not = of => ({ op: 'not', of });
const say = textId => ({ op: 'narrate', textId });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const light = { op: 'or', of: [
  { op: 'item', item: 'item_lantern', min: 1 },
  { op: 'trait', trait: 'night_vision' }
] };
const foeAlive = id => ({ op: 'alive', subject: id });
const foesDown = and(not(foeAlive('npc_gallery_brute')), not(foeAlive('npc_gallery_scout')));
const gallery = and(at, { op: 'flag', key: 'ruins_watch_gallery_open' }, light);
const npc = (name, hp, dex) => ({ name, actor: {
  locationId: 'loc_ruins_gallery', hp: { max: hp },
  growth: { growth_wanderer: { stats: { str: 10, dex, con: 10, int: 8, wis: 8, per: 10 },
    resources: { stamina: { current: 5, max: 5 } } } }
} });

function encounter({ key, foe, name, stance0, stance1, correct0, correct1, damage0, damage1 }) {
  const tell = `gallery_${key}_stance`;
  const known = { op: 'unlock', id: `unl_gallery_${key}_read` };
  const alive = foeAlive(foe);
  const stance = { op: 'signal', key: tell, eq: 0 };
  const ready = and(gallery, alive, known, sword, { op: 'skill', skill: 'swordsmanship', min: 1 });
  const read = { op: 'if', when: stance, then: [say(stance0)], else: [say(stance1)] };
  const rotate = { op: 'if', when: stance,
    then: [{ op: 'signal', key: tell, add: 1 }, say(stance1)],
    else: [{ op: 'signal', key: tell, add: -1 }, say(stance0)] };
  const award = { op: 'if', when: not(alive), then: [
    { op: 'flag', key: `gallery_${key}_defeated`, value: true },
    { op: 'money', add: 2 }, { op: 'proficiency', id: 'combat', add: 8 },
    say(`txt_gallery_${key}_defeated`),
    { op: 'if', when: and(foesDown, not({ op: 'flag', key: 'ruins_gallery_secured' })), then: [
      { op: 'flag', key: 'ruins_gallery_secured', value: true },
      { op: 'relation', from: 'org_village', add: 2 }, say('txt_gallery_secured')
    ] }
  ] };
  const move = (response, expected, damage, cost) => {
    const correct = { op: 'signal', key: tell, eq: expected };
    const strike = (amount, injury = 0) => [
      { op: 'hp', subject: foe, add: -amount },
      ...(injury ? [{ op: 'hp', add: -injury }] : []),
      say(`txt_gallery_${key}_${response}_hit`), award
    ];
    const mistake = [{ op: 'hp', add: -2 }, say(`txt_gallery_${key}_wrong`) ];
    const outcome = tier => [
      { op: 'resource', resource: 'stamina', add: -cost },
      { op: 'if', when: correct,
        then: tier === 'great' ? strike(damage + 1)
          : tier === 'success' ? strike(damage)
          : tier === 'partial' ? strike(2, 1)
          : [{ op: 'hp', add: -3 }, say(`txt_gallery_${key}_miss`)],
        else: mistake },
      { op: 'if', when: alive, then: [rotate] }
    ];
    return {
      name: `${name}: ${response === 'first' ? correct0 : correct1} (기력 ${cost}, 10분)`,
      requires: and(ready, stamina(cost)),
      check: { stat: response === 'first' ? 'str' : 'dex', skill: 'swordsmanship',
        tags: ['combat'], difficulty: 'normal' },
      minutes: 10,
      outcomes: { great: outcome('great'), success: outcome('success'),
        partial: outcome('partial'), fail: outcome('fail') }
    };
  };
  return {
    [`act_gallery_${key}_read`]: {
      name: `${name}의 움직임을 가까이서 살핀다 (5분)`,
      requires: and(gallery, alive, not(known)), minutes: 5,
      effects: [{ op: 'unlock', id: `unl_gallery_${key}_read` }, read]
    },
    [`act_gallery_${key}_observe`]: {
      name: `${name}의 다음 공격 자세를 다시 확인한다 (5분)`,
      requires: and(gallery, alive, known), minutes: 5, effects: [read]
    },
    [`act_gallery_${key}_first`]: move('first', 0, damage0, 1),
    [`act_gallery_${key}_second`]: move('second', 1, damage1, 2)
  };
}

export const ruinsGalleryFoes = {
  npcs: {
    npc_gallery_brute: npc('회랑의 쇠몽둥이 약탈자', 8, 8),
    npc_gallery_scout: npc('회랑의 단검 척후병', 8, 14)
  },
  actions: {
    ...encounter({ key: 'brute', foe: 'npc_gallery_brute', name: '쇠몽둥이 약탈자',
      stance0: 'txt_gallery_brute_overhead', stance1: 'txt_gallery_brute_sweep',
      correct0: '내려치기를 받아친다', correct1: '횡베기를 옆으로 피한다', damage0: 4, damage1: 3 }),
    ...encounter({ key: 'scout', foe: 'npc_gallery_scout', name: '단검 척후병',
      stance0: 'txt_gallery_scout_feint', stance1: 'txt_gallery_scout_lunge',
      correct0: '허초를 기다렸다 반격한다', correct1: '돌진을 역으로 끊는다', damage0: 3, damage1: 4 })
  },
  texts: {
    txt_gallery_brute_overhead: '쇠몽둥이 약탈자가 양손을 높이 든다. 내려치기가 예고된다.',
    txt_gallery_brute_sweep: '쇠몽둥이가 허리 높이로 내려온다. 다음 공격은 넓은 횡베기다.',
    txt_gallery_scout_feint: '단검 척후병이 어깨를 흔들며 빈틈을 노린다. 허초가 먼저 온다.',
    txt_gallery_scout_lunge: '단검 척후병이 몸을 낮춰 거리를 좁힌다. 다음 공격은 빠른 돌진이다.',
    txt_gallery_brute_first_hit: '내려치는 몽둥이를 비껴 막고 상대의 옆구리를 베었다.',
    txt_gallery_brute_second_hit: '옆으로 굴러 몽둥이를 피한 뒤 빈틈을 찔렀다.',
    txt_gallery_scout_first_hit: '허초에 속지 않고 단검이 멈춘 순간 반격했다.',
    txt_gallery_scout_second_hit: '돌진하는 손목을 끊고 반격했다.',
    txt_gallery_brute_wrong: '예고된 몽둥이의 방향을 잘못 읽어 강한 타격을 받았다.',
    txt_gallery_scout_wrong: '단검의 속임수에 걸려 상처를 입었다.',
    txt_gallery_brute_miss: '공격의 박자를 놓쳐 몽둥이에 맞았다.',
    txt_gallery_scout_miss: '단검의 빠른 반격에 상처를 입었다.',
    txt_gallery_brute_defeated: '쇠몽둥이 약탈자를 쓰러뜨리고 빼앗긴 은화 2를 회수했다.',
    txt_gallery_scout_defeated: '단검 척후병을 쓰러뜨리고 빼앗긴 은화 2를 회수했다.',
    txt_gallery_secured: '회랑의 마지막 적을 제압했다. 주민들이 안전한 길을 다시 이용할 수 있게 되었다.'
  }
};
