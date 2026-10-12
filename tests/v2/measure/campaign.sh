#!/usr/bin/env bash
# The standing measurement campaigns in one command each (docs/v2/DEVELOPMENT_ACCELERATION.md §3). Not a test; not in CI.
# Every campaign writes its rows and its verdict files into <out> and prints the verdicts. The runs split across
# processes (MEASURE_JOBS at a time, default 4). Nothing here changes a judge, a sample or a threshold: the sample,
# the policies and the judges are the ones the design documents fixed before measuring.
#
#   campaign.sh escort-parity <base-commit> <out>
#       Escort careers (10 worlds x 8 dice x 10 policies, 120 days) on this checkout and on <base-commit>'s pack;
#       reports how many rows are identical. A change outside the escort road must keep it at 800/800.
#   campaign.sh trade <out> [policies]
#       The pre-registered trade sample (appendix C.5): inj-9, 72 starts an hour apart, and the hold-out hold-3, 72 starts
#       61 minutes apart, 60 days; then trade-judge.py (B3 and the C.4 criteria) and trade-diag.py (appendix G).
#       policies default: blind,ferryInfo,noteHonest (CANDIDATE= in the environment patches the pack copy as usual).
#   campaign.sh trade-parity <base-commit> <out>
#       blind, ferryInfo, noteHonest on inj-9's 72 starts, this checkout against <base-commit>; identical rows.
set -u
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
cd "$root" || exit 2
jobs=${MEASURE_JOBS:-4}
M=tests/v2/measure

pack_of() { # <commit> <dir>: that commit's web/v2 under <dir>, for PACK_ROOT
  mkdir -p "$2" && git archive "$1" web/v2 | tar -x -C "$2"
}
throttle() { while [ "$(jobs -rp | wc -l)" -ge "$jobs" ]; do wait -n; done; }

escort_parity() {
  local base=$1 out=$2 pols=blindD_r4,blindN_r4,infoAvoid_r4,infoWhole_r4,eyesAvoid_r4,blindD_r6,blindN_r6,infoAvoid_r6,infoWhole_r6,eyesAvoid_r6
  mkdir -p "$out" && pack_of "$base" "$out/base"
  for c in 0 2 4 6 8; do
    throttle; node $M/road-news-careers.mjs $c $((c + 2)) 8 120 $pols > "$out/esc_new_$c.json" &
    throttle; PACK_ROOT="$out/base" node $M/road-news-careers.mjs $c $((c + 2)) 8 120 $pols > "$out/esc_old_$c.json" &
  done
  wait
  python3 - "$out" "$base" <<'PY' | tee "$out/escort-parity.txt"
import json, sys, glob
o, base = sys.argv[1], sys.argv[2]
a = [r for f in sorted(glob.glob(f"{o}/esc_new_*.json")) for r in json.load(open(f))]
b = [r for f in sorted(glob.glob(f"{o}/esc_old_*.json")) for r in json.load(open(f))]
same = sum(x == y for x, y in zip(a, b))
print(f"escort parity against {base}: {same} / {len(a)} identical (base rows {len(b)})")
w = [r["wealth"] for r in a if r["pol"] == "infoAvoid_r6"]
print(f"infoAvoid_r6 120-day wealth mean {sum(w) / len(w):.1f} (daily {sum(w) / len(w) / 120:.2f})")
sys.exit(0 if same == len(a) == len(b) else 1)
PY
}

trade() {
  local out=$1 pols=${2:-blind,ferryInfo,noteHonest} p
  mkdir -p "$out"
  for p in ${pols//,/ }; do
    throttle; node $M/trade-careers.mjs 0 1 60 "$p" 72 > "$out/new_$p.json" &
    throttle; SEEDS_FILE=seeds-holdout.json START_STEP=61 node $M/trade-careers.mjs 0 1 60 "$p" 72 > "$out/hold-new_$p.json" &
  done
  wait
  # trade-diag.py reads p_* (policies); the same rows under that name
  for p in ${pols//,/ }; do ln -sf "new_$p.json" "$out/p_$p.json"; ln -sf "hold-new_$p.json" "$out/hold-p_$p.json"; done
  python3 $M/trade-judge.py "$out" > "$out/judge.txt"; python3 $M/trade-judge.py "$out" hold- > "$out/judge-hold.txt"
  python3 $M/trade-diag.py "$out" > "$out/diag.txt"; python3 $M/trade-diag.py "$out" hold- > "$out/diag-hold.txt"
  echo "== inj-9"; grep -E "^(C2|A2|B3)" "$out/judge.txt"
  echo "== hold-3"; grep -E "^(C2|A2|B3)" "$out/judge-hold.txt"
}

trade_parity() {
  local base=$1 out=$2 p
  mkdir -p "$out" && pack_of "$base" "$out/base"
  for p in blind ferryInfo noteHonest; do
    throttle; node $M/trade-careers.mjs 0 1 60 "$p" 72 > "$out/t_new_$p.json" &
    throttle; PACK_ROOT="$out/base" node $M/trade-careers.mjs 0 1 60 "$p" 72 > "$out/t_old_$p.json" &
  done
  wait
  python3 - "$out" "$base" <<'PY' | tee "$out/trade-parity.txt"
import json, sys, glob
o, base = sys.argv[1], sys.argv[2]
strip = lambda r: {k: v for k, v in r.items() if k != "diag"}  # diagnostics columns may differ between harness versions
a = [strip(r) for f in sorted(glob.glob(f"{o}/t_new_*.json")) for r in json.load(open(f))]
b = [strip(r) for f in sorted(glob.glob(f"{o}/t_old_*.json")) for r in json.load(open(f))]
same = sum(x == y for x, y in zip(a, b))
print(f"trade parity against {base}: {same} / {len(a)} identical (base rows {len(b)})")
sys.exit(0 if same == len(a) == len(b) else 1)
PY
}

case "${1:-}" in
  escort-parity) [ $# -eq 3 ] || { echo "usage: $0 escort-parity <base-commit> <out>"; exit 2; }; escort_parity "$2" "$3" ;;
  trade) [ $# -ge 2 ] || { echo "usage: $0 trade <out> [policies]"; exit 2; }; trade "$2" "${3:-}" ;;
  trade-parity) [ $# -eq 3 ] || { echo "usage: $0 trade-parity <base-commit> <out>"; exit 2; }; trade_parity "$2" "$3" ;;
  *) sed -n 2,16p "$0"; exit 2 ;;
esac
