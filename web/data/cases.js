window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Data = AnonymousRPG.Data || {};

(function (Data, Core) {
  function pushUnique(list, value) {
    if (!list.includes(value)) list.push(value);
  }

  Data.caseDefinitions = {
    "grain-warehouse": {
      title: "닫힌 창고의 곡물",
      summary: "곡물 부족과 함께 일부 창고의 출입이 비정상적으로 줄었다.",
      trigger: function (state) { return Boolean(state.world.flags.warehouseSuspicion || Core.hasEventSignal(state, "warehouseSuspicion")); },
      choices: [
        { id: "audit", label: "공식 장부 대조", risk: 1, run: function (state) {
          state.world.trustInAdministration += 3;
          state.world.grainSupply += 4;
          Core.adjustRelation(state, "archive", 2);
          Core.adjustRelation(state, "merchants", -1);
          return "공식 기록을 대조한 결과 일부 재고 차이가 확인됐다. 기록관은 협조적이었지만 일부 상인은 불편해했다.";
        }},
        { id: "negotiate", label: "상인과 비공식 협상", risk: 2, run: function (state) {
          state.player.money += 5;
          state.world.grainSupply += 2;
          Core.adjustRelation(state, "merchants", 3);
          Core.adjustRelation(state, "archive", -2);
          return "상인들과 직접 조건을 맞췄다. 당장의 공급은 안정됐지만 공식 기록에는 빈틈이 남았다.";
        }},
        { id: "force", label: "창고를 강제로 확인", risk: 4, run: function (state) {
          state.world.security -= 5;
          state.world.tension += 5;
          Core.adjustRelation(state, "guard", -3);
          Core.adjustRelation(state, "merchants", -4);
          return "강제로 문을 열었다. 숨겨진 물량 일부는 확인했지만 상인과 경비대 모두 경계하기 시작했다.";
        }}
      ]
    },
    "night-cargo": {
      title: "시간표 밖의 배",
      summary: "예정표에 없는 선박의 움직임이 야간 부두에서 포착됐다.",
      trigger: function (state) { return Boolean(state.world.flags.nightCargo || Core.hasEventSignal(state, "nightCargo")); },
      choices: [
        { id: "report", label: "경비대에 보고", risk: 1, run: function (state) {
          state.world.security += 3;
          state.world.trustInAdministration += 2;
          Core.adjustRelation(state, "guard", 3);
          Core.adjustRelation(state, "workers", 1);
          return "목격 내용을 경비대에 전달했다. 정식 조사 기록이 남았고 부두 경비대가 당신을 신뢰하기 시작했다.";
        }},
        { id: "follow", label: "배의 행선지를 추적", risk: 3, run: function (state) {
          state.world.rumorPressure += 1;
          pushUnique(state.world.discovered, "cargoRoute");
          Core.adjustRelation(state, "workers", 2);
          Core.adjustRelation(state, "guard", -1);
          return "부두 밖까지 흔적을 따라갔다. 북쪽 운송로와 연결된 정황을 얻었지만 경비대는 독단적인 행동을 경계했다.";
        }},
        { id: "ignore", label: "모른 척 지나가기", risk: 0, run: function (state) {
          state.world.tension = Math.max(0, state.world.tension - 1);
          Core.adjustRelation(state, "guard", -1);
          return "당장은 아무 일도 하지 않았다. 움직임은 기록되지 않았고 경비대는 당신의 침묵을 알아차렸다.";
        }}
      ]
    },
    "land-record": {
      title: "서로 다른 토지 기록",
      summary: "같은 토지 번호가 서로 다른 소유자와 날짜로 기록되어 있다.",
      trigger: function (state) { return Boolean(state.world.flags.recordInconsistency || Core.hasEventSignal(state, "recordInconsistency")); },
      choices: [
        { id: "archive", label: "기록관에 정식 보존 요청", risk: 1, run: function (state) {
          state.world.trustInAdministration += 4;
          Core.adjustRelation(state, "archive", 4);
          return "기록 사본을 보존하도록 요청했다. 기록관은 당신을 신뢰할 만한 조사자로 보기 시작했다.";
        }},
        { id: "owner", label: "현재 소유자에게 직접 확인", risk: 2, run: function (state) {
          state.player.money += 2;
          pushUnique(state.world.discovered, "landWitness");
          Core.adjustRelation(state, "rural", 3);
          Core.adjustRelation(state, "archive", 1);
          return "현 소유자에게서 오래된 거래 증언을 들었다. 농촌 쪽 증언망이 열렸지만 기록관의 확인도 필요해졌다.";
        }},
        { id: "alter", label: "기록의 일부를 몰래 수정", risk: 5, run: function (state) {
          state.world.trustInAdministration -= 6;
          state.world.tension += 2;
          Core.adjustRelation(state, "archive", -6);
          Core.adjustRelation(state, "merchants", 1);
          return "기록 일부를 건드렸다. 당장은 문제가 없지만 기록관의 신뢰가 크게 떨어졌다.";
        }}
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
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
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
    if (roll >= need) {
      entry.status = "resolved";
      return { text: "【" + def.title + "】 " + choice.run(state) + " (판정 " + roll + "/" + need + ")", changed: true };
    }
    state.world.tension = Core.clamp(state.world.tension + Math.max(1, choice.risk), 0, 100);
    if (entry.attempts >= 2) entry.status = "failed";
    return { text: "【" + def.title + "】 " + choice.label + "은(는) 원하는 결과를 만들지 못했다. (판정 " + roll + "/" + need + ")", changed: true };
  };
})(AnonymousRPG.Data, AnonymousRPG.Core);
