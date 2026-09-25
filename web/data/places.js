window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Data = AnonymousRPG.Data || {};
AnonymousRPG.Data.places = {
  market: {
    name: "도시 북문 시장",
    travelFrom: { riverside: 20, alley: 10, archive: 15, hills: 90 }
  },
  riverside: {
    name: "강변 부두",
    travelFrom: { market: 20, alley: 10, archive: 25, hills: 110 }
  },
  alley: {
    name: "회색 골목",
    travelFrom: { market: 10, riverside: 10, archive: 20, hills: 100 }
  },
  archive: {
    name: "서문 기록관",
    travelFrom: { market: 15, riverside: 25, alley: 20, hills: 95 }
  },
  hills: {
    name: "구릉 농촌지대",
    travelFrom: { market: 90, riverside: 110, alley: 100, archive: 95, foundry: 75, clinic: 85 }
  },
  foundry: {
    name: "남부 주조장",
    travelFrom: { market: 35, riverside: 25, alley: 20, archive: 30, hills: 75, clinic: 15, watchtower: 40 }
  },
  clinic: {
    name: "동문 진료소",
    travelFrom: { market: 25, riverside: 35, alley: 15, archive: 20, hills: 85, foundry: 15, watchtower: 30 }
  },
  watchtower: {
    name: "북문 감시탑",
    travelFrom: { market: 18, riverside: 30, alley: 22, archive: 25, foundry: 40, clinic: 30 }
  }
};
