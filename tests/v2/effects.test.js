// V2-Core-03 tests for the Effect applier
// (docs/v2/architecture/CORE_CONTRACTS.md §4, D-26~D-40).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEffects, check } from "../../web/v2/core/rules.js";
import { hashString, rollDie } from "../../web/v2/core/rng.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function deepFreeze(value) {
  if (value === null || typeof value !== "object") return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseState(overrides) {
  return {
    schemaVersion: 1,
    worldSeed: "effects-test",
    rng: { seed: 12345, cursor: 0 },
    time: { minute: 0 },
    ...overrides
  };
}

function ctxWith(state) {
  return { state, data: {}, actorId: "player_1", targetId: "npc_1" };
}

function ctxWithData(state, data) {
  return { state, data, actorId: "player_1", targetId: "npc_1" };
}

// -- V2-Core-04 fixtures: subject-based Effects (stat/hp/money/item/relation) --

function actorFixture(overrides) {
  return {
    id: "player_1",
    hp: { current: 10, max: 20 },
    money: 5,
    inventory: {},
    growth: {},
    ...overrides
  };
}

function stateWithActors(actors, overrides) {
  return baseState({ player: { actorId: "player_1" }, actors, ...overrides });
}

// Abstract growth-system fixture (not world content, §17 of DEVELOPMENT_RULES).
function growthDataFixture() {
  return {
    world: { growthSystemId: "growth_a" },
    growthSystems: {
      growth_a: {
        stats: [{ id: "stat_a", min: 0, max: 10 }],
        skills: [{ id: "skill_a", maxRank: 3 }],
        traits: [{ id: "trait_a", exclusive: ["trait_b"] }, { id: "trait_b" }]
      }
    }
  };
}

// 1-3: flag
function testFlag() {
  // 1. flag 생성 (lazy state.flags)
  const r1 = applyEffects([{ op: "flag", key: "gate_open", value: true }], ctxWith(baseState()));
  assert.strictEqual(r1.state.flags.gate_open, true);
  assert.strictEqual(r1.events.length, 1);
  assert.strictEqual(r1.events[0].type, "flag.changed");
  assert.strictEqual(r1.events[0].visibility, "internal");
  assert.deepStrictEqual(r1.events[0].data, { key: "gate_open", value: true });

  // 2. flag 변경
  const r2 = applyEffects(
    [{ op: "flag", key: "gate_open", value: false }],
    ctxWith(baseState({ flags: { gate_open: true } }))
  );
  assert.strictEqual(r2.state.flags.gate_open, false);
  assert.strictEqual(r2.events.length, 1);

  // 3. flag 동일값 -> no-op, no event
  const r3 = applyEffects(
    [{ op: "flag", key: "gate_open", value: true }],
    ctxWith(baseState({ flags: { gate_open: true } }))
  );
  assert.strictEqual(r3.state.flags.gate_open, true);
  assert.strictEqual(r3.events.length, 0);
}

// 4-9: signal
function testSignal() {
  // 4. signal 생성 (lazy state.signals)
  const r4 = applyEffects([{ op: "signal", key: "alarm", add: 3 }], ctxWith(baseState()));
  assert.strictEqual(r4.state.signals.alarm, 3);
  assert.strictEqual(r4.events.length, 1);
  assert.strictEqual(r4.events[0].type, "signal.raised");
  assert.strictEqual(r4.events[0].visibility, "internal");
  assert.deepStrictEqual(r4.events[0].data, { key: "alarm", delta: 3 });

  // 5. signal 증가
  const r5 = applyEffects(
    [{ op: "signal", key: "alarm", add: 2 }],
    ctxWith(baseState({ signals: { alarm: 3 } }))
  );
  assert.strictEqual(r5.state.signals.alarm, 5);
  assert.deepStrictEqual(r5.events[0].data, { key: "alarm", delta: 2 });

  // 6. signal 감소
  const r6 = applyEffects(
    [{ op: "signal", key: "alarm", add: -2 }],
    ctxWith(baseState({ signals: { alarm: 5 } }))
  );
  assert.strictEqual(r6.state.signals.alarm, 3);
  assert.deepStrictEqual(r6.events[0].data, { key: "alarm", delta: -2 });

  // 7. signal 하한 clamp (2 + (-5) -> clamp to 0)
  const r7 = applyEffects(
    [{ op: "signal", key: "alarm", add: -5 }],
    ctxWith(baseState({ signals: { alarm: 2 } }))
  );
  assert.strictEqual(r7.state.signals.alarm, 0);

  // 8. signal delta는 요청값이 아니라 실제(clamp 후) 변화량이어야 한다
  assert.deepStrictEqual(r7.events[0].data, { key: "alarm", delta: -2 }, "delta must be the actual post-clamp change (2 -> 0), not the requested -5");

  // 9. signal이 이미 하한이면 no-op, no event
  const r9 = applyEffects(
    [{ op: "signal", key: "alarm", add: -5 }],
    ctxWith(baseState({ signals: { alarm: 0 } }))
  );
  assert.strictEqual(r9.state.signals.alarm, 0);
  assert.strictEqual(r9.events.length, 0);
}

// 10-11: time
function testTime() {
  // 10. time 증가
  const r10 = applyEffects([{ op: "time", minutes: 30 }], ctxWith(baseState()));
  assert.strictEqual(r10.state.time.minute, 30);
  assert.strictEqual(r10.events.length, 1);
  assert.strictEqual(r10.events[0].type, "time.advanced");
  assert.strictEqual(r10.events[0].visibility, "player");
  assert.deepStrictEqual(r10.events[0].data, { minutes: 30 });
  assert.strictEqual(r10.events[0].minute, 30, "event minute must be the post-advance time");

  // 11. time 0 -> no-op, no event
  const r11 = applyEffects([{ op: "time", minutes: 0 }], ctxWith(baseState({ time: { minute: 10 } })));
  assert.strictEqual(r11.state.time.minute, 10);
  assert.strictEqual(r11.events.length, 0);
}

// 12-15: if
function testIf() {
  // 12. if true -> then
  const r12 = applyEffects(
    [{ op: "if", when: { op: "always" }, then: [{ op: "flag", key: "a", value: true }], else: [{ op: "flag", key: "b", value: true }] }],
    ctxWith(baseState())
  );
  assert.deepStrictEqual(r12.state.flags, { a: true });

  // 13. if false -> else
  const r13 = applyEffects(
    [{ op: "if", when: { op: "never" }, then: [{ op: "flag", key: "a", value: true }], else: [{ op: "flag", key: "b", value: true }] }],
    ctxWith(baseState())
  );
  assert.deepStrictEqual(r13.state.flags, { b: true });

  // 14. if false, else 생략 -> 아무 것도 하지 않음, throw 없음
  const r14 = applyEffects(
    [{ op: "if", when: { op: "never" }, then: [{ op: "flag", key: "a", value: true }] }],
    ctxWith(baseState())
  );
  assert.strictEqual(r14.state.flags, undefined);
  assert.strictEqual(r14.events.length, 0);

  // 15. nested if
  const r15 = applyEffects(
    [
      {
        op: "if",
        when: { op: "always" },
        then: [
          {
            op: "if",
            when: { op: "always" },
            then: [{ op: "signal", key: "depth", add: 1 }],
            else: [{ op: "signal", key: "depth", add: 100 }]
          }
        ]
      }
    ],
    ctxWith(baseState())
  );
  assert.strictEqual(r15.state.signals.depth, 1);
}

// 16: sequential visibility (an Effect sees the previous Effect's change,
// including through `if`'s Condition evaluator seeing mid-list state)
function testSequentialVisibility() {
  const result = applyEffects(
    [
      { op: "signal", key: "a", add: 1 },
      {
        op: "if",
        when: { op: "gte", left: { signal: "a" }, right: 1 },
        then: [{ op: "signal", key: "a", add: 10 }],
        else: [{ op: "flag", key: "unreachable", value: true }]
      }
    ],
    ctxWith(baseState())
  );
  assert.strictEqual(result.state.signals.a, 11, "Effect B must observe Effect A's change");
  assert.strictEqual(result.state.flags, undefined, "the else branch must not have run");
}

// 17-19: immutability of state / effects / ctx
function testImmutability() {
  const state = deepFreeze(baseState({ signals: { a: 2 }, flags: { gate_open: false } }));
  const stateBefore = snapshot(state);

  const effects = deepFreeze([
    { op: "signal", key: "a", add: 3 },
    { op: "flag", key: "gate_open", value: true },
    { op: "if", when: { op: "always" }, then: [{ op: "time", minutes: 5 }], else: [] }
  ]);
  const effectsBefore = snapshot(effects);

  const ctx = deepFreeze(ctxWith(state));

  const result = applyEffects(effects, ctx);

  // 17. input state unchanged
  assert.deepStrictEqual(snapshot(state), stateBefore, "applyEffects must not mutate ctx.state");
  // 18. input effects array/objects unchanged
  assert.deepStrictEqual(snapshot(effects), effectsBefore, "applyEffects must not mutate the effects array");
  // 19. ctx itself unchanged, and result.state is a different object
  assert.strictEqual(ctx.state, state, "ctx.state reference must be untouched");
  assert.notStrictEqual(result.state, ctx.state, "result.state must not be the same reference as ctx.state");

  // sanity: the effects actually applied to the (separate) result
  assert.strictEqual(result.state.signals.a, 5);
  assert.strictEqual(result.state.flags.gate_open, true);
  assert.strictEqual(result.state.time.minute, 5);
}

// 20: determinism
function testDeterminism() {
  const effects = [
    { op: "signal", key: "a", add: 3 },
    { op: "if", when: { op: "gt", left: { signal: "a" }, right: 2 }, then: [{ op: "time", minutes: 15 }], else: [] },
    { op: "flag", key: "seen", value: true }
  ];
  const run = () => applyEffects(effects, ctxWith(baseState()));

  const first = run();
  const second = run();
  assert.deepStrictEqual(second, first, "the same (effects, ctx) must always produce the same result");
}

// 21: JSON round-trip safety
function testJsonRoundTrip() {
  const result = applyEffects(
    [
      { op: "signal", key: "a", add: 4 },
      { op: "flag", key: "b", value: true },
      { op: "time", minutes: 10 }
    ],
    ctxWith(baseState())
  );
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.state)), result.state, "result state must be JSON round-trip safe");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.events)), result.events, "events must be JSON round-trip safe");
}

// 22, 24, 25: malformed Effect -> throw (D-28)
function testMalformedEffectThrows() {
  const ctx = ctxWith(baseState());

  // 22. Effect가 plain object가 아님 / 필수 필드 없음 / 타입 오류
  [null, undefined, "flag", 42, [], {}, { op: "flag" }, { op: "flag", key: "a" }, { op: "flag", key: 1, value: true }, { op: "flag", key: "a", value: "true" }].forEach(
    (bad) => {
      assert.throws(() => applyEffects([bad], ctx), TypeError, "malformed flag Effect must throw: " + JSON.stringify(bad));
    }
  );

  // 24. unknown Effect op -> throw
  assert.throws(() => applyEffects([{ op: "does_not_exist" }], ctx), TypeError);

  // 25. invalid numeric argument -> throw (signal.add)
  [1.5, NaN, Infinity, -Infinity, "3", null, undefined].forEach((bad) => {
    assert.throws(
      () => applyEffects([{ op: "signal", key: "a", add: bad }], ctx),
      TypeError,
      "signal Effect must throw for invalid `add`: " + String(bad)
    );
  });

  // time: non-integer / negative must throw
  [1.5, NaN, Infinity, -Infinity, "3", null, undefined, -1].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "time", minutes: bad }], ctx), TypeError, "time Effect must throw for invalid `minutes`: " + String(bad));
  });

  // if: `then` missing or not an array, `else` present but not an array
  assert.throws(() => applyEffects([{ op: "if", when: { op: "always" } }], ctx), TypeError, "if without `then` must throw");
  assert.throws(() => applyEffects([{ op: "if", when: { op: "always" }, then: {} }], ctx), TypeError, "if with non-array `then` must throw");
  assert.throws(
    () => applyEffects([{ op: "if", when: { op: "always" }, then: [], else: {} }], ctx),
    TypeError,
    "if with non-array `else` must throw"
  );

  // top-level effects list itself must be an array
  assert.throws(() => applyEffects({ op: "flag", key: "a", value: true }, ctx), TypeError);
  assert.throws(() => applyEffects(null, ctx), TypeError);
}

// 23: malformed Condition inside if.when -> false branch, no throw (D-28 exception)
function testMalformedConditionInIfIsFalseBranch() {
  const ctx = ctxWith(baseState());
  const malformedWhens = [null, undefined, "always", 42, [], {}, { op: "does_not_exist" }];

  malformedWhens.forEach((when) => {
    let result;
    assert.doesNotThrow(() => {
      result = applyEffects(
        [{ op: "if", when, then: [{ op: "flag", key: "then_ran", value: true }], else: [{ op: "flag", key: "else_ran", value: true }] }],
        ctx
      );
    }, "a malformed `when` must not throw the whole Effect list: " + JSON.stringify(when));
    assert.deepStrictEqual(result.state.flags, { else_ran: true }, "a malformed `when` must be treated as false, taking the else branch");
  });
}

