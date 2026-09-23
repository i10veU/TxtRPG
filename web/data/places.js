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
    travelFrom: { market: 90, riverside: 110, alley: 100, archive: 95 }
  }
};
