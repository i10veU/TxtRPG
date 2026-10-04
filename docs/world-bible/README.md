# 무명의 연대기 — World Bible

이 디렉터리는 TxtRPG(「무명의 연대기」)의 **세계관 정본(canon)과 설정 설계 틀**을 관리한다.
게임 시스템과 콘텐츠 구현은 `feature/v2-core`에서, 세계관·설정·연대기·인물·세계 구조는
`docs/world-bible`에서 개발한다.

```
main                    안정된 정식 기준
├── feature/v2-core     게임 시스템·콘텐츠 개발 (Core, 데이터팩, 테스트)
└── docs/world-bible    세계관·설정·연대기·인물·세계 구조 개발 (이 디렉터리)
```

## 이 문서의 권위

- **설정(무엇이 세계에 존재하고 어떤 역사를 가지는가)**: World Bible이 기준이다.
  게임 데이터팩의 설정은 World Bible의 항목을 근거로 해야 한다.
- **규칙(엔진이 어떻게 동작하는가)**: `docs/v2/architecture/CORE_CONTRACTS.md`와
  `docs/v2/DEVELOPMENT_RULES.md`가 기준이다. World Bible은 엔진 규칙을 정하지 않는다.
- 둘이 충돌하면 임의로 한쪽을 고치지 않고 `00-governance/decision-log.md`에 결정을 기록한다.

## 구조

| 경로 | 내용 |
|---|---|
| `00-governance/` | 정본 등급과 승격 절차, 결정 기록, 용어 |
| `01-foundations/` | 마스터 방향, 설계 원칙, 세계 구조(층위·시간·정보), 연속성 원칙 |
| `02-world/` | 세계 개요, 우주관·신앙, 연대기 (대부분 미결) |
| `03-geography/` | 지역·장소 항목 |
| `04-peoples-and-factions/` | 조직·세력, 인물 |
| `05-world-systems/` | 세계 속의 경제·능력·정보 체계 (사회적 의미) |
| `canon-review/` | 게임에 이미 구현된 설정의 목록과 항목별 검토 추천, 미결 질문에 대한 추천 (모두 `Draft`, 결정은 `00-governance/decision-log.md`) |
| `templates/` | 새 항목을 쓸 때 쓰는 양식 |
| `99-open-questions.md` | 소유자의 결정이 필요한 질문 |

## 현재 상태 (초기 구축)

- 이 브랜치는 `main`에서 만들었고 `feature/v2-core`와 독립이다. 문서만 포함한다.
- **정본(2026-10-04, WB-0004 ~ WB-0013)** — 승인된 범위만:
  - *방향*: 여러 세계·장르를 담는 메가월드, 세계별 성장체계, 세계 간 확장 지원(WB-0014, `01-foundations/master-direction.md`).
  - *원칙*: 세계 연속성 원칙(WB-0005), 「무명의 연대기」의 주제 원칙(WB-0007), 명명 원칙(WB-0013), 검토 절차(WB-0004, WB-0006).
  - *세계의 사실*: 남쪽 변경의 기술 수준과 지역별 차이(WB-0008), 초자연 현상의 존재(WB-0009, 범위 제한),
    왕국의 구조와 남쪽 변경의 자치(WB-0010), 왕도의 역할(WB-0011), 먼 국경의 분쟁의 존재(WB-0012, 범위 제한).
- 그 밖의 모든 세계 설정은 `Provisional`(구현됨·검토 대기), `Draft`(제안), `Research`(자료) 중 하나다.
  우주관·신앙·초월(Q-4, Q-5), 고유명, 깊은 역사는 의도적으로 미결이다 (`99-open-questions.md`).
- `feature/v2-core`의 Vertical Slice 1–4(변경 마을과 주변 지역)에 구현된 설정은
  `canon-review/v2-implemented-content.md`에 `Provisional`로 정리했다.
- 기존 자료(`docs/world/*.md`)는 옮기거나 고치지 않고 이 문서들에서 참조한다.

## 작업 규칙

1. 새 설정은 `templates/`의 양식으로 쓰고, 등급을 명시한다.
2. 새 설정은 기존 요소와 최소 하나 이상 연결한다 (설계 원칙 §11).
3. `Draft` → `Canon` 승격은 소유자의 승인과 결정 기록이 필요하다 (`00-governance/canon-policy.md`).
4. 실제 문화권의 신화·역사를 쓸 때는 출처 우선순위를 지키고, 서로 다른 전통을 하나로 뭉뚱그리지 않는다
   (`docs/world/mythology-transcendence-research.md`의 Design Gate).
5. 특정 원작의 고유 설정을 그대로 복제하지 않는다 (설계 원칙 §12).
