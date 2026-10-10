# MG-046.1 step 0 (#318): judges each candidate trust rule against the baseline by the pre-registered criteria C1-C6
# (docs/v2/trust-leverage-step0-design.md section 4). Usage: python3 trust-judge.py <dir> <base-tag> <rule-tag>...
# reads <dir>/<tag>_*.json (rows of road-news-careers.mjs). Standard library only.
import json, glob, sys, random

DIR, BASE, RULES = sys.argv[1], sys.argv[2], sys.argv[3:]
RESTS = (4, 6)

def load(tag):
    rows = []
    for f in sorted(glob.glob(f"{DIR}/{tag}_*.json")):
        rows += json.load(open(f))
    return rows

def by_seed(rows, pol, key):
    out = {}
    for r in rows:
        if r["pol"] == pol:
            out.setdefault(r["seed"], []).append(r[key])
    return out

def mean(a):
    return sum(a) / len(a)

def boot(fn, seeds, n=2000):
    rnd = random.Random(7)
    pt = fn(seeds)
    ds = sorted(fn([rnd.choice(seeds) for _ in seeds]) for _ in range(n))
    return pt, ds[int(0.025 * n)], ds[int(0.975 * n)]

def diff(A, B):  # paired over worlds: mean of A minus mean of B on the same resampled worlds
    return lambda ss: mean([x for s in ss for x in A[s]]) - mean([x for s in ss for x in B[s]])

def fmt(t):
    return f"{t[0]:+.2f} [{t[1]:+.2f},{t[2]:+.2f}]"

base = load(BASE)
seeds = sorted({r["seed"] for r in base})
summary = []
for tag in RULES:
    rows = load(tag)
    verdict = {"C1": True, "C2": False, "C3": True, "C4": True, "C5": True, "C6": True}
    lines = []
    c2_wealth = []
    for r in RESTS:
        bD, bN, iA, iW = (f"{p}_r{r}" for p in ("blindD", "blindN", "infoAvoid", "infoWhole"))
        # C1: what trust closes, for the blind danger-taker
        R = [x for x in rows if x["pol"] == bD]
        elig = sum(x["eligible"] for x in R)
        shut = sum(x["gateBlocked"] + x["dangerUnknown"] for x in R)
        c1 = shut / elig if elig else 0.0
        verdict["C1"] &= c1 >= 0.05
        # C2: difference in differences of (infoAvoid - blindD), rule minus baseline
        dd = {}
        for key in ("wealth", "deaths"):
            Ai, Ab = by_seed(rows, iA, key), by_seed(rows, bD, key)
            Bi, Bb = by_seed(base, iA, key), by_seed(base, bD, key)
            dd[key] = boot(lambda ss: diff(Ai, Ab)(ss) - diff(Bi, Bb)(ss), seeds)
        c2 = dd["wealth"][1] > 0 or dd["deaths"][2] < 0
        verdict["C2"] |= c2
        c2_wealth.append(dd["wealth"][0])
        # C3: never taking the danger job is unchanged, exactly
        c3 = all(by_seed(rows, bN, k) == by_seed(base, bN, k) for k in ("deaths", "wealth"))
        verdict["C3"] &= c3
        # C4: careful play is not made deadlier; C6: blind play not made harsh; C5: no reward inflation
        dth = {p: boot(diff(by_seed(rows, p, "deaths"), by_seed(base, p, "deaths")), seeds) for p in (bN, iA, bD)}
        wl = {p: boot(diff(by_seed(rows, p, "wealth"), by_seed(base, p, "wealth")), seeds) for p in (bD, bN, iA, iW)}
        c4 = dth[bN][0] <= 0.02 and dth[iA][0] <= 0.02
        c6 = dth[bD][0] <= 0.10
        c5 = all(w[1] <= 5 for w in wl.values())
        verdict["C4"] &= c4; verdict["C5"] &= c5; verdict["C6"] &= c6
        lost = mean([x["trustLost"] for x in R])
        lines.append(f"  r{r}: C1 shut {100*c1:5.1f}% ({shut}/{elig}) | C2 DiD wealth {fmt(dd['wealth'])} deaths {fmt(dd['deaths'])} | "
                     f"C3 {'same' if c3 else 'CHANGED'} | deaths blindN {fmt(dth[bN])} infoAvoid {fmt(dth[iA])} blindD {fmt(dth[bD])} | "
                     f"wealth blindD {fmt(wl[bD])} infoAvoid {fmt(wl[iA])} infoWhole {fmt(wl[iW])} | trust lost/career {lost:.1f}")
    ok = all(verdict[c] for c in ("C1", "C3", "C4", "C5", "C6"))
    summary.append((tag, ok and verdict["C2"], mean(c2_wealth), verdict))
    print(f"== {tag}: " + " ".join(f"{c}={'pass' if v else 'FAIL'}" for c, v in verdict.items()))
    print("\n".join(lines))

print("\nall criteria (C1-C6) passed, by C2 wealth effect:")
for tag, ok, eff, _ in sorted(summary, key=lambda t: -t[2]):
    if ok:
        print(f"  {tag}: mean DiD wealth {eff:+.1f}")
if not any(ok for _, ok, _, _ in summary):
    print("  none")