// 26-27: lazy initialization
function testLazyInitialization() {
  const stateWithoutFlags = baseState();
  assert.strictEqual(stateWithoutFlags.flags, undefined);
  const r26 = applyEffects([{ op: "flag", key: "a", value: true }], ctxWith(stateWithoutFlags));
  assert.deepStrictEqual(r26.state.flags, { a: true });
  // nothing else was lazily created
  assert.strictEqual(r26.state.signals, undefined);
  assert.strictEqual(r26.state.actors, undefined);

  const stateWithoutSignals = baseState();
  assert.strictEqual(stateWithoutSignals.signals, undefined);
  const r27 = applyEffects([{ op: "signal", key: "a", add: 1 }], ctxWith(stateWithoutSignals));
  assert.deepStrictEqual(r27.state.signals, { a: 1 });
  assert.strictEqual(r27.state.flags, undefined);
  assert.strictEqual(r27.state.actors, undefined);
}

// 28: static scan for forbidden host APIs
function testNoForbiddenHostApis() {
  const forbiddenPatterns = [
    /\bMath\.random\s*\(/,
    /\bDate\s*\(/,
    /\bDate\.now\s*\(/,
    /\bwindow\b/,
    /\bdocument\b/,
    /\bindexedDB\b/,
    /\blocalStorage\b/,
    /\bfetch\s*\(/,
    /\bperformance\b/,
    /\bcrypto\b/,
    /\bsetTimeout\s*\(/
  ];

  function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  const code = stripComments(fs.readFileSync(path.join(repoRoot, "web/v2/core/rules.js"), "utf8"));
  forbiddenPatterns.forEach((pattern) => {
    assert.ok(!pattern.test(code), "rules.js must not use forbidden host API matching " + pattern);
  });
}

// 29: no `seq` field on any event
function testNoSeqOnEvents() {
  const result = applyEffects(
    [
      { op: "signal", key: "a", add: 1 },
      { op: "flag", key: "b", value: true },
      { op: "time", minutes: 5 }
    ],
    ctxWith(baseState())
  );
  assert.ok(result.events.length > 0);
  result.events.forEach((event) => {
    assert.strictEqual(event.seq, undefined, "events must never carry a seq field (§2.4)");
    assert.deepStrictEqual(Object.keys(event).sort(), ["data", "minute", "type", "visibility"]);
  });
}

// 30: delta=0 Effects never produce an event (combined check across all 3 stateful ops)
function testZeroDeltaNeverEmitsEvent() {
  const result = applyEffects(
    [
      { op: "signal", key: "y", add: 0 },
      { op: "time", minutes: 0 },
      { op: "flag", key: "z", value: true } // already true -> unchanged
    ],
    ctxWith(baseState({ signals: { y: 0 }, flags: { z: true } }))
  );
  assert.strictEqual(result.events.length, 0, "signal add:0, time minutes:0, and an unchanged flag must produce zero events");
}

// ============================================================
// V2-Core-04: subject resolution + stat/hp/money/item/relation
// ============================================================

// 1-6: subject resolution (self, target, explicit ID, default, skip cases)
function testSubjectResolution() {
  // 1. self (explicit)
  const r1 = applyEffects([{ op: "money", add: 10, subject: "self" }], ctxWith(stateWithActors({ player_1: actorFixture({ money: 5 }) })));
  assert.strictEqual(r1.state.actors.player_1.money, 15);

  // 2. target
  const s2 = stateWithActors({ player_1: actorFixture({ money: 5 }), npc_1: actorFixture({ id: "npc_1", money: 0 }) });
  const r2 = applyEffects([{ op: "money", add: 7, subject: "target" }], ctxWith(s2));
  assert.strictEqual(r2.state.actors.npc_1.money, 7);
  assert.strictEqual(r2.state.actors.player_1.money, 5, "self must be untouched when subject is target");

  // 3. explicit actor ID
  const s3 = stateWithActors({ player_1: actorFixture(), npc_2: actorFixture({ id: "npc_2", money: 0 }) });
  const r3 = applyEffects([{ op: "money", add: 3, subject: "npc_2" }], ctxWith(s3));
  assert.strictEqual(r3.state.actors.npc_2.money, 3);

  // 4. 기본 subject (omitted -> self)
  const r4 = applyEffects([{ op: "money", add: 1 }], ctxWith(stateWithActors({ player_1: actorFixture({ money: 5 }) })));
  assert.strictEqual(r4.state.actors.player_1.money, 6);

  // 5. missing target -> skip (no ctx.targetId at all)
  const s5 = stateWithActors({ player_1: actorFixture() });
  const ctx5 = { state: s5, data: {}, actorId: "player_1" };
  const r5 = applyEffects([{ op: "money", add: 5, subject: "target" }], ctx5);
  assert.deepStrictEqual(r5.state, s5, "missing target must leave state unchanged");
  assert.strictEqual(r5.events.length, 0);

  // 6. missing explicit actor -> skip
  const s6 = stateWithActors({ player_1: actorFixture() });
  const r6 = applyEffects([{ op: "money", add: 5, subject: "does_not_exist" }], ctxWith(s6));
  assert.deepStrictEqual(r6.state, s6, "missing explicit actor must leave state unchanged");
  assert.strictEqual(r6.events.length, 0);
}

// 7-11: stat
function testStat() {
  const data = growthDataFixture();
  function stateWithStat(value) {
    return stateWithActors({ player_1: actorFixture({ growth: { growth_a: { stats: { stat_a: value } } } }) });
  }

  const r7 = applyEffects([{ op: "stat", stat: "stat_a", add: 3 }], ctxWithData(stateWithStat(5), data));
  assert.strictEqual(r7.state.actors.player_1.growth.growth_a.stats.stat_a, 8);
  assert.deepStrictEqual(r7.events[0].data, { stat: "stat_a", delta: 3 });

  const r8 = applyEffects([{ op: "stat", stat: "stat_a", add: -2 }], ctxWithData(stateWithStat(5), data));
  assert.strictEqual(r8.state.actors.player_1.growth.growth_a.stats.stat_a, 3);

  const r9 = applyEffects([{ op: "stat", stat: "stat_a", add: -10 }], ctxWithData(stateWithStat(5), data));
  assert.strictEqual(r9.state.actors.player_1.growth.growth_a.stats.stat_a, 0, "min clamp");
  assert.deepStrictEqual(r9.events[0].data, { stat: "stat_a", delta: -5 });

  const r10 = applyEffects([{ op: "stat", stat: "stat_a", add: 100 }], ctxWithData(stateWithStat(5), data));
  assert.strictEqual(r10.state.actors.player_1.growth.growth_a.stats.stat_a, 10, "max clamp");
  assert.deepStrictEqual(r10.events[0].data, { stat: "stat_a", delta: 5 });

  const r11 = applyEffects([{ op: "stat", stat: "stat_a", add: 0 }], ctxWithData(stateWithStat(5), data));
  assert.strictEqual(r11.events.length, 0, "add 0 -> no event");
  assert.strictEqual(r11.state.actors.player_1.growth.growth_a.stats.stat_a, 5);
}

// 12-16: hp
function testHp() {
  function stateWithHp(current, max) {
    return stateWithActors({ player_1: actorFixture({ hp: { current, max } }) });
  }

  const r12 = applyEffects([{ op: "hp", add: -3 }], ctxWith(stateWithHp(10, 20)));
  assert.strictEqual(r12.state.actors.player_1.hp.current, 7, "damage");

  const r13 = applyEffects([{ op: "hp", add: 5 }], ctxWith(stateWithHp(10, 20)));
  assert.strictEqual(r13.state.actors.player_1.hp.current, 15, "heal");

  const r14 = applyEffects([{ op: "hp", add: -100 }], ctxWith(stateWithHp(10, 20)));
  assert.strictEqual(r14.state.actors.player_1.hp.current, 0, "0 clamp");
  assert.deepStrictEqual(r14.events[0].data, { delta: -10 });

  const r15 = applyEffects([{ op: "hp", add: 100 }], ctxWith(stateWithHp(19, 20)));
  assert.strictEqual(r15.state.actors.player_1.hp.current, 20, "max clamp");
  assert.deepStrictEqual(r15.events[0].data, { delta: 1 });

  const r16 = applyEffects([{ op: "hp", add: -10 }], ctxWith(stateWithHp(10, 10)));
  assert.strictEqual(r16.state.actors.player_1.hp.current, 0, "hp 0 상태는 저장된다");
  assert.strictEqual(r16.state.actors.player_1.alive, false, "§9 death trigger fires on the alive->dead transition (D-34, V2-Core-10)");
  assert.ok(r16.events.some((e) => e.type === "actor.died"), "actor.died fires when current reaches 0");
}

// 17-20: money
function testMoneyEffect() {
  function stateWithMoney(money) {
    return stateWithActors({ player_1: actorFixture({ money }) });
  }
  assert.strictEqual(applyEffects([{ op: "money", add: 20 }], ctxWith(stateWithMoney(5))).state.actors.player_1.money, 25);
  assert.strictEqual(applyEffects([{ op: "money", add: -3 }], ctxWith(stateWithMoney(5))).state.actors.player_1.money, 2);
  assert.strictEqual(applyEffects([{ op: "money", add: -100 }], ctxWith(stateWithMoney(5))).state.actors.player_1.money, 0, "0 clamp");
  assert.strictEqual(
    applyEffects([{ op: "money", add: 10 }], ctxWith(stateWithMoney(Number.MAX_SAFE_INTEGER - 5))).state.actors.player_1.money,
    Number.MAX_SAFE_INTEGER,
    "MAX_SAFE_INTEGER clamp"
  );
}

// 21-24: item
function testItemEffect() {
  function stateWithInventory(inventory) {
    return stateWithActors({ player_1: actorFixture({ inventory }) });
  }
  assert.strictEqual(applyEffects([{ op: "item", item: "potion", add: 2 }], ctxWith(stateWithInventory({ potion: 3 }))).state.actors.player_1.inventory.potion, 5);
  assert.strictEqual(applyEffects([{ op: "item", item: "potion", add: -1 }], ctxWith(stateWithInventory({ potion: 3 }))).state.actors.player_1.inventory.potion, 2);

  const r23 = applyEffects([{ op: "item", item: "potion", add: -5 }], ctxWith(stateWithInventory({ potion: 3 })));
  assert.strictEqual(r23.state.actors.player_1.inventory.potion, undefined, "0 clamp");
  assert.deepStrictEqual(r23.state.actors.player_1.inventory, {}, "key is deleted at 0 (existing contract)");

  const r24 = applyEffects([{ op: "item", item: "potion", add: 1 }], ctxWith(stateWithInventory({})));
  assert.strictEqual(r24.state.actors.player_1.inventory.potion, 1, "lazy item creation");
}

// 25-29: relation
function testRelationEffect() {
  const s25 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) });
  const r25 = applyEffects([{ op: "relation", add: 10 }], ctxWith(s25));
  assert.ok(r25.state.relations["npc_1:player_1"], "default from=target,to=self -> npc_1:player_1");
  assert.strictEqual(r25.state.relations["player_1:npc_1"], undefined, "directed: the reverse edge is not created");

  const existingEdge = { score: 20, mode: "neutral", lastDay: -1, cooperationCount: 0, conflictCount: 0, tags: [] };
  const s26 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) }, { relations: { "npc_1:player_1": existingEdge } });
  assert.strictEqual(applyEffects([{ op: "relation", add: 5 }], ctxWith(s26)).state.relations["npc_1:player_1"].score, 25);
  assert.strictEqual(applyEffects([{ op: "relation", add: -1000 }], ctxWith(s26)).state.relations["npc_1:player_1"].score, -100, "-100 clamp");
  assert.strictEqual(applyEffects([{ op: "relation", add: 1000 }], ctxWith(s26)).state.relations["npc_1:player_1"].score, 100, "100 clamp");

  const s29 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }), npc_2: actorFixture({ id: "npc_2" }) });
  const r29 = applyEffects([{ op: "relation", from: "npc_2", to: "npc_1", add: 5 }], ctxWith(s29));
  assert.ok(r29.state.relations["npc_2:npc_1"], "explicit from/to actor IDs");
}

// 30-31: visibility
function testSubjectVisibility() {
  const state = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) });
  assert.strictEqual(applyEffects([{ op: "money", add: 1, subject: "self" }], ctxWith(state)).events[0].visibility, "player");
  assert.strictEqual(applyEffects([{ op: "money", add: 1, subject: "target" }], ctxWith(state)).events[0].visibility, "internal");
}

// 32-35: numeric/subject validation -> throw
function testSubjectEffectValidation() {
  const state = stateWithActors({ player_1: actorFixture() });
  const ctx = ctxWith(state);
  const data = growthDataFixture();

  [1.5, NaN, Infinity, -Infinity, "3", null, undefined].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "hp", add: bad }], ctx), TypeError, "hp add=" + String(bad));
    assert.throws(() => applyEffects([{ op: "money", add: bad }], ctx), TypeError, "money add=" + String(bad));
    assert.throws(() => applyEffects([{ op: "item", item: "x", add: bad }], ctx), TypeError, "item add=" + String(bad));
    assert.throws(() => applyEffects([{ op: "stat", stat: "stat_a", add: bad }], ctxWithData(state, data)), TypeError, "stat add=" + String(bad));
  });

  // malformed subject/from/to TYPE -> throw (distinct from an unresolved-but-valid subject, which skips)
  assert.throws(() => applyEffects([{ op: "money", add: 1, subject: 42 }], ctx), TypeError);
  assert.throws(() => applyEffects([{ op: "relation", from: 42, add: 1 }], ctx), TypeError);
  assert.throws(() => applyEffects([{ op: "relation", to: [], add: 1 }], ctx), TypeError);
  assert.throws(() => applyEffects([{ op: "item", item: 42, add: 1 }], ctx), TypeError);
  assert.throws(() => applyEffects([{ op: "stat", stat: 42, add: 1 }], ctxWithData(state, data)), TypeError);
  assert.throws(() => applyEffects([{ op: "relation", add: 1.5 }], ctx), TypeError, "relation add must be an integer");
}

