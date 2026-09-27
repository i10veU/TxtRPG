// V2-Core-03 tests for the Effect applier
// (docs/v2/architecture/CORE_CONTRACTS.md §4, D-26~D-40).
// `.test.js`, not `.spec.js`: tests/v2/run.js excludes `*.spec.js`.
// node:assert/strict only, no test framework, per §13.1.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEffects } from "../../web/v2/core/rules.js";

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
  assert.strictEqual(r16.state.actors.player_1.alive, undefined, "no death trigger in this scope (§9)");
  assert.ok(!r16.events.some((e) => e.type === "actor.died"), "no actor.died event in this scope");
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
// exp/proficiency are NOT implemented (D-41, D-42 blockers) --
// no tests for them.
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

console.log("V2-Core-03/04/05 effects.test.js: all checks passed");
