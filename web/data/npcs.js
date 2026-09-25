window.AnonymousRPG = window.AnonymousRPG || {};
AnonymousRPG.Data = AnonymousRPG.Data || {};
AnonymousRPG.Data.npcs = {
  mara: { name: "마라 벨라스", place: "market", trust: 0, faction: "merchants", role: "상인", goal: "안정적인 곡물 공급 유지", schedule: [
    { from: 6, to: 12, place: "market", action: "시장 거래", effect: "grain", announce: false },
    { from: 12, to: 15, place: "alley", action: "창고 장부 확인", effect: "grain", announce: true, signal: "warehouseSuspicion", signalText: "창고 장부에서 재고 불일치 정황을 발견했다." },
    { from: 15, to: 20, place: "market", action: "곡물 판매", effect: "grain", announce: false }
  ]},
  jonas: { name: "요나스 크렐", place: "riverside", trust: 0, faction: "workers", role: "부두 노동자", goal: "부두의 이상 화물 확인", schedule: [
    { from: 6, to: 12, place: "riverside", action: "하역 작업", announce: false },
    { from: 12, to: 18, place: "riverside", action: "화물 목록 대조", effect: "rumor", announce: true },
    { from: 18, to: 24, place: "riverside", action: "야간 선박 감시", effect: "rumor", announce: true, signal: "nightCargo", signalText: "예정표에 없는 선박의 움직임을 포착했다." }
  ]},
  serin: { name: "세린 오르도", place: "archive", trust: 0, faction: "archive", role: "기록관", goal: "오류가 있는 기록 추적", schedule: [
    { from: 7, to: 13, place: "archive", action: "공문서 대조", announce: false },
    { from: 13, to: 18, place: "archive", action: "토지 기록 조사", effect: "rumor", announce: true, signal: "recordInconsistency", signalText: "같은 토지 번호가 서로 다른 소유자와 날짜로 기록된 흔적을 확인했다." }
  ]},
  darma: { name: "다르마 누르", place: "hills", trust: 0, faction: "rural", role: "농민 대표", goal: "농촌 운송로 유지", schedule: [
    { from: 5, to: 11, place: "hills", action: "농촌 생산 확인", effect: "grain", announce: false },
    { from: 11, to: 17, place: "market", action: "운송 협상", effect: "grain", announce: true },
    { from: 17, to: 21, place: "hills", action: "마을 회의", effect: "tension", announce: false }
  ]},
  ibrahim: { name: "이브라힘 살릭", place: "market", trust: 0, faction: "guard", role: "경비대원", goal: "시장 치안 유지", schedule: [
    { from: 6, to: 14, place: "market", action: "시장 순찰", effect: "security", announce: false },
    { from: 14, to: 20, place: "alley", action: "골목 순찰", effect: "security", announce: true },
    { from: 20, to: 24, place: "market", action: "야간 경계", effect: "security", announce: true }
  ]},
  marta: { name: "마르타 켈", place: "alley", trust: 0, faction: "innkeepers", role: "여관 주인", goal: "소문과 손님의 흐름 관리", schedule: [
    { from: 6, to: 12, place: "alley", action: "여관 준비", announce: false },
    { from: 12, to: 18, place: "alley", action: "손님 응대", effect: "rumor", announce: true },
    { from: 18, to: 24, place: "alley", action: "손님들의 소문 기록", effect: "rumor", announce: true }
  ]},
  orel: { name: "오렐 다브", place: "alley", trust: 0, faction: "workers", role: "수리공", goal: "도시 시설 수리", schedule: [
    { from: 7, to: 13, place: "market", action: "시장 시설 수리", effect: "repair", announce: true },
    { from: 13, to: 19, place: "riverside", action: "부두 시설 수리", effect: "repair", announce: true }
  ]},
  lina: { name: "리나 벤", place: "clinic", trust: 0, faction: "innkeepers", role: "치료사", goal: "진료소 물자 순환 유지", schedule: [
    { from: 6, to: 11, place: "clinic", action: "진료소 진료", effect: "security", announce: true },
    { from: 11, to: 16, place: "market", action: "약재 조달 협상", effect: "rumor", announce: true },
    { from: 16, to: 21, place: "clinic", action: "환자 기록 대조", effect: "rumor", announce: true, signal: "waterLedgerGap", signalText: "진료소 배급 기록과 창고 장부의 수량이 맞지 않는다는 제보가 모였다." }
  ]},
  kael: { name: "카엘 도른", place: "foundry", trust: 0, faction: "workers", role: "주조장 감독", goal: "주조장 가동률과 식수 배급 안정", schedule: [
    { from: 6, to: 12, place: "foundry", action: "주조장 가동 점검", effect: "tension", announce: true },
    { from: 12, to: 17, place: "watchtower", action: "감시탑 급수선 점검", effect: "security", announce: true },
    { from: 17, to: 22, place: "foundry", action: "노동자 교대 조정", effect: "repair", announce: true, signal: "foundryWaterStress", signalText: "주조장과 감시탑 급수선에서 누수 흔적이 반복적으로 보고됐다." }
  ]}
};