// 36-40: composition (sequential visibility, nested if, immutability, determinism, JSON round-trip)
function testSubjectEffectComposition() {
  const r36 = applyEffects(
    [{ op: "money", add: 5 }, { op: "money", add: -3 }],
    ctxWith(stateWithActors({ player_1: actorFixture({ money: 10 }) }))
  );
  assert.strictEqual(r36.state.actors.player_1.money, 12, "the second Effect must see the first Effect's result");

  const r37 = applyEffects(
    [{ op: "if", when: { op: "gte", left: { money: true }, right: 5 }, then: [{ op: "money", add: 100 }], else: [] }],
    ctxWith(stateWithActors({ player_1: actorFixture({ money: 10 }) }))
  );
  assert.strictEqual(r37.state.actors.player_1.money, 110, "if.when must see the actor's current money via the money selector (§3.2a)");

  const state38 = deepFreeze(
    stateWithActors({ player_1: actorFixture({ money: 10, hp: { current: 5, max: 10 } }), npc_1: actorFixture({ id: "npc_1" }) })
  );
  const stateBefore = snapshot(state38);
  const effects38 = deepFreeze([{ op: "money", add: 5 }, { op: "hp", add: -2, subject: "self" }, { op: "relation", add: 3 }]);
  const effectsBefore = snapshot(effects38);
  const ctx38 = deepFreeze(ctxWith(state38));
  const result38 = applyEffects(effects38, ctx38);
  assert.deepStrictEqual(snapshot(state38), stateBefore, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects38), effectsBefore, "input effects must be unchanged");
  assert.notStrictEqual(result38.state, ctx38.state, "result.state must be a different reference");
  assert.strictEqual(result38.state.actors.player_1.money, 15);
  assert.strictEqual(result38.state.actors.player_1.hp.current, 3);

  const runOnce = () =>
    applyEffects(
      [{ op: "money", add: 5 }, { op: "stat", stat: "stat_a", add: 2 }, { op: "relation", add: 4 }],
      ctxWithData(stateWithActors({ player_1: actorFixture({ money: 1 }), npc_1: actorFixture({ id: "npc_1" }) }), growthDataFixture())
    );
  const first = runOnce();
  const second = runOnce();
  assert.deepStrictEqual(second, first, "same (state, effects, ctx) must always produce the same result");

  assert.deepStrictEqual(JSON.parse(JSON.stringify(first.state)), first.state, "result state must be JSON round-trip safe");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first.events)), first.events, "events must be JSON round-trip safe");
}

// 41-45: event rules for the subject-based Effects
function testSubjectEffectEvents() {
  const baseActorState = stateWithActors({ player_1: actorFixture({ money: 10 }) });

  assert.strictEqual(applyEffects([{ op: "money", add: 5 }], ctxWith(baseActorState)).events.length, 1, "one changed Effect -> one event");
  assert.strictEqual(applyEffects([{ op: "money", add: 0 }], ctxWith(baseActorState)).events.length, 0, "no-op -> no event");

  const noTargetCtx = { state: baseActorState, data: {}, actorId: "player_1" };
  assert.strictEqual(applyEffects([{ op: "money", add: 5, subject: "target" }], noTargetCtx).events.length, 0, "missing target -> no event");

  const r44 = applyEffects(
    [{ op: "money", add: 5 }, { op: "item", item: "x", add: 1 }],
    ctxWith(stateWithActors({ player_1: actorFixture({ money: 1 }) }))
  );
  r44.events.forEach((e) => assert.strictEqual(e.seq, undefined, "no seq field"));

  const r45 = applyEffects(
    [{ op: "money", add: 1 }, { op: "money", add: 2 }, { op: "money", add: 3 }],
    ctxWith(stateWithActors({ player_1: actorFixture({ money: 1 }) }))
  );
  assert.deepStrictEqual(r45.events.map((e) => e.data.delta), [1, 2, 3], "event order must equal Effect order");
}

testFlag();
testSignal();
testTime();
testIf();
testSequentialVisibility();
testImmutability();
testDeterminism();
testJsonRoundTrip();
testMalformedEffectThrows();
testMalformedConditionInIfIsFalseBranch();
testLazyInitialization();
testNoForbiddenHostApis();
testNoSeqOnEvents();
testZeroDeltaNeverEmitsEvent();

testSubjectResolution();
testStat();
testHp();
testMoneyEffect();
testItemEffect();
testRelationEffect();
testSubjectVisibility();
testSubjectEffectValidation();
testSubjectEffectComposition();
testSubjectEffectEvents();

// ============================================================
// V2-Core-05: Growth Effects (skill/trait/unlock/case)
// ============================================================

function stateWithGrowth(growth) {
  return stateWithActors({ player_1: actorFixture({ growth }) });
}

// skill
function testSkillEffect() {
  const data = growthDataFixture(); // skill_a: maxRank 3

  const r1 = applyEffects([{ op: "skill", skill: "skill_a", add: 2 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r1.state.actors.player_1.growth.growth_a.skills.skill_a, 2);
  assert.deepStrictEqual(r1.events[0].data, { skill: "skill_a", delta: 2 });

  // default add = 1 when omitted
  const r2 = applyEffects([{ op: "skill", skill: "skill_a" }], ctxWithData(stateWithGrowth({ growth_a: { skills: { skill_a: 1 } } }), data));
  assert.strictEqual(r2.state.actors.player_1.growth.growth_a.skills.skill_a, 2);

  // maxRank clamp
  const r3 = applyEffects([{ op: "skill", skill: "skill_a", add: 10 }], ctxWithData(stateWithGrowth({ growth_a: { skills: { skill_a: 1 } } }), data));
  assert.strictEqual(r3.state.actors.player_1.growth.growth_a.skills.skill_a, 3, "maxRank clamp");
  assert.deepStrictEqual(r3.events[0].data, { skill: "skill_a", delta: 2 });

  // 0 -> key deleted
  const r4 = applyEffects([{ op: "skill", skill: "skill_a", add: -5 }], ctxWithData(stateWithGrowth({ growth_a: { skills: { skill_a: 2 } } }), data));
  assert.strictEqual(r4.state.actors.player_1.growth.growth_a.skills.skill_a, undefined);
  assert.deepStrictEqual(r4.state.actors.player_1.growth.growth_a.skills, {});

  // add 0 -> no event
  const r5 = applyEffects([{ op: "skill", skill: "skill_a", add: 0 }], ctxWithData(stateWithGrowth({ growth_a: { skills: { skill_a: 1 } } }), data));
  assert.strictEqual(r5.events.length, 0);

  // malformed
  assert.throws(() => applyEffects([{ op: "skill", skill: "skill_a", add: 1.5 }], ctxWithData(stateWithGrowth({}), data)), TypeError);
  assert.throws(() => applyEffects([{ op: "skill", add: 1 }], ctxWithData(stateWithGrowth({}), data)), TypeError, "missing `skill`");

  // missing actor -> skip
  const noActorCtx = { state: stateWithGrowth({}), data, actorId: "player_1", targetId: "does_not_exist" };
  const r6 = applyEffects([{ op: "skill", skill: "skill_a", add: 1, subject: "target" }], noActorCtx);
  assert.strictEqual(r6.events.length, 0);

  // visibility: NPC subject -> internal
  const stateWithNpc = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1", growth: {} }) });
  const r7 = applyEffects([{ op: "skill", skill: "skill_a", add: 1, subject: "target" }], ctxWithData(stateWithNpc, data));
  assert.strictEqual(r7.events[0].visibility, "internal");
}

// trait
function testTraitEffect() {
  const data = growthDataFixture(); // trait_a excludes trait_b

  // add
  const r1 = applyEffects([{ op: "trait", trait: "trait_b" }], ctxWithData(stateWithGrowth({}), data));
  assert.deepStrictEqual(r1.state.actors.player_1.growth.growth_a.traits, { trait_b: true });
  assert.deepStrictEqual(r1.events[0].data, { trait: "trait_b", added: true, removedExclusive: [] });

  // adding trait_a removes exclusive trait_b
  const r2 = applyEffects(
    [{ op: "trait", trait: "trait_a" }],
    ctxWithData(stateWithGrowth({ growth_a: { traits: { trait_b: true } } }), data)
  );
  assert.deepStrictEqual(r2.state.actors.player_1.growth.growth_a.traits, { trait_a: true });
  assert.deepStrictEqual(r2.events[0].data, { trait: "trait_a", added: true, removedExclusive: ["trait_b"] });

  // duplicate add -> no-op (idempotent, §6.3 {id:true} map)
  const r3 = applyEffects(
    [{ op: "trait", trait: "trait_b" }],
    ctxWithData(stateWithGrowth({ growth_a: { traits: { trait_b: true } } }), data)
  );
  assert.strictEqual(r3.events.length, 0);

  // remove
  const r4 = applyEffects(
    [{ op: "trait", trait: "trait_b", remove: true }],
    ctxWithData(stateWithGrowth({ growth_a: { traits: { trait_b: true } } }), data)
  );
  assert.deepStrictEqual(r4.state.actors.player_1.growth.growth_a.traits, {});
  assert.deepStrictEqual(r4.events[0].data, { trait: "trait_b", added: false });

  // remove when absent -> no-op
  const r5 = applyEffects([{ op: "trait", trait: "trait_b", remove: true }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r5.events.length, 0);

  // malformed
  assert.throws(() => applyEffects([{ op: "trait", trait: 42 }], ctxWithData(stateWithGrowth({}), data)), TypeError);
  assert.throws(() => applyEffects([{ op: "trait", trait: "trait_a", remove: "yes" }], ctxWithData(stateWithGrowth({}), data)), TypeError);
}

// unlock
function testUnlockEffect() {
  const data = growthDataFixture();

  const r1 = applyEffects([{ op: "unlock", id: "unl_a" }], ctxWithData(stateWithGrowth({}), data));
  assert.deepStrictEqual(r1.state.actors.player_1.growth.growth_a.unlocks, { unl_a: true });
  assert.deepStrictEqual(r1.events[0].data, { id: "unl_a" });

  // idempotent: already unlocked -> no event
  const r2 = applyEffects(
    [{ op: "unlock", id: "unl_a" }],
    ctxWithData(stateWithGrowth({ growth_a: { unlocks: { unl_a: true } } }), data)
  );
  assert.strictEqual(r2.events.length, 0);

  assert.throws(() => applyEffects([{ op: "unlock", id: 42 }], ctxWithData(stateWithGrowth({}), data)), TypeError);

  // missing target actor -> skip
  const noActorCtx = { state: stateWithGrowth({}), data, actorId: "player_1", targetId: "does_not_exist" };
  const r3 = applyEffects([{ op: "unlock", id: "unl_a", subject: "target" }], noActorCtx);
  assert.strictEqual(r3.events.length, 0);
}

// case (world-level, no subject)
function testCaseEffect() {
  const r1 = applyEffects([{ op: "case", case: "case_a", stage: "stage_1" }], ctxWith(baseState()));
  assert.deepStrictEqual(r1.state.cases, { case_a: { stage: "stage_1", since: 0 } });
  assert.deepStrictEqual(r1.events[0].data, { case: "case_a", stage: "stage_1" });
  assert.strictEqual(r1.events[0].visibility, "player");

  // stage transition updates `since` to the current minute
  const r2 = applyEffects(
    [{ op: "case", case: "case_a", stage: "stage_2" }],
    ctxWith(baseState({ time: { minute: 90 }, cases: { case_a: { stage: "stage_1", since: 0 } } }))
  );
  assert.deepStrictEqual(r2.state.cases.case_a, { stage: "stage_2", since: 90 });

  // same stage -> no-op, `since` untouched
  const r3 = applyEffects(
    [{ op: "case", case: "case_a", stage: "stage_1" }],
    ctxWith(baseState({ time: { minute: 90 }, cases: { case_a: { stage: "stage_1", since: 0 } } }))
  );
  assert.strictEqual(r3.events.length, 0);
  assert.deepStrictEqual(r3.state.cases.case_a, { stage: "stage_1", since: 0 });

  assert.throws(() => applyEffects([{ op: "case", case: "case_a", stage: 42 }], ctxWith(baseState())), TypeError);
  assert.throws(() => applyEffects([{ op: "case", stage: "stage_1" }], ctxWith(baseState())), TypeError);
}

// input immutability + determinism + JSON round-trip across the 4 new ops together
function testGrowthEffectComposition() {
  const data = growthDataFixture();
  const state = deepFreeze(stateWithGrowth({}));
  const stateBefore = snapshot(state);
  const effects = deepFreeze([
    { op: "skill", skill: "skill_a", add: 1 },
    { op: "trait", trait: "trait_a" },
    { op: "unlock", id: "unl_a" },
    { op: "case", case: "case_a", stage: "stage_1" }
  ]);
  const effectsBefore = snapshot(effects);
  const ctx = deepFreeze(ctxWithData(state, data));

  const result = applyEffects(effects, ctx);

  assert.deepStrictEqual(snapshot(state), stateBefore, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects), effectsBefore, "input effects must be unchanged");
  assert.notStrictEqual(result.state, ctx.state);
  result.events.forEach((e) => assert.strictEqual(e.seq, undefined));

  const second = applyEffects(effects, ctx);
  assert.deepStrictEqual(second, result, "same (state, effects, ctx) must always produce the same result");

  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.state)), result.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.events)), result.events);
}

