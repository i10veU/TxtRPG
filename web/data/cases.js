window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Data = AnonymousRPG.Data || {};

(function (Data, Core) {
  function pushUnique(list, value) { if (!list.includes(value)) list.push(value); }

  function adjustOrganizationPair(state, key, delta) {
    const relation = state.world.organizationRelations && state.world.organizationRelations[key];
    if (!relation) return;
    relation.score = Core.clamp((Number(relation.score) || 0) + delta, -100, 100);
    relation.mode = delta > 0 ? "cooperation" : delta < 0 ? "conflict" : relation.mode;
    relation.lastReason = "플레이어가 사건에 개입했다.";
  }

  function adjustOrganizationPressure(state, ids, delta) {
    ids.forEach(function (id) {
      const org = state.world.organizations && state.world.organizations[id];
      if (org) org.goalPressure = Core.clamp((Number(org.goalPressure) || 0) + delta, -2, 2);
    });
  }

  Data.caseDefinitions = {
    "grain-warehouse": {
      title: "닫힌 창고의 곡물", summary: "곡물 부족과 함께 일부 창고의 출입이 비정상적으로 줄었다.",
      trigger: function (state) { return Boolean(state.world.flags.warehouseSuspicion || Core.hasEventSignal(state, "warehouseSuspicion")); },
      choices: [
        { id: "audit", label: "공식 장부 대조", risk: 1, run: function (state) { state.world.trustInAdministration += 3; state.world.grainSupply += 4; Core.adjustRelation(state, "archive", 2); Core.adjustRelation(state, "merchants", -1); return "공식 기록을 대조한 결과 일부 재고 차이가 확인됐다. 기록관은 협조적이었지만 일부 상인은 불편해했다."; } },
        { id: "negotiate", label: "상인과 비공식 협상", risk: 2, run: function (state) { state.player.money += 5; state.world.grainSupply += 2; Core.adjustRelation(state, "merchants", 3); Core.adjustRelation(state, "archive", -2); return "상인들과 직접 조건을 맞췄다. 당장의 공급은 안정됐지만 공식 기록에는 빈틈이 남았다."; } },
        { id: "force", label: "창고를 강제로 확인", risk: 4, run: function (state) { state.world.security -= 5; state.world.tension += 5; Core.adjustRelation(state, "guard", -3); Core.adjustRelation(state, "merchants", -4); return "강제로 문을 열었다. 숨겨진 물량 일부는 확인했지만 상인과 경비대 모두 경계하기 시작했다."; } }
      ]
    },
    "night-cargo": {
      title: "시간표 밖의 배", summary: "예정표에 없는 선박의 움직임이 야간 부두에서 포착됐다.",
      trigger: function (state) { return Boolean(state.world.flags.nightCargo || Core.hasEventSignal(state, "nightCargo")); },
      choices: [
        { id: "report", label: "경비대에 보고", risk: 1, run: function (state) { state.world.security += 3; state.world.trustInAdministration += 2; Core.adjustRelation(state, "guard", 3); Core.adjustRelation(state, "workers", 1); return "목격 내용을 경비대에 전달했다. 정식 조사 기록이 남았고 부두 경비대가 당신을 신뢰하기 시작했다."; } },
        { id: "follow", label: "배의 행선지를 추적", risk: 3, run: function (state) { state.world.rumorPressure += 1; pushUnique(state.world.discovered, "cargoRoute"); Core.adjustRelation(state, "workers", 2); Core.adjustRelation(state, "guard", -1); return "부두 밖까지 흔적을 따라갔다. 북쪽 운송로와 연결된 정황을 얻었지만 경비대는 독단적인 행동을 경계했다."; } },
        { id: "ignore", label: "모른 척 지나가기", risk: 0, run: function (state) { state.world.tension = Math.max(0, state.world.tension - 1); Core.adjustRelation(state, "guard", -1); return "당장은 아무 일도 하지 않았다. 움직임은 기록되지 않았고 경비대는 당신의 침묵을 알아차렸다."; } }
      ]
    },
    "land-record": {
      title: "서로 다른 토지 기록", summary: "같은 토지 번호가 서로 다른 소유자와 날짜로 기록되어 있다.",
      trigger: function (state) { return Boolean(state.world.flags.recordInconsistency || Core.hasEventSignal(state, "recordInconsistency")); },
      choices: [
        { id: "archive", label: "기록관에 정식 보존 요청", risk: 1, run: function (state) { state.world.trustInAdministration += 4; Core.adjustRelation(state, "archive", 4); return "기록 사본을 보존하도록 요청했다. 기록관은 당신을 신뢰할 만한 조사자로 보기 시작했다."; } },
        { id: "owner", label: "현재 소유자에게 직접 확인", risk: 2, run: function (state) { state.player.money += 2; pushUnique(state.world.discovered, "landWitness"); Core.adjustRelation(state, "rural", 3); Core.adjustRelation(state, "archive", 1); return "현 소유자에게서 오래된 거래 증언을 들었다. 농촌 쪽 증언망이 열렸지만 기록관의 확인도 필요해졌다."; } },
        { id: "alter", label: "기록의 일부를 몰래 수정", risk: 5, run: function (state) { state.world.trustInAdministration -= 6; state.world.tension += 2; Core.adjustRelation(state, "archive", -6); Core.adjustRelation(state, "merchants", 1); return "기록 일부를 건드렸다. 당장은 문제가 없지만 기록관의 신뢰가 크게 떨어졌다."; } }
      ]
    },
    "faction-conflict": {
      title: "갈라진 도시의 이해관계", summary: "서로 다른 세력이 같은 문제를 두고 공개적으로 충돌하기 시작했다.",
      trigger: function (state) {
        const signals = state.world.eventSignals || {};
        const organizationConflict = Object.keys(signals).some(function (key) { return key.indexOf("organizationConflict:") === 0 && Number(signals[key]) > 0; });
        return Boolean(state.world.flags.factionConflict || organizationConflict);
      },
      choices: [
        { id: "mediate", label: "세력 대표들을 한자리에 모아 중재", risk: 3, run: function (state) {
          state.world.tension = Math.max(0, state.world.tension - 8);
          Core.adjustRelation(state, "merchants", 2); Core.adjustRelation(state, "guard", 2); Core.adjustRelation(state, "archive", 1);
          Core.adjustRelation(state, "rural", 1); Core.adjustRelation(state, "innkeepers", 1); Core.adjustRelation(state, "workers", 1);
          Object.keys(state.world.organizationRelations || {}).forEach(function (key) { adjustOrganizationPair(state, key, 8); });
          adjustOrganizationPressure(state, ["merchants", "guard", "archive", "rural", "innkeepers", "workers"], 1);
          pushUnique(state.world.discovered, "factionCouncil");
          return "대표들이 즉시 화해하지는 않았지만 서로의 손해를 확인했다. 도시 전체의 긴장이 한 단계 낮아졌다.";
        } },
        { id: "side", label: "한 세력의 요구를 공개적으로 지지", risk: 4, run: function (state) {
          state.world.tension += 4;
          Core.adjustRelation(state, "guard", 3); Core.adjustRelation(state, "merchants", -2); Core.adjustRelation(state, "workers", -1); Core.adjustRelation(state, "innkeepers", -1);
          Object.keys(state.world.organizationRelations || {}).forEach(function (key) { adjustOrganizationPair(state, key, -6); });
          adjustOrganizationPressure(state, ["guard"], 1); adjustOrganizationPressure(state, ["merchants", "workers", "innkeepers"], -1);
          pushUnique(state.world.discovered, "factionAlignment");
          return "당신의 입장이 분명해졌다. 지지한 쪽은 호의적으로 반응했지만 다른 집단과의 거리는 벌어졌다.";
        } },
        { id: "expose", label: "충돌의 원인이 된 기록과 거래를 공개", risk: 5, run: function (state) {
          state.world.trustInAdministration += 5; state.world.tension += 2; state.world.rumorPressure += 2;
          Core.adjustRelation(state, "archive", 4); Core.adjustRelation(state, "merchants", -3); Core.adjustRelation(state, "guard", -1);
          adjustOrganizationPair(state, "archive:innkeepers", 4); adjustOrganizationPair(state, "merchants:rural", -4);
          adjustOrganizationPressure(state, ["archive"], 2); adjustOrganizationPressure(state, ["innkeepers", "merchants"], -1);
          pushUnique(state.world.discovered, "publicLedger");
          return "문서와 거래 기록을 공개했다. 숨겨진 이해관계가 드러났지만 도시의 소문도 걷잡을 수 없이 커졌다.";
        } }
      ]
    },
    "npc-dispute": {
      title: "갈라진 사람들", summary: "서로 가까이 일하던 인물들의 목표가 충돌하기 시작했다.",
      trigger: function (state) {
        const signals = state.world.eventSignals || {};
        return Object.keys(signals).some(function (key) {
          return key.indexOf("npcConflict:") === 0 && Number(signals[key]) > 0;
        });
      },
      choices: [
        { id: "mediate", label: "두 사람의 작업을 조정", risk: 2, run: function (state) {
          state.world.tension = Math.max(0, Number(state.world.tension || 0) - 3);
          Object.keys(state.world.npcRelations || {}).forEach(function (key) {
            const relation = state.world.npcRelations[key];
            if (relation.mode === "conflict") relation.score = Core.clamp(relation.score + 10, -100, 100);
          });
          state.world.rumorPressure = Math.max(0, Number(state.world.rumorPressure || 0) - 1);
          pushUnique(state.world.discovered, "npcMediation");
          return "두 인물의 작업 순서를 다시 맞췄다. 당장은 충돌이 줄어들었다.";
        } },
        { id: "side", label: "한 사람의 목표를 우선", risk: 3, run: function (state) {
          state.world.tension = Core.clamp(Number(state.world.tension || 0) + 2, 0, 100);
          Object.keys(state.world.npcRelations || {}).forEach(function (key) {
            const relation = state.world.npcRelations[key];
            if (relation.mode === "conflict") relation.score = Core.clamp(relation.score - 4, -100, 100);
          });
          pushUnique(state.world.discovered, "npcAlignment");
          return "한 사람의 작업을 우선시했다. 단기 목표는 빨라졌지만 두 인물의 거리는 벌어졌다.";
        } },
        { id: "observe", label: "개입하지 않고 지켜보기", risk: 0, run: function (state) {
          state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) + 1, 0, 100);
          pushUnique(state.world.discovered, "npcObservation");
          return "당장 개입하지 않았다. 두 사람의 다음 선택을 관찰할 여지가 생겼다.";
        } }
      ]
    },
    "market-crisis": {
      title: "흔들리는 곡물 시장", summary: "높아진 곡물 가격과 줄어든 시장 재고가 도시 생활비를 압박하고 있다.",
      trigger: function (state) { return Boolean(state.world.flags.marketCrisis || Core.hasEventSignal(state, "marketCrisis")); },
      choices: [
        { id: "ration", label: "공공 배급을 우선하도록 설득", risk: 2, run: function (state) {
          state.world.tension = Math.max(0, state.world.tension - 5);
          state.world.economy.stock.grain = Core.clamp(state.world.economy.stock.grain + 8, 0, 100);
          Core.adjustRelation(state, "workers", 3); Core.adjustRelation(state, "innkeepers", 2); Core.adjustRelation(state, "merchants", -2); Core.adjustRelation(state, "rural", 1);
          pushUnique(state.world.discovered, "grainRationing");
          return "남아 있던 곡물을 우선 배급하는 방안이 채택됐다. 생활권의 불안은 낮아졌지만 상인회는 시장 개입을 달가워하지 않았다.";
        } },
        { id: "contract", label: "상인회와 장기 공급 계약을 협상", risk: 3, run: function (state) {
          state.world.grainSupply = Core.clamp(Number(state.world.grainSupply || 0) + 6, 0, 100);
          state.world.economy.stock.grain = Core.clamp(state.world.economy.stock.grain + 5, 0, 100);
          Core.adjustRelation(state, "merchants", 4); Core.adjustRelation(state, "rural", 2); Core.adjustRelation(state, "workers", -1);
          pushUnique(state.world.discovered, "grainContract");
          return "상인회가 농촌 운송로에 선지급 조건을 걸고 공급 계약을 받아들였다. 당장은 시장이 숨을 돌릴 여지가 생겼다.";
        } },
        { id: "open", label: "창고 재고와 거래 장부를 공개", risk: 5, run: function (state) {
          state.world.trustInAdministration = Core.clamp(Number(state.world.trustInAdministration || 0) + 5, 0, 100);
          state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) - 2, 0, 100);
          Core.adjustRelation(state, "archive", 4); Core.adjustRelation(state, "merchants", -4); Core.adjustRelation(state, "guard", 1);
          pushUnique(state.world.discovered, "grainLedger");
          return "재고와 거래 장부가 공개됐다. 공급망의 병목이 드러났고 기록관은 신뢰를 높였지만 상인회와의 관계는 악화됐다.";
        } }
      ]
    }
  };

  Data.ensureCases = function (state) {
    Object.keys(Data.caseDefinitions).forEach(function (id) {
      const def = Data.caseDefinitions[id];
      if (def.trigger(state) && !state.world.cases.some(function (entry) { return entry.id === id; })) {
        state.world.cases.push({ id: id, status: "open", branch: null, attempts: 0, createdDay: state.world.day });
      }
    });
  };

  Data.deterministicRoll = function (id, choiceId, day) {
    let hash = 2166136261;
    const value = String(id) + ":" + String(choiceId) + ":" + String(day);
    for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0) % 6 + 1;
  };

  Data.resolveCase = function (state, caseId, choiceId) {
    const entry = state.world.cases.find(function (item) { return item.id === caseId && item.status === "open"; });
    if (!entry) return { text: "그 사건은 진행 중인 사건 목록에 없다.", changed: false };
    const def = Data.caseDefinitions[caseId];
    const choice = def.choices.find(function (item) { return item.id === choiceId; });
    if (!choice) return { text: "유효한 사건 선택지가 아니다.", changed: false };
    const roll = Data.deterministicRoll(caseId, choice.id, state.world.day);
    const need = 3 + choice.risk;
    entry.attempts += 1;
    entry.branch = choice.id;
    Core.advanceTime(state, 10);
    if (roll >= need) { entry.status = "resolved"; return { text: "【" + def.title + "】 " + choice.run(state) + " (판정 " + roll + "/" + need + ")", changed: true }; }
    state.world.tension = Core.clamp(state.world.tension + Math.max(1, choice.risk), 0, 100);
    if (entry.attempts >= 2) entry.status = "failed";
    return { text: "【" + def.title + "】 " + choice.label + "은(는) 원하는 결과를 만들지 못했다. (판정 " + roll + "/" + need + ")", changed: true };
  };
})(AnonymousRPG.Data, AnonymousRPG.Core);
