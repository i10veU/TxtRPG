#!/usr/bin/env python3
"""M8 balance step 1 (docs/v2/m8-balance-preregistration.md): the fixed targets T1-T6 on story-careers rows.
Usage: m8-judge.py <rows.json ...>   (T7, the escort/trade parity, is campaign.sh's)"""
import json, sys
rows = [r for f in sys.argv[1:] for r in json.load(open(f))]
def share(pol, pred):
    g = [r for r in rows if r["pol"] == pol]
    return (sum(1 for r in g if pred(r)) / len(g)) if g else float("nan"), len(g)
import os
P1, P2 = os.environ.get("T1_POLICY", "prepare"), os.environ.get("T2_POLICY", "lord")  # step 1b: prepare2, lord2
held, n1 = share(P1, lambda r: r["fate"] == 2)
lord, n2 = share(P2, lambda r: r["fate"] == 3)
fell, n3 = share("idle", lambda r: r["fate"] == 4)
name, n4 = share("fight", lambda r: r["fate"] == 1)
renown, n5 = share("hero", lambda r: r["dayRenown"] is not None)
stalled = sum(1 for r in rows if r.get("stalled"))
stuck = sum(1 for r in rows if r.get("stuckSouthDays", 0) > 0)
checks = [
    (f"T1 {P1} held >= 30%", held >= 0.30, f"{held:.1%} (n={n1})"),
    (f"T2 {P2} banner >= 30%", lord >= 0.30, f"{lord:.1%} (n={n2})"),
    ("T3 idle fell >= 90%", fell >= 0.90, f"{fell:.1%} (n={n3})"),
    ("T4 fight name 50%-90%", 0.50 <= name <= 0.90, f"{name:.1%} (n={n4})"),
    ("T5 hero renown >= 80%", renown >= 0.80, f"{renown:.1%} (n={n5})"),
    ("T6 no stall, none stuck south", stalled == 0 and stuck == 0, f"stalled {stalled}, stuck {stuck}"),
]
for label, ok, value in checks: print(f"{'PASS' if ok else 'FAIL'}  {label}: {value}")
print(f"prepare held distance from 50%: {abs(held - 0.5):.3f}")
print("ALL PASS" if all(ok for _, ok, _ in checks) else "NOT ALL PASS")