testSkillEffect();
testTraitEffect();
testUnlockEffect();
testCaseEffect();
testGrowthEffectComposition();

// ============================================================
// V2-Core-06: exp/proficiency Effects (D-41, D-42 resolved -- §6.4.1/6.4.2)
// ============================================================

// Kept separate from growthDataFixture() (stat/skill/trait) so level/
// proficiency-specific tuning never disturbs the V2-Core-04/05 tests above.
function progressionDataFixture() {
  return {
    world: { growthSystemId: "growth_a" },
    growthSystems: {
      growth_a: {
        level: { max: 3, expTable: [0, 10, 20] },
        levelRewards: {
          "2": [{ op: "signal", key: "reward_lvl2", add: 1 }],
          "3": [{ op: "signal", key: "reward_lvl3", add: 1 }]
        },
        proficiencies: [
          {
            id: "prof_a",
            max: 30,
            thresholds: [
              { at: 10, effects: [{ op: "signal", key: "thresh_10", add: 1 }] },
              { at: 20, effects: [{ op: "signal", key: "thresh_20", add: 1 }] }
            ]
          }
        ]
      },
      growth_b: {}, // no `level` key -> level-less growth system (exp accumulates only)
      growth_c: { level: { expTable: [0, 5] } } // distinct table, no `max` -> used to prove explicit `system` overrides the world default
    }
  };
}

// exp
function testExpEffect() {
  const data = progressionDataFixture();

  // 1. basic increase (lazy growth[system] init, default level:1/exp:0)
  const r1 = applyEffects([{ op: "exp", amount: 5 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r1.state.actors.player_1.growth.growth_a.exp, 5);
  assert.strictEqual(r1.state.actors.player_1.growth.growth_a.level, 1);
  assert.strictEqual(r1.events.length, 1);
  assert.strictEqual(r1.events[0].type, "exp.gained");
  assert.deepStrictEqual(r1.events[0].data, { system: "growth_a", delta: 5 });

  // 2. subject self (explicit)
  const r2 = applyEffects(
    [{ op: "exp", amount: 3, subject: "self" }],
    ctxWithData(stateWithGrowth({ growth_a: { level: 1, exp: 2 } }), data)
  );
  assert.strictEqual(r2.state.actors.player_1.growth.growth_a.exp, 5);

  // 3. subject target
  const s3 = stateWithActors({ player_1: actorFixture({ growth: {} }), npc_1: actorFixture({ id: "npc_1", growth: {} }) });
  const r3 = applyEffects([{ op: "exp", amount: 4, subject: "target" }], ctxWithData(s3, data));
  assert.strictEqual(r3.state.actors.npc_1.growth.growth_a.exp, 4);
  assert.strictEqual(r3.state.actors.player_1.growth.growth_a, undefined, "self must be untouched when subject is target");

  // 4. subject explicit actor ID
  const s4 = stateWithActors({ player_1: actorFixture({ growth: {} }), npc_2: actorFixture({ id: "npc_2", growth: {} }) });
  const r4 = applyEffects([{ op: "exp", amount: 6, subject: "npc_2" }], ctxWithData(s4, data));
  assert.strictEqual(r4.state.actors.npc_2.growth.growth_a.exp, 6);

  // 5. system 명시 (world 기본값 growth_a 대신 growth_c 사용)
  const r5 = applyEffects([{ op: "exp", amount: 3, system: "growth_c" }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r5.state.actors.player_1.growth.growth_c.exp, 3);
  assert.strictEqual(r5.state.actors.player_1.growth.growth_a, undefined, "explicit `system` must not touch the world-default system");

  // 6. expTable 기반 level 계산 (exp=10 -> level 2)
  const r6 = applyEffects([{ op: "exp", amount: 10 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r6.state.actors.player_1.growth.growth_a.level, 2);

  // 7. level.max clamp (expTable은 4칸이지만 max=2)
  const clampData = progressionDataFixture();
  clampData.growthSystems.growth_a.level = { max: 2, expTable: [0, 10, 20, 30] };
  const r7 = applyEffects([{ op: "exp", amount: 30 }], ctxWithData(stateWithGrowth({}), clampData));
  assert.strictEqual(r7.state.actors.player_1.growth.growth_a.level, 2, "rawLevel 4 must clamp to level.max 2");

  // 8. level:null (level-less growth system) -> exp만 누적, level/reward/event 없음
  const r8 = applyEffects([{ op: "exp", amount: 5, system: "growth_b" }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r8.state.actors.player_1.growth.growth_b.exp, 5);
  assert.strictEqual(r8.state.actors.player_1.growth.growth_b.level, 1, "level field stays at its lazy default, never processed");
  assert.strictEqual(r8.events.length, 1, "only exp.gained, no level.up");
  assert.strictEqual(r8.events[0].type, "exp.gained");

  // 9. single level-up (0 -> 10, level 1 -> 2)
  const r9 = applyEffects([{ op: "exp", amount: 10 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r9.state.actors.player_1.growth.growth_a.level, 2);
  const levelUpEvents9 = r9.events.filter((e) => e.type === "level.up");
  assert.strictEqual(levelUpEvents9.length, 1);
  assert.deepStrictEqual(levelUpEvents9[0].data, { system: "growth_a", from: 1, to: 2 });

  // 10. multi-level-up (0 -> 25, level 1 -> 3, 중간 레벨을 건너뛰지 않고 순차 처리)
  const r10 = applyEffects([{ op: "exp", amount: 25 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r10.state.actors.player_1.growth.growth_a.level, 3);
  const levelUpEvents10 = r10.events.filter((e) => e.type === "level.up");
  assert.strictEqual(levelUpEvents10.length, 2);
  assert.deepStrictEqual(levelUpEvents10.map((e) => e.data), [
    { system: "growth_a", from: 1, to: 2 },
    { system: "growth_a", from: 2, to: 3 }
  ]);

  // 11. levelRewards 순차 실행 (레벨별 reward가 순서대로 적용됨)
  assert.strictEqual(r10.state.signals.reward_lvl2, 1);
  assert.strictEqual(r10.state.signals.reward_lvl3, 1);

  // 12. reward depth-first 실행: reward 이벤트가 해당 레벨의 level.up 이벤트보다 먼저 온다
  const types10 = r10.events.map((e) => e.type);
  assert.deepStrictEqual(types10, ["exp.gained", "signal.raised", "level.up", "signal.raised", "level.up"]);

  // 13. level.up 이벤트: 레벨당 1개, data:{system,from,to}, visibility (D-31)
  assert.strictEqual(levelUpEvents10[0].visibility, "player");

  // 14. exp 변화 없음(amount=0) -> no-op, no event
  const r14 = applyEffects([{ op: "exp", amount: 0 }], ctxWithData(stateWithGrowth({ growth_a: { level: 1, exp: 5 } }), data));
  assert.strictEqual(r14.events.length, 0);
  assert.strictEqual(r14.state.actors.player_1.growth.growth_a.exp, 5);

  // 15. malformed amount (non-integer/NaN/Infinity/wrong type) -> throw
  const ctx15 = ctxWithData(stateWithGrowth({}), data);
  [1.5, NaN, Infinity, -Infinity, "3", null, undefined, {}].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "exp", amount: bad }], ctx15), TypeError, "exp amount=" + String(bad));
  });

  // 16. negative amount -> throw
  assert.throws(() => applyEffects([{ op: "exp", amount: -1 }], ctx15), TypeError, "negative exp amount must throw");

  // 17. input immutability
  const state17 = deepFreeze(stateWithGrowth({ growth_a: { level: 1, exp: 5 } }));
  const stateBefore17 = snapshot(state17);
  const effects17 = deepFreeze([{ op: "exp", amount: 10 }]);
  const effectsBefore17 = snapshot(effects17);
  const ctx17 = deepFreeze(ctxWithData(state17, data));
  const result17 = applyEffects(effects17, ctx17);
  assert.deepStrictEqual(snapshot(state17), stateBefore17, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects17), effectsBefore17, "input effects must be unchanged");
  assert.notStrictEqual(result17.state, ctx17.state);
  assert.strictEqual(result17.state.actors.player_1.growth.growth_a.exp, 15);

  // 18. determinism
  const runExp = () => applyEffects([{ op: "exp", amount: 25 }], ctxWithData(stateWithGrowth({}), data));
  assert.deepStrictEqual(runExp(), runExp(), "same (effects, ctx) must always produce the same result");

  // 19. JSON round-trip
  const result19 = runExp();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result19.state)), result19.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result19.events)), result19.events);

  // 20. malformed `system` type -> throw
  assert.throws(() => applyEffects([{ op: "exp", amount: 1, system: 42 }], ctx15), TypeError, "exp `system` must be a string when present");

  // 21. missing/unresolvable subject -> skip (D-29), no throw, no event
  const noTargetCtx = { state: stateWithGrowth({}), data, actorId: "player_1" };
  const r21 = applyEffects([{ op: "exp", amount: 5, subject: "target" }], noTargetCtx);
  assert.strictEqual(r21.events.length, 0);
  assert.deepStrictEqual(r21.state, noTargetCtx.state, "unresolvable subject leaves state unchanged");
}

// proficiency
function testProficiencyEffect() {
  const data = progressionDataFixture(); // prof_a: max 30, thresholds at 10 and 20

  // 1. basic increase (lazy proficiency map init)
  const r1 = applyEffects([{ op: "proficiency", id: "prof_a", add: 5 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r1.state.actors.player_1.growth.growth_a.proficiency.prof_a, 5);
  assert.strictEqual(r1.events[0].type, "proficiency.changed");
  assert.deepStrictEqual(r1.events[0].data, { id: "prof_a", delta: 5 });

  // 2. max 하드 clamp
  const r2 = applyEffects(
    [{ op: "proficiency", id: "prof_a", add: 100 }],
    ctxWithData(stateWithGrowth({ growth_a: { proficiency: { prof_a: 25 } } }), data)
  );
  assert.strictEqual(r2.state.actors.player_1.growth.growth_a.proficiency.prof_a, 30, "hard clamp at the definition's max");
  assert.deepStrictEqual(r2.events[0].data, { id: "prof_a", delta: 5 });

  // 3. add=0 -> no-op, no event
  const r3 = applyEffects(
    [{ op: "proficiency", id: "prof_a", add: 0 }],
    ctxWithData(stateWithGrowth({ growth_a: { proficiency: { prof_a: 5 } } }), data)
  );
  assert.strictEqual(r3.events.length, 0);
  assert.strictEqual(r3.state.actors.player_1.growth.growth_a.proficiency.prof_a, 5);

  // 4. 단일 threshold 통과 (before=5, add=10 -> after=15, at=10만 fire)
  const r4 = applyEffects(
    [{ op: "proficiency", id: "prof_a", add: 10 }],
    ctxWithData(stateWithGrowth({ growth_a: { proficiency: { prof_a: 5 } } }), data)
  );
  assert.strictEqual(r4.state.signals.thresh_10, 1);
  assert.strictEqual(r4.state.signals.thresh_20, undefined, "only the crossed threshold fires");

  // 5. 동시에 여러 threshold 통과 (before=0, add=25 -> after=25, at=10/at=20 모두 fire)
  const r5 = applyEffects([{ op: "proficiency", id: "prof_a", add: 25 }], ctxWithData(stateWithGrowth({}), data));
  assert.strictEqual(r5.state.signals.thresh_10, 1);
  assert.strictEqual(r5.state.signals.thresh_20, 1);

  // 6. threshold 순서 보장: at 오름차순 (낮은 것부터) 처리
  const eventTypes6 = r5.events.map((e) => e.type + ":" + (e.data.key ?? ""));
  const idx10 = eventTypes6.indexOf("signal.raised:thresh_10");
  const idx20 = eventTypes6.indexOf("signal.raised:thresh_20");
  assert.ok(idx10 !== -1 && idx20 !== -1 && idx10 < idx20, "a lower `at` threshold must fire before a higher one");

  // 7. threshold reward depth-first 실행: proficiency.changed 다음 즉시 순서대로 실행됨
  assert.deepStrictEqual(r5.events.map((e) => e.type), ["proficiency.changed", "signal.raised", "signal.raised"]);

  // 8. 기존 값이 이미 threshold를 넘은 경우 -> 재발화하지 않음
  const r8 = applyEffects(
    [{ op: "proficiency", id: "prof_a", add: 5 }],
    ctxWithData(stateWithGrowth({ growth_a: { proficiency: { prof_a: 12 } } }), data)
  );
  assert.strictEqual(r8.state.signals, undefined, "before=12 already past at=10, and 17 does not reach at=20 -> no threshold fires");

  // 9. malformed add -> throw
  const ctx9 = ctxWithData(stateWithGrowth({}), data);
  [1.5, NaN, Infinity, -Infinity, "3", null, undefined, {}].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "proficiency", id: "prof_a", add: bad }], ctx9), TypeError, "proficiency add=" + String(bad));
  });
  assert.throws(() => applyEffects([{ op: "proficiency", id: 42, add: 1 }], ctx9), TypeError, "malformed `id` must throw");

  // 10. negative add -> throw
  assert.throws(() => applyEffects([{ op: "proficiency", id: "prof_a", add: -1 }], ctx9), TypeError, "negative proficiency add must throw");

  // 11. input immutability
  const state11 = deepFreeze(stateWithGrowth({ growth_a: { proficiency: { prof_a: 5 } } }));
  const stateBefore11 = snapshot(state11);
  const effects11 = deepFreeze([{ op: "proficiency", id: "prof_a", add: 10 }]);
  const effectsBefore11 = snapshot(effects11);
  const ctx11 = deepFreeze(ctxWithData(state11, data));
  const result11 = applyEffects(effects11, ctx11);
  assert.deepStrictEqual(snapshot(state11), stateBefore11, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects11), effectsBefore11, "input effects must be unchanged");
  assert.notStrictEqual(result11.state, ctx11.state);
  assert.strictEqual(result11.state.actors.player_1.growth.growth_a.proficiency.prof_a, 15);

  // 12. determinism
  const runProf = () => applyEffects([{ op: "proficiency", id: "prof_a", add: 25 }], ctxWithData(stateWithGrowth({}), data));
  assert.deepStrictEqual(runProf(), runProf(), "same (effects, ctx) must always produce the same result");

  // 13. JSON round-trip
  const result13 = runProf();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result13.state)), result13.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result13.events)), result13.events);

  // 14. visibility (D-31); 정의 없는 proficiency id는 clamp/threshold 없이 그냥 누적된다
  const r14 = applyEffects(
    [{ op: "proficiency", id: "undefined_prof", add: 5, subject: "self", system: "growth_a" }],
    ctxWithData(stateWithGrowth({}), data)
  );
  assert.strictEqual(r14.state.actors.player_1.growth.growth_a.proficiency.undefined_prof, 5, "no definition -> no clamp/thresholds, just accumulate");
  assert.strictEqual(r14.events[0].visibility, "player");

  // 15. missing/unresolvable subject -> skip (D-29), no throw, no event
  const noTargetCtx = { state: stateWithGrowth({}), data, actorId: "player_1" };
  const r15 = applyEffects([{ op: "proficiency", id: "prof_a", add: 5, subject: "target" }], noTargetCtx);
  assert.strictEqual(r15.events.length, 0);
  assert.deepStrictEqual(r15.state, noTargetCtx.state, "unresolvable subject leaves state unchanged");
}

