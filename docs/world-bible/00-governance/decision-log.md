# World Bible 결정 기록

형식: `WB-NNNN | 날짜 | 결정 | 근거 | 영향 | 승인`

정본을 바꾸는 모든 결정은 여기에 남긴다. 기록이 없는 정본 변경은 무효다.

---

## WB-0001 — World Bible 브랜치와 권위 구조

- **날짜**: 2026-10-03
- **결정**: 세계관·설정·연대기·인물·세계 구조는 `docs/world-bible` 브랜치에서 개발한다. 이 브랜치는 `main`에서
  만들며 `feature/v2-core`와 독립이고 문서만 포함한다. World Bible은 *설정*의 기준이고, 엔진 *규칙*은
  `CORE_CONTRACTS.md`가 기준이다.
- **근거**: 소유자의 브랜치 구조 결정(main / feature/v2-core / docs/world-bible). Slice 4가 지역·바깥 세상의
  지속적인 설정을 도입하기 시작했으므로, 더 확장하기 전에 권위 있는 설정 방향이 필요하다.
- **영향**: `feature/v2-core`의 세계 확장(Slice 4 4단계 이후)은 World Bible의 초기 틀이 세워질 때까지 멈춘다.
- **승인**: 소유자 지시 (2026-10-03).

## WB-0002 — 기존 자료의 등급

- **날짜**: 2026-10-03
- **결정**:
  - `docs/world/world-design-principles.md` — 세계 설계의 **원칙**으로 채택한다(설정 사실이 아니라 설계 방법).
  - `docs/world/source-analysis.md` — 원칙의 배경 자료(`Research`).
  - `docs/world/mythology-transcendence-research.md` — `Research`. 문서 스스로 "research input, not final canon"이라고 밝힌다.
  - `docs/world/world-continuity.md`(브랜치 `docs/world-continuity-rules`, 아직 `main`에 없음) — 세계 연속성 **원칙**의
    후보. 이 브랜치에서는 요약해 참조하고(`01-foundations/world-continuity.md`), 원문 병합 여부는 소유자가 정한다.
- **근거**: 각 문서의 성격(원칙 / 자료)과 스스로 밝힌 지위.
- **영향**: 위 자료로부터 세계 *사실*을 정본으로 만들지 않는다. 원칙만 적용한다.
- **승인**: 초기 구축 제안. 소유자 확인 필요.

## WB-0003 — 구현된 설정은 Provisional

- **날짜**: 2026-10-03
- **결정**: `feature/v2-core`의 Vertical Slice 1–4에 구현된 장소·인물·조직·사건·소문은 `Provisional`로
  `canon-review/v2-implemented-content.md`에 정리한다. 정본 검토 전에는 이 설정들을 더 확장하지 않는다.
- **근거**: 게임 콘텐츠가 World Bible보다 먼저 만들어졌다. 지우거나 정본으로 자동 승격하지 않고 검토 대상으로 둔다.
- **영향**: Slice 4의 남은 단계와 이후 세계 확장은 이 검토와 `99-open-questions.md`의 결정을 근거로 한다.
- **승인**: 초기 구축 제안. 소유자 확인 필요.
