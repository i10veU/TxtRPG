window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const PAIRS = {
    "merchants:rural": {
      a: "merchants",
      b: "rural",
      cooperate: function (state) {
        return state.world.grainSupply < 55;
      },
      conflict: function (state) {
        return state.world.grainSupply > 82 && state.world.rumorPressure > 45;
      },
      cooperateText: "상인회와 농촌 대표단이 곡물 운송 일정을 맞췄다.",
      conflictText: "상인회와 농촌 대표단이 곡물 배분 방식을 두고 충돌했다."
    },
    "guard:workers": {
      a: "guard",
      b: "workers",
      cooperate: function (state) {
        return state.world.security < 55 || state.world.tension > 60;
      },
      conflict: function (state) {
        return state.world.security > 82 && state.world.tension > 70;
      },
      cooperateText: "경비대와 노동자 조합이 주요 시설의 안전 계획을 공동 조정했다.",
      conflictText: "경비대와 노동자 조합이 작업 통제 범위를 두고 마찰을 빚었다."
    },
    "archive:innkeepers": {
      a: "archive",
      b: "innkeepers",
      cooperate: function (state) {
        return state.world.rumorPressure >= 10 && state.world.rumorPressure <= 40;
      },
      conflict: function (state) {
        return state.world.rumorPressure > 70 && state.world.trustInAdministration < 55;
      },
      cooperateText: "기록관과 여관망이 떠도는 이야기를 공식 기록과 대조하기로 했다.",
      conflictText: "기록관과 여관망이 소문을 공개할 범위를 두고 대립했다."
    }
  };

  function relationFor(state, key) {
    return state.world.organizationRelations[key];
  }

  function ensure(state) {
    if (!state.world.organizationRelations || typeof state.world.organizationRelations !== "object") {
      state.world.organizationRelations = {};
    }

    Object.keys(PAIRS).forEach(function (key) {
      const current = relationFor(state, key);
      if (!current || typeof current !== "object") {
        state.world.organizationRelations[key] = {
          score: 0,
          lastDay: -1,
          mode: "neutral",
          lastReason: null,
          cooperationCount: 0,
          conflictCount: 0
        };
      } else {
        current.score = Core.clamp(Number(current.score) || 0, -100, 100);
        current.lastDay = Number.isFinite(Number(current.lastDay)) ? Number(current.lastDay) : -1;
        current.mode = ["cooperation", "conflict", "neutral"].includes(current.mode) ? current.mode : "neutral";
        current.cooperationCount = Math.max(0, Number(current.cooperationCount) || 0);
        current.conflictCount = Math.max(0, Number(current.conflictCount) || 0);
      }
    });
  }

  function adjustPressure(state, orgId, delta) {
    const org = state.world.organizations && state.world.organizations[orgId];
    if (!org) return;
    org.goalPressure = Core.clamp((Number(org.goalPressure) || 0) + delta, -2, 2);
  }

  function reviewMembers(state, orgId, minute, events) {
    if (!Core.reviewNPCGoal || !state.npcs) return;
    Object.keys(state.npcs).forEach(function (id) {
      if (state.npcs[id].faction !== orgId) return;
      const event = Core.reviewNPCGoal(state, id, minute);
      if (event) events.push(event);
    });
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    const events = [];

    Object.keys(PAIRS).forEach(function (key) {
      const record = relationFor(state, key);
      if (record.lastDay === day) return;

      const pair = PAIRS[key];
      const cooperation = pair.cooperate(state);
      const conflict = !cooperation && pair.conflict(state);

      if (cooperation) {
        record.score = Core.clamp(record.score + 5, -100, 100);
        record.mode = "cooperation";
        record.lastReason = "현재 세계 상태에서 공동 이익이 커졌다.";
        record.cooperationCount += 1;
        adjustPressure(state, pair.a, 1);
        adjustPressure(state, pair.b, 1);
        state.world.trustInAdministration = Core.clamp(state.world.trustInAdministration + (key === "archive:innkeepers" ? 1 : 0), 0, 100);
        events.push(pair.cooperateText);
      } else if (conflict) {
        record.score = Core.clamp(record.score - 8, -100, 100);
        record.mode = "conflict";
        record.lastReason = "현재 세계 상태에서 조직 목표가 충돌했다.";
        record.conflictCount += 1;
        adjustPressure(state, pair.a, -1);
        adjustPressure(state, pair.b, -1);
        state.world.tension = Core.clamp(state.world.tension + 1, 0, 100);
        if (Core.recordEventSignal) {
          Core.recordEventSignal(state, "organizationConflict:" + key, pair.a + "+" + pair.b, absoluteMinute, pair.conflictText);
        }
        state.world.flags.factionConflict = true;
        if (Data && Data.ensureCases) Data.ensureCases(state);
        events.push(pair.conflictText);
      } else {
        record.score = Core.clamp(record.score + (record.score > 0 ? 1 : record.score < 0 ? -1 : 0), -100, 100);
        record.mode = "neutral";
        record.lastReason = "조직 간 이해가 크게 충돌하지 않았다.";
      }

      record.lastDay = day;

      if (cooperation || conflict) {
        reviewMembers(state, pair.a, absoluteMinute, events);
        reviewMembers(state, pair.b, absoluteMinute, events);
      }
    });

    state.world.organizationRelationDay = day;
    if (Data && Data.ensureCases) Data.ensureCases(state);
    return events;
  }

  Core.ensureOrganizationRelations = ensure;
  Core.simulateOrganizationRelations = simulate;
  Core.organizationRelationDefinitions = PAIRS;
})(AnonymousRPG.Core, AnonymousRPG.Data);