testExpEffect();
testProficiencyEffect();

// ============================================================
// V2-Core-07: relation mode/tag/untag (D-43 resolved -- §7.3/§4.2)
// testRelationEffect() above (relation.add only) is left untouched --
// its continued pass is the add-path regression check.
// ============================================================

function relationBaseState() {
  return stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) });
}

// relation.mode
function testRelationModeEffect() {
  // 1. 정상 mode 변경 (신규 edge, cooperation 카운터 +1)
  const r1 = applyEffects([{ op: "relation", mode: "cooperation" }], ctxWith(relationBaseState()));
  assert.strictEqual(r1.state.relations["npc_1:player_1"].mode, "cooperation");
  assert.strictEqual(r1.state.relations["npc_1:player_1"].cooperationCount, 1);
  assert.strictEqual(r1.state.relations["npc_1:player_1"].conflictCount, 0);

  // 2. 동일 mode(neutral) 재지정 -> no-op (카운터 없음, 값도 그대로, edge조차 생성되지 않음)
  const r2 = applyEffects([{ op: "relation", mode: "neutral" }], ctxWith(relationBaseState()));
  assert.strictEqual(r2.state.relations, undefined, "mode:neutral on an already-neutral (nonexistent) edge must be a pure no-op");
  assert.strictEqual(r2.events.length, 0);

  // cooperation을 반복 지정하면 mode 값은 그대로여도 카운터는 매번 증가한다 (D-43, V1 semantics) -> no-op이 아니다
  const existingCoop = { score: 0, mode: "cooperation", lastDay: 3, cooperationCount: 2, conflictCount: 0, tags: [] };
  const s2b = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) }, { relations: { "npc_1:player_1": existingCoop } });
  const r2b = applyEffects([{ op: "relation", mode: "cooperation" }], ctxWith(s2b));
  assert.strictEqual(r2b.state.relations["npc_1:player_1"].cooperationCount, 3, "re-specifying the same mode still bumps the counter");
  assert.strictEqual(r2b.events.length, 1, "the counter bump is a real change -> event fires even though `mode` itself didn't change");

  // 3. malformed mode -> throw
  const ctx3 = ctxWith(relationBaseState());
  ["hostile", "", "COOPERATION", 1, null, true, {}].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "relation", mode: bad }], ctx3), TypeError, "relation mode=" + JSON.stringify(bad));
  });

  // 4. 대상 부재 -> skip
  const noTargetCtx = { state: stateWithActors({ player_1: actorFixture() }), data: {}, actorId: "player_1" };
  const r4 = applyEffects([{ op: "relation", mode: "conflict" }], noTargetCtx);
  assert.strictEqual(r4.events.length, 0);
  assert.deepStrictEqual(r4.state, noTargetCtx.state);

  // 5. visibility: player가 한쪽 끝이면 player, 둘 다 아니면 internal
  const s5 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }), npc_2: actorFixture({ id: "npc_2" }) });
  assert.strictEqual(applyEffects([{ op: "relation", mode: "cooperation" }], ctxWith(s5)).events[0].visibility, "player");
  assert.strictEqual(
    applyEffects([{ op: "relation", from: "npc_1", to: "npc_2", mode: "cooperation" }], ctxWith(s5)).events[0].visibility,
    "internal"
  );

  // 6. event: mode만 바뀔 때 data에는 mode만 담기고 delta/tagAdded/tagRemoved는 없다
  const r6 = applyEffects([{ op: "relation", mode: "conflict" }], ctxWith(relationBaseState()));
  assert.strictEqual(r6.events[0].type, "relation.changed");
  assert.deepStrictEqual(r6.events[0].data, { from: "npc_1", to: "player_1", mode: "conflict" });

  // 7. 입력 불변성
  const state7 = deepFreeze(relationBaseState());
  const stateBefore7 = snapshot(state7);
  const effects7 = deepFreeze([{ op: "relation", mode: "cooperation" }]);
  const effectsBefore7 = snapshot(effects7);
  const ctx7 = deepFreeze(ctxWith(state7));
  const result7 = applyEffects(effects7, ctx7);
  assert.deepStrictEqual(snapshot(state7), stateBefore7, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects7), effectsBefore7, "input effects must be unchanged");
  assert.notStrictEqual(result7.state, ctx7.state);
  assert.strictEqual(result7.state.relations["npc_1:player_1"].mode, "cooperation");
}

// relation.tag
function testRelationTagEffect() {
  // 8. 신규 tag 추가
  const r8 = applyEffects([{ op: "relation", tag: "rival" }], ctxWith(relationBaseState()));
  assert.deepStrictEqual(r8.state.relations["npc_1:player_1"].tags, ["rival"]);
  assert.deepStrictEqual(r8.events[0].data, { from: "npc_1", to: "player_1", tagAdded: "rival" });

  // 9. 동일 tag 중복 추가 -> no-op
  const existingTagged = { score: 0, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: ["rival"] };
  const s9 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) }, { relations: { "npc_1:player_1": existingTagged } });
  const r9 = applyEffects([{ op: "relation", tag: "rival" }], ctxWith(s9));
  assert.strictEqual(r9.events.length, 0);
  assert.deepStrictEqual(r9.state.relations["npc_1:player_1"].tags, ["rival"]);

  // 10. 복수 tag: 서로 다른 tag를 순차적으로 추가
  const r10 = applyEffects(
    [{ op: "relation", tag: "member" }, { op: "relation", tag: "debt" }],
    ctxWith(relationBaseState())
  );
  assert.deepStrictEqual(r10.state.relations["npc_1:player_1"].tags, ["debt", "member"]);

  // 11. deterministic ordering: 추가 순서와 무관하게 정렬된 상태로 저장된다
  const r11 = applyEffects(
    [{ op: "relation", tag: "zeta" }, { op: "relation", tag: "alpha" }, { op: "relation", tag: "mid" }],
    ctxWith(relationBaseState())
  );
  assert.deepStrictEqual(r11.state.relations["npc_1:player_1"].tags, ["alpha", "mid", "zeta"]);

  // 12. malformed tag -> throw
  const ctx12 = ctxWith(relationBaseState());
  [1, null, true, {}, []].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "relation", tag: bad }], ctx12), TypeError, "relation tag=" + JSON.stringify(bad));
  });

  // 13. 대상 부재 -> skip
  const noTargetCtx = { state: stateWithActors({ player_1: actorFixture() }), data: {}, actorId: "player_1" };
  const r13 = applyEffects([{ op: "relation", tag: "x" }], noTargetCtx);
  assert.strictEqual(r13.events.length, 0);
  assert.deepStrictEqual(r13.state, noTargetCtx.state);

  // 14. visibility
  const s14 = stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }), npc_2: actorFixture({ id: "npc_2" }) });
  assert.strictEqual(applyEffects([{ op: "relation", tag: "x" }], ctxWith(s14)).events[0].visibility, "player");
  assert.strictEqual(
    applyEffects([{ op: "relation", from: "npc_1", to: "npc_2", tag: "x" }], ctxWith(s14)).events[0].visibility,
    "internal"
  );

  // 15. event data shape
  const r15 = applyEffects([{ op: "relation", tag: "member" }], ctxWith(relationBaseState()));
  assert.deepStrictEqual(Object.keys(r15.events[0].data).sort(), ["from", "tagAdded", "to"]);

  // 16. 입력 불변성
  const state16 = deepFreeze(relationBaseState());
  const stateBefore16 = snapshot(state16);
  const effects16 = deepFreeze([{ op: "relation", tag: "member" }]);
  const effectsBefore16 = snapshot(effects16);
  const ctx16 = deepFreeze(ctxWith(state16));
  const result16 = applyEffects(effects16, ctx16);
  assert.deepStrictEqual(snapshot(state16), stateBefore16, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects16), effectsBefore16, "input effects must be unchanged");
  assert.notStrictEqual(result16.state, ctx16.state);
}

// relation.untag
function testRelationUntagEffect() {
  function stateWithTags(tags) {
    const edge = { score: 0, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags };
    return stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) }, { relations: { "npc_1:player_1": edge } });
  }

  // 17. 기존 tag 제거
  const r17 = applyEffects([{ op: "relation", untag: "rival" }], ctxWith(stateWithTags(["rival"])));
  assert.deepStrictEqual(r17.state.relations["npc_1:player_1"].tags, []);
  assert.deepStrictEqual(r17.events[0].data, { from: "npc_1", to: "player_1", tagRemoved: "rival" });

  // 18. 존재하지 않는 tag 제거 -> no-op
  const r18 = applyEffects([{ op: "relation", untag: "ghost" }], ctxWith(stateWithTags(["rival"])));
  assert.strictEqual(r18.events.length, 0);
  assert.deepStrictEqual(r18.state.relations["npc_1:player_1"].tags, ["rival"]);

  // 19. 여러 tag 상태에서 특정 tag만 제거
  const r19 = applyEffects([{ op: "relation", untag: "b" }], ctxWith(stateWithTags(["a", "b", "c"])));
  assert.deepStrictEqual(r19.state.relations["npc_1:player_1"].tags, ["a", "c"]);

  // 20. malformed untag -> throw
  const ctx20 = ctxWith(stateWithTags(["rival"]));
  [1, null, true, {}, []].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "relation", untag: bad }], ctx20), TypeError, "relation untag=" + JSON.stringify(bad));
  });

  // 21. 대상 부재 -> skip
  const noTargetCtx = { state: stateWithActors({ player_1: actorFixture() }), data: {}, actorId: "player_1" };
  const r21 = applyEffects([{ op: "relation", untag: "rival" }], noTargetCtx);
  assert.strictEqual(r21.events.length, 0);
  assert.deepStrictEqual(r21.state, noTargetCtx.state);

  // 22. visibility
  const taggedEdge = { score: 0, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: ["x"] };
  const s22 = stateWithActors(
    { player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }), npc_2: actorFixture({ id: "npc_2" }) },
    { relations: { "npc_1:player_1": taggedEdge, "npc_1:npc_2": { ...taggedEdge } } }
  );
  assert.strictEqual(applyEffects([{ op: "relation", untag: "x" }], ctxWith(s22)).events[0].visibility, "player");
  assert.strictEqual(
    applyEffects([{ op: "relation", from: "npc_1", to: "npc_2", untag: "x" }], ctxWith(s22)).events[0].visibility,
    "internal"
  );

  // 23. event data shape
  const r23 = applyEffects([{ op: "relation", untag: "rival" }], ctxWith(stateWithTags(["rival"])));
  assert.deepStrictEqual(Object.keys(r23.events[0].data).sort(), ["from", "tagRemoved", "to"]);

  // 24. 입력 불변성
  const state24 = deepFreeze(stateWithTags(["rival"]));
  const stateBefore24 = snapshot(state24);
  const effects24 = deepFreeze([{ op: "relation", untag: "rival" }]);
  const effectsBefore24 = snapshot(effects24);
  const ctx24 = deepFreeze(ctxWith(state24));
  const result24 = applyEffects(effects24, ctx24);
  assert.deepStrictEqual(snapshot(state24), stateBefore24, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects24), effectsBefore24, "input effects must be unchanged");
  assert.notStrictEqual(result24.state, ctx24.state);
}

