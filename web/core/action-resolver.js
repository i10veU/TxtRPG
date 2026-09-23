window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core, Data) {
  function placeFromText(text) {
    const aliases = [["시장", "market"], ["부두", "riverside"], ["강", "riverside"], ["골목", "alley"], ["여관", "alley"], ["기록관", "archive"], ["기록", "archive"], ["농촌", "hills"], ["언덕", "hills"]];
    for (let i = 0; i < aliases.length; i += 1) if (text.includes(aliases[i][0])) return aliases[i][1];
    return null;
  }

  function npcFromText(state, text) {
    return Object.entries(state.npcs).find(function (entry) {
      const npc = entry[1];
      return text.includes(entry[0]) || text.includes(npc.name) || text.includes(npc.name.slice(0, 2));
    });
  }

  function inspect(state) {
    Core.advanceTime(state, 10);
    const place = state.player.place;
    if (place === "market") {
      if (typeof Core.getGrainPrice === "function" && state.world.economy) return "곡물 가격은 현재 " + Core.getGrainPrice(state) + "골드다. 시장 재고는 " + state.world.economy.stock.grain + "개다.";
      return "곡물 가격은 대략 " + (state.world.grainSupply < 60 ? 13 : 10) + " 정도로 보인다.";
    }
    if (place === "riverside") return state.world.flags.nightCargo ? "젖은 밧줄과 화물 자국 사이로 예정표와 맞지 않는 흔적이 보인다." : "젖은 밧줄과 화물 자국, 배에서 흘러나온 물자 냄새가 섞여 있다.";
    if (place === "archive") return state.world.flags.recordInconsistency ? "같은 토지 번호가 서로 다른 소유자와 연결되어 있다." : "공개 열람실의 장부들은 정돈되어 있다.";
    if (place === "hills") return state.world.grainSupply < 60 ? "농촌의 출하량이 줄었다. 흉작만으로 설명하기 어려운 분위기다." : "수확기 직전의 농촌이다. 운송로와 저장고가 중요해 보인다.";
    return "여관과 작업장, 공동 우물 주변에 사람들이 모여 있다.";
  }

  function talk(state, text) {
    const found = npcFromText(state, text);
    if (!found) return "주변 사람과 말을 나누었지만 특별한 정보는 얻지 못했다.";
    const id = found[0];
    const npc = found[1];
    if (npc.place !== state.player.place) return npc.name + "은(는) 이곳에 없다.";
    Core.advanceTime(state, 10);
    npc.trust = Core.clamp((Number(npc.trust) || 0) + 1, -100, 100);
    const faction = npc.faction;
    if (faction) Core.adjustRelation(state, faction, 1);
    const guarded = npc.trust < -2;
    const lines = {
      mara: state.world.grainSupply < 65 ? "곡물이 이상해요. 가격표보다 창고가 더 중요해졌거든요." : "오늘은 아직 괜찮아요. 하지만 며칠 뒤는 모르겠네요.",
      jonas: state.world.flags.nightCargo ? "밤에 움직이는 배가 있었어." : "부두에서 무슨 일이 있었는지는 먼저 누가 봤는지부터 따져야 해.",
      serin: state.world.flags.recordInconsistency ? "그 번호를 어디서 봤는지 알려주면 같이 확인해 볼 수 있어요." : "기록은 읽는 법보다 비교하는 법이 중요해요.",
      darma: "북동쪽에서 물건이 잘 내려오지 않고 있어.",
      ibrahim: state.world.security < 50 ? "요즘 시장에서 시끄러운 일이 늘었어." : "문제 생기면 초소에 와. 직접 본 걸 말하면 된다.",
      marta: "사람들은 여관에 와서 밥보다 이야기를 더 많이 남기지.",
      orel: "요즘 상자와 자물쇠를 고쳐달라는 주문이 많아졌어."
    };
    if (guarded) return npc.name + ": “당신과는 더 이야기하고 싶지 않아.”";
    return npc.name + ": “" + lines[id] + "”";
  }

  function move(state, place) {
    if (!Data.places[place]) return "그 장소는 존재하지 않는다.";
    if (place === state.player.place) return "이미 그곳에 있다.";
    const minutes = Data.places[state.player.place].travelFrom[place] ?? 10;
    Core.advanceTime(state, minutes);
    state.player.fatigue = Core.clamp(state.player.fatigue + Math.ceil(minutes / 35), 0, state.player.maxFatigue);
    state.player.place = place;
    return Data.places[place].name + "까지 이동했다. 약 " + minutes + "분이 걸렸다.";
  }

  function caseCommand(state, text) {
    Data.ensureCases(state);
    const match = text.match(/(?:사건분기|사건)\s+([a-z-]+|\d+)(?:\s+([a-z-]+|\d+))?/);
    if (!match) return null;
    const open = state.world.cases.filter(function (entry) { return entry.status === "open"; });
    let caseId = match[1];
    if (/^\d+$/.test(caseId)) caseId = open[Number(caseId) - 1]?.id;
    if (!caseId) return "그 사건은 진행 중인 사건 목록에 없다.";
    const def = Data.caseDefinitions[caseId];
    const entry = state.world.cases.find(function (item) { return item.id === caseId && item.status === "open"; });
    if (!entry || !def) return "그 사건은 진행 중인 사건 목록에 없다.";
    if (!match[2]) return def.title + " — " + def.summary + " 선택지: " + def.choices.map(function (choice, index) { return (index + 1) + ". " + choice.label + " [위험 " + choice.risk + "]"; }).join(" / ");
    let choiceId = match[2];
    if (/^\d+$/.test(choiceId)) choiceId = def.choices[Number(choiceId) - 1]?.id;
    if (!choiceId) return "유효한 사건 선택지가 아니다.";
    return Data.resolveCase(state, caseId, choiceId);
  }

  function rumorCommand(state, text) {
    if (!/^소문(?:목록)?$|^rumors?$/i.test(text.trim())) return null;
    const rumors = Array.isArray(state.world.rumors) ? state.world.rumors.slice().sort(function (a, b) {
      return (b.lastSeenDay - a.lastSeenDay) || (b.confidence - a.confidence);
    }) : [];
    if (!rumors.length) {
      return { narrative: "아직 뚜렷한 소문을 들은 적이 없다.", action: text, changed: false };
    }
    const lines = rumors.slice(0, 6).map(function (rumor, index) {
      return (index + 1) + ". " + rumor.text + " [확신 " + Math.round(rumor.confidence * 100) + "%]";
    });
    return { narrative: lines.join(" / "), action: text, changed: false };
  }

  function economyCommand(state, text) {
    if (typeof Core.ensureEconomy !== "function" || typeof Core.tradeGrain !== "function" || typeof Core.getGrainPrice !== "function") return null;
    const normalized = text.replace(/\s+/g, " ").trim();
    if (/^(곡물|시세|곡물 가격|시장 가격)$/.test(normalized)) {
      Core.ensureEconomy(state);
      return { narrative: "현재 곡물 시세는 " + Core.getGrainPrice(state) + "골드, 시장 재고는 " + state.world.economy.stock.grain + "개다.", action: text, changed: false };
    }
    const match = normalized.match(/^곡물\s*(구매|사|판매|팔)\s*(\d+)?$/);
    if (!match) return null;
    if (state.player.place !== "market") return { narrative: "곡물 거래는 북문 시장에서만 할 수 있다.", action: text, changed: false };
    const type = match[1] === "판매" || match[1] === "팔" ? "sell" : "buy";
    const result = Core.tradeGrain(state, type, Number(match[2]) || 1);
    return { narrative: result.text, action: text, changed: result.changed };
  }

  Core.resolveAction = function (state, text) {
    const input = String(text || "").trim();
    if (!input) return { narrative: "", action: "", changed: false };
    if (typeof Core.ensureEconomy === "function") Core.ensureEconomy(state);
    const economy = economyCommand(state, input);
    if (economy) return economy;
    const rumor = rumorCommand(state, input);
    if (rumor) return rumor;
    let result = caseCommand(state, input);
    if (result !== null) {
      if (typeof result === "string") return { narrative: result, action: input, changed: true };
      return { narrative: result.text, action: input, changed: result.changed };
    }
    if (/^사건목록$|^사건 목록$|^cases$/i.test(input)) {
      Data.ensureCases(state);
      const open = state.world.cases.filter(function (entry) { return entry.status === "open"; });
      return { narrative: open.map(function (entry) { return entry.id + " — " + Data.caseDefinitions[entry.id].title; }).join(" / ") || "현재 진행 중인 사건이 없다.", action: input, changed: false };
    }
    const place = placeFromText(input);
    if (/이동|가자|간다|가 /i.test(input) && place) result = move(state, place);
    else if (/조사|확인|관찰|살펴|수색/.test(input)) {
      result = inspect(state);
      if (state.player.place === "archive") state.world.flags.recordInconsistency = true;
      if (state.player.place === "riverside" && Core.getClock(state).part === "밤") state.world.flags.nightCargo = true;
      if (state.world.grainSupply < 58 && state.world.tension >= 35) state.world.flags.warehouseSuspicion = true;
    } else if (/대화|말을|묻|설득|협상/.test(input)) result = talk(state, input);
    else if (/휴식|쉬어|쉬다/.test(input)) {
      Core.advanceTime(state, 60);
      state.player.fatigue = Core.clamp(state.player.fatigue - 2, 0, state.player.maxFatigue);
      result = "잠시 쉬었다.";
    } else if (/잠|잔다|숙면/.test(input)) {
      Core.advanceTime(state, 480);
      state.player.fatigue = Math.max(0, state.player.fatigue - 8);
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
      result = "충분히 쉬었다.";
    } else {
      Core.advanceTime(state, 15);
      result = "당신은 " + input + "을(를) 시도했다. 당장 눈에 띄는 결과는 없었다.";
    }
    Data.ensureCases(state);
    state.world.trustInAdministration = Core.clamp(state.world.trustInAdministration, 0, 100);
    state.world.security = Core.clamp(state.world.security, 0, 100);
    return { narrative: result, action: input, changed: true };
  };
})(AnonymousRPG.Core, AnonymousRPG.Data);
