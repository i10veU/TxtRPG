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
const say = (textId) => ({ op: 'narrate', textId });

export const ruinsExpedition = {
  locations: {
    loc_ruins_cellar: {
      name: '폐허 아래 매몰 창고',
      links: [
        { to: 'loc_ruins', minutes: 20 },
        // A public refuge survives its founder; no successor inherits the private map.
        { to: 'loc_village', minutes: 20, requires: flag('ruins_cellar_refuge') }
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
    txt_ruins_cellar_rest: '피난처의 마른 바닥에서 몸을 추스른다. 마을 사람들이 남겨 둔 물과 불씨가 있다.'
  }
};
