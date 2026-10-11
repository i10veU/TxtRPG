# MG-045/046 step 2 (#328): judges the flour-trade careers by the criteria fixed before measuring
# (docs/v2/people-of-ford-and-town-step0-design.md, appendix C.4). Usage: python3 trade-judge.py <dir> [prefix]
# reads <dir>/<prefix>new_*.json (the pack with the change: blind, ferryInfo, noteHonest) and <dir>/<prefix>old_*.json (the pack
# before it: blind). Standard library only; the bootstrap is the one trust-judge.py and people-judge.py use.
import json, glob, sys, random

DIR = sys.argv[1]
PRE = sys.argv[2] if len(sys.argv) > 2 else ""

def load(tag):
    rows = []
    for f in sorted(glob.glob(f"{DIR}/{PRE}{tag}_*.json")):
        rows += json.load(open(f))
    return rows

def by_seed(rows, pol, key):
    out = {}
    for r in rows:
        if r["pol"] == pol:
            out.setdefault(r["seed"], []).append(key(r) if callable(key) else r[key])
    return out

def mean(a):
    return sum(a) / len(a) if a else 0.0

def boot(fn, seeds, n=2000):
    rnd = random.Random(7)
    pt = fn(seeds)
    ds = sorted(fn([rnd.choice(seeds) for _ in seeds]) for _ in range(n))
    return pt, ds[int(0.025 * n)], ds[int(0.975 * n)]

def paired(ra, pa, rb, pb, key):
    A, B = by_seed(ra, pa, key), by_seed(rb, pb, key)
    seeds = sorted(set(A) & set(B))
    return boot(lambda ss: mean([x for s in ss for x in A[s]]) - mean([x for s in ss for x in B[s]]), seeds)

def fmt(t, p=2):
    return f"{t[0]:+.{p}f} [{t[1]:+.{p}f}, {t[2]:+.{p}f}]"

new, old = load("new"), load("old")
print(f"== careers: new {len(new)}, old {len(old)}")
cols = ("wealth", "money", "flour", "trips", "sold", "fares", "noteCrossings", "notesTaken", "waits", "heldBack", "arrivedUnsold", "relMerchant", "relFerry")
for tag, rows in (("old", old), ("new", new)):
    for pol in sorted({r["pol"] for r in rows}):
        R = [r for r in rows if r["pol"] == pol]
        print(f"  {tag} {pol:11} " + " ".join(f"{c} {mean([r[c] for r in R]):.2f}" for c in cols))

verdict = {}
c2 = paired(new, "ferryInfo", new, "blind", "wealth")
verdict["C2_info"] = c2[1] > 0
print(f"C2 (information) ferryInfo - blind wealth {fmt(c2, 1)} -> {'pass' if verdict['C2_info'] else 'FAIL'}")
a2 = paired(new, "noteHonest", new, "ferryInfo", lambda r: 1 if r["noteCrossings"] > 0 else 0)
verdict["A2"] = a2[1] > 0 or a2[2] < 0
print(f"A2 (relation reached) noteHonest - ferryInfo share with a note crossing {fmt(a2)} -> {'pass' if verdict['A2'] else 'FAIL'}")
c2r = paired(new, "noteHonest", new, "ferryInfo", "wealth")
verdict["C2_relation"] = c2r[1] > 0
print(f"C2 (relation's result) noteHonest - ferryInfo wealth {fmt(c2r, 1)} -> {'pass' if verdict['C2_relation'] else 'FAIL'}")
FI = [r for r in new if r["pol"] == "ferryInfo"]
b, right = sum(r["beliefs"] for r in FI), sum(r["beliefRight"] for r in FI)
verdict["B3"] = b > 0 and 0.60 <= right / b <= 0.95
print(f"B3 ferryInfo belief at crossing matches the town's want {right}/{b} = {100 * right / max(b, 1):.1f}% -> {'pass' if verdict['B3'] else 'FAIL'} (60-95%)")
if old:
    side = paired(new, "blind", old, "blind", "wealth")
    print(f"D(4) report: blind, new pack - pack before, wealth {fmt(side, 1)} (the caravan's competition, disclosed before measuring)")
    for c in ("sold", "fares", "arrivedUnsold"):
        print(f"     {c}: {fmt(paired(new, 'blind', old, 'blind', c))}")
print("\nverdict:", json.dumps(verdict))
