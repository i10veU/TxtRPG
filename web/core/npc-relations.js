window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  const EDGES = {
    "mara:orel": {
      a: "mara", b: "orel",
      cooperation: function (state) { return state.world.security < 55 || state.world.economy.stock.grain < 10; },
      conflict: function (state) { return state.world.tension > 65 && state.world.grainSupply > 70; },
      cooperateText: "마라와 오렐이 시장과 시설 수리를 함께 조정했다.",
      conflictText: "마라와 오렐이 시장 물자 배분을 두고 의견이 엇갈렸다."
    },
    "jonas:darma": {
      a: "jonas", b: "darma",
      cooperation: function (state) { return state.world.grainSupply < 60; },
      conflict: function (state) { return state.world.grainSupply < 35 && state.world.security > 70; },
      cooperateText: "요나스와 다르마가 부두와 농촌 사이의 운송 일정을 맞췄다.",
      conflictText: "요나스와 다르마가 부족한 물자의 우선 운송지를 두고 다퉜다."
    },
    "serin:marta": {
      a: "serin", b: "marta",
      cooperation: function (state) { return state.world.rumorPressure >= 8 && state.world.trustInAdministration >= 50; },
      conflict: function (state) { return state.world.rumorPressure > 65 && state.world.trustInAdministration < 55; },
      cooperateText: "세린과 마르타가 소문을 기록과 대조하기 시작했다.",
      conflictText: "세린과 마르타가 소문의 공개 범위를 두고 충돌했다."
    },
    "ibrahim:orel": {
      a: "ibrahim", b: "orel",
      cooperation: function (state) { return state.world.security < 60; },
      conflict: function (state) { return state.world.security > 80 && state.world.tension > 65; },
      cooperateText: "이브라힘과 오렐이 시설 보수와 순찰 동선을 함께 조정했다.",
      conflictText: "이브라힘과 오렐이 시설 출입 통제를 두고 마찰을 빚었다."
    },
    "mara:serin": {
      a: "mara", b: "serin",
      cooperation: function (state) { return state.world.trustInAdministration >= 70 && state.world.grainSupply < 60; },
      conflict: function (state) { return state.world.trustInAdministration < 45 && state.world.rumorPressure > 40; },
      cooperateText: "마라와 세린이 곡물 장부를 함께 대조했다.",
      conflictText: "마라와 세린이 시장 장부 공개 범위를 두고 대립했다."
    }
  };

  function ensure(state) {
    if (!state.world.npcRelations || typeof state.world.npcRelations !== "object") {
      state.world.npcRelations = {};
    }

    Object.keys(EDGES).forEach(function (key) {
      const current = state.world.npcRelations[key];
      if (!current || typeof current !== "object") {
        state.world.npcRelations[key] = {
          score: 0,
          mode: "neutral",
          lastDay: -1,
          cooperationCount: 0,
          conflictCount: 0,
          lastReason: null
        };
      } else {
        current.score = Core.clamp(Number(current.score) || 0, -100, 100);
        current.lastDay = Number.isFinite(Number(current.lastDay)) ? Number(current.lastDay) : -1;
        current.mode = ["cooperation", "conflict", "neutral"].includes(current.mode) ? current.mode : "neutral";
        current.cooperationCount = Math.max(0, Number(current.cooperationCount) || 0);
        current.conflictCount = Math.max(0, Number(current.conflictCount) || 0);
      }
    });

    if (!Number.isFinite(Number(state.world.npcRelationDay))) state.world.npcRelationDay = -1;
  }

  function npc(state, id) {
    return state.npcs && state.npcs[id];
  }

  function adjustGoalPressure(state, npcId, delta) {
    const character = npc(state, npcId);
    if (!character || !character.faction || !state.world.organizations) return;
    const organization = state.world.organizations[character.faction];
    if (!organization) return;
    organization.goalPressure = Core.clamp((Number(organization.goalPressure) || 0) + delta, -2, 2);
  }

  function reviewGoal(state, npcId, minute, events) {
    if (!Core.reviewNPCGoal) return;
    const event = Core.reviewNPCGoal(state, npcId, minute);
    if (event) events.push(event);
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    if (state.world.npcRelationDay === day) return [];

    const events = [];

    Object.keys(EDGES).forEach(function (key) {
      const edge = EDGES[key];
      const relation = state.world.npcRelations[key];
      if (relation.lastDay === day) return;

      const a = npc(state, edge.a);
      const b = npc(state, edge.b);
      if (!a || !b) {
        relation.lastDay = day;
        return;
      }

      const cooperation = edge.cooperation(state);
      const conflict = !cooperation && edge.conflict(state);

      if (cooperation) {
        relation.score = Core.clamp(relation.score + 5, -100, 100);
        relation.mode = "cooperation";
        relation.cooperationCount += 1;
        relation.lastReason = "공동 행동의 이익이 커졌다.";
        adjustGoalPressure(state, edge.a, 1);
        adjustGoalPressure(state, edge.b, 1);
        reviewGoal(state, edge.a, absoluteMinute, events);
        reviewGoal(state, edge.b, absoluteMinute, events);
        events.push(edge.cooperateText);
      } else if (conflict) {
        relation.score = Core.clamp(relation.score - 7, -100, 100);
        relation.mode = "conflict";
        relation.conflictCount += 1;
        relation.lastReason = "개인 목표의 우선순위가 충돌했다.";
        adjustGoalPressure(state, edge.a, -1);
        adjustGoalPressure(state, edge.b, -1);
        state.world.tension = Core.clamp(Number(state.world.tension || 0) + 1, 0, 100);
        state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) + 1, 0, 100);

        if (Core.recordEventSignal) {
          Core.recordEventSignal(state, "npcConflict:" + key, a.name + "+" + b.name, absoluteMinute, edge.conflictText);
        }

        events.push(edge.conflictText);
        reviewGoal(state, edge.a, absoluteMinute, events);
        reviewGoal(state, edge.b, absoluteMinute, events);
      } else {
        relation.mode = "neutral";
        relation.lastReason = "두 인물의 이해가 크게 충돌하지 않았다.";
        if (relation.score > 0) relation.score = Core.clamp(relation.score + 1, -100, 100);
        if (relation.score < 0) relation.score = Core.clamp(relation.score - 1, -100, 100);
      }

      relation.lastDay = day;
    });

    state.world.npcRelationDay = day;
    if (Data && Data.ensureCases) Data.ensureCases(state);
    return events;
  }

  Core.ensureNPCRelations = ensure;
  Core.simulateNPCRelations = simulate;
  Core.npcRelationDefinitions = EDGES;
})(AnonymousRPG.Core, AnonymousRPG.Data);
