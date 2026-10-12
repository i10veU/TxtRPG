# #335 (appendix G of docs/v2/people-of-ford-and-town-step0-design.md): diagnostics of B3 and the trade economics, judged by the
# rules fixed in G.4 before measuring. B3 itself stays trade-judge.py's (ferryInfo, 60-95%); nothing here replaces it.
# Usage: python3 trade-diag.py <dir> [prefix]   reads <dir>/<prefix>p_*.json (policies) and <dir>/<prefix>k*_*.json (candidates)
import json, glob, sys, random, math

DIR = sys.argv[1]
PRE = sys.argv[2] if len(sys.argv) > 2 else ""

def load(pat):
    rows = []
    for f in sorted(glob.glob(f"{DIR}/{PRE}{pat}.json")):
        rows += json.load(open(f))
    return rows

def units(rows, pol):
    out = {}
    for r in rows:
        if r["pol"] == pol:
            out.setdefault(f'{r["seed"]}:{r["k"]}', []).append(r)
    return out

def boot(fn, keys, n=2000):
    rnd = random.Random(7)
    pt = fn(keys)
    ds = sorted(fn([rnd.choice(keys) for _ in keys]) for _ in range(n))
    return pt, ds[int(0.025 * n)], ds[int(0.975 * n)]

def ratio(U, keys, num, den):
    a = sum(num(r) for k in keys for r in U[k]); b = sum(den(r) for k in keys for r in U[k])
    return a / b if b else 0.0

def diff_ratio(UA, UB, num, den):
    keys = sorted(set(UA) & set(UB))
    return boot(lambda ks: ratio(UA, ks, num, den) - ratio(UB, ks, num, den), keys)

def diff_mean(UA, UB, key):
    keys = sorted(set(UA) & set(UB))
    m = lambda U, ks: sum(key(r) for k in ks for r in U[k]) / sum(len(U[k]) for k in ks)
    return boot(lambda ks: m(UA, ks) - m(UB, ks), keys)

def fmt(t, p=1, pct=False):
    f = 100 if pct else 1
    return f"{f * t[0]:+.{p}f} [{f * t[1]:+.{p}f}, {f * t[2]:+.{p}f}]"

def sd(a):
    mu = sum(a) / len(a)
    return math.sqrt(sum((x - mu) ** 2 for x in a) / max(len(a) - 1, 1))

P = load("p_*")
pols = [p for p in ("blind", "ferryInfo", "noteHonest", "latestOnly", "askAfter", "consensus", "sourceTrack", "abstain") if any(r["pol"] == p for r in P)]
U = {p: units(P, p) for p in pols}
right = lambda r: r["beliefRight"]
beliefs = lambda r: r["beliefs"]

print(f"== G.3 diagnostics ({len(P)} careers)")
print("  policy       match%   n   meanAge valid% stale% beforeOwnSale%  src(m/f)  acc(m)  acc(f)  ferryNewest% merchantNewest%  byAge 0/1/2/3+ (n:acc%)")
for p in pols:
    R = [r for r in P if r["pol"] == p]
    b = sum(r["beliefs"] for r in R)
    if not b:
        print(f"  {p:12} (no beliefs)"); continue
    D = lambda f: sum(f(r["diag"]) for r in R)
    sm, sf = D(lambda g: g["src"]["merchant"][0]), D(lambda g: g["src"]["ferryman"][0])
    am = D(lambda g: g["src"]["merchant"][1]) / sm if sm else float("nan")
    af = D(lambda g: g["src"]["ferryman"][1]) / sf if sf else float("nan")
    fn_, fr = D(lambda g: g["ferryNewest"][0]), D(lambda g: g["ferryNewest"][1])
    mn, mr = D(lambda g: g["merchantNewest"][0]), D(lambda g: g["merchantNewest"][1])
    ages = " ".join(f"{D(lambda g, i=i: g['byAge'][i][0])}:{100 * D(lambda g, i=i: g['byAge'][i][1]) / max(D(lambda g, i=i: g['byAge'][i][0]), 1):.0f}" for i in range(4))
    print(f"  {p:12} {100 * sum(r['beliefRight'] for r in R) / b:5.1f} {b:5} {D(lambda g: g['ageSum']) / b:7.2f} {100 * D(lambda g: g['valid']) / b:6.1f} {100 * D(lambda g: g['stale']) / b:6.1f} {100 * D(lambda g: g['beforeOwnSale']) / b:13.1f}  {sm}/{sf}  {100 * am:6.1f}  {100 * af:6.1f}  {100 * fr / max(fn_, 1):11.1f} {100 * mr / max(mn, 1):14.1f}  {ages}")