// integration: add -> mode -> tag -> untag, combined-field events, JSON round-trip, determinism
function testRelationIntegration() {
  // 25. add -> mode -> tag -> untag 순차 적용 (Effect 4개, 하나의 edge를 이어서 갱신)
  const r25 = applyEffects(
    [
      { op: "relation", add: 10 },
      { op: "relation", mode: "cooperation" },
      { op: "relation", tag: "ally" },
      { op: "relation", untag: "ally" }
    ],
    ctxWith(relationBaseState())
  );
  const edge25 = r25.state.relations["npc_1:player_1"];
  assert.strictEqual(edge25.score, 10);
  assert.strictEqual(edge25.mode, "cooperation");
  assert.strictEqual(edge25.cooperationCount, 1);
  assert.deepStrictEqual(edge25.tags, [], "tag then untag of the same string must leave tags empty");
  assert.strictEqual(r25.events.length, 4, "each of the 4 sequential Effects changed something -> 4 events");

  // 26. 뒤 Effect가 앞 Effect의 결과를 즉시 보는지 (같은 edge를 이어서 갱신, 새로 만들지 않음)
  const r26 = applyEffects(
    [
      { op: "relation", mode: "cooperation" },
      { op: "relation", mode: "cooperation" }
    ],
    ctxWith(relationBaseState())
  );
  assert.strictEqual(r26.state.relations["npc_1:player_1"].cooperationCount, 2, "the second Effect must see the first Effect's edge, not a fresh default");

  // 한 Effect 안에서 add와 mode를 동시에 지정해도 이벤트는 1개, data에 둘 다 조건부로 담긴다 (D-43)
  const r26b = applyEffects([{ op: "relation", add: 5, mode: "conflict" }], ctxWith(relationBaseState()));
  assert.strictEqual(r26b.events.length, 1);
  assert.deepStrictEqual(r26b.events[0].data, { from: "npc_1", to: "player_1", delta: 5, mode: "conflict" });

  // 27. JSON round-trip
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r25.state)), r25.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r25.events)), r25.events);

  // 28. determinism
  const runRelation = () =>
    applyEffects(
      [
        { op: "relation", add: 10 },
        { op: "relation", mode: "cooperation" },
        { op: "relation", tag: "ally" }
      ],
      ctxWith(relationBaseState())
    );
  assert.deepStrictEqual(runRelation(), runRelation(), "same (effects, ctx) must always produce the same result");

  // 29-30. 기존 relation.add regression / V2-Core-03~06 전체 regression은 이 파일의
  // testRelationEffect()(변경 없음)와 tests/v2/run.js + V1 41개 전체 실행으로 확인한다
  // (아래 verification 절 참고, 이 함수 안에서 별도로 재검증하지 않는다).
}

testRelationModeEffect();
testRelationTagEffect();
testRelationUntagEffect();
testRelationIntegration();

// ============================================================
// V2-Core-08: fact Effect (D-44 resolved -- §4.2/§8.1)
// rumor Effect is a documented blocker (D-45, §8.3) and is NOT implemented
// or tested here -- see CORE_CONTRACTS.md §8.3 for the enumerated gaps.
// ============================================================

// fact (world-level, no subject -- same category as `case`)
function testFactEffect() {
  // 1. 정상 생성 (lazy state.facts)
  const r1 = applyEffects([{ op: "fact", fact: "killer", set: "npc_a" }], ctxWith(baseState()));
  assert.deepStrictEqual(r1.state.facts, { killer: { value: "npc_a", since: 0 } });
  assert.strictEqual(r1.events.length, 1);
  assert.strictEqual(r1.events[0].type, "fact.changed");
  assert.strictEqual(r1.events[0].visibility, "internal");
  assert.deepStrictEqual(r1.events[0].data, { fact: "killer", value: "npc_a" });

  // 2. 기존 값 변경 (since가 현재 minute으로 갱신됨)
  const r2 = applyEffects(
    [{ op: "fact", fact: "killer", set: "npc_b" }],
    ctxWith(baseState({ time: { minute: 90 }, facts: { killer: { value: "npc_a", since: 0 } } }))
  );
  assert.deepStrictEqual(r2.state.facts.killer, { value: "npc_b", since: 90 });
  assert.deepStrictEqual(r2.events[0].data, { fact: "killer", value: "npc_b" });

  // 3. 동일 값 재설정 -> no-op (이벤트 없음, since도 갱신되지 않음)
  const r3 = applyEffects(
    [{ op: "fact", fact: "killer", set: "npc_a" }],
    ctxWith(baseState({ time: { minute: 90 }, facts: { killer: { value: "npc_a", since: 0 } } }))
  );
  assert.strictEqual(r3.events.length, 0);
  assert.deepStrictEqual(r3.state.facts.killer, { value: "npc_a", since: 0 }, "since must not be touched on no-op");

  // 구조적으로 동일한 객체 값도 (JSON 비교로) no-op으로 처리한다
  const r3b = applyEffects(
    [{ op: "fact", fact: "loot", set: { gold: 5 } }],
    ctxWith(baseState({ facts: { loot: { value: { gold: 5 }, since: 0 } } }))
  );
  assert.strictEqual(r3b.events.length, 0, "structurally-equal object value must also be a no-op");

  // 4. malformed 입력 -> throw. null/false/0/""는 유효한 값이지 malformed가 아니다
  const ctx4 = ctxWith(baseState());
  assert.throws(() => applyEffects([{ op: "fact", set: "x" }], ctx4), TypeError, "missing `fact`");
  assert.throws(() => applyEffects([{ op: "fact", fact: 42, set: "x" }], ctx4), TypeError, "non-string `fact`");
  assert.throws(() => applyEffects([{ op: "fact", fact: "killer" }], ctx4), TypeError, "missing `set`");
  assert.doesNotThrow(() => applyEffects([{ op: "fact", fact: "x", set: null }], ctx4), "`set:null` is a valid JSON value");
  assert.doesNotThrow(() => applyEffects([{ op: "fact", fact: "x", set: false }], ctx4), "`set:false` is a valid JSON value");
  assert.doesNotThrow(() => applyEffects([{ op: "fact", fact: "x", set: 0 }], ctx4), "`set:0` is a valid JSON value");
  assert.doesNotThrow(() => applyEffects([{ op: "fact", fact: "x", set: "" }], ctx4), '`set:""` is a valid JSON value');

  // 5. subject를 쓰지 않는 세계 단위 op이므로 "대상 부재" 개념이 없다(case와 동일) --
  //    actorId/targetId가 전혀 없는 ctx로도 정상 동작해야 한다
  const r5 = applyEffects([{ op: "fact", fact: "x", set: 1 }], { state: baseState(), data: {} });
  assert.strictEqual(r5.state.facts.x.value, 1);

  // 6. visibility: 항상 internal (8.1절)
  assert.strictEqual(r1.events[0].visibility, "internal");

  // 7. event data 스키마: {fact, value} 두 키만 담는다
  assert.deepStrictEqual(Object.keys(r1.events[0].data).sort(), ["fact", "value"]);

  // 8. 이벤트는 실제 값 변화가 있을 때만 (false !== true는 실제 변화)
  const r8 = applyEffects([{ op: "fact", fact: "x", set: false }], ctxWith(baseState({ facts: { x: { value: true, since: 0 } } })));
  assert.strictEqual(r8.events.length, 1, "false !== true -> real change -> event");

  // 9. 순차 Effect 가시성: 두 번째 Effect가 첫 번째의 결과를 즉시 본다
  const r9 = applyEffects([{ op: "fact", fact: "x", set: "a" }, { op: "fact", fact: "x", set: "a" }], ctxWith(baseState()));
  assert.strictEqual(r9.events.length, 1, "the second Effect must see the first Effect's write and no-op");

  // 10. 입력 불변성
  const state10 = deepFreeze(baseState({ facts: { killer: { value: "npc_a", since: 0 } } }));
  const stateBefore10 = snapshot(state10);
  const effects10 = deepFreeze([{ op: "fact", fact: "killer", set: "npc_b" }]);
  const effectsBefore10 = snapshot(effects10);
  const ctx10 = deepFreeze(ctxWith(state10));
  const result10 = applyEffects(effects10, ctx10);
  assert.deepStrictEqual(snapshot(state10), stateBefore10, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects10), effectsBefore10, "input effects must be unchanged");
  assert.notStrictEqual(result10.state, ctx10.state);
  assert.strictEqual(result10.state.facts.killer.value, "npc_b");

  // 11. determinism
  const runFact = () => applyEffects([{ op: "fact", fact: "x", set: "a" }], ctxWith(baseState()));
  assert.deepStrictEqual(runFact(), runFact(), "same (effects, ctx) must always produce the same result");

  // 12. JSON round-trip
  const result12 = runFact();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result12.state)), result12.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result12.events)), result12.events);
}

testFactEffect();

// ============================================================
// V2-Core-09: rumor Effect (D-45/D-14 resolved -- §8.3/§4.2)
// The Condition-side `rumor` selector (§3.2a) stays deferred (D-24) --
// SELECTOR_RESOLVERS is not touched by this round, so no test for it here.
// ============================================================

function rumorDataFixture() {
  return {
    rumors: {
      rum_a: { factId: "fact_a", claim: "npc_x" },
      rum_b: { factId: "fact_a", claim: "npc_y" }
    },
    rules: { rumor: { relayLoss: 10, newSourceGain: 15, sameSourceGain: 2 } }
  };
}

function stateWithKnowledge(knowledge, overrides) {
  return stateWithActors({ player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) }, { knowledge, ...overrides });
}

