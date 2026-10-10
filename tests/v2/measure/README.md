# Road News 측정 도구 (D-110 2·4단계)

이 폴더는 **측정 도구**다. 테스트가 아니다.
- `tests/v2/run.js`는 `tests/v2/` 바로 아래의 `*.js`만 실행한다. 이 폴더(하위 폴더, `.mjs`·`.py`)는 실행하지 않는다.
- 일반 CI(`.github/workflows/phase251-check.yml`)도 이 폴더를 실행하지 않는다.
- 측정 결과를 고정한 회귀 테스트는 따로 있다: `tests/v2/data-world-road-news-measure.test.js`(결정적 표본, CI에서 돈다).

| 파일 | 내용 |
|---|---|
| `road-news-careers.mjs` | 실제 팩으로 호위 경력을 돌려 경력마다 JSON 한 행을 낸다(정책·지표는 파일 머리말) |
| `seeds.json` | 세계 seed 40개(`inj-*`, Death & Injury 측정과 같은 표본) |
| `agg.py` | 행을 모아 정책별 표, 휴식 선을 따라 간 경계, 같은 휴식 선끼리의 차이를 낸다(세계 단위 부트스트랩 95%, 2000회, 난수 7) |

## Trust Leverage 0단계 (MG-046.1, #318)

`TRUST_RULE="<T>,<X>"`를 주면 측정기가 팩의 **메모리 사본**에 후보 규칙을 덧댄다. 게임 파일은 바뀌지 않는다.
- 위험한 호위는 신뢰 T 이상에서만 열린다(T ≤ 10이면 관문 없음).
- 위험한 호위에 실패하면 신뢰를 X 잃는다.
- 행에는 `rule`, `eligible`, `gateBlocked`, `trustLost`가 더해진다.
- 설계와 판정 기준은 `docs/v2/trust-leverage-step0-design.md`에 있다.

```sh
TRUST_RULE=50,20 node tests/v2/measure/road-news-careers.mjs 0 10 8 120 blindD_r4,infoAvoid_r4 > /tmp/rn/t50x20_0.json
```

## 재현

```sh
# 저장소 루트에서. 출력 폴더는 저장소 밖에 둔다(결과 JSON은 commit하지 않는다)
OUT=/tmp/rn && mkdir -p $OUT
POLS=blindD_r4,blindN_r4,infoAvoid_r4,infoWhole_r4,blindD_r6,blindN_r6,infoAvoid_r6,infoWhole_r6
for c in 0 10 20 30; do node tests/v2/measure/road-news-careers.mjs $c $((c+10)) 8 120 $POLS > $OUT/base_$c.json & done; wait
python3 tests/v2/measure/agg.py base $OUT
```

- 인자: `<seed 시작> <seed 끝> <주사위 수> <일수> <정책,...> [dead]`.
  - 정책 이름은 `<계열>_r<휴식 hp>` 꼴이다.
  - `dead`를 주면 두목이 죽은 세계로 시작한다(측정용 연출).
- 같은 커밋, 같은 인자이면 결과는 바이트 단위로 같다(결정적).
- 다른 팩을 잴 때는 `PACK_ROOT=<폴더>`를 준다. 그 폴더 아래 `web/v2`의 팩을 쓴다. 예: Road News 이전 팩
  ```sh
  mkdir -p /tmp/old && git archive 12caed1 web/v2 | tar -x -C /tmp/old
  PACK_ROOT=/tmp/old node tests/v2/measure/road-news-careers.mjs 0 10 8 120 blindN_r6 > /tmp/rn/old_0.json
  python3 tests/v2/measure/agg.py base /tmp/rn old   # 같은 정책끼리 세계 단위로 짝지어 비교
  ```

## 환경과 기록

| 항목 | 값 |
|---|---|
| 측정한 커밋 | `704006b`(Road News 3단계, V2-Core-128). 4단계는 팩을 바꾸지 않았다 |
| Node | v22.22.0 |
| Python | 3.13 (표준 라이브러리만) |
| 시간 | 4코어에서 2,560경력(120일)이 약 1~2분 |
| 출처 | 2단계 세션의 scratchpad 스크립트(`rn_step2.mjs`, `agg.py`, `seeds.json`). 저장소로 옮기며 바뀐 점은 아래와 같다 |

저장소로 옮기며 바뀐 점:
- 팩 경로를 절대 경로에서 이 파일 기준 상대 경로와 `PACK_ROOT`로 바꿨다.
- 4단계 정책을 더했다: 지연 장부 반사실 `lagAvoid`·`lagWhole`.
- 지표를 더했다: `asksUnknown`, `dangerUnknown`.
- `agg.py`에 다른 태그와의 비교를 더했다.

기존 정책 7개 계열은 원본 스크립트와 **출력이 같다**. 5개 세계 × 2주사위 × 7정책을 비교해 새 필드를 뺀 모든 행이 일치했다.

## 기준선 재현 (커밋 `704006b`)

2단계(V2-Core-127, `b605b23`)에 기록된 표가 3단계 커밋 `704006b`에서 그대로 재현되었다. 측정 조건은 40세계 × 8주사위, 120일, 두목 생존이다. 3단계는 테스트만 더했으므로, 같은 결과는 구현이 바뀌지 않았다는 확인이기도 하다.

| 휴식 | blindD | blindN | infoAvoid | infoWhole |
|---|---|---|---|---|
| ≤6 | 사망 0.59 · 은화 274 | 0.38 · 221 | 0.38 · 277 | 0.38 · 301 |
| ≤4 | 0.68 · 264 | 0.47 · 215 | 0.47 · 265 | 0.47 · 289 |

차이(세계 단위 95%):
- `infoAvoid − blindD`: 사망 −0.21 [−0.27, −0.16](r4), −0.21 [−0.26, −0.16](r6).
- `infoAvoid − blindN`: 은화 +50.8 [+46.6, +55.4](r4), +56.8 [+52.9, +61.0](r6).