verdict = {}
if "ferryInfo" in U:
    FI = U["ferryInfo"]; keys = sorted(FI)
    # H1: the policy's own sale makes the merchant's word stale
    bos = ratio(FI, keys, lambda r: r["diag"]["beforeOwnSale"], beliefs)
    if "askAfter" in U:
        h1 = diff_ratio(U["askAfter"], FI, right, beliefs)
        verdict["H1"] = "supported" if h1[1] > 0 and bos >= 0.20 else "rejected" if h1[2] <= 0 else "inconclusive"
        print(f"H1 own sale: askAfter - ferryInfo match {fmt(h1, 1, True)}pp; ferryInfo beforeOwnSale {100 * bos:.1f}% -> {verdict['H1']}")
    # H2: age -- fresh words (age 0) against older ones, within ferryInfo
    a0 = lambda r: r["diag"]["byAge"][0]
    old = lambda r: sum(r["diag"]["byAge"][i][j] for i in (1, 2, 3) for j in (0,)), lambda r: sum(r["diag"]["byAge"][i][1] for i in (1, 2, 3))
    h2 = boot(lambda ks: ratio(FI, ks, lambda r: a0(r)[1], lambda r: a0(r)[0]) - ratio(FI, ks, old[1], old[0]), keys)
    verdict["H2"] = "supported" if h2[1] >= 0.10 else "rejected" if h2[2] < 0.10 else "inconclusive"
    print(f"H2 age: ferryInfo match at age 0 - age 1+ {fmt(h2, 1, True)}pp (needs lower bound >= +10pp) -> {verdict['H2']}")
    # H3: who said it -- each teller's newest word at the crossing, same crossings
    h3 = boot(lambda ks: ratio(FI, ks, lambda r: r["diag"]["ferryNewest"][1], lambda r: r["diag"]["ferryNewest"][0]) - ratio(FI, ks, lambda r: r["diag"]["merchantNewest"][1], lambda r: r["diag"]["merchantNewest"][0]), keys)
    verdict["H3"] = "ferryman" if h3[1] > 0 else "merchant" if h3[2] < 0 else "no difference"
    print(f"H3 source: ferryman's newest - merchant's newest match {fmt(h3, 1, True)}pp -> {verdict['H3']}")

print("\n== information vs none, and accuracy vs profit (wealth over 60 days, start 20)")
for p in pols:
    if p == "blind" or "blind" not in U: continue
    w = diff_mean(U[p], U["blind"], lambda r: r["wealth"])
    R = [r for r in P if r["pol"] == p]; b = sum(r["beliefs"] for r in R)
    print(f"  {p:12} - blind {fmt(w)}   match {100 * sum(r['beliefRight'] for r in R) / max(b, 1):.1f}%  heldBack {sum(r['heldBack'] for r in R) / len(R):.1f}  trips {sum(r['trips'] for r in R) / len(R):.1f}")

def econ(tag, rows, pol):
    R = [r for r in rows if r["pol"] == pol]
    if not R: return
    daily = [(r["wealth"] - 20) / r["days"] for r in R]
    mu = sum(daily) / len(daily)
    print(f"  {tag:10} {pol:11} daily {mu:5.2f} sd {sd(daily):4.2f} min {min(daily):5.2f}  bought {sum(r['bought'] for r in R) / len(R):5.1f} (outlay {2 * sum(r['bought'] for r in R) / len(R):5.1f})  sold {sum(r['sold'] for r in R) / len(R):5.1f}  fares {sum(r['fares'] for r in R) / len(R):4.1f}  unsold {sum(r['arrivedUnsold'] for r in R) / len(R):4.1f}  asks {sum(r['asks'] for r in R) / len(R):4.1f}  waits {sum(r['waits'] for r in R) / len(R):4.1f}  noteX {sum(r['noteCrossings'] for r in R) / len(R):4.1f}")
    return mu, sd(daily)

print("\n== G.5 contract and free trade (daily = (wealth - 20) / days)")
for p in ("blind", "ferryInfo", "noteHonest"): econ("pack", P, p)
for c in ("k1", "k2"):
    K = load(f"{c}_*")
    for p in ("blind", "ferryInfo", "noteHonest"): econ(c, K, p)
S = load("short_*")
if S:
    for p in ("blind", "ferryInfo", "noteHonest"): econ("20 days", S, p)

print("\nverdict:", json.dumps(verdict))