function testRumorEffect() {
  const data = rumorDataFixture();

  // 1. 생성 (학습 모드, lazy state.knowledge)
  const r1 = applyEffects([{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 45 }], ctxWithData(stateWithKnowledge({}), data));
  const entry1 = r1.state.knowledge.player_1.rum_a;
  assert.deepStrictEqual(entry1, {
    rumorId: "rum_a",
    factId: "fact_a",
    claim: "npc_x",
    source: "npc_c",
    sources: ["npc_c"],
    confidence: 45,
    confirmations: 1,
    firstSeenDay: 0,
    lastSeenDay: 0
  });
  assert.strictEqual(r1.events.length, 1);
  assert.strictEqual(r1.events[0].type, "rumor.learned");
  assert.deepStrictEqual(r1.events[0].data, { rumor: "rum_a", factId: "fact_a", claim: "npc_x", confidence: 45, delta: 45 });

  // 생성 (관찰 모드): 현재 fact 값을 claim으로 복사
  const r1b = applyEffects(
    [{ op: "rumor", rumor: "rum_a", observe: true, source: "obs_loc_a", confidence: 80 }],
    ctxWithData(stateWithKnowledge({}, { facts: { fact_a: { value: "npc_z", since: 0 } } }), data)
  );
  assert.strictEqual(r1b.state.knowledge.player_1.rum_a.claim, "npc_z", "observe copies the CURRENT fact value, not the data.rumors definition's claim");

  // 생성 (복사 모드): 다른 actor의 지식 항목을 복사, confidence는 relayLoss만큼 감소
  const npc1Entry = { rumorId: "rum_a", factId: "fact_a", claim: "npc_z", source: "npc_q", sources: ["npc_q"], confidence: 90, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const r1c = applyEffects(
    [{ op: "rumor", rumor: "rum_a", from: "npc_1" }],
    ctxWithData(stateWithKnowledge({ npc_1: { rum_a: npc1Entry } }), data)
  );
  const copiedEntry = r1c.state.knowledge.player_1.rum_a;
  assert.strictEqual(copiedEntry.claim, "npc_z");
  assert.strictEqual(copiedEntry.confidence, 80, "90 - relayLoss(10) = 80");
  assert.deepStrictEqual(copiedEntry.sources, ["npc_1"], "copy mode's provenance is the `from` actor itself");

  // 2. 기존 rumor 갱신 -- 새 출처로 재확인
  const existing2 = { rumorId: "rum_a", factId: "fact_a", claim: "npc_x", source: "npc_c", sources: ["npc_c"], confidence: 45, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const r2 = applyEffects(
    [{ op: "rumor", rumor: "rum_a", source: "npc_d", confidence: 10 }],
    ctxWithData(stateWithKnowledge({ player_1: { rum_a: existing2 } }), data)
  );
  const entry2 = r2.state.knowledge.player_1.rum_a;
  assert.strictEqual(entry2.confidence, 60, "45 + newSourceGain(15) = 60");
  assert.deepStrictEqual(entry2.sources, ["npc_c", "npc_d"]);
  assert.strictEqual(entry2.confirmations, 2);
  assert.strictEqual(r2.events[0].type, "rumor.updated");
  assert.strictEqual(r2.events[0].data.delta, 15);

  // 같은 출처로 재확인 (다른 날) -- sources/confirmations는 그대로, confidence만 소폭 갱신
  const r2b = applyEffects(
    [{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 99 }],
    ctxWithData(stateWithKnowledge({ player_1: { rum_a: existing2 } }, { time: { minute: 1450 } }), data)
  );
  const entry2b = r2b.state.knowledge.player_1.rum_a;
  assert.strictEqual(entry2b.confidence, 47, "45 + sameSourceGain(2) = 47 -- Effect의 confidence:99는 재확인에서 쓰이지 않는다");
  assert.deepStrictEqual(entry2b.sources, ["npc_c"], "same source -> sources unchanged");
  assert.strictEqual(entry2b.confirmations, 1, "same source -> confirmations unchanged");
  assert.strictEqual(entry2b.lastSeenDay, 1, "day advanced (minute 1450 -> day 1)");

  // 3. 동일 claim + 아무 변화 없음 -> no-op (data.rules.rumor 자체가 없으면 gain은 안전하게 0)
  const noGainData = { rumors: data.rumors };
  const sameDayEntry = { rumorId: "rum_a", factId: "fact_a", claim: "npc_x", source: "npc_c", sources: ["npc_c"], confidence: 45, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const r3 = applyEffects(
    [{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 10 }],
    ctxWithData(stateWithKnowledge({ player_1: { rum_a: sameDayEntry } }), noGainData)
  );
  assert.strictEqual(r3.events.length, 0, "same source, same day, no configured gain -> pure no-op");
  assert.deepStrictEqual(r3.state.knowledge.player_1.rum_a, sameDayEntry);

  // 4. confidence 변화는 위 2/2b(증가)와 3(무변화)에서 이미 확인됨; 5에서 상충 케이스의 변화도 확인한다

  // 5. 상충 claim (D-14): from-복사로 같은 rumorId에 다른 claim이 들어오는 경우
  const conflictEntry = { rumorId: "rum_a", factId: "fact_a", claim: "npc_x", source: "npc_c", sources: ["npc_c"], confidence: 50, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  // 5a. 들어온 claim의 confidence가 더 높음 -> 전체 항목 교체
  const higherConflict = { rumorId: "rum_a", factId: "fact_a", claim: "npc_z", source: "npc_q", sources: ["npc_q"], confidence: 90, confirmations: 3, firstSeenDay: 0, lastSeenDay: 0 };
  const r5a = applyEffects(
    [{ op: "rumor", rumor: "rum_a", from: "npc_1" }],
    ctxWithData(stateWithKnowledge({ player_1: { rum_a: conflictEntry }, npc_1: { rum_a: higherConflict } }), data)
  );
  const entry5a = r5a.state.knowledge.player_1.rum_a;
  assert.strictEqual(entry5a.claim, "npc_z", "higher-confidence incoming claim (90-10=80 > 50) replaces the entry");
  assert.strictEqual(entry5a.confidence, 80);
  assert.strictEqual(entry5a.confirmations, 1, "a replaced claim starts a fresh belief, not an accumulated one");
  assert.strictEqual(r5a.events[0].type, "rumor.updated");
  assert.strictEqual(r5a.events[0].data.claimChanged, true);
  assert.strictEqual(r5a.events[0].data.delta, 30, "80 - 50");

  // 5b. 들어온 claim의 confidence가 같거나 낮음 -> 기존 claim 유지, no-op
  const lowerConflict = { rumorId: "rum_a", factId: "fact_a", claim: "npc_z", source: "npc_q", sources: ["npc_q"], confidence: 55, confirmations: 1, firstSeenDay: 0, lastSeenDay: 0 };
  const r5b = applyEffects(
    [{ op: "rumor", rumor: "rum_a", from: "npc_1" }],
    ctxWithData(stateWithKnowledge({ player_1: { rum_a: conflictEntry }, npc_1: { rum_a: lowerConflict } }), data)
  );
  assert.deepStrictEqual(r5b.state.knowledge.player_1.rum_a, conflictEntry, "55-10=45 <= 50 -> existing claim wins, no-op");
  assert.strictEqual(r5b.events.length, 0);

  // 6. malformed 입력 -> throw
  const ctx6 = ctxWithData(stateWithKnowledge({}), data);
  assert.throws(() => applyEffects([{ op: "rumor", source: "npc_c", confidence: 1 }], ctx6), TypeError, "missing `rumor`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: 42, source: "npc_c", confidence: 1 }], ctx6), TypeError, "non-string `rumor`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", subject: 42, source: "npc_c", confidence: 1 }], ctx6), TypeError, "non-string `subject`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", from: 42 }], ctx6), TypeError, "non-string `from`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", observe: "yes", source: "s", confidence: 1 }], ctx6), TypeError, "non-boolean `observe`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", source: 42, confidence: 1 }], ctx6), TypeError, "non-string `source`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 1.5 }], ctx6), TypeError, "non-integer `confidence`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", from: "npc_1", observe: true }], ctx6), TypeError, "`from` and `observe` together must throw");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", confidence: 1 }], ctx6), TypeError, "learn mode missing `source`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", source: "npc_c" }], ctx6), TypeError, "learn mode missing `confidence`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", observe: true, confidence: 1 }], ctx6), TypeError, "observe mode missing `source`");
  assert.throws(() => applyEffects([{ op: "rumor", rumor: "rum_a", observe: true, source: "s" }], ctx6), TypeError, "observe mode missing `confidence`");

  // 7. 존재하지 않는 참조 -> skip (D-29), throw 아님
  const r7a = applyEffects([{ op: "rumor", rumor: "does_not_exist", source: "npc_c", confidence: 1 }], ctx6);
  assert.strictEqual(r7a.events.length, 0, "unknown rumor id (learn mode) -> skip");
  assert.deepStrictEqual(r7a.state, ctx6.state);

  const r7b = applyEffects([{ op: "rumor", rumor: "rum_a", from: "npc_1" }], ctxWithData(stateWithKnowledge({}), data));
  assert.strictEqual(r7b.events.length, 0, "from actor has no such knowledge entry -> skip");

  const r7c = applyEffects(
    [{ op: "rumor", rumor: "rum_a", observe: true, source: "obs_a", confidence: 50 }],
    ctxWithData(stateWithKnowledge({}), data) // no state.facts.fact_a
  );
  assert.strictEqual(r7c.events.length, 0, "observe mode with no fact recorded yet -> skip");

  const noTargetCtx = { state: stateWithKnowledge({}), data, actorId: "player_1" };
  const r7d = applyEffects([{ op: "rumor", rumor: "rum_a", from: "target", source: "x" }], noTargetCtx);
  assert.strictEqual(r7d.events.length, 0, "unresolvable `from` (target with no ctx.targetId) -> skip");
  const r7e = applyEffects([{ op: "rumor", rumor: "rum_a", subject: "target", source: "npc_c", confidence: 1 }], noTargetCtx);
  assert.strictEqual(r7e.events.length, 0, "unresolvable `subject` (target with no ctx.targetId) -> skip");

  // 8. visibility
  const r8a = applyEffects([{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 1 }], ctxWithData(stateWithKnowledge({}), data));
  assert.strictEqual(r8a.events[0].visibility, "player", "subject defaults to self (player_1)");
  const r8b = applyEffects(
    [{ op: "rumor", rumor: "rum_a", subject: "target", source: "npc_c", confidence: 1 }],
    ctxWithData(stateWithKnowledge({}), data)
  );
  assert.strictEqual(r8b.events[0].visibility, "internal", "subject:target (npc_1) is not the player");
  assert.strictEqual(r8b.events[0].actorId, "npc_1");

  // 9. event schema: 정확성(isAccurate)이 노출되지 않는지도 함께 확인
  assert.deepStrictEqual(Object.keys(r1.events[0].data).sort(), ["claim", "confidence", "delta", "factId", "rumor"]);
  assert.strictEqual(r1.events[0].data.isAccurate, undefined, "accuracy must never appear in the event (§8.2/§8.4)");

  // 10. 순차 Effect 가시성: 두 번째 Effect가 첫 번째의 결과(새로 생긴 entry)를 즉시 본다
  const r10 = applyEffects(
    [
      { op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 45 },
      { op: "rumor", rumor: "rum_a", source: "npc_d", confidence: 1 }
    ],
    ctxWithData(stateWithKnowledge({}), data)
  );
  assert.strictEqual(r10.state.knowledge.player_1.rum_a.confirmations, 2, "the second Effect must see the first Effect's newly-created entry, not create a separate one");
  assert.strictEqual(r10.events.length, 2);
  assert.strictEqual(r10.events[0].type, "rumor.learned");
  assert.strictEqual(r10.events[1].type, "rumor.updated");

  // 11. 입력 불변성
  const state11 = deepFreeze(stateWithKnowledge({ player_1: { rum_a: existing2 } }));
  const stateBefore11 = snapshot(state11);
  const effects11 = deepFreeze([{ op: "rumor", rumor: "rum_a", source: "npc_d", confidence: 10 }]);
  const effectsBefore11 = snapshot(effects11);
  const ctx11 = deepFreeze(ctxWithData(state11, data));
  const result11 = applyEffects(effects11, ctx11);
  assert.deepStrictEqual(snapshot(state11), stateBefore11, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects11), effectsBefore11, "input effects must be unchanged");
  assert.notStrictEqual(result11.state, ctx11.state);
  assert.strictEqual(result11.state.knowledge.player_1.rum_a.confidence, 60);

  // 12. determinism
  const runRumor = () => applyEffects([{ op: "rumor", rumor: "rum_a", source: "npc_c", confidence: 45 }], ctxWithData(stateWithKnowledge({}), data));
  assert.deepStrictEqual(runRumor(), runRumor(), "same (effects, ctx) must always produce the same result");

  // 13. JSON round-trip
  const result13 = runRumor();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result13.state)), result13.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result13.events)), result13.events);
}

testRumorEffect();

// ============================================================
// V2-Core-10: hp's §9 death trigger (D-34 resolved)
// `startCharacter`/succession remain out of scope (action/step(), engine.js
// untouched) -- no tests for them here.
// ============================================================

function testHpDeathTrigger() {
  function stateWithHp(current, max) {
    return stateWithActors({
      player_1: actorFixture({ hp: { current, max } }),
      npc_1: actorFixture({ id: "npc_1", hp: { current, max } })
    });
  }

  // 1. alive->dead 전이: alive=false, actor.died 발생 (hp.changed와 함께, 순서: hp.changed 먼저)
  const r1 = applyEffects([{ op: "hp", add: -10 }], ctxWith(stateWithHp(10, 10)));
  assert.strictEqual(r1.state.actors.player_1.alive, false);
  assert.deepStrictEqual(r1.events.map((e) => e.type), ["hp.changed", "actor.died"]);
  assert.deepStrictEqual(r1.events[1].data, {});
  assert.strictEqual(r1.events[1].actorId, "player_1");

  // 2. alive 필드가 아예 없는 fixture(actorFixture 기본값)도 정상적으로 죽는다고 처리된다
  assert.strictEqual(stateWithHp(10, 10).actors.player_1.alive, undefined, "fixture has no `alive` field by default");

  // 3. 중복 방지: 이미 죽은 actor에게 다시 적용해도 actor.died가 재발생하지 않는다
  const deadState = stateWithHp(0, 10);
  deadState.actors.player_1.alive = false;
  const r3 = applyEffects([{ op: "hp", add: -5 }], ctxWith(deadState));
  assert.strictEqual(r3.events.length, 0, "already 0 and clamped -> delta 0 -> no hp.changed, no actor.died");

  // 3b. 죽은 상태에서 실제로 hp가 변하는 적용(치유)도 재사망 이벤트 없이 정상 처리된다
  const r3b = applyEffects([{ op: "hp", add: 5 }], ctxWith(deadState));
  assert.strictEqual(r3b.state.actors.player_1.hp.current, 5);
  assert.ok(!r3b.events.some((e) => e.type === "actor.died"), "no revival/re-death logic invented -- just a normal hp.changed");

  // 4. 플레이어 사망 -> pending:newCharacter 설정. NPC 사망은 pending을 건드리지 않는다
  const r4 = applyEffects([{ op: "hp", add: -10 }], ctxWith(stateWithHp(10, 10)));
  assert.deepStrictEqual(r4.state.pending, { kind: "newCharacter" });

  const r4b = applyEffects([{ op: "hp", add: -10, subject: "target" }], ctxWith(stateWithHp(10, 10)));
  assert.strictEqual(r4b.state.actors.npc_1.alive, false);
  assert.strictEqual(r4b.state.pending, undefined, "an NPC's death must not set pending");

  // 5. 사망이 Effect 리스트 처리를 중단시키지 않는다 (D-34): 죽은 actor에게 이어지는 Effect도 정상 적용
  const data = growthDataFixture();
  const r5 = applyEffects(
    [
      { op: "hp", add: -10 },
      { op: "stat", stat: "stat_a", add: 3 },
      { op: "money", add: 5 }
    ],
    ctxWithData(
      stateWithActors({
        player_1: actorFixture({ hp: { current: 10, max: 10 }, growth: {} }),
        npc_1: actorFixture({ id: "npc_1", hp: { current: 10, max: 10 } })
      }),
      data
    )
  );
  assert.strictEqual(r5.state.actors.player_1.alive, false);
  assert.strictEqual(r5.state.actors.player_1.growth.growth_a.stats.stat_a, 3, "a later Effect on the now-dead actor still applies normally");
  assert.strictEqual(r5.state.actors.player_1.money, 10, "actorFixture defaults money to 5, +5 = 10");

  // 6. visibility: 대상이 player면 player, NPC면 internal (D-31, 기존 hp.changed 규칙과 동일)
  assert.strictEqual(r1.events[1].visibility, "player");
  assert.strictEqual(r4b.events[1].visibility, "internal");

  // 7. 입력 불변성
  const state7 = deepFreeze(stateWithHp(10, 10));
  const stateBefore7 = snapshot(state7);
  const effects7 = deepFreeze([{ op: "hp", add: -10 }]);
  const effectsBefore7 = snapshot(effects7);
  const ctx7 = deepFreeze(ctxWith(state7));
  const result7 = applyEffects(effects7, ctx7);
  assert.deepStrictEqual(snapshot(state7), stateBefore7, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects7), effectsBefore7, "input effects must be unchanged");
  assert.notStrictEqual(result7.state, ctx7.state);
  assert.strictEqual(result7.state.actors.player_1.alive, false);

  // 8. determinism
  const runDeath = () => applyEffects([{ op: "hp", add: -10 }], ctxWith(stateWithHp(10, 10)));
  assert.deepStrictEqual(runDeath(), runDeath(), "same (effects, ctx) must always produce the same result");

  // 9. JSON round-trip
  const result9 = runDeath();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result9.state)), result9.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result9.events)), result9.events);
}

testHpDeathTrigger();

// ============================================================
// V2-Core-11: move Effect (D-46 resolved -- §4.2) and check() (D-49
// resolved -- §5). Action/step()-level integration (perform/move actions,
// startCharacter, succession) is tested separately in tests/v2/core.test.js.
// ============================================================

