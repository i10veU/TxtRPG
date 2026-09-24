window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};
AnonymousRPG.Data = AnonymousRPG.Data || {};

(function (Core, Data) {
  function ensure(state) {
    const world = state.world;
    world.caseHistory = Array.isArray(world.caseHistory) ? world.caseHistory : [];
    world.caseCausalityDay = Number.isFinite(Number(world.caseCausalityDay)) ? Number(world.caseCausalityDay) : -1;
  }

  function hasHistory(state, caseId, choiceId) {
    ensure(state);
    return state.world.caseHistory.some(function (entry) {
      return entry.caseId === caseId && (!choiceId || entry.choiceId === choiceId);
    });
  }

  function lastHistory(state, caseId) {
    ensure(state);
    for (let i = state.world.caseHistory.length - 1; i >= 0; i -= 1) {
      if (state.world.caseHistory[i].caseId === caseId) return state.world.caseHistory[i];
    }
    return null;
  }

  function recordResolution(state, caseId, choiceId, result) {
    ensure(state);
    const entry = state.world.cases.find(function (item) { return item.id === caseId; });
    if (!entry || !["resolved", "failed"].includes(entry.status)) return;
    const already = state.world.caseHistory.some(function (item) {
      return item.caseId === caseId && item.resolutionDay === state.world.day && item.choiceId === (entry.branch || choiceId);
    });
    if (already) return;
    state.world.caseHistory.push({
      caseId: caseId,
      choiceId: entry.branch || choiceId || null,
      status: entry.status,
      resolutionDay: state.world.day,
      resolutionMinute: Core.getAbsoluteMinute(state),
      outcome: typeof result === "string" ? result.slice(0, 180) : null
    });
    if (state.world.caseHistory.length > 40) state.world.caseHistory.shift();
  }

  function addSignal(state, signal) {
    if (typeof Core.recordEventSignal === "function") {
      Core.recordEventSignal(state, signal, "case-causality", Core.getAbsoluteMinute(state), "이전 사건의 결과가 새로운 문제로 이어졌다.");
      return;
    }
    state.world.eventSignals = state.world.eventSignals || {};
    state.world.eventSignals[signal] = (Number(state.world.eventSignals[signal]) || 0) + 1;
  }

  function applyGoalPressure(state, changes) {
    if (typeof Core.ensureOrganizations === "function") Core.ensureOrganizations(state);
    const minute = Core.getAbsoluteMinute(state);
    Object.keys(changes).forEach(function (organizationId) {
      const organization = state.world.organizations && state.world.organizations[organizationId];
      if (!organization) return;
      organization.goalPressure = Core.clamp((Number(organization.goalPressure) || 0) + Number(changes[organizationId]), -2, 2);
      if (typeof Core.reviewNPCGoal !== "function") return;
      Object.keys(state.npcs || {}).forEach(function (npcId) {
        if (state.npcs[npcId].faction === organizationId) Core.reviewNPCGoal(state, npcId, minute);
      });
    });
  }

  function installFollowupCases() {
    Data.caseDefinitions = Data.caseDefinitions || {};

    if (!Data.caseDefinitions["grain-aftershock"]) {
      Data.caseDefinitions["grain-aftershock"] = {
        title: "창고 장부의 후폭풍",
        summary: "지난 곡물 사건의 처리 방식이 시장과 기록관 사이에 새로운 문제를 만들었다.",
        trigger: function (state) {
          const history = lastHistory(state, "grain-warehouse");
          return Boolean(history && state.world.day >= history.resolutionDay + 1);
        },
        choices: [
          { id: "publish", label: "재고 차이를 공개 기록으로 남긴다", risk: 2, run: function (state) {
            state.world.trustInAdministration = Core.clamp(Number(state.world.trustInAdministration || 0) + 3, 0, 100);
            Core.adjustRelation(state, "archive", 3);
            Core.adjustRelation(state, "merchants", -2);
            state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) + 1, 0, 100);
            return "이전 사건의 재고 차이를 공개 기록으로 남겼다. 기록관은 신뢰했지만 상인회는 감시를 경계했다.";
          } },
          { id: "settle", label: "상인회와 손실을 조정한다", risk: 3, run: function (state) {
            state.player.money += 4;
            state.world.grainSupply = Core.clamp(Number(state.world.grainSupply || 0) + 2, 0, 100);
            Core.adjustRelation(state, "merchants", 3);
            Core.adjustRelation(state, "archive", -1);
            return "상인회와 손실을 조정했다. 시장은 빠르게 안정됐지만 기록관에는 설명되지 않은 빈틈이 남았다.";
          } },
          { id: "trace", label: "재고가 사라진 경로를 다시 추적한다", risk: 4, run: function (state) {
            state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) + 2, 0, 100);
            Core.adjustRelation(state, "guard", 1);
            state.world.discovered = Array.isArray(state.world.discovered) ? state.world.discovered : [];
            if (!state.world.discovered.includes("grainLedgerTrail")) state.world.discovered.push("grainLedgerTrail");
            addSignal(state, "grainLedgerTrail");
            return "창고와 시장 사이의 장부를 다시 추적했다. 재고 차이가 한 번의 사건이 아니었을 가능성이 드러났다.";
          } }
        ]
      };
    }

    if (!Data.caseDefinitions["trade-route-aftershock"]) {
      Data.caseDefinitions["trade-route-aftershock"] = {
        title: "대체 공급선의 대가",
        summary: "교역로 위기를 넘긴 뒤 임시 공급망이 새로운 이해관계를 만들었다.",
        trigger: function (state) {
          const history = lastHistory(state, "trade-route");
          return Boolean(history && state.world.day >= history.resolutionDay + 1);
        },
        choices: [
          { id: "audit", label: "대체 공급 계약을 조사한다", risk: 2, run: function (state) {
            state.world.trustInAdministration = Core.clamp(Number(state.world.trustInAdministration || 0) + 2, 0, 100);
            Core.adjustRelation(state, "archive", 2);
            Core.adjustRelation(state, "merchants", -1);
            applyGoalPressure(state, { archive: 1, merchants: -1 });
            return "대체 공급 계약을 조사했다. 계약의 조건은 투명해졌지만 상인회와의 협상이 느려졌다.";
          } },
          { id: "renew", label: "임시 공급선을 장기 계약으로 전환한다", risk: 3, run: function (state) {
            Object.keys(state.world.regionalEconomy.routes || {}).forEach(function (key) {
              const route = state.world.regionalEconomy.routes[key];
              route.reliability = Core.clamp(Number(route.reliability || 0) + 8, 0, 100);
            });
            Core.adjustRelation(state, "merchants", 2);
            Core.adjustRelation(state, "workers", 1);
            applyGoalPressure(state, { merchants: 1, workers: 1 });
            return "임시 공급선을 장기 계약으로 전환했다. 운송은 안정됐지만 기존 교역상들의 불만이 남았다.";
          } },
          { id: "local", label: "지역 생산자에게 직접 구매한다", risk: 4, run: function (state) {
            state.player.money = Math.max(0, state.player.money - 3);
            state.world.regionalEconomy.market.wood = Core.clamp(Number(state.world.regionalEconomy.market.wood || 0) + 5, 0, 100);
            state.world.regionalEconomy.market.fish = Core.clamp(Number(state.world.regionalEconomy.market.fish || 0) + 5, 0, 100);
            Core.adjustRelation(state, "rural", 2);
            Core.adjustRelation(state, "workers", 2);
            applyGoalPressure(state, { rural: 1, workers: 1 });
            return "지역 생산자와 직접 거래했다. 시장 재고가 회복되고 생산자 쪽 신뢰가 높아졌다.";
          } }
        ]
      };
    }

    if (!Data.caseDefinitions["faction-aftershock"]) {
      Data.caseDefinitions["faction-aftershock"] = {
        title: "깨진 합의의 잔여물",
        summary: "세력 충돌을 봉합한 뒤에도 조직 사이에 남은 약속이 문제를 일으킨다.",
        trigger: function (state) {
          const history = lastHistory(state, "faction-conflict");
          return Boolean(history && state.world.day >= history.resolutionDay + 1);
        },
        choices: [
          { id: "council", label: "합의 내용을 다시 공개한다", risk: 2, run: function (state) {
            state.world.tension = Math.max(0, Number(state.world.tension || 0) - 4);
            Object.keys(state.world.organizationRelations || {}).forEach(function (key) {
              const relation = state.world.organizationRelations[key];
              relation.score = Core.clamp((Number(relation.score) || 0) + 3, -100, 100);
            });
            return "지난 합의의 조건을 다시 공개했다. 일부 불만은 남았지만 조직 간 오해가 줄었다.";
          } },
          { id: "enforce", label: "경비대에 합의 이행을 맡긴다", risk: 3, run: function (state) {
            state.world.security = Core.clamp(Number(state.world.security || 0) + 3, 0, 100);
            state.world.tension = Core.clamp(Number(state.world.tension || 0) + 2, 0, 100);
            Core.adjustRelation(state, "guard", 3);
            Core.adjustRelation(state, "workers", -2);
            return "경비대가 합의 이행을 감시하기 시작했다. 질서는 회복됐지만 노동자 조합은 압박으로 받아들였다.";
          } },
          { id: "withdraw", label: "당분간 모든 세력에서 거리를 둔다", risk: 1, run: function (state) {
            state.world.rumorPressure = Math.max(0, Number(state.world.rumorPressure || 0) - 2);
            state.world.tension = Math.max(0, Number(state.world.tension || 0) - 1);
            return "직접적인 개입을 멈췄다. 단기적인 긴장은 줄었지만 문제를 해결할 영향력도 약해졌다.";
          } }
        ]
      };
    }
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    if (state.world.caseCausalityDay === day) return null;
    state.world.caseCausalityDay = day;
    Data.ensureCases(state);
    const open = state.world.cases.filter(function (entry) {
      return entry.status === "open" && ["grain-aftershock", "trade-route-aftershock", "faction-aftershock"].includes(entry.id);
    });
    if (!open.length) return null;
    return "이전 사건의 결과가 새로운 문제로 이어졌다. 후속 사건을 확인할 수 있다.";
  }

  function chainCommand(state, text) {
    if (!/^(?:연쇄사건|사건연쇄|인과관계)$/.test(text.trim())) return null;
    ensure(state);
    const history = state.world.caseHistory.slice(-8).reverse();
    if (!history.length) return { narrative: "아직 해결된 사건의 인과 기록이 없다.", action: text, changed: false };
    const lines = history.map(function (entry) {
      const status = entry.status === "resolved" ? "해결" : "실패";
      return status + " · " + entry.caseId + " → " + (entry.choiceId || "-") + " · D" + (entry.resolutionDay + 1);
    });
    return { narrative: lines.join(" / "), action: text, changed: false };
  }

  installFollowupCases();
  const originalResolveCase = Data.resolveCase;
  if (typeof originalResolveCase === "function" && !Data.resolveCase._causalityWrapped) {
    const wrapped = function (state, caseId, choiceId) {
      const result = originalResolveCase(state, caseId, choiceId);
      recordResolution(state, caseId, choiceId, result && result.narrative ? result.narrative : result);
      return result;
    };
    wrapped._causalityWrapped = true;
    Data.resolveCase = wrapped;
  }

  const originalResolveAction = Core.resolveAction;
  if (typeof originalResolveAction === "function" && !Core.resolveAction._causalityWrapped) {
    const wrappedAction = function (state, text) {
      const command = chainCommand(state, text);
      if (command) return command;
      return originalResolveAction(state, text);
    };
    wrappedAction._causalityWrapped = true;
    Core.resolveAction = wrappedAction;
  }

  Core.ensureCaseCausality = ensure;
  Core.simulateCaseCausality = simulate;
  Core.caseCausalityCommand = chainCommand;
})(AnonymousRPG.Core, AnonymousRPG.Data);
