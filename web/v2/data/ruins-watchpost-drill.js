// Optional repeatable sparring at the already-restored watchpost. All guard
// pressure is a visible practice counter, not a new hidden actor or faction.
// Two completed bouts exhaust the daily rota; a timed world event resets it.
const at = { op: 'location', at: 'loc_ruins_watchpost' };
const flag = key => ({ op: 'flag', key });
const signal = (key, bounds = {}) => ({ op: 'signal', key, ...bounds });
const and = (...of) => ({ op: 'and', of });
const stamina = min => ({ op: 'resource', resource: 'stamina', min });
const sword = { op: 'or', of: [
  { op: 'item', item: 'item_iron_sword', equipped: true },
  { op: 'item', item: 'item_steel_sword', equipped: true }
] };
const active = signal('watch_drill_active', { min: 1 });
const pressure = bounds => signal('watch_drill_guard', bounds);
const say = textId => ({ op: 'narrate', textId });
const spend = n => ({ op: 'resource', resource: 'stamina', add: -n });
const drill = (cost, great, success, partial, fail) => ({
  great: [spend(cost), ...great],
  success: [spend(cost), ...success],
  partial: [spend(cost), ...partial],
  fail: [spend(cost), ...fail]
});
const hit = (n, textId) => [{ op: 'signal', key: 'watch_drill_guard', add: -n }, say(textId)];
const hurt = (n, textId) => [{ op: 'hp', add: -n }, say(textId)];
const ready = and(at, flag('ruins_watchpost_restored'), sword,
  { op: 'skill', skill: 'swordsmanship', min: 1 });
export const ruinsWatchpostDrill = {
  events: {
    // First tick arms the 24-hour rest on the second completed bout. The
    // next tick clears the rota. restartWhen avoids carrying old cooldown
    // across subsequent training days; no immediate reward reset is possible.
    evt_watch_drill_rota: {
      trigger: signal('watch_drill_wins', { min: 2 }),
      restartWhen: and(signal('watch_drill_wins', { min: 2 }),
        signal('watch_drill_resting', { max: 0 })),
      cooldown: 1440,
      effects: [{ op: 'if', when: signal('watch_drill_resting', { max: 0 }),
        then: [{ op: 'signal', key: 'watch_drill_resting', add: 1 }],
        else: [{ op: 'signal', key: 'watch_drill_wins', add: -2 },
          { op: 'signal', key: 'watch_drill_resting', add: -1 }] }]
    }
  },
  actions: {
    act_watch_drill_begin: {
      name: '초소의 모의 검술 대련을 시작한다 (기력 1, 15분)',
      requires: and(ready, stamina(2), signal('watch_drill_wins', { max: 1 }),
        signal('watch_drill_active', { max: 0 })),
      minutes: 15,
      effects: [spend(1), { op: 'signal', key: 'watch_drill_active', add: 1 },
        { op: 'signal', key: 'watch_drill_guard', add: 3 }, say('txt_watch_drill_begin')]
    },
    act_watch_drill_press: {
      name: '정면 압박으로 대련 상대의 자세를 무너뜨린다 (기력 1, 10분)',
      requires: and(ready, active, pressure({ min: 1 }), stamina(1)),
      check: { stat: 'str', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 10,
      outcomes: drill(1, hit(3, 'txt_watch_drill_press'), hit(2, 'txt_watch_drill_press'),
        [...hit(1, 'txt_watch_drill_graze'), { op: 'hp', add: -1 }],
        hurt(2, 'txt_watch_drill_miss'))
    },
    act_watch_drill_tempo: {
      name: '호흡 끊기로 대련 상대의 기세를 빼앗는다 (기력 2, 10분)',
      requires: and(ready, active, pressure({ min: 2 }), stamina(2),
        { op: 'unlock', id: 'unl_tempo_break' }),
      check: { stat: 'dex', skill: 'swordsmanship', tags: ['combat'], difficulty: 'normal' },
      minutes: 10,
      outcomes: drill(2, hit(3, 'txt_watch_drill_tempo'), hit(3, 'txt_watch_drill_tempo'),
        [...hit(1, 'txt_watch_drill_graze'), { op: 'hp', add: -1 }],
        hurt(3, 'txt_watch_drill_miss'))
    },
    act_watch_drill_finish: {
      name: '무너진 자세를 제압해 대련을 끝낸다 (기력 1, 10분)',
      requires: and(ready, active, pressure({ max: 0 }), stamina(1)),
      minutes: 10,
      effects: [spend(1), { op: 'signal', key: 'watch_drill_active', add: -1 },
        { op: 'signal', key: 'watch_drill_wins', add: 1 },
        { op: 'proficiency', id: 'combat', add: 12 },
        { op: 'if', when: { op: 'unlock', id: 'unl_watchpost_first_bout' },
          then: [{ op: 'unlock', id: 'unl_watchpost_second_wind' },
            say('txt_watch_drill_mastered')],
          else: [{ op: 'unlock', id: 'unl_watchpost_first_bout' },
            say('txt_watch_drill_won')] }]
    },
    act_watch_drill_yield: {
      name: '대련을 중단하고 상대와 거리를 둔다 (5분)',
      requires: and(at, active),
      minutes: 5,
      effects: [{ op: 'signal', key: 'watch_drill_active', add: -1 },
        { op: 'signal', key: 'watch_drill_guard', add: -3 }, say('txt_watch_drill_yield')]
    }
  },
  texts: {
    txt_watch_drill_begin: '초소의 경계병이 목검을 든다. 세 번의 균형을 무너뜨려야 대련을 끝낼 수 있다.',
    txt_watch_drill_press: '발을 디디며 상대의 중심을 밀어냈다. 방어 자세가 흔들린다.',
    txt_watch_drill_tempo: '칼등을 세워 상대의 호흡을 끊었다. 상대가 힘을 모으지 못한다.',
    txt_watch_drill_graze: '한순간 중심을 흔들었지만 목검 끝이 어깨를 스쳤다.',
    txt_watch_drill_miss: '거리를 잘못 재고 빈틈을 내줬다. 대련의 타격도 가볍지 않다.',
    txt_watch_drill_won: '상대가 목검을 내렸다. 초소의 훈련 기록에 한 차례 승리가 남았다.',
    txt_watch_drill_mastered: '두 번의 대련을 마쳤다. 숨을 고르며 전열을 재정비하는 기세 전환을 익혔다. 다음 훈련은 하루 뒤다.',
    txt_watch_drill_yield: '목검을 내려놓고 대련을 중단했다. 승리 기록이나 숙련 보상은 없다.'
  }
};
