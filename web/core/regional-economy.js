window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const GOODS = {
    wood: { name: "목재", base: 8, min: 3, max: 24, source: "hills" },
    fish: { name: "어물", base: 7, min: 3, max: 21, source: "riverside" }
  };

  const ROUTES = {
    "hills:market": { source: "hills", target: "market", baseFlow: 5 },
    "riverside:market": { source: "riverside", target: "market", baseFlow: 5 }
  };

  function ensure(state) {
    const w = state.world;
    if (!w.regionalEconomy || typeof w.regionalEconomy !== "object") {
      w.regionalEconomy = {};
    }

    const r = w.regionalEconomy;
    r.resources = r.resources && typeof r.resources === "object" ? r.resources : {};
    r.market = r.market && typeof r.market === "object" ? r.market : {};
    r.prices = r.prices && typeof r.prices === "object" ? r.prices : {};
    r.routes = r.routes && typeof r.routes === "object" ? r.routes : {};
    r.simulationDay = Number.isFinite(Number(r.simulationDay)) ? Number(r.simulationDay) : -1;

    Object.keys(GOODS).forEach(function (id) {
      const good = GOODS[id];
      if (!r.resources[good.source] || typeof r.resources[good.source] !== "object") r.resources[good.source] = {};
      r.resources[good.source][id] = Core.clamp(Number(r.resources[good.source][id]) || 0, 0, 100);
      r.market[id] = Core.clamp(Number(r.market[id]) || 0, 0, 100);
      r.prices[id] = Core.clamp(Number(r.prices[id]) || good.base, good.min, good.max);
    });

    Object.keys(ROUTES).forEach(function (key) {
      const current = r.routes[key];
      if (!current || typeof current !== "object") {
        r.routes[key] = { reliability: 80, lastDay: -1, flow: 0, disruptionCount: 0 };
      } else {
        current.reliability = Core.clamp(Number(current.reliability) || 0, 0, 100);
        current.lastDay = Number.isFinite(Number(current.lastDay)) ? Number(current.lastDay) : -1;
        current.flow = Math.max(0, Number(current.flow) || 0);
        current.disruptionCount = Math.max(0, Number(current.disruptionCount) || 0);
      }
    });

    if (!w.eventSignals) w.eventSignals = {};
    if (!w.rumors) w.rumors = [];
  }

  function calculatePrice(state, id) {
    const good = GOODS[id];
    const marketStock = Number(state.world.regionalEconomy.market[id]) || 0;
    const routeKey = good.source + ":market";
    const reliability = Number(state.world.regionalEconomy.routes[routeKey].reliability) || 0;
    const shortage = Math.max(0, 35 - marketStock) * 0.25;
    const routePenalty = Math.max(0, 70 - reliability) * 0.04;
    const tension = Number(state.world.tension || 0) * 0.02;
    return Core.clamp(Math.round(good.base + shortage + routePenalty + tension), good.min, good.max);
  }

  function signalRouteCrisis(state, routeKey, minute) {
    const route = state.world.regionalEconomy.routes[routeKey];
    if (route.lastDay === Math.floor(Number(minute) / 1440)) return;
    route.disruptionCount += 1;
    route.lastDay = Math.floor(Number(minute) / 1440);

    const signal = "tradeRouteCrisis:" + routeKey;
    Core.recordEventSignal(state, signal, routeKey, minute, routeKey === "hills:market"
      ? "구릉 농촌지대에서 시장으로 이어지는 목재 운송이 불안정해졌다."
      : "강변 부두에서 시장으로 이어지는 어물 운송이 불안정해졌다.");
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    const r = state.world.regionalEconomy;
    if (r.simulationDay === day) return null;
    r.simulationDay = day;

    const events = [];

    Object.keys(GOODS).forEach(function (id) {
      const good = GOODS[id];
      const sourceStock = r.resources[good.source][id];
      const production = state.world.security < 45 ? 2 : 4;
      r.resources[good.source][id] = Core.clamp(sourceStock + production, 0, 100);

      const routeKey = good.source + ":market";
      const route = r.routes[routeKey];
      const disruption = state.world.security < 45 || state.world.tension > 70;
      if (disruption) route.reliability = Core.clamp(route.reliability - 4, 0, 100);
      else route.reliability = Core.clamp(route.reliability + 2, 0, 100);

      const flow = Math.min(
        r.resources[good.source][id],
        Math.max(0, Math.floor(ROUTES[routeKey].baseFlow * route.reliability / 100))
      );
      r.resources[good.source][id] -= flow;
      r.market[id] = Core.clamp(r.market[id] + flow - 2, 0, 100);
      route.flow = flow;

      if (route.reliability < 45 || r.market[id] < 7) {
        signalRouteCrisis(state, routeKey, absoluteMinute);
        events.push(good.name + " 교역로의 공급이 불안정하다.");
      }

      r.prices[id] = calculatePrice(state, id);
    });

    if (events.length) {
      state.world.tension = Core.clamp(Number(state.world.tension || 0) + 1, 0, 100);
      state.world.rumorPressure = Core.clamp(Number(state.world.rumorPressure || 0) + 1, 0, 100);
    }

    return events.length ? events.join(" ") : "지역 교역로와 자원 공급이 갱신됐다.";
  }

  function trade(state, type, id, amount) {
    ensure(state);
    const good = GOODS[id];
    if (!good) return { text: "그 지역 자원은 거래할 수 없다.", changed: false };
    if (state.player.place !== "market") return { text: "지역 자원 거래는 북문 시장에서만 할 수 있다.", changed: false };

    const quantity = Math.max(1, Math.min(20, Math.floor(Number(amount) || 1)));
    const price = state.world.regionalEconomy.prices[id];
    const inventory = state.player.inventory;
    const market = state.world.regionalEconomy.market;

    if (type === "buy") {
      if (market[id] < quantity) return { text: "시장에 그만한 " + good.name + "이(가) 없다.", changed: false };
      const cost = price * quantity;
      if (state.player.money < cost) return { text: good.name + "을(를) 살 돈이 부족하다.", changed: false };
      state.player.money -= cost;
      inventory[id] = (Number(inventory[id]) || 0) + quantity;
      market[id] -= quantity;
      Core.adjustRelation(state, good.source === "hills" ? "rural" : "workers", 1);
      return { text: good.name + " " + quantity + "개를 " + cost + "골드에 샀다.", changed: true };
    }

    const owned = Number(inventory[id]) || 0;
    if (owned < quantity) return { text: "판매할 " + good.name + "이(가) 부족하다.", changed: false };
    const revenue = Math.max(1, Math.floor(price * quantity * 0.8));
    inventory[id] -= quantity;
    state.player.money += revenue;
    market[id] = Core.clamp(market[id] + quantity, 0, 100);
    Core.adjustRelation(state, "merchants", 1);
    return { text: good.name + " " + quantity + "개를 " + revenue + "골드에 팔았다.", changed: true };
  }

  Core.ensureRegionalEconomy = ensure;
  Core.simulateRegionalEconomy = simulate;
  Core.tradeRegionalGood = trade;
  Core.getRegionalGoodPrice = function (state, id) {
    ensure(state);
    return state.world.regionalEconomy.prices[id] || null;
  };
  Core.regionalGoods = GOODS;
  Core.regionalTradeRoutes = ROUTES;
})(AnonymousRPG.Core);