// move
function testMoveEffect() {
  function stateWithLocation(locationId, overrides) {
    return stateWithActors(
      { player_1: actorFixture({ locationId }), npc_1: actorFixture({ id: "npc_1", locationId }) },
      overrides
    );
  }

  // 1. 정상 이동 (subject 기본값 self)
  const r1 = applyEffects([{ op: "move", to: "loc_b" }], ctxWith(stateWithLocation("loc_a")));
  assert.strictEqual(r1.state.actors.player_1.locationId, "loc_b");
  assert.strictEqual(r1.events.length, 1);
  assert.strictEqual(r1.events[0].type, "actor.moved");
  assert.deepStrictEqual(r1.events[0].data, { to: "loc_b" });

  // 2. subject: target
  const r2 = applyEffects([{ op: "move", to: "loc_b", subject: "target" }], ctxWith(stateWithLocation("loc_a")));
  assert.strictEqual(r2.state.actors.npc_1.locationId, "loc_b");
  assert.strictEqual(r2.state.actors.player_1.locationId, "loc_a", "self must be untouched when subject is target");

  // 3. 이미 같은 위치 -> no-op (D-30)
  const r3 = applyEffects([{ op: "move", to: "loc_a" }], ctxWith(stateWithLocation("loc_a")));
  assert.strictEqual(r3.events.length, 0);

  // 4. malformed `to` -> throw
  const ctx4 = ctxWith(stateWithLocation("loc_a"));
  [1, null, true, {}, [], undefined].forEach((bad) => {
    assert.throws(() => applyEffects([{ op: "move", to: bad }], ctx4), TypeError, "move to=" + JSON.stringify(bad));
  });

  // 5. 대상 부재 -> skip (D-29)
  const noTargetCtx = { state: stateWithActors({ player_1: actorFixture({ locationId: "loc_a" }) }), data: {}, actorId: "player_1" };
  const r5 = applyEffects([{ op: "move", to: "loc_b", subject: "target" }], noTargetCtx);
  assert.strictEqual(r5.events.length, 0);
  assert.deepStrictEqual(r5.state, noTargetCtx.state);

  // 6. visibility (D-31, subject 기준 -- skill/trait/unlock과 같은 선례)
  assert.strictEqual(applyEffects([{ op: "move", to: "loc_b" }], ctxWith(stateWithLocation("loc_a"))).events[0].visibility, "player");
  assert.strictEqual(
    applyEffects([{ op: "move", to: "loc_b", subject: "target" }], ctxWith(stateWithLocation("loc_a"))).events[0].visibility,
    "internal"
  );

  // 7. 순차 가시성: 두 번째 이동이 첫 번째의 결과를 즉시 본다
  const r7 = applyEffects([{ op: "move", to: "loc_b" }, { op: "move", to: "loc_c" }], ctxWith(stateWithLocation("loc_a")));
  assert.strictEqual(r7.state.actors.player_1.locationId, "loc_c");
  assert.strictEqual(r7.events.length, 2);

  // 8. 입력 불변성
  const state8 = deepFreeze(stateWithLocation("loc_a"));
  const stateBefore8 = snapshot(state8);
  const effects8 = deepFreeze([{ op: "move", to: "loc_b" }]);
  const effectsBefore8 = snapshot(effects8);
  const ctx8 = deepFreeze(ctxWith(state8));
  const result8 = applyEffects(effects8, ctx8);
  assert.deepStrictEqual(snapshot(state8), stateBefore8, "input state must be unchanged");
  assert.deepStrictEqual(snapshot(effects8), effectsBefore8, "input effects must be unchanged");
  assert.notStrictEqual(result8.state, ctx8.state);

  // 9. determinism
  const runMove = () => applyEffects([{ op: "move", to: "loc_b" }], ctxWith(stateWithLocation("loc_a")));
  assert.deepStrictEqual(runMove(), runMove(), "same (effects, ctx) must always produce the same result");

  // 10. JSON round-trip
  const result10 = runMove();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result10.state)), result10.state);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result10.events)), result10.events);
}

// check()
function checkState(overrides) {
  return {
    schemaVersion: 1,
    worldSeed: "check-test",
    rng: { seed: hashString("check-test"), cursor: 0 },
    time: { minute: 0 },
    actors: { player_1: actorFixture(), npc_1: actorFixture({ id: "npc_1" }) },
    ...overrides
  };
}

function testCheckPurityAndRng() {
  const ctx = { state: checkState(), data: { rules: { check: {} } }, actorId: "player_1" };

  // 1. 결정론: 같은 입력 -> 같은 결과
  const r1a = check({ difficulty: 5 }, ctx);
  const r1b = check({ difficulty: 5 }, ctx);
  assert.deepStrictEqual(r1a, r1b);

  // 2. RNG를 실제로 소비하는지 (2d10 -> rollDie 2회, 직접 계산한 값과 일치해야 한다)
  let expectedRng = ctx.state.rng;
  const dice = [];
  for (let i = 0; i < 2; i += 1) {
    const rolled = rollDie(expectedRng, 10);
    dice.push(rolled.value);
    expectedRng = rolled.rng;
  }
  assert.deepStrictEqual(r1a.result.dice, dice);
  assert.deepStrictEqual(r1a.rng, expectedRng, "check() must return the advanced rng, not mutate ctx.state.rng");
  assert.strictEqual(r1a.result.roll, dice[0] + dice[1]);

  // 3. 순수성: ctx.state를 mutate하지 않는다 (D-27 예외: rng는 반환만 한다)
  const before = snapshot(ctx.state);
  check({ difficulty: 5 }, ctx);
  assert.deepStrictEqual(snapshot(ctx.state), before, "check() must not mutate ctx.state, including rng");

  // 4. modifier가 하나도 없으면 breakdown은 빈 배열 (§5.4, 0-value 생략과 별개로 애초에 적용 대상이 없음)
  assert.deepStrictEqual(r1a.result.modifiers, []);
}

function testCheckTiers() {
  const seed = hashString("tier-test");
  const baseRng = { seed, cursor: 0 };
  let rng = baseRng;
  const dice = [];
  for (let i = 0; i < 2; i += 1) {
    const rolled = rollDie(rng, 10);
    dice.push(rolled.value);
    rng = rolled.rng;
  }
  const roll = dice[0] + dice[1];

  function ctxFor() {
    return { state: checkState({ rng: baseRng, worldSeed: "tier-test" }), data: { rules: { check: {} } }, actorId: "player_1" };
  }

  // 5.3절 기본 tiers: great>=6, success>=0, partial>=-3. roll에서 역산해 정확한 margin 경계를 만든다.
  [
    { margin: 6, tier: "great" },
    { margin: 5, tier: "success" },
    { margin: 0, tier: "success" },
    { margin: -1, tier: "partial" },
    { margin: -3, tier: "partial" },
    { margin: -4, tier: "fail" }
  ].forEach(({ margin, tier }) => {
    const difficulty = roll - margin;
    const { result } = check({ difficulty }, ctxFor());
    assert.strictEqual(result.tier, tier, "margin " + margin + " must be " + tier);
    assert.strictEqual(result.margin, margin);
    assert.strictEqual(result.total, roll, "no modifiers in this fixture -> total === roll");
  });
}

function testCheckDifficultyForms() {
  const ctx = () => ({ state: checkState(), data: { rules: { check: {} } }, actorId: "player_1" });

  // 정수
  assert.strictEqual(check({ difficulty: 12 }, ctx()).result.difficulty, 12);

  // 이름 (기본값, 5.3절 제안값)
  assert.strictEqual(check({ difficulty: "normal" }, ctx()).result.difficulty, 11);
  assert.strictEqual(check({ difficulty: "hard" }, ctx()).result.difficulty, 14);

  // 이름 (데이터가 재정의)
  const namedCtx = { state: checkState(), data: { rules: { check: { difficulties: { hard: 20 } } } }, actorId: "player_1" };
  assert.strictEqual(check({ difficulty: "hard" }, namedCtx).result.difficulty, 20);

  // 존재하지 않는 이름 -> throw
  assert.throws(() => check({ difficulty: "made_up" }, ctx()), TypeError);

  // opposed: base + 상대의 stat/skill modifier 합 (상대는 굴리지 않는다)
  const opposedData = {
    world: { growthSystemId: "growth_a" },
    growthSystems: { growth_a: { skills: [{ id: "skill_b", checkBonusPerRank: 1 }] } },
    rules: { check: {} }
  };
  const opposedState = checkState({
    actors: {
      player_1: actorFixture(),
      npc_1: actorFixture({ id: "npc_1", growth: { growth_a: { stats: { stat_a: 14 }, skills: { skill_b: 3 } } } })
    }
  });
  const opposedCtx = { state: opposedState, data: opposedData, actorId: "player_1", targetId: "npc_1" };
  const { result } = check({ difficulty: { base: 10, opposed: { subject: "target", stat: "stat_a", skill: "skill_b" } } }, opposedCtx);
  assert.strictEqual(result.difficulty, 10 + 2 + 3, "base 10 + stat modifier (14-10)/2=2 + skill modifier 3*1=3");

  // malformed difficulty -> throw
  assert.throws(() => check({}, ctx()), TypeError, "missing difficulty");
  assert.throws(() => check({ difficulty: {} }, ctx()), TypeError, "difficulty object without base/opposed");
  assert.throws(() => check(null, ctx()), TypeError, "spec must be a plain object");
}

function testCheckModifierSourcesAndOrder() {
  const data = {
    world: { growthSystemId: "growth_a" },
    growthSystems: {
      growth_a: {
        skills: [{ id: "skill_a", checkBonusPerRank: 3 }],
        proficiencies: [{ id: "prof_a", checkStep: 50 }],
        traits: [{ id: "trait_a", modifiers: [{ tags: ["combat"], value: 4 }] }]
      }
    },
    items: { item_a: { modifiers: [{ tags: ["combat"], value: 2 }] } },
    rules: { check: {} }
  };
  const state = checkState({
    player: { actorId: "player_1", characterCount: 1 },
    actors: {
      player_1: actorFixture({
        inventory: { item_a: 1 },
        growth: {
          growth_a: {
            stats: { stat_a: 14 }, // (14-10)/2 = 2
            skills: { skill_a: 2 }, // 2*3 = 6
            proficiency: { prof_a: 120 }, // floor(120/50) = 2
            traits: { trait_a: true } // 4
          }
        }
      }),
      npc_1: actorFixture({ id: "npc_1" })
    },
    relations: { "npc_1:player_1": { score: 50, mode: "neutral", lastDay: 0, cooperationCount: 0, conflictCount: 0, tags: [] } } // floor(50/25)=2
  });
  const ctx = { state, data, actorId: "player_1", targetId: "npc_1" };
  const { result } = check(
    {
      stat: "stat_a",
      skill: "skill_a",
      proficiency: "prof_a",
      tags: ["combat"],
      useRelation: true,
      situational: [{ source: "cover", value: 1 }],
      difficulty: 5
    },
    ctx
  );

  const bySource = Object.fromEntries(result.modifiers.map((m) => [m.source, m.value]));
  assert.strictEqual(bySource["stat:stat_a"], 2);
  assert.strictEqual(bySource["skill:skill_a"], 6, "rank 2 * checkBonusPerRank 3");
  assert.strictEqual(bySource["proficiency:prof_a"], 2, "floor(120/50)");
  assert.strictEqual(bySource["item:item_a"], 2);
  assert.strictEqual(bySource["trait:trait_a"], 4);
  assert.strictEqual(bySource.relation, 2, "floor(50/25)");
  assert.strictEqual(bySource.cover, 1);

  // §5.4 고정 순서: stat -> skill -> proficiency -> item -> trait -> relation -> situational
  assert.deepStrictEqual(
    result.modifiers.map((m) => m.source),
    ["stat:stat_a", "skill:skill_a", "proficiency:prof_a", "item:item_a", "trait:trait_a", "relation", "cover"]
  );

  const modifierSum = 2 + 6 + 2 + 2 + 4 + 2 + 1;
  assert.strictEqual(result.total, result.roll + modifierSum);
  assert.strictEqual(result.margin, result.total - 5);
}

function testCheckAttemptsRetryPenalty() {
  const data = { rules: { check: { retryPenalty: 3 } } };

  const withAttempts = { state: checkState({ attempts: { door_1: 2 } }), data, actorId: "player_1" };
  assert.strictEqual(check({ difficulty: 10, attemptKey: "door_1" }, withAttempts).result.difficulty, 10 + 2 * 3);

  const noAttempts = { state: checkState(), data, actorId: "player_1" };
  assert.strictEqual(check({ difficulty: 10, attemptKey: "door_1" }, noAttempts).result.difficulty, 10, "no prior attempts -> 0 penalty");

  // check() itself never mutates state.attempts -- that is step()'s job (F: pure evaluation, not an action)
  const ctxUnchanged = { state: checkState({ attempts: { door_1: 2 } }), data, actorId: "player_1" };
  const before = snapshot(ctxUnchanged.state);
  check({ difficulty: 10, attemptKey: "door_1" }, ctxUnchanged);
  assert.deepStrictEqual(snapshot(ctxUnchanged.state), before);
}

testMoveEffect();
testCheckPurityAndRng();
testCheckTiers();
testCheckDifficultyForms();
testCheckModifierSourcesAndOrder();
testCheckAttemptsRetryPenalty();

console.log("V2-Core-03/04/05/06/07/08/09/10/11 effects.test.js: all checks passed");
