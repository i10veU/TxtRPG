# MG-045/046 step 1 (#328): judges candidates M1 and F1 by the criteria fixed before measuring
# (docs/v2/people-of-ford-and-town-step0-design.md, appendix A). Usage:
#   python3 people-judge.py <dir> [prefix]
# reads <dir>/<prefix><tag>_*.json for the tags base, m1, f1 (rows of road-news-careers.mjs; see appendix A.5 for the runs).
# A missing tag is reported as not measured. Standard library only; the bootstrap is the one trust-judge.py uses.
import json, glob, sys, random

DIR = sys.argv[1]
PRE = sys.argv[2] if len(sys.argv) > 2 else ""
RESTS = (4, 6)

def load(tag):
    rows = []
    for f in sorted(glob.glob(f"{DIR}/{PRE}{tag}_*.json")):
        rows += json.load(open(f))
    return rows

def by_seed(rows, pol, key):
    out = {}
    for r in rows:
        if r["pol"] == pol:
            out.setdefault(r["seed"], []).append(key(r) if callable(key) else r.get(key, 0))
    return out

def mean(a):
    return sum(a) / len(a) if a else 0.0

def boot(fn, seeds, n=2000):
    rnd = random.Random(7)
    pt = fn(seeds)
    ds = sorted(fn([rnd.choice(seeds) for _ in seeds]) for _ in range(n))
    return pt, ds[int(0.025 * n)], ds[int(0.975 * n)]

def diff(A, B):
    return lambda ss: mean([x for s in ss for x in A[s]]) - mean([x for s in ss for x in B[s]])

def fmt(t, p=2):
    return f"{t[0]:+.{p}f} [{t[1]:+.{p}f}, {t[2]:+.{p}f}]"

def paired(ra, pa, rb, pb, key):
    A, B = by_seed(ra, pa, key), by_seed(rb, pb, key)
    seeds = sorted(set(A) & set(B))
    return boot(diff(A, B), seeds)

def d2(rows, label):  # Road News 2단계 criteria, unchanged (D2)
    ok = True
    for r in RESTS:
        dd = paired(rows, f"infoAvoid_r{r}", rows, f"blindD_r{r}", "deaths")
        dw = paired(rows, f"infoAvoid_r{r}", rows, f"blindN_r{r}", "wealth")
        ok &= dd[2] < 0 and dw[1] > 0
        print(f"  D2 {label} r{r}: infoAvoid-blindD deaths {fmt(dd)} | infoAvoid-blindN wealth {fmt(dw, 1)}")
    print(f"  D2 {label}: {'pass' if ok else 'FAIL'}")
    return ok

def d3(rows, base, label):  # MG-046.1's results stay (D3, appendix A.4): trust lost and the ledger's match at decisions
    ok = True
    for r in RESTS:
        lost = paired(rows, f"infoAvoid_r{r}", base, f"infoAvoid_r{r}", lambda x: 1 if x.get("trustLost", 0) > 0 else 0)
        lostD = paired(rows, f"blindD_r{r}", base, f"blindD_r{r}", lambda x: 1 if x.get("trustLost", 0) > 0 else 0)
        ex = paired(rows, f"infoAvoid_r{r}", base, f"infoAvoid_r{r}", lambda x: x["exact"] / x["decisions"] if x.get("decisions") else 0)
        ok &= all(t[1] <= 0 <= t[2] for t in (lost, lostD, ex))
        print(f"  D3 {label} r{r}: careers that lost the guild's trust, infoAvoid {fmt(lost)} blindD {fmt(lostD)} | ledger match at decisions {fmt(ex)}")
    print(f"  D3 {label}: {'pass' if ok else 'FAIL'} (every interval holds 0)")
    return ok

def parity(rows, base, pols, drop):  # careers of policies that never use the candidate: identical rows (but `drop`)
    key = lambda r: (r["pol"], r["seed"], r["k"])
    B = {key(r): {k: v for k, v in r.items() if k not in drop} for r in base if r["pol"] in pols}
    R = {key(r): {k: v for k, v in r.items() if k not in drop} for r in rows if r["pol"] in pols}
    same = sum(1 for k in B if R.get(k) == B[k])
    return same, len(B)

base, m1, f1 = load("base"), load("m1"), load("f1")
verdict = {}

