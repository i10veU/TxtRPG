window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const ORGANIZATIONS = {
    merchants: {
      name: "상인회",
      decide: function (state) {
        if (state.world.grainSupply < 45) {
          state.world.economy.stock.grain = Core.clamp(state.world.economy.stock.grain + 2, 0, 100);
          state.world.rumorPressure = Core.clamp(state.world.rumorPressure + 1, 0, 100);
          return "상인회가 부족한 곡물의 유통을 우선하기로 결정했다.";
        }
        if (state.world.economy.stock.grain > 30) {
          state.world.relations.merchants = Core.clamp(state.world.relations.merchants + 1, -100, 100);
          return "상인회가 시장 재고를 안정적으로 유지하기로 결정했다.";
        }
        return "상인회는 현재 거래 질서를 유지하기로 했다.";
      },
      pressure: function (state) {
        if (state.world.grainSupply < 35) return 2;
        if (state.world.grainSupply > 85 && state.world.tension > 65) return -2;
        if (state.world.grainSupply < 55) return 1;
        return 0;
      }
    },
    guard: {
      name: "경비대",
      decide: function (state) {
        if (state.world.tension > 60 || state.world.security < 50) {
          state.world.security = Core.clamp(state.world.security + 2, 0, 100);
          return "경비대가 순찰 인원을 늘렸다.";
        }
        if (state.world.security > 75 && state.world.tension < 40) {
          state.world.security = Core.clamp(state.world.security - 1, 0, 100);
          return "경비대가 일상 순찰 수준으로 복귀했다.";
        }
        return "경비대는 현재 순찰 계획을 유지했다.";
      },
      pressure: function (state) {
        if (state.world.security < 35 && state.world.tension > 75) return -2;
        if (state.world.security < 50 || state.world.tension > 60) return 2;
        if (state.world.security > 85 && state.world.tension < 30) return -1;
        return 0;
      }
    },
    archive: {
      name: "기록관",
      decide: function (state) {
        if (state.world.trustInAdministration < 50) {
          state.world.trustInAdministration = Core.clamp(state.world.trustInAdministration + 2, 0, 100);
          return "기록관이 행정 기록 검수에 인력을 추가했다.";
        }
        if (state.world.rumorPressure > 10) {
          state.world.trustInAdministration = Core.clamp(state.world.trustInAdministration + 1, 0, 100);
          return "기록관이 소문과 공식 기록의 차이를 대조하기 시작했다.";
        }
        return "기록관은 예정된 문서 정리를 계속했다.";
      },
      pressure: function (state) {
        if (state.world.trustInAdministration < 35 && state.world.rumorPressure > 75) return -2;
        if (state.world.trustInAdministration < 50 || state.world.rumorPressure > 10) return 2;
        return 0;
      }
    },
    rural: {
      name: "농촌 대표단",
      decide: function (state) {
        if (state.world.grainSupply < 55) {
          state.world.grainSupply = Core.clamp(state.world.grainSupply + 2, 0, 100);
          return "농촌 대표단이 도시로 보내는 곡물 운송을 우선하기로 했다.";
        }
        if (state.world.grainSupply > 75) {
          state.world.rumorPressure = Core.clamp(state.world.rumorPressure - 1, 0, 100);
          return "농촌 대표단이 비축 물량을 늘리기로 했다.";
        }
        return "농촌 대표단은 평상시 운송 계획을 유지했다.";
      },
      pressure: function (state) {
        if (state.world.grainSupply < 30 && state.world.security < 35) return -2;
        if (state.world.grainSupply < 55) return 2;
        if (state.world.grainSupply > 88) return -1;
        return 0;
      }
    },
    innkeepers: {
      name: "여관망",
      decide: function (state) {
        if (state.world.rumorPressure > 10) {
          state.world.rumorPressure = Core.clamp(state.world.rumorPressure - 1, 0, 100);
          return "여관망이 퍼진 소문의 진위를 서로 대조하기 시작했다.";
        }
        if (state.world.tension > 65) {
          state.world.rumorPressure = Core.clamp(state.world.rumorPressure + 1, 0, 100);
          return "여관망을 통해 도시의 긴장에 관한 이야기가 퍼졌다.";
        }
        return "여관망은 평상시 손님 정보를 교환했다.";
      },
      pressure: function (state) {
        if (state.world.rumorPressure > 70) return -2;
        if (state.world.rumorPressure > 15 || state.world.tension > 55) return 2;
        return 1;
      }
    },
    workers: {
      name: "노동자 조합",
      decide: function (state) {
        if (state.world.security < 55) {
          state.world.security = Core.clamp(state.world.security + 1, 0, 100);
          return "노동자 조합이 주요 시설의 임시 보수를 우선하기로 했다.";
        }
        if (state.world.tension > 70) {
          state.world.tension = Core.clamp(state.world.tension - 1, 0, 100);
          return "노동자 조합이 현장의 충돌을 줄이기 위해 작업 배치를 조정했다.";
        }
        return "노동자 조합은 예정된 작업을 계속했다.";
      },
      pressure: function (state) {
        if (state.world.security < 30) return -2;
        if (state.world.security < 55 || state.world.tension > 70) return 2;
        return 0;
      }
    }
  };

  function ensure(state) {
    if (!state.world.organizations || typeof state.world.organizations !== "object") {
      state.world.organizations = {};
    }

    Object.keys(ORGANIZATIONS).forEach(function (id) {
      const current = state.world.organizations[id];
      if (!current || typeof current !== "object") {
        state.world.organizations[id] = {
          name: ORGANIZATIONS[id].name,
          lastDecisionDay: -1,
          lastAction: null,
          decisionCount: 0,
          goalPressure: 0
        };
      } else {
        current.name = current.name || ORGANIZATIONS[id].name;
        current.lastDecisionDay = Number.isFinite(Number(current.lastDecisionDay)) ? Number(current.lastDecisionDay) : -1;
        current.decisionCount = Math.max(0, Number(current.decisionCount) || 0);
        current.goalPressure = Core.clamp(Number(current.goalPressure) || 0, -2, 2);
      }
    });
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    const events = [];

    Object.keys(ORGANIZATIONS).forEach(function (id) {
      const record = state.world.organizations[id];
      if (record.lastDecisionDay === day) return;

      const action = ORGANIZATIONS[id].decide(state);
      record.lastDecisionDay = day;
      record.lastAction = action;
      record.decisionCount += 1;
      record.goalPressure = ORGANIZATIONS[id].pressure(state);
      events.push(ORGANIZATIONS[id].name + ": " + action);

      if (Core.reviewNPCGoal && state.npcs) {
        Object.keys(state.npcs).forEach(function (npcId) {
          if (state.npcs[npcId].faction !== id) return;
          const goalEvent = Core.reviewNPCGoal(state, npcId, Number(absoluteMinute));
          if (goalEvent) events.push(goalEvent);
        });
      }
    });

    return events;
  }

  Core.ensureOrganizations = ensure;
  Core.simulateOrganizations = simulate;
  Core.organizationDefinitions = ORGANIZATIONS;
})(AnonymousRPG.Core);
