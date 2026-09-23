window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.UI = AnonymousRPG.UI || {};

(function (UI, Core, Data) {
  function esc(value) {
    return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  const factionNames = {
    merchants:"상인회",
    guard:"경비대",
    archive:"기록관",
    rural:"농촌",
    innkeepers:"여관망",
    workers:"노동자"
  };

  function relationLabel(value) {
    const score = Number(value) || 0;
    if (score >= 60) return "우호";
    if (score >= 20) return "협조";
    if (score > -20) return "중립";
    if (score > -60) return "경계";
    return "적대";
  }

  function marketLabel(state) {
    const economy = state.world.economy || {};
    if (state.world.flags && state.world.flags.marketCrisis) return "위기";
    const stock = Number(economy.stock && economy.stock.grain) || 0;
    const price = Number(economy.prices && economy.prices.grain) || 10;
    if (stock <= 8 || price >= 18) return "압박";
    return "안정";
  }

  function panel(title, state) {
    const overlay = document.querySelector(".overlay");
    if (!overlay) return;
    overlay.setAttribute("aria-hidden","false");
    overlay.classList.add("is-open");
    document.getElementById("overlayTitle").textContent = title;
    document.querySelectorAll(".overlay__panel").forEach(function (node) {
      node.classList.toggle("is-active", node.dataset.panel === state);
    });
  }

  function closePanel() {
    const overlay = document.querySelector(".overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden","true");
  }

  UI.openPanel = panel;
  UI.closePanel = closePanel;

  UI.render = function (state) {
    const place = Data.places[state.player.place];
    const clock = Core.getClock(state);
    const economy = state.world.economy || { prices: { grain: 10 }, stock: { grain: 24 } };

    document.getElementById("location").textContent = "세르카 · " + (place ? place.name : state.player.place);
    document.getElementById("dateText").textContent = "183 · " + (state.world.day + 1) + "일";
    document.getElementById("timeText").textContent = clock.text;
    document.getElementById("moneyText").textContent = state.player.money;
    document.getElementById("hpText").textContent = state.player.hp + "/" + state.player.maxHp;
    document.getElementById("fatigueText").textContent = state.player.fatigue + "/" + state.player.maxFatigue;

    document.getElementById("overlayDay").textContent = state.world.day + 1;
    document.getElementById("overlayTime").textContent = clock.text;
    document.getElementById("overlayHp").textContent = state.player.hp + "/" + state.player.maxHp;
    document.getElementById("overlayFatigue").textContent = state.player.fatigue + "/" + state.player.maxFatigue;
    document.getElementById("overlayMoney").textContent = state.player.money;
    document.getElementById("overlayGrain").textContent = (Number(economy.prices.grain) || 10) + "G";
    document.getElementById("overlayGrainStock").textContent = Number(economy.stock.grain) || 0;
    document.getElementById("overlayMarketPressure").textContent = marketLabel(state);

    document.getElementById("inventoryList").innerHTML =
      Object.entries(state.player.inventory).map(function (entry) {
        return "<li><span>" + esc(entry[0]) + " ×" + esc(entry[1]) + "</span></li>";
      }).join("") || "<li>없음</li>";

    const npcList = Object.values(state.npcs).map(function (npc) {
      const npcPlace = Data.places[npc.place];
      const faction = npc.faction ? factionNames[npc.faction] : "무소속";
      const stateText = npc.lastAction || npc.goal || "";
      const goalState = npc.goalState;
      const goalText = goalState
        ? " · " + (goalState.status === "blocked" ? "중단" : "목표") + " " + goalState.progress + "/" + goalState.target + " · 우선 " + goalState.priority
        : "";
      const npcId = Object.keys(state.npcs).find(function (id) { return state.npcs[id] === npc; });
      const relationCount = Object.keys(state.world.npcRelations || {}).filter(function (key) {
        return key.split(":").includes(npcId);
      }).length;
      return "<li><span>" + esc(npc.name) + "</span><small>" +
        esc(npcPlace ? npcPlace.name : npc.place) + " · " + esc(faction) + " · 관계 " + relationCount + " · " +
        esc(stateText) + esc(goalText) + "</small></li>";
    });
    document.getElementById("npcList").innerHTML = npcList.join("") || "<li>없음</li>";

    document.getElementById("relationList").innerHTML =
      Object.keys(factionNames).map(function (id) {
        const score = Number(state.world.relations && state.world.relations[id]) || 0;
        return "<li><span>" + esc(factionNames[id]) + "</span><small>" +
          esc(relationLabel(score)) + " " + esc(score) + "</small></li>";
      }).join("");

    const discovered = Array.from(new Set(state.world.discovered));
    const openCases = state.world.cases
      .filter(function (entry) { return entry.status === "open"; })
      .map(function (entry) { return "사건 · " + Data.caseDefinitions[entry.id].title; });
    document.getElementById("knownList").innerHTML =
      discovered.concat(openCases).map(function (item) {
        return "<li><span>" + esc(item) + "</span></li>";
      }).join("") || "<li>없음</li>";

    const rumors = Array.isArray(state.world.rumors) ? state.world.rumors.slice().sort(function (a, b) {
      return (b.lastSeenDay - a.lastSeenDay) || (b.confidence - a.confidence);
    }) : [];
    document.getElementById("rumorList").innerHTML =
      rumors.slice(0, 8).map(function (rumor) {
        return "<li><span>" + esc(rumor.text) + "</span><small>확신 " + Math.round(rumor.confidence * 100) + "% · " + esc(rumor.sources.join(",")) + "</small></li>";
      }).join("") || "<li>아직 없음</li>";

    const organizations = state.world.organizations || {};
    document.getElementById("organizationList").innerHTML =
      Object.keys(organizations).map(function (id) {
        const org = organizations[id];
        return "<li><span>" + esc(org.name || id) + "</span><small>D" + esc(org.lastDecisionDay + 1) + " · 압력 " + esc(org.goalPressure || 0) + " · " + esc(org.lastAction || "대기") + "</small></li>";
      }).join("") || "<li>아직 없음</li>";

    const history = Array.isArray(state.world.caseHistory) ? state.world.caseHistory.slice().reverse() : [];
    const followups = state.world.cases.filter(function (entry) {
      return entry.status === "open" && ["grain-aftershock", "trade-route-aftershock", "faction-aftershock"].includes(entry.id);
    });
    document.getElementById("causalityList").innerHTML = history.slice(0, 8).map(function (entry) {
      return "<li><span>" + esc(entry.caseId) + " → " + esc(entry.choiceId || "-") + "</span><small>" + esc(entry.status === "resolved" ? "해결" : "실패") + " · D" + esc(entry.resolutionDay + 1) + "</small></li>";
    }).concat(followups.map(function (entry) {
      return "<li><span>후속 · " + esc(Data.caseDefinitions[entry.id].title) + "</span><small>선택 대기</small></li>";
    })).join("") || "<li>아직 연결된 사건이 없음</li>";

    document.getElementById("storyBody").innerHTML = state.log.map(function (turn) {
      return '<article class="turn"><div class="time">' + esc(turn.time) + "</div>" +
        (turn.action ? '<div class="actionText">&gt; ' + esc(turn.action) + "</div>" : "") +
        '<div class="' + (turn.system ? "system" : "narrative") + '">' + esc(turn.narrative) + "</div></article>";
    }).join("");

    const storyBody = document.getElementById("storyBody");
    if (storyBody) storyBody.scrollTop = storyBody.scrollHeight;
  };

  UI.addTurn = function (state, narrative, action, system) {
    state.log.push({
      time:(state.world.day + 1) + "일째 · " + Core.getClock(state).text,
      narrative:narrative,
      action:action || null,
      system:Boolean(system)
    });
    if (state.log.length > 60) state.log.shift();
  };
})(AnonymousRPG.UI, AnonymousRPG.Core, AnonymousRPG.Data);