print("== M1 상인 — 지난 상단의 말")
if not m1:
    print("  not measured")
else:
    prim = True
    for r in RESTS:
        w = paired(m1, f"mercAvoid_r{r}", m1, f"infoAvoid_r{r}", "wealth")
        dth = paired(m1, f"mercAvoid_r{r}", m1, f"infoAvoid_r{r}", "deaths")
        prim &= w[1] > 0
        print(f"  C2 r{r}: mercAvoid-infoAvoid wealth {fmt(w, 1)} (primary, +) | deaths {fmt(dth)} (report)")
        reach = paired(m1, f"mercAvoid_r{r}", m1, f"infoAvoid_r{r}", lambda x: 1 if x.get("mercAsks", 0) > 0 else 0)
        print(f"  A2 r{r}: share of careers that reached the merchant's word, difference {fmt(reach)}")
        wa = paired(m1, f"mercAlone_r{r}", m1, f"eyesAvoid_r{r}", "wealth")
        da = paired(m1, f"mercAlone_r{r}", m1, f"eyesAvoid_r{r}", "deaths")
        print(f"  secondary r{r}: mercAlone-eyesAvoid wealth {fmt(wa, 1)} | deaths {fmt(da)}")
        ww = paired(m1, f"mercWhole_r{r}", m1, f"infoWhole_r{r}", "wealth")
        print(f"  secondary r{r}: mercWhole-infoWhole wealth {fmt(ww, 1)}")
    asks = sum(x.get("mercAsks", 0) for x in m1)
    exact = sum(x.get("mercExact", 0) for x in m1)
    b3 = asks > 0 and 0.60 <= exact / asks <= 0.95
    print(f"  B3: the merchant's word matched the road when asked {exact}/{asks} = {100 * exact / max(asks, 1):.1f}% -> {'pass' if b3 else 'FAIL'} (60-95%)")
    closed = sum(x.get("mercClosed", 0) for x in m1 if x["pol"].startswith("merc"))
    print(f"  A4/report: asks refused for want of regard {closed}; end regard (merc*): {sorted({x['relMerchant'] for x in m1 if x['pol'].startswith('merc')})}")
    if base:
        same, n = parity(m1, base, {f"{p}_r{r}" for p in ("blindN", "blindD", "infoAvoid", "infoWhole", "eyesAvoid") for r in RESTS}, {"relMerchant"})
        print(f"  D parity: careers that never ask the merchant, identical to the current pack but the regard: {same}/{n}")
    ok2 = d2(m1, "m1")
    ok3 = d3(m1, base, "m1") if base else None
    verdict["M1"] = {"C2": prim, "B3": b3, "D2": ok2, "D3": ok3}
    print(f"  primary C2: {'pass' if prim else 'FAIL'}")

print("== F1 뱃사공 — 짐을 건넨 호위")
if not f1 or not base:
    print("  not measured")
else:
    prim = True
    for r in RESTS:
        for p in ("infoAvoid", "blindN", "blindD"):
            w = paired(f1, f"{p}_r{r}", base, f"{p}_r{r}", "wealth")
            dth = paired(f1, f"{p}_r{r}", base, f"{p}_r{r}", "deaths")
            if p == "infoAvoid":
                prim &= w[1] > 0
            print(f"  C2 r{r} {p}: F1 pack - current pack wealth {fmt(w, 1)}{' (primary, +)' if p == 'infoAvoid' else ''} | deaths {fmt(dth)}")
        reach = paired(f1, f"infoAvoid_r{r}", base, f"infoAvoid_r{r}", lambda x: 1 if x.get("ferryFree", 0) > 0 else 0)
        print(f"  A2 r{r}: share of careers that crossed for nothing, difference {fmt(reach)}")
    print(f"  A4/report: end regard of the ferryman {sorted({x['relFerry'] for x in f1})[:12]}... free crossings {sum(x.get('ferryFree', 0) for x in f1)}")
    ok2 = d2(f1, "f1")
    ok3 = d3(f1, base, "f1")
    verdict["F1"] = {"C2": prim, "D2": ok2, "D3": ok3}
    print(f"  primary C2: {'pass' if prim else 'FAIL'}")

if base:
    d2(base, "current")
print("\nverdict:", json.dumps(verdict, ensure_ascii=False))
