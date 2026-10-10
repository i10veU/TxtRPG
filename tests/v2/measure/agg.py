# Aggregates the rows of road-news-careers.mjs. Usage: python3 agg.py <tag> [dir] [other-tag]
# reads <dir>/<tag>_*.json; with <other-tag>, also compares each policy against the same policy under <other-tag> (e.g. an older
# pack), paired by world.
import json, glob, sys, random, statistics as st
tag = sys.argv[1]
DIR = sys.argv[2] if len(sys.argv) > 2 else '.'
def load(t):
    out = []
    for f in sorted(glob.glob(f"{DIR}/{t}_*.json")):
        out += json.load(open(f))
    return out
rows = load(tag)
pols = []
for r in rows:
    if r["pol"] not in pols: pols.append(r["pol"])
by = {p: [r for r in rows if r["pol"] == p] for p in pols}
mean = lambda a: sum(a) / len(a) if a else float("nan")
def med(a):
    a = sorted(x for x in a if x is not None); return a[len(a) // 2] if a else None
def summ(R):
    off = [sum(r["offered"][i] for r in R) for i in range(3)]
    dz = [sum(r["dz"][i] for r in R) for i in range(3)]
    bk = sum(r["beliefKnown"] for r in R); dec = sum(r["decisions"] for r in R)
    return dict(n=len(R), deaths=mean([r["deaths"] for r in R]), known=mean([r["known"] for r in R]), deep=mean([r["deepNew"] for r in R]),
                wealth=mean([r["wealth"] for r in R]), gear=med([r["gearDay"] for r in R]), geared=mean([r["gearDay"] is not None for r in R]),
                lost=mean([r["lost"] for r in R]), convoys=mean([r["convoys"] for r in R]),
                take=[dz[i] / off[i] if off[i] else float("nan") for i in range(3)], offered=off,
                informed=bk / dec if dec else float("nan"), exact=sum(r["exact"] for r in R) / bk if bk else float("nan"),
                safer=sum(r["wrongSafe"] for r in R) / bk if bk else float("nan"), age=sum(r["ageSum"] for r in R) / bk if bk else float("nan"),
                warier=sum(r["wrongDanger"] for r in R) / bk if bk else float("nan"),
                unknownDanger=sum(r.get("dangerUnknown", 0) for r in R) / sum(sum(r["offered"]) for r in R) if sum(sum(r["offered"]) for r in R) else float("nan"))
S = {p: summ(R) for p, R in by.items()}
print(f"== {tag}: {len(rows)} careers, {len(pols)} policies")
print(f"{'policy':16s} {'n':>4s} {'deaths':>6s} {'known':>6s} {'deep':>5s} {'wealth':>7s} {'gearDay':>7s} {'geared':>6s} {'lost':>5s} {'take q/u/d %':>16s} {'exact%':>6s} {'safer%':>6s} {'warier%':>7s} {'age':>4s} {'unkn%':>5s}")
for p, s in S.items():
    take = "/".join("—" if x != x else f"{100*x:.0f}" for x in s["take"])
    pct = lambda x: "—" if x != x else f"{100*x:.0f}"
    print(f"{p:16s} {s['n']:4d} {s['deaths']:6.2f} {s['known']:6.2f} {s['deep']:5.2f} {s['wealth']:7.1f} {s['gear'] if s['gear'] is None else round(s['gear'],1)!s:>7s} {100*s['geared']:5.0f}% {s['lost']:5.2f} {take:>16s} {pct(s['exact']):>6s} {pct(s['safer']):>6s} {pct(s['warier']):>7s} {'—' if s['age']!=s['age'] else round(s['age'],1)!s:>4s} {pct(s['unknownDanger']):>5s}")

# frontiers along the rest-hp dial: (deaths, wealth) per family
fam = {}
for p, s in S.items():
    f, r = p.rsplit("_r", 1); fam.setdefault(f, []).append((int(r), s["deaths"], s["wealth"]))
def interp(points, x, xi, yi):
    pts = sorted(points, key=lambda t: t[xi])
    for a, b in zip(pts, pts[1:]):
        if a[xi] <= x <= b[xi] and b[xi] != a[xi]:
            return a[yi] + (b[yi] - a[yi]) * (x - a[xi]) / (b[xi] - a[xi])
    return None
if len(fam) > 1 and all(len(v) >= 2 for v in fam.values()):
    print("\nfrontiers (rest hp: deaths / wealth):")
    for f, v in fam.items(): print(f"  {f:12s} " + "  ".join(f"r{r}: {dd:.2f}/{w:.0f}" for r, dd, w in sorted(v)))
    if "blindN" in fam and "blindD" in fam:
        for ref in sorted(fam["blindN"]):
            x = ref[1]
            print(f"  equal risk (deaths {x:.2f} = blindN r{ref[0]}): wealth " + ", ".join(f"{f} {interp(v, x, 1, 2):.0f}" if interp(v, x, 1, 2) is not None else f"{f} n/a" for f, v in fam.items()))
        for ref in sorted(fam["blindD"]):
            x = ref[2]
            print(f"  equal silver (wealth {x:.0f} = blindD r{ref[0]}): deaths " + ", ".join(f"{f} {interp(v, x, 2, 1):.2f}" if interp(v, x, 2, 1) is not None else f"{f} n/a" for f, v in fam.items()))

# paired differences at the same rest point, bootstrap over worlds (seeds)
def boot(a, b, key, n=2000):
    seeds = sorted({r["seed"] for r in by[a]})
    A = {s: [r[key] for r in by[a] if r["seed"] == s] for s in seeds}
    B = {s: [r[key] for r in by[b] if r["seed"] == s] for s in seeds}
    rnd = random.Random(7); ds = []
    for _ in range(n):
        pick = [rnd.choice(seeds) for _ in seeds]
        ds.append(mean([x for s in pick for x in A[s]]) - mean([x for s in pick for x in B[s]]))
    ds.sort(); return mean([x for s in seeds for x in A[s]]) - mean([x for s in seeds for x in B[s]]), ds[int(0.025 * n)], ds[int(0.975 * n)]
print("\npaired (same rest hp), A - B, 95% bootstrap over worlds:")
for r in (2, 4, 6, 8):
    for a, b in (("infoAvoid", "blindD"), ("infoWhole", "blindD"), ("infoAvoid", "blindN"), ("staleAvoid", "infoAvoid"), ("eyesAvoid", "infoAvoid"), ("coarseAvoid", "infoAvoid"),
                 ("lagAvoid", "infoAvoid"), ("lagAvoid", "blindD"), ("lagAvoid", "blindN"), ("lagWhole", "infoWhole"), ("lagWhole", "blindD")):
        A, B = f"{a}_r{r}", f"{b}_r{r}"
        if A in by and B in by:
            dd = boot(A, B, "deaths"); dw = boot(A, B, "wealth")
            print(f"  r{r} {a:11s} - {b:10s}: deaths {dd[0]:+.2f} [{dd[1]:+.2f},{dd[2]:+.2f}]  wealth {dw[0]:+.1f} [{dw[1]:+.1f},{dw[2]:+.1f}]")

# the same policy under another tag (e.g. the pack before Road News), paired by world
if len(sys.argv) > 3:
    other = sys.argv[3]
    orows = load(other)
    print(f"\n{tag} - {other}, same policy, 95% bootstrap over worlds:")
    for p in pols:
        O = [r for r in orows if r["pol"] == p]
        if not O: continue
        by[p + "@" + other] = O
        dd = boot(p, p + "@" + other, "deaths"); dw = boot(p, p + "@" + other, "wealth")
        print(f"  {p:16s}: deaths {dd[0]:+.2f} [{dd[1]:+.2f},{dd[2]:+.2f}]  wealth {dw[0]:+.1f} [{dw[1]:+.1f},{dw[2]:+.1f}]")
