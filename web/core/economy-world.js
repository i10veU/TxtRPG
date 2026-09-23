window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Core = AnonymousRPG.Core || {};

(function (Core) {
  const GOODS = {
    grain: { base: 10, min: 4, max: 30 }
  };

  function ensure(state) {
    const w = state.world;
    if (!w.economy) {
      w.economy = { prices: { grain: 10 }, stock: { grain: 24 }, simulationDay: -1, tradeVolume: 0, pressureDay: -1 };
    }
    w.economy.prices = Object.assign({ grain: 10 }, w.economy.prices || {});
    w.economy.stock = Object.assign({ grain: 24 }, w.economy.stock || {});
    if (!Number.isFinite(Number(w.economy.simulationDay))) w.economy.simulationDay = -1;
    if (!Number.isFinite(Number(w.economy.tradeVolume))) w.economy.tradeVolume = 0;
    if (!Number.isFinite(Number(w.economy.pressureDay))) w.economy.pressureDay = -1;
    w.economy.prices.grain = Core.clamp(Number(w.economy.prices.grain) || 10, GOODS.grain.min, GOODS.grain.max);
    w.economy.stock.grain = Core.clamp(Number(w.economy.stock.grain) || 0, 0, 100);
    w.flags = w.flags || {};
    w.eventSignals = w.eventSignals || {};
  }

  function calculateGrainPrice(state) {
    const w = state.world;
    const shortage = (70 - Number(w.grainSupply || 0)) * 0.11;
    const tension = Number(w.tension || 0) * 0.035;
    const security = Math.max(0, 60 - Number(w.security || 0)) * 0.04;
    return Core.clamp(Math.round(GOODS.grain.base + shortage + tension + security), GOODS.grain.min, GOODS.grain.max);
  }

  function relation(state, id, delta) {
    if (!state.world.relations) return;
    state.world.relations[id] = Core.clamp((Number(state.world.relations[id]) || 0) + delta, -100, 100);
  }

  function simulatePressure(state, day, price) {
    const w = state.world;
    const stock = Number(w.economy.stock.grain) || 0;
    const crisis = price >= 18 || stock <= 5 || Number(w.grainSupply || 0) < 38;
    w.flags.marketCrisis = crisis;
    if (!crisis) {
      if (Number(w.rumorPressure || 0) > 0 && stock > 15) w.rumorPressure = Core.clamp(Number(w.rumorPressure) - 1, 0, 100);
      return;
    }
    if (w.economy.pressureDay === day) return;
    w.economy.pressureDay = day;
    relation(state, "merchants", 2);
    relation(state, "rural", -1);
    relation(state, "workers", -1);
    relation(state, "innkeepers", -1);
    w.tension = Core.clamp(Number(w.tension || 0) + 1, 0, 100);
    w.rumorPressure = Core.clamp(Number(w.rumorPressure || 0) + 1, 0, 100);
    w.eventSignals.marketCrisis = (Number(w.eventSignals.marketCrisis) || 0) + 1;
  }

  function simulate(state, absoluteMinute) {
    ensure(state);
    const day = Math.floor(Number(absoluteMinute) / 1440);
    if (state.world.economy.simulationDay === day) return null;
    state.world.economy.simulationDay = day;
    const w = state.world;
    const supplyDelta = w.grainSupply >= 65 ? 3 : w.grainSupply < 45 ? -2 : 0;
    const demandDelta = w.tension >= 70 ? 2 : 1;
    w.economy.stock.grain = Core.clamp(w.economy.stock.grain + supplyDelta - demandDelta, 0, 100);
    w.economy.prices.grain = calculateGrainPrice(state);
    simulatePressure(state, day, w.economy.prices.grain);
    if (w.economy.stock.grain < 8) w.rumorPressure = Core.clamp(Number(w.rumorPressure || 0) + 1, 0, 100);
    return "시장 곡물 시세가 갱신됐다. 현재 가격은 " + w.economy.prices.grain + "골드다." +
      (w.flags.marketCrisis ? " 곡물 시장에 압박이 커지고 있다." : "");
  }

  function trade(state, type, amount) {
    ensure(state);
    const quantity = Math.max(1, Math.min(20, Math.floor(Number(amount) || 0)));
    const price = state.world.economy.prices.grain;
    const inventory = state.player.inventory;
    const stock = state.world.economy.stock;
    if (type === "buy") {
      const cost = price * quantity;
      if (stock.grain < quantity) return { text: "시장에 그만한 곡물이 없다.", changed: false };
      if (state.player.money < cost) return { text: "곡물을 살 돈이 부족하다. 현재 가격은 " + price + "골드다.", changed: false };
      state.player.money -= cost;
      inventory.grain = (Number(inventory.grain) || 0) + quantity;
      stock.grain -= quantity;
      state.world.economy.tradeVolume += quantity;
      relation(state, "merchants", 1);
      return { text: "곡물 " + quantity + "개를 " + cost + "골드에 샀다.", changed: true };
    }
    const owned = Number(inventory.grain) || 0;
    if (owned < quantity) return { text: "판매할 곡물이 부족하다.", changed: false };
    const revenue = Math.max(1, Math.floor(price * quantity * 0.8));
    inventory.grain -= quantity;
    state.player.money += revenue;
    stock.grain = Core.clamp(stock.grain + quantity, 0, 100);
    state.world.economy.tradeVolume += quantity;
    relation(state, "merchants", 1);
    return { text: "곡물 " + quantity + "개를 " + revenue + "골드에 팔았다.", changed: true };
  }

  Core.ensureEconomy = ensure;
  Core.simulateEconomy = simulate;
  Core.getGrainPrice = function (state) { ensure(state); return state.world.economy.prices.grain; };
  Core.tradeGrain = trade;
})(AnonymousRPG.Core);
