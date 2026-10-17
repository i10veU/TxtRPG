#!/usr/bin/env python3
"""Story careers (story-careers.mjs) summarised per policy and leader fate: stage days, deaths, endings, the realm's name,
late breadth. Not a test. Usage: story-judge.py <rows.json ...>"""
import json, statistics, sys
from collections import defaultdict

rows = [r for f in sys.argv[1:] for r in json.load(open(f))]
FATE = {0: "none", 1: "name", 2: "held", 3: "lord", 4: "fell"}
def q(v):
    v = sorted(x for x in v if x is not None)
    if not v: return "-"
    return f"{statistics.median(v):.1f} [{v[len(v)//10]:.1f}-{v[(len(v)*9)//10]:.1f}] n={len(v)}"
groups = defaultdict(list)
for r in rows: groups[(r["pol"], "dead" if r["dead"] else "lives")].append(r)
print("policy  chief  n  | lead day | gather | cross | defender day | renown day | deaths/career | died after gather | endings | late kinds (median) | hunts | stuck south | stalled | clicks to fate (median)")
for (pol, chief), g in sorted(groups.items()):
    n = len(g)
    ends = defaultdict(int)
    for r in g: ends[FATE[r["fate"]]] += 1
    print(f"{pol:7} {chief:5} {n:3} | {q([r['dayLead'] for r in g])} | {q([r['dayGather'] for r in g])} | {q([r['dayCross'] for r in g])} | "
          f"{q([r['dayDefender'] for r in g])} | {q([r['dayRenown'] for r in g])} | {sum(r['deaths'] for r in g)/n:.2f} | "
          f"{sum(1 for r in g if r['deathsAfterGather'] > 0)/n:.0%} | {dict(sorted(ends.items()))} | {statistics.median(r['lateKinds'] for r in g)} | "
          f"{statistics.median(r['hunts'] for r in g)} | {sum(1 for r in g if r.get('stuckSouthDays', 0) > 0)/n:.0%} | {sum(1 for r in g if r.get('stalled'))} | "
          f"{q([r.get('clicksToFate') for r in g])}")
